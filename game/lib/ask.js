// Ask box backend: runs headless `claude -p` with the place's YAML + trip context.
// Tools are limited to read-only + web (Read, Glob, Grep, WebSearch, WebFetch). Answers never edit data.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { ROOT } from '../../platform/lib/index.js';
import { tzLabel, legOffsets } from './trip.js';

export const ASK_TOOLS = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
export const DEFAULT_TIMEOUT_MS = 240_000;

export const SYSTEM = `You answer one question from a traveler inside the "Asia Trip Ranker" game, about one place.
Rules:
- Read-only. Never create, edit or delete files. You cannot change place data; the curator does that.
- The place's YAML data is in the prompt. Trust it for what it says, but use WebSearch/WebFetch for anything time-sensitive (hours, prices, events, booking rules in Dec 2026 – Jan 2027) or not covered.
- Be concise and practical: at most ~180 words, short paragraphs or a few bullets, Markdown allowed (bold, lists, links).
- Prices: local currency plus R$ (use the place's fx rate when you can). The traveler is a solo, budget-minded backpacker from Brazil.
- Say plainly when you're unsure or sources disagree. Never invent booking links.
- Write the timezone beside every clock time, as a UTC offset: "17:10 UTC−3", "20:00–05:00 UTC+8" (Brazil UTC−3, Istanbul UTC+3, China, Hong Kong and Singapore UTC+8, Thailand UTC+7, Korea and Japan UTC+9). Never give a time without it.
- Finish with one final line that starts with "TL;DR:" and summarizes the answer in one sentence.`;

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…(truncated)' : s);

/** The prompt sent to claude: trip context, the place YAML, the question. */
export function buildPrompt({ place, question, cfg, note, verdict, kind = 'place', today = new Date().toISOString().slice(0, 10) }) {
  let yaml = '';
  try { yaml = fs.readFileSync(place._meta.file, 'utf8'); } catch { yaml = JSON.stringify({ ...place, _meta: undefined }, null, 2); }
  const c = cfg?.countries?.find((x) => x.id === place.country);
  const route = (cfg?.countries || []).map((x) => `${x.id} ${x.from}→${x.to} (${x.days} days, R$${x.budget_brl_per_day}/day)`).join('; ');
  return [
    `Today is ${today}.`,
    `Trip: ${route || 'see docs/TRIP.md'}.`,
    c ? `In ${c.id}: ${c.days} days, "everything else" budget R$${c.budget_brl_per_day}/day (attractions, local transport, nightlife).` : '',
    cfg?.traveler?.style ? `Traveler: ${cfg.traveler.style}.` : '',
    'More context if needed (read-only): docs/TRIP.md, docs/TASTE.md.',
    '',
    `Place data (${place.id}):`,
    '```yaml',
    clip(yaml, 16000),
    '```',
    '',
    verdict ? `The traveler's current call on this ${kind}: ${verdict.toUpperCase()}.` : '',
    note ? `The traveler's own note on this ${kind} (written by the traveler, not the curator: their reasoning, so take it into account):\n<traveler_note>\n${clip(String(note), 2000)}\n</traveler_note>` : '',
    '',
    `Question: ${question}`,
  ].filter((l) => l !== '').join('\n');
}

export function claudeArgs(prompt) {
  return ['-p', prompt,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', ASK_TOOLS.join(','),
    '--allowedTools', ASK_TOOLS.join(','),
    '--disallowedTools', 'Edit,Write,NotebookEdit,Bash',
    '--permission-mode', 'dontAsk',
    '--append-system-prompt', SYSTEM,
    '--effort', 'medium',
    '--no-session-persistence'];
}

/** Split an answer into { body, tldr } (the final "TL;DR:" line). */
export function splitTldr(text) {
  const m = String(text || '').match(/\n?\s*\**TL;?DR\**:?\**\s*(.+?)\s*$/is);
  if (!m) return { body: String(text || '').trim(), tldr: null };
  return { body: String(text).slice(0, m.index).trim(), tldr: m[1].replace(/\*+/g, '').trim() };
}

/** Short summary for questions.jsonl (≤ 2000 chars; aim ≤ 400). */
export function summarize(text) {
  const { body, tldr } = splitTldr(text);
  let s = tldr || body.split(/\n\s*\n/)[0] || '';
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 400 ? s.slice(0, 397).trimEnd() + '…' : s;
}

const TOOL_LABEL = { WebSearch: 'Searching the web', WebFetch: 'Reading a page', Read: 'Reading trip notes', Glob: 'Looking through files', Grep: 'Looking through files' };

/**
 * Parse one stream-json line into UI events: [{type:'delta', text} | {type:'status', text} | {type:'result', text, isError}].
 */
export function parseStreamLine(line) {
  let o;
  try { o = JSON.parse(line); } catch { return []; }
  const out = [];
  if (o.type === 'stream_event') {
    const e = o.event || {};
    if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) out.push({ type: 'delta', text: e.delta.text });
    if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') out.push({ type: 'status', text: (TOOL_LABEL[e.content_block.name] || `Using ${e.content_block.name}`) + '…' });
    if (e.type === 'message_start') out.push({ type: 'turn' });
  } else if (o.type === 'result') {
    out.push({ type: 'result', text: o.result || '', isError: !!o.is_error || o.subtype !== 'success' });
  }
  return out;
}

