// Which paths a signed-out visitor may open; everything else redirects to /login.
const PUBLIC_PREFIXES = [
	'/login',
	'/logout',
	'/healthz',
	'/api/auth/',
	'/_app/',
	'/favicon',
	// The browser's default icon request (the place and area pages have no <link rel="icon">).
	'/favicon.ico',
	// The platform's atr.css and fonts: public on the old server too.
	'/assets/',
];

export function isPublicPath(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((prefix) =>
		prefix.endsWith('/')
			? pathname.startsWith(prefix)
			: pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

/** Only same-site paths are valid redirect targets after sign-in. */
export function safeRedirectTarget(target: string | null): string {
	if (
		target === null ||
		!target.startsWith('/') ||
		target.startsWith('//') ||
		target.startsWith('/\\')
	) {
		return '/';
	}
	return target;
}
