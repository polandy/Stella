import { error } from '@sveltejs/kit';
import { DEFAULT_LOCALE, INTL_LOCALES } from '#lib/i18n/locales.js';
import { createTranslator } from '#lib/i18n/translate.js';
import { authenticateCalendarLink } from '#lib/server/auth/calendar-link.js';
import { calendarFeed } from '#lib/server/domain/dates/calendar-feed.js';
import { etagOf, isUnchanged } from '#lib/server/http/etag.js';
import { say } from '#lib/server/i18n/say.js';
import type { RequestHandler } from './$types';

/*
 * A member's subscribed calendar (docs/dev/02 §2.13.4), fetched by their phone without a session:
 * the secret in the path is the member. An unknown or revoked one is a plain 404, so the
 * address gives nothing away. Tagged with its content, so the calendar's hourly look costs a
 * 304 when nothing changed.
 */

export const GET: RequestHandler = async ({ params, request, url, locals }) => {
	const { auth, records } = locals.services;
	const userId = await authenticateCalendarLink(auth.apiTokenDeps, params.token);
	const member = userId ? await auth.accounts.findById(userId) : null;
	if (!member) error(404, say(locals, 'errors.notFound'));

	// The member's own language, whatever the fetching app's headers ask for.
	const locale = member.locale ?? locals.locale ?? DEFAULT_LOCALE;
	const ics = await calendarFeed(records.calendarFeedDeps, {
		viewer: { id: member.id, householdId: member.householdId },
		translate: createTranslator(locale),
		intlLocale: INTL_LOCALES[locale],
		selfContactId: member.selfContactId,
		origin: url.origin
	});
	const body = new TextEncoder().encode(ics);
	const etag = etagOf(body);
	const headers = {
		'Content-Type': 'text/calendar; charset=utf-8',
		'Cache-Control': 'private, max-age=3600',
		ETag: etag
	};
	if (isUnchanged(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(body, { headers });
};
