/**
 * Energy Advisor - Lógica do Front-End (Vue.js 3 + Chart.js + Supabase)
 * Aluno: Rodrigo Alcântara
 * Disciplina: Projeto Integrador em Tecnologia da Informação II
 *
 * Módulo 3:
 * - Integração com banco de dados PostgreSQL via Supabase
 * - Manipulação de dados: inserção e consulta
 * - Fallback em localStorage caso as credenciais do Supabase ainda não estejam configuradas
 */

const { createApp, ref, computed, nextTick, onMounted } = Vue;

/* ==========================================================================
   CONFIGURAÇÃO DO SUPABASE
   ========================================================================== 
   1. Crie um projeto em https://supabase.com
   2. Vá em Project Settings > API
   3. Copie Project URL e anon public key
   4. Cole nos campos abaixo
*/
const SUPABASE_URL = "COLE_AQUI_SUA_URL_DO_SUPABASE";
const SUPABASE_KEY = "COLE_AQUI_SUA_ANON_KEY_DO_SUPABASE";

const supabaseConfigurado =
    SUPABASE_URL !== "COLE_AQUI_SUA_URL_DO_SUPABASE" &&
    SUPABASE_KEY !== "COLE_AQUI_SUA_ANON_KEY_DO_SUPABASE" &&
    window.supabase;

const supabaseClient = supabaseConfigurado
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

