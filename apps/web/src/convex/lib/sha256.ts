// sha256 with Web Crypto, which both the Convex runtime and Node provide (the bearer check and the export bundle).

/** Lowercase hex sha256 of a string's UTF-8 bytes. */
export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
