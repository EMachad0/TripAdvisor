// atr — Asia Trip Ranker curator CLI.
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { c, formatResults, table } from './ui.js';
import { searchHint, titleCity } from './atr-hint.js';
import { ROOT, dataRoots, isFixtureMode, localDate } from '../lib/paths.js';
import { validateAll } from '../lib/validate.js';
import { findPlaceFiles, resolvePlace, resolveArea, loadPlaces, loadAreas } from '../lib/load.js';
import { BLOCKS, BLOCK_TYPES } from '../lib/schema/blocks.js';
import { nearest, toJsonSchema, describe, exampleOf } from '../lib/schema/dsl.js';
import { placeSpec, areaSpec, creditsSpec } from '../lib/schema/specs.js';
import { COUNTRY_IDS, CATEGORY_IDS, COUNTRIES, CATEGORIES } from '../lib/schema/enums.js';
import { toYaml } from '../lib/yamlio.js';

const COMMON = {
  json: { type: 'boolean', desc: 'machine-readable JSON output' },
  fixtures: { type: 'boolean', desc: 'use platform/test/fixtures instead of places/ areas/ feedback/ (same as ATR_FIXTURES=1)' },
  help: { type: 'boolean', short: 'h', desc: 'show help' },
};

const COMMANDS = {};
const cmd = (name, def) => { COMMANDS[name] = def; };

function helpFor(name) {
  const d = COMMANDS[name];
  const opts = { ...d.options, ...COMMON };
  const lines = [`${c.bold('atr ' + name)} — ${d.summary}`, '', `${c.dim('usage:')} ${d.usage}`];
  if (d.details) lines.push('', d.details);
  lines.push('', c.dim('options:'));
  for (const [k, o] of Object.entries(opts)) lines.push(`  --${k}${o.type === 'string' ? ' <value>' : ''}${o.short ? `, -${o.short}` : ''}`.padEnd(30) + (o.desc || ''));
  if (d.examples) lines.push('', c.dim('examples:'), ...d.examples.map((e) => '  ' + e));
  return lines.join('\n');
}

function mainHelp() {
  return [`${c.bold('atr')} — Asia Trip Ranker curator platform`, '',
    'usage: ./atr <command> [options]   (or: npm run atr -- <command> ...)', '',
    ...Object.entries(COMMANDS).map(([k, d]) => `  ${k.padEnd(13)} ${d.summary}`), '',
    'Every command has --help. Most accept --json and --fixtures.',
    'Curators: read docs/CURATOR-GUIDE.md first.'].join('\n');
}

const out = (opts, data, text) => console.log(opts.json ? JSON.stringify(data, null, 2) : text);
const fail = (msg, code = 1) => { console.error(c.red('✖ ') + msg); process.exitCode = code; };
const today = () => localDate();
const nameOf = (f) => path.relative(process.cwd(), f) || '.';

// ───────────────────────── new ─────────────────────────
cmd('new', {
  summary: 'scaffold a place or area file with every field and commented block examples',
  usage: './atr new place --country <c> --city <city> --name "<Name>" [--category <cat>] [--id <slug>]\n       ./atr new area --country <c> --name "<Name>" [--scope city|region] [--id <slug>]',
  details: `countries: ${COUNTRY_IDS.join(', ')}\ncategories: ${CATEGORY_IDS.join(', ')}`,
  options: { country: { type: 'string', desc: 'country id' }, city: { type: 'string', desc: 'city slug (e.g. shanghai)' }, name: { type: 'string', desc: 'display name' }, category: { type: 'string', desc: 'balance category' }, scope: { type: 'string', desc: 'area scope: city | region' }, id: { type: 'string', desc: 'id / folder name to use instead of the slug of --name (lowercase, hyphens)' }, force: { type: 'boolean', desc: 'overwrite an existing file' }, 'fx-rate': { type: 'string', desc: 'place: use this fx rate instead of the cached one (a rate fixed by your brief)' }, 'fx-date': { type: 'string', desc: 'place: the date of --fx-rate (default today)' } },
  examples: ['./atr new place --country china --city shanghai --name "Yu Garden" --category culture', './atr new place --country china --city huangshan --name "Hongcun" --fx-rate 0.8267 --fx-date 2026-11-09', './atr new area --country china --name "Harbin"'],
  async run(o, pos) {
    const what = pos[0];
    const { placeTemplate, areaTemplate } = await import('../lib/scaffold.js');
    const { slugify } = await import('../lib/media/index.js');
    if (!['place', 'area'].includes(what)) return fail(`say what to create: \`./atr new place ...\` or \`./atr new area ...\``);
    if (!o.country || !COUNTRY_IDS.includes(o.country)) return fail(`--country must be one of: ${COUNTRY_IDS.join(', ')}${o.country && nearest(o.country, COUNTRY_IDS) ? ` (did you mean ${nearest(o.country, COUNTRY_IDS)}?)` : ''}`);
    if (!o.name) return fail('--name "<Name>" is required');
    const roots = dataRoots(o);
    if (o.id !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.id)) return fail(`--id "${o.id}" is not a valid slug (lowercase a-z, 0-9 and single hyphens), e.g. --id ${slugify(o.id || o.name)}`);
    if (what === 'place') {
      if (!o.city) return fail('--city <city-slug> is required (e.g. --city shanghai)');
      const city = slugify(o.city);
      const cat = o.category || 'culture';
      if (!CATEGORY_IDS.includes(cat)) return fail(`--category must be one of: ${CATEGORY_IDS.join(', ')}${nearest(cat, CATEGORY_IDS) ? ` (did you mean ${nearest(cat, CATEGORY_IDS)}?)` : ''}`);
      const id = o.id || slugify(o.name);
      const dir = path.join(roots.places, o.country, city, id);
      const file = path.join(dir, 'place.yaml');
      if (fs.existsSync(file) && !o.force) return fail(`${nameOf(file)} already exists (use --force to overwrite)`);
      const clash = findPlaceFiles(o).find((f) => path.basename(path.dirname(f)) === id);
      if (clash && !o.force) return fail(`id "${id}" already used by ${nameOf(clash)} — pick a more specific --name`);
      let fx = null;
      if (o['fx-rate'] !== undefined) {
        const rate = Number(o['fx-rate']);
        if (!(rate > 0)) return fail(`--fx-rate must be a positive number, e.g. --fx-rate 0.8267`);
        if (o['fx-date'] && !/^\d{4}-\d{2}-\d{2}$/.test(o['fx-date'])) return fail('--fx-date must be YYYY-MM-DD');
        fx = { rate, date: o['fx-date'] || today(), source: 'fixed rate for this batch' };
      } else try { const { getRate } = await import('../lib/fx.js'); fx = await getRate(COUNTRIES[o.country].currency); } catch { /* offline: leave TODO */ }
      // Cards in one city should share a rate: warn when the cached rate differs from what the others use.
      const others = loadPlaces(o).filter((p) => p.country === o.country && p.city === city && typeof p.fx?.rate === 'number');
      const counts = {};
      for (const p of others) { const k = `${p.fx.rate}|${p.fx.date}`; counts[k] = (counts[k] || 0) + 1; }
      const [common, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
      const [cRate, cDate] = common ? common.split('|') : [];
      const fxWarn = fx && common && Math.abs(Number(cRate) - fx.rate) / Number(cRate) > 0.002 ? `fx: this scaffold has ${fx.rate} (${fx.date}) but ${n} other card${n === 1 ? '' : 's'} in ${city} use${n === 1 ? 's' : ''} ${cRate} (${cDate}). If your brief fixes a rate, use it: --fx-rate ${cRate} --fx-date ${cDate} (or edit fx: and every R$ amount).` : null;
      fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
      fs.writeFileSync(file, placeTemplate({ country: o.country, city, name: o.name, category: cat, fx, today: today(), id }));
      out(o, { file, id, dir, ...(fxWarn ? { warning: fxWarn } : {}) }, `${c.green('✔')} created ${nameOf(file)}${fxWarn ? `\n  ${c.yellow('⚠ ' + fxWarn)}` : ''}\n  next: research, then \`./atr media preview "${searchHint(o.name, city)}"\`, fill every TODO, \`./atr validate ${nameOf(dir)}\``);
    } else {
      const id = o.id || slugify(o.name);
      const file = path.join(roots.areas, o.country, `${id}.yaml`);
      if (fs.existsSync(file) && !o.force) return fail(`${nameOf(file)} already exists (use --force to overwrite)`);
      fs.mkdirSync(path.join(roots.areas, o.country, 'media'), { recursive: true });
      fs.writeFileSync(file, areaTemplate({ country: o.country, name: o.name, today: today(), scope: o.scope || 'city', id }));
      out(o, { file, id }, `${c.green('✔')} created ${nameOf(file)}\n  next: fill every TODO, fetch an image with \`./atr media fetch --area ${id} "File:..."\`, then \`./atr validate ${nameOf(file)}\` and \`./atr shot ${id}\` (the area page)`);
    }
  },
});

// ───────────────────────── validate ─────────────────────────
cmd('validate', {
  summary: 'check places/areas against the schema; fix-it messages; exit 1 on errors',
  usage: './atr validate [path|id ...] [--all] [--quiet] [--json]',
  details: 'Paths can be a place folder, a place.yaml, an area .yaml, or a directory (validates everything inside). No path = --all.',
  options: { all: { type: 'boolean', desc: 'validate every place and area' }, quiet: { type: 'boolean', desc: 'hide warnings and passing files' } },
  examples: ['./atr validate --all', './atr validate places/china/shanghai/yu-garden', './atr validate yu-garden'],
  run(o, pos) {
    let files;
    if (pos.length && !o.all) {
      files = [];
      for (const p of pos) {
        const abs = path.resolve(p);
        if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
          if (fs.existsSync(path.join(abs, 'place.yaml'))) files.push(path.join(abs, 'place.yaml'));
          else for (const f of walkYaml(abs)) files.push(f);
        } else if (fs.existsSync(abs)) files.push(abs);
        else {
          const r = resolvePlace(p, o) || resolveArea(p, o);
          if (!r) { fail(`nothing found for "${p}" (not a path, place id or area id)`); return; }
          files.push(r.file);
        }
      }
    }
    const res = validateAll({ ...o, files });
    if (o.json) console.log(JSON.stringify({ errors: res.errors, warnings: res.warnings, results: res.results.map((r) => ({ file: r.file, issues: r.issues.map(({ pathArr, ...i }) => i) })) }, null, 2));
    else console.log(res.results.length ? formatResults(res, { quiet: o.quiet }) : `${c.yellow('▲')} nothing to validate in ${nameOf(dataRoots(o).places)} / ${nameOf(dataRoots(o).areas)}${isFixtureMode(o) ? '' : ' (use --fixtures for the test fixtures)'}`);
    if (res.errors) process.exitCode = 1;
  },
});
function walkYaml(dir) {
  const outF = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'media' || e.name.startsWith('_')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) outF.push(...walkYaml(f));
    else if (/\.ya?ml$/.test(e.name) && e.name !== 'credits.yaml') outF.push(f);
  }
  return outF;
}

