/* The people directory and the "add a person" form (docs/02 §2.2). */

export const contacts = {
	'contacts.title': 'People · Stella',
	'contacts.heading': 'People',
	'contacts.headingArchived': 'Archived people',
	'contacts.count': (p: { count: number }) => (p.count === 1 ? '1 person' : `${p.count} people`),
	'contacts.withThisTag': 'with this tag',
	'contacts.archivedSuffix': ', out of the lists but not lost',
	'contacts.find': 'Find someone',
	'contacts.findPlaceholder': 'Find someone…',
	'contacts.all': 'All',
	'contacts.archivedChip': (p: { count: number }) => `Archived (${p.count})`,
	'contacts.archived': 'Archived',
	'contacts.private': 'private',
	'contacts.lastWrittenAbout': 'Last written about',
	'contacts.lastWrittenAboutOn': (p: { date: string }) => `Last written about ${p.date}`,
	'contacts.nothingWrittenYet': 'Nothing written yet',
	'contacts.noMatch': (p: { query: string }) => `Nobody matches “${p.query}”.`,
	'contacts.emptyArchive.title': 'Nothing archived',
	'contacts.emptyArchive.hint':
		'Archiving takes someone out of the lists without losing them. Nobody is.',
	'contacts.emptyArchive.back': 'Back to everyone',
	'contacts.empty.title': 'No people yet',
	'contacts.empty.hint': 'Add the first person — everything else in Stella hangs off someone.',

	'contacts.new.title': 'Add a person · Stella',
	'contacts.new.heading': 'Add a person',
	'contacts.new.intro': 'A name is enough. Everything else can wait for their page.',
	'contacts.new.firstName': 'First name',
	'contacts.new.lastName': 'Last name',
	'contacts.new.alreadyHere': 'Already in Stella?',
	'contacts.new.reason.sameName': 'Same name — is this them?',
	'contacts.new.reason.sameSurname': 'Same surname',
	'contacts.new.reason.similarSurname': 'Similar surname',
	'contacts.new.linkAsRelative': 'Link as relative',
	'contacts.new.relativeHint':
		'After adding, you land in the relationship editor with them selected.',
	'contacts.new.description': 'Description',
	'contacts.new.descriptionHint': '(one line)',
	'contacts.new.descriptionPlaceholder': "Marco's sister, met at the lake",
	'contacts.new.howWeMet': 'How we met',
	'contacts.new.where': 'Where',
	'contacts.new.wherePlaceholder': 'at the lake',
	'contacts.new.more': 'More — nickname, birthday',
	'contacts.new.nickname': 'Nickname',
	'contacts.new.birthday': 'Birthday',
	'contacts.new.visibility': 'Visibility'
};

/** The key set every translation of this area has to provide. */
export type ContactsMessages = typeof contacts;
