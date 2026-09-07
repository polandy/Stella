import { error, redirect } from '@sveltejs/kit';
import {
	archiveEntries,
	exportHousehold,
	planArchive,
	serialiseDocument
} from '$lib/server/domain/archive/archive';
import { tarEntry, tarTrailer } from '$lib/archive/tar';
import { getArchiveDeps, getMediaStore } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Downloading the household archive (docs/02 §2.15).
 *
 * POST rather than GET: the export writes itself into the activity log, and a link a browser
 * may prefetch is the wrong shape for something that leaves a trail.
 *
 * The body is streamed entry by entry, so a household with a real photo library never has its
 * archive in memory — only the file currently being written.
 */

const MIME = 'application/x-tar';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	// The archive carries every member's private records, so only the household admin may take
	// it (docs/02 §2.15). This is the authorisation; the repository scopes by household.
	if (locals.user.role !== 'admin') throw error(403, 'Only the household admin can export.');

	const { fileName, document, mediaPaths } = await exportHousehold(getArchiveDeps(), {
		userId: locals.user.id,
		householdId: locals.user.householdId
	});

	// Named before anything is sent: a path the archive cannot carry must fail as an error,
	// not as a truncated file that still looks like a backup.
	const plan = planArchive(mediaPaths);

	const media = getMediaStore();
	const mtime = Math.floor(Date.now() / 1000);
	const entries = archiveEntries(plan, {
		documentText: serialiseDocument(document),
		read: (path) => media.read(path),
		onMissing: (path) =>
			console.warn(`[export] ${path} is in the database but not on disk; skipped.`)
	});

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const { name, bytes } of entries) {
					controller.enqueue(tarEntry(name, bytes, mtime));
				}
				controller.enqueue(tarTrailer());
				controller.close();
			} catch (err) {
				controller.error(err);
			}
		}
	});

	return new Response(body, {
		headers: {
			'content-type': MIME,
			'content-disposition': `attachment; filename="${fileName}"`,
			'cache-control': 'no-store'
		}
	});
};
