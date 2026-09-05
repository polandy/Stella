import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ulid } from 'ulid';

/*
 * Staging for uploaded Monica dumps (docs/02 §2.16). The wizard previews first and imports on
 * confirm, in two requests; the dump waits on disk in between under an opaque token rather
 * than travelling back through the browser. Photo uploads reuse the token to re-plan and find
 * which contact a file belongs to. Files are removed when the import is finished; the ones an
 * abandoned wizard leaves behind are pruned by age the next time a dump is staged.
 */

/** How long an abandoned dump may linger before the next staging prunes it. */
export const STAGED_DUMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A ULID — the only shape a token can have, so a token can never name a path. */
const TOKEN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const pathOf = (dir: string, token: string) => join(dir, `${token}.sql`);

/** Keep a dump for later steps; returns the token that finds it again. */
export async function stageDump(dir: string, text: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const token = ulid();
	await Bun.write(pathOf(dir, token), text);
	return token;
}

/** The staged dump for a token, or null when there is none (expired, finished, or forged). */
export async function readStagedDump(dir: string, token: string): Promise<string | null> {
	if (!TOKEN.test(token)) return null;
	const file = Bun.file(pathOf(dir, token));
	return (await file.exists()) ? file.text() : null;
}

/** Forget a staged dump. */
export async function discardStagedDump(dir: string, token: string): Promise<void> {
	if (!TOKEN.test(token)) return;
	await rm(pathOf(dir, token), { force: true });
}

/** Remove staged dumps older than `maxAgeMs`; returns how many went. */
export async function pruneStagedDumps(dir: string, maxAgeMs: number): Promise<number> {
	let removed = 0;
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return 0; // nothing staged yet
	}
	const cutoff = Date.now() - maxAgeMs;
	for (const name of names) {
		if (!name.endsWith('.sql')) continue;
		const path = join(dir, name);
		const info = await stat(path);
		if (info.mtimeMs < cutoff) {
			await rm(path, { force: true });
			removed++;
		}
	}
	return removed;
}
