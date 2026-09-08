/*
 * The home screen (docs/02 §2.22.1): the capture field, the household's stream and the rail.
 *
 * A stream line reads "<Actor> wrote in <Name>'s journal", with the names as links; the
 * sentence is therefore split into the words *around* the links rather than kept whole. The
 * two halves keep German's word order intact ("schrieb in Lenas Tagebuch") without the
 * component having to know anything about either language.
 */

export const home = {
	'home.title': 'Home · Stella',
	'home.heading': 'What happened?',
	'home.intro':
		'Write it down once. Everyone in the household sees it, unless you keep it private.',
	'home.you': 'You',
	'home.atAGlance': 'At a glance',
	'home.comingUp': 'Coming up',
	'home.quietLately': 'Quiet lately',
	'home.writeMoment': 'Write a moment',
	'home.lastWritten': (p: { ago: string }) => `Last written ${p.ago}`,
	'home.nothingWrittenYet': 'Nothing written yet',
	'home.empty.title': 'Nothing written yet',
	'home.empty.hint':
		'Write the first moment above and mention someone with @ — that is all it takes.',
	'home.onlyYouSee': 'Only you can see this',
	'home.private': 'private',
	'home.link.question': (p: { a: string; b: string }) => `Link ${p.a} and ${p.b}?`,
	'home.link.hint': 'They appear together in that moment. Pick how they are related.',
	'home.link.confirm': 'Link',
	'home.link.notNow': 'Not now',
	'home.stream.wroteIn': 'wrote in',
	'home.stream.wroteInJournal': '’s journal',
	'home.stream.added': 'added',
	'home.stream.addedAfter': '',
	'home.stream.newPerson': 'New person',
	'home.stream.logged': 'logged',
	'home.stream.loggedWith': 'with',
	'home.stream.loggedAfter': '',
	'home.stream.linked': 'linked',
	'home.stream.linkedAfter': '',
	'home.stream.relationship': 'Relationship',
	'home.today': 'Today',
	'home.yesterday': 'Yesterday',
	'home.justNow': 'just now',
	'home.minutesAgo': (p: { minutes: number }) => `${p.minutes}m ago`,
	'home.hoursAgo': (p: { hours: number }) => `${p.hours}h ago`,
	'home.daysAgo': (p: { days: number }) => `${p.days}d ago`,
	'home.weeksAgo': (p: { weeks: number }) => `${p.weeks}w ago`,

	'composer.placeholder': 'Met someone? Type it here, mention people with @',
	'composer.label': 'What happened?',
	'composer.people': 'People',
	'composer.justCreated': 'just created',
	'composer.create': (p: { name: string }) => `Create “${p.name}”`,
	'composer.newPerson': 'new person',
	'composer.photo': 'Photo',
	'composer.photoCount': (p: { count: number }) =>
		p.count === 1 ? '1 photo' : `${p.count} photos`,
	'composer.day': 'Day',
	'composer.goesTo': 'Goes to',
	'composer.goesToJournal': '’s journal',
	'composer.alsoMentions': (p: { count: number }) => `, mentions ${p.count}`,
	'composer.needMention': 'Mention at least one person with @',
	'composer.saveFailed': 'Could not save. Try standard JPEG or PNG images.'
};

/** The key set every translation of this area has to provide. */
export type HomeMessages = typeof home;
