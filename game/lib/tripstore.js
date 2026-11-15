// Trip planner data: one JSON file per collection in trip/ (tasks, legs, bag, budget, fixed, spend, settings,
// days, visited). Each file is an array of documents with an "id". The site edits them through /api/trip; they
// are plain files so Claude or a text editor can change them too (the site re-reads on every request).
import fs from 'node:fs';
import path from 'node:path';
import { COLLECTIONS } from './trip.js';

const fileOf = (dir, col) => path.join(dir, `${col}.json`);
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export function readCollection(dir, col) {
  try {
    const xs = JSON.parse(fs.readFileSync(fileOf(dir, col), 'utf8'));
    return Array.isArray(xs) ? xs.filter((x) => x && typeof x === 'object' && typeof x.id === 'string') : [];
  } catch { return []; }
}

export function readTrip(dir) {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, readCollection(dir, c)]));
}

function writeCollection(dir, col, docs) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${fileOf(dir, col)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(docs, null, 2) + '\n');
  fs.renameSync(tmp, fileOf(dir, col));
}

const newId = () => `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

/**
 * One write. op: "set" (create or replace), "update" (merge fields), "delete".
 * Returns { doc } (null after a delete). Throws an Error with status 400 on bad input.
 */
export function writeDoc(dir, { col, op, id, data }) {
  if (!COLLECTIONS.includes(col)) throw bad(`unknown collection "${col}"`);
  if (!['set', 'update', 'delete'].includes(op)) throw bad(`unknown op "${op}"`);
  if (id !== undefined && id !== null && !ID_RE.test(String(id))) throw bad('bad id');
  if (op !== 'delete' && (!data || typeof data !== 'object' || Array.isArray(data))) throw bad('data must be an object');
  if (op !== 'set' && !id) throw bad(`${op} needs an id`);
  const docs = readCollection(dir, col);
  const i = id ? docs.findIndex((d) => d.id === id) : -1;
  if (op === 'delete') {
    if (i >= 0) { docs.splice(i, 1); writeCollection(dir, col, docs); }
    return { doc: null };
  }
  const { id: _drop, ...fields } = data;
  let doc;
  if (op === 'update') {
    if (i < 0) throw bad(`no ${col} document "${id}"`);
    doc = { ...docs[i], ...fields };
    for (const k of Object.keys(doc)) if (doc[k] === null) delete doc[k];
    docs[i] = doc;
  } else {
    doc = { id: id ? String(id) : newId(), ...fields };
    if (i >= 0) docs[i] = doc; else docs.push(doc);
  }
  writeCollection(dir, col, docs);
  return { doc };
}
