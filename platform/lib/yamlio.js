// YAML read helpers that keep line numbers for error messages.
import fs from 'node:fs';
import { parseDocument, LineCounter, stringify } from 'yaml';

export function readYaml(file) {
  const text = fs.readFileSync(file, 'utf8');
  return parseYamlText(text);
}

export function parseYamlText(text) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true, uniqueKeys: true });
  const parseErrors = doc.errors.map((e) => ({
    level: 'error', path: '(yaml)', line: e.linePos?.[0]?.line,
    message: `YAML syntax error: ${e.message.split('\n')[0]}`,
    expected: 'valid YAML (check indentation: 2 spaces, no tabs; quote text containing ": " or starting with special characters like * & ! % @ `)',
    example: 'why: "Quoted text: safe with colons"',
  }));
  const data = parseErrors.length ? null : doc.toJS({ maxAliasCount: 50 });
  const lineOf = (pathArr = []) => {
    for (let n = pathArr.length; n >= 0; n--) {
      const node = doc.getIn(pathArr.slice(0, n), true);
      if (node && node.range) return lineCounter.linePos(node.range[0]).line;
      if (n > 0) {
        // key of a scalar parent: find the pair
        const parent = doc.getIn(pathArr.slice(0, n - 1), true);
        const pair = parent?.items?.find?.((p) => p.key && (p.key.value ?? p.key) === pathArr[n - 1]);
        if (pair?.key?.range) return lineCounter.linePos(pair.key.range[0]).line;
      }
    }
    return undefined;
  };
  return { data, doc, parseErrors, lineOf, text };
}

export function toYaml(value) {
  return stringify(value, { lineWidth: 0 });
}