// ───────────────────────── blocks ─────────────────────────
cmd('blocks', {
  summary: 'list page blocks with their YAML shape and an example',
  usage: './atr blocks [type] [--json]',
  options: { fields: { type: 'string', desc: 'show top-level fields of: place | area | credits' } },
  examples: ['./atr blocks', './atr blocks book_ahead', './atr blocks --fields place'],
  run(o, pos) {
    if (o.fields) {
      const spec = { place: placeSpec, area: areaSpec, credits: creditsSpec.of }[o.fields];
      if (!spec) return fail('--fields must be place, area or credits');
      return out(o, toJsonSchema(spec), fieldDocs(spec));
    }
    const type = pos[0];
    if (type && !BLOCKS[type]) return fail(`unknown block "${type}"${nearest(type, BLOCK_TYPES) ? `. Did you mean "${nearest(type, BLOCK_TYPES)}"?` : ''}\nvalid: ${BLOCK_TYPES.join(', ')}`);
    const types = type ? [type] : BLOCK_TYPES;
    if (o.json) return console.log(JSON.stringify(Object.fromEntries(types.map((t) => [t, { summary: BLOCKS[t].summary, schema: toJsonSchema(BLOCKS[t].spec), example: BLOCKS[t].example }])), null, 2));
    if (!type) {
      console.log(c.bold('Page blocks') + c.dim('  (./atr blocks <type> for the full shape)\n'));
      for (const t of types) console.log(`  ${c.cyan(t.padEnd(15))} ${BLOCKS[t].summary}`);
      console.log(`\n${c.dim('Text fields that allow Markdown accept: **bold**, *italic*, [link](https://...), "- " lists. Raw HTML is escaped.')}`);
      return;
    }
    const b = BLOCKS[type];
    console.log(`${c.bold(c.cyan(type))} — ${b.summary}\n\n${c.dim('fields:')}\n${fieldDocs(b.spec, '  ')}\n\n${c.dim('example:')}\n${toYaml([b.example]).trimEnd().split('\n').map((l) => '  ' + l).join('\n')}`);
  },
});
function fieldDocs(spec, indent = '') {
  const lines = [];
  for (const [k, f] of Object.entries(spec.fields)) {
    lines.push(`${indent}${(k + (f.optional ? '?' : '')).padEnd(16)} ${c.dim(describe(f))}${f.desc ? ` — ${f.desc}` : ''}`);
    if (f.kind === 'object') lines.push(fieldDocs(f, indent + '  '));
    if (f.kind === 'array' && f.of.kind === 'object') lines.push(fieldDocs(f.of, indent + '  · '));
  }
  return lines.join('\n');
}

// ───────────────────────── fx ─────────────────────────
cmd('fx', {
  summary: 'exchange rate to BRL (ECB via frankfurter.dev; cached) to paste into `fx:`',
  usage: './atr fx <CUR> [--date YYYY-MM-DD] [--amount N] [--json]',
  options: { date: { type: 'string', desc: 'historical date' }, amount: { type: 'string', desc: 'also convert this local amount to R$' }, 'no-cache': { type: 'boolean', desc: 'ignore the cache' } },
  examples: ['./atr fx CNY', './atr fx KRW --amount 15000'],
  async run(o, pos) {
    const cur = (pos[0] || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) return fail('give a currency code, e.g. `./atr fx CNY` (CNY, KRW, JPY, HKD, THB)');
    const { getRate, toBRL } = await import('../lib/fx.js');
    const r = await getRate(cur, { date: o.date, noCache: o['no-cache'] });
    const amount = o.amount !== undefined ? Number(o.amount) : undefined;
    const brl = amount !== undefined ? toBRL(amount, r.rate) : undefined;
    if (amount !== undefined && !Number.isFinite(amount)) return fail(`--amount must be a number, e.g. \`./atr fx ${cur} --amount 40\``);
    // The converted amount goes on the FIRST line (people pipe this through `head`).
    out(o, { ...r, ...(amount !== undefined ? { amount, brl } : {}) },
      `${amount !== undefined ? `${amount} ${cur} = R$ ${brl}\n` : ''}1 ${cur} = R$ ${r.rate}  (${r.date}, ${r.source}${r.cached ? ', cached' : ''})\n\npaste into place.yaml:\nfx: { rate: ${r.rate}, date: ${r.date}, source: "${r.source}" }`);
  },
});

