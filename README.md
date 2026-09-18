# Geofence Lab

App Expo que faz duas coisas: avisa quando você **entra e sai** de empresas e dos cômodos
dentro delas, mesmo em background, e **entrega uma sequência de mensagens** por notificação
local com confirmação de entrega.

Sem backend, sem conta, sem serviço pago — tudo mora no aparelho.

---

## Começando

### Instalar

O APK acompanha a entrega; ele não fica versionado no repositório, porque são 62 MB. Se você só
tem o código em mãos, [gere um](#gerando-o-apk) — leva menos de dois minutos.

Com o aparelho no cabo:

```bash
adb install geofence-lab.apk
```

Ou copie o arquivo para o celular e abra: o Android vai pedir para liberar instalação de fonte
desconhecida. Ele é assinado com chave de debug, que é o normal para um build que vai por
sideload — roda igual, só não serviria para publicar na Play.

O pacote traz `arm64-v8a` e `x86_64`, então instala tanto em aparelho quanto em emulador. Para
rodar direto do código em vez de instalar, veja [Rodando](#rodando).

### Na primeira abertura

São cinco telas e dá para pular qualquer uma com "Agora não", mas vale parar na terceira.

1. **Boas-vindas** — o que o app faz.
2. **Como funciona** — as duas camadas de detecção, em três linhas.
3. **Localização** — o Android pede o acesso em duas etapas: primeiro o comum, e só depois o "o
   tempo todo", que abre uma tela de ajustes do sistema. É preciso escolher **"Permitir o tempo
   todo"** — sem isso a detecção só funciona com o app aberto. A tela mostra o estado das duas
   para você conferir antes de seguir.
4. **Notificações** — um toque. É o que faz as mensagens e os avisos de entrada e saída
   aparecerem na bandeja.
5. **Cadastrar empresa** — leva direto para o cadastro, ou "Cadastrar depois".

### Cadastrar a primeira empresa

Três passos.

**Nome.** É o que aparece na notificação. "Matriz São Paulo", "Casa", o que fizer sentido.

**Perímetro.** Aqui o app foge do usual: em vez de arrastar um pino pelo mapa, o pino fica
parado no centro da tela e quem se move é o mapa. Você leva um canto da empresa para baixo da
mira e toca em "Adicionar ponto". Repete para cada canto — três é o mínimo, quatro costumam
bastar. O contador embaixo mostra quantos pontos e quantos m² o desenho já tem, e "Desfazer"
tira o último.

**Cômodos.** Cada área de dentro vira um polígono com nome, desenhado do mesmo jeito. O contorno
azul da empresa continua visível para guiar, porque o cômodo precisa caber dentro dele. Dá para
concluir sem nenhum e adicionar depois.

Raio e raio ativo você não digita: os dois saem do desenho.

### Ligar o monitoramento

Na aba Monitor, "Iniciar monitoramento". O cabeçalho passa a "Monitorando" e diz quantas regiões
o sistema aceitou registrar. A partir daí pode fechar o app, inclusive tirar dos recentes.

Quando você entra numa empresa o cabeçalho vira "Você está dentro", o GPS contínuo liga e aparece
uma notificação fixa avisando que o app está monitorando os cômodos. Ela some quando você sai.
É exigência do Android: sem serviço em primeiro plano o sistema estrangula a localização em
background.

### Ver funcionar sem sair do lugar

No rodapé do Monitor há dois links, Histórico e Simulador.

O **Simulador** percorre uma rota sintética pelo mesmo caminho que as posições reais do GPS
percorrem — mesma máquina de estados, mesma gravação, mesmas notificações. Escolha a empresa, se
o trajeto atravessa ou só chega e fica, e a acurácia simulada. Em ±120 m nada acontece de
propósito: a leitura é pior que o teto de acurácia e é descartada antes de virar evento.

Pare o monitoramento real antes de rodar — o próprio simulador avisa. Senão as duas fontes
disputam a mesma máquina de estados.

### A sequência de mensagens

Na aba Mensagens, "Simular cadastro". Isso grava o instante do cadastro, e é dele que o plano
inteiro deriva: cinco mensagens de boas-vindas em 2, 5, 12, 25 e 45 minutos e, no dia seguinte,
o início da diária — 4 semanas, 7 por semana, uma por dia às 9h.

A primeira chega em dois minutos. Feche o app e espere: ela aparece na bandeja com "Mensagem 1
de 5" no subtítulo. Nas diárias o subtítulo é "Semana 3; Mensagem 2 de 7".

Para ver a confirmação de entrega saindo, configure o endpoint antes — está em
[Configurando](#configurando).

---

## As telas

### Monitor

O mapa com a sua posição e as empresas em volta. O círculo cheio é o raio de entrada, o anel de
fora é o raio ativo, o polígono laranja é um cômodo; verde quando você está dentro, azul quando
não. O botão no canto inferior direito reenquadra no seu ponto.

O cabeçalho é o estado em uma linha — "Parado", "Monitorando · 100 regiões no sistema · GPS em
repouso", "Você está dentro" — e logo abaixo vem o último evento registrado. Embaixo, o botão de
ligar e desligar, com os links para Histórico e Simulador.

### Empresas

A lista ordenada por distância de onde você está, com busca por nome. Cada linha traz os raios,
quantos cômodos tem e a que distância fica. O interruptor desliga uma empresa sem apagá-la: ela
sai do monitoramento e volta quando você quiser. Tocar na linha abre o editor.

"Cadastrar empresa" abre o assistente de três passos descrito lá em cima. O mesmo botão aparece
no Monitor enquanto não houver nenhuma empresa.

### Editor da empresa

Renomear, ver os raios derivados e a contagem de vértices, redesenhar o perímetro, adicionar e
remover cômodos, excluir a empresa. Redesenhar o perímetro exige que os cômodos continuem
cabendo dentro do novo contorno — o app recusa e explica se algum ficar de fora.

### Mensagens

Antes do cadastro há só o botão. Depois: quantas mensagens estão agendadas, quantas foram
entregues, o total do plano, quando cai a próxima, e a sequência inteira listada com o subtítulo
e o estado de cada uma.

Mais abaixo fica a fila de confirmações — quantas estão na fila, quantas foram confirmadas, e as
últimas com a chave de idempotência e o número de tentativas. É onde o comportamento offline
aparece: a fila segura sem gastar tentativa e esvazia sozinha quando a rede volta.

"Reconciliar agora" força o que o app faz sozinho em background. "Apagar sequência" zera tudo.

### Ajustes

O estado das três permissões, com atalhos para pedi-las ou abrir os ajustes do sistema; o
endpoint de confirmação de entrega; a versão; e "Apagar tudo e recomeçar", que limpa empresas,
cômodos, eventos e a sequência e devolve para o onboarding.

### Simulador

Escolhe uma empresa, o trajeto e a acurácia, e injeta posições sintéticas pelo mesmo caminho do
GPS real. Serve para conferir a detecção sem sair do lugar — e para ver o teto de acurácia
trabalhando, já que em ±120 m nenhum evento sai. As posições são datadas para trás, então o
monitoramento real pode seguir logo depois sem confusão de horário.

### Histórico

Duas abas. **Eventos** lista entradas e saídas, filtrável por empresa ou cômodo, com "Copiar"
exportando em JSONL. **Sistema** é o log interno mais um painel de diagnóstico: se o
monitoramento está ativo, quantas regiões o sistema aceitou, e quais das quatro tarefas de
background estão registradas. É para onde olhar quando alguma coisa não acontece.

---

## Como funciona

Até aqui foi o que se vê. Desta seção em diante é o porquê — o que acontece por baixo e por que
foi feito assim.

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

### Sequência e entrega

Depois do cadastro chegam 5 mensagens de boas-vindas em 2, 5, 12, 25 e 45 minutos. Um dia
depois começa a sequência diária: 4 semanas, 7 mensagens por semana, uma por dia às 9h, com
`Semana X; Mensagem Y de Z` no subtítulo da notificação.

O app não encadeia agendamentos: ele deriva o plano inteiro do instante do cadastro e compara
com o que o sistema já tem, agendando o que falta. O identificador da notificação é a chave do
slot, então reagendar substitui a pendente em vez de somar outra — é daí que vem a garantia de
não duplicar, e é por isso que não existe caminho de cancelamento.

Funciona offline: o plano é local e cada entrega gera uma confirmação que fica numa fila. Sem
rede a fila segura sem gastar tentativa; com rede ela é enviada ao endpoint, e uma falha volta
com espera dobrando a partir de 30 s até o teto de 4 h, indefinidamente. Um slot tem dois
estados, agendado e entregue; um recibo, pendente e confirmado.

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

O pacote leva `arm64-v8a` (todo aparelho Android atual) e `x86_64` (emulador em máquina Intel).
Deixar as quatro ABIs dobraria o tamanho sem atender nenhum aparelho a mais.

### Verificando

```bash
npm run verify     # typecheck + i18n
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

Em **Ajustes → Confirmação de entrega**, cole uma URL e salve. Gere uma em
[webhook.site](https://webhook.site) para acompanhar as requisições chegando no navegador — a
aba Mensagens mostra a fila esvaziando.

Cada mensagem entregue gera um POST com o identificador da mensagem, o subtítulo, o instante da
entrega e um cabeçalho `Idempotency-Key`. Campo vazio volta para o valor de
`EXPO_PUBLIC_DELIVERY_ENDPOINT`, e sem endpoint nenhum as confirmações continuam sendo gravadas
na fila.

### Permissões

O app pede localização em duas etapas, porque os dois sistemas exigem assim: primeiro o acesso
comum, depois o "o tempo todo". No Android o segundo abre uma tela de ajustes. Sem o acesso "o
tempo todo" não há monitoramento em background.

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

**O serviço em primeiro plano não sobrevive à morte do processo.** Quando o Android recupera o
processo enquanto você está dentro de uma empresa, o serviço morre junto e a notificação
persistente some — mas o registro da tarefa fica gravado, e `hasStartedLocationUpdatesAsync`
continua respondendo que ela está ligada. Sem tratar isso, o app nunca mais sobe o serviço. No
primeiro sync de tier de cada processo ele derruba o registro órfão e começa um serviço novo, e
uma tarefa periódica faz a mesma reconciliação com o app fechado. O Android 12+ proíbe iniciar
serviço em primeiro plano a partir do background, então essa tentativa costuma ser recusada: o
app registra `precise updates unavailable, staying on native regions` e segue nas regiões
nativas, que são o que detecta entrada e saída de empresa. O GPS contínuo — e com ele a detecção
de cômodo — volta na travessia de região seguinte ou quando o app é aberto.

**Ambos** — o subtítulo cai em campos diferentes (`subtitle` no iOS, `subText` no Android), e no
Android a posição exata depende do fabricante.

**Instalar o APK por cima do app rodando** deixa o processo antigo com um contexto morto dentro
do `expo-task-manager` — ele guarda o contexto em `WeakReference`, e a partir daí toda chamada de
tarefa falha com `NullPointerException` em `SharedPreferences.getAll()`. O app trata: a exceção é
capturada, o monitoramento não entra num estado falso e a tela avisa "O sistema recusou registrar
as regiões. Veja Histórico → Sistema.", com a causa nativa completa no log. Fechar o app e abrir
de novo resolve. Só acontece ao instalar por cima na mão; numa atualização de loja o sistema
encerra o processo antes.

---

## O que foi medido

**Em aparelho Android físico**, com o APK de release: fechando o app pelos recentes e
encerrando o processo, o monitoramento continuou e as notificações de entrada e saída chegaram.
É o cenário que o enunciado cobra e o que a arquitetura existe para atender.

No emulador Android com Google Play Services, também com o APK de release:

- App aberto e em segundo plano: entradas e saídas de empresa e de cômodo, com notificação, sem
  abrir a tela.
- Com o processo morto: a tarefa periódica acordou o app do zero, reconciliou o agendamento e
  enviou a confirmação de entrega.
- Em modo avião e com o processo encerrado: a mensagem agendada chegou na bandeja do sistema
  com `Mensagem 1 de 5` no subtítulo, a confirmação ficou na fila sem gastar tentativa, e ao
  religar a rede foi confirmada na primeira tentativa.
- Layout com a barra de navegação de 3 botões e com navegação por gestos: nenhum controle fica
  sob a barra do sistema nas duas configurações.
- Serviço em primeiro plano derrubado com o app fechado: ao reabrir, o registro órfão é
  descartado e o serviço sobe de novo, uma vez só — a notificação persistente volta.
- Processo acordado do zero pela tarefa periódica e então aberto pelo usuário: monitoramento
  inicia normalmente, serviço em primeiro plano e detecção de cômodo inclusos.

Uma observação sobre o emulador: a transição de geofence com o processo morto não é observável
nele, porque o GPS simulado só avança enquanto algum aplicativo mantém um pedido de localização
ativo. Por isso a verificação desse caminho foi feita no aparelho.

**O que não foi medido.** Nada disso foi verificado no iOS além de compilar e rodar.

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
de decisão fica em funções puras, sem I/O: histerese e deduplicação, seleção da janela de
regiões, plano de mensagens e geometria de polígono.

---

## O que ficou de fora

Arrastar vértices depois de desenhar, sincronização com servidor, modo claro, e verificação em
aparelho físico.
