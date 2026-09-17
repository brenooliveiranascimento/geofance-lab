#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const EARTH_RADIUS_M = 6371008.8;
const METERS_PER_DEGREE_LATITUDE = (Math.PI / 180) * EARTH_RADIUS_M;

const DEFAULT_ANCHOR = { latitude: 37.3349, longitude: -122.009 };

const OUTLINE = [
  [-15, -12],
  [15, -12],
  [15, 12],
  [0, 22],
  [-15, 12],
];

const ROOMS = [
  { name: 'Sala', box: [-14, -11, -1, -1] },
  { name: 'Cozinha', box: [1, -11, 14, -1] },
  { name: 'Quarto', box: [-14, 1, -1, 11] },
  { name: 'Banheiro', box: [1, 1, 14, 11] },
  { name: 'Sótão', polygon: [[-7, 13], [7, 13], [0, 19]] },
];

const round = (value) => Number(value.toFixed(7));

const EXIT_BUFFER_METERS = 25;

const distanceMeters = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = Math.sin((lat2 - lat1) / 2);
  const dLon = Math.sin(toRad(b.longitude - a.longitude) / 2);
  const h = dLat * dLat + Math.cos(lat1) * Math.cos(lat2) * dLon * dLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

function deriveCircle(polygon) {
  const centroid = {
    latitude: polygon.reduce((sum, v) => sum + v.latitude, 0) / polygon.length,
    longitude: polygon.reduce((sum, v) => sum + v.longitude, 0) / polygon.length,
  };
  const radius = Math.max(...polygon.map((vertex) => distanceMeters(centroid, vertex)));
  return { centroid, radius, activeRadius: radius + EXIT_BUFFER_METERS };
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

function toSql(payload) {
  const { centroid, radius, activeRadius } = deriveCircle(payload.company.polygon);
  const now = Date.now();
  const { id, name, polygon } = payload.company;

  const lines = [
    'BEGIN;',
    `DELETE FROM rooms WHERE company_id = ${quote(id)};`,
    `DELETE FROM monitor_state WHERE company_id = ${quote(id)};`,
    `DELETE FROM companies WHERE id = ${quote(id)};`,
    `INSERT INTO companies (id, name, latitude, longitude, radius, active_radius, polygon, enabled, created_at)`,
    `VALUES (${quote(id)}, ${quote(name)}, ${round(centroid.latitude)}, ${round(centroid.longitude)},` +
      ` ${radius.toFixed(2)}, ${activeRadius.toFixed(2)}, ${quote(JSON.stringify(polygon))}, 1, ${now});`,
  ];

  for (const room of payload.rooms) {
    lines.push(
      `INSERT INTO rooms (id, company_id, name, polygon, created_at)` +
        ` VALUES (${quote(room.id)}, ${quote(id)}, ${quote(room.name)},` +
        ` ${quote(JSON.stringify(room.polygon))}, ${now});`,
    );
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

function makeProjector(anchor) {
  const metersPerLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((anchor.latitude * Math.PI) / 180);

  return ([east, north]) => ({
    latitude: round(anchor.latitude + north / METERS_PER_DEGREE_LATITUDE),
    longitude: round(anchor.longitude + east / metersPerLongitude),
  });
}

const boxToPolygon = ([west, south, east, north]) => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
];

function main() {
  const args = process.argv.slice(2);
  const read = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 && args[at + 1] ? Number(args[at + 1]) : fallback;
  };

  const anchor = {
    latitude: read('lat', DEFAULT_ANCHOR.latitude),
    longitude: read('lon', DEFAULT_ANCHOR.longitude),
  };

  const project = makeProjector(anchor);

  const payload = {
    generatedBy: 'scripts/gen-demo-house.mjs',
    anchor,
    company: {
      id: 'demo-casa',
      name: 'Casa modelo',
      polygon: OUTLINE.map(project),
    },
    rooms: ROOMS.map((room, index) => ({
      id: `demo-casa-room-${index + 1}`,
      name: room.name,
      polygon: (room.polygon ?? boxToPolygon(room.box)).map(project),
    })),
  };

  const out = resolve(process.cwd(), 'src/__fixtures__/demo-house.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

  if (args.includes('--sql')) {
    process.stdout.write(`${toSql(payload)}\n`);
    return;
  }

  const { radius, activeRadius } = deriveCircle(payload.company.polygon);
  console.log(
    `casa com ${payload.company.polygon.length} vértices e ${payload.rooms.length} cômodos → ${out}`,
  );
  console.log(`raio derivado ${radius.toFixed(1)} m · raio ativo ${activeRadius.toFixed(1)} m`);
}

main();
