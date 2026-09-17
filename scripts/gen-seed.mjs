#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const METERS_PER_DEGREE_LATITUDE = 111194.93;
const metersPerDegreeLongitude = (lat) =>
  METERS_PER_DEGREE_LATITUDE * Math.cos((lat * Math.PI) / 180);

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = [
  { name: 'São Paulo', latitude: -23.5505, longitude: -46.6333, spreadKm: 22 },
  { name: 'Rio de Janeiro', latitude: -22.9068, longitude: -43.1729, spreadKm: 18 },
  { name: 'Belo Horizonte', latitude: -19.9167, longitude: -43.9345, spreadKm: 14 },
  { name: 'Curitiba', latitude: -25.4284, longitude: -49.2733, spreadKm: 12 },
];

const KINDS = [
  { label: 'Padaria', radius: 40, activeRadius: 70 },
  { label: 'Farmácia', radius: 50, activeRadius: 85 },
  { label: 'Academia', radius: 60, activeRadius: 100 },
  { label: 'Escola', radius: 90, activeRadius: 140 },
  { label: 'Mercado', radius: 80, activeRadius: 130 },
  { label: 'Praça', radius: 120, activeRadius: 180 },
  { label: 'Estação', radius: 150, activeRadius: 220 },
  { label: 'Hospital', radius: 180, activeRadius: 260 },
  { label: 'Shopping', radius: 200, activeRadius: 300 },
  { label: 'Parque', radius: 300, activeRadius: 420 },
];

const NEIGHBOURHOODS = [
  'Pinheiros', 'Vila Madalena', 'Moema', 'Tatuapé', 'Santana', 'Lapa', 'Ipiranga',
  'Butantã', 'Perdizes', 'Brooklin', 'Copacabana', 'Botafogo', 'Tijuca', 'Barra',
  'Méier', 'Flamengo', 'Savassi', 'Pampulha', 'Lourdes', 'Funcionários',
  'Batel', 'Água Verde', 'Bigorrilho', 'Portão',
];

const ROOM_NAMES = ['Recepção', 'Escritório', 'Almoxarifado', 'Copa'];

const offset = (lat, lon, northMeters, eastMeters) => ({
  latitude: lat + northMeters / METERS_PER_DEGREE_LATITUDE,
  longitude: lon + eastMeters / metersPerDegreeLongitude(lat),
});

const round = (value, places = 7) => Number(value.toFixed(places));

function makeCompany(id, name, latitude, longitude, halfWidthM, halfHeightM) {
  const corner = (north, east) => {
    const point = offset(latitude, longitude, north, east);
    return { latitude: round(point.latitude), longitude: round(point.longitude) };
  };

  const footprint = [
    corner(-halfHeightM, -halfWidthM),
    corner(-halfHeightM, halfWidthM),
    corner(halfHeightM, halfWidthM),
    corner(halfHeightM, -halfWidthM),
  ];

  const rooms = ROOM_NAMES.map((roomName, index) => {
    const southHalf = index < 2;
    const westHalf = index % 2 === 0;

    const north0 = southHalf ? -halfHeightM : 0;
    const north1 = southHalf ? 0 : halfHeightM;
    const east0 = westHalf ? -halfWidthM : 0;
    const east1 = westHalf ? 0 : halfWidthM;

    return {
      id: `${id}-room-${index + 1}`,
      name: roomName,
      polygon: [
        corner(north0, east0),
        corner(north0, east1),
        corner(north1, east1),
        corner(north1, east0),
      ],
    };
  });

  return {
    id,
    name,
    latitude: round(latitude),
    longitude: round(longitude),
    radius: 25,
    activeRadius: 45,
    polygon: footprint,
    rooms,
  };
}

function build(count) {
  const random = makeRandom(20260916);
  const companies = [];

  const blockLat = -23.5615;
  const blockLon = -46.7021;
  for (let i = 0; i < 8; i += 1) {
    const point = offset(blockLat, blockLon, (i % 4) * 250, Math.floor(i / 4) * 250);
    companies.push(
      makeCompany(
        `empresa-${String(i + 1).padStart(2, '0')}`,
        `Empresa ${i + 1} — Pinheiros`,
        point.latitude,
        point.longitude,
        8,
        7,
      ),
    );
  }

  let index = 0;
  while (companies.length < count) {
    const region = REGIONS[index % REGIONS.length];
    const kind = KINDS[Math.floor(random() * KINDS.length)];
    const neighbourhood = NEIGHBOURHOODS[Math.floor(random() * NEIGHBOURHOODS.length)];

    const angle = random() * 2 * Math.PI;
    const distance = Math.sqrt(random()) * region.spreadKm * 1000;
    const point = offset(
      region.latitude,
      region.longitude,
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
    );

    index += 1;
    companies.push({
      id: `ponto-${String(index).padStart(4, '0')}`,
      name: `${kind.label} ${neighbourhood} ${index}`,
      latitude: round(point.latitude),
      longitude: round(point.longitude),
      radius: kind.radius,
      activeRadius: kind.activeRadius,
    });
  }

  return companies;
}

function main() {
  const args = process.argv.slice(2);
  const readFlag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
  };

  const count = Number(readFlag('count', '520'));
  const out = resolve(process.cwd(), readFlag('out', 'src/__fixtures__/companies.json'));

  const companies = build(count);
  const payload = {
    generatedBy: 'scripts/gen-seed.mjs',
    count: companies.length,
    withPolygon: companies.filter((company) => company.rooms).length,
    rooms: companies.reduce((sum, company) => sum + (company.rooms?.length ?? 0), 0),
    companies,
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 0)}\n`);

  console.log(
    `${payload.count} locais (${payload.withPolygon} com polígono, ${payload.rooms} cômodos) → ${out}`,
  );
}

main();
