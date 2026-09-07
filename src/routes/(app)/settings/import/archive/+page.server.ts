import { fail } from '@sveltejs/kit';
import { readTar, TarFormatError } from '$lib/archive/tar';
import { requireAdmin } from '$lib/server/auth/guards';
import { importArchive, splitArchive } from '$lib/server/domain/archive/import';
import {
	ArchiveFormatError,
	ArchiveVersionError,
	ForeignHouseholdError
} from '$lib/server/domain/archive/restore';
import { getImportArchiveDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * Restoring the household from an archive (docs/02 §2.15). Admin only, like the export: the
 * archive carries every member's private records.
 *
 * One step, not a wizard. The Monica import previews first because it *maps* one model onto
 * another and the admin has to agree with the mapping; a restore adds records that are already
 * ours, never overwrites, and is a no-op the second time — so the honest thing is to do it and
 * report exactly what was written (docs/04 §4.9).
 */

/**
 * Largest archive accepted. It is read into memory whole, so this is a real limit — and it
 * sits just under the deployment's `BODY_SIZE_LIMIT` (250M in the image), so a household that
 * is over it reads this sentence instead of adapter-node's bare 413.
 */
const ARCHIVE_MAX_BYTES = 200 * 1024 * 1024;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return {};
};

/** The messages a bad file earns, kept apart from the ones that mean a bug. */
function messageFor(error: unknown): string | null {
	if (
		error instanceof TarFormatError ||
		error instanceof ArchiveFormatError ||
		error instanceof ArchiveVersionError ||
		error instanceof ForeignHouseholdError
	) {
		return error.message;
	}
	return null;
}

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const form = await request.formData();
		const file = form.get('archive');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Please choose the .tar archive to restore.' });
		}
		if (file.size > ARCHIVE_MAX_BYTES) {
			return fail(400, {
				error: `That archive is larger than the ${Math.round(ARCHIVE_MAX_BYTES / (1024 * 1024))} MB this importer accepts.`
			});
		}

		try {
			const archive = splitArchive(readTar(new Uint8Array(await file.arrayBuffer())));
			const report = await importArchive(
				getImportArchiveDeps(),
				{ userId: user.id, householdId: user.householdId },
				archive
			);
			return { report };
		} catch (error) {
			const message = messageFor(error);
			// Anything else is a bug or a broken database, and must not be dressed up as advice.
			if (message === null) throw error;
			return fail(400, { error: message });
		}
	}
};
