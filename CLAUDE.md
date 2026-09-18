# Geofence Lab — guia de arquitetura

> Código e comentários em **inglês**. Documentação em **português**.

Cadastro de empresas com perímetro e cômodos desenhados no mapa, monitorados em background,
mais entrega sequenciada de notificações locais. Sem backend, sem autenticação, sem monetização:
todo o estado vive no aparelho. A explicação completa das decisões está no [README.md](README.md).

## Stack

Expo SDK 54 · React Native 0.81 · TypeScript strict · Expo Router v6 ·
`expo-location` + `expo-task-manager` (regiões e posições) · `expo-notifications` ·
`expo-sqlite` (persistência) · `expo-background-task` (reconciliação periódica) ·
`react-native-maps` · React Query (cache da interface).

## Onde mora o quê

```
app/                  rotas — re-exports de uma linha, sem lógica
index.ts              entry do pacote: registra as tarefas antes do expo-router
src/core/             db · geo (haversine, polígono, índice) · permissões · logger
src/domains/
  geofencing/         empresas, cômodos e o monitoramento em background
  messaging/          sequências de notificações locais
  settings/ onboarding/
src/components/       atoms · molecules · organisms · templates
```

## Regras

1. **Imports sempre `@src/`** — nunca `../../`.
2. **Toda tela é um trio**: `index.tsx` (container, export nomeado) + `<X>View.tsx`
   (interface pura, recebe `viewModel` por prop) + `use<X>ViewModel.ts` (estado, efeitos,
   handlers, com interface tipada exportada).
3. **Rotas em `app/` são re-exports de uma linha.** Nenhuma lógica ali.
4. **Cores, espaçamentos e tipografia vêm de `@src/theme`.** Nunca hex solto.
5. **Todo texto visível passa por `useTranslation()`**, incluindo o conteúdo das mensagens
   sequenciadas (`messages.content.<id>`) e o que sai de fora do React — notificações e serviço
   em primeiro plano usam `i18n.t` direto. O app tem um idioma só (pt-BR).
   `node scripts/check-i18n.mjs` verifica chave usada sem tradução e tradução sem uso; chave
   montada por template precisa entrar em `DYNAMIC_KEYS`. `count` é o parâmetro de pluralização
   do i18next: use-o quando a frase flexiona (`_one`/`_other`) e `total` quando for só um número.
6. `React.JSX.Element`, nunca `JSX.Element`. `StyleSheet.create({})` ao final do arquivo.

## O que exige cuidado

- **`TaskManager.defineTask` é registrado pelo `index.ts` da raiz**, que é o `main` do pacote
  e importa os dois módulos de tarefas antes de `expo-router/entry`. Não basta importar a
  partir de `app/_layout.tsx`: o Metro põe cada rota atrás de um getter
  (`get: () => require(...)`) no módulo de `require.context`, e esse getter só é acessado
  quando o expo-router renderiza. O sistema sobe o processo sem montar árvore React nenhuma
  para entregar um evento de região, e aí o TaskManager não acha a tarefa e a **desregistra**.
- **Todo estado vive em SQLite**, inclusive o sinalizador de onboarding. As tarefas de
  background precisam de transação: estado novo e evento gravados juntos, ou nenhum dos dois.
- **A lógica de decisão é pura e fica em `services/`**: `transitionEngine`, `regionReconciler`,
  `sequencePlanner`, `routeSimulator`. Sem I/O, sem React. É onde estão os testes, e é onde
  mudanças precisam de teste novo.
- **`activeRadius >= radius` é invariante imposto pelo repositório**, que lança em vez de
  gravar. A folga entre os dois é a banda morta que impede eventos repetidos na borda. Numa
  empresa os dois são derivados do polígono — não peça ao usuário.
- **Entrada numa empresa é decidida pelo polígono, não pelo círculo.** O círculo só existe para
  registrar a região nativa e acordar o app. Um local sem polígono cai na regra circular do
  enunciado, e essa via continua testada.
- **`hasStartedLocationUpdatesAsync` responde pelo registro gravado, não pelo serviço.** Se o
  processo morrer com o tier 2 ligado, o registro sobrevive e o serviço não — tratar a resposta
  como "está rodando" trava o app fora do GPS contínuo para sempre. Quem manda dentro do processo
  é o sinalizador `preciseRunning` do `monitorService`, reivindicado antes do `await` para que
  chamadas concorrentes não subam o serviço várias vezes.
- **Ao mudar conteúdo ou timing das mensagens**, não agende direto — mexa no plano e deixe o
  `scheduler` reconciliar. O identificador da notificação é a chave do slot, e o SO usa isso
  para recusar duplicatas.

## Verificação

```bash
npm run verify    # typecheck + check:i18n + jest (19 testes)
npm run seed      # regenera src/__fixtures__/companies.json (fixture de teste)
```
