#!/usr/bin/env node
// One-off (2026-11-15): turn the Ask box log feedback/questions.jsonl into answer cards (answers/*.md).
// tldr = the logged answer_summary, empty body, asked = the São Paulo date of the timestamp (the traveler asked from
// home, UTC−3). Skips "(no answer …)" lines, keeps the latest of exact duplicate questions on the same id, drops ids
// that are no longer a place, an area or a country. The questions.jsonl file itself is left untouched.
// usage: node game/tools/migrate-questions.js [--write] [--feedback feedback/questions.jsonl] [--out answers]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { stringify } from 'yaml';
import { ROOT, loadPlaces, loadAreas, resolveAbout } from '../../platform/lib/index.js';

const { values: o } = parseArgs({ options: { write: { type: 'boolean' }, feedback: { type: 'string' }, out: { type: 'string' } } });
const src = path.resolve(o.feedback || path.join(ROOT, 'feedback', 'questions.jsonl'));
const outDir = path.resolve(o.out || path.join(ROOT, 'answers'));

// Light cleaning: obvious typos only; the traveler's wording stays.
const TYPOS = [[/\bcreppy\b/g, 'creepy'], [/\bcrepier\b/g, 'creepier'], [/\blugage\b/g, 'luggage'], [/\bliteratelly\b/g, 'literally'], [/\brecomended\b/g, 'recommended'],
  [/\bgrabed\b/g, 'grabbed'], [/\bdools\b/g, 'dolls'], [/\bbetter then\b/g, 'better than'], [/\bspecially\b/g, 'especially'], [/\bdoesnt\b/g, "doesn't"], [/\bits a\b/g, "it's a"],
  [/\bits literally\b/g, "it's literally"], [/\bwdym\b/g, 'what do you mean by'], [/\bwdyt\b/g, 'what do you think,'], [/\bu can\b/g, 'you can'], [/\bwhich st sophia\b/gi, 'which St. Sophia']];
TYPOS.push([/\bcreppier\b/g, 'creepier']);
const NAMES = ['shanghai', 'harbin', 'japan', 'china', 'korea', 'ukraine', 'christmas', 'michelin', 'chiang mai', 'bangkok', 'tokyo', 'brazil', 'akihabara'];
export function cleanQuestion(q) {
  let s = String(q).replace(/\s+/g, ' ').trim();
  for (const [re, to] of TYPOS) s = s.replace(re, to);
  for (const n of NAMES) s = s.replace(new RegExp(`\\b${n}\\b`, 'g'), n.replace(/\b\w/g, (ch) => ch.toUpperCase()));
  s = s.replace(/\s+([?,.!])/g, '$1').replace(/([?.!]\s+)([a-z])/g, (_, p, ch) => p + ch.toUpperCase());
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[?.!]$/.test(s)) s += '?';
  return s;
}

