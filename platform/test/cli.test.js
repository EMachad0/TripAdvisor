import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/paths.js';
import { tmpDir } from './helpers.js';

const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });

test('--help on main and every command', () => {
  const main = atr(['--help']);
  assert.equal(main.status, 0);
  const cmds = [...main.stdout.matchAll(/^  ([a-z]+)\s{2,}/gm)].map((m) => m[1]);
  assert.ok(cmds.length >= 12, cmds.join(','));
  for (const c of cmds) {
    const r = atr([c, '--help']);
    assert.equal(r.status, 0, c);
    assert.match(r.stdout, /usage:/, c);
  }
});

test('validate --fixtures passes; JSON output parses', () => {
  const r = atr(['validate', '--fixtures']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(atr(['validate', '--fixtures', '--json']).stdout);
  assert.equal(j.errors, 0);
});

test('new place scaffold fails validation until filled; exit code 1', () => {
  const root = tmpDir();
  const env = { ATR_DATA_ROOT: root };
  const n = atr(['new', 'place', '--country', 'korea', '--city', 'seoul', '--name', 'Test Market', '--category', 'food'], env);
  assert.equal(n.status, 0, n.stderr);
  const file = path.join(root, 'places/korea/seoul/test-market/place.yaml');
  assert.ok(fs.existsSync(file));
  const text = fs.readFileSync(file, 'utf8');
  for (const t of ['hero', 'menu', 'book_ahead', 'pairs_well', 'sources']) assert.match(text, new RegExp(`type: ${t}`));
  const v = atr(['validate', '--all'], env);
  assert.equal(v.status, 1);
  assert.match(v.stdout, /placeholder "TODO" not filled in/);
  assert.match(v.stdout, /example:/);
  const a = atr(['new', 'area', '--country', 'japan', '--name', 'Kanazawa'], env);
  assert.equal(a.status, 0);
  assert.ok(fs.existsSync(path.join(root, 'areas/japan/kanazawa.yaml')));
});

test('blocks, unknown command suggestion, gaps and feedback run', () => {
  assert.equal(JSON.parse(atr(['blocks', '--json']).stdout).hero.example.type, 'hero');
  assert.match(atr(['blocks', 'quickfacts']).stderr, /Did you mean "quick_facts"/);
  assert.match(atr(['valdiate']).stderr, /Did you mean "validate"/);
  assert.equal(atr(['gaps', '--fixtures']).status, 0);
  const f = atr(['feedback', '--fixtures']);
  assert.equal(f.status, 0);
  assert.match(f.stdout, /taste summary/);
});

test('build --fixtures writes site; run --dry-run prints the claude command', () => {
  const b = JSON.parse(atr(['build', '--fixtures', '--json']).stdout);
  assert.ok(fs.existsSync(path.join(b.dir, 'places/yu-garden/index.html')));
  assert.ok(fs.existsSync(path.join(b.dir, 'assets/atr.css')));
  assert.ok(fs.existsSync(path.join(b.dir, 'places/yu-garden/media/tingtao-pond-640.webp')));
  const r = atr(['run', 'add 1 place', '--dry-run']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /claude -p/);
  assert.match(r.stdout, /--append-system-prompt/);
  assert.match(r.stdout, /--allowedTools/);
});
