import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TAR_BLOCK, TarFormatError, readTar, tarEntry, tarTrailer } from './tar';

/*
 * Reading an archive back (docs/02 §2.15). The writer's counterpart: a restore starts by
 * taking a `.tar` apart, and the household may well hand back an archive that `tar` itself
 * repacked rather than the exact bytes Stella wrote.
 *
 * The cases that matter are the ones a hand-written parser gets wrong: the padding between
 * entries, an archive that stops in the middle, and a header whose checksum does not hold.
 * The last case here does what the writer's spec does in reverse — it reads what the system's
 * own `tar` produced.
 */

const utf8 = new TextEncoder();
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** The bytes of an archive holding these entries, as the export route streams them. */
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

describe('readTar', () => {
	it('reads back exactly what the writer put in, in order', () => {
		const entries = readTar(
			archive([
				{ name: 'household.yaml', bytes: utf8.encode('format: stella-archive\n') },
				{ name: 'media/photo-1.jpg', bytes: new Uint8Array([1, 2, 3]) }
			])
		);

		expect(entries.map((e) => e.name)).toEqual(['household.yaml', 'media/photo-1.jpg']);
		expect(text(entries[0].bytes)).toBe('format: stella-archive\n');
		expect([...entries[1].bytes]).toEqual([1, 2, 3]);
	});

	it('does not hand back the padding as part of a file', () => {
		// Three bytes in a 512-byte block: a reader that trusts the block boundary instead of
		// the size field returns 509 zeroes too, and every restored photo is corrupt.
		const [entry] = readTar(archive([{ name: 'small.bin', bytes: new Uint8Array([9, 9, 9]) }]));
		expect(entry.bytes.length).toBe(3);
	});

	it('reads a file that fills its last block exactly', () => {
		const bytes = new Uint8Array(TAR_BLOCK).fill(7);
		const [entry] = readTar(archive([{ name: 'block.bin', bytes }]));
		expect(entry.bytes).toEqual(bytes);
	});

	it('keeps an empty file, which has a header and no data at all', () => {
		const entries = readTar(
			archive([
				{ name: 'empty', bytes: new Uint8Array(0) },
				{ name: 'after', bytes: utf8.encode('still read') }
			])
		);
		expect(entries.map((e) => e.name)).toEqual(['empty', 'after']);
		expect(entries[0].bytes.length).toBe(0);
		expect(text(entries[1].bytes)).toBe('still read');
	});

	it('stops at the end-of-archive blocks and ignores whatever follows', () => {
		const full = archive([{ name: 'one.txt', bytes: utf8.encode('a') }]);
		// Some writers pad the archive out to a fixed block factor with more zeroes.
		const padded = new Uint8Array(full.length + TAR_BLOCK * 8);
		padded.set(full, 0);
		expect(readTar(padded).map((e) => e.name)).toEqual(['one.txt']);
	});

	it('skips the directory entries `tar` adds when a folder is repacked', () => {
		const dir = tarEntry('media/', new Uint8Array(0), 0);
		dir[156] = '5'.charCodeAt(0); // typeflag: directory
		// The checksum has to be recomputed for the changed typeflag, the way tar writes it.
		dir.fill(0x20, 148, 156);
		const sum = dir.subarray(0, TAR_BLOCK).reduce((n, b) => n + b, 0);
		dir.set(utf8.encode(sum.toString(8).padStart(6, '0') + '\0 '), 148);

		const file = tarEntry('media/photo.jpg', new Uint8Array([4]), 0);
		const bytes = new Uint8Array(dir.length + file.length + TAR_BLOCK * 2);
		bytes.set(dir, 0);
		bytes.set(file, dir.length);

		expect(readTar(bytes).map((e) => e.name)).toEqual(['media/photo.jpg']);
	});

	it('drops the ./ prefix `tar` writes, which names the same file', () => {
		const [entry] = readTar(archive([{ name: './household.yaml', bytes: utf8.encode('x') }]));
		expect(entry.name).toBe('household.yaml');
	});

	it('refuses an archive that stops in the middle of a file', () => {
		const full = archive([{ name: 'one.txt', bytes: new Uint8Array(600) }]);
		expect(() => readTar(full.subarray(0, TAR_BLOCK * 2))).toThrow(TarFormatError);
	});

	it('refuses a header whose checksum does not hold', () => {
		const bytes = archive([{ name: 'one.txt', bytes: utf8.encode('a') }]);
		bytes[10] = 'X'.charCodeAt(0); // a byte of the name, leaving the checksum stale
		expect(() => readTar(bytes)).toThrow(TarFormatError);
	});

	it('refuses something that is not a tar at all', () => {
		expect(() => readTar(utf8.encode('this is a YAML file, not an archive'))).toThrow(
			TarFormatError
		);
	});
});

describe('an archive written by the system tar', () => {
	it('is read back with its files and their contents', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'stella-tar-read-'));
		try {
			await Bun.write(join(dir, 'household.yaml'), 'format: stella-archive\nversion: 1\n');
			await Bun.write(join(dir, 'media/photo-1.jpg'), new Uint8Array([0xff, 0xd8, 0xff]));
			const tarred = join(dir, 'out.tar');
			const proc = Bun.spawnSync(['tar', '-cf', tarred, 'household.yaml', 'media'], { cwd: dir });
			expect(proc.exitCode).toBe(0);

			const entries = readTar(new Uint8Array(await Bun.file(tarred).arrayBuffer()));
			const byName = new Map(entries.map((e) => [e.name, e.bytes]));
			expect(text(byName.get('household.yaml')!)).toBe('format: stella-archive\nversion: 1\n');
			expect([...byName.get('media/photo-1.jpg')!]).toEqual([0xff, 0xd8, 0xff]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
