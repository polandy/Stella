/* Gifts: ideas, gifts given and gifts received, on the person page (docs/dev/02 §2.25). */

export const gifts = {
	'gifts.title': 'Gifts',
	// The card as one line, with nothing noted yet (docs/dev/05 §5.5).
	'gifts.none': 'No gift ideas yet.',
	'gifts.addIdea': 'Idea',
	'gifts.addGiven': 'Given',
	'gifts.addReceived': 'Received',
	'gifts.menu': 'More for gifts',
	// The title of a gift made from a touchpoint that said nothing (docs/dev/02 §2.25.4).
	'gifts.untitled': 'Gift',

	'gifts.tabs.label': 'Gifts by kind',
	'gifts.tab.ideas': 'Ideas',
	'gifts.tab.given': 'Given',
	'gifts.tab.received': 'Received',
	'gifts.ideas.empty': (p: { name: string }) =>
		`Got an idea for ${p.name}? Note it here, and it is here when the day comes.`,
	'gifts.given.empty': 'Nothing given yet.',

	'gifts.form.ideaFor': (p: { name: string }) => `Idea for ${p.name}`,
	'gifts.form.givenTo': (p: { name: string }) => `Given to ${p.name}`,
	'gifts.form.receivedFrom': (p: { name: string }) => `Received from ${p.name}`,
	'gifts.form.what': 'What?',
	'gifts.form.whatPlaceholder': 'e.g. a cast-iron teapot',
	'gifts.form.more': 'Note or link',
	'gifts.form.note': 'Note',
	'gifts.form.notePlaceholder': 'Size, colour, where they saw it',
	'gifts.form.link': 'Link',
	'gifts.form.on': 'On',
	'gifts.form.occasion': 'Occasion',
	'gifts.form.otherOccasion': 'Which occasion?',
	// Under the title while one typed looks like a gift already given (a hint, not a block).
	'gifts.form.alreadyGiven': (p: { title: string; day: string; occasion: string | null }) =>
		`Already given: “${p.title}” on ${p.day}${p.occasion ? ` (${p.occasion})` : ''}.`,

	'gifts.occasion.birthday': 'Birthday',
	'gifts.occasion.christmas': 'Christmas',
	'gifts.occasion.anniversary': 'Anniversary',
	'gifts.occasion.other': 'Other…',

	'gifts.markGiven': 'Mark as given',
	// The row button opens the form; the form's submit says the whole thing.
	'gifts.markGiven.open': 'Mark as given…',
	'gifts.markGiven.title': (p: { title: string }) => `“${p.title}” given`,
	// Bought, waiting to be handed over (§2.25.9), and kept from the person it is for (§2.25.10).
	'gifts.bought': 'Bought',
	'gifts.bought.title': (p: { title: string }) => `“${p.title}” bought`,
	'gifts.notBought': 'Not bought yet',
	'gifts.notBought.title': (p: { title: string }) => `“${p.title}” back to the ideas`,
	'gifts.ready': 'Ready to give',
	'gifts.ideas.allBought': (p: { name: string }) => `Everything for ${p.name} is bought.`,
	'gifts.surprise.choice': (p: { name: string }) => `Everyone but ${p.name}`,
	'gifts.surprise.inline': (p: { name: string }) => `hidden from ${p.name}`,
	// When an idea was noted, under its title.
	'gifts.addedOn': (p: { day: string }) => `Added ${p.day}`,
	'gifts.notedBy': (p: { name: string }) => `noted by ${p.name}`,
	'gifts.notedByYou': 'noted by you',
	'gifts.link': 'Link',
	'gifts.openLink': (p: { title: string }) => `Open the link for “${p.title}”`,
	'gifts.edit': (p: { title: string }) => `Edit “${p.title}”`,
	'gifts.remove': (p: { title: string }) => `Remove “${p.title}”`,
	'gifts.removed': 'Gift removed',

	// The household's list of every open idea (docs/dev/02 §2.25.6).
	'gifts.allIdeas': 'All gift ideas',
	'gifts.list.title': 'Gift ideas',
	'gifts.list.intro':
		'Every open idea in the household. Whoever’s birthday or Christmas comes next is on top.',
	'gifts.list.open': (p: { count: number }) => `${p.count} open`,
	'gifts.list.ideas': (p: { count: number }) => (p.count === 1 ? '1 idea' : `${p.count} ideas`),
	// Under the person's name: *Birthday in 12 days · 11 Nov*.
	'gifts.list.next': (p: { occasion: string; when: string; day: string }) =>
		`${p.occasion} ${p.when} · ${p.day}`,
	// Ideas waiting for an age or a day are folded away until asked for (§2.25.8).
	// The label stays put; `aria-pressed` says whether they are shown.
	'gifts.list.waitingToggle': (p: { count: number }) =>
		p.count === 1 ? '1 idea for later' : `${p.count} ideas for later`,
	'gifts.list.allWaiting': 'Nothing due yet. Every idea waits for later.',
	'gifts.list.empty': 'No open gift ideas.',
	'gifts.list.emptyHint': 'Note one on a person’s Gifts card, and it shows up here.',

	// Where a gift stands, as a search hit says it (docs/dev/02 §2.9).
	'gifts.state.idea': 'Idea',
	'gifts.state.bought': 'Bought',
	'gifts.state.given': (p: { day: string }) => `Given on ${p.day}`,
	'gifts.state.received': (p: { day: string }) => `Received on ${p.day}`,

	// One idea for several people (docs/dev/02 §2.25.11).
	'gifts.several.title': 'Gift idea for several',
	'gifts.several.menu': 'For several…',
	'gifts.several.who': 'For whom?',
	'gifts.several.search': 'Search a name…',
	'gifts.several.childrenOf': (p: { name: string }) => `Children of ${p.name}`,
	'gifts.several.siblingsOf': (p: { name: string }) => `Siblings of ${p.name}`,
	'gifts.several.preview': 'What it comes to for each',
	'gifts.several.include': (p: { name: string }) => `For ${p.name}`,
	'gifts.several.ageToday': 'Age today, about',
	'gifts.several.or': 'or',
	'gifts.several.enterBirthday': 'Enter birthday',
	'gifts.several.insteadLabel': 'instead:',
	'gifts.several.instead.birthday': (p: { day: string }) => `next birthday, ${p.day}`,
	'gifts.several.instead.christmas': (p: { year: string }) => `Christmas ${p.year}`,
	'gifts.several.instead.now': 'now',
	'gifts.several.own': 'own time',
	'gifts.several.reset': 'reset',
	'gifts.several.estimated': (p: { year: string; name: string }) =>
		`estimated: about ${p.year} — noted on ${p.name} when saved`,
	'gifts.several.for': (p: { chosen: number }) => `For ${p.chosen}`,
	'gifts.several.forOf': (p: { chosen: number; total: number }) => `For ${p.chosen} of ${p.total}`,
	'gifts.several.missing.needsBirthYear': (p: { names: string }) => `no birth year for ${p.names}`,
	'gifts.several.missing.tooOld': (p: { names: string }) => `too old: ${p.names}`,
	'gifts.several.missing.other': (p: { names: string }) => `does not fit: ${p.names}`,
	'gifts.several.noted': (p: { count: number }) => `Noted for ${p.count}`,
	'gifts.several.notedBut': (p: { count: number; names: string }) =>
		`Noted for ${p.count} · not ${p.names}`,

	// Who has it, of one idea several people get (docs/dev/02 §2.25.11).
	'gifts.group.alsoFor': (p: { names: string }) => `also for ${p.names}`,
	'gifts.group.edit': 'Change',
	'gifts.group.menu': 'More for this idea',
	'gifts.group.now': 'now',
	'gifts.group.dissolve': 'Go on one by one',
	'gifts.group.dissolveHint': 'the gifts stay, only “also for” goes',
	'gifts.group.removeOpen': (p: { count: number }) => `Remove all open (${p.count})`,
	'gifts.group.removeOpenHint': 'given ones stay, with undo',
	'gifts.group.removedOpen': (p: { count: number }) => `Removed for ${p.count}`,
	'gifts.group.given': (p: { day: string }) => `given ${p.day}`,
	'gifts.group.bought': 'bought',
	'gifts.group.openNow': 'open now',
	'gifts.group.ownWhen': 'own time',
	'gifts.group.ownTitle': 'own title',
	'gifts.group.rowMenu': (p: { name: string }) => `More for ${p.name}`,
	'gifts.group.openCard': (p: { name: string }) => `Open ${p.name}’s card`,
	'gifts.group.detach': 'Detach from the others',
	'gifts.group.detachHint': (p: { name: string }) => `stays an idea of its own for ${p.name}`,
	'gifts.group.removeFor': (p: { name: string }) => `Remove for ${p.name}`,
	'gifts.group.allHave': 'Everyone has it — only the story is left here.',
	'gifts.group.addPerson': 'Person',
	'gifts.group.boughtAll': (p: { count: number }) =>
		p.count ? `Bought for everyone (${p.count})` : 'Bought for everyone',
	'gifts.group.boughtFor': (p: { count: number }) => `Bought for ${p.count}`,
	'gifts.group.addIntro': (p: { rule: string }) =>
		`Who else should get it? Stella applies “${p.rule}”; title, note and link come along.`,
	'gifts.group.add': (p: { count: number }) => (p.count ? `Add (${p.count})` : 'Add'),
	'gifts.group.scope': 'Who does the change apply to?',
	'gifts.group.scopeAll': (p: { count: number }) => `For all open (${p.count})`,
	'gifts.group.scopeAllHint': (p: { names: string }) =>
		`${p.names} — what was given stays as it was given`,
	'gifts.group.scopeOne': (p: { name: string }) => `Only for ${p.name}`,
	'gifts.group.scopeOneHint': 'the others keep title and time',
	'gifts.group.keeps': 'keeps its time',
	'gifts.group.changedAll': (p: { count: number }) => `Changed for ${p.count} open`,
	'gifts.group.changedOne': (p: { name: string }) => `Changed only for ${p.name}`,

	// In the story (docs/dev/02 §2.23): what happened on the day.
	'gifts.story.given': 'Given',
	'gifts.story.received': 'Received'
};

/** The key set every translation of this area has to provide. */
export type GiftsMessages = typeof gifts;
