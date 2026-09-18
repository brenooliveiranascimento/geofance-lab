# Geofence Lab

App Expo que faz duas coisas: avisa quando você **entra e sai** de empresas e dos cômodos
dentro delas, mesmo em background, e **entrega uma sequência de mensagens** por notificação
local com confirmação de entrega.

Sem backend, sem conta, sem serviço pago — tudo mora no aparelho.

---

## Como funciona

### Cadastro

Você desenha o perímetro da empresa arrastando o mapa sob um pino fixo e tocando em "Adicionar
ponto". Depois desenha os cômodos por dentro, cada um com um nome. O raio e o raio ativo são
calculados a partir do desenho — você não precisa informar números.

### Detecção

O app trabalha em duas camadas:

1. **Regiões nativas** (`expo-location`) são a campainha. Em repouso o app não pede nenhuma
   posição: quem espera é o rádio do aparelho. O iOS monitora 20 regiões e o Android 100, então
   o app registra só as mais próximas e guarda uma vaga para uma **região sentinela** — sair
   dela significa que a lista ficou velha e é hora de recalcular.

2. **GPS contínuo** liga só quando você entra no raio ativo de uma empresa, para descobrir em
   qual cômodo você está. Desliga ao sair. É essa camada que resolve cômodos, porque o raio
   mínimo de uma região nativa no iOS (~100 m) é maior que uma casa inteira.

Entrar exige `distância ≤ radius`; sair exige `distância > activeRadius`. A folga entre os dois
evita que você fique recebendo notificação parado na porta. Leitura de GPS com erro acima de
100 m é descartada, e uma transição só é confirmada depois de duas leituras concordando.

Cada evento carrega uma chave única (`empresa:3:entrada`) gravada com índice `UNIQUE`, então
nenhum evento é registrado duas vezes — nem quando o sistema operacional reporta o estado de
todas as regiões de novo ao reiniciar o app.

### Mensagens

Depois do cadastro chegam 5 mensagens de boas-vindas em 2, 5, 12, 25 e 45 minutos. Um dia
depois começa a sequência diária: 4 semanas, 7 mensagens por semana, uma por dia às 9h, com
`Semana X; Mensagem Y de Z` no subtítulo da notificação.

O app não encadeia agendamentos: ele deriva o plano inteiro do instante do cadastro e compara
com o que o sistema já tem, agendando o que falta. Funciona offline; cada entrega gera uma
confirmação que fica numa fila e é enviada ao endpoint quando houver rede — com reenvio
progressivo e sem duplicar.

---

## Rodando

Precisa de Node 20+ e, para o mapa no Android, de uma chave da **Maps SDK for Android**.

```bash
cp .env.example .env     # preencha EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
npx expo run:android     # ou run:ios
```

Sem a chave o app funciona normalmente — só a tela do mapa mostra um aviso no lugar.

### Gerando o APK

```bash
npm run apk
# android/app/build/outputs/apk/release/app-release.apk
```

Use `npm run apk` em vez de chamar o `gradlew` direto. A task que empacota o JavaScript se
marca como atualizada em situações em que ele mudou de verdade — mexer no `.env` é uma delas —
e o resultado é um APK que instala e roda com o código antigo dentro, sem aviso nenhum. O script
apaga a saída do bundle antes de montar.

### Verificando

```bash
npm run verify     # typecheck + i18n + 233 testes
npm run lint
```

---

## Configurando

### Chave do Google Maps

No Google Cloud, habilite a **Maps SDK for Android** e gere uma chave. O carregamento de mapa em
aplicativo móvel não é cobrado, mas o projeto precisa de billing habilitado para emitir a chave.
Restrinja a chave por nome de pacote (`com.brenonascimento.geofencelab`) e pela impressão digital
SHA-1 do certificado — variáveis `EXPO_PUBLIC_*` são embutidas no APK e podem ser extraídas.

A chave precisa entrar em dois lugares, e o `npm run apk` cuida dos dois: no manifesto, pelo
prebuild, e no bundle, pela compilação.

### Endpoint de confirmação de entrega

