import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireViewer } from '$lib/server/auth/guards';
import { HomeGoneError } from '$lib/server/domain/homes/homes';
import {
	askAgainSameAddress,
	checkSameAddresses,
	declineSameAddress,
	makeOneHome
} from '$lib/server/domain/homes/same-address';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';

/*
 * *Settings → Data quality → Same address* (docs/02 §2.17): people whose own address lines say
 * the same, offered as one home. The check runs only when asked (`?check`), like the
 * relationship check; every answer is the use-case's, which runs the check again on fresh data.
 */

/** The address parameter that opens the check; without it the page reads nothing. */
const CHECK_PARAM = 'check';

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);
	if (!url.searchParams.has(CHECK_PARAM)) return { checked: false as const };
	const check = await checkSameAddresses(locals.services.records.sameAddressDeps, viewer);
	return { checked: true as const, ...check };
};

const Id = v.pipe(v.string(), v.minLength(1));

const AnswerSchema = v.object({
	folded: v.pipe(v.string(), v.minLength(1)),
	contactIds: v.pipe(v.array(Id), v.minLength(1)),
	// Empty for a new home.
	homeId: v.optional(v.string(), '')
});

const KeySchema = v.object({ key: Id });

/** The finding as posted: the line, the people shown and the home offered. */
async function answerOf(request: Request) {
	const form = await request.formData();
	return v.safeParse(AnswerSchema, {
		folded: form.get('folded'),
		contactIds: form.getAll('contactIds'),
		homeId: form.get('homeId') ?? undefined
	});
}

/** A finding gone since the screen was drawn is a 404, in the reader's language. */
async function orGone<T>(locals: App.Locals, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		if (err instanceof HomeGoneError) throw error(404, err.phrase(translator(locals)));
		throw err;
	}
}

export const actions: Actions = {
	/* *Make one home*, or *Join the home* when one already has the line. */
	makeOneHome: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const parsed = await answerOf(request);
		if (!parsed.success) throw error(400, say(locals, 'errors.form.checkAndRetry'));
		const { folded, contactIds, homeId } = parsed.output;
		const made = await orGone(locals, () =>
			makeOneHome(locals.services.records.sameAddressDeps, viewer, {
				folded,
				contactIds,
				homeId: homeId === '' ? null : homeId
			})
		);
		return { homeId: made.homeId };
	},

	/* *Not the same*: the household's answer, kept so the check stops asking. */
	declineSameAddress: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const parsed = await answerOf(request);
		if (!parsed.success) throw error(400, say(locals, 'errors.form.checkAndRetry'));
		const { folded, contactIds } = parsed.output;
		await orGone(locals, () =>
			declineSameAddress(locals.services.records.sameAddressDeps, viewer, { folded, contactIds })
		);
		return { declined: folded };
	},

	/* *Ask again*: takes a *Not the same* back. */
	askAgainSameAddress: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const parsed = v.safeParse(KeySchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) throw error(400, say(locals, 'errors.form.checkAndRetry'));
		const restored = await askAgainSameAddress(
			locals.services.records.sameAddressDeps,
			viewer,
			parsed.output.key
		);
		if (!restored) throw error(404, say(locals, 'errors.home.notFound'));
		return { askedAgain: parsed.output.key };
	}
};
