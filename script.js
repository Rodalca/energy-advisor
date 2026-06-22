/** Energy Advisor - Login com Supabase + cadastro de empresa + análise */
const { createApp, ref, computed, nextTick, onMounted } = Vue;

const SUPABASE_URL = "https://qbfosnuwrqbjwbolmopj.supabase.co";
const SUPABASE_KEY = "sb_publishable_w76Z2U0x9epJ4XsxkQGQdg_lbAVlmHx";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

createApp({
    setup() {
        const mobileMenuOpen = ref(false);
        const usuarioLogado = ref(localStorage.getItem("logado") === "true");
        const bancoConectado = ref(!!supabaseClient);
        const etapaAtual = ref("empresa");
        const usuarioAtual = ref(JSON.parse(localStorage.getItem("usuarioAtual") || "null"));
        const empresaAtual = ref(JSON.parse(localStorage.getItem("empresaAtual") || "null"));
        const analiseExecutada = ref(false);
        const recomendacoes = ref([]);
        const historico = ref([]);
        let chartInstance = null;

        const usuarioForm = ref({ nome: "", email: "", senha: "" });
        const empresaForm = ref({ razao_social: "", cnpj: "", cidade: "", estado: "", grupo_tarifario: "Grupo A" });
        const faturaForm = ref({ consumo: null, valorFatura: null, demandaContratada: null, demandaMedida: null, multaReativo: false });

        const statusBanco = computed(() => bancoConectado.value ? "Banco conectado" : "Modo local");

        const calcularFatorCarga = computed(() => {
            if (!faturaForm.value.consumo || !faturaForm.value.demandaMedida) return 0;
            const fc = (faturaForm.value.consumo / (faturaForm.value.demandaMedida * 730)) * 100;
            return Math.min(Math.round(fc), 100);
        });

        const toggleMobileMenu = () => mobileMenuOpen.value = !mobileMenuOpen.value;
        const closeMenu = () => mobileMenuOpen.value = false;

        const logout = () => {
            localStorage.removeItem("logado");
            localStorage.removeItem("usuarioAtual");
            localStorage.removeItem("empresaAtual");
            localStorage.removeItem("historico_faturas");
            usuarioLogado.value = false;
            usuarioAtual.value = null;
            empresaAtual.value = null;
            etapaAtual.value = "empresa";
            window.location.href = "index.html";
        };

        const carregarEmpresaDoUsuario = async () => {
            if (!usuarioAtual.value || !supabaseClient) return;
            const { data, error } = await supabaseClient
                .from("empresas")
                .select("*")
                .eq("id_usuario", usuarioAtual.value.id_usuario)
                .order("criado_em", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) {
                console.error("Erro ao carregar empresa:", error);
                return;
            }
            if (data) {
                empresaAtual.value = data;
                localStorage.setItem("empresaAtual", JSON.stringify(data));
            }
        };

        const definirEtapaInicial = async () => {
            if (!usuarioLogado.value || !usuarioAtual.value) {
                etapaAtual.value = "empresa";
                return;
            }
            await carregarEmpresaDoUsuario();
            if (empresaAtual.value) {
                etapaAtual.value = "analise";
                await carregarHistorico();
            } else {
                etapaAtual.value = "empresa";
            }
        };

        const salvarEmpresa = async () => {
            if (!usuarioAtual.value) {
                alert("Faça login antes de cadastrar a empresa.");
                window.location.href = "login.html";
                return;
            }
            if (!empresaForm.value.razao_social) {
                alert("Informe a razão social da empresa.");
                return;
            }
            const payload = {
                id_usuario: usuarioAtual.value.id_usuario,
                razao_social: empresaForm.value.razao_social,
                cnpj: empresaForm.value.cnpj,
                cidade: empresaForm.value.cidade,
                estado: empresaForm.value.estado,
                grupo_tarifario: empresaForm.value.grupo_tarifario
            };
            if (supabaseClient) {
                const { data, error } = await supabaseClient.from("empresas").insert([payload]).select().single();
                if (error) {
                    console.error("Erro ao salvar empresa:", error);
                    alert("Erro ao salvar empresa. Verifique RLS e tabela empresas.");
                    return;
                }
                empresaAtual.value = data;
            } else {
                empresaAtual.value = { id_empresa: Date.now(), ...payload };
            }
            localStorage.setItem("empresaAtual", JSON.stringify(empresaAtual.value));
            etapaAtual.value = "analise";
            await carregarHistorico();
            alert("Empresa cadastrada com sucesso!");
        };

        const executarAnalise = async () => {
            if (!empresaAtual.value) {
                alert("Cadastre uma empresa antes da análise.");
                etapaAtual.value = "empresa";
                return;
            }
            recomendacoes.value = [];
            if (faturaForm.value.demandaContratada > faturaForm.value.demandaMedida * 1.2) {
                recomendacoes.value.push({ tipo: "alerta", icon: "fa-scale-down", titulo: "Demanda Contratada Excessiva", descricao: "A demanda contratada está subutilizada. Recomenda-se avaliar redução contratual." });
            }
            if (faturaForm.value.demandaMedida > faturaForm.value.demandaContratada) {
                recomendacoes.value.push({ tipo: "perigo", icon: "fa-triangle-exclamation", titulo: "Ultrapassagem de Demanda", descricao: "A demanda medida ultrapassou a contratada, podendo gerar cobrança adicional." });
            }
            if (faturaForm.value.multaReativo) {
                recomendacoes.value.push({ tipo: "perigo", icon: "fa-bolt", titulo: "Penalidade por Excesso Reativo", descricao: "Recomenda-se estudo para correção do fator de potência." });
            }
            if (faturaForm.value.consumo > 1000) {
                recomendacoes.value.push({ tipo: "sucesso", icon: "fa-solar-panel", titulo: "Potencial para Energia Solar", descricao: "O consumo informado justifica estudo de viabilidade fotovoltaica." });
            }
            if (faturaForm.value.valorFatura > 5000) {
                recomendacoes.value.push({ tipo: "sucesso", icon: "fa-handshake", titulo: "Avaliar Mercado Livre", descricao: "O valor da fatura justifica análise de migração para o ACL." });
            }
            if (faturaForm.value.consumo > 3000 && faturaForm.value.valorFatura > 10000) {
                recomendacoes.value.push({ tipo: "alerta", icon: "fa-battery-full", titulo: "Oportunidade para BESS", descricao: "Recomenda-se avaliar baterias para peak shaving e backup." });
            }
            if (recomendacoes.value.length === 0) {
                recomendacoes.value.push({ tipo: "sucesso", icon: "fa-square-check", titulo: "Indicadores Estáveis", descricao: "Não foram detectadas inconformidades relevantes nesta análise preliminar." });
            }
            analiseExecutada.value = true;
            await salvarFaturaEDiagnostico();
            nextTick(() => renderizarGraficoDashboard());
        };

        const calcularEconomiaEstimada = () => {
            let p = 0;
            if (faturaForm.value.demandaContratada > faturaForm.value.demandaMedida * 1.2) p += 5;
            if (faturaForm.value.multaReativo) p += 4;
            if (faturaForm.value.valorFatura > 5000) p += 8;
            if (faturaForm.value.consumo > 1000) p += 6;
            return Number((faturaForm.value.valorFatura * (p / 100)).toFixed(2));
        };

        const salvarFaturaEDiagnostico = async () => {
            const fatura = {
                id_empresa: empresaAtual.value.id_empresa,
                consumo_kwh: faturaForm.value.consumo,
                valor_fatura: faturaForm.value.valorFatura,
                demanda_contratada: faturaForm.value.demandaContratada,
                demanda_medida: faturaForm.value.demandaMedida,
                multa_reativo: faturaForm.value.multaReativo
            };
            const diagnostico = {
                economia_estimada: calcularEconomiaEstimada(),
                viavel_solar: faturaForm.value.consumo > 1000,
                viavel_acl: faturaForm.value.valorFatura > 5000,
                viavel_bess: faturaForm.value.consumo > 3000 && faturaForm.value.valorFatura > 10000
            };
            if (supabaseClient) {
                const { data, error } = await supabaseClient.from("faturas").insert([fatura]).select().single();
                if (error) {
                    console.error("Erro ao salvar fatura:", error);
                    alert("Erro ao salvar fatura. Verifique RLS e tabela faturas.");
                    return;
                }
                const { error: diagError } = await supabaseClient.from("diagnosticos").insert([{ id_fatura: data.id_fatura, ...diagnostico }]);
                if (diagError) console.error("Erro ao salvar diagnóstico:", diagError);
                alert("Fatura e diagnóstico salvos no banco de dados!");
                await carregarHistorico();
            } else {
                salvarHistoricoLocal(fatura);
                alert("Fatura salva em modo local.");
            }
        };

        const carregarHistorico = async () => {
            if (!empresaAtual.value) return;
            if (supabaseClient) {
                const { data, error } = await supabaseClient
                    .from("faturas")
                    .select(`id_fatura,id_empresa,consumo_kwh,valor_fatura,demanda_contratada,demanda_medida,multa_reativo,criado_em,empresas(razao_social)`)
                    .eq("id_empresa", empresaAtual.value.id_empresa)
                    .order("criado_em", { ascending: false })
                    .limit(5);
                if (error) {
                    console.error("Erro ao carregar histórico:", error);
                    historico.value = lerHistoricoLocal();
                    return;
                }
                historico.value = data || [];
            } else {
                historico.value = lerHistoricoLocal();
            }
        };

        const salvarHistoricoLocal = (fatura) => {
            const registros = lerHistoricoLocal();
            registros.unshift({ ...fatura, id_fatura: Date.now(), criado_em: new Date().toISOString(), empresas: { razao_social: empresaAtual.value.razao_social } });
            historico.value = registros.slice(0, 5);
            localStorage.setItem("historico_faturas", JSON.stringify(historico.value));
        };
        const lerHistoricoLocal = () => {
            try { return JSON.parse(localStorage.getItem("historico_faturas")) || []; }
            catch { return []; }
        };

        const renderizarGraficoDashboard = () => {
            const canvas = document.getElementById("chartAnalise");
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (chartInstance) chartInstance.destroy();
            const cor = faturaForm.value.demandaMedida > faturaForm.value.demandaContratada ? "#DC3545" : "#198754";
            chartInstance = new Chart(ctx, {
                type: "bar",
                data: { labels: ["Contratada (kW)", "Medida Real (kW)"], datasets: [{ data: [faturaForm.value.demandaContratada, faturaForm.value.demandaMedida], backgroundColor: ["#0F3B66", cor], borderRadius: 6, barPercentage: 0.6 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
            });
        };

        const imprimirResultado = () => window.print();
        const enviarContato = () => alert("Dados validados. Em uma versão futura, este formulário será integrado à API.");
        const formatarData = (data) => data ? new Date(data).toLocaleDateString("pt-BR") : "-";

        onMounted(() => definirEtapaInicial());

        return {
            mobileMenuOpen, usuarioLogado, bancoConectado, statusBanco, etapaAtual,
            usuarioAtual, empresaAtual, usuarioForm, empresaForm, faturaForm,
            analiseExecutada, recomendacoes, historico, toggleMobileMenu, closeMenu,
            logout, salvarEmpresa, executarAnalise, calcularFatorCarga, carregarHistorico,
            imprimirResultado, enviarContato, formatarData
        };
    }
}).mount("#app");
