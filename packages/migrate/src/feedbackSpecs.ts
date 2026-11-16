// The feedback gates, from the @atr/shared v1 codec (its FEEDBACK_SPECS is the TS port of the platform's).
// - lineErrors: what the import requires of a line, i.e. the shared codec's full check (the old specs plus its
//   strict extras, such as x_ fields only at the top level). A failing line is quarantined.
// - oldReaderKeeps: what the old site's reader keeps (platform readJsonl: the specs alone), used for the canonical
//   form, so verify compares what the old site would actually read.
import { check, v1 } from '@atr/shared';
import type { Json } from './json.ts';
import type { EventKind } from './tables.ts';

export function lineErrors(kind: EventKind, line: Json): string[] {
	return v1.feedbackErrors(kind, line);
}

export function oldReaderKeeps(kind: EventKind, line: Json): boolean {
	return check(v1.FEEDBACK_SPECS[kind], line).every((issue) => issue.level !== 'error');
}
