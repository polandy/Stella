import { fail, redirect } from '@sveltejs/kit';
import { giftGroupPayload } from '$lib/components/gifts/gift-group-command';
import { todayFor } from '$lib/dates/today';
import { groupLanding } from '$lib/gifts/group-form';
import { contactSectionPath } from '$lib/people/sections';
import { requireViewer } from '$lib/server/auth/guards';
import { systemClock } from '$lib/server/clock';
import { readCommand } from '$lib/server/commands/parse';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readGroupShortcuts } from '$lib/server/domain/gifts/group-shortcuts';
import { peopleToKeepFrom } from '$lib/server/domain/shared/idea-on-person';
import { say, translator } from '$lib/server/i18n/say';
import { ulidGenerator } from '$lib/server/id';
import type { Actions, PageServerLoad } from './$types';

/*
 * One gift idea for several people (docs/dev/02 §2.25.11): who it is for, and what the one *when*
 * comes to for each. `?for=` names the person it was opened from — ticked, and the source of the
 * shortcuts (their parents' children, siblings, homes, circles).
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);
	const anchorId = url.searchParams.get('for');
	const [shortcuts, keptFrom] = await Promise.all([
		anchorId === null
			? []
			: readGroupShortcuts(locals.services.gifts.giftGroupShortcutDeps, viewer, anchorId),
		peopleToKeepFrom(locals.services.gifts.giftDeps.ownPeople, viewer)
	]);
	return { today: todayFor(systemClock), anchorId, shortcuts, keptFrom };
};

export const actions = {
	add: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const payload = giftGroupPayload(form);
		if (payload === null) {
			const titled = String(form.get('title') ?? '').trim().length > 0;
			return fail(400, {
				giftError: say(locals, titled ? 'errors.giftGroup.recipients' : 'errors.gift.needTitle')
			});
		}
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'giftGroup.add',
			payload,
			issuedAt: systemClock.now()
		});
		if (!reading.ok) return fail(400, { giftError: say(locals, 'errors.command.malformed') });
		const actor = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
		const outcome = await dispatchCommand(
			locals.services.offline.commandDeps,
			actor,
			reading.command
		);
		if (outcome.status === 'refused')
			return fail(400, { giftError: outcome.reason(translator(locals)) });
		if (outcome.status !== 'applied')
			return fail(400, { giftError: say(locals, 'errors.gift.couldNotSave') });
		const anchorId = form.get('for');
		const landing = groupLanding(
			payload.recipients,
			typeof anchorId === 'string' ? anchorId : null
		);
		throw redirect(303, contactSectionPath(landing, 'gifts'));
	}
} satisfies Actions;
