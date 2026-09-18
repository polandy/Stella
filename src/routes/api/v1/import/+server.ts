import { json } from '@sveltejs/kit';
import { badRequest, unauthorized } from '$lib/server/api/responses';
import { importViaApi } from '$lib/server/domain/import/api/api-import';
import { apiImportWording } from '$lib/server/i18n/import-wording';
import { readApiImportDocument } from '$lib/server/import/api-document';
import { getApiImportDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * `POST /api/v1/import` (docs/02 §2.16.1): people, their contact details, the links between
 * them and the circles they belong to, in one JSON document, as the member whose token signs
 * the request. `?dryRun=true` answers with exactly what would be written and writes nothing.
 *
 * 400 — the body is not a well-formed document; 422 — it is, but cannot be applied to this
 * household (an unknown ref, a link the guardrails refuse …). Both list every problem, and in
 * both cases nothing was written.
 */

/** The only spellings of the switch. Anything else is refused: a typo must not mean "write". */
const DRY_RUN_VALUES: Readonly<Record<string, boolean>> = { true: true, false: false };

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const user = locals.user;
	if (!user) return unauthorized();

	const dryRunParam = url.searchParams.get('dryRun');
	const dryRun = dryRunParam === null ? false : DRY_RUN_VALUES[dryRunParam];
	if (dryRun === undefined) return badRequest('invalidDryRun');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		// Not JSON is the caller's mistake, not ours; it is answered, not logged.
		return badRequest('invalidJson');
	}
	const reading = readApiImportDocument(body);
	if (!reading.ok) return json({ problems: reading.problems }, { status: 400 });

	const result = await importViaApi(
		getApiImportDeps(),
		// TODO: use the member's default visibility once it is a setting (docs/02 §2.16).
		{ userId: user.id, householdId: user.householdId, defaultVisibility: 'shared' },
		reading.document,
		{ dryRun, wording: apiImportWording(locals) }
	);
	if (!result.ok) return json({ problems: result.problems }, { status: 422 });
	return json({ dryRun: result.dryRun, added: result.added, ...result.report });
};
