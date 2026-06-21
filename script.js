/**
 * Energy Advisor - Lógica do Front-End (Vue.js 3 + Chart.js)
 * Aluno: Rodrigo Alcântara
 * Disciplina: Projeto Integrador em Tecnologia da Informação II
 */

const { createApp, ref, computed, nextTick } = Vue;
const usuarioLogado =localStorage.getItem("logado");
const logout = () => {localStorage.removeItem("logado");
  location.reload(); }

createApp({
    setup() {
        // --- ESTADOS DA INTERFACE (UI) ---
        const mobileMenuOpen = ref(false);
        const analiseExecutada = ref(false);
        
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

        const toggleMobileMenu = () => {
            mobileMenuOpen.value = !mobileMenuOpen.value;
        };

        const closeMenu = () => {
            mobileMenuOpen.value = false;
        };

        // --- CÁLCULO DE ENGENHARIA: FATOR DE CARGA ---
        const calcularFatorCarga = computed(() => {
            if (!form.value.consumo || !form.value.demandaMedida) return 0;
            // Cálculo padrão regulado: Consumo / (Demanda Medida * 730 horas comerciais)
            const fc = (form.value.consumo / (form.value.demandaMedida * 730)) * 100;
            return Math.min(Math.round(fc), 100);
        });

        // --- PROCESSAMENTO DAS REGRAS DE NEGÓCIO (MVP) ---
        const executarAnalise = () => {
            recomendacoes.value = [];
            
            // Regra 1: Ajuste de Demanda Contratada (Sobredimensionamento)
            if (form.value.demandaContratada > (form.value.demandaMedida * 1.2)) {
                recomendacoes.value.push({
                    tipo: 'alerta',
                    icon: 'fa-scale-down',
                    titulo: 'Demanda Contratada Excessiva',
                    descricao: 'A demanda contratada atual está subutilizada em relação à medida. Ajustar este contrato reduzirá o custo fixo mensal da fatura imediatamente.'
                });
            }

            // Regra 2: Ultrapassagem de Demanda (Subdimensionamento)
            if (form.value.demandaMedida > form.value.demandaContratada) {
                recomendacoes.value.push({
                    tipo: 'perigo',
                    icon: 'fa-triangle-exclamation',
                    titulo: 'Risco Crítico: Ultrapassagem de Demanda',
                    descricao: 'Sua planta ultrapassou o limite contratado. Isso gera multas pesadas com tarifas cobradas em dobro pela distribuidora local.'
                });
            }

            // Regra 3: Correção do Fator de Potência (Multas de Energia Reativa)
            if (form.value.multaReativo) {
                recomendacoes.value.push({
                    tipo: 'perigo',
                    icon: 'fa-bolt',
                    titulo: 'Penalidade por Excesso Reativo',
                    descricao: 'Sua empresa está sendo penalizada por baixo fator de potência. Recomenda-se a implementação de um banco de capacitores automatizado.'
                });
            }

            // Regra 4: Viabilidade de Energia Solar Fotovoltaica
            if (form.value.consumo > 1000) {
                recomendacoes.value.push({
                    tipo: 'sucesso',
                    icon: 'fa-solar-panel',
                    titulo: 'Alto Potencial para Energia Solar',
                    descricao: 'Seu volume de consumo viabiliza a implantação de geração fotovoltaica própria, acelerando o retorno do investimento (payback).'
                });
            }

            // Regra 5: Viabilidade de Migração para o Mercado Livre de Energia
            if (form.value.valorFatura > 5000) {
                recomendacoes.value.push({
                    tipo: 'sucesso',
                    icon: 'fa-handshake',
                    titulo: 'Elegível ao Mercado Livre (ACL)',
                    descricao: 'O custo financeiro atual justifica a migração para o ambiente livre, permitindo negociar energia diretamente e reduzir custos em até 35%.'
                });
            }

            // Regra 6: Viabilidade de Sistemas de Armazenamento por Baterias (BESS)
            if (form.value.consumo > 3000 && form.value.valorFatura > 10000) {
                recomendacoes.value.push({
                    tipo: 'alerta',
                    icon: 'fa-battery-full',
                    titulo: 'Oportunidade para Sistema BESS',
                    descricao: 'Recomendamos avaliar armazenamento em baterias para realizar Peak Shaving (deslocamento de carga do horário de ponta caro).'
                });
            }

            // Regra 7: Sem anomalias severas
            if (recomendacoes.value.length === 0) {
                recomendacoes.value.push({
                    tipo: 'sucesso',
                    icon: 'fa-square-check',
                    titulo: 'Indicadores Técnicos Estáveis',
                    descricao: 'Não detectamos inconformidades explícitas nesta fatura. Mantenha o monitoramento do histórico mês a mês.'
                });
            }

            analiseExecutada.value = true;

            // Renderização controlada do Chart.js após atualização reativa do DOM
            nextTick(() => {
                renderizarGraficoDashboard();
            });
        };

        // --- INJEÇÃO GRÁFICA DO CHART.JS ---
        const renderizarGraficoDashboard = () => {
            const ctx = document.getElementById('chartAnalise').getContext('2d');
            
            if (chartInstance) {
                chartInstance.destroy();
            }

            // Determina cor de alerta caso haja ultrapassagem de demanda
            const corDemandaMedida = form.value.demandaMedida > form.value.demandaContratada ? '#DC3545' : '#198754';

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
            alert('Excelente! Os dados do formulário de contato corporativo foram validados e estão prontos para a integração com a API final.');
        };

        return {
            mobileMenuOpen,
            analiseExecutada,
            form,
            recomendacoes,
            toggleMobileMenu,
            closeMenu,
            calcularFatorCarga,
            executarAnalise,
            imprimirResultado,
            enviarContato
            usuarioLogado,
            logout
        };
    }
}).mount('#app');