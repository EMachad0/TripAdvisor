// Answer cards: answers/<asked>-<slug>.md, one Markdown file per answer with YAML front matter.
// Written by Claude Code agents on the laptop (skill: .claude/skills/trip-answers), shipped in git like places,
// shown on place/area pages, on the site's Answers page and on Today. Read-only here: no writes.
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { dataRoots } from './paths.js';
import { loadPlaces, loadAreas } from './load.js';
import { COUNTRIES, COUNTRY_IDS } from './schema/enums.js';

export const ANSWER_FIELDS = {
  question: 'the traveler\'s question, lightly cleaned (≤ 300 characters)',
  asked: 'the date it was asked, YYYY-MM-DD (also the start of the file name)',
  about: 'exactly one of: a place id, an area id, a country id, or "trip"',
  tldr: 'one or two sentences that stand alone (≤ 400 characters)',
  sources: 'optional list of { title, url } (http/https)',
  updated: 'optional date of the last correction, YYYY-MM-DD',
};
const REQUIRED = ['question', 'asked', 'about', 'tldr'];
export const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { question: 300, tldr: 400, body: 20000, title: 200 };

const isDate = (s) => DATE_RE.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const asDate = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.trim() : v);

/** The answer files in <data root>/answers (README and files starting with "_" or "." are not answers). */
export function findAnswerFiles(opts = {}) {
  const dir = opts.answersDir || dataRoots(opts).answers;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !/^[._]/.test(f) && !/^readme\.md$/i.test(f)).sort().map((f) => path.join(dir, f));
}

/** Split "---\n<yaml>\n---\n<body>" → { yaml, body } or null when there is no front matter. */
export function splitFrontMatter(text) {
  const s = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = s.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  return m ? { yaml: m[1], body: m[2].trim() } : null;
}

/**
 * Parse one answer file. Returns the answer ({ id, slug, file, question, asked, about, tldr, sources, body, updated })
 * with `errors` (strings) for anything wrong with the file on its own. Ids are checked by validateAnswers.
 */
export function parseAnswer(text, file = 'answer.md') {
  const name = path.basename(file);
  const errors = [];
  const fm = splitFrontMatter(text);
  const fn = name.match(FILE_RE);
  if (!fn) errors.push(`file name "${name}" must be <asked>-<short-slug>.md, e.g. 2026-11-21-yu-garden-passport.md (lowercase a-z, 0-9, single hyphens)`);
  const base = { id: name.replace(/\.md$/, ''), slug: fn ? fn[2] : name.replace(/\.md$/, ''), file, question: '', asked: '', about: '', tldr: '', sources: [], body: '', updated: null };
  if (!fm) return { ...base, errors: [...errors, 'no front matter: the file must start with a line "---", the YAML fields, then another "---"'] };
  const doc = parseDocument(fm.yaml, { uniqueKeys: true });
  if (doc.errors.length) return { ...base, body: fm.body, errors: [...errors, `YAML error in the front matter: ${doc.errors[0].message.split('\n')[0]} (put text that contains ": " or starts with a quote, [ or * in double quotes)`] };
  const d = doc.toJS() || {};
  if (typeof d !== 'object' || Array.isArray(d)) return { ...base, body: fm.body, errors: [...errors, 'the front matter must be YAML fields (question:, asked:, about:, tldr:)'] };
  for (const k of Object.keys(d)) if (!(k in ANSWER_FIELDS)) errors.push(`unknown field "${k}" (fields: ${Object.keys(ANSWER_FIELDS).join(', ')})`);
  for (const k of REQUIRED) if (d[k] === undefined || d[k] === null || String(d[k]).trim() === '') errors.push(`missing ${k}: ${ANSWER_FIELDS[k]}`);
  const str = (k) => (d[k] === undefined || d[k] === null ? '' : typeof d[k] === 'string' ? d[k].replace(/\s+/g, ' ').trim() : (errors.push(`${k} must be text`), ''));
  const a = { ...base, question: str('question'), about: str('about'), tldr: str('tldr'), body: fm.body };
  a.asked = asDate(d.asked) ?? '';
  if (a.asked && !isDate(String(a.asked))) errors.push(`asked "${a.asked}" must be a real date, YYYY-MM-DD`);
  else if (fn && a.asked && fn[1] !== a.asked) errors.push(`the file name starts with ${fn[1]} but asked is ${a.asked}: rename the file or fix the date`);
  if (d.updated !== undefined && d.updated !== null) {
    a.updated = asDate(d.updated);
    if (!isDate(String(a.updated))) errors.push(`updated "${a.updated}" must be a date, YYYY-MM-DD`);
    else if (a.asked && a.updated < a.asked) errors.push(`updated (${a.updated}) is before asked (${a.asked})`);
  }
  for (const k of ['question', 'tldr']) if (a[k].length > LIMITS[k]) errors.push(`${k} is ${a[k].length} characters; keep it under ${LIMITS[k]} (the full answer goes in the body)`);
  if (a.body.length > LIMITS.body) errors.push(`the body is ${a.body.length} characters; keep it under ${LIMITS.body}`);
  if (d.sources !== undefined && d.sources !== null) {
    if (!Array.isArray(d.sources)) errors.push('sources must be a list of { title, url }');
    else d.sources.forEach((s, i) => {
      const title = typeof s?.title === 'string' ? s.title.trim() : '';
      const url = typeof s?.url === 'string' ? s.url.trim() : '';
      if (!s || typeof s !== 'object' || Array.isArray(s)) return errors.push(`sources[${i}] must be { title, url }`);
      for (const k of Object.keys(s)) if (!['title', 'url'].includes(k)) errors.push(`sources[${i}] has an unknown field "${k}" (only title and url)`);
      if (!title) errors.push(`sources[${i}] needs a title`);
      else if (title.length > LIMITS.title) errors.push(`sources[${i}].title is too long (≤ ${LIMITS.title})`);
      if (!/^https?:\/\/\S+$/i.test(url)) errors.push(`sources[${i}].url must be an http(s) link`);
      a.sources.push({ title, url });
    });
  }
  return { ...a, errors };
}

