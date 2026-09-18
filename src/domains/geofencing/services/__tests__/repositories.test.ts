import { resetDatabase } from '@src/core/db';

import { assertRadii, upsertCompany, setCompanyEnabled } from '@src/domains/geofencing/services/companyRepository';
import { commitEvaluation, listEvents } from '@src/domains/geofencing/services/eventRepository';
import { loadOccupiedCompanyIds, loadStatesFor, saveStates } from '@src/domains/geofencing/services/stateRepository';
import type { Company, GeofenceEvent, TargetState } from '@src/domains/geofencing/types';

const company = (id: string, enabled = true): Company => ({
  id,
  name: `Empresa ${id}`,
  latitude: -23.56,
  longitude: -46.65,
  radius: 40,
  activeRadius: 65,
  polygon: null,
  enabled,
  createdAt: 1,
});

const insideState = (targetId: string, companyId: string, seq: number): TargetState => ({
  targetId,
  targetKind: 'company',
  companyId,
  state: 'inside',
  transitionSeq: seq,
  since: 1_000,
  lastDistance: 10,
  pendingState: null,
  pendingCount: 0,
  updatedAt: 1_000,
});

const enterEvent = (companyId: string, seq: number): GeofenceEvent => ({
  idempotencyKey: `${companyId}:${seq}:company_enter`,
  kind: 'company_enter',
  companyId,
  companyName: `Empresa ${companyId}`,
  roomId: null,
  roomName: null,
  occurredAt: 2_000,
  latitude: -23.56,
  longitude: -46.65,
  accuracy: 8,
  distance: 10,
  source: 'native_region',
  notified: false,
});

beforeEach(() => {
  resetDatabase();
});

describe('assertRadii', () => {
  it('accepts an active radius equal to or wider than the radius', () => {
    expect(() => assertRadii({ radius: 40, activeRadius: 40 })).not.toThrow();
    expect(() => assertRadii({ radius: 40, activeRadius: 65 })).not.toThrow();
  });

  it('refuses a dead band that would oscillate', () => {
    expect(() => assertRadii({ radius: 40, activeRadius: 30 })).toThrow(/activeRadius/);
    expect(() => upsertCompany({ ...company('a'), activeRadius: 10 })).toThrow(/activeRadius/);
  });
});

describe('commitEvaluation', () => {
  it('writes the state and the event together', () => {
    const persisted = commitEvaluation([insideState('a', 'a', 1)], [enterEvent('a', 1)]);

    expect(persisted).toHaveLength(1);
    expect(listEvents()).toHaveLength(1);
    expect(loadStatesFor(['a']).get('a')?.state).toBe('inside');
  });

  it('ignores a replay of the same transition', () => {
    commitEvaluation([insideState('a', 'a', 1)], [enterEvent('a', 1)]);
    const replay = commitEvaluation([insideState('a', 'a', 1)], [enterEvent('a', 1)]);

    expect(replay).toHaveLength(0);
    expect(listEvents()).toHaveLength(1);
  });

  it('accepts the next transition of the same target', () => {
    commitEvaluation([insideState('a', 'a', 1)], [enterEvent('a', 1)]);
    commitEvaluation([insideState('a', 'a', 2)], [enterEvent('a', 2)]);

    expect(listEvents()).toHaveLength(2);
  });
});

describe('loadOccupiedCompanyIds', () => {
  it('reports a company the device is inside of', () => {
    upsertCompany(company('a'));
    saveStates([insideState('a', 'a', 1)]);

    expect(loadOccupiedCompanyIds()).toEqual(['a']);
  });

  it('drops a company that was disabled while occupied', () => {
    upsertCompany(company('a'));
    saveStates([insideState('a', 'a', 1)]);
    setCompanyEnabled('a', false);

    expect(loadOccupiedCompanyIds()).toEqual([]);
  });
});
