process.env.TZ = 'America/Sao_Paulo';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    getAllSync: () => [],
    getFirstSync: () => null,
    withTransactionSync: (work: () => void) => work(),
  }),
}));
