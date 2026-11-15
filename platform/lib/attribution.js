// Who wrote what: decide from a session's own tool calls whether a Bash command WROTE to a path or
// touched a place/area id. Reading a file (cat, head, grep, ls, ./atr validate …) is never touching it.

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `needle` appears in `text` as a whole path / word (not as part of a longer name). */
export const mentions = (text, needle) => new RegExp(`(^|[^A-Za-z0-9_.-])(\\./)?${esc(needle)}($|[^A-Za-z0-9_-])`).test(text);

// Commands whose arguments are written to.
const WRITE_VERB = /^\s*(?:sudo\s+|command\s+|\w+=\S*\s+)*(rm|mv|cp|tee|touch|truncate|chmod|mkdir|rmdir|ln|install|rsync|unlink)\b|\bsed\s+(?:-[A-Za-z]*i\b|--in-place)|\bperl\s+-[A-Za-z]*i\b|\bgit\s+(checkout|restore|rm|mv|apply|stash)\b/;
// `./atr new …`, `./atr media fetch|add|remove|prune …` (also via npm run atr -- / node platform/cli/atr.js)
const ATR_MUTATING = /(?:\.\/atr|atr\.js|npm\s+run\s+atr\s+--)\s+(new|media\s+(?:fetch|add|remove|prune))\b/;
// Inline scripts can write anything they name: python - <<EOF, python -c, node -e, ruby -e, perl -e, or any heredoc fed to an interpreter.
const INLINE_SCRIPT = /\b(python3?|node|ruby|perl|bash|sh|zsh)\b[^|;&\n]*?(\s-c\b|\s-e\b|\s-(?=\s|$)|<<)/;

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Split a shell command into simple commands (&&, ||, ;, |, newlines). Heredoc bodies stay with their line. */
function segments(cmd) {
  return String(cmd).split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Does this Bash command WRITE to `needle` (a repo-relative path, an absolute path, or a place/area id)?
 * True when the needle is: a redirect target (> >>), an argument of a writing command (rm, mv, cp, tee, sed -i, …),
 * an argument of a mutating atr command (new, media fetch|add|remove|prune; also `--name` that slugs to the id),
 * or named anywhere in a command that runs an inline script (python - <<EOF, node -e …).
 */
export function commandWrites(cmd, needle) {
  cmd = String(cmd || '');
  if (!needle || !mentionsAny(cmd, needle)) return false;
  // Inline script: the needle must be named in the script (or reach it through a shell variable), not merely piped into it.
  const im = cmd.match(INLINE_SCRIPT);
  if (im) {
    const script = cmd.slice(im.index);
    const vars = [...cmd.slice(0, im.index).matchAll(/(?:^|[\s;&])([A-Za-z_]\w*)=(\S+)/g)].filter((m) => mentions(m[2], needle)).map((m) => m[1]);
    if (mentions(script, needle) || vars.some((v) => new RegExp(`\\$\\{?${v}\\b`).test(script))) return true;
  }
  for (const seg of segments(cmd)) {
    for (const m of seg.matchAll(/(?:^|[^<>&])>>?\s*(['"]?)([^\s'"|;&<>]+)\1/g)) if (mentions(m[2], needle)) return true;
    if (WRITE_VERB.test(seg) && mentions(seg.replace(/>>?\s*\S+/g, ' '), needle)) return true;
    if (ATR_MUTATING.test(seg)) {
      if (mentions(seg, needle)) return true;
      const name = seg.match(/--(?:name|id)[= ]\s*(?:"([^"]*)"|'([^']*)'|(\S+))/);
      if (name && slug(name[1] ?? name[2] ?? name[3]) === needle) return true;
    }
  }
  return false;
}
function mentionsAny(cmd, needle) {
  if (mentions(cmd, needle)) return true;
  return /--(?:name|id)\b/.test(cmd) && ATR_MUTATING.test(cmd); // the id may only exist as a slug of --name
}

/**
 * Did the command write to this repo-relative file? Also understands `cd <dir> && … <rest of the path>`
 * and `rm -r <parent dir>` for deleted files.
 */
export function commandWritesFile(cmd, rel, { abs, deleted } = {}) {
  if (commandWrites(cmd, rel) || (abs && commandWrites(cmd, abs))) return true;
  const parts = rel.split('/');
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join('/'), rest = parts.slice(i).join('/');
    if (new RegExp(`\\bcd\\s+(\\./)?${esc(dir)}/?($|[\\s;&])`).test(cmd) && commandWrites(cmd, rest)) return true;
    if (deleted && segments(cmd).some((s) => /^\s*(rm|mv|git\s+rm)\b/.test(s) && mentions(s, dir))) return true;
  }
  return false;
}
