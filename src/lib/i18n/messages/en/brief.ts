/*
 * A person's brief (docs/02 §2.2.5): what to know before a visit, on one page that also prints.
 */

export const brief = {
	'brief.title': (p: { name: string }) => `Brief: ${p.name}`,
	'brief.print': 'Print',
	'brief.printedOn': (p: { day: string }) => `Brief · ${p.day}`,
	'brief.wholePage': 'Open the whole page',
	'brief.empty': 'Nothing on record to brief you on yet — their page is where it gets added.',
	'brief.born': (p: { day: string }) => `born ${p.day}`,
	'brief.bornAround': (p: { year: string }) => `born around ${p.year}`,
	'brief.next.line': (p: { name: string; occasion: string }) => `${p.name} ${p.occasion}`,
	'brief.family.title': 'Family & home',
	'brief.family.deceased': 'died',
	'brief.family.livesWith': (p: { names: string }) => `with ${p.names}`,
	'brief.notes.title': 'Pinned notes',
	'brief.lately.title': 'Lately',
	'brief.gifts.title': 'Gift ideas',
	'brief.met.title': 'How we met',
	/* The record menu's entry (docs/02 §2.15); the palette's words are in `components`. */
	'brief.open': 'Brief before a visit'
};

export type BriefMessages = typeof brief;
