import { json } from '@sveltejs/kit';
import { MAX_COMMAND_BATCH } from '$lib/commands/commands';
import { receiveQueued } from '$lib/server/commands/receive';
import { translator } from '$lib/server/i18n/say';
import { getCommandDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * `POST /api/commands` (docs/04 §4.11.2, ADR-108): where a phone's outbox sends what
 * it held back while Stella was out of reach. `{ commands: [...] }` in, one answer per command
 * out, in the same order. Signed in by the session cookie like any page — this is the app
 * talking to itself, not the scripting API under `/api/v1/`. Only `application/json` is read:
 * that cannot be posted cross-site without a CORS preflight, which Stella never grants, while a
 * `text/plain` form that merely looks like JSON could be.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) return json({ error: { code: 'unauthorized' } }, { status: 401 });

	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
		return json({ error: { code: 'unsupportedMediaType' } }, { status: 415 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: { code: 'invalidJson' } }, { status: 400 });
	}
	const commands = (body as { commands?: unknown } | null)?.commands;
	if (!Array.isArray(commands) || commands.length > MAX_COMMAND_BATCH) {
		return json({ error: { code: 'invalidBatch' } }, { status: 400 });
	}

	const actor = { userId: user.id, householdId: user.householdId, locale: locals.locale };
	return json({
		answers: await receiveQueued(getCommandDeps(), actor, translator(locals), commands)
	});
};
