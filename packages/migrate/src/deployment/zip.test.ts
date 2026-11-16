import zlib from 'node:zlib';
import { expect, test } from 'vitest';
import { storedZip } from './zip.ts';

/** The entries of a stored ZIP, read back through its central directory. */
function entries(zip: Buffer): Map<string, string> {
	const end = zip.length - 22;
	expect(zip.readUInt32LE(end)).toBe(0x06054b50);
	const count = zip.readUInt16LE(end + 10);
	let at = zip.readUInt32LE(end + 16);
	const out = new Map<string, string>();
	for (let i = 0; i < count; i++) {
		expect(zip.readUInt32LE(at)).toBe(0x02014b50);
		const size = zip.readUInt32LE(at + 24);
		const nameLength = zip.readUInt16LE(at + 28);
		const local = zip.readUInt32LE(at + 42);
		const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
		expect(zip.readUInt32LE(local)).toBe(0x04034b50);
		const start = local + 30 + zip.readUInt16LE(local + 26);
		const data = zip.subarray(start, start + size);
		expect(zlib.crc32(data)).toBe(zip.readUInt32LE(local + 14));
		out.set(name, data.toString('utf8'));
		at += 46 + nameLength;
	}
	return out;
}

test('a stored ZIP holds every entry, empty ones included, with its CRC', () => {
	const zip = storedZip([
		['swipes/documents.jsonl', Buffer.from('{"id":"a"}\n{"id":"b"}\n')],
		['notes/documents.jsonl', Buffer.alloc(0)],
		['trip/ä.jsonl', Buffer.from('x')],
	]);
	expect(entries(zip)).toEqual(
		new Map([
			['swipes/documents.jsonl', '{"id":"a"}\n{"id":"b"}\n'],
			['notes/documents.jsonl', ''],
			['trip/ä.jsonl', 'x'],
		]),
	);
});
