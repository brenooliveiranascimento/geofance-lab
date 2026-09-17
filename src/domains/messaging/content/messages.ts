import type { MessageDefinition } from '../types';

export const ONBOARDING_MESSAGES: MessageDefinition[] = [
  {
    id: 'onb-01',
    title: 'Bem-vindo ao Geofence Lab',
    body: 'Cadastre um local e desenhe os cômodos para começar a monitorar entradas e saídas.',
  },
  {
    id: 'onb-02',
    title: 'Permissão de localização',
    body: 'Para funcionar com o app fechado, o monitoramento precisa do acesso "o tempo todo".',
  },
  {
    id: 'onb-03',
    title: 'Raio e raio ativo',
    body: 'A entrada é detectada no raio; a saída, só depois do raio ativo. A folga entre os dois evita eventos repetidos.',
  },
  {
    id: 'onb-04',
    title: 'Cômodos',
    body: 'Dentro de um local, polígonos delimitam cada cômodo e geram eventos próprios.',
  },
  {
    id: 'onb-05',
    title: 'Simulador',
    body: 'Use o simulador para percorrer uma rota falsa e ver os eventos sem sair do lugar.',
  },
];

export const DAILY_MESSAGES: MessageDefinition[] = [
  { id: 'd-1-1', title: 'Geofencing começa no sistema', body: 'O monitoramento de regiões roda no SO, não no app — por isso funciona com o app fechado.' },
  { id: 'd-1-2', title: 'O teto de regiões', body: 'O iOS monitora 20 regiões por app; o Android, 100. Uma janela móvel cobre os 500 locais.' },
  { id: 'd-1-3', title: 'Região sentinela', body: 'Uma das vagas guarda o próprio conjunto: sair dela é o sinal de que a janela ficou velha.' },
  { id: 'd-1-4', title: 'Raio mínimo', body: 'Círculos abaixo de ~100 m não disparam de forma confiável no iOS. Por isso os cômodos usam polígono.' },
  { id: 'd-1-5', title: 'Duas camadas', body: 'A região nativa acorda o app; o GPS contínuo só liga depois, enquanto você está dentro.' },
  { id: 'd-1-6', title: 'Bateria', body: 'Em repouso o app não pede nenhuma posição — quem espera é o rádio do próprio aparelho.' },
  { id: 'd-1-7', title: 'Persistência', body: 'Estado e eventos ficam em SQLite, o único armazenamento confiável dentro de uma task de background.' },

  { id: 'd-2-1', title: 'Acurácia importa', body: 'Uma leitura com 300 m de erro não é informação: ela é descartada antes de virar evento.' },
  { id: 'd-2-2', title: 'Margem de confiança', body: 'A entrada só é declarada quando o círculo de erro inteiro cabe dentro do raio.' },
  { id: 'd-2-3', title: 'Confirmações', body: 'Uma transição precisa de leituras consecutivas concordando — ruído de GPS não vira notificação.' },
  { id: 'd-2-4', title: 'Tempo de permanência', body: 'Um estado recém-assumido é mantido por alguns segundos antes de poder mudar de novo.' },
  { id: 'd-2-5', title: 'Ray casting', body: 'Saber se um ponto está num cômodo é contar quantas arestas um raio cruza: ímpar é dentro.' },
  { id: 'd-2-6', title: 'Bounding box', body: 'Antes de testar as arestas, quatro comparações descartam quem está claramente fora.' },
  { id: 'd-2-7', title: 'Fronteira', body: 'Um ponto exatamente na borda é sempre "dentro" — a regra é explícita, não sorteada.' },

  { id: 'd-3-1', title: 'Sem duplicidade', body: 'Cada transição carrega um número de sequência: repetir a mesma leitura não gera outro evento.' },
  { id: 'd-3-2', title: 'Estado inicial no iOS', body: 'O iOS reporta o estado de todas as regiões a cada início do app. Sem a chave persistida, tudo re-dispararia.' },
  { id: 'd-3-3', title: 'Transação', body: 'O novo estado e o evento são gravados juntos, ou nenhum dos dois.' },
  { id: 'd-3-4', title: 'Offline é o normal', body: 'A fila é o estado: nada se perde porque a requisição falhou.' },
  { id: 'd-3-5', title: 'Backoff', body: 'Cada nova tentativa espera o dobro da anterior, até um teto — e desiste depois de algumas.' },
  { id: 'd-3-6', title: 'Reconciliação', body: 'O agendador compara o plano com o que o SO tem, e corrige a diferença.' },
  { id: 'd-3-7', title: 'Janela deslizante', body: 'Só as próximas notificações são entregues ao SO, bem abaixo do teto de 64 do iOS.' },

  { id: 'd-4-1', title: 'App encerrado no Android', body: 'Um app finalizado não é relançado por evento de geofence — por isso existe o serviço em primeiro plano.' },
  { id: 'd-4-2', title: 'App encerrado no iOS', body: 'O iOS relança o app para entregar um evento de região, com poucos segundos de execução.' },
  { id: 'd-4-3', title: 'Fabricantes', body: 'Gerenciadores de bateria de alguns fabricantes encerram o serviço mesmo assim.' },
  { id: 'd-4-4', title: 'Reinício do aparelho', body: 'Sem um receiver de boot, o monitoramento não volta sozinho depois de reiniciar.' },
  { id: 'd-4-5', title: 'Subtítulo', body: 'O subtítulo da notificação existe só no iOS; no Android ele vira a primeira linha do corpo.' },
  { id: 'd-4-6', title: 'Permissão em duas etapas', body: 'O acesso em background só pode ser pedido depois que o de primeiro plano foi concedido.' },
  { id: 'd-4-7', title: 'Fim da série', body: 'Você percorreu as quatro semanas. O log de eventos continua registrando tudo.' },
];
