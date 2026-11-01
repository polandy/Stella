import { redirect } from '@sveltejs/kit';
import { todayFor } from '$lib/dates/today';
import { requireViewer } from '$lib/server/auth/guards';
import { systemClock } from '$lib/server/clock';
import { sheetAddressFor } from '$lib/share/address';
import type { Actions, PageServerLoad } from './$types';

/*
 * The share sheet (docs/02 §2.18.3): what another app shared, saved about one person. The
 * service worker takes the share and keeps it on the device, so the page itself needs only who
 * was written about last, for whom it offers first; the people come with the shell.
 */

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);
	return {
		lastTouched: await locals.services.household.attention.listLastTouchedVisibleTo(viewer),
		// The moment's day: a kept sheet may open days later, so the device's day wins if later.
		today: todayFor(systemClock)
	};
};

export const actions: Actions = {
	// The share posted here when no worker took it: the words go back in the sheet's address.
	default: async ({ locals, request }) => {
		requireViewer(locals);
		const form = await request.formData();
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === 'string' ? value : '';
		};
		const photoCount = form.getAll('files').filter((f) => f instanceof File && f.size > 0).length;
		throw redirect(
			303,
			sheetAddressFor({ title: field('title'), text: field('text'), url: field('url'), photoCount })
		);
	}
};
