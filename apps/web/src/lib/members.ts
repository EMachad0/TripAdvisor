// What members.me returns (src/convex/members.ts), as a plain type the UI can import without Convex internals.
import type { Role } from '#convex/tables/validators.js';

export interface Me {
	role: Role;
	username: string | null;
}
