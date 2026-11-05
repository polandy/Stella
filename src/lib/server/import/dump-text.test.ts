import { describe, expect, it } from 'bun:test';
import { SqlDumpError } from '../domain/import/monica/sql-dump';
import { dumpTextOf } from './dump-text';

/*
 * The uploaded export as text (docs/02 §2.16): plain or gzipped, and never more than the cap
 * in memory — a small gzip bomb is refused while it inflates, not after.
 */

const file = (bytes: Uint8Array<ArrayBuffer> | string) => new File([bytes], 'dump.sql');

describe('dumpTextOf', () => {
	it('reads a plain export', async () => {
		expect(await dumpTextOf(file('CREATE TABLE x;'), 100)).toBe('CREATE TABLE x;');
	});

	it('inflates a gzipped export', async () => {
		expect(await dumpTextOf(file(Bun.gzipSync('CREATE TABLE x;')), 100)).toBe('CREATE TABLE x;');
	});

	it('refuses a plain file past the cap without reading it', async () => {
		await expect(dumpTextOf(file('x'.repeat(101)), 100)).rejects.toThrow(SqlDumpError);
	});

	it('refuses a gzip that inflates past the cap, though small on the wire', async () => {
		const bomb = Bun.gzipSync(new Uint8Array(10_000));
		expect(bomb.byteLength).toBeLessThan(100);
		await expect(dumpTextOf(file(bomb), 1_000)).rejects.toThrow(SqlDumpError);
	});
});
