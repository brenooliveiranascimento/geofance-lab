import {
  circumscribedRadiusMeters,
  isPointInPolygon,
  isRingInsideRing,
  isSimpleRing,
  ringAreaSquareMeters,
  ringCentroid,
  type Ring,
} from '@src/core/geo';

const demo = require('../../../../__fixtures__/demo-house.json') as {
  company: { id: string; name: string; polygon: Ring };
  rooms: { id: string; name: string; polygon: Ring }[];
};

describe('demo house', () => {
  const outline = demo.company.polygon;

  it('has the house silhouette', () => {
    expect(outline).toHaveLength(5);
    expect(demo.rooms).toHaveLength(5);
  });

  it('draws an outline that does not cross itself', () => {
    expect(isSimpleRing(outline)).toBe(true);
  });

  it('is big enough for a GPS fix to sit inside', () => {
    const area = ringAreaSquareMeters(outline);
    expect(area).toBeGreaterThan(800);
    expect(area).toBeLessThan(900);
  });

  it('keeps every room simple and inside the house', () => {
    for (const room of demo.rooms) {
      expect(isSimpleRing(room.polygon)).toBe(true);
      expect(isRingInsideRing(room.polygon, outline)).toBe(true);
    }
  });

  it('gives every room room to be detected', () => {
    for (const room of demo.rooms) {
      expect(ringAreaSquareMeters(room.polygon)).toBeGreaterThan(20);
    }
  });

  it('never lets one room overlap another', () => {
    for (const room of demo.rooms) {
      for (const other of demo.rooms) {
        if (room.id === other.id) continue;
        for (const vertex of room.polygon) {
          expect(isPointInPolygon(vertex, other.polygon)).toBe(false);
        }
      }
    }
  });

  it('derives a circle that contains the whole house', () => {
    const centroid = ringCentroid(outline)!;
    const radius = circumscribedRadiusMeters(outline, centroid);

    expect(radius).toBeGreaterThan(20);
    expect(radius).toBeLessThan(30);
    for (const vertex of outline) {
      expect(isPointInPolygon(vertex, outline)).toBe(true);
    }
  });

  it('puts the attic in the gable, above the body', () => {
    const attic = demo.rooms.find((room) => room.name === 'Sótão')!;
    const body = demo.rooms.find((room) => room.name === 'Quarto')!;

    const northOf = (ring: Ring) => Math.max(...ring.map((v) => v.latitude));
    expect(Math.min(...attic.polygon.map((v) => v.latitude))).toBeGreaterThan(northOf(body.polygon));
  });
});
