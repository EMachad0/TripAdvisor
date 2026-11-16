// Programmatic sign-in once per run; the specs reuse the saved storage state.
import { expect, test as setup } from '@playwright/test';
import { type Account, clientIp, credentials, STORAGE } from './support';

for (const account of ['owner', 'guest'] as const satisfies readonly Account[]) {
	setup(`sign in as ${account}`, async ({ request, baseURL }) => {
		const response = await request.post('/api/auth/sign-in/username', {
			headers: { origin: baseURL ?? '', 'x-forwarded-for': clientIp('setup', 1) },
			data: { ...credentials(account), rememberMe: true },
		});
		expect(response.status()).toBe(200);
		await request.storageState({ path: STORAGE[account] });
	});
}
