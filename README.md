# Geofence Lab

App Expo que avisa quando você **entra e sai** de empresas e dos cômodos dentro delas, mesmo em
background, e **entrega uma sequência de mensagens** por notificação local com confirmação de
entrega. Sem backend, sem conta — tudo mora no aparelho.

---

## Instalando

O APK acompanha a entrega (44 MB, não versionado). Se você só tem o código, `npm run apk` gera
um em dois minutos.

```bash
adb install geofence-lab.apk
```

Traz `arm64-v8a` e `x86_64`, então roda em aparelho e em emulador. É assinado com chave de
debug — normal para sideload, só não serviria para publicar na Play.

## Usando pela primeira vez

**Onboarding (5 telas).** Dá para pular tudo, menos vale parar na terceira: o Android pede
localização em duas etapas, e é preciso escolher **"Permitir o tempo todo"**. Sem isso a
detecção só funciona com o app aberto.

**Cadastrar uma empresa.** Nome → perímetro → cômodos. No perímetro o pino fica parado no centro
da tela e quem se move é o mapa: leve um canto para baixo da mira e toque em "Adicionar ponto"
(mínimo 3). Os cômodos são desenhados igual, por dentro do contorno azul. Raio e raio ativo saem
do desenho — você não digita.

**Ligar.** Aba Monitor → "Iniciar monitoramento". Daí pode fechar o app, inclusive tirar dos
recentes. Ao entrar numa empresa aparece uma notificação fixa: é exigência do Android para
manter GPS em background.

**Ver funcionar sem sair do lugar.** O link *Simulador*, no rodapé do Monitor, injeta posições
sintéticas pelo mesmo caminho do GPS real. Pare o monitoramento real antes.

**Mensagens.** Aba Mensagens → "Simular cadastro". A primeira chega em 2 minutos, na bandeja,
com "Mensagem 1 de 5" no subtítulo.

## As telas

| Tela | O que faz |
| --- | --- |
| **Monitor** | Mapa com sua posição e as empresas — círculo cheio é o raio de entrada, o anel é o raio ativo, polígono laranja é um cômodo; verde quando você está dentro. Cabeçalho com o estado, botão de ligar/desligar e links para Histórico e Simulador. |
| **Empresas** | Lista por distância, com busca. O interruptor tira do monitoramento sem apagar. Tocar abre o editor; "Cadastrar empresa" abre o assistente. |
| **Editor** | Renomear, ver raios e vértices, redesenhar o perímetro, gerenciar cômodos, excluir. Recusa perímetro novo que deixe algum cômodo de fora. |
| **Mensagens** | Quantas agendadas, entregues, quando cai a próxima, e o plano inteiro com o subtítulo de cada uma. Embaixo, a fila de confirmações — é onde o comportamento offline aparece. |
| **Ajustes** | Estado das permissões, endpoint de confirmação, versão e "Apagar tudo e recomeçar". |
| **Simulador** | Escolhe empresa, trajeto e acurácia simulada. Em ±120 m nada acontece de propósito: a leitura é pior que o teto e é descartada. |
| **Histórico** | *Eventos* lista entradas e saídas, exportáveis em JSONL. *Sistema* é o log interno e o painel de diagnóstico — para onde olhar quando algo não acontece. |

---

## Como funciona

### Detecção

Duas camadas. **Regiões nativas** (`expo-location`) são a campainha: em repouso o app não pede
posição nenhuma, quem espera é o rádio do aparelho. O iOS monitora 20 regiões e o Android 100,
então o app registra as mais próximas e guarda uma vaga para uma **região sentinela** — sair
dela quer dizer que a lista ficou velha. O **GPS contínuo** só liga quando você entra no raio
ativo, para resolver em qual cômodo você está, e desliga ao sair.

Entrar exige `distância ≤ radius`, sair exige `distância > activeRadius`; a folga entre os dois
evita notificação repetida parado na porta. Leitura com erro acima de 100 m é descartada, e uma
transição só é confirmada depois de duas leituras concordando. Cada evento carrega uma chave
única (`empresa:3:entrada`) com índice `UNIQUE`, então nada é registrado duas vezes.

### Mensagens

5 de boas-vindas em 2, 5, 12, 25 e 45 minutos; no dia seguinte começa a diária — 4 semanas, 7 por
semana, às 9h, com `Semana X; Mensagem Y de Z` no subtítulo.

O app não encadeia agendamentos: deriva o plano inteiro do instante do cadastro e agenda o que
falta. O identificador da notificação é a chave do slot, então reagendar substitui a pendente em
vez de somar outra — daí vem a garantia de não duplicar, e por isso não existe cancelamento.

Offline, o plano é local e cada entrega gera uma confirmação em fila. Sem rede a fila segura sem
gastar tentativa; com rede vai para o endpoint, e falha volta com espera dobrando de 30 s até o
teto de 4 h, indefinidamente.

---

## Rodando do código

Node 20+ e uma chave da **Maps SDK for Android**.

```bash
cp .env.example .env     # EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
npx expo run:android     # ou run:ios

npm run apk              # APK de release
npm run verify           # typecheck + i18n
npm run lint
```

Use `npm run apk` em vez do `gradlew` direto: a task que empacota o JavaScript às vezes se marca
como atualizada quando ele mudou de verdade (mexer no `.env` é um caso), e o APK sai com código
velho dentro sem avisar. O script apaga a saída do bundle antes.

