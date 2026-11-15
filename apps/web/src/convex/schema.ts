// The complete data model (plan section 4). FROZEN: changes go through a small integrator PR.
// The Better Auth tables live inside the betterAuth component (convex.config.ts), not here.
import { defineSchema } from 'convex/server';
import { appliedOps, contentIndex, members, opsFlags, tripChanges } from './tables/app';
import { duels, notes, questions, routes, swipes } from './tables/feedback';
import { firstSeen, gameState } from './tables/state';
import {
	tripBag,
	tripBudget,
	tripDays,
	tripFixed,
	tripLegs,
	tripSettings,
	tripSpend,
	tripTasks,
	tripVisited,
} from './tables/trip';

export default defineSchema({
	// event logs (feedback/*.jsonl)
	swipes,
	duels,
	notes,
	routes,
	questions,
	// current state (feedback/game-state.json)
	gameState,
	firstSeen,
	// trip (trip/*.json)
	tripTasks,
	tripLegs,
	tripBag,
	tripBudget,
	tripFixed,
	tripSpend,
	tripSettings,
	tripDays,
	tripVisited,
	// app-only
	tripChanges,
	appliedOps,
	members,
	contentIndex,
	opsFlags,
});