// ───────────────────────── media ─────────────────────────
cmd('media', {
  summary: 'find, fetch and list licensed photos (Wikimedia Commons) with automatic credits',
  usage: `./atr media search "<query>" [--limit N] [--all]
       ./atr media fetch <place-id|path> "File:Name.jpg"|<commons-url> [--as <name>]
       ./atr media fetch <place-id|path> "File:A.jpg" --as a "File:B.jpg" --as b   (several at once, paced; the n-th --as names the n-th file)
       ./atr media fetch --area <area-id> "File:Name.jpg" [--as <name>]   (recorded for that area in the shared credits.yaml)
       ./atr media add <place-id|path> <local-file> --author "…" --license "CC BY 4.0" --source-url <url> [--license-url <url>] [--as <name>]
       ./atr media preview "<query>" | "File:A.jpg" ["File:B.jpg" …]   (saves local JPGs + a contact sheet to open with Read)
       ./atr media fetch <place-id|path> | --area <area-id> --queued [--patient]   (fetch the files queued for later)
       ./atr media queue                                  (files waiting for Commons to stop rate-limiting)
       ./atr media list <place-id|path> | --area <area-id>
       ./atr media remove <place-id|path> <name>          (deletes its WebP files + credits entry)
       ./atr media prune <place-id|path> [--yes]          (lists media place.yaml doesn't use; --yes deletes them)
       ./atr media prune --area <area-id> [--yes]         (only photos fetched for that area that its card and page don't use)`,
  details: 'fetch downloads a 1920 px copy (or the original when smaller), stores WebP at 640/1280/1920 px in <place>/media/ and writes media/credits.yaml (author, license, URLs; the author is trimmed to the name). Non-free licenses (NC/ND/fair use) are rejected. Use the printed `name` in place.yaml (hero.image, gallery.images[].file, cover).\nCommons rate limits: every session on this machine shares one queue and one cooldown (.cache/commons-cooldown.json), and a 429 with Retry-After makes them all wait that long. Waits are printed on stderr. A call waits up to 2 min (--patient: 45 min, run it in the background); a file that still cannot be fetched is queued, and the next `media fetch` for the same place (or `--queued`) fetches it.',
  options: { as: { type: 'string', multiple: true, desc: 'media name to save as (default: from the file title); with several files, repeat it in the same order' }, area: { type: 'string', desc: 'target an area card instead of a place' }, limit: { type: 'string', desc: 'search results (default 12)' }, all: { type: 'boolean', desc: 'search: also show non-free results' }, author: { type: 'string' }, license: { type: 'string' }, 'license-url': { type: 'string' }, 'source-url': { type: 'string' }, description: { type: 'string' }, yes: { type: 'boolean', desc: 'prune: actually delete' }, patient: { type: 'boolean', desc: 'fetch/preview: wait up to 45 min for Commons rate limits to clear (run in the background)' }, queued: { type: 'boolean', desc: 'fetch: fetch the files queued for this place/area (all of them with no target)' } },
  examples: ['./atr media search "Yu Garden Shanghai"', './atr media preview "Yu Garden Shanghai"', './atr media fetch yu-garden "File:Yu Garden 1.jpg" --as main-hall', './atr media list yu-garden'],
  async run(o, pos) {
    const m = await import('../lib/media/index.js');
    const sub = pos[0];
    const target = () => {
      if (o.area) { const a = resolveArea(o.area, o); if (!a) throw new Error(`area "${o.area}" not found`); return { mediaDir: path.join(a.dir, 'media'), label: `area ${a.id}` }; }
      const ref = pos[1];
      const p = resolvePlace(ref, o);
      if (!p) throw new Error(`place "${ref}" not found — pass an id (folder name) or a path. Create it first with \`./atr new place\`.`);
      return { mediaDir: path.join(p.dir, 'media'), label: p.id };
    };
    if (sub === 'search') {
      const q = pos.slice(1).join(' ');
      if (!q) return fail('give a search query, e.g. `./atr media search "Yu Garden"`');
      const res = await m.searchCommons(q, { limit: Number(o.limit || 12) });
      const shown = o.all ? res : res.filter((r) => r.free);
      if (o.json) return console.log(JSON.stringify(shown, null, 2));
      if (!shown.length) return console.log(`0 ${o.all ? '' : 'free '}results for "${q}"${res.length ? ` (${res.length} non-free; --all shows them)` : ''}. Try the local-script name (汉字 / 한글 / 日本語 / ไทย), fewer words, or the name of the building or street.`);
      shown.forEach((r, i) => console.log(`${c.bold(String(i + 1).padStart(2))}. ${c.cyan(r.title)}\n    ${r.width}×${r.height} ${r.height > r.width ? 'portrait' : 'landscape'}, ${Math.round((r.size || 0) / 1024)} KB · ${r.free ? c.green(r.license) : c.red(r.license + ' (rejected)')} · ${r.author.slice(0, 60)}\n    ${c.dim(r.description?.slice(0, 120) || '')}\n    preview: ${r.thumb_url}`));
      console.log(c.dim(`\nlook at them: ./atr media preview "${q}"   (contact sheet you can open with Read)\nfetch one:    ./atr media fetch <place-id> "${shown[0].title}" --as <short-name>`));
      return;
    }
    const patienceMs = o.patient ? 45 * 60_000 : undefined;
    if (sub === 'queue') {
      const q = m.readQueue();
      if (o.json) return console.log(JSON.stringify(q, null, 2));
      if (!q.length) return console.log(`${c.green('✔')} no files queued for later`);
      for (const x of q) console.log(`  ${x.label || nameOf(x.mediaDir)}: ${x.ref}${x.name ? ` --as ${x.name}` : ''} ${c.dim(`(queued ${x.added.slice(0, 16).replace('T', ' ')})`)}`);
      return console.log(c.dim(`fetch them: ./atr media fetch <place-id> --queued   (or --area <id> --queued; add --patient and run it in the background)`));
    }
    if (sub === 'preview') {
      const args = pos.slice(1);
      const files = args.length > 1 && args.every((a) => /^(File:|Image:)/i.test(a) || /^https?:\/\//.test(a));
      const q = files ? args : args.join(' ');
      if (!args.length) return fail('give a search query or "File:Name.jpg" (several are fine), e.g. `./atr media preview "Yu Garden"`');
      const r = await m.previewCommons(q, { limit: Number(o.limit || 9), patienceMs });
      if (o.json) return console.log(JSON.stringify(r, null, 2));
      console.log(r.sheet ? `${c.green('✔')} contact sheet (open with Read): ${r.sheet}` : r.items.length ? `${c.red('✖')} no preview could be downloaded (see below); folder: ${r.dir}` : `0 results for "${q}": nothing to preview. Try the local-script name (汉字 / 한글 / 日本語 / ไทย), fewer words, or the name of the building or street.`);
      for (const it of r.items) console.log(it.file ? `  #${it.n} ${it.file}\n      ${it.title} · ${it.width}×${it.height} · ${it.free ? it.license : c.red(it.license + ' (rejected)')}` : `  #${it.n} ${it.title}: ${c.red(it.error)}`);
      console.log(c.dim('Hero needs landscape ≥ 1600 px; the first gallery photo (odd counts) landscape ≥ 1280 px.'));
      return;
    }
    if (sub === 'fetch') {
      const said = (r, i, n, label) => r.credit ? `${c.green('✔')} ${i + 1}/${n} ${label}: saved "${r.credit.file}" (${r.credit.widths.join('/')} px WebP) · ${r.credit.license} · ${r.credit.author}${r.credit.author_shortened ? c.dim(' (author trimmed from the Commons field; check it on the file page)') : ''}` : `${c.red('✖')} ${i + 1}/${n} ${r.ref}: ${r.error}${r.queued ? c.yellow('\n    queued for later: the next `./atr media fetch` for this place fetches it (or run with --queued --patient in the background). Do not use it in place.yaml until it is saved.') : ''}`;
      if (o.queued && !o.area && !pos[1]) {
        const rs = await m.drainQueue({ patienceMs, onItem: (r, i, n) => { if (!o.json) console.log(said(r, i, n, nameOf(r.mediaDir))); } });
        if (o.json) console.log(JSON.stringify(rs, null, 2)); else if (!rs.length) console.log(`${c.green('✔')} no files queued for later`);
        if (rs.some((r) => r.error)) process.exitCode = 1;
        return;
      }
      const t = target();
      const refs = pos.slice(o.area ? 1 : 2);
      const names = o.as || [];
      const area = o.area ? resolveArea(o.area, o).id : undefined;
      const label = o.area ? `--area ${area}` : t.label;
      // Files queued earlier for this place/area come first.
      const waiting = m.queuedFor(t.mediaDir).filter((x) => !refs.some((r) => m.toFileTitle(r) === x.ref));
      if (waiting.length && (o.queued || refs.length)) {
        if (!o.json) console.log(`fetching ${waiting.length} file(s) queued earlier for ${t.label}…`);
        const rq = await m.drainQueue({ mediaDir: t.mediaDir, patienceMs, onItem: (r, i, n) => { if (!o.json) console.log(said(r, i, n, t.label)); } });
        if (rq.some((r) => r.error)) process.exitCode = 1;
        if (!refs.length) { if (o.json) console.log(JSON.stringify(rq, null, 2)); return; }
      } else if (o.queued && !refs.length) return out(o, [], `${c.green('✔')} nothing queued for ${t.label}`);
      if (!refs.length) return fail('give a Commons file: "File:Name.jpg" or a commons.wikimedia.org / upload.wikimedia.org URL (several are fine)');
      if (names.length > refs.length) return fail(`${names.length} --as names for ${refs.length} file(s): give one --as per file, in the same order`);
      if (refs.length === 1) {
        const [r] = await m.fetchCommonsMany([{ ref: refs[0], name: names[0] }], t.mediaDir, { area, patienceMs, queue: true, label });
        if (r.error) { if (o.json) console.log(JSON.stringify(r, null, 2)); return fail(said(r, 0, 1, t.label).replace(/^\S+ 1\/1 /, '')); }
        const cr = r.credit;
        return out(o, cr, `${c.green('✔')} ${t.label}: saved "${cr.file}" (${cr.widths.join('/')} px WebP) · ${cr.license} · ${cr.author}${cr.author_shortened ? c.dim(' (author trimmed from the Commons field; check it on the file page)') : ''}\n  use it as:  image: ${cr.file}${!names[0] && /^photo-/.test(cr.file) ? c.dim('\n  (the file name has no Latin letters; give --as <short-name> for a readable name)') : ''}`);
      }
      if (!o.json) console.log(`fetching ${refs.length} files, one at a time (Commons pacing is shared with other sessions; waits are shown on stderr)…`);
      const rs = await m.fetchCommonsMany(refs.map((ref, i) => ({ ref, name: names[i] })), t.mediaDir, { area, patienceMs, queue: true, label, onItem: (r, i, n) => { if (!o.json) console.log(said(r, i, n, t.label)); } });
      if (o.json) console.log(JSON.stringify(rs, null, 2));
      else console.log(`  use them as:  ${rs.filter((r) => r.credit).map((r) => r.credit.file).join(', ') || '(none saved)'}`);
      if (rs.some((r) => r.error)) process.exitCode = 1;
      return;
    }
    if (sub === 'add') {
      const t = target();
      const src = o.area ? pos[1] : pos[2];
      if (!src || !fs.existsSync(src)) return fail('give an existing local image file');
      const cr = await m.addLocal(src, t.mediaDir, { name: o.as?.[0], area: o.area ? resolveArea(o.area, o).id : undefined, author: o.author, license: o.license, license_url: o['license-url'], source_url: o['source-url'], description: o.description });
      return out(o, cr, `${c.green('✔')} ${t.label}: added "${cr.file}" (${cr.widths.join('/')} px WebP)\n  use it as:  image: ${cr.file}`);
    }
    if (sub === 'list') {
      const t = target();
      let list = m.listMedia(t.mediaDir);
      let others = '';
      if (o.area) { // the folder is shared by every area of the country: show this area's photos
        const a = resolveArea(o.area, o);
        const { referencedMedia } = await import('../lib/validate.js');
        const { parse } = await import('yaml');
        const used = referencedMedia(parse(fs.readFileSync(a.file, 'utf8')));
        const mine = list.filter((x) => x.area === a.id || used.has(x.file));
        const untagged = list.filter((x) => !x.area && !used.has(x.file));
        others = `${list.length - mine.length} other photo(s) in ${nameOf(t.mediaDir)} are not this area's${untagged.length ? ` (${untagged.length} of them have no area recorded: ${untagged.map((x) => x.file).join(', ')})` : ''}`;
        list = mine.map((x) => ({ ...x, used: used.has(x.file) }));
      }
      if (o.json) return console.log(JSON.stringify(list, null, 2));
      if (!list.length) return console.log(`no media for ${t.label} yet — \`./atr media search "<query>"\` then \`fetch\``);
      console.log(table(list.map((x) => [x.file, x.widths?.join('/'), x.license, String(x.author).slice(0, 40), x.files.length ? (x.used === false ? c.yellow('not used') : '') : c.red('missing files')]), ['name', 'widths', 'license', 'author', '']));
      if (others) console.log(c.dim(others));
      return;
    }
    if (sub === 'remove') {
      const t = target();
      const name = o.area ? pos[1] : pos[2];
      if (!name) return fail('give the media name to remove (see ./atr media list)');
      const removed = m.removeMedia(t.mediaDir, name);
      return out(o, { removed }, `${c.green('✔')} ${t.label}: removed "${name}" (${removed.length} file(s) + credits entry). Remove it from place.yaml too if it is still referenced.`);
    }
    if (sub === 'prune') {
      const t = target();
      const { referencedMedia } = await import('../lib/validate.js');
      const { parse } = await import('yaml');
      let used, unused;
      if (o.area) { // the folder is shared by every area of the country: only touch photos recorded for THIS area
        const a = resolveArea(o.area, o);
        used = referencedMedia(parse(fs.readFileSync(a.file, 'utf8')));
        const credits = m.readCredits(t.mediaDir);
        unused = credits.filter((x) => x.area === a.id && !used.has(x.file)).map((x) => x.file).sort();
        const everyUse = new Set(fs.readdirSync(a.dir).filter((f) => /\.ya?ml$/.test(f) && f !== 'credits.yaml').flatMap((f) => { try { return [...referencedMedia(parse(fs.readFileSync(path.join(a.dir, f), 'utf8')))]; } catch { return []; } }));
        const untagged = credits.filter((x) => !x.area && !everyUse.has(x.file)).map((x) => x.file);
        if (untagged.length && !o.json) console.log(c.dim(`not touched: ${untagged.join(', ')} (no area recorded and no area uses them; remove one with ./atr media remove --area ${a.id} <name>)`));
      } else { const p = resolvePlace(pos[1], o); used = referencedMedia(parse(fs.readFileSync(p.file, 'utf8'))); unused = m.unusedMedia(t.mediaDir, used); }
      if (!unused.length) return out(o, { unused }, `${c.green('✔')} ${t.label}: every media item is used`);
      if (!o.yes) return out(o, { unused }, `${t.label}: not used by the page: ${unused.join(', ')}\n  delete them with: ./atr media prune ${o.area ? `--area ${o.area}` : pos[1]} --yes`);
      for (const n of unused) m.removeMedia(t.mediaDir, n);
      return out(o, { removed: unused }, `${c.green('✔')} ${t.label}: removed ${unused.join(', ')}`);
    }
    fail('subcommand: search | preview | fetch | add | list | remove | prune (see ./atr media --help)');
  },
});

// ───────────────────────── build / preview ─────────────────────────
cmd('build', {
  summary: 'build the static site (index, place pages, areas page) into build/',
  usage: './atr build [--fixtures] [--json]',
  details: 'Real data → build/. Fixture mode → build/fixtures/. Fixtures never appear in the real build. The site is built in a staging folder and swapped in under a lock, so two builds at once do not break each other. Pages with validation errors (TODOs left) get their own page but are not listed on the index, areas page or area pages.',
  options: {},
  async run(o) {
    const { buildSite } = await import('../lib/build.js');
    const r = await buildSite(o);
    out(o, r, `${c.green('✔')} built ${r.places} place page(s), ${r.areas} area page(s) → ${r.dir}\n  index: ${r.index}${r.unlisted?.length ? `\n  ${c.dim(`not listed on the index, areas or area pages (validation errors, e.g. TODOs left): ${r.unlisted.join(', ')}`)}` : ''}`);
  },
});

cmd('preview', {
  summary: 'serve the built site on http://localhost:<port>',
  usage: './atr preview [--port 4321] [--fixtures] [--no-build]',
  options: { port: { type: 'string', desc: 'port (default 4321)' }, 'no-build': { type: 'boolean', desc: 'serve without rebuilding' } },
  async run(o) {
    const { buildSite, siteDir } = await import('../lib/build.js');
    if (!o['no-build']) await buildSite(o);
    const root = siteDir(o);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.js': 'text/javascript' };
    const port = Number(o.port || 4321);
    http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(port, () => console.log(`serving ${root} at http://localhost:${port}/  (Ctrl+C to stop)`));
  },
});

// ───────────────────────── game ─────────────────────────
cmd('game', {
  summary: 'play the ranking game in your browser (local server; swipes, duels, board, holidays, Ask)',
  usage: './atr game [--port 4400] [--open] [--fixtures] [--root <data dir>] [--feedback <dir>]',
  details: 'Starts a local server on a free port and prints the URL. Re-reads places/ and areas/ on every request, so new curator content appears on refresh (marked "New"). Writes feedback/*.jsonl (docs/FEEDBACK-FORMAT.md) and feedback/game-state.json.',
  options: { port: { type: 'string', desc: 'preferred port (default 4400, else any free port)' }, open: { type: 'boolean', desc: 'open the browser' }, root: { type: 'string', desc: 'another data root (places/ areas/ feedback/), e.g. game/test/fixtures' }, feedback: { type: 'string', desc: 'feedback directory (default <data root>/feedback)' } },
  examples: ['./atr game', './atr game --open', './atr game --root game/test/fixtures --feedback /tmp/atr-fb'],
  async run(o) {
    const { main: game } = await import('../../game/server.js');
    const args = [];
    if (o.port) args.push('--port', o.port);
    if (o.open) args.push('--open');
    if (o.root) args.push('--root', o.root);
    if (o.feedback) args.push('--feedback', o.feedback);
    await game(args);
  },
});

// ───────────────────────── shot ─────────────────────────
cmd('shot', {
  summary: 'screenshot a place page (PNG) so you can check it visually',
  usage: './atr shot <place-id|area-id|path|index|areas> [--area] [--theme light|dark|both] [--device desktop|phone|both] [--viewport] [--no-build]',
  details: 'Builds first (into a private folder, so parallel sessions do not collide; it is removed afterwards), then writes build/shots/<id>-<device>-<theme>.png (full page, 1×), readable slices <id>-<device>-<theme>-s01.png… (phone 1100 px, desktop 1500 px tall), plus <id>-phone-<theme>-top.png (first screen at 2×, to judge hero sharpness), and prints absolute paths. --section <block> shoots one block at 2×. Fixture shots go to build/fixtures/shots/. Open the PNGs with your Read tool. Warns on horizontal overflow.',
  options: { theme: { type: 'string', desc: 'light | dark | both (default both)' }, device: { type: 'string', desc: 'desktop | phone | both (default both)' }, viewport: { type: 'boolean', desc: 'only the first screen instead of the full page' }, full: { type: 'boolean', desc: 'full page (default)' }, 'no-build': { type: 'boolean', desc: 'skip the build' }, 'no-sections': { type: 'boolean', desc: 'do not write the -sNN.png slices' }, only: { type: 'string', desc: 'same as --device (phone | desktop)' }, section: { type: 'string', desc: 'screenshot just one block type at 2× (e.g. map, book_ahead, gallery, quick_facts, hero; on area pages also facts, winter, must_do, places; on the areas page country_map, or \"country_map korea\" for one country)' }, area: { type: 'boolean', desc: 'the id is an area (only needed when a place has the same id)' } },
  examples: ['./atr shot yu-garden', './atr shot yu-garden --section book_ahead --device phone', './atr shot yu-garden --device phone --theme dark', './atr shot index --device desktop --theme light'],
  async run(o, pos) {
    const { buildSite, siteDir, privateSiteDir } = await import('../lib/build.js');
    const { shoot } = await import('../lib/shot.js');
    const ref = pos[0];
    if (!ref) return fail('which page? give a place id/path, an area id, or "index" / "areas"');
    // Each shot builds into its own folder (build/.private/<pid>-…), removed afterwards: a session building or
    // shooting at the same moment can no longer delete the page under this one. --no-build shoots the shared build/.
    const site = o['no-build'] ? siteDir(o) : privateSiteDir(o);
    if (!o['no-build']) {
      process.once('exit', () => { try { fs.rmSync(site, { recursive: true, force: true }); } catch { /* best effort */ } });
      await buildSite({ ...o, siteDir: site });
    }
    let id, file;
    if (ref === 'index') { id = 'index'; file = path.join(site, 'index.html'); }
    else if (ref === 'areas') { id = 'areas'; file = path.join(site, 'areas.html'); }
    else {
      // A place id wins; an area id (or --area) shoots the area page. Area shots are named area-<id>-….
      const p = o.area ? null : resolvePlace(ref, o);
      const a = p ? null : resolveArea(ref, o);
      if (!p && !a) return fail(`no place or area "${ref}"${isFixtureMode(o) ? '' : ' (fixture? add --fixtures)'}`);
      if (p) { id = p.id; file = path.join(site, 'places', id, 'index.html'); }
      else { id = `area-${a.id}`; file = path.join(site, 'areas', a.id, 'index.html'); }
    }
    if (!fs.existsSync(file)) return fail(`page not built: ${file}`);
    const themes = !o.theme || o.theme === 'both' ? ['light', 'dark'] : [o.theme];
    const dev = o.only || o.device;
    const devices = !dev || dev === 'both' ? ['desktop', 'phone'] : [dev];
    const shotsDir = path.join(siteDir(o), 'shots'); // fixtures → build/fixtures/shots (ids may clash with real places)
    if (o.section) {
      const { shootSection } = await import('../lib/shot.js');
      const sj = devices.flatMap((d) => themes.map((t) => ({ file, device: d, theme: t, out: path.join(shotsDir, `${id}-${d}-${t}-${o.section.trim().replace(/\s+/g, "-")}.png`) })));
      const sr = await shootSection(sj, o.section);
      if (o.json) return console.log(JSON.stringify(sr, null, 2));
      for (const r of sr) console.log(r.missing ? c.red(`no "${o.section}" block on ${id} (blocks: ${BLOCK_TYPES.join(', ')})`) : r.out);
      return;
    }
    const jobs = devices.flatMap((d) => themes.map((t) => ({ file, device: d, theme: t, out: path.join(shotsDir, `${id}-${d}-${t}.png`) })));
    // Full-page shots are 1×; add a sharp 2× above-the-fold phone shot to judge the hero.
    if (!o.viewport && devices.includes('phone')) for (const t of themes) jobs.push({ file, device: 'phone', theme: t, full: false, out: path.join(shotsDir, `${id}-phone-${t}-top.png`) });
    const res = await shoot(jobs, { full: !o.viewport });
    if (!o.viewport && !o['no-sections']) {
      const { sliceShot, sliceMap } = await import('../lib/shot.js');
      for (const r of res) if (r.full !== false) r.sections = sliceMap(await sliceShot(r.out, r.device === 'phone' ? 1100 : 1500), r.blocks);
    }
    if (o.json) return console.log(JSON.stringify(res, null, 2));
    for (const r of res) {
      console.log(`${r.out}${r.overflowX ? c.red(`   ⚠ horizontal overflow ${r.overflowX}px`) : ''}`);
      for (const s of r.sections || []) console.log(`  ${s.file}  ${c.dim('← ' + (s.blocks.join(', ') || '—'))}`);
    }
  },
});

// ───────────────────────── gaps ─────────────────────────
cmd('gaps', {
  summary: 'every gap: must-do list, coverage vs days, interest-weighted balance, discovery mix, stays, areas, weak pages, stale sources',
  usage: './atr gaps [--country <c>] [--json]',
  details: 'Taste-aware when config/taste.yaml exists (see ./atr taste). Stays are not attractions: they are counted apart. Thresholds: `gaps:` in config/trip.yaml. For a ranked to-do list use ./atr next.',
  options: { country: { type: 'string', desc: 'only this country (must-do items without a country are kept)' } },
  async run(o) {
    const { gapReport, formatGaps } = await import('../lib/gaps.js');
    if (o.country && !COUNTRY_IDS.includes(o.country)) return fail(`--country must be one of: ${COUNTRY_IDS.join(', ')}${nearest(o.country, COUNTRY_IDS) ? ` (did you mean ${nearest(o.country, COUNTRY_IDS)}?)` : ''}`);
    const r = gapReport(o);
    if (o.country) { r.items = r.items.filter((i) => i.country === o.country || (!i.country && i.kind === 'must-do')); r.stats = { [o.country]: r.stats[o.country] }; r.mustDo = r.mustDo.filter((m) => !m.country || m.country === o.country); }
    out(o, r, formatGaps(r, c));
  },
});

// ───────────────────────── taste ─────────────────────────
cmd('taste', {
  summary: 'what the traveler said they want: goal, interests, must-do list with status; plus what the game logged',
  usage: './atr taste [--json]',
  details: 'Reads config/taste.yaml (stated taste, owned by the orchestrator) and the feedback logs. A place or area claims a must-do item with `must_do: <key>`.',
  options: {},
  async run(o) {
    const { readTaste, mustDoStatus, tasteDisagreements, formatStatedTaste } = await import('../lib/taste.js');
    const { readFeedback, tasteSummary } = await import('../lib/feedback/index.js');
    const { loadTripConfig } = await import('../lib/config.js');
    const { formatIssue } = await import('./ui.js');
    const rt = readTaste(o);
    if (!rt.exists) return out(o, { taste: null, file: rt.file }, `No stated taste: ${nameOf(rt.file)} does not exist. Go by ./atr gaps and ./atr feedback.`);
    if (!rt.taste) {
      if (o.json) console.log(JSON.stringify({ taste: null, file: rt.file, issues: rt.issues.map(({ pathArr, ...i }) => i) }, null, 2));
      else console.log(`${c.red('✖')} ${c.bold(nameOf(rt.file))} is malformed (the orchestrator owns this file; curators: note it in places/_friction.md)\n${rt.issues.map(formatIssue).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    const places = loadPlaces(o), areas = loadAreas(o);
    const summary = tasteSummary(readFeedback(dataRoots(o).feedback), { places, areas, cfg: loadTripConfig(o) });
    const data = { taste: rt.taste, mustDo: mustDoStatus(rt.taste, places, areas), summary: { totals: summary.totals, categories: summary.categories }, disagreements: tasteDisagreements(rt.taste, summary) };
    out(o, data, formatStatedTaste(data, c) + (rt.issues.length ? `\n\n${rt.issues.map(formatIssue).join('\n')}` : ''));
  },
});

// ───────────────────────── next ─────────────────────────
cmd('next', {
  summary: 'what to do now: a ranked list of concrete one-line tasks (from gaps + taste), ready for ./atr run',
  usage: './atr next [--count 5] [--country <id>] [--json]',
  details: 'Order: open must-do items (earliest country first) with area cards mixed in, empty fixed cities, stay cards, category deficits by interest, page repairs, new feedback. Each task fits one headless session.',
  options: { count: { type: 'string', desc: 'how many tasks (default 5)' }, country: { type: 'string', desc: 'only this country (plus must-do items without a country)' } },
  examples: ['./atr next', './atr next --count 10 --country china', './atr run --auto 3'],
  async run(o) {
    const { nextTasks, formatNext } = await import('../lib/next.js');
    if (o.country && !COUNTRY_IDS.includes(o.country)) return fail(`--country must be one of: ${COUNTRY_IDS.join(', ')}${nearest(o.country, COUNTRY_IDS) ? ` (did you mean ${nearest(o.country, COUNTRY_IDS)}?)` : ''}`);
    const count = o.count === undefined ? 5 : Number(o.count);
    if (!Number.isInteger(count) || count < 1) return fail('--count must be a whole number ≥ 1');
    const r = nextTasks({ ...o, count });
    out(o, r, formatNext(r, c));
  },
});

// ───────────────────────── feedback ─────────────────────────
cmd('feedback', {
  summary: "summarise the traveler's taste from the game's feedback logs",
  usage: './atr feedback [--since YYYY-MM-DD] [--dir <feedback-dir>] [--json]\n       ./atr feedback --new                 (only what arrived since you last marked it seen, grouped for action)\n       ./atr feedback --place <id>          (every verdict, duel and question for one place or area)\n       ./atr feedback --mark-seen [--upto <ts>]   (after processing: move the cursor)\n       ./atr feedback --mark-seen --place <id>    (only that page\'s feedback is done; the rest stays new)',
  details: 'Reads feedback/swipes.jsonl, duels.jsonl, questions.jsonl, notes.jsonl (the traveler\'s own notes on cards) and route.jsonl (the order of cities and nights per country from the game\'s Route tab; shown under "Route", seeded from `route:` in config/trip.yaml); format: docs/FEEDBACK-FORMAT.md. Bad lines are skipped with a warning. The "seen" cursor is places/_feedback-seen.json; --mark-seen sets it to the newest event (or to --upto, the timestamp --new printed, so events that arrived while you worked stay new).',
  options: { since: { type: 'string', desc: 'only events on/after this date' }, dir: { type: 'string', desc: 'feedback directory' }, new: { type: 'boolean', desc: 'only events after the cursor: questions per place, new musts/skips, area musts' }, place: { type: 'string', desc: 'everything about one place or area id; with --mark-seen: mark only that page\'s feedback as seen' }, 'mark-seen': { type: 'boolean', desc: 'move the cursor (run it after you processed --new)' }, upto: { type: 'string', desc: '--mark-seen: mark seen up to this ISO timestamp' } },
  examples: ['./atr feedback', './atr feedback --new', './atr feedback --place yu-garden', './atr feedback --mark-seen --upto 2026-11-21T11:10:00Z'],
  async run(o) {
    const { readFeedback, tasteSummary, formatTaste, newFeedback, formatNewFeedback, placeFeedback, formatPlaceFeedback, markSeen } = await import('../lib/feedback/index.js');
    const { loadTripConfig } = await import('../lib/config.js');
    const dir = o.dir ? path.resolve(o.dir) : dataRoots(o).feedback;
    if (o['mark-seen']) {
      if (o.upto && isNaN(Date.parse(o.upto))) return fail(`--upto must be an ISO timestamp like 2026-11-21T11:10:00Z (./atr feedback --new prints it)`);
      const r = markSeen(readFeedback(dir), { ...o, ts: o.upto, place: o.place });
      if (o.place) return out(o, r, r.ts ? `${c.green('✔')} feedback on ${o.place} up to ${r.ts} marked as seen; other pages' feedback stays new (${nameOf(r.file)})` : `no feedback events for ${o.place}: nothing to mark`);
      return out(o, r, r.ts ? `${c.green('✔')} feedback up to ${r.ts} marked as seen (${nameOf(r.file)})` : 'no feedback events yet: nothing to mark');
    }
    if (o.new) { const n = newFeedback(readFeedback(dir), { ...o, places: loadPlaces(o), areas: loadAreas(o), cfg: loadTripConfig(o) }); return out(o, n, `${c.dim('feedback dir: ' + nameOf(dir))}\n${formatNewFeedback(n, c)}`); }
    if (o.place) { const f = placeFeedback(readFeedback(dir), o.place); return out(o, f, formatPlaceFeedback(f, c)); }
    const fb = readFeedback(dir, { since: o.since });
    const s = tasteSummary(fb, { places: loadPlaces(o), areas: loadAreas(o), cfg: loadTripConfig(o) });
    out(o, s, `${c.dim('feedback dir: ' + nameOf(dir))}\n${formatTaste(s)}`);
  },
});

// ───────────────────────── run ─────────────────────────
cmd('run', {
  summary: 'run a headless curator (claude -p) on a task, looping validate → fix until clean',
  usage: './atr run "<task>" [--max-rounds 3] [--dry-run] [--model <m>] [--effort low|medium|high] [--max-budget-usd N] [--fixtures]\n       ./atr run --auto [N] [--country <id>] [--dry-run] …   (top N tasks from ./atr next, default 1)',
  details: 'Appends docs/CURATOR-GUIDE.md to the system prompt; allows Read, Write, Edit, Bash, WebSearch, WebFetch, Glob, Grep, Agent (subagents) and ToolSearch; denies edits to platform/, docs/, config/, feedback/, game/. After a clean validate it checks the links of the pages the session changed (dead links go back to the session) and runs one independent reviewer session per changed place (./atr review); findings go back to the session once (--review-rounds), then those places are reviewed again. Logs everything to runs/<timestamp>/ (summary.json lists the place/area ids created or changed). Files outside places/ and areas/ that the session itself wrote are reported as violations; files that changed meanwhile for another reason are listed apart.\n--auto runs the top N tasks of ./atr next one after another, each in its own session and runs/ folder, recomputing the list between tasks.',
  options: { 'no-links': { type: 'boolean', desc: 'skip the link check of changed pages' }, 'no-review': { type: 'boolean', desc: 'skip the independent review of changed places' }, 'review-rounds': { type: 'string', desc: 'times review findings go back to the curator (default 1)' }, auto: { type: 'boolean', desc: 'take the task(s) from ./atr next; optional count as the positional: --auto 3' }, country: { type: 'string', desc: '--auto: only tasks for this country' }, 'max-rounds': { type: 'string', desc: 'max claude rounds (default 3)' }, 'dry-run': { type: 'boolean', desc: 'print the command, run nothing' }, model: { type: 'string', desc: 'claude model alias (e.g. sonnet, opus)' }, effort: { type: 'string', desc: 'effort level (default medium)' }, 'max-budget-usd': { type: 'string', desc: 'per-round spend cap' }, 'timeout-min': { type: 'string', desc: 'per-round timeout in minutes (default 60)' } },
  examples: ['./atr run "add 5 nightlife places in Seoul" --dry-run', './atr run --auto 3 --dry-run', './atr run --auto', './atr run "process new feedback: read ./atr feedback and add 3 places matching the taste"'],
  async run(o, pos) {
    const { runCurator, runAuto, describeContent } = await import('../lib/runner.js');
    const common = { maxRounds: Number(o['max-rounds'] || 3), dryRun: o['dry-run'], model: o.model, effort: o.effort || 'medium', maxBudgetUsd: o['max-budget-usd'], fixtures: isFixtureMode(o), timeoutMin: Number(o['timeout-min'] || 60), log: o.json ? () => {} : console.log, links: !o['no-links'], review: !o['no-review'], reviewRounds: o['review-rounds'] === undefined ? 1 : Number(o['review-rounds']) };
    const report = (r) => {
      if (!r.clean && r.why_not_clean?.length) console.log(c.red(`\nnot clean because:\n  ${r.why_not_clean.join('\n  ')}`));
      if (r.other_errors?.length) console.log(c.dim(`${r.other_errors.reduce((n, x) => n + x.errors, 0)} validation error(s) in ${r.other_errors.length} file(s) this session did not touch (another curator's work): ${r.other_errors.map((x) => x.file).join(', ')}`));
      console.log(`\n${r.clean ? c.green('✔ clean') : c.red('✖ not clean')} after ${r.rounds.length} round(s) · ${describeContent(r.content)}${r.cost !== undefined ? ` · $${r.cost.toFixed(2)}` : ''} · ${r.minutes} min · logs: ${r.dir}`);
      if (r.pages?.length) console.log(table(r.pages.map((p) => [p.id, p.type, p.change, p.validation || '', p.links, p.review, p.open_issues || '']), ['page', 'type', 'change', 'validate', 'links', 'review', 'open issues']));
      if (r.cost_review) console.log(c.dim(`cost: curator $${(r.cost_curator ?? 0).toFixed(2)} + reviewers $${r.cost_review.toFixed(2)}`));
      if (r.also_changed_in_repo) console.log(c.dim(`also changed in the repo during the run (not by this session): ${describeContent(r.also_changed_in_repo)}`));
      if (r.violations.length) console.log(c.red(c.bold(`⚠ VIOLATION: this session wrote ${r.violations.length} file(s) outside places/ and areas/:\n  ${r.violations.join('\n  ')}`)));
      if (r.changed_elsewhere.length) console.log(c.dim(`${r.changed_elsewhere.length} other file(s) changed outside places/ and areas/ during the run, not by this session (another process?); listed in summary.json`));
    };
    if (o.auto) {
      const count = pos.length ? Number(pos[0]) : 1;
      if (pos.length > 1 || !Number.isInteger(count) || count < 1) return fail('--auto takes an optional count: ./atr run --auto 3   (for a task of your own, drop --auto)');
      const a = await runAuto({ ...common, count, country: o.country });
      if (o.json) return console.log(JSON.stringify(a, null, 2));
      if (a.dryRun) return;
      for (const r of a.runs) report(r);
      if (a.runs.length) console.log('\n' + table(a.runs.map((r, i) => [i + 1, r.task.length > 64 ? r.task.slice(0, 61) + '…' : r.task, r.clean ? 'yes' : 'NO', describeContent(r.content) + (r.pages?.some((p) => p.review !== 'skipped') ? ` · review ${r.pages.filter((p) => p.review === 'pass').length} pass, ${r.pages.filter((p) => p.review === 'fix').length} fix` : ''), r.cost !== undefined ? `$${r.cost.toFixed(2)}` : '–', r.minutes, r.violations.length || '']), ['#', 'task', 'clean', 'added / changed', 'cost', 'min', 'violations']));
      if (a.runs.some((r) => !r.clean || r.violations.length)) process.exitCode = 1;
      return;
    }
    const task = pos.join(' ').trim();
    if (!task) return fail('give a task in quotes, e.g. ./atr run "add 5 food places in Shanghai" — or let the platform choose: ./atr run --auto');
    const r = await runCurator({ ...common, task });
    if (o.json) return console.log(JSON.stringify(r, null, 2));
    if (r.dryRun) return;
    report(r);
    const last = r.rounds.at(-1);
    if (last?.result) console.log(`\n${c.dim('curator report:')}\n${last.result}`);
    if (!r.clean) process.exitCode = 1;
  },
});

// ───────────────────────── links ─────────────────────────
function contentFiles(o, refs) {
  const files = [];
  for (const ref of refs) {
    const p = resolvePlace(ref, o), a = p ? null : resolveArea(ref, o);
    if (!p && !a) throw new Error(`nothing found for "${ref}" (not a place id, area id or path)`);
    files.push(p ? { file: p.file, id: p.id, kind: 'place' } : { file: a.file, id: a.id, kind: 'area' });
  }
  return files;
}
cmd('links', {
  summary: 'open every URL of a place or area (sources, booking links, links in text) and report dead or moved ones',
  usage: './atr links [<id|path> …|--all] [--fresh] [--no-browser] [--json]',
  details: 'ok (2xx, or opens in Chrome) · dead (404/410, no such domain, refused, TLS failure, and Chrome cannot open it either) = error, exit 1 · moved (redirects to a home page) and timeout (no answer, or a DNS problem on this machine) = warning · blocked (401/403/429/5xx or a bot-check page in Chrome too, or a known bot-walled host such as trip.com / klook.com) = info. Before calling a link dead or blocked, a DNS or connection failure is retried, a DNS failure is checked with the system resolver (and "DNS unavailable" is reported when nothing resolves), and the page is opened in Chrome as `./atr render` would; a page only Chrome can open counts as ok. Each problem says why (DNS, connection, TLS, HTTP code, bot check). Results are cached in .cache/links.json: 24 h, but only 1 h for network failures; a cached result says so (--fresh re-checks); ./atr gaps shows the cached problems. With ATR_OFFLINE=1 nothing is checked.',
  options: { all: { type: 'boolean', desc: 'check every place and area' }, fresh: { type: 'boolean', desc: 'ignore the cache' }, 'no-browser': { type: 'boolean', desc: 'do not open failing links in Chrome' } },
  examples: ['./atr links liziba-station', './atr links --all', './atr links yu-garden --fresh --json'],
  async run(o, pos) {
    const { linkReport } = await import('../lib/links.js');
    const files = pos.length && !o.all ? contentFiles(o, pos)
      : [...loadPlaces(o).map((p) => ({ file: p._meta.file, id: p.id, kind: 'place' })), ...loadAreas(o).map((a) => ({ file: a._meta.file, id: a.id, kind: 'area' }))];
    const r = await linkReport(files, { fresh: o.fresh, browser: !o['no-browser'], onBrowser: o.json ? undefined : (u) => process.stderr.write(c.dim(`  opening in Chrome: ${u}\n`)) });
    if (r.offline) return out(o, r, `${c.yellow('▲')} ATR_OFFLINE=1: links can't be checked offline. Nothing was checked.`);
    if (o.json) console.log(JSON.stringify({ ...r, results: r.results.map((x) => ({ ...x, issues: x.issues.map(({ pathArr, ...i }) => i) })) }, null, 2));
    else {
      const { formatIssue } = await import('./ui.js');
      for (const x of r.results) {
        const shown = x.issues;
        if (!shown.length) { console.log(`${c.green('✔')} ${nameOf(x.file)} ${c.dim(`— ${x.links} link(s) ok`)}`); continue; }
        const e = shown.filter((i) => i.level === 'error').length;
        console.log(`${e ? c.red('✖') : shown.some((i) => i.level === 'warning') ? c.yellow('▲') : c.cyan('ℹ')} ${c.bold(nameOf(x.file))} ${c.dim(`— ${x.links} link(s): ${shown.map((i) => i.status).join(', ')}`)}`);
        for (const i of shown) console.log(formatIssue(i));
        console.log('');
      }
      const k = r.counts;
      console.log(`${r.errors ? c.red('✖') : c.green('✔')} ${k.ok} ok · ${k.dead} dead · ${k.moved} moved · ${k.timeout} timeout · ${k.blocked} blocked (can't be checked automatically) in ${r.results.length} file(s)`);
      if (r.viaBrowser?.length) console.log(c.dim(`  ${r.viaBrowser.length} of the ok links open only in a browser (a plain request failed): ${r.viaBrowser.join(', ')}`));
      if (r.cached) console.log(c.dim(`  ${r.cached} result(s) came from the cache (.cache/links.json); --fresh re-checks them`));
    }
    if (r.errors) process.exitCode = 1;
  },
});

// ───────────────────────── review ─────────────────────────
cmd('review', {
  summary: 'independent review: a fresh headless session fact-checks a place or area against its sources and writes reviews/<id>.yaml',
  usage: './atr review <place-id|area-id> … | --changed | --all [--area] [--dry-run] [--model <m>] [--effort low|medium|high] [--max-budget-usd N] [--json]',
  details: 'The reviewer follows docs/REVIEWER-GUIDE.md. It may read, search the web and run ./atr (shot, validate, taste, links); every file edit is denied. It answers with JSON (facts checked, issues with severity blocker | should | nit, summary); the verdict is "fix" when there is a blocker or a should. --changed reviews places that were never reviewed or changed since their review. ./atr gaps and ./atr next show open findings.',
  options: { changed: { type: 'boolean', desc: 'places and areas with no review or a stale one' }, all: { type: 'boolean', desc: 'every place and area' }, area: { type: 'boolean', desc: 'the ids are areas (only needed when a place has the same id)' }, full: { type: 'boolean', desc: 'a full audit even when the page has an earlier review (default: a re-review of the earlier findings and what changed since)' }, 'dry-run': { type: 'boolean', desc: 'print the command, run nothing' }, model: { type: 'string', desc: 'claude model alias' }, effort: { type: 'string', desc: 'effort level (default medium)' }, 'max-budget-usd': { type: 'string', desc: 'spend cap per reviewer session' }, 'timeout-min': { type: 'string', desc: 'timeout per session in minutes (default 30)' } },
  examples: ['./atr review liziba-station', './atr review --changed --dry-run', './atr review --all --max-budget-usd 2'],
  async run(o, pos) {
    const { reviewTargets, reviewPlaces } = await import('../lib/review.js');
    const fixtures = isFixtureMode(o);
    const ids = reviewTargets({ ids: pos, changed: o.changed, all: o.all, fixtures });
    if (!ids.length) return pos.length || o.changed || o.all ? out(o, { reviews: [] }, `${c.green('✔')} nothing to review: every place has a current review`) : fail('which place? ./atr review <id> …, or --changed, or --all');
    for (const id of ids) if (!resolvePlace(id, o) && !resolveArea(id, o)) return fail(`no place or area "${id}"`);
    const log = o.json ? () => {} : console.log;
    if (o['dry-run']) log(`Dry run — would review ${ids.length} page(s), one session each: ${ids.join(', ')}\n`);
    const rs = await reviewPlaces(ids, { full: o.full, types: o.area ? Object.fromEntries(ids.map((id) => [id, 'area'])) : undefined, model: o.model, effort: o.effort || 'medium', maxBudgetUsd: o['max-budget-usd'], fixtures, timeoutMin: Number(o['timeout-min'] || 30), dryRun: o['dry-run'], log });
    if (o.json) return console.log(JSON.stringify({ reviews: rs }, null, 2));
    if (o['dry-run']) return;
    console.log('');
    for (const r of rs) {
      if (r.error) { console.log(`${c.red('✖')} ${c.bold(r.id)} ${r.error}`); continue; }
      console.log(`${r.verdict === 'pass' ? c.green('✔ pass') : c.red('✖ fix')} ${c.bold(r.id)} ${c.dim(`— facts: ${r.facts.supported} supported, ${r.facts.unsupported} unsupported, ${r.facts.contradicted} contradicted · $${(r.cost_usd ?? 0).toFixed(2)}${r.parsedFirstTime ? '' : ' · answer needed a retry'} · ${nameOf(r.reviewFile)}`)}`);
      console.log(`  ${r.summary}`);
      if (r.rereview) console.log(c.dim(`  re-review: ${r.resolved.length} earlier finding(s) resolved${r.resolved.length ? ` (${r.resolved.map((x) => x.field).join(', ')})` : ''}`));
      for (const i of r.issues) console.log(`  ${i.severity === 'blocker' ? c.red('blocker') : i.severity === 'should' ? c.yellow('should ') : c.dim('nit    ')} ${c.bold(i.field)}\n          ${i.problem}${i.evidence ? `\n          ${c.dim('evidence:')} ${i.evidence}` : ''}\n          ${c.dim('fix:')}      ${i.fix}`);
      if (r.changedDuringReview) console.log(c.yellow('  ▲ the file changed while the review ran (another session?): the review is already stale.'));
    }
    if (rs.some((r) => r.error)) process.exitCode = 1;
  },
});

// ───────────────────────── geo ─────────────────────────
cmd('geo', {
  summary: 'find WGS84 coordinates for a place name (OpenStreetMap + Wikidata); works with local-script names',
  usage: './atr geo "<query>" [--country <id>] [--fresh] [--json]',
  details: 'Prints up to 5 candidates with name, type, address, lat/lng and an OpenStreetMap link to check the pin. Results are cached in .cache/geo.json; at most one OpenStreetMap request per second. If only the block, mall or complex is found, use it and set location.approximate: true.',
  options: { country: { type: 'string', desc: `limit to one country: ${COUNTRY_IDS.join(', ')}` }, fresh: { type: 'boolean', desc: 'ignore the cache' } },
  examples: ['./atr geo "Yu Garden" --country china', './atr geo "钟书阁 都江堰" --country china', './atr geo "Suga Shrine Yotsuya" --country japan'],
  async run(o, pos) {
    const q = pos.join(' ').trim();
    if (!q) return fail('give a name to search for, e.g. ./atr geo "Yu Garden" --country china');
    if (o.country && !COUNTRY_IDS.includes(o.country)) return fail(`--country must be one of: ${COUNTRY_IDS.join(', ')}${nearest(o.country, COUNTRY_IDS) ? ` (did you mean ${nearest(o.country, COUNTRY_IDS)}?)` : ''}`);
    const { geoSearch, formatGeo } = await import('../lib/geo.js');
    const r = await geoSearch(q, { country: o.country, fresh: o.fresh });
    out(o, r, formatGeo(r, c));
  },
});

// ───────────────────────── hostel-prices ─────────────────────────
cmd('hostel-prices', {
  summary: 'Hostelworld prices per night: cheapest dorm bed and private room (local + R$), sold out / not on sale yet, dated page URL',
  usage: './atr hostel-prices <hostelworld-id|url> --from YYYY-MM-DD [--to YYYY-MM-DD] [--currency KRW] [--json]',
  details: 'Reads the public availability feed Hostelworld\'s own pages use, one request per night (--to is the check-out day; default one night; at most 31). Prices are for 1 guest: dorm per bed, private per room. When the cheapest rate is non-refundable, the cheapest refundable one is shown next to it. An empty night says SOLD OUT when beds are on sale on a later date, NOT ON SALE YET when only earlier dates have beds (a few later dates are probed to tell them apart). Each night prints the dated /pwa/hosteldetails.php page that shows the price in a browser: put that URL in sources; `./atr links` accepts it and the feed URL. Prices are in the hostel\'s currency unless --currency.',
  options: { from: { type: 'string', desc: 'first night (check-in date)' }, to: { type: 'string', desc: 'check-out date (default: the day after --from)' }, currency: { type: 'string', desc: 'price currency (default: the hostel\'s own)' } },
  examples: ['./atr hostel-prices 85799 --from 2027-01-10 --to 2027-01-20', './atr hostel-prices "https://www.hostelworld.com/pwa/hosteldetails.php/Original-Backpackers/Seoul/330544?from=2027-01-11&to=2027-01-12&guests=1" --from 2027-01-11'],
  async run(o, pos) {
    if (!pos[0]) return fail('give a Hostelworld property id or URL, e.g. ./atr hostel-prices 85799 --from 2027-01-10 --to 2027-01-13');
    if (!o.from) return fail('--from YYYY-MM-DD is required (the first night)');
    if (o.currency && !/^[A-Za-z]{3}$/.test(o.currency)) return fail('--currency takes a code such as KRW, JPY, THB');
    const { hostelPrices, formatHostelPrices } = await import('../lib/hostelprices.js');
    if (!o.json) process.stderr.write(c.dim('  reading Hostelworld\'s availability feed, one request per night…\n'));
    const r = await hostelPrices(pos[0], { from: o.from, to: o.to, currency: o.currency });
    out(o, r, formatHostelPrices(r, c));
    if (r.nights.some((n) => n.error)) process.exitCode = 1;
  },
});

// ───────────────────────── sun ─────────────────────────
cmd('sun', {
  summary: 'sunrise, sunset and dusk in local time for a city, area, place or lat,lng (computed here, no website)',
  usage: './atr sun <area-id|place-id|city|lat,lng> [<YYYY-MM-DD>] [--to YYYY-MM-DD] [--tz Area/City] [--json]',
  details: 'Computed with the NOAA solar equations from the coordinates in the area or place file (a city slug uses its area, else the average of its places; any other name is looked up with ./atr geo). Times are local (Asia/Seoul, Asia/Tokyo, …, from the country); within about a minute of sunrise-sunset.org. dusk = civil dusk (sun 6° below the horizon). Default date: today. --to prints one line per day up to that date.',
  options: { to: { type: 'string', desc: 'last date: one line per day' }, tz: { type: 'string', desc: 'IANA time zone for bare coordinates outside the trip countries' } },
  examples: ['./atr sun bangkok 2026-12-15', './atr sun seoul 2027-01-10 --to 2027-01-20', './atr sun 35.3606,138.7274 2026-12-05', './atr sun namsan-tower 2027-01-12'],
  async run(o, pos) {
    const { sunReport, formatSun, TZ } = await import('../lib/sun.js');
    const dateArg = pos.find((p, i) => i > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p));
    const ref = pos.filter((p, i) => !(i > 0 && p === dateArg)).join(' ').trim();
    if (!ref) return fail('which place? ./atr sun <area-id|place-id|city|lat,lng> <YYYY-MM-DD>');
    const date = dateArg || today();
    if (o.to && !/^\d{4}-\d{2}-\d{2}$/.test(o.to)) return fail('--to takes YYYY-MM-DD');
    if (o.tz) { try { new Intl.DateTimeFormat('en', { timeZone: o.tz }); } catch { return fail(`--tz "${o.tz}" is not an IANA time zone (e.g. Asia/Seoul)`); } }
    let where = null;
    const m = ref.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) where = { lat: Number(m[1]), lng: Number(m[2]) };
    else {
      const slug = ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const area = loadAreas(o).find((a) => a.id === slug || path.basename(a._meta.file, '.yaml') === slug);
      const place = !area && loadPlaces(o).find((p) => p.id === slug);
      const inCity = !area && !place && loadPlaces(o).filter((p) => p.city === slug && typeof p.location?.lat === 'number');
      if (area && typeof area.lat === 'number') where = { lat: area.lat, lng: area.lng, name: area.name, country: area.country };
      else if (place && typeof place.location?.lat === 'number') where = { lat: place.location.lat, lng: place.location.lng, name: place.name, country: place.country };
      else if (inCity && inCity.length) where = { lat: Math.round(inCity.reduce((s, p) => s + p.location.lat, 0) / inCity.length * 1e4) / 1e4, lng: Math.round(inCity.reduce((s, p) => s + p.location.lng, 0) / inCity.length * 1e4) / 1e4, name: `${titleCity(slug)} (average of ${inCity.length} places)`, country: inCity[0].country };
      else {
        (await import('../lib/net.js')).useEnvProxy();
        const { geoSearch } = await import('../lib/geo.js');
        const g = await geoSearch(ref, {});
        const hit = g.results?.[0] || g.candidates?.[0];
        if (!hit) return fail(`no area, place or city "${ref}" here, and ./atr geo found nothing; give coordinates: ./atr sun 37.5665,126.978 ${date}`);
        where = { lat: hit.lat, lng: hit.lng, name: `${hit.name} (from ./atr geo: check it is the right place)` };
      }
    }
    if (o.tz) where.tz = o.tz;
    if (!(Math.abs(where.lat) <= 90 && Math.abs(where.lng) <= 180)) return fail('coordinates out of range');
    const { addDays } = await import('../lib/hostelprices.js');
    const dates = [date];
    if (o.to) { if (o.to < date) return fail('--to must not be before the date'); for (let d = addDays(date, 1); d <= o.to && dates.length < 92; d = addDays(d, 1)) dates.push(d); }
    const rs = dates.map((d) => sunReport(where, d));
    if (o.json) return console.log(JSON.stringify(rs.length === 1 ? rs[0] : rs, null, 2));
    if (rs.length === 1) { console.log(formatSun(rs[0], c)); if (rs[0].tz === 'UTC' && !Object.values(TZ).includes(where.tz)) console.log(c.yellow('▲ times are UTC: these coordinates are outside the trip countries; add --tz Area/City')); return; }
    console.log(`${c.bold(rs[0].name)} ${c.dim(`— times in ${rs[0].tz}`)}\n${c.dim('date        first light  sunrise  sunset  dusk   daylight')}`);
    for (const r of rs) console.log(`${r.date}  ${String(r.times.dawn_civil ?? '—').padEnd(11)}  ${String(r.times.sunrise ?? '—').padEnd(7)}  ${String(r.times.sunset ?? '—').padEnd(6)}  ${String(r.times.dusk_civil ?? '—').padEnd(5)}  ${r.day_length ?? '—'}`);
  },
});

