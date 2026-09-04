import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discardStagedDump, pruneStagedDumps, readStagedDump, stageDump } from './staging';

/*
 * Dump staging between wizard steps (docs/02 §2.16): a token finds the dump again, a forged
 * token finds nothing and names no path, and dumps left behind by an abandoned wizard are
 * pruned by age so the data directory cannot fill up silently.
 */

const DAY = 24 * 60 * 60 * 1000;
let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'stella-staging-'));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('staging', () => {
	it('stages a dump and reads it back by token', async () => {
		const token = await stageDump(dir, 'CREATE TABLE x');
		expect(await readStagedDump(dir, token)).toBe('CREATE TABLE x');
		await discardStagedDump(dir, token);
		expect(await readStagedDump(dir, token)).toBeNull();
	});

	it('answers null to a token that is not a ULID, whatever it looks like', async () => {
		expect(await readStagedDump(dir, '../../etc/passwd')).toBeNull();
		expect(await readStagedDump(dir, '')).toBeNull();
	});

	it('prunes dumps older than the given age and keeps the fresh ones', async () => {
		const old = await stageDump(dir, 'old');
		const fresh = await stageDump(dir, 'fresh');
		const twoDaysAgo = new Date(Date.now() - 2 * DAY);
		await utimes(join(dir, `${old}.sql`), twoDaysAgo, twoDaysAgo);

		const removed = await pruneStagedDumps(dir, DAY);
		expect(removed).toBe(1);
		expect(await readStagedDump(dir, old)).toBeNull();
		expect(await readStagedDump(dir, fresh)).toBe('fresh');
		expect(await readdir(dir)).toEqual([`${fresh}.sql`]);
	});
});
