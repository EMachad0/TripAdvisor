// Tiny schema DSL: one source of truth for validation (with fix-it messages),
// JSON Schema export, `atr blocks` docs and scaffolding.
//
// A spec is a plain object: { kind, desc, example, optional, ... }.

export const t = {
  string: (o = {}) => ({ kind: 'string', ...o }),
  markdown: (o = {}) => ({ kind: 'string', markdown: true, ...o }),
  url: (o = {}) => ({ kind: 'string', format: 'url', ...o }),
  date: (o = {}) => ({ kind: 'string', format: 'date', ...o }),
  slug: (o = {}) => ({ kind: 'string', format: 'slug', ...o }),
  number: (o = {}) => ({ kind: 'number', ...o }),
  int: (o = {}) => ({ kind: 'number', int: true, ...o }),
  boolean: (o = {}) => ({ kind: 'boolean', ...o }),
  enum: (values, o = {}) => ({ kind: 'enum', values, ...o }),
  array: (of, o = {}) => ({ kind: 'array', of, ...o }),
  object: (fields, o = {}) => ({ kind: 'object', fields, ...o }),
  tagged: (tag, variants, o = {}) => ({ kind: 'tagged', tag, variants, ...o }),
  opt: (spec) => ({ ...spec, optional: true }),
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A phone link: tel:+66 2 246 5472 (country code, then 6–15 digits; spaces, dots, dashes, brackets allowed). */
export const TEL_RE = /^tel:\+?(?:[\s().-]*\d){6,15}[\s().-]*$/i;

export function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function nearest(word, options) {
  const w = String(word).toLowerCase().replace(/[\s-]+/g, '_');
  let best = null, bestD = Infinity;
  for (const o of options) {
    const oo = o.toLowerCase().replace(/[\s-]+/g, '_');
    let d = levenshtein(w, oo);
    if (oo.includes(w) || w.includes(oo)) d = Math.min(d, 1.5);
    if (d < bestD) { bestD = d; best = o; }
  }
  const limit = Math.max(2, Math.ceil(String(word).length / 3));
  return bestD <= limit ? best : null;
}

export function joinPath(path) {
  let s = '';
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : (s ? `.${p}` : p);
  return s || '(root)';
}

/** Human description of what a spec expects. */
export function describe(spec) {
  switch (spec.kind) {
    case 'string': {
      if (spec.format === 'url') return spec.tel ? 'a full URL starting with https:// (or tel:+<country code><number> for a phone booking)' : 'a full URL starting with https:// (or http://)';
      if (spec.format === 'date') return 'a date as YYYY-MM-DD';
      if (spec.format === 'slug') return 'a lowercase slug (a-z, 0-9 and single hyphens), e.g. "yu-garden"';
      const parts = [spec.markdown ? 'text (Markdown subset allowed)' : 'text'];
      if (spec.min && spec.max) parts.push(`${spec.min}–${spec.max} characters`);
      else if (spec.max) parts.push(`at most ${spec.max} characters`);
      else if (spec.min) parts.push(`at least ${spec.min} characters`);
      if (spec.patternHint) parts.push(spec.patternHint);
      return parts.join(', ');
    }
    case 'number': {
      const parts = [spec.int ? 'a whole number' : 'a number'];
      if (spec.min !== undefined) parts.push(`≥ ${spec.min}`);
      if (spec.max !== undefined) parts.push(`≤ ${spec.max}`);
      return parts.join(' ');
    }
    case 'boolean': return 'true or false';
    case 'enum': return `one of: ${spec.values.join(' | ')}`;
    case 'array': {
      const n = spec.min ? `${spec.min}+ ` : '';
      const max = spec.max ? ` (max ${spec.max})` : '';
      return `a list of ${n}${spec.of.kind === 'object' ? 'objects' : describe(spec.of)}${max}`;
    }
    case 'object': return `an object with fields: ${Object.entries(spec.fields).map(([k, v]) => v.optional ? `${k}?` : k).join(', ')}`;
    case 'tagged': return `an object with \`${spec.tag}\` set to one of: ${Object.keys(spec.variants).join(', ')}`;
    default: return spec.kind;
  }
}

/** Example value for a spec (explicit example wins; otherwise derived). */
export function exampleOf(spec, { all = false } = {}) {
  if (spec.example !== undefined) return spec.example;
  switch (spec.kind) {
    case 'string':
      if (spec.format === 'url') return 'https://example.com/page';
      if (spec.format === 'date') return '2026-11-09';
      if (spec.format === 'slug') return 'my-slug';
      return 'text';
    case 'number': return spec.min ?? 1;
    case 'boolean': return false;
    case 'enum': return spec.values[0];
    case 'array': return [exampleOf(spec.of, { all })];
    case 'object': {
      const o = {};
      for (const [k, v] of Object.entries(spec.fields)) if (all || !v.optional) o[k] = exampleOf(v, { all });
      return o;
    }
    case 'tagged': {
      const [name, v] = Object.entries(spec.variants)[0];
      return { [spec.tag]: name, ...exampleOf(v, { all }) };
    }
  }
  return null;
}

function show(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'nothing';
  if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 57) + '...' : v);
  if (Array.isArray(v)) return `a list (${v.length} items)`;
  if (typeof v === 'object') return 'an object';
  return String(v);
}

