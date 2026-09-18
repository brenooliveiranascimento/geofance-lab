# Geofence Lab

Dois módulos independentes num app só: **geolocalização em background** com detecção de entrada
e saída, e **entrega sequenciada de mensagens** por notificação local. Sem backend, sem serviço
pago, sem conta — tudo mora no aparelho.

- **Expo SDK 54** · React Native 0.81 · TypeScript `strict` · Expo Router v6
- `expo-location` + `expo-task-manager` · `expo-notifications` · `expo-sqlite` ·
  `expo-background-task` · `react-native-maps`
- 227 testes, concentrados na lógica de decisão

---

## Índice

1. [O problema](#o-problema)
2. [Geofencing: as três camadas](#geofencing-as-três-camadas)
3. [Detecção: raio, raio ativo e duplicidade](#detecção-raio-raio-ativo-e-duplicidade)
4. [Cômodos](#cômodos)
5. [Cadastro de empresa](#cadastro-de-empresa)
6. [Mensagens sequenciadas](#mensagens-sequenciadas)
7. [Persistência](#persistência)
8. [Onde o registro das tarefas mora, e por quê](#onde-o-registro-das-tarefas-mora-e-por-quê)
9. [Consumo de bateria](#consumo-de-bateria)
10. [Limitações por plataforma](#limitações-por-plataforma)
11. [O que foi medido](#o-que-foi-medido)
12. [Como rodar e como testar](#como-rodar-e-como-testar)
13. [Testes automatizados](#testes-automatizados)
14. [Estrutura](#estrutura)
15. [O que ficou de fora](#o-que-ficou-de-fora)

---

## O problema

O enunciado pede monitorar ≥500 locais, detectar entrada no `radius` e saída do `activeRadius`,
em foreground, background e com o app fechado, sem duplicidade e com baixo consumo de bateria.

O obstáculo central é o teto de plataforma. O iOS monitora **20 regiões** simultâneas
(`CLCircularRegion`); o Android, **100**. Nenhum dos dois chega perto de 500. E o
`CLCircularRegion` tem raio mínimo efetivo de ~100 m, o que inviabiliza círculos na escala de um
cômodo.

A saída não é escolher entre precisão e bateria, é separar **quem acorda o app** de **quem
decide**.

### Sobre os 500 pontos

O app traz um conjunto de demonstração com **520 locais** espalhados por São Paulo, Rio, Belo
Horizonte e Curitiba — 8 com polígono e cômodos, 512 puramente circulares. Ele entra por
**Ajustes → Ferramentas → Carregar dataset de demonstração**, ao lado das empresas que você
cadastrar, e sai pelo botão vizinho.

O mesmo arquivo (`src/__fixtures__/companies.json`) alimenta o teste de ponta a ponta e é
regerável com `npm run seed`. Os 512 pontos circulares existem por um motivo: eles são o modelo
de dados literal do enunciado (`{id, name, latitude, longitude, radius, activeRadius}`) e a única
forma de exercitar a regra circular no aparelho, já que o assistente de cadastro sempre produz
polígono.

---

## Geofencing: as três camadas

```
┌─ camada 1 ───────────────────────────────────────────────┐
│ regiões nativas  ·  N-1 mais próximas + região sentinela  │
│ custo em repouso: zero                                    │
└──────────────────────┬────────────────────────────────────┘
                       │ acorda o app
┌──────────────────────▼────────────────────────────────────┐
│ camada 2  ·  GPS contínuo enquanto dentro do raio ativo    │
│ ray casting contra os polígonos dos cômodos                │
└──────────────────────┬────────────────────────────────────┘
                       │ consulta
┌──────────────────────▼────────────────────────────────────┐
│ camada 3  ·  índice de grade sobre os 500+ locais          │
└───────────────────────────────────────────────────────────┘
```

### Camada 1 — a região nativa é campainha, não veredito

Registro no máximo `N-1` regiões, sempre as mais próximas **por distância à borda**
(`distância − activeRadius`), não por distância ao centro: um local grande e distante pode ser
alcançado antes de um pequeno e próximo.

A vaga restante é a **região sentinela**: um círculo centrado onde o conjunto foi calculado.
Sair dela significa que a janela ficou obsoleta, e o app recalcula. O raio é metade da folga
entre a borda do último local escolhido e a do primeiro descartado — o maior raio que
provadamente não fica obsoleto antes de disparar:

```
raioSentinela = clamp( (bordaDoPrimeiroDescartado − bordaDoÚltimoEscolhido) / 2, 200 m, 100 km )
```

O teto de 100 km existe porque o iOS recusa regiões acima de
`maximumRegionMonitoringDistance` — uma carteira espalhada por dois continentes produziria um
raio que a plataforma simplesmente ignora, e a janela nunca mais seria reconstruída.

Sair da sentinela força o re-registro. Sem forçar, havia um impasse real: se o GPS estiver frio,
`getCurrentPositionAsync` falha e o app cai na última posição conhecida — que é o mesmo ponto
onde a sentinela foi construída. O conjunto sai idêntico, o re-registro é pulado, e como a
plataforma já consumiu a transição de saída, a sentinela nunca mais dispara.

### Camada 2 — resolução por polígono

Ao entrar no `activeRadius`, o app escala para `startLocationUpdatesAsync` com precisão alta
(3 m / 4 s) e testa cada posição contra os polígonos dos cômodos. Ao sair, desescala. O raio
mínimo do iOS deixa de importar, porque o círculo nativo é sempre o externo.

Se `startLocationUpdatesAsync` falhar — no Android 12+ a janela em que um broadcast de geofence
pode subir serviço em primeiro plano expira — o app registra o erro e **não** anuncia a camada
que não tem. Antes essa falha derrubava a avaliação inteira antes de emitir a entrada.

### Camada 3 — índice espacial

Grade uniforme (célula ~0,01° ≈ 1,1 km) construída uma vez. A busca varre anéis de células a
partir do observador e para quando o k-ésimo vizinho está mais perto que o próximo anel. Os
anéis são recortados pela extensão ocupada do índice, e há limite de distância — sem ele, um
observador fora da extensão faz a varredura percorrer a grade inteira, na thread de interface.

---

## Detecção: raio, raio ativo e duplicidade

### Histerese

Estado por alvo: `outside | inside`. Entra em `distância ≤ radius`, sai em
`distância > activeRadius`. A faixa entre os dois é a banda morta que impede oscilação na borda.

### Margem de confiança — onde o app desvia do enunciado literal

Uma posição com 80 m de erro não prova que você está dentro de um raio de 50 m. No caminho
circular, o app exige que o círculo de erro caiba dentro do raio:

```
entra se  distância + min(acurácia, radius/2)       ≤ radius
sai   se  distância − min(acurácia, activeRadius/2) > activeRadius
```

Isto é um **desvio deliberado** da regra literal do enunciado, e vale declarar: com acurácia de
40 m, um raio de 300 m passa a exigir 260 m para declarar entrada. O teto em metade do raio
existe para a margem nunca engolir o alvo inteiro. Leituras com acurácia pior que **100 m** são
descartadas antes de virar evento.

No caminho por polígono a margem **não** é aplicada: a entrada é um teste de ponto-em-polígono
puro, e a saída usa a folga de 25 m. Um cômodo de 20 m com margem de acurácia seria impossível
de entrar. A troca é consciente: o polígono aceita uma leitura ruim que caia dentro dele por
acaso, e é por isso que a camada 1 (círculo grande) decide *quando* ligar a camada 2.

### Debounce e permanência

Uma transição precisa de **2 leituras consecutivas** concordando e de **10 s** no estado
anterior. A exceção: um alvo nunca observado (`transitionSeq === 0`) não espera — instalar o app
já dentro de uma empresa reporta na hora.

### Três defesas contra duplicidade

1. **A máquina de estados só emite quando o estado muda.** Ler cem vezes a mesma posição não
   gera cem eventos.
2. **Chave de idempotência com sequência monotônica.** Cada alvo carrega um `transition_seq` que
   só avança quando uma transição é comitada. A chave é `${alvo}:${seq}:${tipo}`, com índice
   `UNIQUE` e `INSERT OR IGNORE`. Isto existe por um motivo concreto: **o iOS reporta o estado
   inicial de todas as regiões a cada início do app**, e o Android faz o mesmo a cada
   `startGeofencing`. Sem a chave persistida, todo relançamento re-dispararia entrada em tudo
   por perto.
3. **Estado e evento na mesma transação.** Ou os dois são gravados, ou nenhum. O caminho de
   leitura-avaliação-gravação não tem `await` no meio, então simulador e monitoramento real não
   se intercalam dentro de uma decisão.

Parar o monitoramento **não** zera a presença. Presença é fato do mundo; monitorar é observá-lo.
Zerar produzia duas entradas seguidas sem saída entre elas ao parar e reiniciar estando dentro;
emitir saídas sintéticas seria pior, porque anunciaria "você saiu" com o usuário parado no lugar.

---

## Cômodos

Círculos nativos não funcionam nessa escala — o raio mínimo efetivo do iOS (~100 m) é maior que
a casa inteira. Cômodos são polígonos, testados por **ray casting** com prefiltro de bounding
box, dentro da camada 2.

Três detalhes que a regra par-ímpar não resolve sozinha:

- **Fronteira é dentro**, por regra explícita e testada, não por sorteio de ponto flutuante.
- **Ocupação exclusiva**: com polígonos que se tocam, o app escolhe o cômodo de centroide mais
  próximo, com desempate por id. Sem isso dois cômodos ficavam ocupados ao mesmo tempo.
- **Contorno que se cruza é recusado.** Marcar os cantos fora de ordem produz um laço, e aí a
  regra par-ímpar trata parte da área como externa e a fórmula do cadarço cancela a metade
  invertida. O app detecta o cruzamento, bloqueia a conclusão e oferece desembaraçar por 2-opt:
  se duas arestas se cruzam, a troca que as descruza é estritamente mais curta pela desigualdade
  triangular. Ele **não** adivinha a forma pretendida — num prédio em L de seis cantos o
  percurso mais curto mede 11,48 contra 12 do próprio L — e a interface diz isso. Os testes
  afirmam as duas coisas.

---

## Cadastro de empresa

Assistente em três passos: nome → perímetro → cômodos.

O mapa usa **pino fixo no centro** em vez de toque. Tocar no mapa num aparelho de mão erra por
dedo e não dá como corrigir sem apagar; arrastar o mapa sob um pino fixo é o gesto que Uber e
iFood usam para a mesma tarefa, e a leitura de coordenada fica visível o tempo todo.

`radius` e `activeRadius` são **derivados** do polígono, não pedidos ao usuário: o raio é o do
círculo circunscrito ao contorno e o ativo soma 25 m de folga. O invariante
`activeRadius ≥ radius` é imposto pelo repositório, que lança em vez de gravar — violá-lo cria
uma faixa onde a máquina de estados quer entrar e sair ao mesmo tempo, e o aparelho ficaria
emitindo eventos para sempre.

Validações que o modelo de dados não expressa: mínimo de 3 vértices, área mínima, vértices muito
próximos, contorno que se auto-intersecta, cômodo fora do perímetro, e redesenho de perímetro
que deixaria um cômodo existente de fora.

---

## Mensagens sequenciadas

### Reconciliação, não encadeamento

O plano inteiro é **derivado do instante do cadastro**: dado `enrolledAt` e o "agora", a função
diz exatamente quais mensagens deveriam estar agendadas. O agendador compara esse plano com o
que o SO tem (`getAllScheduledNotificationsAsync`) e com a tabela, agenda o que falta e cancela
órfãs.

Reconciliar em vez de encadear é o que torna a operação idempotente através de reinstalação,
restore de backup, mudança de fuso e processo morto. Ordem e ausência de duplicidade passam a
ser propriedades dos dados, não de bookkeeping em tempo de execução.

**Sequências**: onboarding com 5 mensagens em 2, 5, 12, 25 e 45 minutos após o cadastro; diária
com 4 semanas × 7 mensagens, uma por dia às 9h, começando no dia seguinte ao fim do onboarding.

### Dedup no nível do sistema

O identificador da notificação é a chave do slot (`daily:12`). Reagendar o mesmo slot substitui
a notificação pendente no SO, nos dois sistemas — a plataforma recusa a duplicata por
construção, não por código nosso.

### Horário fixo é hora de parede

As diárias são construídas com componentes locais (`new Date(ano, mês, dia + n, 9, 0)`), não
somando 86.400.000 ms. Assim 9h continua 9h atravessando horário de verão.

### Janela

A janela entrega **40** notificações ao SO — o plano inteiro de 33 cabe, com folga sob o teto de
**64 pendentes** do iOS. Os alertas de região usam disparo imediato e não ocupam vaga.

### Subtítulo

O enunciado pede `Semana X; Mensagem Y de Z` no subtítulo. O `content.subtitle` do
expo-notifications é **exclusivo do iOS** — no Android o `setSubText` não é exposto. O planner
monta a string uma vez; no iOS ela vai como subtítulo, no Android como primeira linha do corpo.
Consequência a registrar: na bandeja recolhida do Android aparece essa linha, e o conteúdo da
mensagem só ao expandir.

### Confirmação de entrega

Cada entrega enfileira uma confirmação em SQLite e a fila é o estado — não a requisição. Nada se
perde porque um POST falhou.

- **Backoff** de 30 s dobrando, teto de 4 h, 15 tentativas: cerca de **24 h de falhas com rede**
  antes de esgotar.
- **Offline não gasta tentativa.** Antes, cada abertura do app tentava, falhava na hora e
  consumia uma das tentativas — em poucas horas a confirmação esgotava sem nunca ter havido
  rede. Agora a drenagem consulta `expo-network` e sai sem tocar no contador.
- **Quatro gatilhos**: primeiro plano, volta da conectividade, tarefa periódica e o botão.
- `Idempotency-Key` em todo POST, carimbada com o instante do cadastro
  (`1789732800000:daily:0`). Sem o cadastro na chave, apagar a sequência e cadastrar de novo
  reenviava a mesma chave, e um endpoint conforme descartava o segundo cadastro inteiro.
- O endpoint é informado em **Ajustes**, com botão de teste. A variável
  `EXPO_PUBLIC_DELIVERY_ENDPOINT` serve de padrão do build, e campo vazio volta para ele.
  Variáveis `EXPO_PUBLIC_*` são embutidas no bundle, então fixar a URL no `.env` faria ela
  viajar dentro do APK apontando para um endereço que o avaliador não controla.

### Permissão negada

Se a permissão de notificação for revogada, a reconciliação **para**: nada é agendado e nada é
marcado como entregue. Antes o app seguia marcando entregas por horário e confirmando mensagens
que ninguém viu. A tela de Mensagens mostra o motivo.

---

## Persistência

| Tabela | Guarda |
|---|---|
| `companies`, `rooms` | empresas e polígonos dos cômodos |
| `monitor_state` | presença, `transition_seq`, pendências do debounce |
| `geofence_events` | eventos com `idempotency_key UNIQUE` |
| `message_schedule` | plano agendado, `PRIMARY KEY (sequence, position)` |
| `delivery_receipts` | fila de confirmações, `idempotency_key UNIQUE` |
| `app_log` | log estruturado, aparado em 2.000 entradas |
| `kv` | flags do monitor e do messaging |

**SQLite (WAL) para tudo que as tarefas de background tocam; MMKV só para preferência de
interface.** O contexto headless é o ponto mais frágil do sistema, e ali só entra armazenamento
com transação: estado novo e evento gravados juntos, ou nenhum dos dois.

---

## Onde o registro das tarefas mora, e por quê

`TaskManager.defineTask` é chamado pelo `index.ts` da raiz, que é o `main` do pacote e importa
os dois módulos de tarefas **antes** de `expo-router/entry`.

Importar a partir de `app/_layout.tsx` não basta, e o motivo é sutil. O Metro monta o
`require.context` das rotas com cada arquivo atrás de um getter:

```js
Object.defineProperties({}, { "./_layout.tsx": { get: () => require(...) } })
```

Esse getter só é tocado quando o expo-router resolve a rota, durante o render. Quando o sistema
sobe o processo apenas para entregar um evento de região, **nada renderiza**: o carregador
headless cria o contexto React e roda o bundle, mas não abre surface nenhuma. O getter nunca é
acessado, `defineTask` nunca roda, e o TaskManager cai no ramo em que a tarefa "não está
definida" — onde ele notifica o término e chama `unregisterTaskAsync`, derrubando o registro do
geofence de vez.

Comparando o grafo de módulos dos dois bundles: antes, a cadeia do entry até o módulo que chama
`defineTask` passava pelo contexto de rotas (`entry → expo-router/entry → contexto com getters →
_layout → tasks`); agora são dois níveis síncronos (`entry → index.ts → tasks`).

---

## Consumo de bateria

- **Em repouso o app não pede nenhuma posição.** Quem espera é o rádio do aparelho, através das
  regiões nativas. Zero GPS contínuo.
- O GPS de alta precisão só liga ao entrar no raio ativo e desliga ao sair.
- A janela de regiões só é re-registrada quando o conjunto muda de fato.
- Fix com acurácia acima de 100 m é descartado antes de qualquer processamento.
- A busca de vizinhos é limitada por distância e por anel, em vez de varrer os 520 pontos.

---

## Limitações por plataforma

### iOS

| Limite | Efeito |
|---|---|
| 20 regiões simultâneas | janela móvel com sentinela |
| raio mínimo efetivo ~100 m no `CLCircularRegion` | cômodos são polígonos, não círculos |
| regiões acima de `maximumRegionMonitoringDistance` são recusadas | raio da sentinela tem teto |
| ~10 s de execução por acordar | decisão e gravação sem I/O de rede no caminho crítico |
| "Always" só é oferecida após período de "When In Use" | o onboarding pede em duas etapas |
| relança o app terminado para evento de região | o caminho headless precisa funcionar |
| reporta estado inicial de todas as regiões a cada startup | chave de idempotência persistida |
| 64 notificações locais pendentes | janela de 40 |
| `content.subtitle` é exclusivo do iOS | no Android vira primeira linha do corpo |
| `BGTaskScheduler` exige identificador no `Info.plist` | plugin `expo-background-task` habilitado |

### Android

| Limite | Efeito |
|---|---|
| 100 geofences | janela móvel com sentinela |
| `ACCESS_BACKGROUND_LOCATION` exige segundo prompt | fluxo em duas etapas |
| Android 8+ estrangula localização em background | serviço em primeiro plano na camada 2 |
| `FOREGROUND_SERVICE_LOCATION` no Android 12+ | declarado |
| janela de início de FGS após broadcast expira | falha ao subir a camada 2 é tratada, não fatal |
| gerenciadores de bateria de fabricante | atalho para as configurações via `expo-intent-launcher` |
| `expo-task-manager` registra receiver de `BOOT_COMPLETED` | as geofences são re-armadas após reiniciar |

### Ambas

Sem a chave da Maps SDK, o mapa não renderiza e a tela mostra um aviso explicando — o restante do
app continua funcionando, inclusive o monitoramento.

---

## O que foi medido

Background não é coisa para afirmar sem medir.

### Emulador Android (imagem com Google Play Services), APK de release

| Situação | Resultado |
|---|---|
| App em primeiro plano | entra e sai da empresa e dos cômodos |
| **App em segundo plano**, processo vivo | `company_exit` e `room_enter` gravados e notificados sem abrir o app |
| **Notificação agendada com o app em segundo plano** | aparece na bandeja; a confirmação **não** é criada na hora, porque o listener do expo-notifications só roda com o app ativo — ela nasce na reconciliação seguinte, como projetado |
| **Processo morto, tarefa periódica acordada** | processo confirmado morto (`pidof` vazio), job forçado pelo `jobscheduler`: o log do app registra `schedule reconciled` e `receipt queue drained` com carimbo de dentro dessa janela, e o endpoint devolveu 2xx para uma confirmação |
| Dataset de 520 locais | **100 / 100** regiões nativas registradas (99 empresas + sentinela) |
| Fila offline | com a rede desligada a mensagem venceu, a confirmação ficou na fila e nada chegou ao endpoint; ao religar, drenou sozinha, sem duplicar |
| Reconciliações repetidas | nenhum POST repetido; a chave de idempotência acompanha cada confirmação |

### O que não foi possível medir, e por quê

**Transição de geofence com o processo morto, no emulador.** O GPS simulado do emulador só
avança enquanto algum cliente mantém um pedido de localização ativo. Com o processo do app
morto, mover a posição não chega ao provider — verificado: a última posição permaneceu no valor
anterior durante 120 s. Não é comportamento do app, é do ambiente; num aparelho real o Play
Services alimenta o fused provider por wifi e rede móvel independentemente do app.

O que sustenta esse caminho aqui é estrutural e está descrito em
[Onde o registro das tarefas mora](#onde-o-registro-das-tarefas-mora-e-por-quê): o mesmo
mecanismo — TaskManager num processo iniciado do zero — foi exercitado pela tarefa periódica, na
linha correspondente da tabela acima.

**Aparelho físico.** Nada aqui foi verificado em hardware real. Emulador e simulador exercitam o
caminho de código do CoreLocation e do Play Services, mas não reproduzem orçamento de execução
em background, estado de bateria nem gerenciadores de fabricante.

---

## Como rodar e como testar

### Pré-requisitos

Node 20+, e para Android uma chave da **Maps SDK for Android** (o carregamento de mapa em mobile
não é cobrado, mas o projeto do Google Cloud precisa de billing habilitado para emitir a chave).

```bash
cp .env.example .env     # preencha EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
```

### Desenvolvimento

```bash
npx expo run:android      # ou run:ios
npm run verify            # typecheck + i18n + testes
npm run lint
```

### APK

```bash
npm run apk
# android/app/build/outputs/apk/release/app-release.apk
```

Use `npm run apk` em vez de chamar o `gradlew` direto: a task
`createBundleReleaseJsAndAssets` se marca como `UP-TO-DATE` em situações em que o JavaScript
mudou de verdade — mexer no `.env` é uma delas, porque ele não é declarado como entrada. O
resultado é um APK que compila, instala e roda com o bundle antigo dentro, sem aviso nenhum. O
script apaga a saída do bundle antes de montar, o que força a regeração sem pagar um clean
completo.

A chave do Maps precisa entrar em **dois lugares**: no manifesto, pelo prebuild, e no bundle,
pela compilação.

### Verificar a detecção sem sair do lugar

**Simulador de rota** (Ajustes → Ferramentas): percorre uma rota sintética pelo mesmo pipeline
que o GPS alimenta. Escolha a empresa, o trajeto e a acurácia simulada. Em ±120 m nenhum evento
é emitido — a leitura é descartada antes de virar evento, e o log de sistema mostra os
descartes. Em ±5 m a mesma rota produz entrada e saída.

**Casa de demonstração**: `npm run seed:demo` gera um contorno em formato de casa com cinco
cômodos, usada por um teste de geometria.

**Em campo**: cadastre uma empresa na sua localização, minimize o app, saia e volte. O
**Histórico** tem duas abas — Eventos (entradas e saídas, filtráveis, exportáveis) e Sistema
(log estruturado com a janela de regiões, a troca de camada e as chaves de idempotência).

---

## Testes automatizados

```bash
npm test     # 227 testes
```

| Arquivo | Cobre |
|---|---|
| `src/core/geo/__tests__/haversine.test.ts` | distâncias conhecidas, antimeridiano, polos |
| `src/core/geo/__tests__/polygon.test.ts` | ray casting, fronteira, côncavo, prefiltro, área, auto-interseção, 2-opt |
| `src/core/geo/__tests__/spatialIndex.test.ts` | k-vizinhos contra força bruta em 520 pontos, limite de distância |
| `src/domains/geofencing/services/__tests__/transitionEngine.test.ts` | histerese, banda morta, gate de acurácia, debounce, permanência, dedup |
| `…/regionReconciler.test.ts` | teto de 20/100, sentinela com piso e teto, ordenação por borda |
| `…/repositories.test.ts` | dedup por chave de idempotência, presença de empresa desabilitada, invariante dos raios |
| `…/pipeline.test.ts` | caminhada de ponta a ponta sobre o dataset de 520 |
| `…/routeSimulator.test.ts` | geometria das rotas e datação retroativa |
| `…/demoHouse.test.ts` | geometria da casa de demonstração |
| `src/domains/messaging/services/__tests__/sequencePlanner.test.ts` | ordem, hora de parede, janela, retomada, desvio de fuso, reagendamento |
| `…/delivery.test.ts` | entrega e confirmação na mesma transação, recusa da segunda chamada, chave com o cadastro |
| `…/receiptSender.test.ts` | backoff, esgotamento, drenagem, portão offline, endpoint |

Os testes de repositório rodam sobre **SQLite real em memória** (`sql.js`), não sobre um mock
que devolve vazio — é o que permite afirmar que `INSERT OR IGNORE` contra o índice `UNIQUE`
realmente descarta o replay de uma transição.

---

## Estrutura

```
index.ts                  entry: registra as tarefas antes do expo-router
app/                      rotas — re-exports de uma linha
src/
  core/
    db/                   SQLite, migração, kv
    geo/                  haversine, polígono, índice de grade
    permissions/          fluxo foreground → background
    logger.ts             log estruturado em SQLite
  domains/
    geofencing/           services · tasks · queries · screens · components
    messaging/            services · tasks · queries · screens
    onboarding/  settings/
  components/             atoms · organisms · templates
  lib/                    format · query · storage · toast
  i18n/  store/  theme/  config/
  __fixtures__/           dataset de 520 locais e casa de demonstração
  __mocks__/              adaptador SQLite para os testes
```

Toda tela é um trio **index / View / ViewModel**: a View é função pura do `viewModel`, e nenhuma
View importa serviço. As funções de decisão (`transitionEngine`, `regionReconciler`,
`sequencePlanner`, `routeSimulator`, `polygon`, `spatialIndex`) são puras, sem I/O e sem React —
é onde moram os testes.

---

## O que ficou de fora

- Arrastar vértices depois de desenhar: hoje é desfazer e refazer.
- Sincronização com servidor — o enunciado pede persistência local, e o app não tem backend.
- Modo claro: a paleta é escura por decisão, e o app fixa o esquema para que os diálogos nativos
  acompanhem.
- Verificação em aparelho físico.
