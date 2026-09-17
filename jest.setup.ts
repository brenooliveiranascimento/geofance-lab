process.env.TZ = 'America/Sao_Paulo';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(() => ({ changes: 0, lastInsertRowId: 0 })),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
    withTransactionSync: jest.fn((fn: () => void) => fn()),
    closeSync: jest.fn(),
  })),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(() => undefined),
    delete: jest.fn(),
  })),
}));
