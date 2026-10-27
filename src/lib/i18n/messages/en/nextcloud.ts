/* The household's linked Nextcloud address book: its panel and its conflicts (docs/02 §2.16.3). */

export const nextcloud = {
	'nextcloud.error.notLinked': 'No Nextcloud address book is linked to Stella.',
	'nextcloud.error.unreachable':
		'The Nextcloud address book could not be reached. Nothing changed — try again later.',
	'nextcloud.panel.title': 'Nextcloud address book',
	'nextcloud.panel.intro':
		'Stella and the household’s address book keep each other up to date: names, phones, emails, addresses, birthdays and photos. Private people never leave Stella.',
	'nextcloud.panel.syncedAt': (p: { when: string }) => `Last synced ${p.when}.`,
	'nextcloud.panel.never': 'Not synced yet.',
	'nextcloud.panel.failing': 'The last try could not reach Nextcloud.',
	'nextcloud.panel.syncNow': 'Sync now',
	'nextcloud.panel.synced': (p: { written: number; updated: number; unlinked: number }) =>
		`Synced: ${p.written} written to Nextcloud, ${p.updated} updated in Stella, ${p.unlinked} unlinked.`,
	'nextcloud.panel.newCards': (p: { count: number }) =>
		p.count === 1 ? '1 new card to review' : `${p.count} new cards to review`,
	'nextcloud.panel.review': 'Review',
	'nextcloud.panel.conflicts': (p: { count: number }) =>
		p.count === 1
			? '1 difference waits for an answer'
			: `${p.count} differences wait for an answer`,
	'nextcloud.conflicts.pageTitle': 'Nextcloud differences · Stella',
	'nextcloud.conflicts.title': 'Nextcloud differences',
	'nextcloud.conflicts.blurb': 'Where a linked card and Stella disagree.',
	'nextcloud.conflicts.intro':
		'A sync found a linked card that says something else than Stella. Until you answer, Stella’s side stays and is written back to the card.',
	'nextcloud.conflicts.empty.title': 'Nothing to answer',
	'nextcloud.conflicts.empty.hint': 'Every linked card agrees with Stella.',
	'nextcloud.conflicts.photo': 'Photo differs',
	'nextcloud.conflicts.noPhoto': 'no photo',
	'nextcloud.conflicts.keepStella': 'Keep Stella’s',
	'nextcloud.conflicts.takeCard': 'Take the card’s',
	'nextcloud.conflicts.answered': (p: { name: string }) => `Answered for ${p.name}`,
	'nextcloud.conflicts.gone': 'That difference is no longer waiting.'
};
