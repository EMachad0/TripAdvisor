import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { FIXTURES } from '../lib/paths.js';

export const YU = path.join(FIXTURES, 'places/china/shanghai/yu-garden');
export const fixturePlace = () => parse(fs.readFileSync(path.join(YU, 'place.yaml'), 'utf8'));
export const fixtureCredits = () => parse(fs.readFileSync(path.join(YU, 'media/credits.yaml'), 'utf8'));
export const fixtureMedia = () => fs.readdirSync(path.join(YU, 'media'));
export function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'atr-test-')); }
