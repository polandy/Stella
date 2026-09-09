import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
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
	readStagedDump,
	stageDump,
	STAGED_DUMP_MAX_AGE_MS
} from '$lib/server/import/staging';
import { importWording } from '$lib/server/i18n/import-wording';
import { say, translator } from '$lib/server/i18n/say';
import { getImportDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * The import wizard (docs/02 §2.16): upload → preview → confirm → photos. Either of Monica's
 * exports is accepted — the SQL dump or the JSON file — and a vCard besides, and which one it
 * is comes from the file itself. It is staged on disk between steps; every step re-plans from it, so
 * the preview and the import can never disagree. Admin only.
 */

/** The errors that mean "this file is not an export I can read", whichever format it claimed. */
const UNREADABLE = [SqlDumpError, MonicaJsonError, VCardError] as const;
const isUnreadable = (err: unknown): err is SqlDumpError | MonicaJsonError | VCardError =>
	UNREADABLE.some((kind) => err instanceof kind);

/** Largest export accepted, uncompressed. A family's Monica is a few MB; this is generous. */
const DUMP_MAX_BYTES = 200 * 1024 * 1024;

const GZIP_MAGIC = [0x1f, 0x8b];

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return {};
};

const VisibilitySchema = v.optional(v.picklist(['shared', 'private']), 'shared');
const StepSchema = v.object({
	token: v.pipe(v.string(), v.minLength(1)),
	visibility: VisibilitySchema
});

/** The export as text, whether it arrived plain or gzipped. */
async function dumpTextOf(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const gzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
	const plain = gzipped ? Bun.gunzipSync(bytes) : bytes;
	if (plain.byteLength > DUMP_MAX_BYTES) throw new SqlDumpError(phrase('import.error.tooLarge'));
	return new TextDecoder().decode(plain);
}

/** The photo list the browser needs to match files in Monica's storage folder. */
function photoManifest(plan: ReturnType<typeof previewImport>) {
	const names = new Map(plan.contacts.map((c) => [c.id, c.displayName]));
	return plan.photos.map((p) => ({
		id: p.id,
		file: p.sourcePath.split('/').pop() ?? p.sourcePath,
		contactName: names.get(p.contactId) ?? '',
		isAvatar: p.isAvatar
	}));
}

export const actions: Actions = {
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
			const plan = previewImport(getImportDeps(), text, {
				householdId: user.householdId,
				userId: user.id,
				visibility,
				wording: importWording(locals)
			});
			await pruneStagedDumps(getConfig().importDir, STAGED_DUMP_MAX_AGE_MS);
			const token = await stageDump(getConfig().importDir, text);
			return {
				step: 'preview' as const,
				token,
				visibility,
				report: plan.report,
				customTypes: plan.relationshipTypes.map((t) => ({ forwardLabel: t.forwardLabel, reverseLabel: t.reverseLabel, category: t.category }))
			};
		} catch (err) {
			if (isUnreadable(err))
				return fail(400, { step: 'upload' as const, error: err.phrase(translator(locals)) });
			throw err;
		}
	},

	confirm: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const form = await request.formData();
		const parsed = v.safeParse(StepSchema, { token: form.get('token'), visibility: form.get('visibility') || undefined });
		if (!parsed.success)
			return fail(400, {
				step: 'upload' as const,
				error: say(locals, 'import.error.sessionMissing')
			});
		const text = await readStagedDump(getConfig().importDir, parsed.output.token);
		if (text === null)
			return fail(410, {
				step: 'upload' as const,
				error: say(locals, 'import.error.sessionGone')
			});

		const { plan, outcome } = await applyImport(getImportDeps(), text, {
			householdId: user.householdId,
			userId: user.id,
			visibility: parsed.output.visibility,
			wording: importWording(locals)
		});
		return {
			step: 'photos' as const,
			token: parsed.output.token,
			report: plan.report,
			inserted: outcome.inserted,
			photos: photoManifest(plan),
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
};
