import { expect, type Page } from '@playwright/test';
import { DOCUMENT_ENTRY } from '../src/lib/server/domain/archive/archive';
import { tarEntry, tarTrailer } from '../src/lib/archive/tar';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from '../src/lib/server/domain/archive/document';

/*
 * Seeding people and links through the archive restore (docs/02 §2.15) instead of the forms.
 *
 * A family entered through the UI costs a page load and a form post per person and per link —
 * a spec that needs nine people and eight links spent twenty seconds getting to its first
 * assertion. The restore writes the same rows in one request, through a real endpoint the suite
 * covers on its own in `import-archive.spec.ts`; the forms stay covered where they are the
 * subject. Use it for the *setting* of a case, never for the step under test.
 *
 * The tar is built with the app's own writer (`src/lib/archive/tar.ts`, alias-free for that
 * reason), and the document is JSON — every JSON document is a YAML document, so the server
 * reads it as it reads an export.
 */

/** The built-in relationship types by their stable id (`built-in-types.ts`). */
export const LINK = { siblingOf: 'sibling', parentOf: 'parent_child' } as const;

export interface SeedLink {
	/** Full names, as `people` spells them. */
	from: string;
	to: string;
	type: (typeof LINK)[keyof typeof LINK];
}

/** Restore is add-only and keyed by id, so an id that is a function of the name is idempotent. */
const idOf = (name: string) => `e2e-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** The `restore` action of the archive screen; a plain form post, answered with the report. */
const RESTORE_ACTION = '/settings/import/archive?/restore';

/**
 * Writes `people` (full names, first and last) and the `links` between them into the household
 * and waits for the restore report to say every person was added.
 */
export async function seedHousehold(
	page: Page,
	people: readonly string[],
	links: readonly SeedLink[] = []
): Promise<void> {
	const document = {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		household: 'e2e seed',
		people: people.map((name) => {
			const [first, ...rest] = name.split(' ');
			return {
				id: idOf(name),
				display_name: name,
				first_name: first,
				last_name: rest.join(' ')
			};
		}),
		relationships: links.map((link) => ({
			id: idOf(`${link.from} ${link.type} ${link.to}`),
			from: idOf(link.from),
			to: idOf(link.to),
			type: link.type,
			// The status a link entered through the form gets (docs/03 §relationship).
			status: 'current'
		}))
	};
	const text = new TextEncoder().encode(JSON.stringify(document));
	const archive = Buffer.concat([tarEntry(DOCUMENT_ENTRY, text, 0), tarTrailer()]);

	const response = await page.request.post(RESTORE_ACTION, {
		// SvelteKit refuses a form post whose origin it does not recognise; the browser would
		// send this header itself.
		headers: { origin: new URL(page.url()).origin },
		multipart: {
			archive: {
				name: 'seed.tar',
				mimeType: 'application/x-tar',
				buffer: archive
			}
		}
	});
	expect(response.status()).toBe(200);
	// A refused archive answers 200 too, with an error where the report would be — so the
	// report's own counts are the signal, not the status.
	const report = restoreReportFrom(await response.text());
	expect(report.added.contact).toBe(people.length);
	expect(report.added.relationship).toBe(links.length);
}

/** The counts the restore report carries for the two kinds of record the seed writes. */
interface RestoreCounts {
	added: { contact: number; relationship: number };
}

/**
 * Playwright's request context asks for JSON, so the form action answers with its result the
 * way SvelteKit hands it to `use:enhance`: `data` is a devalue-flattened array, where every
 * object holds indexes into the array instead of values.
 */
function restoreReportFrom(body: string): RestoreCounts {
	const result = JSON.parse(body) as { type: string; data?: string };
	expect(result.type).toBe('success');
	const flat = JSON.parse(result.data ?? '[]') as unknown[];
	const record = (index: unknown) => flat[index as number] as Record<string, number>;
	const count = (index: unknown) => flat[index as number] as number;
	const added = record(record(record(0).report).added);
	return { added: { contact: count(added.contact), relationship: count(added.relationship) } };
}
