import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import type { CommandType } from '$lib/commands/commands';
import { TodoGoneError } from '$lib/server/domain/todos/todos';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { say, translator } from '$lib/server/i18n/say';

/*
 * A to-do changed from a form (docs/02 §2.26). The person's To do card posts these commands
 * (docs/04 §4.11.2) today; the household's list of every open to-do will post the same ones and
 * answer the same way, which is why this is shared rather than the card's own.
 */

export type TodoCommand = Extract<CommandType, `todo.${string}`>;

/**
 * Where a refusal is shown: the add form's, a row's (which says which to-do), or the card's own
 * line for a tick, which has no form to keep open.
 */
export type TodoErrorKey = 'todoError' | 'todoRowError' | 'todoTickError';

/** Whose to-do it is, and where the member lands once it worked. */
export interface TodoTarget {
	contactId: string;
	back: string;
}

/**
 * Apply one to-do command for the member and answer as the form expects: back to `target.back`
 * when it worked, its reason under `errorKey` when it was refused.
 */
export async function applyTodoCommand(
	locals: RequestEvent['locals'],
	form: FormData,
	type: TodoCommand,
	payload: Record<string, unknown>,
	errorKey: TodoErrorKey,
	target: TodoTarget
) {
	const viewer = requireViewer(locals);
	const todoIdField = form.get('todoId');
	const todoId = typeof todoIdField === 'string' ? todoIdField : null;
	// A row's error is shown on its row, so it says which to-do it is about.
	const failure = (message: string, status = 400) =>
		fail(
			status,
			errorKey === 'todoRowError'
				? { todoRowError: { todoId, message } }
				: errorKey === 'todoTickError'
					? { todoTickError: message }
					: { todoError: message }
		);

	const reading = readCommand({
		id: form.get('commandId') || ulidGenerator.next(),
		type,
		// The target goes last, so a posted field cannot overrule it.
		payload: { ...payload, contactId: target.contactId },
		issuedAt: systemClock.now()
	});
	if (!reading.ok) {
		return failure(
			say(
				locals,
				reading.part === 'payload'
					? reading.field === 'dueOn'
						? 'errors.todo.needDay'
						: 'errors.todo.needTitle'
					: 'errors.command.malformed'
			)
		);
	}
	const actor = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
	const outcome = await dispatchCommand(
		locals.services.offline.commandDeps,
		actor,
		reading.command
	);
	if (outcome.status === 'refused') {
		// A to-do already gone answers 404: a held remove reads that as done (docs/02 §2.23).
		const gone = outcome.error instanceof TodoGoneError;
		return failure(outcome.reason(translator(locals)), gone ? 404 : 400);
	}
	if (outcome.status !== 'applied') return failure(say(locals, 'errors.todo.couldNotSave'));
	throw redirect(303, target.back);
}
