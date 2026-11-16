// Parity: platform/lib/feedback (latestNotes) against the port, on the real notes file. latestVerdicts, sortedDuels
// and unseenKeys were checked here against the old server's game/lib/store.js until it was retired; they are now in
// ../feedback.test.ts.
import { beforeAll, describe, expect, test } from 'vitest';
import * as feedback from '../../src/feedback.ts';
import type { NoteRecord } from '../../src/v1/feedback-types.ts';
import { feedbackRecords } from '../samples.ts';
import { legacy } from '../support.ts';

interface OldPlatform {
	latestNotes: typeof feedback.latestNotes;
}

let platform: OldPlatform;
beforeAll(async () => {
	platform = await legacy<OldPlatform>('platform/lib/index.js');
});

describe('feedback parity', () => {
	test('latestNotes on the real file, with and without cleared notes', () => {
		const notes: NoteRecord[] = feedbackRecords('notes');
		for (const opts of [{}, { keepCleared: true }]) {
			expect([...feedback.latestNotes(notes, opts)]).toStrictEqual([
				...platform.latestNotes(notes, opts),
			]);
		}
	});
});
