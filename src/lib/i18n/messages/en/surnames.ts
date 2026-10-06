/* Last names for several people at once, and where Stella proposes one (docs/02 §2.2.4). */

export const surnames = {
	// Why a last name is proposed: one sentence per rule (docs/concepts/surnames.md §4).
	'surnames.reason.child': (p: { parent: string }) => `Child of ${p.parent}`,
	'surnames.reason.sibling': (p: { sibling: string }) => `Sibling of ${p.sibling}`,
	'surnames.reason.partner': (p: { partner: string }) => `Partner of ${p.partner}`,
	'surnames.reason.partnerBorn': (p: { partner: string; former: string }) =>
		`Partner of ${p.partner}, born ${p.former}`,
	'surnames.reason.shownName': (p: { name: string }) => `Shown as “${p.name}”`,
	'surnames.reason.parent': (p: { child: string }) => `Parent of ${p.child}`,
	'surnames.reason.circle': (p: { circle: string }) => `In the circle ${p.circle}`,

	// The undo toast of a batch, and its failure (docs/02 §2.23).
	'surnames.toast.set': (p: { name: string; count: number }) =>
		p.count === 1 ? `Last name ${p.name} set` : `Last name ${p.name} set for ${p.count} people`,
	'surnames.toast.failed': 'Could not save the last names. The people are back in the list.',
	'surnames.offline': 'Setting last names needs a connection to Stella.',
	'surnames.namesake': (p: { name: string }) => `There is already a ${p.name}`,
	'surnames.namesakeAsk': 'The same person?',

	// The *Last names* page (docs/02 §2.2.4) and the bars that set one for several people.
	'surnames.page.pageTitle': 'Last names · Stella',
	'surnames.page.title': 'Last names',
	'surnames.page.intro':
		'Everyone without a last name. Where a link, a circle or their own record says what it is, Stella proposes it — nothing is saved until you apply it.',
	'surnames.page.empty.title': 'Everyone has a last name',
	'surnames.page.empty.hint': 'People added without one will show up here.',
	'surnames.blurb': 'People without a last name, with the ones Stella can work out',
	'surnames.applyTo': (p: { count: number }) => `Apply to ${p.count}`,
	'surnames.chooseOne': 'Choose one',
	'surnames.noSuggestion': 'No suggestion',
	'surnames.select': 'Select…',
	'surnames.choose': (p: { name: string }) => `Choose ${p.name}`,
	'surnames.deceased': 'deceased',
	'surnames.rowMenu': (p: { name: string }) => `More for ${p.name}`,
	'surnames.instead': (p: { name: string }) => `or: ${p.name}`,
	'surnames.notThisName': (p: { name: string }) => `Not ${p.name}`,
	'surnames.declined': (p: { count: number }) => `Names you said no to (${p.count})`,
	'surnames.declinedRow': (p: { person: string; name: string }) => `${p.person} — not ${p.name}`,
	'surnames.offerAgain': 'Offer again',
	'surnames.setLastName': 'Set last name',
	'surnames.lastNamePlaceholder': 'Last name…',
	'surnames.next': 'Next',
	'surnames.back': 'Back',
	'surnames.set': 'Set',
	'surnames.confirm': (p: { name: string; count: number }) =>
		p.count === 1 ? `Set ${p.name} for 1 person.` : `Set ${p.name} for ${p.count} people.`,
	'surnames.replace': (p: { person: string; name: string }) =>
		`${p.person} already has the last name ${p.name} — replace it`,
	'surnames.count': (p: { missing: number; suggested: number }) =>
		`${p.missing === 1 ? '1 person has' : `${p.missing} people have`} no last name · ${p.suggested} with a suggestion`,
	'surnames.toast.passOn': (p: { people: string; count: number; name: string }) =>
		`Last name saved. ${p.people} ${p.count === 1 ? 'has' : 'have'} none yet — ${p.name} too?`,
	'surnames.toast.yes': 'Yes',
	// The profile's chip (docs/concepts/surnames.md §3.4).
	'surnames.chip': (p: { name: string }) => `${p.name}?`,
	'surnames.chipHint': (p: { name: string }) => `Give the last name ${p.name}`,
	'surnames.passOnPrompt': (p: { people: string; count: number; name: string }) =>
		`${p.people} ${p.count === 1 ? 'has' : 'have'} no last name yet — ${p.name} too?`,
	'surnames.no': 'No'
};

/** The key set every translation of this area has to provide. */
export type SurnamesMessages = typeof surnames;