Em **Ajustes → Confirmação de entrega**, cole uma URL e toque em "Testar". Gere uma em
[webhook.site](https://webhook.site) para acompanhar as requisições chegando no navegador.

Cada mensagem entregue gera um POST com o identificador da mensagem, o subtítulo, o instante da
entrega e um cabeçalho `Idempotency-Key`. Campo vazio volta para o valor de
`EXPO_PUBLIC_DELIVERY_ENDPOINT`, e sem endpoint nenhum as confirmações continuam sendo gravadas
na fila.

### Permissões

O app pede localização em duas etapas, porque os dois sistemas exigem assim: primeiro o acesso
comum, depois o "o tempo todo". No Android o segundo abre uma tela de ajustes. Sem o acesso "o
tempo todo" não há monitoramento em background.

---

## Testando sem sair do lugar

**Dataset de demonstração** — Ajustes → Ferramentas carrega 520 locais espalhados por São Paulo,
Rio, Belo Horizonte e Curitiba, ao lado das empresas que você cadastrou. É o que exercita o teto
de regiões da plataforma: com ele carregado o Monitor mostra 100 de 100 regiões no Android.

**Simulador de rota** — Ajustes → Ferramentas percorre uma rota sintética pelo mesmo caminho que
o GPS alimenta. Dá para escolher a empresa, o trajeto e a acurácia simulada: em ±120 m nenhum
evento é emitido, porque a leitura é descartada antes de virar evento.

**Histórico** — duas abas. Eventos mostra entradas e saídas, filtráveis e exportáveis. Sistema
mostra o log interno: a janela de regiões, a troca de camada, as leituras descartadas e as
chaves de idempotência.

---

## Decisões que valem explicar

**Por que pino fixo em vez de tocar no mapa.** Tocar erra por dedo e não dá para corrigir sem
apagar o ponto. Arrastar o mapa sob um pino fixo é o gesto que aplicativos de entrega usam para
a mesma tarefa, e a coordenada fica visível o tempo todo.

**Por que os raios são derivados.** Pedir `radius` e `activeRadius` ao usuário abre espaço para
`activeRadius < radius`, e aí existe uma faixa onde o app quer entrar e sair ao mesmo tempo — o
aparelho ficaria emitindo eventos para sempre. O app calcula os dois a partir do desenho e o
banco recusa gravar a combinação inválida.

**Por que polígono para cômodos.** Círculo nativo não funciona nessa escala. E o polígono traz
problemas próprios: marcar os cantos fora de ordem produz um contorno em laço, que faz a regra
de ponto-em-polígono tratar parte da área como externa. O app detecta o cruzamento, bloqueia e
oferece desembaraçar — sem prometer adivinhar a forma pretendida, porque em um prédio em L o
percurso mais curto não é o L.

**Por que SQLite e não armazenamento leve.** Tudo que as tarefas de background tocam precisa de
transação: o estado novo e o evento são gravados juntos, ou nenhum dos dois.

**Onde as tarefas são registradas.** No `index.ts` da raiz, antes do `expo-router/entry`. O
Metro coloca cada rota atrás de um getter que só é acessado quando a tela renderiza — e quando o
sistema sobe o processo apenas para entregar um evento de região, nada renderiza. Registrar a
partir de uma tela significa não registrar.

**Sobre a acurácia.** O app exige que o círculo de erro do GPS caiba dentro do raio antes de
declarar entrada, limitado a metade do raio. Com erro de 40 m, um raio de 300 m passa a exigir
260 m. É um desvio deliberado da regra literal, em troca de não anunciar entrada com base numa
leitura que não prova nada.

---

## Limitações por plataforma

**iOS** — 20 regiões simultâneas; raio mínimo efetivo de ~100 m; ~10 segundos de execução por
vez que o sistema acorda o app; a permissão "o tempo todo" só é oferecida depois de um período
de uso comum; 64 notificações locais pendentes no máximo.

**Android** — 100 geofences; a partir do Android 8 a localização em background é estrangulada
sem serviço em primeiro plano, daí a notificação persistente enquanto você está dentro de uma
empresa; gerenciadores de bateria de alguns fabricantes encerram o serviço mesmo assim, e o app
oferece atalho para as configurações de otimização.

**Ambos** — o subtítulo cai em campos diferentes (`subtitle` no iOS, `subText` no Android), e no
Android a posição exata depende do fabricante.

---

## O que foi medido

No emulador Android com Google Play Services, usando o APK de release:

- App aberto e app em segundo plano: entradas e saídas de empresa e de cômodo, com notificação,
  sem abrir a tela.
- Com o processo morto: a tarefa periódica acordou o app do zero, reconciliou o agendamento e
  enviou a confirmação de entrega — verificado com o processo confirmado morto antes.
- Com o dataset de 520 locais: 100 de 100 regiões registradas.
- Sem rede: a mensagem venceu, a confirmação ficou na fila e nada foi enviado; ao religar,
  drenou sozinha, sem duplicar.

**O que não foi medido.** A transição de geofence com o processo morto não é observável no
emulador: o GPS simulado só avança enquanto algum aplicativo mantém um pedido de localização
ativo, então mover a posição com o app morto não chega ao sistema. E nada aqui foi verificado em
aparelho físico — emulador e simulador não reproduzem orçamento de bateria nem gerenciadores de
fabricante.

---

## Estrutura

```
index.ts                  registra as tarefas de background antes do router
app/                      rotas (cada arquivo é um re-export de uma linha)
src/
  core/                   banco, geometria, permissões, log
  domains/
    geofencing/           empresas, cômodos e o monitoramento
    messaging/            sequência de notificações
    onboarding/ settings/
  components/ lib/ i18n/ theme/ config/
```

Cada tela é um trio: `index.tsx` monta, `View.tsx` só desenha e `ViewModel.ts` decide. A lógica
de decisão — histerese, seleção de regiões, plano de mensagens, geometria — fica em funções
puras, sem I/O, e é onde moram os 233 testes.

---

## O que ficou de fora

Arrastar vértices depois de desenhar, sincronização com servidor, modo claro, e verificação em
aparelho físico.
