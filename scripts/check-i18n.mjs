#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const LOCALES = ['pt-BR', 'en'];
const SOURCE_DIRS = ['src', 'app'];

const DYNAMIC_KEYS = {
  'events.kind': ['company_enter', 'company_exit', 'room_enter', 'room_exit'],
  'events.scope': ['all', 'companies', 'rooms'],
  'history.tab': ['events', 'system'],
  'monitor.label': ['idle', 'empty', 'regions', 'precise', 'blocked', 'busy'],
  'events.source': ['native_region', 'location_update', 'simulator', 'initial_sync'],
  'messages.state': ['pending', 'scheduled', 'delivered', 'cancelled', 'failed'],
  'messages.receipts.state': ['pending', 'confirmed', 'exhausted'],
  'monitor.startFailed': ['permissions', 'no_companies', 'no_position'],
  'permissions.state': ['granted', 'denied', 'undetermined'],
  'notifications.company': ['enter', 'exit'],
  'notifications.room': ['enter', 'exit'],
  'notifications.body': ['perimeter', 'distance'],
  'settings.languages': LOCALES,
};

const DYNAMIC_TEMPLATES = [
  { prefix: 'simulator.kind', values: ['crossing', 'approach'], suffixes: ['label', 'hint'] },
  { prefix: 'onboarding', values: ['location', 'notifications', 'company'], suffixes: ['action'] },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function collectUsedKeys() {
  const keys = new Set();

  for (const dir of SOURCE_DIRS) {
    for (const file of walk(resolve(ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
        if (match[1].includes('.')) keys.add(match[1]);
      }
    }
  }

  for (const [prefix, suffixes] of Object.entries(DYNAMIC_KEYS)) {
    for (const suffix of suffixes) keys.add(`${prefix}.${suffix}`);
  }

  for (const { prefix, values, suffixes } of DYNAMIC_TEMPLATES) {
    for (const value of values) {
      for (const suffix of suffixes) keys.add(`${prefix}.${value}.${suffix}`);
    }
  }

  return [...keys].sort();
}

const lookup = (tree, key) =>
  key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), tree);

function flatten(tree, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') out.push(...flatten(value, path));
    else out.push(path);
  }
  return out;
}

function main() {
  const bundles = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      JSON.parse(readFileSync(resolve(ROOT, `src/i18n/locales/${locale}.json`), 'utf8')),
    ]),
  );

  const used = collectUsedKeys();
  const problems = [];

  for (const key of used) {
    for (const locale of LOCALES) {
      const value = lookup(bundles[locale], key);
      if (typeof value !== 'string') {
        problems.push(`${locale}: chave ausente ou não textual → ${key}`);
      }
    }
  }

  const [first, ...rest] = LOCALES;
  const baseline = new Set(flatten(bundles[first]));
  for (const locale of rest) {
    const other = new Set(flatten(bundles[locale]));
    for (const key of baseline) {
      if (!other.has(key)) problems.push(`${locale}: falta a chave que ${first} tem → ${key}`);
    }
    for (const key of other) {
      if (!baseline.has(key)) problems.push(`${first}: falta a chave que ${locale} tem → ${key}`);
    }
  }

  if (problems.length > 0) {
    console.error(`✖ ${problems.length} problema(s) de i18n:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(
    `✔ i18n ok — ${used.length} chaves usadas, ${flatten(bundles[first]).length} definidas em cada locale`,
  );
}

main();
