/* Outings: what the household wants to do with a person, on the person page (docs/dev/02 §2.27). */

export const plans = {
	'plans.title': 'Outings',
	// The card as one line, with no idea yet (docs/dev/05 §5.5), and what it is for.
	'plans.none': 'No idea yet.',
	'plans.help': 'Something you want to do together. What you owe someone is a to-do.',
	'plans.add': 'Idea',
	'plans.form.for': (p: { name: string }) => `Outing with ${p.name}`,
	'plans.form.what': 'What do you want to do?',
	'plans.form.whatPlaceholder': 'e.g. the zoo, a bike ride to the lake',
	'plans.form.note': 'Note',
	'plans.form.notePlaceholder': 'Opening hours, who comes along …',
	'plans.form.link': 'Link',
	'plans.form.more': 'Note or link',
	'plans.tabs.label': 'Outings',
	'plans.tab.ideas': 'Ideas',
	'plans.tab.done': 'Done',
	'plans.ideas.empty': (p: { name: string }) => `No open idea for ${p.name}.`,
	'plans.done.empty': 'Nothing done yet.',
	'plans.notedBy': (p: { name: string }) => `noted by ${p.name}`,
	'plans.notedByYou': 'noted by you',
	// *Booked*: a date is fixed, tickets bought — no longer only an idea.
	'plans.booked': 'booked',
	'plans.bookedBy': (p: { name: string }) => `booked by ${p.name}`,
	'plans.book': 'Booked',
	'plans.bookLabel': (p: { title: string }) => `Booked: ${p.title}`,
	'plans.unbook': 'Not booked',
	'plans.unbookLabel': (p: { title: string }) => `Not booked any more: ${p.title}`,
	'plans.doneOn': (p: { day: string }) => `done ${p.day}`,
	'plans.notDone': 'Not done',
	'plans.reopen': (p: { title: string }) => `Not done yet: ${p.title}`,
	'plans.openLink': (p: { title: string }) => `Open the link of ${p.title}`,
	'plans.link': 'Link',
	// The checkbox's name: what ticking it does.
	'plans.tick': (p: { title: string }) => `Done: ${p.title}`,
	'plans.edit': (p: { title: string }) => `Change: ${p.title}`,
	'plans.remove': (p: { title: string }) => `Remove: ${p.title}`,
	'plans.hiddenFrom': (p: { name: string }) => `hidden from ${p.name}`,
	'plans.everyoneBut': (p: { name: string }) => `Everyone but ${p.name}`,
	// The toasts, with *Undo* beside them.
	'plans.doneToast': (p: { title: string }) => `Done: ${p.title}`,
	'plans.bookedToast': (p: { title: string }) => `Booked: ${p.title}`,
	'plans.removed': 'Idea removed'
};

/** The key set every translation of this area has to provide. */
export type PlansMessages = typeof plans;
