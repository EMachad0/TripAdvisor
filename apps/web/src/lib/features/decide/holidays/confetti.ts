// The lock celebration (old game.js confetti()): 36 pieces burst from a point, arc up and fall, for about 1.3 s.
// Drawn on a throwaway full-screen canvas (no inline styles, no DOM nodes per piece). The colours are the country
// palette tokens (--k1 … --k7) read from the page, so light and dark both work. Nothing with reduced motion.

const PIECES = 36;
const TOKENS = ['--k1', '--k2', '--k3', '--k4', '--k5', '--k6', '--k7'];

interface Piece {
	angle: number;
	speed: number;
	spin: number;
	color: string;
	life: number;
}

/** Where a piece is at time t (0..1 of its life), relative to the burst point. Pure, for the unit test. */
export function piecePosition(
	p: Pick<Piece, 'angle' | 'speed'>,
	t: number,
): { x: number; y: number } {
	// Old keyframes: out to (cos·v, sin·v − 80) by 70 %, then on to (1.1·cos·v, sin·v + 120).
	if (t <= 0.7) {
		const k = t / 0.7;
		const ease = 1 - (1 - k) ** 3;
		return { x: Math.cos(p.angle) * p.speed * ease, y: (Math.sin(p.angle) * p.speed - 80) * ease };
	}
	const k = (t - 0.7) / 0.3;
	const x0 = Math.cos(p.angle) * p.speed;
	const y0 = Math.sin(p.angle) * p.speed - 80;
	return { x: x0 + x0 * 0.1 * k, y: y0 + 200 * k };
}

export function confetti(x: number, y: number): void {
	if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches)
		return;
	const css = getComputedStyle(document.documentElement);
	const colors = TOKENS.map((t) => css.getPropertyValue(t).trim()).filter((c) => c !== '');
	if (colors.length === 0) return;
	const canvas = document.createElement('canvas');
	canvas.className = 'pointer-events-none fixed inset-0 z-[100] size-full';
	canvas.setAttribute('aria-hidden', 'true');
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.round(innerWidth * dpr);
	canvas.height = Math.round(innerHeight * dpr);
	document.body.append(canvas);
	const ctx = canvas.getContext('2d');
	if (ctx === null) {
		canvas.remove();
		return;
	}
	ctx.scale(dpr, dpr);
	const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => ({
		angle: (Math.PI * 2 * i) / PIECES + Math.random() * 0.3,
		speed: 120 + Math.random() * 160,
		spin: Math.random() * 12 + 4,
		color: colors[i % colors.length] ?? colors[0] ?? '',
		life: 1100 + Math.random() * 400,
	}));
	const start = performance.now();
	const longest = Math.max(...pieces.map((p) => p.life));
	const frame = (now: number): void => {
		const ms = now - start;
		ctx.clearRect(0, 0, innerWidth, innerHeight);
		for (const p of pieces) {
			const t = Math.min(1, ms / p.life);
			if (t >= 1) continue;
			const pos = piecePosition(p, t);
			ctx.save();
			ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
			ctx.translate(x + pos.x, y + pos.y);
			ctx.rotate(p.spin * t);
			ctx.fillStyle = p.color;
			ctx.fillRect(-4, -3, 8, 6);
			ctx.restore();
		}
		if (ms < longest) requestAnimationFrame(frame);
		else canvas.remove();
	};
	requestAnimationFrame(frame);
}