**Chave do Google Maps.** No Android o `react-native-maps` só renderiza pelo Google Maps, então a
chave é obrigatória; no iOS o MapKit não pede nada. Restrinja por nome de pacote
(`com.brenonascimento.geofencelab`) e SHA-1 — variáveis `EXPO_PUBLIC_*` ficam embutidas no APK e
são extraíveis. Sem a chave o app não quebra, mas some o mapa — e sem mapa não há como desenhar
um perímetro, ou seja, não há como cadastrar empresa.

**Endpoint de entrega.** Em *Ajustes → Confirmação de entrega*, cole uma URL de
[webhook.site](https://webhook.site) e salve. Cada entrega vira um POST com o id da mensagem, o
subtítulo, o instante e um cabeçalho `Idempotency-Key`. Vazio volta para
`EXPO_PUBLIC_DELIVERY_ENDPOINT`; sem endpoint a fila continua sendo gravada.

---

## Decisões

**Pino fixo em vez de tocar no mapa** — tocar erra por dedo e não dá para corrigir sem apagar o
ponto. É o gesto que apps de entrega usam para a mesma tarefa.

**Raios derivados do desenho** — pedir os dois ao usuário abre espaço para `activeRadius < radius`,
e aí existe uma faixa onde o app quer entrar e sair ao mesmo tempo. O banco recusa a combinação.

**Polígono para cômodos** — círculo nativo não funciona nessa escala. Marcar os cantos fora de
ordem produz um contorno em laço, que faz a regra de ponto-em-polígono tratar parte da área como
externa; o app detecta o cruzamento, bloqueia e oferece desembaraçar.

**SQLite, não armazenamento leve** — tudo que as tarefas de background tocam precisa de transação:
estado novo e evento são gravados juntos, ou nenhum dos dois.

**Tarefas e handler de notificação no `index.ts`**, antes do `expo-router/entry`. O Metro põe cada
rota atrás de um getter que só é acessado quando a tela renderiza — e quando o sistema sobe o
processo só para entregar um evento, nada renderiza. Registrar a partir de uma tela significa não
registrar.

**Margem de acurácia** — entrada só é declarada se o círculo de erro do GPS couber no raio,
limitado a metade dele. Desvio deliberado da regra literal, para não anunciar entrada com base
numa leitura que não prova nada.

---

## Limitações

**iOS** — 20 regiões; raio mínimo efetivo ~100 m; ~10 s de execução por acordada; 64 notificações
locais pendentes; a permissão "o tempo todo" só é oferecida depois de um tempo de uso.

**Android** — 100 geofences; desde o Android 8 a localização em background exige serviço em
primeiro plano, daí a notificação fixa; gerenciadores de bateria de alguns fabricantes encerram o
serviço mesmo assim.

**O serviço em primeiro plano não sobrevive à morte do processo**, mas o registro da tarefa fica
gravado e `hasStartedLocationUpdatesAsync` continua dizendo que está ligada — sem tratar isso o
app nunca mais sobe o serviço. Ele descarta o registro órfão no primeiro sync de cada processo, e
uma tarefa periódica faz o mesmo com o app fechado. O Android 12+ proíbe iniciar serviço em
primeiro plano vindo do background, então essa tentativa costuma ser recusada: o app segue nas
regiões nativas, que detectam empresa, e o GPS contínuo volta na travessia seguinte ou ao abrir.

**Instalar o APK por cima do app rodando** deixa o processo antigo com um contexto morto dentro do
`expo-task-manager`, e toda chamada de tarefa passa a falhar com `NullPointerException`. O app
captura, não entra em estado falso e avisa na tela; fechar e abrir resolve. Numa atualização de
loja o sistema encerra o processo antes.

**Subtítulo** cai em campos diferentes: `subtitle` no iOS, `subText` no Android.

---

## O que foi medido

**Em aparelho Android físico**, com o APK de release: fechando o app pelos recentes e encerrando
o processo, o monitoramento continuou e as notificações de entrada e saída chegaram.

No emulador com Play Services, também em release:

- Em segundo plano: entradas e saídas de empresa e de cômodo, com notificação, sem abrir a tela.
- Processo morto: a tarefa periódica acordou o app do zero, reconciliou o agendamento e enviou a
  confirmação de entrega.
- Modo avião com o processo encerrado: a mensagem chegou na bandeja com `Mensagem 1 de 5` no
  subtítulo; a confirmação ficou na fila sem gastar tentativa e saiu na primeira ao religar.
- Serviço em primeiro plano derrubado: ao reabrir, o registro órfão é descartado e o serviço sobe
  de novo, uma vez só.
- Layout com barra de 3 botões e com gestos: nenhum controle sob a barra do sistema.

A transição de geofence com o processo morto não é observável no emulador — o GPS simulado só
avança enquanto algum app mantém um pedido de localização ativo — por isso foi verificada no
aparelho. **Não foi medido:** nada no iOS além de compilar e rodar.

---

## Estrutura

```
index.ts                  registra tarefas e handler de notificação antes do router
app/                      rotas (cada arquivo é um re-export de uma linha)
src/
  core/                   banco, geometria, permissões, log
  domains/                geofencing · messaging · onboarding · settings
  components/ lib/ i18n/ theme/ config/
```

Cada tela é um trio: `index.tsx` monta, `View.tsx` desenha, `ViewModel.ts` decide. A lógica de
decisão fica em funções puras, sem I/O: histerese e deduplicação, janela de regiões, plano de
mensagens e geometria de polígono.

**Fora do escopo:** arrastar vértices depois de desenhar, sincronização com servidor, modo claro,
e verificação no iOS em aparelho.
