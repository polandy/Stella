import type { NavMessages } from '../en/nav';

/** German for `messages/en/nav.ts`. */
export const nav: NavMessages = {
	'nav.home': 'Start',
	'nav.people': 'Menschen',
	'nav.circles': 'Kreise',
	'nav.graph': 'Netz',
	'nav.settings': 'Einstellungen',
	'nav.search': 'Suche',
	'nav.journal': 'Tagebuch',
	'nav.newPerson': 'Neue Person',
	'nav.contact': 'Kontakt',
	'nav.circle': 'Kreis',
	'nav.importPeople': 'Menschen importieren',
	'nav.stellaHome': 'Stella-Startseite',
	'nav.breadcrumb': 'Brotkrumen-Navigation',
	'nav.addPerson': 'Person hinzufügen',
	'nav.writeMoment': 'Moment festhalten',
	'signOut.unsent': (p: { count: number }) =>
		p.count === 1
			? '1 Moment ist noch nicht gesendet. Er ist nur auf diesem Gerät.'
			: `${p.count} Momente sind noch nicht gesendet. Sie sind nur auf diesem Gerät.`,
	'signOut.keep': 'Behalten und abmelden',
	'signOut.discard': 'Verwerfen und abmelden',
	'nav.signOut': 'Abmelden',
	'nav.theme.light': 'Hell',
	'nav.theme.system': 'System',
	'nav.theme.dark': 'Dunkel'
};
