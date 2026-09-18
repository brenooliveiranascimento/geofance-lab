import { ringIssue } from '@src/domains/geofencing/services/ringRules';
import type { Ring } from '@src/core/geo';

const square = (size: number, offset = 0): Ring => [
  { latitude: offset, longitude: offset },
  { latitude: offset, longitude: offset + size },
  { latitude: offset + size, longitude: offset + size },
  { latitude: offset + size, longitude: offset },
];

const OUTER = square(0.001);
const INNER = square(0.0002, 0.0002);
const AREA = { minAreaSquareMeters: 20 };

describe('ringIssue', () => {
  it('accepts a ring that satisfies every rule', () => {
    expect(ringIssue(OUTER, AREA)).toBeNull();
  });

  it('refuses fewer than three vertices', () => {
    expect(ringIssue(OUTER.slice(0, 2), AREA)).toBe('vertices');
  });

  it('refuses a ring that crosses itself', () => {
    const bowtie: Ring = [OUTER[0], OUTER[2], OUTER[1], OUTER[3]];
    expect(ringIssue(bowtie, AREA)).toBe('selfIntersecting');
  });

  it('refuses a ring smaller than the minimum area', () => {
    expect(ringIssue(OUTER, { minAreaSquareMeters: 1e9 })).toBe('area');
  });

  it('refuses a ring that escapes the one containing it', () => {
    expect(ringIssue(OUTER, { ...AREA, containedBy: INNER })).toBe('outsideCompany');
    expect(ringIssue(INNER, { ...AREA, containedBy: OUTER })).toBeNull();
  });

  it('refuses a ring that would leave an existing room outside', () => {
    expect(ringIssue(INNER, { ...AREA, mustContain: [OUTER] })).toBe('outlineExcludesRooms');
    expect(ringIssue(OUTER, { ...AREA, mustContain: [INNER] })).toBeNull();
  });

  it('reports the first rule that fails, so the message is actionable', () => {
    const tiny: Ring = [OUTER[0], OUTER[1]];
    expect(ringIssue(tiny, { minAreaSquareMeters: 1e9, containedBy: INNER })).toBe('vertices');
  });
});
