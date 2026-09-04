import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth/guards';
import { getConfig } from '$lib/server/config';
import { importMonicaDump, previewMonicaDump } from '$lib/server/domain/import/monica/apply';
import { SqlDumpError } from '$lib/server/domain/import/monica/sql-dump';
import { discardStagedDump, readStagedDump, stageDump } from '$lib/server/import/staging';
import { getImportDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * The Monica import wizard (docs/02 §2.16): upload → preview → confirm → photos. The dump is
 * staged on disk between steps; every step re-plans from it, so the preview and the import
 * can never disagree. Admin only.
 */

/** Largest dump accepted, uncompressed. A family's Monica is a few MB; this is generous. */
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

/** The dump as text, whether it arrived plain or gzipped. */
async function dumpTextOf(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const gzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
	const plain = gzipped ? Bun.gunzipSync(bytes) : bytes;
	if (plain.byteLength > DUMP_MAX_BYTES) throw new SqlDumpError('The dump is larger than this importer accepts.');
	return new TextDecoder().decode(plain);
}

/** The photo list the browser needs to match files in Monica's storage folder. */
function photoManifest(plan: ReturnType<typeof previewMonicaDump>) {
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
			return fail(400, { step: 'upload' as const, error: 'Please choose the .sql or .sql.gz dump file.' });
		}
		try {
			const text = await dumpTextOf(file);
			const plan = previewMonicaDump(getImportDeps(), text, {
				householdId: user.householdId,
				userId: user.id,
				visibility
			});
			const token = await stageDump(getConfig().importDir, text);
			return {
				step: 'preview' as const,
				token,
				visibility,
				report: plan.report,
				customTypes: plan.relationshipTypes.map((t) => ({ forwardLabel: t.forwardLabel, reverseLabel: t.reverseLabel, category: t.category }))
			};
		} catch (err) {
			if (err instanceof SqlDumpError) return fail(400, { step: 'upload' as const, error: err.message });
			throw err;
		}
	},

	confirm: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const form = await request.formData();
		const parsed = v.safeParse(StepSchema, { token: form.get('token'), visibility: form.get('visibility') || undefined });
		if (!parsed.success) return fail(400, { step: 'upload' as const, error: 'The import session is missing. Please upload the dump again.' });
		const text = await readStagedDump(getConfig().importDir, parsed.output.token);
		if (text === null) return fail(410, { step: 'upload' as const, error: 'The uploaded dump is no longer available. Please upload it again.' });

		const { plan, outcome } = await importMonicaDump(getImportDeps(), text, {
			householdId: user.householdId,
			userId: user.id,
			visibility: parsed.output.visibility
		});
		return {
			step: 'photos' as const,
			token: parsed.output.token,
			report: plan.report,
			inserted: outcome.inserted,
			photos: photoManifest(plan)
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
