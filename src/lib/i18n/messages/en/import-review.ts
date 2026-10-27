/*
 * The vCard wizard's review step (docs/02 §2.16): who each incoming contact is, answered
 * before anything is written, and the skipped contacts that can be asked about again.
 */

const contacts = (n: number) => (n === 1 ? '1 contact' : `${n} contacts`);

export const importReview = {
	'import.step.review': 'review',
	'import.reviewContacts': 'Review contacts',

	'import.review.title': 'Who is who?',
	'import.review.summary': (p: { total: number; source: string; settled: number }): string =>
		`${contacts(p.total)} in ${p.source}.` +
		(p.settled === 0
			? ''
			: p.settled === 1
				? ' 1 is linked to their person already and unchanged since, so it is not shown.'
				: ` ${p.settled} are linked to their people already and unchanged since, so they are not shown.`),
	'import.review.nothingToAsk': 'Nothing to ask: every contact in this file has its answer.',
	'import.review.count.linked': 'changed since',
	'import.review.count.strong': 'same email or phone',
	'import.review.count.weak': 'same name only',
	'import.review.count.several': 'several people',
	'import.review.count.none': 'no one yet',
	'import.review.confirmSure': (p: { count: number }) =>
		p.count === 1 ? 'Confirm the strong match' : `Confirm all ${p.count} strong matches`,
	'import.review.skipRest': 'Skip the rest',
	'import.review.skippedBefore': (p: { count: number }) =>
		p.count === 1
			? '1 contact was skipped before and stays skipped.'
			: `${p.count} contacts were skipped before and stay skipped.`,
	'import.review.linkPhotos': (p: { count: number }) =>
		p.count === 1
			? '1 photo is only a link in this export and will not be imported.'
			: `${p.count} photos are only links in this export and will not be imported.`,

	'import.review.kind.linked': 'Changed',
	'import.review.kind.strong': 'Strong match',
	'import.review.kind.weak': 'Name only',
	'import.review.kind.several': 'Several people',
	'import.review.kind.none': 'New',
	'import.review.why.email': (p: { value: string }) => `same email ${p.value}`,
	'import.review.why.phone': (p: { value: string }) => `same phone ${p.value}`,
	'import.review.why.phoneAlike': (p: { value: string }) => `nearly the same phone ${p.value}`,
	'import.review.why.name': 'same name, nothing else agrees',
	'import.review.why.several': (p: { count: number }) => `${p.count} people this may be`,
	'import.review.why.none': 'nobody in Stella shares a name, email or phone',
	'import.review.why.linked': 'linked to this person before; the card changed since',

	'import.review.from.google': 'From Google',
	'import.review.from.nextcloud': 'From Nextcloud',
	'import.review.from.other': 'From the file',
	'import.review.inStella': 'In Stella',
	'import.review.pickOne': 'Which one is it?',
	'import.review.wouldAdd': 'Would add',
	'import.review.nothingNew': 'Nothing new to add.',
	'import.review.kept': (p: { list: string }) => `Not taken over: ${p.list}`,
	'import.review.conflict.firstName': 'First name differs',
	'import.review.conflict.lastName': 'Last name differs',
	'import.review.conflict.birthday': 'Birthday differs',
	'import.review.keepStella': 'Keep Stella’s',
	'import.review.takeCard': 'Take the card’s',
	'import.review.nobody': 'Nobody in Stella has this name, email or phone.',
	'import.review.newWill': 'Comes in as a new person with everything on the card.',
	'import.review.born': (p: { date: string }) => `born ${p.date}`,

	'import.review.answer.same': 'Same person',
	'import.review.answer.other': 'Pick someone else',
	'import.review.answer.new': 'New person',
	'import.review.answer.skip': 'Skip',
	'import.review.answered.new': 'New person',
	'import.review.answered.skip': 'Skipped',
	'import.review.change': 'Change',
	'import.review.newList.title': (p: { count: number }) =>
		p.count === 1 ? '1 contact not in Stella' : `${p.count} contacts not in Stella`,
	'import.review.newList.intro':
		'Tick the ones to add as new people. The others are skipped and not asked about again.',
	'import.review.newList.all': 'Select all',
	'import.review.newList.none': 'Select none',
	'import.review.newList.answer': (p: { picked: number; others: number }) =>
		p.picked === 0
			? p.others === 1
				? 'Skip it'
				: `Skip all ${p.others}`
			: p.others === 0
				? `Add ${p.picked === 1 ? 'it' : `all ${p.picked}`} as new`
				: `Add ${p.picked} as new, skip ${p.others}`,
	'import.review.search': 'Find a person',
	'import.review.searchHint': 'Type at least two letters of a name.',
	'import.review.searchNone': 'Nobody by that name.',

	'import.review.fact.email': 'Email',
	'import.review.fact.phone': 'Phone',
	'import.review.fact.address': 'Address',
	'import.review.fact.url': 'Website',
	'import.review.fact.birthday': 'Birthday',
	'import.review.fact.lastName': 'Last name',
	'import.review.fact.company': 'Works at',
	'import.review.fact.jobTitle': 'Job',
	'import.review.fact.nickname': 'Nickname',
	'import.review.fact.tag': 'Tags',
	'import.review.fact.photo': 'Photo',
	'import.review.photo.inline': 'picture on the card',
	'import.review.photo.link': 'link only, not imported',

	'import.review.left': (p: { count: number }) =>
		p.count === 0 ? 'Every contact has an answer.' : `${p.count} without an answer`,
	'import.review.import': (p: { count: number }) =>
		p.count === 1 ? 'Import 1 answer' : `Import ${p.count} answers`,
	'import.review.done': (p: { added: number; completed: number; skipped: number }) =>
		`${p.completed} completed, ${p.added} new, ${p.skipped} skipped. Importing this file again asks only about what is new or changed.`,

	'import.skipped.title': 'Skipped contacts',
	'import.skipped.intro':
		'A contact skipped in a review is not asked about again, even when it changes.',
	'import.skipped.askAgain': 'Ask again',
	'import.skipped.askAgainLabel': (p: { name: string }) => `Ask again about ${p.name}`,
	'import.skipped.gone': 'That contact is no longer skipped.'
};

/** The key set every translation of this area has to provide. */
export type ImportReviewMessages = typeof importReview;
