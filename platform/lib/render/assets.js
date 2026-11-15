// Stylesheet + font assets. `styles()` is pure (reads the bundled CSS once);
// `copyAssets()` writes atr.css + fonts into a directory (used by build / the game).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.join(HERE, 'assets', 'atr.css'), 'utf8');
const require = createRequire(import.meta.url);

export const FONT_FILES = [
  ['@fontsource/fraunces', ['fraunces-latin-400-normal', 'fraunces-latin-400-italic', 'fraunces-latin-600-normal', 'fraunces-latin-800-normal']],
  ['@fontsource/inter', ['inter-latin-400-normal', 'inter-latin-500-normal', 'inter-latin-600-normal', 'inter-latin-700-normal']],
];

/** CSS text with font URLs pointing at `${assetBase}fonts/...`. */
export function styles(assetBase = 'assets/') {
  return CSS.replaceAll('__ASSETS__', assetBase);
}

/** Write atr.css and fonts/ into destDir (e.g. build/assets). */
export function copyAssets(destDir) {
  fs.mkdirSync(path.join(destDir, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'atr.css'), styles(''));
  // Each face ships in two subsets: latin, and latin-ext for pinyin/romaji macrons (ā ē ī ō ū) and Vietnamese-style marks.
  for (const [pkg, files] of FONT_FILES) {
    const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files');
    for (const f of files) for (const name of [f, f.replace('-latin-', '-latin-ext-')]) fs.copyFileSync(path.join(dir, `${name}.woff2`), path.join(destDir, 'fonts', `${name}.woff2`));
  }
  return destDir;
}