// ───────────────────────── render ─────────────────────────
cmd('render', {
  summary: 'load a web page in Chrome and print its visible text (for pages WebFetch sees empty: JavaScript prices, date searches)',
  usage: './atr render <url> [--wait <s>] [--timeout <s>] [--shot] [--links] [--expand] [--click "text=…"]… [--max-chars N] [--json]',
  details: 'Opens the page in the installed Chrome with a normal browser User-Agent, waits for the network to go quiet (plus --wait seconds, default 2), and prints the text a visitor would see. Never runs longer than --timeout seconds (default 60): a page that has not settled by then prints the text rendered so far and "page never settled". Survives pages that redirect or reload after load. Says so when the page is a bot check (Cloudflare "Just a moment…", captcha, HTTP 403/429 with no text) and when it ended on a different URL than the one asked for. Long text (over 20k characters, or cut by --max-chars) is also saved whole to .cache/render/<host>-<hash>.txt: open that with Read, because the shell tool cuts output near 30k characters. --shot also saves a PNG under .cache/render/ (open it with Read; when the text is empty, the screenshot often shows it). At most 3 renders run at once on this machine; more wait for a slot. No cookies are kept between calls. Public http(s) pages only. Never stop a render by killing processes by pattern: use --timeout.',
  options: { wait: { type: 'string', desc: 'extra seconds to wait after the page settles (default 2)' }, timeout: { type: 'string', desc: 'hard limit for the whole render in seconds (default 60)' }, shot: { type: 'boolean', desc: 'also save a screenshot and print its path' }, links: { type: 'boolean', desc: 'also list the links (href, and javascript:/onclick targets)' }, expand: { type: 'boolean', desc: 'open collapsed sections (aria-expanded="false" buttons, <details>) before reading' }, click: { type: 'string', multiple: true, desc: 'click this element first (Playwright selector, e.g. "text=1월" or "#tab-2"); repeatable, in order' }, 'max-chars': { type: 'string', desc: 'cut the printed text after N characters (default 12000)' } },
  examples: ['./atr render "https://www.hostelworld.com/pwa/hosteldetails.php/…?from=2026-12-08&to=2026-12-09&guests=1"', './atr render https://ninehours.co.jp/en/shinjuku-north --shot --wait 5', './atr render https://www.templestay.com/… --links', './atr render https://www.kbl.or.kr/match/schedule --click "text=1월" --timeout 90'],
  async run(o, pos) {
    if (!pos[0]) return fail('give a URL, e.g. ./atr render "https://example.com/page"');
    const { renderPage } = await import('../lib/pageview.js');
    const timeoutS = o.timeout === undefined ? 60 : Number(o.timeout);
    if (!(timeoutS > 0)) return fail('--timeout takes seconds, e.g. --timeout 90');
    // Safety net: whatever Chrome does, this process ends shortly after the timeout.
    setTimeout(() => { process.stderr.write(`atr render: stopped after ${timeoutS + 20} s\n`); process.exit(process.exitCode || 2); }, (timeoutS + 20) * 1000).unref();
    const r = await renderPage(pos[0], { waitS: o.wait === undefined ? 2 : Number(o.wait), timeoutS, shot: o.shot, links: o.links, expand: o.expand, click: o.click, maxChars: o['max-chars'] === undefined ? 12000 : Number(o['max-chars']) });
    if (o.json) return console.log(JSON.stringify(r, null, 2));
    const notes = [];
    if (r.blocked) notes.push(`${c.yellow('▲')} blocked by a bot check (${r.blocked}): the text below is the challenge page, not the content. Try another source, or WebFetch.`);
    if (r.redirected) notes.push(`${c.yellow('▲')} redirected: asked for ${r.url}\n  ended at ${r.finalUrl}  (check it is still the page you meant)`);
    if (!r.settled) notes.push(r.answered === false ? `${c.yellow('▲')} the site never answered within ${timeoutS} s: it is unreachable from this machine right now (not necessarily gone). Try again later or use another source.` : `${c.yellow('▲')} page never settled within ${timeoutS} s: showing the text rendered so far${r.text ? '' : ' (none)'}. Try --timeout ${timeoutS * 2} or --shot.`);
    for (const k of r.clicks || []) if (!k.ok) notes.push(`${c.yellow('▲')} --click "${k.selector}" failed: ${k.error}`);
    if (o.expand) notes.push(c.dim(`--expand opened ${r.expanded ?? 0} section(s)`));
    if (r.textFile) notes.push(`${c.cyan('ℹ')} ${r.truncated ? `text cut at ${r.chars} of ${r.fullChars} characters` : `long page (${r.fullChars} characters)`}: the whole text is in ${r.textFile} (open it with Read)`);
    console.log(`${c.dim(`# ${r.title || '(no title)'} — ${r.finalUrl}${r.status ? ` (HTTP ${r.status})` : ''}`)}${notes.length ? `\n${notes.join('\n')}` : ''}\n${r.blocked ? c.dim(r.text.slice(0, 300)) : r.text || c.yellow(`(the page rendered no visible text${r.shot ? '; look at the screenshot' : '; try --shot and read the screenshot'})`)}`);
    if (r.truncated) console.log(c.dim(`\n… ${r.truncated} more characters cut (--max-chars ${r.chars + r.truncated} shows all${r.textFile ? `, or read ${r.textFile}` : ''})`));
    if (r.links) { console.log(`\n## links (${r.links.length})`); for (const l of r.links) console.log(`${l.text || c.dim('(no text)')} → ${l.href}`); }
    if (r.shot) console.log(`\n${c.green('✔')} screenshot (open with Read): ${r.shot}`);
  },
});

// ───────────────────────── pdf ─────────────────────────
cmd('pdf', {
  summary: 'read a PDF (URL or file): its text, and page images to open with Read (timetables, fare sheets, maps)',
  usage: './atr pdf <url|file> [--pages 1-3,5] [--images] [--max-chars N] [--json]',
  details: 'Downloads the PDF to .cache/pdf/ (up to 100 MB) and prints the text of each page. The whole text is also saved to .cache/pdf/<name>.txt (open it with Read). --images also renders the pages as PNG (about 2000 px wide, at most 20 pages per call) under .cache/pdf/<name>/: use it for scanned PDFs, tables drawn as images, and maps. Pages with no text layer are listed. Cite the PDF URL as the source.',
  options: { pages: { type: 'string', desc: 'pages to read, e.g. 1-3,5 or 4- (default: all)' }, images: { type: 'boolean', desc: 'also save each page as a PNG' }, 'max-chars': { type: 'string', desc: 'cut the printed text after N characters (default 12000)' } },
  examples: ['./atr pdf https://www.seoulhiking.or.kr/theme/basic/img/guide-eng.pdf --pages 1-4', './atr pdf timetable.pdf --images --pages 2'],
  async run(o, pos) {
    if (!pos[0]) return fail('give a PDF URL or file, e.g. ./atr pdf "https://example.com/fares.pdf"');
    const { readPdf } = await import('../lib/pdf.js');
    const r = await readPdf(pos[0], { pages: o.pages, images: o.images });
    if (o.json) return console.log(JSON.stringify(r, null, 2));
    const max = o['max-chars'] === undefined ? 12000 : Number(o['max-chars']);
    console.log(c.dim(`# ${r.title || nameOf(r.file)} — ${r.pageCount} page(s)${r.finalUrl ? ` · ended at ${r.finalUrl}` : ''}`));
    let shown = 0, cut = 0;
    for (const p of r.pages) {
      const head = `--- page ${p.n} ---`;
      if (shown >= max) { cut += p.chars; continue; }
      const t = p.text.slice(0, max - shown);
      cut += p.text.length - t.length;
      shown += t.length;
      console.log(`${c.bold(head)}\n${t || c.dim('(no text on this page)')}`);
    }
    if (cut) console.log(c.dim(`\n… ${cut} more characters cut: the whole text is in ${r.textFile} (open it with Read)`));
    else console.log(c.dim(`\ntext saved to ${r.textFile}`));
    if (r.noText.length) console.log(`${c.yellow('▲')} page(s) ${r.noText.join(', ')} have no text layer (scanned or drawn as images)${o.images ? ': read their PNGs' : `: run again with --images --pages ${r.noText.slice(0, 5).join(',')} and read the PNGs`}`);
    const imgs = r.pages.filter((p) => p.image);
    if (imgs.length) console.log(`${c.green('✔')} page images (open with Read):\n${imgs.map((p) => `  ${p.image}`).join('\n')}${r.imagesCapped ? c.dim(`\n  (first ${r.imagesCapped} pages only; use --pages for the rest)`) : ''}`);
  },
});

// ───────────────────────── qr ─────────────────────────
cmd('qr', {
  summary: 'decode QR codes in an image (file or URL) — e.g. booking links hidden behind WeChat/Trip.com QR notices',
  usage: './atr qr <image-file|image-url> [--json]',
  details: 'Scans the whole image and tiles of it, so a notice with several QR codes returns all of them. Save a screenshot/notice image first if the QR is inside a web page.',
  options: {},
  examples: ['./atr qr ~/Downloads/notice.png', './atr qr https://example.org/booking-notice.jpg'],
  async run(o, pos) {
    if (!pos[0]) return fail('give an image file or image URL');
    const { decodeQrReport } = await import('../lib/qr.js');
    const r = await decodeQrReport(pos[0]);
    if (o.json) return console.log(JSON.stringify(r, null, 2));
    for (const t of r.codes) console.log(t);
    if (!r.codes.length) fail('no standard QR code could be decoded.');
    console.log(c.yellow(`▲ ${r.codes.length} QR code(s) decoded. If the image shows MORE codes than listed here, the others are probably WeChat mini-program "sun codes" (round, with a logo in the middle) or other non-QR codes — those can't be decoded. Use the official website or the Trip.com/Klook page instead, and note it in confidence_note.`));
  },
});

// ───────────────────────── schema ─────────────────────────
cmd('schema', {
  summary: 'export JSON Schema files to platform/schema/ (for the game)',
  usage: './atr schema --export',
  options: { export: { type: 'boolean', desc: 'write platform/schema/*.json' } },
  async run(o) {
    const { FEEDBACK_SPECS } = await import('../lib/feedback/index.js');
    const { tasteSpec } = await import('../lib/taste.js');
    const { reviewSpec } = await import('../lib/review.js');
    const dir = path.join(ROOT, 'platform', 'schema');
    const files = {
      'place.schema.json': { title: 'Place', ...toJsonSchema(placeSpec) },
      'area.schema.json': { title: 'Area card', ...toJsonSchema(areaSpec) },
      'credits.schema.json': { title: 'Media credits', ...toJsonSchema(creditsSpec) },
      'taste.schema.json': { title: 'Stated taste (config/taste.yaml)', ...toJsonSchema(tasteSpec) },
      'review.schema.json': { title: 'Independent review (reviews/<id>.yaml)', ...toJsonSchema(reviewSpec) },
      ...Object.fromEntries(Object.entries(FEEDBACK_SPECS).map(([k, s]) => [`feedback-${k}.schema.json`, { title: `Feedback ${k} event`, ...toJsonSchema(s) }])),
    };
    if (!o.export) return out(o, files, `would write: ${Object.keys(files).join(', ')} (add --export)`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...s }, null, 2) + '\n');
    out(o, Object.keys(files), `${c.green('✔')} wrote ${Object.keys(files).length} schema files to ${nameOf(dir)}`);
  },
});

