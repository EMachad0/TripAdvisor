// @atr/shared: strict TS ports of the old stack's pure logic (game/lib and platform/lib/route.js) and the v1
// codec. Every module is runtime-neutral (no Node, no DOM), so the app, the browser and Convex can import it.
// Import a module by subpath when names collide (both board and trip have addDays, routemap has nightsBetween).
export * from './elo.ts';
export * from './pairing.ts';
export * as board from './board.ts';
export * as feedback from './feedback.ts';
export * as trip from './trip.ts';
export * as routemap from './routemap.ts';
export * as route from './route.ts';
export * as v1 from './v1.ts';
export * from './schema/check.ts';
export * from './schema/dsl.ts';
export * from './schema/enums.ts';
