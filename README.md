# Geofence Lab

Módulo de geolocalização em background com React Native + Expo (SDK 54), escrito para os
exercícios práticos da Byst.End. Reúne os dois enunciados num app só, em módulos independentes:

- **Geofencing** — monitora 520 locais, detecta entrada no `radius` e saída do `activeRadius`,
  e resolve polígonos de cômodos dentro das residências. Funciona em foreground, background e
  com o app fechado, dentro do que cada plataforma permite.
- **Mensagens** — duas sequências de notificações locais (onboarding e diária semanal), offline,
  em ordem, sem duplicidade, com confirmação de entrega enfileirada e com retry.

Sem serviços pagos, sem backend, sem conta. Todo o estado vive no aparelho.

---

## Índice

- [O problema e a estratégia](#o-problema-e-a-estratégia)
- [Arquitetura](#arquitetura)
- [Detecção: raio, raio ativo e duplicidade](#detecção-raio-raio-ativo-e-duplicidade)
- [Cômodos: por que polígono e não círculo](#cômodos-por-que-polígono-e-não-círculo)
- [Consumo de bateria](#consumo-de-bateria)
- [Mensagens sequenciadas](#mensagens-sequenciadas)
- [Persistência](#persistência)
- [Decisões técnicas](#decisões-técnicas)
- [Limitações por plataforma](#limitações-por-plataforma)
- [Como rodar](#como-rodar)
- [Como testar a detecção](#como-testar-a-detecção)
- [Testes automatizados](#testes-automatizados)
- [Estrutura de pastas](#estrutura-de-pastas)
- [O que ficou de fora](#o-que-ficou-de-fora)

---

## O problema e a estratégia

O enunciado pede no mínimo 500 pontos monitorados. O sistema operacional não permite isso:

| Plataforma | Regiões monitoradas simultaneamente |
|---|---|
| iOS (`CLCircularRegion`) | **20** |
| Android (Geofencing API) | **100** |

A saída ingênua seria manter o GPS ligado e comparar a posição com os 500 pontos a cada leitura.
Isso funciona e destrói a bateria: o rádio de localização é o componente mais caro do aparelho, e
manter-se acordado o tempo todo é justamente o que o monitoramento nativo de regiões existe para
evitar.

A estratégia adotada é uma **janela móvel com região sentinela**:

1. Registro no sistema as `N-1` regiões mais próximas (19 no iOS, 99 no Android).
2. A vaga restante vai para uma **região sentinela** (*guard region*) — um círculo centrado no
   ponto onde a janela foi calculada.
3. Sair da sentinela é o sinal de que a janela pode ter ficado obsoleta. Só aí ela é recalculada.

Não há polling e não há timer. Quem espera é o rádio do próprio aparelho, que já faz isso de
qualquer forma para outros apps.

O raio da sentinela não é arbitrário. Andar uma distância `d` altera a distância até qualquer
borda em no máximo `d`, então o último local escolhido só perde a vaga para o primeiro descartado
quando `selecionado + d ≥ descartado − d`. Metade da folga entre os dois é, portanto, o maior
raio que **não pode** estar errado:

```
raioSentinela = max( (bordaDoPrimeiroDescartado − bordaDoÚltimoEscolhido) / 2 , piso )
```

O piso existe porque num agrupamento denso essa folga pode dar dois metros, e um círculo de dois
metros não é monitorável.

A ordenação usa a **distância até a borda** (`distância ao centro − activeRadius`), não a
distância até o centro. Um local largo a um quilômetro pode ser mais iminente que um estreito do
outro lado da rua, e quando a origem já está dentro de um local a distância à borda é negativa —
ele vai naturalmente para o topo.

> `src/domains/geofencing/services/regionReconciler.ts`

---

## Arquitetura

Três camadas, e a de cima é a única cara.

```
                       parado, longe de tudo
┌──────────────────────────────────────────────────────────────────┐
│  CAMADA 1 — regiões nativas (o despertador)                      │
│                                                                  │
│  19 locais mais próximos + 1 região sentinela                    │
│  registrados via Location.startGeofencingAsync                   │
│                                                                  │
│  custo: zero. Nenhuma posição é solicitada.                      │
└──────────────────────────────────────────────────────────────────┘
          │                                    │
          │ entrou numa região                 │ saiu da sentinela
          ▼                                    ▼
┌────────────────────────────────┐   ┌─────────────────────────────┐
│  CAMADA 2 — GPS contínuo       │   │  recalcula a janela         │
│                                │   │  (só quando necessário)     │
│  Accuracy.High, a cada 3 m     │   └─────────────────────────────┘
│  + foreground service (Android)│
│                                │
│  ativa só enquanto você está   │
│  dentro do activeRadius de     │
│  algum local                   │
└────────────────────────────────┘
          │ cada posição
          ▼
┌──────────────────────────────────────────────────────────────────┐
│  CAMADA 3 — resolução                                            │
│                                                                  │
│  índice espacial → candidatos                                    │
│  máquina de estados → transições (histerese + debounce)          │
│  ponto-em-polígono → qual cômodo                                 │
│  SQLite (uma transação) → estado + evento                        │
│  notificação local                                               │
└──────────────────────────────────────────────────────────────────┘
```

### O círculo nativo é uma campainha, não um veredito

As regiões registradas no sistema usam `activeRadius`, elevado ao piso de ~100 m que o iOS exige
para funcionar de forma confiável. Elas **não** decidem nada: apenas acordam o app. A decisão de
entrada e saída é tomada em JavaScript, a partir de uma posição real, contra os valores
verdadeiros de `radius` e `activeRadius`.

Essa separação é o que permite monitorar um local com raio de 25 m numa plataforma cujo mínimo é
100 m — e é a mesma razão pela qual cômodos funcionam.

### Índice espacial no caminho quente, varredura exata no caminho raro

Duas operações fazem perguntas geográficas, com frequências muito diferentes:

| Operação | Frequência | Abordagem |
|---|---|---|
| "quais locais podem me conter?" | a cada posição, várias vezes por minuto | índice de grade (`queryWithinRadius`) |
| "quais são os 19 mais próximos?" | só ao cruzar a sentinela | varredura exata dos 520 |

O índice é uma grade uniforme de células de ~0,01° (≈1,1 km), construída uma vez e invalidada a
cada escrita. A busca varre anéis de células e para assim que o `k`-ésimo melhor resultado já é
melhor do que qualquer coisa que o próximo anel poderia conter. Os anéis são recortados pela
extensão ocupada do índice, o que mantém barata até uma consulta cuja origem está muito longe dos
dados — sem esse recorte, uma origem a 3.000 células de distância enumeraria milhões de chaves
inexistentes.

No caminho raro, uma ordenação exata de 520 elementos custa microssegundos e não tem margem de
erro. Grade não é sempre melhor; é melhor onde a frequência paga a complexidade.

> `src/core/geo/spatialIndex.ts`

---

## Detecção: raio, raio ativo e duplicidade

### Histerese

É o requisito funcional traduzido diretamente em código:

- **De fora**, entra quando `distância ≤ radius`.
- **De dentro**, sai quando `distância > activeRadius`.

A faixa entre os dois é uma **banda morta**: quem fica parado na borda não gera evento nenhum.
Sem ela, alguém sentado num café a 60 m de um ponto com raio de 60 m produziria um fluxo infinito
de entradas e saídas.

### Margem de confiança

A acurácia informada pela plataforma é usada como margem: a entrada só é declarada quando o
círculo de erro inteiro cabe dentro do raio, e a saída só quando ele está inteiramente fora.
Na dúvida, o estado atual é mantido.

A margem é limitada a metade do raio. Sem esse teto, uma leitura com 40 m de erro tornaria um
geofence de 50 m impossível de entrar — o círculo de erro nunca caberia.

Leituras com acurácia pior que 100 m são descartadas sem processamento. Uma leitura em que não se
confia é pior que nenhuma: ela vira um evento falso que a camada de deduplicação persiste para
sempre.

### Debounce e tempo de permanência

Uma mudança de estado é proposta, não aplicada. Ela só é confirmada depois que duas leituras
consecutivas concordam, e nunca antes de o estado atual ter durado 10 segundos. Ruído de GPS e
uma passagem rápida rente à borda produzem a mesma assinatura de uma transição real numa única
leitura; nenhum dos dois deve chegar ao usuário.

Esse tempo de permanência não se aplica a um alvo nunca observado — ele existe para impedir que
um estado estabelecido oscile, e quem nunca foi classificado não tem o que proteger. Uma
instalação nova que abre já dentro de casa reporta isso imediatamente.

### Três defesas contra duplicidade

Uma só não sobrevive ao processo ser encerrado:

1. **A máquina de estados** só emite quando o estado realmente muda.
2. **Número de sequência monotônico** por alvo, que compõe a chave de idempotência
   `alvo:sequência:tipo`, gravada num índice `UNIQUE` com `INSERT OR IGNORE`.
3. **Transação**: o novo estado e o evento são gravados juntos, ou nenhum dos dois.

A defesa 2 existe por um motivo concreto e documentado: **o iOS reporta o estado inicial de todas
as regiões registradas a cada vez que o app inicia**. Sem a chave persistida, todo relançamento
re-dispararia "entrou" em tudo que estivesse por perto.

> `src/domains/geofencing/services/transitionEngine.ts`

---

## Cômodos: por que polígono e não círculo

A extensão do enunciado — multipolígono com cômodos dentro de uma residência — não pode ser feita
com geofences nativos, e a razão é dura:

> O `CLCircularRegion` do iOS deixa de disparar de forma confiável abaixo de aproximadamente
> 100 m. Um quarto tem 3 m.

Então o modelo é hierárquico:

| Nível | Geometria | Como é resolvido |
|---|---|---|
| Local (residência) | círculo `radius` / `activeRadius` | região nativa acorda o app, JS confirma |
| Cômodo | polígono | ponto-em-polígono sobre posições de alta precisão |

O teste é *ray casting* (número de cruzamentos): um raio na direção do leste cruza as arestas do
polígono, e um número ímpar de cruzamentos significa dentro. Antes dele, um filtro de *bounding
box* descarta em quatro comparações quem está claramente fora — importante, porque cada posição
testa vários cômodos.

Duas decisões de precisão:

- **Coordenadas são tratadas como planas.** Numa planta de casa — dezenas de metros — o erro de
  ignorar a curvatura da Terra fica muito abaixo da precisão do GPS. Não seria aceitável para
  polígonos de escala continental; não é o caso aqui.
- **Um ponto na borda está dentro, por definição.** *Ray casting* é notoriamente indefinido na
  fronteira: se um vértice conta como dentro depende de para que lado o raio sai. Em vez de
  herdar esse cara ou coroa, a borda é testada explicitamente antes, com tolerância em metros.
  O resultado é determinístico e o mesmo ponto nunca oscila.

E como paredes são compartilhadas, um ponto exatamente sobre uma delas pertence a dois polígonos.
Uma pessoa está num cômodo por vez, então a ocupação é **exclusiva**: entre os cômodos que contêm
o ponto, vence o de centroide mais próximo, com o identificador como critério de desempate. Isso
evita exigir que o usuário desenhe os cômodos com frestas entre eles.

Sair do local expulsa o cômodo ocupado imediatamente, sem esperar debounce. Sem isso, um "dentro"
obsoleto sobreviveria à saída e suprimiria a próxima entrada legítima.

> `src/core/geo/polygon.ts`

---

## Consumo de bateria

| Situação | O que está ligado | Custo |
|---|---|---|
| Longe de qualquer local | só regiões nativas | praticamente zero |
| Dentro do `activeRadius` | GPS de alta precisão + foreground service | alto, mas limitado à permanência |
| App fechado, longe | só regiões nativas | praticamente zero |

As escolhas que sustentam isso:

- **Nenhuma posição é solicitada em repouso.** O trabalho é do rádio do aparelho, que já o faz.
- **A janela é recalculada por evento, não por timer.** Sair da sentinela é o único gatilho.
- **Re-registro é evitado quando o conjunto não muda.** Registrar de novo não é grátis: a
  plataforma desmonta e remonta o monitoramento, e no iOS isso re-reporta o estado inicial de
  todas as regiões. O conjunto novo é comparado com o registrado antes de qualquer chamada.
- **`pausesUpdatesAutomatically: false`** na camada 2. O iOS pausa as atualizações quando acha que
  o usuário parou de se mover — que é exatamente quando ainda precisamos saber em qual cômodo ele
  está.
- **Leituras ruins são descartadas antes de qualquer processamento**, o que evita acordar a CPU
  para nada.

---

## Mensagens sequenciadas

### Reconciliação, não encadeamento

A abordagem óbvia — "ao entregar uma, agende a próxima" — perde o fio no instante em que uma
entrega é perdida, e uma entrega **vai** ser perdida: app desinstalado, backup restaurado,
notificações limpas pelo usuário, fuso alterado.

Aqui o plano inteiro deriva de um único instante: o do cadastro. Uma função pura devolve
exatamente quais mensagens existem, em que ordem e em que horário absoluto. O agendador compara
esse plano com o que já está enfileirado e corrige apenas a diferença.

Rodar duas vezes não muda nada. Rodar depois de uma semana offline coloca tudo em dia. A ordem e
a ausência de duplicidade são **propriedades do plano**, não regras que o runtime precisa policiar.

### Dedup no nível do sistema

O identificador da notificação é a chave do slot (`sequência:posição`). Isso faz o próprio SO
recusar guardar duas notificações para a mesma mensagem: reagendar um slot substitui o anterior.
Cancelar também vira uma operação direta, e a verificação contra
`getAllScheduledNotificationsAsync()` é uma comparação de identificadores.

### Janela deslizante

**O iOS mantém no máximo 64 notificações locais pendentes e descarta o excedente silenciosamente.**
Agendar as 33 mensagens de uma vez caberia hoje, mas seria apostar. O app entrega ao SO apenas as
próximas 24 e completa a janela a cada reconciliação — que roda na abertura do app, quando uma
notificação chega, e pela tarefa periódica.

### Horário fixo é hora de parede

O horário diário é calculado pelo construtor de `Date` com componentes locais, não somando 24 h em
milissegundos. Assim "09:00 todo dia" continua sendo 09:00 depois de uma mudança de horário de
verão, em vez de derivar uma hora. O Brasil não tem mais horário de verão, mas o fuso do aparelho
é do usuário, não nosso.

### Confirmação de entrega

A fila é o estado, não a requisição. A confirmação é durável no instante em que a mensagem é
entregue; enviá-la é outro problema, que pode falhar e ser retentado por horas.

- Backoff exponencial de 30 s, dobrando, com teto de 1 h e 10 tentativas (≈4 h de janela).
- Drenagem disparada por três gatilhos independentes: foreground, tarefa periódica e chamada
  manual. Nenhum deles é garantido, então nenhum é o único.
- Cabeçalho `Idempotency-Key` na requisição, porque uma resposta que nunca chegou é
  indistinguível de uma que nunca aconteceu.

O endpoint é configurável por `EXPO_PUBLIC_DELIVERY_ENDPOINT`. Sem ele, a fila continua sendo
gravada e pode ser inspecionada na aba Mensagens.

**Sobre o subtítulo:** `content.subtitle` do `expo-notifications` existe apenas no iOS — o
equivalente do Android (`setSubText`) não é exposto. A string "Semana X · Mensagem Y de 7" é
montada uma vez pelo planejador e vai como subtítulo no iOS e como primeira linha do corpo no
Android. O requisito é que ela apareça na notificação, e essa é a forma de cumpri-lo nas duas
plataformas sem fingir que o campo existe onde não existe.

> `src/domains/messaging/services/sequencePlanner.ts`

---

## Persistência

**SQLite para tudo que a tarefa de background toca. MMKV apenas para preferência de interface.**

A divisão é deliberada. MMKV é rápido e síncrono, mas o contexto *headless* do TaskManager é o
lugar menos tolerante onde este app roda, e SQLite dá transações ali: uma posição que produz uma
transição precisa gravar o estado novo e o evento juntos, ou um encerramento no meio deixaria o
evento ser disparado duas vezes.

Modo WAL, porque a interface lê o log de eventos enquanto a tarefa de background escreve nele.

| Tabela | Papel |
|---|---|
| `places`, `rooms` | dataset |
| `monitor_state` | presença por alvo, `transition_seq`, estado pendente do debounce |
| `geofence_events` | log, com `idempotency_key UNIQUE` |
| `message_schedule` | slots agendados, chave primária `(sequence, position)` |
| `delivery_receipts` | fila de confirmações com tentativas e backoff |
| `app_log` | log estruturado, limitado a 2.000 entradas |
| `kv` | escalares que as tarefas precisam sem carregar um domínio inteiro |

Migrações versionadas por `PRAGMA user_version`, aplicadas em ordem, nunca editadas depois de
publicadas.

---

## Decisões técnicas

| Decisão | Por quê |
|---|---|
| Janela móvel + região sentinela | única forma de cobrir 500+ pontos dentro do teto de 20 do iOS |
| Círculo nativo como campainha | permite raios menores que o mínimo da plataforma e viabiliza cômodos |
| Ordenar por distância à borda | um geofence largo e distante pode ser mais iminente que um estreito e próximo |
| Duas camadas de monitoramento | GPS contínuo só onde ele é necessário — é o item de bateria |
| SQLite, não MMKV, no background | transações; a task pode morrer entre duas escritas |
| Sequência monotônica na chave | sobrevive ao reporte de estado inicial do iOS e a relançamentos |
| Lógica de decisão em funções puras | histerese, dedup e reconciliação testáveis sem aparelho |
| Reconciliação no agendamento | idempotente por construção; recupera de qualquer lacuna |
| Grade uniforme, não k-d tree | dados estáticos, consulta sempre "k mais próximos"; ~120 linhas sem balanceamento |
| Simulador de rota embutido | torna a detecção verificável e repetível sem caminhar |

### Escolha de bibliotecas

Tudo open-source, nada pago:

`expo-location` (regiões + posições), `expo-task-manager` (tarefas em background),
`expo-notifications` (notificações locais), `expo-sqlite` (persistência),
`expo-background-task` (reconciliação periódica — substitui o `expo-background-fetch`, depreciado),
`react-native-maps` (mapa e polígonos), `expo-intent-launcher` (ajustes de bateria no Android),
`@tanstack/react-query` + `zustand` (estado da interface).

---

## Limitações por plataforma

Esta seção é cobrada explicitamente nos dois enunciados. As limitações abaixo são de plataforma,
não do código — o que dá para fazer é mitigar, e está dito como.

### iOS

| Limitação | Efeito | Mitigação |
|---|---|---|
| 20 regiões simultâneas | não cabem 500 pontos | janela móvel com sentinela |
| Raio mínimo efetivo ~100 m no `CLCircularRegion` | cômodos não podem ser regiões | círculo nativo só como gatilho; polígono resolve o resto |
| ~10 s de execução ao ser acordado | trabalho longo é cortado no meio | gravação síncrona e transacional; nada de rede no caminho crítico |
| Estado inicial de todas as regiões é reportado a cada início do app | re-dispararia tudo | chave de idempotência persistida |
| Permissão "o tempo todo" só é oferecida depois de um período de "ao usar" | usuário pode não ver a opção | *priming* no onboarding; tela de Ajustes mostra o estado e leva às configurações |
| Máximo de 64 notificações locais pendentes, excedente descartado em silêncio | mensagens sumiriam | janela deslizante de 24 |
| `content.subtitle` existe só aqui | Android não teria o "Semana X" | a string vira primeira linha do corpo no Android |

O iOS **relança** o app encerrado para entregar um evento de região. É por isso que os
`TaskManager.defineTask` ficam em escopo de módulo, importados no topo do layout raiz: o processo
pode subir só para entregar um evento, sem nunca montar uma árvore React.

### Android

| Limitação | Efeito | Mitigação |
|---|---|---|
| 100 geofences por app | não cabem 500 pontos | mesma janela móvel |
| `ACCESS_BACKGROUND_LOCATION` exige um segundo pedido, e no Android 11+ não é um diálogo — é uma tela de ajustes | negativa silenciosa se pedida errado | pedida só depois do primeiro plano, com explicação antes |
| Android 8+ limita a localização em background a poucas leituras por hora | camada 2 seria inútil | *foreground service* com notificação persistente |
| Android 12+ exige `FOREGROUND_SERVICE_LOCATION` | serviço não inicia | declarada no manifesto |
| **App finalizado não é relançado por evento de geofence** | monitoramento para | o foreground service sobrevive ao *swipe* na maioria dos aparelhos; encerramento forçado não tem solução |
| Gerenciadores de bateria de fabricantes (Xiaomi, Huawei, Samsung, Oppo) encerram o serviço | monitoramento morre com a tela apagada | atalho para a tela de isenção em Ajustes → Otimização de bateria |
| Sem *receiver* de `BOOT_COMPLETED`, o monitoramento não volta após reiniciar | usuário precisa abrir o app | a permissão está declarada, mas o receiver exigiria um config plugin nativo — ficou fora de escopo |
| `react-native-maps` exige chave da Maps SDK for Android | mapa em branco | o app detecta a ausência e cai em modo lista; o monitoramento não depende do mapa |

### Ambas

- O Expo Go não serve: os módulos são nativos. É preciso um *development build* ou o APK.
- Encerramento forçado pelo usuário (arrastar para fora em "forçar parada") encerra tudo. Nenhum
  app contorna isso, e isso é intencional por parte do sistema.

---

## Como rodar

### Pré-requisitos

Node 20+, e para o Android o JDK 17+ com o Android SDK.

### Desenvolvimento

```bash
npm install
cp .env.example .env     # preencha as chaves (veja abaixo)
npx expo run:android     # ou run:ios
```

O banco é criado e o dataset de 520 locais é carregado automaticamente na primeira abertura.

### Variáveis de ambiente

Ambas opcionais — o app funciona sem elas.

| Variável | Para quê |
|---|---|
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | mapa no Android. Sem ela a tela cai em modo lista. Emita em console.cloud.google.com com a *Maps SDK for Android* habilitada; carregamento de mapa em apps móveis não é cobrado. No iOS o MapKit é usado e nenhuma chave é necessária. |
| `EXPO_PUBLIC_DELIVERY_ENDPOINT` | para onde as confirmações de entrega são enviadas. Use uma URL descartável de webhook.site para demonstrar. Vazio desliga o envio; a fila continua local. |

### Gerar o APK

Na nuvem, com o perfil que já produz APK em vez de AAB:

```bash
npx eas build -p android --profile preview
```

Ou localmente, sem conta em nenhum serviço:

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Como testar a detecção

### Sem sair do lugar — o simulador

**Monitor → Abrir simulador**, ou **Ajustes → Simulador de rota**.

Ele injeta uma rota sintética no mesmo pipeline que o GPS alimenta: mesma máquina de estados,
mesma deduplicação, mesmas notificações. Não é um mock do resultado — é o caminho real, com uma
fonte de posições diferente.

1. Escolha uma das residências (`Casa 1 — Pinheiros` … `Casa 8`); são as que têm cômodos.
2. Escolha "Atravessar" e toque em *Executar rota*.
3. Acompanhe a aba **Eventos**: devem aparecer, em ordem, entrada no local, entrada num cômodo,
   saída do cômodo, entrada no seguinte, saída dele e saída do local.

Experimente também mudar a acurácia simulada para ±120 m: as leituras passam a ser descartadas e
nenhum evento é gerado, que é o comportamento correto.

As posições são datadas para trás a partir de agora, então o monitoramento real pode ser retomado
logo em seguida sem esperar nada.

### No campo

1. **Locais → Cadastrar local aqui** cria um local na sua posição atual.
2. Ajuste raio e raio ativo (o raio ativo precisa ser maior ou igual — o app recusa o contrário).
3. Salve, depois use **Desenhar cômodo no mapa** para marcar um polígono tocando nos cantos.
4. **Monitor → Iniciar monitoramento**.
5. Saia, afaste-se além do raio ativo, volte. As notificações chegam com o app fechado.

### Com o app fechado

Minimize, aguarde, e depois arraste o app para fora dos recentes. No Android o serviço em
primeiro plano continua na maioria dos aparelhos; no iOS o sistema relança o app ao cruzar uma
região. **Ajustes → Diagnóstico** mostra o log gravado durante o período — é assim que o
comportamento descrito acima foi observado, e não suposto.

---

## Testes automatizados

```bash
npm test          # 143 testes
npm run verify    # typecheck + verificação de i18n + testes
```

O alvo são as funções puras, que é onde mora a lógica que o enunciado avalia:

| Arquivo | O que cobre |
|---|---|
| `core/geo/haversine.test.ts` | distâncias conhecidas, antimeridiano, polos, simetria |
| `core/geo/polygon.test.ts` | dentro/fora, vértice, aresta, polígono côncavo, prefiltro |
| `core/geo/spatialIndex.test.ts` | k-vizinhos idêntico à força bruta em 520 pontos, várias células |
| `geofencing/transitionEngine.test.ts` | histerese, banda morta, margem de confiança, debounce, dedup, cômodos exclusivos |
| `geofencing/regionReconciler.test.ts` | teto de 20 e de 100, raio da sentinela, estabilidade do conjunto |
| `geofencing/routeSimulator.test.ts` | geometria e datação das rotas sintéticas |
| `geofencing/pipeline.test.ts` | ponta a ponta sobre o dataset real que o app carrega |
| `messaging/sequencePlanner.test.ts` | ordem, horário fixo, janela, retomada após lacuna, reconciliação |
| `messaging/receiptSender.test.ts` | backoff exponencial e esgotamento |

O teste de pipeline é o que amarra tudo: percorre uma residência do `assets/seed/places.json` que
o app realmente usa e verifica que a sequência de eventos é exatamente a que uma caminhada real
produziria, cada um exatamente uma vez.

---

## Estrutura de pastas

```
app/                                  rotas (Expo Router) — re-exports de uma linha
src/
  core/
    db/                               SQLite: migrações, transações, key-value
    geo/                              haversine · ponto-em-polígono · índice de grade
    permissions/                      fluxo de permissões na ordem que as plataformas exigem
    bootstrap.ts                      migração + carga do dataset antes da primeira tela
    logger.ts                         log estruturado em SQLite
  domains/
    geofencing/
      services/
        transitionEngine.ts           ← máquina de estados          [puro]
        regionReconciler.ts           ← janela de regiões nativas    [puro]
        routeSimulator.ts             ← rotas sintéticas             [puro]
        monitorService.ts             orquestra as camadas
        placeRepository.ts            CRUD + índice espacial
        eventRepository.ts            log idempotente
        stateRepository.ts            presença persistida
        notifier.ts                   notificação por transição
      tasks/                          TaskManager.defineTask
      screens/                        Monitor · Locais · Editor · Eventos · Simulador
    messaging/
      services/
        sequencePlanner.ts            ← plano e diff                 [puro]
        scheduler.ts                  reconcilia com o SO
        receiptSender.ts              fila de confirmações
      content/messages.ts             o texto das mensagens
      tasks/                          reconciliação periódica
    settings/, onboarding/
  components/                         atoms · molecules · organisms · templates
  i18n/                               pt-BR (padrão) + en
assets/seed/places.json               520 locais, 8 residências, 32 cômodos
scripts/
  gen-seed.mjs                        gera o dataset (determinístico)
  check-i18n.mjs                      garante que nenhuma chave de tradução falte
```

Toda tela é o trio `index.tsx` (container) + `<X>View.tsx` (interface pura) +
`use<X>ViewModel.ts` (estado, efeitos e handlers). Arquivos em `app/` são apenas re-exports.

---

## O que ficou de fora

- **Receiver de `BOOT_COMPLETED` no Android.** A permissão está declarada, mas retomar o
  monitoramento após reiniciar exigiria um config plugin com código nativo. Está documentado como
  limitação em vez de meio implementado.
- **Edição de vértices de um cômodo já salvo.** Dá para desenhar e excluir; ajustar um vértice
  existente exigiria manipulação de marcadores arrastáveis no mapa.
- **Sincronização com servidor.** O enunciado pede persistência local e proíbe serviços pagos.
  A única saída de rede é a confirmação de entrega, e mesmo ela é opcional.
- **Modo claro.** A interface é escura, herdada dos tokens de tema do template.
