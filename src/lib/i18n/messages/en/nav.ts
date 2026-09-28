/* The app shell: sidebar, breadcrumbs, top bar and the phone's tab bar (docs/05 §5.5). */

export const nav = {
	'nav.home': 'Home',
	'nav.people': 'People',
	'nav.circles': 'Circles',
	'nav.graph': 'Graph',
	'nav.settings': 'Settings',
	'nav.search': 'Search',
	'nav.journal': 'Journal',
	'nav.newPerson': 'New person',
	'nav.contact': 'Contact',
	'nav.circle': 'Circle',
	'nav.importPeople': 'Import people',
	'nav.stellaHome': 'Stella home',
	'nav.breadcrumb': 'Breadcrumb',
	'nav.addPerson': 'Add person',
	'nav.writeMoment': 'Write a moment',
	'signOut.unsent': (p: { count: number }) =>
		p.count === 1
			? '1 moment has not been sent yet. It is only on this device.'
			: `${p.count} moments have not been sent yet. They are only on this device.`,
	'signOut.keep': 'Keep and sign out',
	'signOut.discard': 'Discard and sign out',
	'nav.signOut': 'Sign out',
	'nav.theme.light': 'Light',
	'nav.theme.system': 'System',
	'nav.theme.dark': 'Dark'
};

/** The key set every translation of this area has to provide. */
export type NavMessages = typeof nav;
