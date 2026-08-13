/* ═══════════════════════════════════════════════════════════════
   build-crags.mjs — routes_with_length.csv → js/crags.data.js

   The guidebook, turned into something the app can search offline.
   Run it after editing the CSV:

     node tools/build-crags.mjs

   It refuses to write a file it can't vouch for. A generator that
   quietly emits half the routes is worse than one that stops, because
   the app has no way to tell a short database from a complete one — it
   would simply fail to find things, which reads as "that route isn't at
   Portland" rather than "the build broke".
   ═══════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'routes_with_length.csv');
const OUT  = join(ROOT, 'js', 'crags.data.js');

const VENUE = 'Portland';

/* ── the CSV ──────────────────────────────────────────────────
   Hand-rolled rather than a dependency: this project has no build
   step and no package.json, and adding both for one file that runs
   once a year is the wrong trade. Quoted fields are real — 94 lines
   carry a comma inside a route name — so they are handled, and
   nothing else about RFC 4180 is. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; continue; }   // "" is an escaped quote
      quoted = false;
      continue;
    }
    if (ch === '"' && field === '') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* ── ids ──────────────────────────────────────────────────────
   Stable across rebuilds, because a shared length in Firestore is
   keyed by one. Crag and area are part of it: seven route names at
   Portland are used twice, and "Flake Out" three times.

   Decomposing first means Arête and Espana reduce to letters rather
   than to gaps, so the id stays legible and — more to the point —
   stays the same if somebody ever retypes the name without its
   accent. The collision check below is what actually guarantees
   uniqueness; this only makes collisions less likely to be silly. */
const slug = s => s
  .toLowerCase()
  .replace(/['‘’]/g, '')            // O’Brien → obrien, not o-brien
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const routeId = (crag, area, name) => `${slug(crag)}__${slug(area)}__${slug(name)}`;

/* ── grades ───────────────────────────────────────────────────
   Three systems in one column. Which one a grade is on decides
   which ladder the app can place it against, so a grade that
   matches none of them is a build failure rather than a route the
   search quietly can't handle. */
function system(g) {
  if (/^f\d/.test(g))          return 'font';      // f6B+, f7A
  if (/^V\d+$/.test(g))        return 'v';         // one stray row
  if (/^\d[abc]?\+?$/.test(g)) return 'french';    // 6b+, 7a
  if (/^(M|D|VD|HVD|S|HS|MS|VS|HVS|E\d)\b/.test(g)) return 'uk';
  return null;
}

/* ── go ───────────────────────────────────────────────────── */
const problems = [];
const fail = msg => problems.push(msg);

const rows = parseCSV(readFileSync(SRC, 'utf8'));
const head = rows.shift().map(h => h.trim());

const need = ['Crag', 'Area', 'Route Name', 'Grade', 'Length'];
const col = {};
need.forEach(h => {
  const i = head.indexOf(h);
  if (i < 0) fail(`the CSV has no "${h}" column — found ${head.join(', ')}`);
  col[h] = i;
});
if (problems.length) stop();

const crags = [], areas = [], routes = [], seen = new Map();

rows.forEach((r, n) => {
  const line = n + 2;                                  // 1-indexed, past the header
  const crag = (r[col.Crag] || '').trim();
  const area = (r[col.Area] || '').trim();
  const name = (r[col['Route Name']] || '').trim();
  const grade = (r[col.Grade] || '').trim();
  const rawLen = (r[col.Length] || '').trim();

  if (!crag || !name)  return fail(`line ${line}: missing crag or route name`);
  if (!system(grade))  return fail(`line ${line}: "${grade}" (${name}) is on no grade system I know`);

  /* Blank is the honest answer for most of the bouldering, and for a
     scattering of routes nobody has measured. Zero stands for it in
     the emitted file — there is no shorter way to write "nothing" in
     a fixed-width row — and crags.js turns it back into null on the
     way in, because a route with no recorded length is a different
     fact from a route that is nought metres long. */
  let length = 0;
  if (rawLen) {
    const m = Number(rawLen);
    if (!Number.isFinite(m) || m <= 0 || m > 200) return fail(`line ${line}: length "${rawLen}" on ${name}`);
    length = Math.round(m);
  }

  const id = routeId(crag, area, name);
  if (seen.has(id)) return fail(`line ${line}: ${name} at ${crag} collides with line ${seen.get(id)}`);
  seen.set(id, line);

  let ci = crags.indexOf(crag); if (ci < 0) ci = crags.push(crag) - 1;
  let ai = areas.indexOf(area); if (ai < 0) ai = areas.push(area) - 1;

  routes.push([ci, ai, name, grade, length]);
});

if (!routes.length) fail('no routes survived the parse');
if (problems.length) stop();

function stop() {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} in ${SRC}:\n`);
  problems.slice(0, 40).forEach(p => console.error('  ' + p));
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  console.error('\nNothing written.\n');
  process.exit(1);
}

/* One route per line: 76 KB of data is going to be diffed by somebody
   one day, and a single line of it is not a diff. */
const q = s => JSON.stringify(s);
const body =
`/* ═══════════════════════════════════════════════════════════════
   crags.data.js — GENERATED by tools/build-crags.mjs. Do not edit.

   ${routes.length} routes · ${crags.length} crags · ${areas.length} areas
   Source: routes_with_length.csv

   Crag and area names are held once and referenced by index, which is
   what keeps the whole guidebook to something a phone can carry in the
   service worker's shell cache. A length of 0 means "not recorded" —
   see CT.crags in crags.js, which is the only thing that reads this.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = (window.CT = window.CT || {});

  CT.CRAGDATA = {
    venue: ${q(VENUE)},
    crags: [
${crags.map(c => '      ' + q(c)).join(',\n')}
    ],
    areas: [
${areas.map(a => '      ' + q(a)).join(',\n')}
    ],
    /* [crag, area, name, grade, length] */
    routes: [
${routes.map(r => `      [${r[0]},${r[1]},${q(r[2])},${q(r[3])},${r[4]}]`).join(',\n')}
    ]
  };
})();
`;

writeFileSync(OUT, body, 'utf8');

const withLength = routes.filter(r => r[4]).length;
const bySystem = {};
routes.forEach(r => { const s = system(r[3]); bySystem[s] = (bySystem[s] || 0) + 1; });

console.log(`\n  ${OUT}`);
console.log(`  ${routes.length} routes · ${crags.length} crags · ${areas.length} areas`);
console.log(`  ${withLength} with a length (${Math.round(withLength / routes.length * 100)}%)`);
console.log('  ' + Object.entries(bySystem).map(([s, n]) => `${s} ${n}`).join(' · '));
console.log(`  ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB\n`);
