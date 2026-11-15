// The v1 codec: today's feedback/*.jsonl lines, feedback/game-state.json and trip/*.json files <-> typed records
// (the documents the Convex tables hold, without seq/userId). x_ fields ride along in `extra`.
export * from './v1/feedback-specs.ts';
export type * from './v1/feedback-types.ts';
export * from './v1/feedback.ts';
export * from './v1/game-state.ts';
export * from './v1/json.ts';
export * from './v1/trip-types.ts';
export * from './v1/trip.ts';
export * from './v1/tables.ts';
export * from './v1/rows.ts';
export * from './v1/export.ts';
export * from './v1/bundle.ts';
