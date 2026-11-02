import type { BriefMessages } from '../en/brief';

/** German for `messages/en/brief.ts`. */
export const brief: BriefMessages = {
	'brief.title': (p) => `Steckbrief: ${p.name}`,
	'brief.print': 'Drucken',
	'brief.printedOn': (p) => `Steckbrief · ${p.day}`,
	'brief.wholePage': 'Ganze Seite öffnen',
	'brief.empty':
		'Noch nichts erfasst, worüber der Steckbrief berichten könnte — auf der Personenseite kommt es dazu.',
	'brief.born': (p) => `geboren am ${p.day}`,
	'brief.bornAround': (p) => `geboren um ${p.year}`,
	'brief.next.line': (p) => `${p.name} ${p.occasion}`,
	'brief.family.title': 'Familie & Zuhause',
	'brief.family.deceased': 'verstorben',
	'brief.family.livesWith': (p) => `mit ${p.names}`,
	'brief.notes.title': 'Angeheftete Notizen',
	'brief.lately.title': 'Zuletzt',
	'brief.gifts.title': 'Geschenkideen',
	'brief.met.title': 'Wie wir uns kennen',
	'brief.open': 'Steckbrief vor einem Besuch'
};
