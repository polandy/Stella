import type { JsonCommand } from '#lib/commands/commands.js';
import { recordedCommands, type RecordProblem, type RecordRow } from '#lib/gifts/record-given.js';
import { isGiftOccasionPreset } from '#lib/gifts/gifts.js';
import { requireViewer } from '#lib/server/auth/guards.js';
import { systemClock } from '#lib/server/clock.js';
import { readCommand } from '#lib/server/commands/parse.js';
import { dispatchCommand } from '#lib/server/domain/commands/dispatch.js';
import { ulidGenerator } from '#lib/server/id.js';
import { say, translator } from '#lib/server/i18n/say.js';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { formErrorOf, textOf } from './command-form';

/*
 * *Nachtragen…* posted (docs/dev/02 §2.25.14), from a person's Gifts card or from `/gifts`: every
 * gift its own command, applied in order, so each goes the way one alone would — the access
 * layer judges each, and one already applied stays applied when a later one is refused.
 */

const PROBLEM = {
	nothing: 'errors.gift.record.nothing',
	needRecipient: 'errors.gift.record.needRecipient',
	needGiver: 'errors.gift.record.needGiver'
} as const satisfies Record<RecordProblem, string>;

/** The sheet's rows as posted: `title-i`, `for-i` and `from-i` for each of `rows`. */
function rowsOf(form: FormData): RecordRow[] {
	const count = Math.min(Number(textOf(form, 'rows') ?? 0) || 0, 50);
	return Array.from({ length: count }, (_, i) => ({
		title: textOf(form, `title-${i}`) ?? '',
		forId: textOf(form, `for-${i}`) ?? '',
		from: textOf(form, `from-${i}`) ?? ''
	}));
}

/** The ticked planned gifts, each posted as `contactId/giftId`. */
function plannedOf(form: FormData): { contactId: string; giftId: string }[] {
	return form.getAll('planned').flatMap((value) => {
		const [contactId, giftId] = typeof value === 'string' ? value.split('/') : [];
		return contactId && giftId ? [{ contactId, giftId }] : [];
	});
}

/** Apply the sheet for the member: back to `back` when every gift went in, else why one did not. */
export async function recordGivenFromForm(
	locals: RequestEvent['locals'],
	form: FormData,
	back: string
) {
	const viewer = requireViewer(locals);
	const occasion = textOf(form, 'occasion') ?? '';
	const built = recordedCommands({
		givenOn: textOf(form, 'givenOn') ?? '',
		occasion: isGiftOccasionPreset(occasion) ? occasion : null,
		planned: plannedOf(form),
		rows: rowsOf(form)
	});
	if (!built.ok) return fail(400, { giftRecordError: say(locals, PROBLEM[built.reason]) });

	const read: JsonCommand[] = [];
	for (const { type, payload } of built.commands) {
		const reading = readCommand({
			id: ulidGenerator.next(),
			type,
			payload,
			issuedAt: systemClock.now()
		});
		if (!reading.ok) {
			const fields = { title: 'errors.gift.needTitle', givenOn: 'errors.gift.needDay' } as const;
			return fail(400, { giftRecordError: say(locals, formErrorOf(reading, fields)) });
		}
		read.push(reading.command);
	}

	const actor = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
	for (const [saved, command] of read.entries()) {
		const outcome = await dispatchCommand(locals.services.offline.commandDeps, actor, command);
		if (outcome.status === 'applied') continue;
		const reason =
			outcome.status === 'refused'
				? outcome.reason(translator(locals))
				: say(locals, 'errors.gift.couldNotSave');
		return fail(400, {
			giftRecordError: say(locals, 'errors.gift.record.stopped', { saved, reason }),
			recorded: saved
		});
	}
	throw redirect(303, back);
}
