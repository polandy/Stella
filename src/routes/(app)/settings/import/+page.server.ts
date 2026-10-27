import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { detectImportFormat } from '$lib/server/domain/import/read';
import { skippedContacts } from '$lib/server/domain/import/review-view';
import { phrase } from '$lib/i18n/phrase';
import { requireAdmin } from '$lib/server/auth/guards';
import { getConfig } from '$lib/server/config';
import { applyImport, previewImport } from '$lib/server/domain/import/apply';
import { MonicaJsonError } from '$lib/server/domain/import/monica/json-export';
import { SqlDumpError } from '$lib/server/domain/import/monica/sql-dump';
import { VCardError } from '$lib/server/domain/import/vcard';
import {
	discardStagedDump,
	pruneStagedDumps,
	stageDump,
	STAGED_DUMP_MAX_AGE_MS
} from '$lib/server/import/staging';
import { importWording } from '$lib/server/i18n/import-wording';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';
import { nextcloudActions, nextcloudPanel } from './actions/nextcloud';
import { reviewActions, reviewStep } from './actions/review';
import { photoManifest, stagedStep, VisibilitySchema } from './actions/staged';

/*
 * The import wizard (docs/02 §2.16): upload → preview → confirm → photos. Either of Monica's
 * exports is accepted — the SQL dump or the JSON file — and a vCard besides, and which one it
 * is comes from the file itself. A vCard is reviewed against the people already here instead
 * of confirmed (`actions/review.ts`). It is staged on disk between steps; every step re-plans from it, so
 * the preview and the import can never disagree. The linked Nextcloud book's new cards take the
 * same review (`actions/nextcloud.ts`). Admin only.
 */

/** The errors that mean "this file is not an export I can read", whichever format it claimed. */
const UNREADABLE = [SqlDumpError, MonicaJsonError, VCardError] as const;
const isUnreadable = (err: unknown): err is SqlDumpError | MonicaJsonError | VCardError =>
	UNREADABLE.some((kind) => err instanceof kind);

/** Largest export accepted, uncompressed. A family's Monica is a few MB; this is generous. */
const DUMP_MAX_BYTES = 200 * 1024 * 1024;

const GZIP_MAGIC = [0x1f, 0x8b];

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAdmin(locals);
	return {
		skipped: await skippedContacts(locals.services.archive.reviewViewDeps, {
			id: user.id,
			householdId: user.householdId
		}),
		nextcloud: await nextcloudPanel(locals)
	};
};

/** The export as text, whether it arrived plain or gzipped. */
async function dumpTextOf(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const gzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
	const plain = gzipped ? Bun.gunzipSync(bytes) : bytes;
	if (plain.byteLength > DUMP_MAX_BYTES) throw new SqlDumpError(phrase('import.error.tooLarge'));
	return new TextDecoder().decode(plain);
}

export const actions = {
	...reviewActions,
	...nextcloudActions,

	preview: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const form = await request.formData();
		const file = form.get('dump');
		const visibility = v.parse(VisibilitySchema, form.get('visibility') || undefined);
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, {
				step: 'upload' as const,
				error: say(locals, 'import.error.chooseFile')
			});
		}
		try {
			const text = await dumpTextOf(file);
			const plan = previewImport(locals.services.archive.importDeps, text, {
				householdId: user.householdId,
				userId: user.id,
				visibility,
				wording: importWording(locals),
				locale: locals.locale
			});
			await pruneStagedDumps(getConfig().importDir, STAGED_DUMP_MAX_AGE_MS);
			const token = await stageDump(getConfig().importDir, text);
			return {
				step: 'preview' as const,
				token,
				visibility,
				isVCard: detectImportFormat(text) === 'vcard',
				report: plan.report,
				customTypes: plan.relationshipTypes.map((t) => ({
					forwardLabel: t.forwardLabel,
					reverseLabel: t.reverseLabel,
					category: t.category
				}))
			};
		} catch (err) {
			if (isUnreadable(err))
				return fail(400, { step: 'upload' as const, error: err.phrase(translator(locals)) });
			throw err;
		}
	},

	confirm: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const step = await stagedStep(await request.formData(), locals);
		if ('failure' in step) return step.failure;
		// A vCard is never imported unreviewed: the review decides who each card is.
		if (detectImportFormat(step.text) === 'vcard') return reviewStep(locals, step);

		const { plan, outcome } = await applyImport(locals.services.archive.importDeps, step.text, {
			householdId: user.householdId,
			userId: user.id,
			visibility: step.visibility,
			wording: importWording(locals),
			locale: locals.locale
		});
		return {
			step: 'photos' as const,
			token: step.token,
			report: plan.report,
			inserted: outcome.inserted,
			photos: photoManifest(plan.photos),
			// A JSON export carries its pictures; a dump only names them, and the admin has to
			// point at Monica's folder. The step reads differently for each (docs/02 §2.16).
			photosAreEmbedded: plan.photos.some((p) => p.dataUrl !== null)
		};
	},

	finish: async ({ request, locals }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const token = form.get('token');
		if (typeof token === 'string') await discardStagedDump(getConfig().importDir, token);
		throw redirect(303, '/contacts');
	}
} satisfies Actions;
