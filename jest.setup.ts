process.env.TZ = 'America/Sao_Paulo';

beforeAll(async () => {
  await require('./src/__mocks__/expoSqlite').initTestSqlite();
});

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => require('./src/__mocks__/expoSqlite').openTestDatabase(),
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: () => ({ remove: () => undefined }),
}));
