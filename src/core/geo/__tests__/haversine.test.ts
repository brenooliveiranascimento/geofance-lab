import {
  METERS_PER_DEGREE_LATITUDE,
  boundingBoxAround,
  distanceMeters,
  isInBoundingBox,
  metersPerDegreeLongitude,
} from '../haversine';

describe('distanceMeters', () => {
  it('returns zero for the same point', () => {
    const point = { latitude: -23.5505, longitude: -46.6333 };
    expect(distanceMeters(point, point)).toBe(0);
  });

  it('matches a known long-haul distance', () => {
    const saoPaulo = { latitude: -23.4356, longitude: -46.4731 };
    const lisbon = { latitude: 38.7742, longitude: -9.1342 };
    const km = distanceMeters(saoPaulo, lisbon) / 1000;
    expect(km).toBeGreaterThan(7900);
    expect(km).toBeLessThan(7990);
  });

  it('resolves room-scale distances precisely', () => {
    const a = { latitude: -23.55, longitude: -46.63 };
    const b = { latitude: -23.5501, longitude: -46.63 };
    expect(distanceMeters(a, b)).toBeCloseTo(11.13, 1);
  });

  it('is symmetric', () => {
    const a = { latitude: -23.55, longitude: -46.63 };
    const b = { latitude: -22.9, longitude: -43.2 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });

  it('takes the short way across the antimeridian', () => {
    const west = { latitude: 0, longitude: 179.99 };
    const east = { latitude: 0, longitude: -179.99 };
    expect(distanceMeters(west, east)).toBeLessThan(2500);
  });

  it('handles antipodal points without NaN', () => {
    const north = { latitude: 90, longitude: 0 };
    const south = { latitude: -90, longitude: 0 };
    const distance = distanceMeters(north, south);
    expect(Number.isNaN(distance)).toBe(false);
    expect(distance / 1000).toBeCloseTo(20015, 0);
  });
});

describe('metersPerDegreeLongitude', () => {
  it('equals the latitude constant at the equator', () => {
    expect(metersPerDegreeLongitude(0)).toBeCloseTo(METERS_PER_DEGREE_LATITUDE, 5);
  });

  it('halves around 60 degrees of latitude', () => {
    expect(metersPerDegreeLongitude(60)).toBeCloseTo(METERS_PER_DEGREE_LATITUDE / 2, 2);
  });

  it('collapses to zero at the pole', () => {
    expect(metersPerDegreeLongitude(90)).toBeCloseTo(0, 6);
  });
});

describe('boundingBoxAround', () => {
  it('contains every point inside the radius', () => {
    const center = { latitude: -23.55, longitude: -46.63 };
    const box = boundingBoxAround(center, 100);

    for (let bearing = 0; bearing < 360; bearing += 15) {
      const radians = (bearing * Math.PI) / 180;
      const point = {
        latitude: center.latitude + (100 * Math.cos(radians)) / METERS_PER_DEGREE_LATITUDE,
        longitude:
          center.longitude + (100 * Math.sin(radians)) / metersPerDegreeLongitude(center.latitude),
      };
      expect(distanceMeters(center, point)).toBeLessThan(101);
      expect(isInBoundingBox(point, box)).toBe(true);
    }
  });

  it('widens longitude as latitude grows', () => {
    const equator = boundingBoxAround({ latitude: 0, longitude: 0 }, 1000);
    const high = boundingBoxAround({ latitude: 70, longitude: 0 }, 1000);
    const equatorSpan = equator.maxLongitude - equator.minLongitude;
    const highSpan = high.maxLongitude - high.minLongitude;
    expect(highSpan).toBeGreaterThan(equatorSpan * 2);
  });

  it('degenerates to the full longitude range at the pole', () => {
    const box = boundingBoxAround({ latitude: 90, longitude: 0 }, 1000);
    expect(box.minLongitude).toBe(-180);
    expect(box.maxLongitude).toBe(180);
  });
});
