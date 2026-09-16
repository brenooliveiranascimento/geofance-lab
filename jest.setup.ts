// Pin the zone so the daily-sequence tests exercise real local-time semantics
// (09:00 every day, not "every 24h") deterministically on any machine.
process.env.TZ = 'America/Sao_Paulo';

/**
 * Native modules the pure-logic suites never exercise. Stubbing them here keeps
 * the tests running on plain Node instead of needing a device.
 */

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
