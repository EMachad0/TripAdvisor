// Per-IP sign-in limiter (plan section 6, layer 1): 5 failed sign-ins per IP per 10 minutes, plus a global cap of
// 30 failures per 10 minutes. In memory, one per process (trip-web runs one process). The IP is
// event.getClientAddress(), which adapter-node reads from ADDRESS_HEADER / XFF_DEPTH behind Traefik.
export interface LimiterOptions {
	perIp: number;
	global: number;
	windowMs: number;
}

export const DEFAULT_LIMITS: LimiterOptions = { perIp: 5, global: 30, windowMs: 10 * 60 * 1000 };

export class LoginLimiter {
	private readonly byIp = new Map<string, number[]>();
	private all: number[] = [];
	private readonly options: LimiterOptions;
	private readonly now: () => number;

	constructor(options: LimiterOptions = DEFAULT_LIMITS, now: () => number = Date.now) {
		this.options = options;
		this.now = now;
	}

	/** True when this IP, or everyone, has used up the failures allowed in the window. */
	isBlocked(ip: string): boolean {
		this.prune();
		return (
			(this.byIp.get(ip)?.length ?? 0) >= this.options.perIp ||
			this.all.length >= this.options.global
		);
	}

	recordFailure(ip: string): void {
		this.prune();
		const at = this.now();
		this.byIp.set(ip, [...(this.byIp.get(ip) ?? []), at]);
		this.all.push(at);
	}

	/** Forget every failure (tests, or an operator clearing a lockout by restarting). */
	clear(): void {
		this.byIp.clear();
		this.all = [];
	}

	private prune(): void {
		const since = this.now() - this.options.windowMs;
		this.all = this.all.filter((t) => t > since);
		for (const [ip, times] of this.byIp) {
			const kept = times.filter((t) => t > since);
			if (kept.length === 0) this.byIp.delete(ip);
			else this.byIp.set(ip, kept);
		}
	}
}

export const loginLimiter = new LoginLimiter();

/** The Better Auth paths that take a password. */
export function isSignInPath(pathname: string): boolean {
	return pathname.startsWith('/api/auth/sign-in/');
}