createApp({
    setup() {
        // --- ESTADOS DA INTERFACE (UI) ---
        const mobileMenuOpen = ref(false);
        const analiseExecutada = ref(false);
        const usuarioLogado = ref(localStorage.getItem("logado") === "true");
        const bancoConectado = ref(!!supabaseClient);
        const historico = ref([]);

        // --- FORMULÁRIO TÉCNICO ---
        const form = ref({
            empresa: '',
            consumo: null,
            valorFatura: null,
            demandaContratada: null,
            demandaMedida: null,
            multaReativo: false
        });

        // --- ARMAZENAMENTO DE RECOMENDAÇÕES ---
        const recomendacoes = ref([]);
        let chartInstance = null;

        const statusBanco = computed(() => {
            return bancoConectado.value
                ? "Banco conectado"
                : "Modo local";
        });

        const toggleMobileMenu = () => {
            mobileMenuOpen.value = !mobileMenuOpen.value;
        };

        const closeMenu = () => {
            mobileMenuOpen.value = false;
        };

        const logout = () => {
            localStorage.removeItem("logado");
            usuarioLogado.value = false;
            closeMenu();
            window.location.href = "index.html";
        };

        // --- CÁLCULO DE ENGENHARIA: FATOR DE CARGA ---
        const calcularFatorCarga = computed(() => {
            if (!form.value.consumo || !form.value.demandaMedida) return 0;
            const fc = (form.value.consumo / (form.value.demandaMedida * 730)) * 100;
            return Math.min(Math.round(fc), 100);
        });

        // --- PROCESSAMENTO DAS REGRAS DE NEGÓCIO (MVP) ---
        const executarAnalise = async () => {
            recomendacoes.value = [];

            if (form.value.demandaContratada > (form.value.demandaMedida * 1.2)) {
                recomendacoes.value.push({
                    tipo: 'alerta',
                    icon: 'fa-scale-down',
                    titulo: 'Demanda Contratada Excessiva',
                    descricao: 'A demanda contratada atual está subutilizada em relação à medida. Ajustar este contrato reduzirá o custo fixo mensal da fatura imediatamente.'
                });
            }

            if (form.value.demandaMedida > form.value.demandaContratada) {
                recomendacoes.value.push({
                    tipo: 'perigo',
                    icon: 'fa-triangle-exclamation',
                    titulo: 'Risco Crítico: Ultrapassagem de Demanda',
                    descricao: 'Sua planta ultrapassou o limite contratado. Isso gera multas pesadas com tarifas cobradas em dobro pela distribuidora local.'
                });
            }

            if (form.value.multaReativo) {
                recomendacoes.value.push({
                    tipo: 'perigo',
                    icon: 'fa-bolt',
                    titulo: 'Penalidade por Excesso Reativo',
                    descricao: 'Sua empresa está sendo penalizada por baixo fator de potência. Recomenda-se a implementação de um banco de capacitores automatizado.'
                });
            }

            if (form.value.consumo > 1000) {
                recomendacoes.value.push({
                    tipo: 'sucesso',
                    icon: 'fa-solar-panel',
                    titulo: 'Alto Potencial para Energia Solar',
                    descricao: 'Seu volume de consumo viabiliza a implantação de geração fotovoltaica própria, acelerando o retorno do investimento (payback).'
                });
            }

            if (form.value.valorFatura > 5000) {
                recomendacoes.value.push({
                    tipo: 'sucesso',
                    icon: 'fa-handshake',
                    titulo: 'Elegível ao Mercado Livre (ACL)',
                    descricao: 'O custo financeiro atual justifica a migração para o ambiente livre, permitindo negociar energia diretamente e reduzir custos.'
                });
            }

            if (form.value.consumo > 3000 && form.value.valorFatura > 10000) {
                recomendacoes.value.push({
                    tipo: 'alerta',
                    icon: 'fa-battery-full',
                    titulo: 'Oportunidade para Sistema BESS',
                    descricao: 'Recomendamos avaliar armazenamento em baterias para realizar Peak Shaving e melhorar a resiliência energética.'
                });
            }

            if (recomendacoes.value.length === 0) {
                recomendacoes.value.push({
                    tipo: 'sucesso',
                    icon: 'fa-square-check',
                    titulo: 'Indicadores Técnicos Estáveis',
                    descricao: 'Não detectamos inconformidades explícitas nesta fatura. Mantenha o monitoramento do histórico mês a mês.'
                });
            }

            analiseExecutada.value = true;

            await salvarAnalise();

            nextTick(() => {
                renderizarGraficoDashboard();
            });
        };

        // --- BANCO DE DADOS: INSERÇÃO DA FATURA E DIAGNÓSTICO ---
        const salvarAnalise = async () => {
            const registroFatura = {
                empresa_nome: form.value.empresa,
                consumo_kwh: form.value.consumo,
                valor_fatura: form.value.valorFatura,
                demanda_contratada: form.value.demandaContratada,
                demanda_medida: form.value.demandaMedida,
                multa_reativo: form.value.multaReativo
            };

            const diagnostico = {
                economia_estimada: calcularEconomiaEstimada(),
                viavel_solar: form.value.consumo > 1000,
                viavel_acl: form.value.valorFatura > 5000,
                viavel_bess: form.value.consumo > 3000 && form.value.valorFatura > 10000
            };

            if (supabaseClient) {
                const { data: faturaData, error: faturaError } = await supabaseClient
                    .from("faturas")
                    .insert([registroFatura])
                    .select()
                    .single();

                if (faturaError) {
                    console.error("Erro ao salvar fatura no Supabase:", faturaError);
                    alert("A análise foi gerada, mas houve erro ao salvar no banco. Verifique as tabelas e permissões no Supabase.");
                    salvarLocalmente(registroFatura, diagnostico);
                    return;
                }

                const { error: diagnosticoError } = await supabaseClient
                    .from("diagnosticos")
                    .insert([{
                        id_fatura: faturaData.id_fatura,
                        ...diagnostico
                    }]);

                if (diagnosticoError) {
                    console.error("Erro ao salvar diagnóstico:", diagnosticoError);
                }

                await carregarHistorico();
                alert("Análise salva no banco de dados!");
            } else {
                salvarLocalmente(registroFatura, diagnostico);
                await carregarHistorico();
                alert("Análise salva em modo local. Para usar PostgreSQL, configure as credenciais do Supabase no script.js.");
            }
        };

        // --- BANCO DE DADOS: CONSULTA DO HISTÓRICO ---
        const carregarHistorico = async () => {
            if (supabaseClient) {
                const { data, error } = await supabaseClient
                    .from("faturas")
                    .select("*")
                    .order("criado_em", { ascending: false })
                    .limit(5);

                if (error) {
                    console.error("Erro ao consultar histórico:", error);
                    historico.value = lerHistoricoLocal();
                    return;
                }

                historico.value = data || [];
            } else {
                historico.value = lerHistoricoLocal();
            }
        };

        // --- FALLBACK LOCAL PARA TESTES SEM SUPABASE ---
        const salvarLocalmente = (fatura, diagnostico) => {
            const registros = lerHistoricoLocal();

            registros.unshift({
                ...fatura,
                ...diagnostico,
                id_fatura: Date.now(),
                criado_em: new Date().toISOString()
            });

            localStorage.setItem("historico_faturas", JSON.stringify(registros.slice(0, 5)));
        };

        const lerHistoricoLocal = () => {
            try {
                return JSON.parse(localStorage.getItem("historico_faturas")) || [];
            } catch (e) {
                return [];
            }
        };

        const calcularEconomiaEstimada = () => {
            let percentual = 0;

            if (form.value.demandaContratada > (form.value.demandaMedida * 1.2)) percentual += 5;
            if (form.value.multaReativo) percentual += 4;
            if (form.value.valorFatura > 5000) percentual += 8;
            if (form.value.consumo > 1000) percentual += 6;

            return Number((form.value.valorFatura * (percentual / 100)).toFixed(2));
        };

        // --- GRÁFICO CHART.JS ---
        const renderizarGraficoDashboard = () => {
            const canvas = document.getElementById('chartAnalise');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            if (chartInstance) {
                chartInstance.destroy();
            }

            const corDemandaMedida =
                form.value.demandaMedida > form.value.demandaContratada
                    ? '#DC3545'
                    : '#198754';

            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Contratada (kW)', 'Medida Real (kW)'],
                    datasets: [{
                        label: 'Demanda da Planta',
                        data: [form.value.demandaContratada, form.value.demandaMedida],
                        backgroundColor: ['#0F3B66', corDemandaMedida],
                        borderRadius: 6,
                        barPercentage: 0.6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#F1F5F9' },
                            ticks: { font: { family: 'Roboto' } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: 'Montserrat', weight: '500' } }
                        }
                    }
                }
            });
        };

        const imprimirResultado = () => {
            window.print();
        };

        const enviarContato = () => {
            alert('Dados validados. Em uma versão futura, este formulário será integrado à API de atendimento.');
        };

        const formatarData = (dataIso) => {
            if (!dataIso) return "-";
            return new Date(dataIso).toLocaleDateString("pt-BR");
        };

        onMounted(() => {
            carregarHistorico();
        });

        return {
            mobileMenuOpen,
            analiseExecutada,
            usuarioLogado,
            bancoConectado,
            statusBanco,
            form,
            recomendacoes,
            historico,
            toggleMobileMenu,
            closeMenu,
            logout,
            calcularFatorCarga,
            executarAnalise,
            salvarAnalise,
            carregarHistorico,
            imprimirResultado,
            enviarContato,
            formatarData
        };
    }
}).mount('#app');
