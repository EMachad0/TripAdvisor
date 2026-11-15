import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './helpers.js';
import { claudeArgs, DISALLOWED_TOOLS } from '../lib/runner.js';

test('claude args include guide, tools, guards and resume', () => {
  const a = claudeArgs({ prompt: 'x', resume: 'abc', model: 'sonnet' });
  assert.ok(a.includes('--append-system-prompt'));
  assert.equal(a[a.indexOf('--allowedTools') + 1], 'Read,Write,Edit,Bash,WebSearch,WebFetch,Glob,Grep,Agent,ToolSearch');
  assert.ok(DISALLOWED_TOOLS.includes('Edit(./platform/**)'));
  assert.equal(a[a.indexOf('--resume') + 1], 'abc');
});

test('loop feeds validation errors back via --resume until clean (fake claude)', async () => {
  const root = tmpDir();
  const dir = path.join(root, 'areas/china');
  fs.mkdirSync(dir, { recursive: true });
  const area = path.join(dir, 'testville.yaml');
  fs.writeFileSync(area, 'id: testville\ncountry: china\n'); // invalid
  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const resume = args.includes('--resume');
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.log'))}, (resume ? 'resume' : 'first') + '\\n');
if (resume) fs.writeFileSync(${JSON.stringify(area)}, ${JSON.stringify(`id: testville
country: china
name: Testville
region: Test region
scope: city
why: A perfectly valid test area card used by the runner loop test.
best_for: [nature]
days_suggested: { min: 1, max: 2 }
cost_level: low
winter_note: Cold.
image: none
sources:
  - { url: https://example.com/a, title: A, checked: 2026-11-01 }
  - { url: https://example.com/b, title: B, checked: 2026-11-01 }
confidence: low
last_updated: 2026-11-01
`)});
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }));
console.log(JSON.stringify({ type: 'result', session_id: 'sess-1', result: resume ? 'fixed' : 'did stuff', total_cost_usd: 0, num_turns: 1 }));
`);
  fs.chmodSync(fake, 0o755);
  process.env.ATR_DATA_ROOT = root;
  process.env.ATR_CLAUDE_BIN = fake;
  try {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 3, log: () => {} });
    // image "none" has no credits -> still an error; loop must stop at maxRounds or when clean
    const calls = fs.readFileSync(path.join(root, 'calls.log'), 'utf8').trim().split('\n');
    assert.equal(calls[0], 'first');
    assert.equal(calls[1], 'resume');
    assert.ok(r.rounds[1].errors < r.rounds[0].errors);
    assert.ok(fs.existsSync(path.join(r.dir, 'round-1.jsonl')));
    assert.ok(fs.readFileSync(path.join(r.dir, 'round-2.prompt.md'), 'utf8').includes('testville.yaml'));
    fs.rmSync(r.dir, { recursive: true, force: true });
  } finally { delete process.env.ATR_DATA_ROOT; delete process.env.ATR_CLAUDE_BIN; }
});