/** Load every answer file (unvalidated ids; each answer carries its own `errors`). */
export function loadAnswers(opts = {}) {
  return findAnswerFiles(opts).map((f) => parseAnswer(fs.readFileSync(f, 'utf8'), f));
}

/**
 * What an answer is about: { kind: place | area | country | trip, id, name, country } or null when the id
 * resolves to nothing; { ambiguous: true } when a place and an area share it (write place:<id> or area:<id>).
 */
export function resolveAbout(about, { places = [], areas = [] } = {}) {
  const s = String(about || '').trim();
  if (s === 'trip') return { kind: 'trip', id: 'trip', name: 'The whole trip', country: null };
  const m = s.match(/^(place|area|country):(.+)$/);
  const want = m ? m[1] : null, id = m ? m[2] : s;
  const hits = [];
  if (!want || want === 'place') { const p = places.find((x) => x.id === id); if (p) hits.push({ kind: 'place', id, name: p.name, country: p.country, city: p.city }); }
  if (!want || want === 'area') { const a = areas.find((x) => x.id === id); if (a) hits.push({ kind: 'area', id, name: a.name, country: a.country }); }
  if ((!want || want === 'country') && COUNTRIES[id]) hits.push({ kind: 'country', id, name: COUNTRIES[id].name, country: id });
  if (hits.length > 1) return { ambiguous: true, kinds: hits.map((h) => h.kind) };
  return hits[0] || null;
}

/**
 * Check every answer: its own errors, `about` resolving to exactly one thing, unique slugs.
 * Returns { answers (each with `target`), errors: [{ file, message }], warnings: [{ file, message }] }.
 */
export function validateAnswers(answers, { places = [], areas = [], today } = {}) {
  const errors = [], warnings = [];
  const bySlug = new Map();
  const out = answers.map((a) => {
    for (const e of a.errors || []) errors.push({ file: a.file, message: e });
    let target = null;
    if (a.about) {
      target = resolveAbout(a.about, { places, areas });
      if (target?.ambiguous) { errors.push({ file: a.file, message: `about "${a.about}" is both a ${target.kinds.join(' and an ')}: write ${target.kinds.map((k) => `${k}:${a.about}`).join(' or ')}` }); target = null; }
      else if (!target) errors.push({ file: a.file, message: `about "${a.about}" is not a place, an area or a country id, nor "trip" (countries: ${COUNTRY_IDS.join(', ')}; find ids with ./atr answers --ids)` });
    }
    if (a.slug) {
      if (bySlug.has(a.slug)) errors.push({ file: a.file, message: `slug "${a.slug}" is also used by ${path.basename(bySlug.get(a.slug))}: pick a different short slug` });
      else bySlug.set(a.slug, a.file);
    }
    if (today && a.asked && a.asked > today) warnings.push({ file: a.file, message: `asked ${a.asked} is in the future` });
    if (a.tldr && !/[.!?…)"”]$/.test(a.tldr)) warnings.push({ file: a.file, message: 'tldr should be full sentences (end it with a full stop)' });
    return { ...a, target };
  });
  return { answers: out, errors, warnings };
}

/** Load + validate against the places and areas of the same data root. */
export function checkAnswers(opts = {}) {
  const places = opts.places || loadPlaces(opts).filter((p) => p?.id);
  const areas = opts.areas || loadAreas(opts).filter((a) => a?.id);
  return validateAnswers(opts.answers || loadAnswers(opts), { places, areas, today: opts.today });
}

/** Newest first: by asked, then updated, then file name. */
export const byNewest = (a, b) => String(b.asked).localeCompare(String(a.asked)) || String(b.updated || '').localeCompare(String(a.updated || '')) || String(b.id).localeCompare(String(a.id));

/** Valid answers only (an answer with an error is left out of the site rather than shown half-broken), newest first. */
export function siteAnswers(opts = {}) {
  const r = checkAnswers(opts);
  const bad = new Set(r.errors.map((e) => e.file));
  return r.answers.filter((a) => !bad.has(a.file) && a.target).sort(byNewest);
}