function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  return typeof v === 'object' ? 'an object' : typeof v;
}

/**
 * Validate `value` against `spec`. Pushes issues into `issues`:
 * { level: 'error'|'warning', path, message, expected, example }
 */
export function check(spec, value, path = [], issues = []) {
  const err = (message, extra = {}) => issues.push({
    level: 'error', path: joinPath(path), pathArr: [...path], message,
    expected: describe(spec), example: exampleOf(spec), ...extra,
  });

  if (value === undefined || value === null) {
    if (!spec.optional) err(`missing required field${path.length ? ` \`${path[path.length - 1]}\`` : ''}`);
    return issues;
  }

  switch (spec.kind) {
    case 'string': {
      if (value instanceof Date) value = value.toISOString().slice(0, 10);
      if (typeof value === 'number' && !spec.format) value = String(value);
      if (typeof value !== 'string') { err(`expected text but got ${typeName(value)} ${show(value)}`); break; }
      const v = value.trim();
      if (!v && !spec.optional && !spec.allowEmpty) { err('is empty'); break; }
      if (spec.format === 'url' && !/^https?:\/\/[^\s]+\.[^\s]+/.test(v) && !(spec.tel && TEL_RE.test(v))) err(`${show(v)} is not a full URL${spec.tel && /^tel:/i.test(v) ? ' or phone link (tel:+ then 6–15 digits; spaces and dashes are fine)' : ''}`);
      else if (spec.format === 'date') {
        if (!DATE_RE.test(v) || isNaN(Date.parse(v + 'T00:00:00Z'))) err(`${show(v)} is not a valid date`);
      } else if (spec.format === 'slug' && !SLUG_RE.test(v)) {
        const fixed = v.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        err(`${show(v)} is not a valid slug`, { example: fixed || exampleOf(spec) });
      }
      if (spec.max && v.length > spec.max) err(`is ${v.length} characters, too long (max ${spec.max})`, { hint: `shorten it by ${v.length - spec.max} characters` });
      if (spec.min && v.length < spec.min) err(`is ${v.length} characters, too short (min ${spec.min})`);
      if (spec.pattern && !spec.pattern.test(v)) {
        const near = spec.suggest ? nearest(v, spec.suggest) : null;
        err(`${show(v)} has the wrong format${near ? `. Did you mean "${near}"?` : ''}`, near ? { example: near } : {});
      }
      if (spec.markdown && /<\/?[a-z][^>]*>/i.test(v)) issues.push({ level: 'warning', path: joinPath(path), pathArr: [...path], message: 'contains HTML tags; raw HTML is escaped and will show as text', expected: 'Markdown subset: **bold**, *italic*, [link](https://...), "- " lists', example: '**Go early** — the queue builds by 10:00.' });
      break;
    }
    case 'number': {
      if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value.replace(/,/g, '')))) {
        err(`${show(value)} is text; write the number without quotes`, { example: Number(value.replace(/,/g, '')) });
        break;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) { err(`expected a number but got ${typeName(value)} ${show(value)}`); break; }
      if (spec.int && !Number.isInteger(value)) err(`${value} must be a whole number`);
      if (spec.min !== undefined && value < spec.min) err(`${value} is below the minimum ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) err(`${value} is above the maximum ${spec.max}`);
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean') err(`expected true or false but got ${show(value)}`, { example: /^(yes|y|true|1)$/i.test(String(value)) ? true : false });
      break;
    case 'enum': {
      if (!spec.values.includes(value)) {
        const near = nearest(value, spec.values.map(String));
        err(`${show(value)} is not an allowed value${near ? `. Did you mean "${near}"?` : ''}`, near ? { example: near } : {});
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        err(`expected a list but got ${typeName(value)}`, { hint: 'in YAML a list item starts with "- "' });
        break;
      }
      if (spec.min && value.length < spec.min) err(`has ${value.length} item(s), needs at least ${spec.min}`);
      if (spec.max && value.length > spec.max) err(`has ${value.length} items, at most ${spec.max} allowed`);
      value.forEach((item, i) => check(spec.of, item, [...path, i], issues));
      break;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) { err(`expected an object (key: value pairs) but got ${typeName(value)} ${show(value)}`); break; }
      checkFields(spec, value, path, issues, []);
      break;
    }
    case 'tagged': {
      if (typeof value !== 'object' || Array.isArray(value)) { err(`expected an object but got ${typeName(value)}`); break; }
      const names = Object.keys(spec.variants);
      const tag = value[spec.tag];
      if (tag === undefined) {
        err(`missing \`${spec.tag}\`. Valid ${spec.tag}s: ${names.join(', ')}`);
        break;
      }
      const variant = spec.variants[tag];
      if (!variant) {
        const near = nearest(tag, names);
        issues.push({
          level: 'error', path: joinPath([...path, spec.tag]), pathArr: [...path, spec.tag],
          message: `unknown ${spec.tag} ${show(tag)}${near ? `. Did you mean "${near}"?` : ''}`,
          expected: `one of: ${names.join(', ')}`,
          example: near || names[0],
          hint: `run \`./atr blocks${near ? ' ' + near : ''}\` to see each block's YAML shape`,
        });
        break;
      }
      checkFields(variant, value, path, issues, [spec.tag]);
      break;
    }
  }
  return issues;
}

