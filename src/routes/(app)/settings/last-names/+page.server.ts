import { error } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { segmentsOf, type LinkedPhrase } from '$lib/i18n/linked';
import {
	dismissLastName,
	readSurnameHelp,
	restoreLastName,
	reviewLastNames,
	type SurnameListPerson
} from '$lib/server/domain/contacts/last-names';
import { lastNameActions } from '$lib/server/last-names-actions';
import { say, translator } from '$lib/server/i18n/say';
import { getSurnameDismissalDeps, getSurnameReviewDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * *Settings → Data quality → Last names* (docs/02 §2.2.4.2):
 * everyone the viewer may see without a last name, grouped by what Stella proposes, the
 * largest group first; then those whose sources disagree; then the rest, each with a field.
 * The reasons are said here, in the reader's language, with every name still a way to that
 * person.
 */

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);
	const [review, help] = await Promise.all([
		reviewLastNames(getSurnameReviewDeps(), viewer),
		readSurnameHelp(getSurnameReviewDeps(), viewer, null)
	]);
	const t = translator(locals);
	const said = (reasons: readonly LinkedPhrase[]) => reasons.map((reason) => segmentsOf(reason(t)));
	const person = (id: string) => {
		const p: SurnameListPerson = review.people[id]!;
		return {
			id: p.id,
			displayName: p.displayName,
			avatarPhotoId: p.avatarPhotoId,
			isDeceased: p.isDeceased
		};
	};

	return {
		groups: review.list.groups.map((group) => ({
			name: group.name,
			rows: group.rows.map((row) => ({
				person: person(row.personId),
				preTicked: row.preTicked,
				reasons: said(row.reasons),
				alternatives: row.alternatives
			}))
		})),
		chooseOne: review.list.chooseOne.map((row) => ({
			person: person(row.personId),
			options: row.options.map((option) => ({ name: option.name, reasons: said(option.reasons) }))
		})),
		none: review.list.none.map(person),
		knownSurnames: review.knownSurnames,
		declined: review.declined,
		// Whom a name given here is offered on to (§3.3).
		passOn: help.passOn
	};
};

const AnswerSchema = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	lastName: v.pipe(v.string(), v.trim(), v.minLength(1))
});

export const actions: Actions = {
	...lastNameActions,

	/* *Not this name* (§5): the household's answer, kept so it is not proposed again. */
	dismissLastName: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const parsed = v.safeParse(AnswerSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) throw error(400, say(locals, 'errors.contact.emptyLastName'));
		const saved = await dismissLastName(
			getSurnameDismissalDeps(),
			viewer,
			parsed.output.contactId,
			parsed.output.lastName
		);
		if (!saved) throw error(404, say(locals, 'errors.contact.notFound'));
		return { dismissed: parsed.output.contactId };
	},

	/* Takes a *no* back, so the name is proposed again. */
	restoreLastName: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const parsed = v.safeParse(AnswerSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) throw error(400, say(locals, 'errors.contact.emptyLastName'));
		await restoreLastName(
			getSurnameDismissalDeps(),
			viewer,
			parsed.output.contactId,
			parsed.output.lastName
		);
		return { restored: parsed.output.contactId };
	}
};
