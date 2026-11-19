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
	'plans.removed': 'Idea removed',
	// Afterwards (§2.27.8): a moment told of a done idea, and the idea noted once more.
	'plans.writeMoment': 'Write a moment',
	'plans.writeMomentLabel': (p: { title: string }) => `Write a moment about ${p.title}`,
	'plans.momentOffline': 'You can write the moment once Stella is in reach.',
	'plans.moment': 'The moment',
	'plans.momentLabel': (p: { title: string }) => `Open the moment about ${p.title}`,
	'plans.again': 'Note again',
	'plans.againLabel': (p: { title: string }) => `Note again: ${p.title}`,
	'plans.againToast': (p: { title: string }) => `Noted again: ${p.title}`,
	// The story's line for an outing done.
	'plans.story.done': 'Outing',
	'plans.story.moment': 'The moment',
	// The household's list of open ideas, `/plans` (docs/dev/02 §2.27.9).
	'plans.menu': 'More for outings',
	'plans.allIdeas': 'All outings',
	'plans.list.title': 'Outings',
	'plans.list.intro': 'Everything the household wants to do with someone, the soonest first.',
	'plans.list.open': (p: { count: number }) => `${p.count} open`,
	'plans.list.thisMonth': 'This month',
	'plans.list.later': 'Soon',
	'plans.list.someTime': 'Some time',
	// The label stays put; `aria-pressed` says whether they are shown.
	'plans.list.laterToggle': (p: { count: number }) => `Ideas beyond three months (${p.count})`,
	'plans.list.allLater': 'Nothing in the next three months. Every idea is further out.',
	'plans.list.empty': 'No open outing idea.',
	'plans.list.emptyHint': 'Note one on a person’s Outings card, and it shows up here.'
};

/** The key set every translation of this area has to provide. */
export type PlansMessages = typeof plans;
