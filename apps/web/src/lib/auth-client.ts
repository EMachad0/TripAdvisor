// Better Auth client for the browser (same origin: /api/auth/* is proxied to the Convex site).
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import { usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({ plugins: [usernameClient(), convexClient()] });
