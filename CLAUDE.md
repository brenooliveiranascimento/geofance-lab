# Geofence Lab — guia de arquitetura

> Código e comentários em **inglês**. Documentação em **português**.

Cadastro de empresas com perímetro e cômodos desenhados no mapa, monitorados em background,
mais entrega sequenciada de notificações locais. Sem backend, sem autenticação, sem monetização:
todo o estado vive no aparelho. A explicação completa das decisões está no [README.md](README.md).

## Stack

Expo SDK 54 · React Native 0.81 · TypeScript strict · Expo Router v6 ·
`expo-location` + `expo-task-manager` (regiões e posições) · `expo-notifications` ·
`expo-sqlite` (persistência) · `expo-background-task` (reconciliação periódica) ·
`react-native-maps` · React Query (cache da interface) · Zustand + MMKV (preferências).

## Onde mora o quê

```
app/                  rotas — re-exports de uma linha, sem lógica
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
5. **Todo texto visível passa por `useTranslation()`**, com a chave nos dois locales.
   `node scripts/check-i18n.mjs` verifica isso; `count` é reservado pelo i18next para
   pluralização, então placeholders numéricos usam `total`, `regions`, `vertices`.
6. `React.JSX.Element`, nunca `JSX.Element`. `StyleSheet.create({})` ao final do arquivo.

## O que exige cuidado

- **`TaskManager.defineTask` tem que ficar em escopo de módulo**, importado no topo de
  `app/_layout.tsx`. O sistema pode subir o processo só para entregar um evento de região,
  sem montar árvore React nenhuma. Registrar de dentro de um componente quebra exatamente o
  caso que o código existe para atender.
- **Nada de MMKV no caminho das tarefas de background.** SQLite, porque precisa de transação:
  estado novo e evento gravados juntos ou nenhum dos dois.
- **A lógica de decisão é pura e fica em `services/`**: `transitionEngine`, `regionReconciler`,
  `sequencePlanner`, `routeSimulator`. Sem I/O, sem React. É onde estão os testes, e é onde
  mudanças precisam de teste novo.
- **Ao mexer em raio/raio ativo**, lembre que `activeRadius >= radius` é invariante: a folga
  entre os dois é a banda morta que impede eventos repetidos na borda. Numa empresa os dois são
  derivados do polígono — não peça ao usuário.
- **Entrada numa empresa é decidida pelo polígono, não pelo círculo.** O círculo só existe para
  registrar a região nativa e acordar o app. Um local sem polígono cai na regra circular do
  enunciado, e essa via continua testada.
- **Ao mudar conteúdo ou timing das mensagens**, não agende direto — mexa no plano e deixe o
  `scheduler` reconciliar. O identificador da notificação é a chave do slot, e o SO usa isso
  para recusar duplicatas.

## Verificação

```bash
npm run verify    # typecheck + check:i18n + jest (165 testes)
npm run seed      # regenera src/__fixtures__/companies.json (fixture de teste)
```
