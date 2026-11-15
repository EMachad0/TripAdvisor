// Terminal helpers: colors, issue formatting.
import path from 'node:path';
import { toYaml } from '../lib/yamlio.js';

const useColor = () => !process.env.NO_COLOR && (process.env.FORCE_COLOR || process.stdout.isTTY);
const wrap = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = { red: wrap('31'), green: wrap('32'), yellow: wrap('33'), blue: wrap('34'), magenta: wrap('35'), cyan: wrap('36'), dim: wrap('2'), bold: wrap('1') };

export function exampleText(issue) {
  if (issue.example === undefined) return null;
  const key = issue.pathArr?.length ? issue.pathArr[issue.pathArr.length - 1] : null;
  const val = issue.example;
  if (key === null || typeof key === 'number') {
    const y = toYaml(typeof key === 'number' ? [val] : val).trimEnd();
    return y;
  }
  if (val !== null && typeof val === 'object' && !Array.isArray(val) && key in val) return toYaml(val).trimEnd();
  if (val !== null && typeof val === 'object') return `${key}:\n${toYaml(val).trimEnd().split('\n').map((l) => '  ' + l).join('\n')}`;
  return toYaml({ [key]: val }).trimEnd();
}

export function formatIssue(i) {
  const tag = i.level === 'error' ? c.red('error  ') : i.level === 'info' ? c.cyan('info   ') : c.yellow('warning');
  const loc = i.line ? c.dim(` (line ${i.line})`) : '';
  const lines = [`  ${tag} ${c.bold(i.path)}${loc}`, `          ${i.message}`];
  if (i.expected) lines.push(`          ${c.dim('expected:')} ${i.expected}`);
  const ex = exampleText(i);
  if (ex) lines.push(`          ${c.dim('example:')}  ${ex.split('\n').join('\n                    ')}`);
  if (i.hint) lines.push(`          ${c.dim('hint:')}     ${i.hint}`);
  return lines.join('\n');
}

export function formatResults({ results, errors, warnings }, { quiet = false } = {}) {
  const out = [];
  for (const r of results) {
    const rel = path.relative(process.cwd(), r.file);
    const e = r.issues.filter((i) => i.level === 'error');
    const w = r.issues.filter((i) => i.level === 'warning');
    const inf = quiet ? [] : r.issues.filter((i) => i.level === 'info');
    if (!e.length && !w.length && !inf.length) { if (!quiet) out.push(`${c.green('✔')} ${rel}`); continue; }
    out.push(`${e.length ? c.red('✖') : c.yellow('▲')} ${c.bold(rel)} ${c.dim(`— ${e.length} error(s), ${w.length} warning(s)`)}`);
    for (const i of [...e, ...(quiet ? [] : w), ...inf]) out.push(formatIssue(i));
    out.push('');
  }
  out.push(errors ? c.red(`✖ ${errors} error(s), ${warnings} warning(s) in ${results.length} file(s)`) : `${c.green('✔')} ${results.length} file(s) valid${warnings ? c.yellow(`, ${warnings} warning(s)`) : ''}`);
  return out.join('\n');
}

export function table(rows, headers) {
  const all = [headers, ...rows].map((r) => r.map((x) => String(x ?? '')));
  const w = headers.map((_, i) => Math.max(...all.map((r) => [...r[i]].length)));
  return all.map((r, j) => r.map((x, i) => x.padEnd(w[i])).join('  ') + (j === 0 ? '\n' + w.map((n) => '─'.repeat(n)).join('  ') : '')).join('\n');
}
