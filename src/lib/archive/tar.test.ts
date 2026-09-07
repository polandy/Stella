import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TAR_BLOCK, TarNameTooLongError, tarEntry, tarTrailer } from './tar';

/*
 * The tar writer behind the export archive (docs/02 §2.15). Written by hand rather than with a
 * dependency, so the cases that matter are the ones a hand-written header gets wrong: block
 * alignment, the octal fields, and the checksum. The last case is the one that counts — it
 * hands the bytes to the system's own tar and asks whether it can read them.
 */

const utf8 = new TextEncoder();

/** Concatenates the parts an archive is made of, the way the export route streams them. */
function archive(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
	const parts = [...entries.map((e) => tarEntry(e.name, e.bytes, 0)), tarTrailer()];
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

describe('tarEntry', () => {
	it('pads a short file up to a whole number of blocks', () => {
		const entry = tarEntry('hello.txt', utf8.encode('hi'), 0);
		expect(entry.length).toBe(TAR_BLOCK * 2); // one header, one padded data block
		expect(entry.subarray(TAR_BLOCK, TAR_BLOCK + 2)).toEqual(utf8.encode('hi'));
		// The padding is zeroes, not whatever was in the buffer.
		expect(entry.subarray(TAR_BLOCK + 2).every((b) => b === 0)).toBe(true);
	});

	it('writes an exactly-block-sized file without adding an empty block', () => {
		const entry = tarEntry('block.bin', new Uint8Array(TAR_BLOCK).fill(7), 0);
		expect(entry.length).toBe(TAR_BLOCK * 2);
	});

	it('writes an empty file as a header and nothing else', () => {
		expect(tarEntry('empty', new Uint8Array(0), 0).length).toBe(TAR_BLOCK);
	});

	it('refuses a name the format cannot hold, rather than truncating it', () => {
		expect(() => tarEntry('x'.repeat(101), new Uint8Array(0), 0)).toThrow(TarNameTooLongError);
	});
});

describe('tarTrailer', () => {
	it('ends the archive with the two zero blocks readers look for', () => {
		const end = tarTrailer();
		expect(end.length).toBe(TAR_BLOCK * 2);
		expect(end.every((b) => b === 0)).toBe(true);
	});
});

describe('an archive read back by the system tar', () => {
	it('lists the entries with their sizes, and gives the contents back unchanged', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'stella-tar-'));
		try {
			const path = join(dir, 'a.tar');
			const big = new Uint8Array(1500);
			for (let i = 0; i < big.length; i++) big[i] = i % 256;
			await Bun.write(
				path,
				archive([
					{ name: 'manifest.json', bytes: utf8.encode('{"stella":1}') },
					{ name: 'media/photo-1.jpg', bytes: big }
				])
			);

			const list = await Bun.$`tar -tvf ${path}`.text();
			expect(list).toContain('manifest.json');
			expect(list).toContain('media/photo-1.jpg');
			expect(list).toContain('1500');

			await Bun.$`tar -xf ${path} -C ${dir}`.quiet();
			expect(await Bun.file(join(dir, 'manifest.json')).text()).toBe('{"stella":1}');
			expect(new Uint8Array(await Bun.file(join(dir, 'media/photo-1.jpg')).arrayBuffer())).toEqual(big);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
