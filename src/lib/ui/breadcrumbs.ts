import type { Translate } from '$lib/i18n/translate';

/** One step of the top bar's trail; the current page's step carries no link. */
export type Crumb = { label: string; href?: string };

/** The parts of the merged page data the trail names its steps from. */
export type CrumbData = {
	contact?: { displayName?: string };
	circle?: { name?: string };
	/** A circle page's enclosing circles the viewer may see, outermost first. */
	nesting?: { ancestors?: { id: string; name: string }[] };
	/** A tag's page names its tag (docs/02 §2.20.2). */
	tag?: { name?: string };
};

/**
 * The top bar's breadcrumb trail for a route (docs/05 §5.4). A desktop shows all of it; a
 * phone shows only the step before the last as its back link, so a sub-circle's phone back
 * link leads to its direct parent.
 */
export function breadcrumbs(
	routeId: string,
	data: CrumbData,
	params: Record<string, string | undefined>,
	t: Translate
): Crumb[] {
	if (routeId === '/(app)') return [{ label: t('nav.home') }];
	const trail: Crumb[] = [{ label: t('nav.home'), href: '/' }];

	if (routeId.startsWith('/(app)/contacts')) {
		trail.push({ label: t('nav.people'), href: '/contacts' });
		if (routeId === '/(app)/contacts/new') trail.push({ label: t('nav.newPerson') });
		else if (routeId.startsWith('/(app)/contacts/[id]')) {
			const name = data.contact?.displayName ?? t('nav.contact');
			if (routeId.endsWith('/journal')) {
				trail.push({ label: name, href: `/contacts/${params.id}` });
				trail.push({ label: t('nav.journal') });
			} else trail.push({ label: name });
		}
	} else if (routeId.startsWith('/(app)/circles')) {
		trail.push({ label: t('nav.circles'), href: '/circles' });
		if (routeId.startsWith('/(app)/circles/[id]')) {
			for (const ancestor of data.nesting?.ancestors ?? [])
				trail.push({ label: ancestor.name, href: `/circles/${ancestor.id}` });
			const name = data.circle?.name ?? t('nav.circle');
			if (routeId.endsWith('/arrange')) {
				trail.push({ label: name, href: `/circles/${params.id}` });
				trail.push({ label: t('nav.arrangePeople') });
			} else trail.push({ label: name });
		}
	} else if (routeId.startsWith('/(app)/graph')) {
		trail.push({ label: t('nav.graph') });
	} else if (routeId.startsWith('/(app)/tags')) {
		if (routeId === '/(app)/tags/[key]') {
			trail.push({ label: t('nav.tags'), href: '/tags' });
			trail.push({ label: `#${data.tag?.name ?? params.key ?? ''}` });
		} else trail.push({ label: t('nav.tags') });
	} else if (routeId.startsWith('/(app)/search')) {
		trail.push({ label: t('nav.search') });
	} else if (routeId.startsWith('/(app)/settings')) {
		trail.push({ label: t('nav.settings'), href: '/settings' });
		if (routeId.startsWith('/(app)/settings/import')) trail.push({ label: t('nav.importPeople') });
	}
	return trail;
}