/**
 * Run claude. onEvent receives parsed events. Resolves { text, error }.
 * opts: { bin, timeoutMs, cwd, signal }
 */
export function runAsk(prompt, onEvent = () => {}, opts = {}) {
  const bin = opts.bin || process.env.ATR_CLAUDE_BIN || 'claude';
  const timeoutMs = opts.timeoutMs ?? (Number(process.env.ATR_ASK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let text = '', turnText = '', stderr = '', buf = '';
    const finish = (r) => { if (settled) return; settled = true; clearTimeout(timer); resolve(r); };
    try {
      child = spawn(bin, claudeArgs(prompt), { cwd: opts.cwd || ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    } catch (e) { return finish({ text: '', error: `Could not start claude: ${e.message}` }); }
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} finish({ text: text || turnText, error: `No answer after ${Math.round(timeoutMs / 1000)} s; try a shorter question.` }); }, timeoutMs);
    opts.signal?.addEventListener?.('abort', () => { try { child.kill('SIGTERM'); } catch {} finish({ text: turnText, error: 'cancelled' }); });
    child.on('error', (e) => finish({ text: '', error: e.code === 'ENOENT' ? 'The claude CLI was not found on PATH. Install Claude Code or ask in the main thread.' : `claude failed: ${e.message}` }));
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 8000) stderr = stderr.slice(-8000); });
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        for (const ev of parseStreamLine(line)) {
          if (ev.type === 'turn') { if (turnText) onEvent({ type: 'reset' }); turnText = ''; continue; }
          if (ev.type === 'delta') { turnText += ev.text; onEvent(ev); }
          else if (ev.type === 'status') onEvent(ev);
          else if (ev.type === 'result') { text = ev.text; if (ev.isError) finish({ text: turnText, error: ev.text || 'claude reported an error' }); }
        }
      }
    });
    child.on('close', (code) => {
      if (text) return finish({ text, error: null });
      if (turnText && code === 0) return finish({ text: turnText, error: null });
      const last = stderr.trim().split('\n').filter(Boolean).at(-1) || '';
      finish({ text: turnText, error: `claude exited with code ${code}${last ? `: ${last.slice(0, 200)}` : ''}` });
    });
  });
}

/**
 * The prompt for a question about the whole trip (Today view). The model gets today's facts and is pointed at the
 * trip files and the place pages, which it can read but never change.
 */
export function buildTripPrompt({ question, today, model, trip, places = [], tripDir = 'trip', stayName = (s) => s?.title || '' }) {
  const stamp = (v, off) => `${String(v).replace('T', ' ')}${/T\d\d:\d\d/.test(String(v)) && tzLabel(off) ? ` ${tzLabel(off)}` : ''}`;
  const legLine = (l, o = legOffsets(l, trip.legs || [])) => [l.type, l.start ? stamp(l.start, o.start) : '', l.end ? `→ ${stamp(l.end, o.end)}` : '', l.type === 'flight' ? `${l.from}→${l.to} ${[l.carrier, l.flight].filter(Boolean).join(' ')}` : l.title, l.status ? `[${l.status}]` : ''].filter(Boolean).join(' ');
  const here = model.stay ? `${stayName(model.stay)} (${model.country})` : model.phase === 'before' ? `at home, ${model.toDeparture} days before departure` : model.phase === 'after' ? 'back home' : 'between stays';
  const cityPlaces = places.filter((p) => model.cities.includes(p.city));
  return [
    `Today is ${today}. The traveler is ${here}.`,
    'This question is about the trip as a whole, not one place. Ignore any rule above that assumes a single place.',
    `Answer from the trip files first: ${tripDir}/legs.json (flights, stays, transfers), ${tripDir}/tasks.json, ${tripDir}/days.json (work, vacation, holidays, notes), ${tripDir}/budget.json, ${tripDir}/visited.json, docs/TRIP.md, config/trip.yaml.`,
    'Place cards: places/<country>/<city>/<id>/place.yaml (Grep by name or tag; "location" has the address and coordinates). The traveler\'s calls: feedback/swipes.jsonl (latest line per id wins), notes in feedback/notes.jsonl.',
    'Use the web only when the files cannot answer (opening hours today, a strike, weather).',
    '',
    'Itinerary (each time is local to its airport or city, with its UTC offset; times in notes are local to the place they are about):',
    ...(trip.legs || []).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || ''))).map((l) => `- ${legLine(l)}`),
    'Write the UTC offset beside every time you give ("17:10 UTC−3"); when a flight crosses zones, say both ends.',
    '',
    cityPlaces.length ? `Cards in the current city (${model.cities.join(', ')}): ${clip(cityPlaces.map((p) => `${p.id}${p.verdict ? ` [${p.verdict}]` : ''}${p.when ? ` (${p.when})` : ''}`).join('; '), 6000)}` : '',
    model.onlyToday.length ? `Dated today: ${model.onlyToday.map((h) => `${h.place.id} (${h.kind})`).join('; ')}` : '',
    '',
    `Question: ${question}`,
  ].filter((l) => l !== '').join('\n');
}
