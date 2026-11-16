// A ZIP archive of stored (uncompressed) entries: the snapshot format `convex import` reads, one
// <table>/documents.jsonl per table. Enough for a few small files; no compression, no ZIP64 (each entry and the
// whole archive must stay under 4 GiB, and there can be at most 65535 entries).
import zlib from 'node:zlib';

/** 1980-01-01 00:00 in MS-DOS date and time fields, the earliest a ZIP can say. */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

export function storedZip(entries: readonly (readonly [name: string, data: Buffer])[]): Buffer {
	const local: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const [name, data] of entries) {
		const nameBytes = Buffer.from(name, 'utf8');
		const crc = zlib.crc32(data);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0); // local file header
		header.writeUInt16LE(20, 4); // version needed: 2.0
		header.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
		header.writeUInt16LE(0, 8); // method: stored
		header.writeUInt16LE(DOS_TIME, 10);
		header.writeUInt16LE(DOS_DATE, 12);
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(data.length, 18); // compressed size
		header.writeUInt32LE(data.length, 22); // uncompressed size
		header.writeUInt16LE(nameBytes.length, 26);
		local.push(header, nameBytes, data);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0); // central directory header
		entry.writeUInt16LE(20, 4); // version made by
		entry.writeUInt16LE(20, 6); // version needed
		entry.writeUInt16LE(0x0800, 8);
		entry.writeUInt16LE(0, 10);
		entry.writeUInt16LE(DOS_TIME, 12);
		entry.writeUInt16LE(DOS_DATE, 14);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(data.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(nameBytes.length, 28);
		entry.writeUInt32LE(offset, 42); // where the local header starts
		central.push(entry, nameBytes);
		offset += header.length + nameBytes.length + data.length;
	}
	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); // end of central directory
	end.writeUInt16LE(entries.length, 8); // entries on this disk
	end.writeUInt16LE(entries.length, 10); // entries in total
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16); // where the central directory starts
	return Buffer.concat([...local, directory, end]);
}