// ───────────────────────── main ─────────────────────────
export async function main(argv = process.argv.slice(2)) {
  const name = argv[0];
  if (!name || name === '--help' || name === '-h' || name === 'help') { console.log(name === 'help' && argv[1] && COMMANDS[argv[1]] ? helpFor(argv[1]) : mainHelp()); return; }
  const d = COMMANDS[name];
  if (!d) { fail(`unknown command "${name}"${nearest(name, Object.keys(COMMANDS)) ? `. Did you mean "${nearest(name, Object.keys(COMMANDS))}"?` : ''}\n\n${mainHelp()}`); return; }
  const options = Object.fromEntries(Object.entries({ ...d.options, ...COMMON }).map(([k, v]) => [k, { type: v.type || 'string', ...(v.short ? { short: v.short } : {}), ...(v.multiple ? { multiple: true } : {}) }]));
  let parsed;
  try { parsed = parseArgs({ args: argv.slice(1), options, allowPositionals: true, strict: true }); } catch (e) { fail(`${e.message}\n\n${helpFor(name)}`); return; }
  if (parsed.values.help) { console.log(helpFor(name)); return; }
  if (parsed.values.fixtures) process.env.ATR_FIXTURES = '1';
  if (['media', 'links', 'render', 'geo', 'pdf', 'hostel-prices'].includes(name)) (await import('../lib/net.js')).useEnvProxy(); // sandboxed sessions only reach the web through HTTPS_PROXY
  try { await d.run(parsed.values, parsed.positionals); } catch (e) {
    if (moduleLoadError(e)) { console.error(`atr: the platform is being updated; try again in a minute. (${moduleLoadError(e).slice(0, 160)})${process.env.ATR_DEBUG ? '\n' + e.stack : ''}`); process.exitCode = 75; return; }
    fail(e.message + (process.env.ATR_DEBUG ? '\n' + e.stack : ''));
  }
}

/**
 * A platform module that fails to load (half-written file: a parse error, a missing export, a missing file) → a
 * short description; anything else (including JSON.parse errors, also SyntaxErrors) → null. Same rule as ./atr.
 */
export function moduleLoadError(e) {
  const msg = String(e?.message || '');
  if (e?.name === 'SyntaxError' && (/compileSourceTextModule|^file:\/\//.test(e.stack || '') || /does not provide an export named/.test(msg))) return msg.split('\n')[0];
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /Cannot find module/.test(msg)) return msg.replace(/ imported from .*/s, '');
  return null;
}

main();
