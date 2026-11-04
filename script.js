
/** Energy Advisor — Supabase Auth, cadastro de empresa e análise energética. */
const { createApp, ref, computed, nextTick, onMounted } = Vue;

const SUPABASE_URL = "https://qbfosnuwrqbjwbolmopj.supabase.co";
const SUPABASE_KEY = "sb_publishable_w76Z2U0x9epJ4XsxkQGQdg_lbAVlmHx";
const supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

createApp({
    setup() {
        const mobileMenuOpen = ref(false);
        const usuarioLogado = ref(false);
        const bancoConectado = ref(!!supabaseClient);
        const etapaAtual = ref("empresa");
        const usuarioAtual = ref(null);
        const empresaAtual = ref(null);
        const analiseExecutada = ref(false);
        const recomendacoes = ref([]);
        const historico = ref([]);
        let chartInstance = null;
        let inicializacao = 0;

        const usuarioForm = ref({ nome: "", email: "", senha: "" });
        const empresaForm = ref({
            razao_social: "",
            cnpj: "",
            cidade: "",
            estado: "",
            grupo_tarifario: "Grupo A"
        });
        const faturaForm = ref({
            consumo: null,
            valorFatura: null,
            demandaContratada: null,
            demandaMedida: null,
            multaReativo: false
        });

        const statusBanco = computed(() =>
            bancoConectado.value ? "Banco conectado" : "Banco indisponível"
        );

        const calcularFatorCarga = computed(() => {
            if (!faturaForm.value.consumo || !faturaForm.value.demandaMedida) return 0;
            const fc = (faturaForm.value.consumo /
                (faturaForm.value.demandaMedida * 730)) * 100;
            return Math.min(Math.round(fc), 100);
        });

        const toggleMobileMenu = () => mobileMenuOpen.value = !mobileMenuOpen.value;
        const closeMenu = () => mobileMenuOpen.value = false;

        const limparEstado = () => {
            usuarioLogado.value = false;
            usuarioAtual.value = null;
            empresaAtual.value = null;
            historico.value = [];
            recomendacoes.value = [];
            analiseExecutada.value = false;
            etapaAtual.value = "empresa";
            localStorage.removeItem("logado");
            localStorage.removeItem("usuarioAtual");
            localStorage.removeItem("empresaAtual");
            localStorage.removeItem("historico_faturas");
        };

        const logout = async () => {
            if (supabaseClient) {
                const { error } = await supabaseClient.auth.signOut();
                if (error) {
                    console.error("Erro ao encerrar sessão:", error);
                    alert("Não foi possível encerrar a sessão. Tente novamente.");
                    return;
                }
            }
            inicializacao++;
            limparEstado();
            window.location.href = "login.html";
        };

        const carregarEmpresaDoUsuario = async () => {
            empresaAtual.value = null;
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
                throw new Error("Não foi possível consultar a empresa.");
            }
            empresaAtual.value = data || null;
        };

        const carregarHistorico = async () => {
            if (!empresaAtual.value || !usuarioLogado.value || !supabaseClient) {
                historico.value = [];
                return;
            }

            const { data, error } = await supabaseClient
                .from("faturas")
                .select("id_fatura,id_empresa,consumo_kwh,valor_fatura,demanda_contratada,demanda_medida,multa_reativo,criado_em,empresas(razao_social)")
                .eq("id_empresa", empresaAtual.value.id_empresa)
                .order("criado_em", { ascending: false })
                .limit(5);

            if (error) {
                console.error("Erro ao carregar histórico:", error);
                historico.value = [];
                return;
            }
            historico.value = data || [];
        };

        const definirEtapaInicial = async () => {
            const tentativa = ++inicializacao;
            limparEstado();

            if (!supabaseClient) {
                alert("Biblioteca Supabase não carregada. Verifique a conexão.");
                return;
            }

            const { data: { user }, error: authError } =
                await supabaseClient.auth.getUser();

            if (tentativa !== inicializacao) return;

            if (authError || !user) {
                window.location.href = "login.html";
                return;
            }

            const { data: perfil, error: perfilError } = await supabaseClient
                .from("usuarios")
                .select("id_usuario,nome,email,auth_user_id")
                .eq("auth_user_id", user.id)
                .maybeSingle();

            if (tentativa !== inicializacao) return;

            if (perfilError || !perfil) {
                console.error("Perfil não encontrado ou acesso negado:", perfilError);
                alert("Sua conta está autenticada, mas não possui cadastro vinculado na tabela usuarios. Verifique o vínculo no Supabase.");
                return;
            }

            usuarioAtual.value = perfil;
            usuarioLogado.value = true;

            try {
                await carregarEmpresaDoUsuario();
                if (tentativa !== inicializacao) return;

                if (empresaAtual.value) {
                    etapaAtual.value = "analise";
                    await carregarHistorico();
                } else {
                    etapaAtual.value = "empresa";
                }
            } catch (error) {
                console.error(error);
                alert(error.message);
            }
        };

        const salvarEmpresa = async () => {
            if (!supabaseClient || !usuarioLogado.value || !usuarioAtual.value) {
                alert("Faça login antes de cadastrar a empresa.");
                window.location.href = "login.html";
                return;
            }

            if (!empresaForm.value.razao_social?.trim()) {
                alert("Informe a razão social da empresa.");
                return;
            }

            const payload = {
                id_usuario: usuarioAtual.value.id_usuario,
                razao_social: empresaForm.value.razao_social.trim(),
                cnpj: empresaForm.value.cnpj,
                cidade: empresaForm.value.cidade,
                estado: empresaForm.value.estado,
                grupo_tarifario: empresaForm.value.grupo_tarifario
            };

            const { data, error } = await supabaseClient
                .from("empresas")
                .insert([payload])
                .select()
                .single();

            if (error) {
                console.error("Erro ao salvar empresa:", error);
                alert("Não foi possível cadastrar a empresa. Verifique o acesso e os dados informados.");
                return;
            }

            empresaAtual.value = data;
            etapaAtual.value = "analise";
            await carregarHistorico();
            alert("Empresa cadastrada com sucesso!");
        };

        const calcularEconomiaEstimada = () => {
            let p = 0;
            if (faturaForm.value.demandaContratada >
                faturaForm.value.demandaMedida * 1.2) p += 5;
            if (faturaForm.value.multaReativo) p += 4;
            if (faturaForm.value.valorFatura > 5000) p += 8;
            if (faturaForm.value.consumo > 1000) p += 6;

            return Number(
                (faturaForm.value.valorFatura * (p / 100)).toFixed(2)
            );
        };

        const salvarFaturaEDiagnostico = async () => {
            if (!supabaseClient || !usuarioLogado.value || !empresaAtual.value) {
                alert("Faça login e selecione uma empresa antes de salvar a análise.");
                return false;
            }

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
                viavel_bess: faturaForm.value.consumo > 3000 &&
                    faturaForm.value.valorFatura > 10000
            };

            const { data, error } = await supabaseClient
                .from("faturas")
                .insert([fatura])
                .select("id_fatura")
                .single();

            if (error) {
                console.error("Erro ao salvar fatura:", error);
                alert("Erro ao salvar fatura. Verifique as permissões no Supabase.");
                return false;
            }

            const { error: diagError } = await supabaseClient
                .from("diagnosticos")
                .insert([{ id_fatura: data.id_fatura, ...diagnostico }]);

            if (diagError) {
                console.error("Erro ao salvar diagnóstico:", diagError);
                alert("A fatura foi salva, mas houve erro ao salvar o diagnóstico. Verifique o console e o banco de dados.");
                await carregarHistorico();
                return false;
            }

            await carregarHistorico();
            alert("Fatura e diagnóstico salvos no banco de dados!");
            return true;
        };

        const executarAnalise = async () => {
            if (!empresaAtual.value || !usuarioLogado.value) {
                alert("Faça login e cadastre uma empresa antes da análise.");
                etapaAtual.value = "empresa";
                return;
            }

            recomendacoes.value = [];

            if (faturaForm.value.demandaContratada >
                faturaForm.value.demandaMedida * 1.2) {
                recomendacoes.value.push({
                    tipo: "alerta",
                    icon: "fa-scale-down",
                    titulo: "Demanda Contratada Excessiva",
                    descricao: "A demanda contratada está subutilizada. Recomenda-se avaliar redução contratual."
                });
            }

            if (faturaForm.value.demandaMedida >
                faturaForm.value.demandaContratada) {
                recomendacoes.value.push({
                    tipo: "perigo",
                    icon: "fa-triangle-exclamation",
                    titulo: "Ultrapassagem de Demanda",
                    descricao: "A demanda medida ultrapassou a contratada, podendo gerar cobrança adicional."
                });
            }

            if (faturaForm.value.multaReativo) {
                recomendacoes.value.push({
                    tipo: "perigo",
                    icon: "fa-bolt",
                    titulo: "Penalidade por Excesso Reativo",
                    descricao: "Recomenda-se estudo para correção do fator de potência."
                });
            }

            if (faturaForm.value.consumo > 1000) {
                recomendacoes.value.push({
                    tipo: "sucesso",
                    icon: "fa-solar-panel",
                    titulo: "Potencial para Energia Solar",
                    descricao: "O consumo informado justifica estudo de viabilidade fotovoltaica."
                });
            }

            if (faturaForm.value.valorFatura > 5000) {
                recomendacoes.value.push({
                    tipo: "sucesso",
                    icon: "fa-handshake",
                    titulo: "Avaliar Mercado Livre",
                    descricao: "O valor da fatura justifica análise de migração para o ACL."
                });
            }

            if (faturaForm.value.consumo > 3000 &&
                faturaForm.value.valorFatura > 10000) {
                recomendacoes.value.push({
                    tipo: "alerta",
                    icon: "fa-battery-full",
                    titulo: "Oportunidade para BESS",
                    descricao: "Recomenda-se avaliar baterias para peak shaving e backup."
                });
            }

            if (recomendacoes.value.length === 0) {
                recomendacoes.value.push({
                    tipo: "sucesso",
                    icon: "fa-square-check",
                    titulo: "Indicadores Estáveis",
                    descricao: "Não foram detectadas inconformidades relevantes nesta análise preliminar."
                });
            }

            analiseExecutada.value = true;
            await salvarFaturaEDiagnostico();
            nextTick(() => renderizarGraficoDashboard());
        };

        const renderizarGraficoDashboard = () => {
            const canvas = document.getElementById("chartAnalise");
            if (!canvas || typeof Chart === "undefined") return;

            const ctx = canvas.getContext("2d");
            if (chartInstance) chartInstance.destroy();

            const cor = faturaForm.value.demandaMedida >
                faturaForm.value.demandaContratada ? "#DC3545" : "#198754";

            chartInstance = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: ["Contratada (kW)", "Medida Real (kW)"],
                    datasets: [{
                        data: [
                            faturaForm.value.demandaContratada,
                            faturaForm.value.demandaMedida
                        ],
                        backgroundColor: ["#0F3B66", cor],
                        borderRadius: 6,
                        barPercentage: 0.6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true },
                        x: { grid: { display: false } }
                    }
                }
            });
        };

        const imprimirResultado = () => window.print();
        const enviarContato = () =>
            alert("Dados validados. Em uma versão futura, este formulário será integrado à API.");
        const formatarData = (data) =>
            data ? new Date(data).toLocaleDateString("pt-BR") : "-";

        onMounted(() => {
            definirEtapaInicial();

            if (supabaseClient) {
                supabaseClient.auth.onAuthStateChange((event) => {
                    if (event === "SIGNED_OUT") {
                        inicializacao++;
                        limparEstado();
                        window.location.href = "login.html";
                    }
                });
            }
        });

        return {
            mobileMenuOpen, usuarioLogado, bancoConectado,
            statusBanco, etapaAtual, usuarioAtual, empresaAtual,
            usuarioForm, empresaForm, faturaForm,
            analiseExecutada, recomendacoes, historico,
            toggleMobileMenu, closeMenu, logout, salvarEmpresa,
            executarAnalise, calcularFatorCarga, carregarHistorico,
            imprimirResultado, enviarContato, formatarData
        };
    }
}).mount("#app");