// Short slugs picked by hand for the 34 logged answers (keyed by the log timestamp); anything else gets words of the question.
const SLUGS = {
  '2026-11-10T17:53:01Z': 'harbin-ice-world-drone-show-days', '2026-11-10T17:59:25Z': 'harbin-from-shanghai', '2026-11-11T01:18:15Z': 'huangshan-worth-it-in-winter',
  '2026-11-11T01:19:18Z': 'huangshan-luggage', '2026-11-11T01:22:52Z': 'huangshan-hike-cold-safety', '2026-11-11T03:40:00Z': 'nine-hours-shinjuku-price',
  '2026-11-11T03:49:00Z': 'jiefangbei-nye-vs-drone-show', '2026-11-11T03:51:15Z': 'harbin-st-sophia', '2026-11-12T17:16:38Z': 'club-joule-crowd',
  '2026-11-12T17:28:48Z': 'tomogashima-cost', '2026-11-13T16:22:57Z': 'fenghuang-christmas', '2026-11-13T16:27:55Z': 'khao-yai-car-tour',
  '2026-11-13T16:49:37Z': 'jeju-seongsan-crater', '2026-11-13T17:01:12Z': 'hashima-creepiness', '2026-11-13T19:31:45Z': 'hashima-how-touristy',
  '2026-11-13T19:37:51Z': 'channel-7-fights-and-food', '2026-11-13T19:38:59Z': 'muay-thai-tourists-in-the-ring', '2026-11-13T19:43:03Z': 'khao-san-red-light',
  '2026-11-13T19:58:23Z': 'majang-vs-brazilian-beef', '2026-11-13T20:02:31Z': 'dmz-what-is-closed', '2026-11-13T20:08:04Z': 'den-den-town-vs-akihabara',
  '2026-11-13T20:18:03Z': 'persona-ex-foreigners', '2026-11-13T20:22:50Z': 'sushi-azabu-michelin', '2026-11-13T20:24:13Z': 'sushi-azabu-value',
  '2026-11-13T20:39:42Z': 'easykart-for-a-racer', '2026-11-13T20:42:53Z': 'patpong-ping-pong-show', '2026-11-13T20:46:57Z': 'one-person-downhill-carts',
  '2026-11-13T23:48:42Z': '1000-trees-location-winter', '2026-11-13T23:56:47Z': 'iconsiam-vs-other-malls', '2026-11-14T14:53:09Z': 'skyline-luge-ziplines',
  '2026-11-14T14:56:27Z': 'skyline-luge-from-bangkok', '2026-11-14T15:17:11Z': 'chureito-other-views', '2026-11-14T15:27:38Z': 'iruka-michelin-cheap',
  '2026-11-14T20:36:48Z': 'other-maglevs',
};
const STOP = new Set('a an the is it its this that what which how do does i u you my me to of in on for and or be are can there here so but with from at as than then sounds just'.split(' '));
export function slugOf(q, n = 5) {
  const words = q.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  return words.slice(0, n).join('-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'question';
}

/** São Paulo calendar date (UTC−3, no daylight saving) of an ISO timestamp. */
const spDate = (ts) => new Date(Date.parse(ts) - 3 * 3600e3).toISOString().slice(0, 10);

const lines = fs.readFileSync(src, 'utf8').split('\n').filter((l) => l.trim());
const places = loadPlaces().filter((p) => p?.id), areas = loadAreas().filter((a) => a?.id);
const events = lines.map((l) => JSON.parse(l));
const stats = { total: events.length, noAnswer: 0, duplicate: 0, missingId: 0, written: 0 };
const kept = [];
for (const e of events) {
  if (!e.answer_summary || /^\(no answer/i.test(e.answer_summary)) { stats.noAnswer++; continue; }
  if (!resolveAbout(e.id, { places, areas })) { stats.missingId++; console.log(`drop (id resolves to nothing): ${e.id}`); continue; }
  const dupAt = kept.findIndex((k) => k.id === e.id && k.question.trim().toLowerCase() === e.question.trim().toLowerCase());
  if (dupAt >= 0) { stats.duplicate++; if (String(e.ts) >= String(kept[dupAt].ts)) kept[dupAt] = e; continue; }
  kept.push(e);
}
const used = new Set();
const files = kept.sort((a, b) => String(a.ts).localeCompare(String(b.ts))).map((e) => {
  const question = cleanQuestion(e.question);
  const base = SLUGS[e.ts] || slugOf(question);
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
  used.add(slug);
  const asked = spDate(e.ts);
  const fm = stringify({ question, asked, about: e.id, tldr: String(e.answer_summary).replace(/\s+/g, ' ').trim() }, { lineWidth: 0 });
  return { name: `${asked}-${slug}.md`, text: `---\n${fm}---\n` };
});
if (o.write) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(outDir, f.name), f.text);
  stats.written = files.length;
}
for (const f of files) console.log(`${o.write ? 'wrote' : 'would write'} ${path.relative(process.cwd(), path.join(outDir, f.name))}`);
console.log(JSON.stringify(stats));
