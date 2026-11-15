// Test-only probe for the e2e suite: a real ownerMutation, so Playwright can prove that the guest is refused by
// the wrapper. Inert outside test deployments: it throws unless ATR_CI_DEPLOYMENT=1 (never set on prod), and it
// writes nothing but the appliedOps row every ownerMutation records.
import { ownerMutation } from './lib/access';
import * as env from './lib/env';

export const probeWrite = ownerMutation({
	args: {},
	handler: () => {
		if (!env.isCiDeployment()) throw new Error('probeWrite runs only where ATR_CI_DEPLOYMENT=1');
		return { ok: true as const };
	},
});
