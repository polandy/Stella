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
	'nav.signOut': 'Sign out',
	'nav.theme.light': 'Light',
	'nav.theme.system': 'System',
	'nav.theme.dark': 'Dark'
};

/** The key set every translation of this area has to provide. */
export type NavMessages = typeof nav;
