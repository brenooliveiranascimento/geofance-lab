#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const LOCALE = 'pt-BR';
const SOURCE_DIRS = ['src', 'app'];

const DYNAMIC_KEYS = {
  'wizard.errors': [
    'vertices',
    'selfIntersecting',
    'area',
    'outsideCompany',
    'outlineExcludesRooms',
  ],
  'events.kind': ['company_enter', 'company_exit', 'room_enter', 'room_exit'],
  'events.scope': ['all', 'companies', 'rooms'],
  'history.tab': ['events', 'system'],
  'monitor.label': ['idle', 'empty', 'regions', 'precise', 'blocked', 'busy'],
  'events.source': ['native_region', 'location_update', 'simulator', 'initial_sync'],
  'messages.state': ['pending', 'scheduled', 'delivered', 'cancelled', 'failed'],
  'messages.receipts.state': ['pending', 'confirmed', 'exhausted'],
  'monitor.startFailed': ['permissions', 'no_companies', 'no_position', 'platform'],
  'permissions.state': ['granted', 'denied', 'undetermined'],
  'notifications.company': ['enter', 'exit'],
  'notifications.room': ['enter', 'exit'],
  'notifications.body': ['perimeter', 'distance'],
};

const MESSAGE_IDS = readFileSync(resolve(ROOT, 'src/domains/messaging/content/messages.ts'), 'utf8')
  .split('const resolve')[0]
  .match(/'[a-z]+-[\d-]+'/g)
  .map((quoted) => quoted.slice(1, -1));

const DYNAMIC_TEMPLATES = [
  { prefix: 'messages.content', values: MESSAGE_IDS, suffixes: ['title', 'body'] },
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

function collectMentionedKeys() {
  const mentioned = new Set();

  for (const dir of SOURCE_DIRS) {
    for (const file of walk(resolve(ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/'([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)'/g)) {
        mentioned.add(match[1]);
      }
    }
  }

  return mentioned;
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

const resolves = (tree, key) =>
  typeof lookup(tree, key) === 'string' ||
  (typeof lookup(tree, `${key}_one`) === 'string' &&
    typeof lookup(tree, `${key}_other`) === 'string');

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
  const bundle = JSON.parse(
    readFileSync(resolve(ROOT, `src/i18n/locales/${LOCALE}.json`), 'utf8'),
  );

  const used = collectUsedKeys();
  const problems = [];

  for (const key of used) {
    if (!resolves(bundle, key)) problems.push(`chave ausente ou não textual → ${key}`);
  }

  const reachable = new Set([...used, ...collectMentionedKeys()]);
  const isUsed = (key) =>
    reachable.has(key) ||
    reachable.has(key.replace(/_(one|other)$/, '')) ||
    [...reachable].some((prefix) => key.startsWith(`${prefix}.`));

  for (const key of flatten(bundle)) {
    if (!isUsed(key)) problems.push(`chave definida e nunca usada → ${key}`);
  }

  if (problems.length > 0) {
    console.error(`✖ ${problems.length} problema(s) de i18n:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(`✔ i18n ok — ${used.length} chaves usadas, ${flatten(bundle).length} definidas`);
}

main();
