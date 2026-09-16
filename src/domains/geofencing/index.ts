// Importing this module registers the background tasks. Keep it as the first
// geofencing import in the root layout.
import './tasks';

export * from './types';
export { MONITOR_CONFIG } from './config';
export {
  evaluateAndCommit,
  getCurrentFix,
  readSnapshot,
  refreshMonitoring,
  startMonitoring,
  stopMonitoring,
  submitSimulatedFix,
} from './services/monitorService';
