/* The settings landing page, including the language picker (docs/02 §2.17, §2.19). */

export const settings = {
	'settings.title': 'Settings',
	'settings.intro':
		'Appearance settings are on their way; the language, the data tools, the relationship vocabulary and your account live here already.',
	'settings.language.heading': 'Language',
	'settings.language.label': 'Interface language',
	'settings.language.hint':
		'Stella speaks English and German. Your choice is kept with your profile, so every device you sign in on follows it.',
	'settings.language.saved': 'Language changed.',
	'settings.language.unsupported': 'Stella does not speak that language.',
	'settings.self.heading': 'You',
	'settings.self.label': 'Which of these people is you',
	'settings.self.hint':
		'Point Stella at your own record and it knows who the map opens on, and which row is you.',
	'settings.self.placeholder': 'Search for yourself by name',
	'settings.self.clear': 'None of them is me',
	'settings.self.saved': 'Saved.',
	'settings.self.nobodyYet':
		'Nobody is in Stella yet, so there is no one to pick. Add yourself and you are linked at once.',
	'settings.self.notListed': 'Not in the list yet?',
	'settings.self.addYourself': 'Add yourself',
	'settings.household.heading': 'Household',
	'settings.members.title': 'Members',
	'settings.members.blurb': 'Who signs in to Stella, and how',
	'settings.members.intro': 'Everyone who signs in to Stella, and how.',
	'settings.members.adminOnly': 'Only an admin can remove or restore a member.',
	'settings.members.you': 'You',
	'settings.members.admin': 'Admin',
	'settings.members.signIn.password': 'Password',
	'settings.members.signIn.sso': 'Single sign-on',
	'settings.members.signIn.both': 'Password and single sign-on',
	'settings.members.remove': 'Remove…',
	'settings.members.removeLabel': (p: { name: string }) => `Remove ${p.name}…`,
	'settings.members.confirm.heading': (p: { name: string }) =>
		`Remove ${p.name} from the household?`,
	'settings.members.confirm.signOut': (p: { name: string }) =>
		`${p.name} can no longer sign in. Every device signed in as them is signed out now, and their API tokens stop working.`,
	'settings.members.confirm.shared': (p: { name: string }) =>
		`What ${p.name} shared stays, under their name. You can still remove any of it.`,
	'settings.members.confirm.private': (p: { name: string; count: number }) =>
		p.count === 1
			? `Their one private record stays sealed: nobody sees it, you included. If you restore ${p.name}, it comes back.`
			: `Their ${p.count} private records stay sealed: nobody sees them, you included. If you restore ${p.name}, they come back.`,
	'settings.members.confirm.sso': (p: { name: string }) =>
		`${p.name} signs in through single sign-on. Stella turns them away from now on. To be thorough, also remove them from the group in your sign-in provider.`,
	'settings.members.confirm.lastAdmin': (p: { name: string }) =>
		`${p.name} is the only admin who can sign in with a password. Without them, an outage of your sign-in provider locks everyone out.`,
	'settings.members.confirm.submit': (p: { name: string }) => `Remove ${p.name}`,
	'settings.members.confirm.keep': (p: { name: string }) => `Keep ${p.name}`,
	'settings.members.removed': (p: { name: string }) => `${p.name} removed`,
	'settings.members.former': 'Former members',
	'settings.members.removedOn': (p: { date: string }) => `Removed on ${p.date}`,
	'settings.members.restore': 'Restore…',
	'settings.members.restoreLabel': (p: { name: string }) => `Restore ${p.name}…`,
	'settings.members.restoreConfirm.heading': (p: { name: string }) =>
		`Restore ${p.name} to the household?`,
	'settings.members.restoreConfirm.signIn.password': (p: { name: string }) =>
		`${p.name} can sign in again at once, with their old password.`,
	'settings.members.restoreConfirm.signIn.sso': (p: { name: string }) =>
		`${p.name} can sign in again at once, through single sign-on.`,
	'settings.members.restoreConfirm.signIn.both': (p: { name: string }) =>
		`${p.name} can sign in again at once, with their old password or through single sign-on.`,
	'settings.members.restoreConfirm.signIn.none': (p: { name: string }) =>
		`${p.name} can sign in again at once.`,
	'settings.members.restoreConfirm.fresh':
		'Their devices stay signed out, and their old API tokens stay gone.',
	'settings.members.restoreConfirm.private': (p: { name: string; count: number }) =>
		p.count === 1
			? `Their one private record is theirs to see again.`
			: `Their ${p.count} private records are theirs to see again.`,
	'settings.members.restoreConfirm.sso': (p: { name: string }) =>
		`If you removed ${p.name} from the group in your sign-in provider, add them back there too.`,
	'settings.members.restoreConfirm.submit': (p: { name: string }) => `Restore ${p.name}`,
	'settings.members.restored': (p: { name: string }) => `${p.name} restored`,
	'settings.data.heading': 'Data',
	'settings.data.importPeople': 'Import people',
	'settings.data.importPeopleBlurb':
		'Bring your people, relationships, notes and photos over from a Monica export, or contacts from a vCard.',
	'settings.data.download': 'Download the archive',
	'settings.data.downloadBlurb':
		'Everything the household has, as one readable text file with the photos beside it — yours to keep, and to read with anything.',
	'settings.data.restore': 'Restore from an archive',
	'settings.data.restoreBlurb':
		'Read a Stella archive back in. Anything this household already has is left as it is.',
	'settings.data.relationshipTypes': 'Relationship types',
	'settings.data.relationshipTypesBlurb':
		'Name the kinds of link your household records, beyond the ones Stella ships with.',
	'settings.data.adminOnly':
		'Importing, backups and the relationship types are for the household admin.',
	/*
	 * The household-wide relationship review (docs/02 §2.4.1) — for every member, not only the admin:
	 * the dismissal log belongs to the household and any member may answer or take one back.
	 */
	'settings.quality.heading': 'Data quality',
	'settings.firstNameOnly.pageTitle': 'First name only · Stella',
	'settings.firstNameOnly.title': 'People known by a first name only',
	'settings.firstNameOnly.blurb': 'Everyone with a first name and nothing else to tell them apart.',
	'settings.firstNameOnly.intro':
		'Nothing but a first name — no last name, no description, no place or date you met. Add what you will know each one by. To merge or archive someone, open them.',
	'settings.firstNameOnly.knowThemBy': (p: { name: string }) => `What will you know ${p.name} by?`,
	'settings.firstNameOnly.empty.title': 'Everyone can be told apart',
	'settings.firstNameOnly.empty.hint': 'Nobody left with a first name only and nothing else.',
	// *Same address* (docs/02 §2.17): people at one address made one home, on a tap.
	'settings.sameAddress.pageTitle': 'Same address · Stella',
	'settings.sameAddress.title': 'Same address',
	'settings.sameAddress.blurb': 'People who live at the same address but are not one home yet.',
	'settings.sameAddress.intro':
		'People whose own address lines say the same, ignoring case, spaces and punctuation. One home keeps one address for all of them — a move changes it once.',
	'settings.sameAddress.idle': 'Nothing checked yet',
	'settings.sameAddress.idleHint':
		'The check compares everyone’s address lines. It changes nothing by itself.',
	'settings.sameAddress.check': 'Check addresses',
	'settings.sameAddress.openCount': (p: { count: number }) => `${p.count} open`,
	'settings.sameAddress.homeOf': (p: { names: string }) => `Home of ${p.names}`,
	'settings.sameAddress.joinHint': 'They move in, and their own copy of the line goes.',
	'settings.sameAddress.makeHome': 'Make one home',
	'settings.sameAddress.joinHome': 'Join the home',
	'settings.sameAddress.notSame': 'Not the same',
	'settings.sameAddress.madeHome': (p: { names: string }) => `${p.names} live in one home now`,
	'settings.sameAddress.joined': (p: { names: string }) => `${p.names} moved into the home`,
	'settings.sameAddress.notSameDone': 'Not the same — the check won’t ask again',
	'settings.sameAddress.done': 'All checked',
	'settings.sameAddress.doneHint':
		'Every address that says the same is one home now, or marked as not the same.',
	'settings.sameAddress.declined': (p: { count: number }) => `Not the same (${p.count})`,
	'settings.sameAddress.askAgain': 'Ask again',
	'settings.sameAddress.offline': 'Offline — answers wait for a connection.',
	'settings.relationships.title': 'Check relationships',
	'settings.relationships.intro':
		'Stella works through everyone you can see and lists the family links that follow from what is already entered. Nothing is stored until you accept it.',
	'settings.relationships.blurb':
		'Go through the whole household at once, rather than a profile at a time.',
	'settings.relationships.idle': 'Nothing checked yet',
	'settings.relationships.idleHint':
		'No rule runs until you ask. On a large household this takes a moment.',
	'settings.relationships.check': 'Check all relationships',
	'settings.relationships.checkAgain': 'Check again',
	'settings.relationships.openCount': (p: { count: number }) =>
		p.count === 1 ? '1 suggestion open' : `${p.count} suggestions open`,
	'settings.relationships.nothing':
		'Nothing open. Stella finds nothing across your household that is not on record already.',
	/*
	 * The folds (docs/04 ADR-010). Each one names the number it
	 * is holding back — "22 more for Bettina Meier", not "show more" — because a number the
	 * reader can check is the difference between folding a list and quietly truncating it.
	 */
	'settings.relationships.openAcross': (p: { claims: number; people: number }) =>
		`${p.claims} open across ${p.people === 1 ? '1 person' : `${p.people} people`}`,
	'settings.relationships.peopleRange': (p: { from: number; to: number; total: number }) =>
		`People ${p.from}–${p.to} of ${p.total}`,
	'settings.relationships.answerRange': (p: { from: number; to: number; total: number }) =>
		`Answers ${p.from}–${p.to} of ${p.total}`,
	'settings.relationships.nextPeople': (p: { count: number }) => `Next ${p.count} people`,
	'settings.relationships.previousPeople': (p: { count: number }) => `Previous ${p.count} people`,
	'settings.relationships.nextPage': 'Next',
	'settings.relationships.previousPage': 'Previous',
	'settings.relationships.moreForPerson': (p: { count: number; name: string }) =>
		`${p.count} more for ${p.name}`,
	'settings.relationships.openAll': (p: { count: number }) => `Open all ${p.count}`,
	'settings.relationships.findPerson': 'Find a person',
	'settings.relationships.searchSubmit': 'Search',
	'settings.relationships.clearSearch': 'Clear',
	'settings.relationships.noMatch': (p: { query: string }) =>
		`Nobody called “${p.query}” has anything open.`,
	'settings.relationships.declinedLog': (p: { count: number }) =>
		p.count === 1 ? '1 declined suggestion' : `${p.count} declined suggestions`,
	'settings.relationships.declinedHeading': 'Declined suggestions',
	'settings.relationships.declinedBlurb':
		'What somebody in this household said no to. Offering one again puts it back in the list.',
	'settings.relationships.backToList': 'Back to the list',
	'settings.account.heading': 'Account',
	'settings.about.heading': 'About',
	'settings.about.version': (p: { version: string }) => `Stella ${p.version}`,
	'settings.about.checking': 'Looking for a newer release…',
	'settings.about.badge': 'New',
	'settings.about.available': (p: { version: string }) => `${p.version} is available`,
	'settings.about.releaseNotes': 'Release notes',
	'settings.about.current': 'This is the newest release.',
	'settings.about.unreachable':
		'GitHub could not be reached, so this may not be the newest release.',
	'settings.about.unreachableSince': (p: { when: string }) => `Last checked ${p.when}.`,
	'settings.api.heading': 'API',
	'settings.api.title': 'API tokens',
	'settings.api.blurb': 'Let a script or an assistant add people for you — from a class list, say.',
	'settings.apiTokens.intro':
		'A token lets a script act as you through Stella’s API: it finds and adds exactly what you could, and nothing more. Treat it like a password.',
	'settings.apiTokens.create': 'New token',
	'settings.apiTokens.name': 'What is it for?',
	'settings.apiTokens.namePlaceholder': 'Class list import',
	'settings.apiTokens.lifetime': 'Valid for',
	'settings.apiTokens.days': (p: { count: number }) => `${p.count} days`,
	'settings.apiTokens.submit': 'Create token',
	'settings.apiTokens.createdHeading': 'Copy your token now',
	'settings.apiTokens.createdHint':
		'Stella keeps only a fingerprint of it, so it cannot be shown again. If it is lost, revoke it and create a new one.',
	'settings.apiTokens.usage': 'Send it with every request:',
	'settings.apiTokens.copy': 'Copy',
	'settings.apiTokens.copied': 'Copied',
	'settings.apiTokens.yours': 'Your tokens',
	'settings.apiTokens.none': 'You have no tokens.',
	'settings.apiTokens.validUntil': (p: { date: string }) => `Valid until ${p.date}`,
	'settings.apiTokens.expired': (p: { date: string }) => `Expired on ${p.date}`,
	'settings.apiTokens.lastUsed': (p: { date: string }) => `last used ${p.date}`,
	'settings.apiTokens.neverUsed': 'never used',
	'settings.apiTokens.revoke': 'Revoke',
	'settings.apiTokens.revokeLabel': (p: { name: string }) => `Revoke “${p.name}”`,
	'settings.apiTokens.revoked': 'Token revoked. Scripts using it can no longer sign in.',
	'settings.apiTokens.notFound': 'That token is already gone.',
	'settings.about.off':
		'Stella is not checking for new releases. Set UPDATE_CHECK=true to switch it on.',
	// *Settings → Calendar* (docs/02 §2.13.4): the member's dates as a subscribed calendar.
	'settings.calendar.heading': 'Calendar',
	'settings.calendar.title': 'Calendar',
	'settings.calendar.blurb': 'Birthdays and anniversaries in your phone’s own calendar.',
	'settings.calendar.intro':
		'Birthdays, anniversaries and your other dates in your phone’s own calendar. The calendar does the reminding.',
	'settings.calendar.what': (p: { toggle: string; comingUp: string }): string =>
		`Every date with “${p.toggle}” on, of everyone you can see — the same dates as ${p.comingUp}, all year. Private people only in your own calendar.`,
	'settings.calendar.create': 'Create calendar link',
	'settings.calendar.createdHeading': 'Your calendar link',
	'settings.calendar.createdHint':
		'Copy it now — it is shown only this once. Anyone with the link can read these dates, so keep it to yourself.',
	'settings.calendar.copy': 'Copy',
	'settings.calendar.copied': 'Copied',
	'settings.calendar.addTo': 'Add it to',
	'settings.calendar.app.google': 'Google Calendar',
	'settings.calendar.app.ios': 'iPhone',
	'settings.calendar.app.other': 'Other',
	'settings.calendar.steps.google.1':
		'On a computer, open Google Calendar → Other calendars → + → From URL.',
	'settings.calendar.steps.google.2':
		'Paste the link and add it. It appears on your phone a little later.',
	'settings.calendar.steps.google.3':
		'Set its reminders under the calendar’s settings (e.g. 1 day before).',
	'settings.calendar.steps.ios.1': 'Settings → Calendar → Accounts → Add Account → Other.',
	'settings.calendar.steps.ios.2': 'Add Subscribed Calendar, paste the link, Next, Save.',
	'settings.calendar.steps.ios.3': 'Alerts: Calendar → Default Alert Times → All-Day Events.',
	'settings.calendar.steps.other.1': 'Thunderbird: New Calendar → On the Network → paste the link.',
	'settings.calendar.steps.other.2':
		'Android without Google: DAVx⁵ or ICSx⁵ → subscribe to the link.',
	'settings.calendar.steps.other.3': 'Reminders are set in that app, per calendar.',
	'settings.calendar.done': 'Done',
	'settings.calendar.yours': 'Your link',
	'settings.calendar.link': 'Calendar link',
	'settings.calendar.created': (p: { date: string }): string => `Created ${p.date}`,
	'settings.calendar.lastFetched': (p: { date: string }): string => `last fetched ${p.date}`,
	'settings.calendar.notFetched': 'not fetched yet',
	'settings.calendar.replace': 'Create a new link…',
	'settings.calendar.revoke': 'Revoke…',
	'settings.calendar.lost': 'Lost the link? Create a new one — the old one stops working.',
	'settings.calendar.confirmReplace.heading': 'Replace the link?',
	'settings.calendar.confirmReplace.body':
		'Calendars subscribed to the old link stop updating. You add the new one once on each device.',
	'settings.calendar.confirmReplace.submit': 'Create new link',
	'settings.calendar.confirmRevoke.heading': 'Revoke the calendar link?',
	'settings.calendar.confirmRevoke.body':
		'It stops working at once, everywhere. The calendar on your phone keeps what it last fetched until you remove it there.',
	'settings.calendar.confirmRevoke.submit': 'Revoke',
	'settings.calendar.keep': 'Keep it',
	'settings.calendar.revoked': 'Calendar link revoked.'
};

/** The key set every translation of this area has to provide. */
export type SettingsMessages = typeof settings;
