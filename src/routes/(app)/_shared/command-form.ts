import { dispatchCommand } from '#lib/server/domain/commands/dispatch.js';
import { readCommand, type CommandReading } from '#lib/server/commands/parse.js';
import type { JsonCommand } from '#lib/commands/commands.js';
import type { MessageKey, MessageParams } from '#lib/i18n/translate.js';
import { ulidGenerator } from '#lib/server/id.js';
import { systemClock } from '#lib/server/clock.js';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { requireViewer } from '#lib/server/auth/guards.js';
import { say, translator } from '#lib/server/i18n/say.js';

/*
 * A command applied from a form (docs/dev/04 §4.11.2): the one edge the gift, outing and to-do
 * forms share. Each says only what differs — which payload field names which mistake, its own
 * *could not save*, and what *gone* looks like — in a `CommandFormEdge`.
 */

/** A form field's text, or null when it was not posted as text. */
export function textOf(form: FormData, key: string): string | null {
	const value = form.get(key);
	return typeof value === 'string' ? value : null;
}

/** A message that takes no parameters, as a field's mistake is worded. */
export type PlainMessageKey = {
	[K in MessageKey]: MessageParams<K> extends [] ? K : never;
}[MessageKey];

/** What one kind of form says when its command does not go through. */
export interface CommandFormEdge {
	/** The mistake a member made in a field; a field not listed was not theirs to make. */
	fieldErrors: Readonly<Record<string, PlainMessageKey>>;
	couldNotSave: PlainMessageKey;
	/** The refusal that means the thing is already gone, answered 404 (docs/dev/02 §2.23). */
	isGone: (error: unknown) => boolean;
}

/**
 * What a form is told when its command did not read: the member's mistake where the failing field
 * is theirs, otherwise that Stella could not read what was sent.
 */
export function formErrorOf(
	reading: Extract<CommandReading, { ok: false }>,
	fieldErrors: CommandFormEdge['fieldErrors']
): PlainMessageKey {
	if (reading.part === 'payload' && reading.field !== null) {
		const key = Object.hasOwn(fieldErrors, reading.field) ? fieldErrors[reading.field] : undefined;
		if (key) return key;
	}
	return 'errors.command.malformed';
}

/** Whose thing it is, and where the member lands once it worked. */
export interface CommandFormTarget {
	contactId: string;
	back: string;
}

/**
 * Apply one command for the member and answer as the form expects: back to `target.back` when it
 * worked, `failure(message, status)` when it was refused.
 */
export async function applyCommandFromForm<R>(
	locals: RequestEvent['locals'],
	form: FormData,
	type: JsonCommand['type'],
	payload: Record<string, unknown>,
	edge: CommandFormEdge,
	target: CommandFormTarget,
	failure: (message: string, status: number) => R
) {
	const viewer = requireViewer(locals);
	const reading = readCommand({
		id: form.get('commandId') || ulidGenerator.next(),
		type,
		// The target goes last, so a posted field cannot overrule it.
		payload: { ...payload, contactId: target.contactId },
		issuedAt: systemClock.now()
	});
	if (!reading.ok) return failure(say(locals, formErrorOf(reading, edge.fieldErrors)), 400);
	const actor = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
	const outcome = await dispatchCommand(
		locals.services.offline.commandDeps,
		actor,
		reading.command
	);
	if (outcome.status === 'refused') {
		return failure(outcome.reason(translator(locals)), edge.isGone(outcome.error) ? 404 : 400);
	}
	if (outcome.status !== 'applied') return failure(say(locals, edge.couldNotSave), 400);
	throw redirect(303, target.back);
}