function checkFields(spec, value, path, issues, extraAllowed) {
  const known = Object.keys(spec.fields);
  for (const [k, f] of Object.entries(spec.fields)) check(f, value[k], [...path, k], issues);
  for (const k of Object.keys(value)) {
    if (known.includes(k) || extraAllowed.includes(k) || k.startsWith('x_')) continue;
    const near = nearest(k, known);
    issues.push({
      level: 'error', path: joinPath([...path, k]), pathArr: [...path, k],
      message: `unknown field \`${k}\`${near ? `. Did you mean \`${near}\`?` : ''}`,
      expected: `fields allowed here: ${known.join(', ')}`,
      example: near ? { [near]: exampleOf(spec.fields[near]) } : undefined,
      hint: 'prefix a key with x_ if you really need a private note field',
    });
  }
}

/** Convert a spec to JSON Schema (draft 2020-12 subset). */
export function toJsonSchema(spec) {
  const base = {};
  if (spec.desc) base.description = spec.desc;
  if (spec.example !== undefined) base.examples = [spec.example];
  switch (spec.kind) {
    case 'string': {
      const s = { type: 'string', ...base };
      if (spec.format === 'url') { s.format = 'uri'; s.pattern = spec.tel ? '^(https?://|tel:)' : '^https?://'; }
      if (spec.format === 'date') { s.format = 'date'; s.pattern = DATE_RE.source; }
      if (spec.format === 'slug') s.pattern = SLUG_RE.source;
      if (spec.pattern) s.pattern = spec.pattern.source;
      if (spec.min) s.minLength = spec.min;
      if (spec.max) s.maxLength = spec.max;
      if (spec.markdown) s['x-markdown'] = true;
      return s;
    }
    case 'number': {
      const s = { type: spec.int ? 'integer' : 'number', ...base };
      if (spec.min !== undefined) s.minimum = spec.min;
      if (spec.max !== undefined) s.maximum = spec.max;
      return s;
    }
    case 'boolean': return { type: 'boolean', ...base };
    case 'enum': return { enum: spec.values, ...base };
    case 'array': {
      const s = { type: 'array', items: toJsonSchema(spec.of), ...base };
      if (spec.min) s.minItems = spec.min;
      if (spec.max) s.maxItems = spec.max;
      return s;
    }
    case 'object': {
      const properties = {};
      const required = [];
      for (const [k, f] of Object.entries(spec.fields)) {
        properties[k] = toJsonSchema(f);
        if (!f.optional) required.push(k);
      }
      return { type: 'object', ...base, properties, required, patternProperties: { '^x_': {} }, additionalProperties: false };
    }
    case 'tagged': {
      return {
        ...base,
        oneOf: Object.entries(spec.variants).map(([name, v]) => {
          const s = toJsonSchema(v);
          s.properties = { [spec.tag]: { const: name }, ...s.properties };
          s.required = [spec.tag, ...s.required];
          s.title = name;
          return s;
        }),
      };
    }
  }
  return base;
}

/** Resolve the sub-spec at a path (uses data to pick tagged variants). */
export function specAt(spec, pathArr, data) {
  let s = spec, d = data;
  for (const p of pathArr) {
    if (!s) return null;
    if (s.kind === 'array') s = s.of;
    else if (s.kind === 'object') s = s.fields[p];
    else if (s.kind === 'tagged') { const v = s.variants[d?.[s.tag]]; s = p === s.tag ? { kind: 'enum', values: Object.keys(s.variants) } : v?.fields[p]; }
    else return null;
    d = d?.[p];
  }
  return s;
}
