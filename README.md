# Geofence Lab

Módulo de geolocalização em background com React Native + Expo (SDK 54), escrito para os
exercícios práticos da Byst.End. Reúne os dois enunciados num app só, em módulos independentes:

- **Geofencing** — você cadastra uma empresa, desenha o perímetro dela no mapa e delimita os
  cômodos por dentro. O app notifica na entrada e na saída do perímetro da empresa e de cada
  cômodo, em foreground, background e com o app fechado, dentro do que cada plataforma permite.
- **Mensagens** — duas sequências de notificações locais (onboarding e diária semanal), offline,
  em ordem, sem duplicidade, com confirmação de entrega enfileirada e com retry.

Sem serviços pagos, sem backend, sem conta. Todo o estado vive no aparelho.

---

## Índice

- [O problema e a estratégia](#o-problema-e-a-estratégia)
- [Cadastro da empresa](#cadastro-da-empresa)
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

### Sobre os 500 pontos

O app não vem com dados de demonstração: ele monitora as empresas que você cadastrar, e na
prática são poucas. A **capacidade** de 500+ é que precisa existir, e ela existe: o reconciliador
e o índice espacial são exercitados em `src/__fixtures__/companies.json`, um conjunto
determinístico de 520 locais (8 com polígono e cômodos, 512 circulares) gerado por
`npm run seed`. Os testes verificam ali que a janela cabe em 20 regiões no iOS e em 100 no
Android, que a sentinela nunca fica grande demais, e que uma caminhada completa produz
exatamente os eventos certos — sobre o mesmo código que roda no aparelho.

Os 512 pontos circulares do fixture também têm um papel: eles não têm polígono, e por isso
exercitam a regra do enunciado na forma original — entrada no `radius`, saída do `activeRadius`.

---

## Cadastro da empresa

O cadastro é um wizard de três passos, oferecido no fim do onboarding e disponível depois pela
aba Empresas.

1. **Nome** — é o que aparece na notificação.
2. **Perímetro** — o mapa abre na sua posição com um **pino fixo no centro da tela**. Você
   arrasta o mapa até o pino ficar sobre um canto do terreno e toca em "Adicionar ponto".
3. **Cômodos** — mesma mecânica, repetida para cada área interna, com um nome para cada uma.

O mapa do passo 3 abre **sobre o perímetro que acabou de ser traçado**, não sobre a posição do
aparelho. Parece detalhe e não é: o perímetro costuma ser desenhado arrastando o mapa para longe
de onde o telefone está, e um mapa que voltasse ao GPS faria todo cômodo desenhado cair fora da
empresa — e falhar na validação de contenção.

### Por que o pino fixo, e não tocar no mapa

Tocar direto no mapa é mais direto e tem menos toques. Também é impreciso da forma que mais
importa aqui: **o dedo cobre exatamente o ponto que se quer marcar**. Num perímetro de terreno
isso é tolerável; num cômodo de três metros é a diferença entre acertar e errar a parede.

Com o pino parado no centro, o alvo fica sempre visível, o ajuste fino é feito arrastando o mapa
(que tem toda a tela de alavanca) e a confirmação é um botão longe da área de mira. É o mesmo
padrão que Uber e iFood usam para escolher endereço, pela mesma razão.

### O que é derivado e o que é desenhado

O `monitor` precisa de um círculo para registrar a região nativa, e a estrutura de dados do
enunciado é circular. Ambos são **derivados do polígono**, não pedidos ao usuário:

| Campo | Origem |
|---|---|
| `latitude` / `longitude` | centroide do perímetro |
| `radius` | maior distância do centroide até um vértice (raio circunscrito) |
| `activeRadius` | `radius` + 25 m de folga |

Assim o círculo sempre contém o polígono inteiro — ele só precisa ser largo o bastante para
acordar o app a tempo. A decisão de entrada continua sendo do polígono.

### Validações que o modelo de dados não expressa

- Um cômodo precisa caber **dentro** do perímetro da empresa. Verificado enquanto o desenho ainda
  é rascunho, que é o único momento em que o usuário consegue corrigir.
- Redesenhar o perímetro não pode deixar de fora um cômodo já cadastrado.
- Área mínima, para recusar um polígono degenerado de três pontos quase colineares.
- Um ponto novo não pode cair em cima de outro (toque duplo sem arrastar o mapa).
- **O contorno não pode cruzar a si mesmo.**

### O contorno cruzado

Marcar os cantos fora de ordem produz um contorno em laço, e isso não é só feio:

- **Ray casting deixa de valer.** A regra par-ímpar passa a tratar parte da área desenhada como
  externa, então o app não detectaria a entrada em metade do terreno.
- **A metragem mente.** A fórmula do cadarço soma áreas com sinal; num laço as duas metades têm
  sentidos opostos e se cancelam. Um contorno em gravata-borboleta chega a acusar área quase zero.

Por isso o cruzamento é **recusado**, não avisado: `findSelfIntersection` testa cada par de arestas
não adjacentes e bloqueia o botão de concluir enquanto houver cruzamento. O desenho fica vermelho
no mapa para o erro ser visível antes de o usuário tentar avançar.

O app oferece **"Reordenar pontos"**, que é 2-opt sobre o percurso fechado dos vértices. A garantia
é exata: se duas arestas de um percurso se cruzam, a troca 2-opt que as descruza é estritamente
mais curta pela desigualdade triangular — logo, um ótimo local de 2-opt não tem cruzamento nenhum.

O que ele **não** garante é acertar a forma pretendida, e isso está dito na interface. Um conjunto
de pontos admite mais de um polígono simples, e o de menor perímetro nem sempre é o desejado: num
prédio em L de seis cantos, o percurso mais curto mede 11,48 contra 12 do próprio L. Os testes
afirmam as duas coisas — que o resultado nunca cruza, e que ele pode não ser a forma original.

> `src/domains/geofencing/screens/CompanyWizardScreen/` · `components/CrosshairMap.tsx`

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
| "quais são os 19 mais próximos?" | só ao cruzar a sentinela | varredura exata de todas |

O índice é uma grade uniforme de células de ~0,01° (≈1,1 km), construída uma vez e invalidada a
cada escrita. A busca varre anéis de células e para assim que o `k`-ésimo melhor resultado já é
melhor do que qualquer coisa que o próximo anel poderia conter. Os anéis são recortados pela
extensão ocupada do índice, o que mantém barata até uma consulta cuja origem está muito longe dos
dados — sem esse recorte, uma origem a 3.000 células de distância enumeraria milhões de chaves
inexistentes.

No caminho raro, uma ordenação exata custa microssegundos mesmo com centenas de itens, e não tem
margem de erro. Grade não é sempre melhor; é melhor onde a frequência paga a complexidade.

> `src/core/geo/spatialIndex.ts`

---

## Detecção: raio, raio ativo e duplicidade

### Histerese

Duas geometrias, a mesma ideia de banda morta.

**Local circular** (sem polígono — a forma exata do enunciado):

- **De fora**, entra quando `distância ≤ radius`.
- **De dentro**, sai quando `distância > activeRadius`.

**Empresa com perímetro** (o que o app cadastra):

- **De fora**, entra quando o ponto está **dentro do polígono**.
- **De dentro**, sai quando está fora do polígono por mais que a folga `activeRadius − radius`.

A segunda forma é a primeira expressa em polígono: `radius` vira a própria borda desenhada e a
folga até `activeRadius` continua sendo a banda morta.

Em ambos os casos a faixa entre os dois limiares é uma **banda morta**: quem fica parado na borda
não gera evento nenhum. Sem ela, alguém sentado junto à porta produziria um fluxo infinito de
entradas e saídas.

### Margem de confiança

A acurácia informada pela plataforma é usada como margem: a entrada só é declarada quando o
círculo de erro inteiro cabe dentro do raio, e a saída só quando ele está inteiramente fora.
Na dúvida, o estado atual é mantido.

A margem é limitada a metade do raio. Sem esse teto, uma leitura com 40 m de erro tornaria um
geofence de 50 m impossível de entrar — o círculo de erro nunca caberia.

**A margem geométrica não se aplica ao polígono, e isso é deliberado.** Um polígono não tem um
raio único para escalar a margem contra, e exigir que o círculo de erro caiba dentro dele torna
impossível entrar num escritório de 40 × 30 m com um GPS de 30 m — que é o caso comum em ambiente
interno. Ali a proteção contra ruído fica por conta do descarte por acurácia, das confirmações
consecutivas e do tempo de permanência. É uma troca explícita: precisão limitada pelo GPS, em vez
de detecção que nunca dispara.

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

O multipolígono — cômodos dentro do perímetro da empresa — não pode ser feito com geofences
nativos, e a razão é dura:

> O `CLCircularRegion` do iOS deixa de disparar de forma confiável abaixo de aproximadamente
> 100 m. Um quarto tem 3 m.

Então o modelo é hierárquico:

| Nível | Geometria | Como é resolvido |
|---|---|---|
| Empresa | polígono desenhado + círculo derivado | a região nativa (círculo) acorda o app; o polígono decide a entrada |
| Cômodo | polígono desenhado | ponto-em-polígono sobre posições de alta precisão |

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

O banco fica em `Documents/SQLite/geofence-lab.db` e sobrevive a fechar o app, reiniciar o
aparelho e atualizar a versão — é persistência local de verdade, mais forte que `localStorage` ou
`AsyncStorage`, que só guardam pares chave-valor sem transação nem consulta.

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
| Gravar a empresa antes de ligar o monitoramento | permissão negada é uma falha legítima e não pode desfazer um cadastro que o usuário já concluiu |
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

O banco é criado na primeira abertura, vazio. O onboarding leva ao cadastro da primeira empresa.

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
export ANDROID_HOME="$HOME/Library/Android/sdk"   # ajuste ao seu caminho
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# android/app/build/outputs/apk/release/app-release.apk
```

O `-PreactNativeArchitectures=arm64-v8a` importa: sem ele o Gradle empacota as quatro
arquiteturas no mesmo APK e o arquivo passa de 120 MB. Restrito ao arm64 — que é o que todo
aparelho Android real usa desde cerca de 2017 — ele fica em torno de 47 MB. Para rodar num
emulador x86, troque para `x86_64` ou omita o flag.

O perfil `release` é assinado com a keystore de depuração que o próprio template do Expo gera,
então o APK instala direto, sem nenhum cadastro. Para publicação de verdade seria preciso uma
keystore própria — mas não é o caso aqui.

---

## Como testar a detecção

### Sem sair do lugar — o simulador

**Monitor → Abrir simulador**, ou **Ajustes → Simulador de rota**.

Ele injeta uma rota sintética no mesmo pipeline que o GPS alimenta: mesma máquina de estados,
mesma deduplicação, mesmas notificações. Não é um mock do resultado — é o caminho real, com uma
fonte de posições diferente.

1. Escolha a empresa que você cadastrou.
2. Escolha "Atravessar" e toque em *Executar rota*.
3. Acompanhe a aba **Eventos**: devem aparecer, em ordem, entrada na empresa, entrada num cômodo,
   saída do cômodo, entrada no seguinte, saída dele e saída da empresa.

Experimente também mudar a acurácia simulada para ±120 m: as leituras passam a ser descartadas e
nenhum evento é gerado, que é o comportamento correto.

As posições são datadas para trás a partir de agora, então o monitoramento real pode ser retomado
logo em seguida sem esperar nada.

### No campo

1. **Empresas → Cadastrar empresa**, ou conclua o onboarding.
2. Dê um nome e marque os cantos do perímetro arrastando o mapa sob o pino.
3. Adicione um ou mais cômodos, com nome.
4. **Monitor → Iniciar monitoramento**.
5. Saia, afaste-se do perímetro, volte. As notificações chegam com o app fechado.

### O que foi medido, e em quê

Background não é coisa para afirmar sem medir. O que segue foi observado no **simulador de iOS
18.6 (iPhone 16 Pro)**, movendo a posição com `xcrun simctl location` e lendo os eventos direto do
banco, sem abrir o app:

| Situação | Resultado |
|---|---|
| App em primeiro plano | entra e sai da empresa e dos cômodos |
| **App em segundo plano** (Safari à frente) | `company_enter` pela região nativa, depois `room_enter` pelo GPS contínuo — a escalada de camada aconteceu sozinha |
| **App encerrado** (`simctl terminate`, processo confirmado morto) | o iOS **relançou o app por conta própria** ao cruzar a região, e os dois eventos foram gravados e notificados |
| Saída | `company_exit` e `room_exit` ao se afastar |

A sequência registrada no encerramento foi exatamente a projetada: evento de região nativa →
`precise updates started` → `company_enter` → `room_enter`.

**O que não foi medido:** nada disso foi verificado em **aparelho físico** nem no **Android**. O
simulador exercita o caminho real do CoreLocation, mas não reproduz orçamento de execução em
background, estado de bateria nem os gerenciadores de fabricante. E o Android é documentadamente
diferente: um app finalizado **não** é relançado por evento de geofence, o que é justamente o que
o serviço em primeiro plano existe para mitigar. A tabela de limitações abaixo continua valendo
como o que se espera, não como o que se mediu.

### Recuperação ao subir

Havia uma lacuna aqui: nada re-armava o monitoramento quando o app iniciava. No iOS as regiões
sobrevivem ao encerramento — é por isso que o caso acima funciona —, mas se a plataforma as
descartasse (reinstalação, reboot no Android, despejo pelo sistema), o app continuaria dizendo
"monitorando" com nada registrado.

Agora, ao subir e a cada volta ao primeiro plano, `resumeMonitoringIfNeeded` compara a própria
flag com `hasStartedGeofencingAsync` — a resposta da plataforma, não a nossa — e re-registra a
janela quando elas divergem. Se a permissão tiver sido revogada nesse meio-tempo, ele desarma em
vez de fingir que está ativo.

### Com o app fechado

Minimize, aguarde, e depois arraste o app para fora dos recentes. No Android o serviço em
primeiro plano continua na maioria dos aparelhos; no iOS o sistema relança o app ao cruzar uma
região. **Ajustes → Diagnóstico** mostra o log gravado durante o período — é assim que o
comportamento descrito acima foi observado, e não suposto.

---

## Testes automatizados

```bash
npm test          # 165 testes
npm run verify    # typecheck + verificação de i18n + testes
```

O alvo são as funções puras, que é onde mora a lógica que o enunciado avalia:

| Arquivo | O que cobre |
|---|---|
| `core/geo/haversine.test.ts` | distâncias conhecidas, antimeridiano, polos, simetria |
| `core/geo/polygon.test.ts` | dentro/fora, vértice, aresta, polígono côncavo, prefiltro, distância à borda, contenção, área |
| `core/geo/spatialIndex.test.ts` | k-vizinhos idêntico à força bruta em 520 pontos, várias células |
| `geofencing/transitionEngine.test.ts` | histerese circular e por polígono, banda morta, margem de confiança, debounce, dedup, cômodos exclusivos |
| `geofencing/regionReconciler.test.ts` | teto de 20 e de 100, raio da sentinela, estabilidade do conjunto |
| `geofencing/routeSimulator.test.ts` | geometria e datação das rotas sintéticas |
| `geofencing/pipeline.test.ts` | ponta a ponta sobre o fixture de 520 locais |
| `messaging/sequencePlanner.test.ts` | ordem, horário fixo, janela, retomada após lacuna, reconciliação |
| `messaging/receiptSender.test.ts` | backoff exponencial e esgotamento |

O teste de pipeline é o que amarra tudo: percorre uma empresa do fixture de 520 locais e verifica
que a sequência de eventos é exatamente a que uma caminhada real produziria — entrada na empresa,
entrada no primeiro cômodo, saída dele, entrada no seguinte, saída dele, saída da empresa —, cada
um exatamente uma vez.

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
        companyRepository.ts          CRUD + índice espacial
        eventRepository.ts            log idempotente
        stateRepository.ts            presença persistida
        notifier.ts                   notificação por transição
      components/CrosshairMap.tsx     mapa com pino fixo, usado no desenho
      tasks/                          TaskManager.defineTask
      screens/                        Monitor · Empresas · Wizard · Editor · Eventos · Simulador
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
src/__fixtures__/companies.json       520 locais para os testes de escala (não vai para o app)
scripts/
  gen-seed.mjs                        gera o fixture (determinístico)
  check-i18n.mjs                      garante que nenhuma chave de tradução falte
```

Toda tela é o trio `index.tsx` (container) + `<X>View.tsx` (interface pura) +
`use<X>ViewModel.ts` (estado, efeitos e handlers). Arquivos em `app/` são apenas re-exports.

---

## O que ficou de fora

- **Receiver de `BOOT_COMPLETED` no Android.** A permissão está declarada, mas retomar o
  monitoramento após reiniciar exigiria um config plugin com código nativo. Está documentado como
  limitação em vez de meio implementado.
- **Edição de vértices de um polígono já salvo.** Dá para desenhar de novo e excluir; arrastar um
  vértice existente exigiria marcadores arrastáveis e um modo de edição próprio.
- **Dados de demonstração no app.** O conjunto de 520 locais existe apenas como fixture de teste.
  Um botão para carregá-lo no app seria fácil de adicionar, mas polui a lista de quem só quer ver
  as próprias empresas.
- **Sincronização com servidor.** O enunciado pede persistência local e proíbe serviços pagos.
  A única saída de rede é a confirmação de entrega, e mesmo ela é opcional.
- **Modo claro.** A interface é escura, herdada dos tokens de tema do template.
