import { isRingInsideRing, isSimpleRing, ringAreaSquareMeters, type Ring } from '@src/core/geo';

import { COMPANY_SHAPE } from '@src/domains/geofencing/config';

export type RingIssue =
  | 'vertices'
  | 'selfIntersecting'
  | 'area'
  | 'outsideCompany'
  | 'outlineExcludesRooms';

export interface RingRules {
  minAreaSquareMeters: number;
  containedBy?: Ring | null;
  mustContain?: readonly Ring[];
}

export function ringIssue(ring: Ring, rules: RingRules): RingIssue | null {
  if (ring.length < COMPANY_SHAPE.minVertices) return 'vertices';
  if (ring.length >= 4 && !isSimpleRing(ring)) return 'selfIntersecting';
  if (ringAreaSquareMeters(ring) < rules.minAreaSquareMeters) return 'area';

  if (rules.containedBy && !isRingInsideRing(ring, rules.containedBy)) return 'outsideCompany';

  const excluded = rules.mustContain?.some((inner) => !isRingInsideRing(inner, ring));
  if (excluded) return 'outlineExcludesRooms';

  return null;
}
