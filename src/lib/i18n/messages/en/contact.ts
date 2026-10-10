/* One person's page: the profile beside their story (docs/02 §2.2, docs/05 §5.5). */

export const contact = {
	'contact.title': (p: { name: string }) => `${p.name} · Stella`,
	'contact.editName': 'Edit name',
	'contact.editDescription': 'Edit description',
	'contact.descriptionPlaceholder': 'A line about them',
	'contact.addDescription': 'Add a description',
	// The parts the shown name is made of (docs/02 §2.2).
	'contact.nameParts.firstName': 'First name',
	'contact.nameParts.lastName': 'Last name',
	'contact.nameParts.nickname': 'Nickname',
	'contact.nameParts.shownAs': 'Shown as',
	'contact.nameParts.shownAsFollows': 'Follows the name parts while you type.',
	'contact.nameParts.shownAsChosen': 'Stays as typed. Empty it to follow the name parts again.',
	'contact.formerly': (p: { name: string }) => `formerly ${p.name}`,
	'contact.nameParts.formerName': 'Former name',
	'contact.nameParts.keepFormer': (p: { name: string }) => `Keep “${p.name}” as former name`,
	'contact.lastContact': 'Last contact',
	'contact.met': 'Met',
	'contact.privateContact': 'Only you can see this contact',
	'contact.private': 'Private',
	'contact.archived': 'Archived',
	'contact.archivedOn': (p: { day: string }) => `Archived on ${p.day}`,
	'contact.write': 'Write a moment',
	'contact.logContact': 'Log contact',
	'contact.openJournal': 'Open journal',
	'contact.story.title': 'Activity',

	// The cards of the main column, in the order the page stacks them (docs/05 §5.5).
	'contact.section.relationships': 'People',
	'contact.section.notes': 'Notes',
	'contact.section.photos': 'Photos',
	'contact.section.mentions': 'Mentioned in',
	// The identity card at the top of the page (docs/05 §5.5): its facts, its quiet button, its ⋯ menu.
	// The quiet button names what is behind it: "Add address, phone, email …".
	'contact.identity.addThings': (p: { things: string }) => `Add ${p.things}`,
	'contact.identity.missing.address': 'address',
	'contact.identity.missing.birthday': 'birthday',
	'contact.identity.missing.job': 'job',
	'contact.identity.missing.phone': 'phone',
	'contact.identity.missing.email': 'email',
	'contact.identity.missing.tags': 'tags',
	'contact.identity.missing.circles': 'circles',
	'contact.facts.editDates': 'Edit dates',
	'contact.facts.editAddress': 'Edit address',
	'contact.facts.birthday': 'Birthday',
	'contact.facts.born': 'Born',
	'contact.facts.age': (p: { age: number }) => (p.age === 1 ? '1 year' : `${p.age} years`),
	'contact.menu.label': 'More actions',
	'contact.menu.archive': 'Archive',

	'contact.gender': 'Gender',
	'contact.gender.notRecorded': 'Not on record',
	'contact.gender.female': 'Female',
	'contact.gender.male': 'Male',
	'contact.gender.diverse': 'Diverse',
	'contact.gender.hint':
		'With female or male, relatives are named by gender, such as aunt or uncle; otherwise neutrally.',

	// What they do and where (docs/02 §2.2): two free-text fields, one row, one short form.
	'contact.job': 'Job',
	'contact.job.edit': 'Edit job',
	'contact.job.title': 'Job title',
	'contact.job.company': 'Company / organisation',
	'contact.job.titlePlaceholder': 'e.g. Teacher',
	'contact.job.companyPlaceholder': 'e.g. Primarschule Muri',
	'contact.job.keys': 'Enter saves · Esc cancels',
	'contact.job.at': (p: { job: string; company: string }) => `${p.job} at ${p.company}`,

	'contact.section.contact': 'Contact',
	'contact.noFields': 'No phone or email yet.',
	'contact.removeField': (p: { what: string }) => `Remove ${p.what}`,
	'contact.fieldRemoved': 'Contact detail removed',
	'contact.kind': 'Kind',
	'contact.labelOptional': 'Label (optional)',
	'contact.value': 'Value',
	'contact.fieldKind.phone': 'Phone',
	'contact.fieldKind.email': 'Email',
	'contact.fieldKind.address': 'Address',
	'contact.fieldKind.url': 'Website',
	'contact.fieldKind.social': 'Social',
	'contact.fieldKind.date': 'Date',
	'contact.fieldKind.custom': 'Custom',

	// Where they live: a fact of the identity card, edited where it is read (docs/02 §2.2).
	'contact.address.placeholder': 'Street, postcode, town',
	'contact.address.remove': 'Remove address',
	'contact.address.removed': 'Address removed',
	'contact.address.another': 'Add another address',

	'contact.section.dates': 'Dates',
	'contact.dates.add': 'Add a date',
	'contact.dates.another': 'Another date',
	'contact.born': 'born',
	'contact.around': (p: { year: string | number }) => `around ${p.year}`,
	'contact.estimated': 'estimated',
	'contact.birthday': 'birthday',
	'contact.fromProfile': 'from the profile',
	'contact.once': 'once',
	'contact.muted': 'muted',
	'contact.mutedHint': 'Kept, but never surfaced on Home',
	'contact.removeDate': (p: { what: string }) => `Remove ${p.what}`,
	'contact.dateRemoved': 'Date removed',
	'contact.day': 'Day',
	'contact.dateNameForCustom': 'Name (for custom)',
	'contact.everyYear': 'Every year',
	'contact.showOnHome': 'Show on Home',
	'contact.dateKind.birthday': 'Birthday',
	'contact.dateKind.anniversary': 'Anniversary',
	'contact.dateKind.custom': 'Custom',

	'contact.section.circles': 'Circles',
	'contact.join': 'Join',
	'contact.allCircles': 'All circles',
	'contact.circles.join': 'Join a circle',
	'contact.circles.roleIn': (p: { name: string }) => `Role in ${p.name}`,
	'contact.leaveCircle': (p: { name: string }) => `Leave ${p.name}`,
	'contact.leftCircle': 'Left the circle',
	'contact.joinOrCreate': 'Join or create a circle…',
	'contact.roleOptional': 'role (optional)',

	'contact.section.tags': 'Tags',
	'contact.noTags': 'No tags yet.',
	'contact.removeTag': (p: { name: string }) => `Remove tag ${p.name}`,
	'contact.tagRemoved': 'Tag removed',
	'contact.tagName': 'Tag name',
	'contact.colour': 'Colour',

	'contact.section.howWeMet': 'How we met',
	'contact.notRecorded': 'Not recorded yet.',

	'contact.archive.bringBack': 'Bring back into the lists',
	'contact.self.thisIsMe': 'This is me',
	'contact.self.notMe': 'This is not me',
	'contact.self.hint': 'Tell Stella that this record is you, and the map opens on your own people.',
	'contact.self.isMeHint': 'Stella takes this record to be you.',
	'contact.self.badgeHint': 'The person you told Stella you are.',
	'contact.archive.archive': 'Archive this person',
	'contact.archive.archivedHint':
		'They are out of the directory, the search and Home’s reminders — their page, their activity and the family map are untouched.',
	'contact.archive.hint':
		'Takes them out of the directory, the search and Home’s reminders. Nothing is deleted, and the family map keeps them.',

	'contact.merge.open': 'Merge someone into this person',
	'contact.merge.explain': (p: { name: string }) =>
		`The person you choose is folded into ${p.name} — everything of theirs comes across, and their record is gone. It cannot be undone.`,
	'contact.merge.who': 'Who is the same person?',
	'contact.merge.choose': 'Choose someone…',
	'contact.merge.submit': (p: { name: string }) => `Merge into ${p.name}`,

	'contact.delete.open': 'Delete for good',
	'contact.delete.keep': 'Keep them',
	'contact.delete.explain': (p: { name: string }) =>
		`This removes ${p.name} and everything about them — notes, photos, dates, their journal and every link to them. It cannot be undone.`,
	'contact.delete.submit': (p: { name: string }) => `Delete ${p.name}`,

	'contact.interaction.titlePlaceholder': 'What happened? (optional)',
	'contact.interaction.detailsPlaceholder': 'Details… (optional)',
	'contact.interaction.whoElse': 'Who else was there?',
	'contact.interaction.submit': 'Log interaction',

	// Asking the explorer how two people are connected, from a page that holds only two hops.
	'contact.relationships.howConnected': 'How are we connected?',
	'contact.relationships.howConnectedTo': (p: { name: string }) => `${p.name} and…`,
	'contact.relationships.tracePath': 'Trace it',
	'contact.relationships.add': 'Add relationship',
	'contact.relationships.none': (p: { name: string }) => `${p.name} is not linked to anyone yet`,
	// Not *Add relationship*: the card's header already has that button, and this one is the invitation.
	'contact.relationships.addFirst': (p: { name: string }) => `Link ${p.name} to someone`,
	'contact.relationships.noneHint':
		'Add family, a partner, friends or colleagues — the map of who they know draws itself from these.',
	'contact.relationships.remove': (p: { name: string }) => `Remove the link to ${p.name}`,
	'contact.relationships.removed': 'Relationship removed',
	/*
	 * The People card as a compact list (docs/05 §5.5): grouped by the kind of tie, folded to a
	 * handful, its corrections behind one *Edit* for the whole card.
	 */
	'contact.relationships.group.family': 'Family',
	'contact.relationships.group.social': 'Friends',
	'contact.relationships.group.professional': 'Work',
	'contact.relationships.group.other': 'Other',
	'contact.relationships.showMore': (p: { count: number }) => `Show ${p.count} more`,
	'contact.relationships.showFewer': 'Show fewer',
	/** The fold's collapsed line (docs/05 §5.5): the groups it hides whole. */
	'contact.relationships.foldedAway': 'Folded away',
	'contact.relationships.showGroup': (p: { group: string; count: number }) =>
		`Show ${p.group} · ${p.count}`,
	/** The worked-out relatives as a group on that line. */
	'contact.relationships.derivedShort': 'Also related',
	'contact.relationships.editMode': 'Edit',
	'contact.relationships.editModeDone': 'Done',
	'contact.relationships.editLink': (p: { name: string }) => `Edit the link to ${p.name}`,
	'contact.relationships.menu': 'More for these relationships',
	// The person page's jump bar (docs/05 §5.5).
	'contact.jumpBar.label': 'Parts of this page',
	'contact.relationships.since': (p: { day: string }) => `since ${p.day}`,
	'contact.relationships.howConnect': 'How they connect',
	'contact.relationships.howConnectOptional': 'How they connect (optional)',
	'contact.relationships.howConnectPlaceholder': 'met through Peter at the ski course',
	'contact.relationships.sinceLabel': 'Since',
	'contact.relationships.status': 'Status',
	'contact.relationships.is': (p: { name: string }) => `${p.name} is…`,
	'contact.relationships.typeLabel': 'Relationship',
	'contact.relationships.person': 'Person',
	'contact.relationships.addSomeoneFirst': 'Add another person first, then link them here.',
	/*
	 * Several people picked in the relationship form (docs/02 §2.4, *Several people in one
	 * go*): how many the type takes, who is refused.
	 */
	'contact.relationships.parentsRoom': (p: { count: number }): string =>
		p.count >= 2 ? 'Up to two parents.' : 'One more parent: one is on record already.',
	'contact.relationships.parentsOnRecord':
		'Two parents are on record already — that is the limit for Child of.',
	'contact.relationships.parentsFull': 'Two parents — that is the limit for Child of.',
	'contact.relationships.partnerFull': 'One person — a partnership is between two.',
	'contact.relationships.capFullPlaceholder': 'No more for this type',
	'contact.relationships.overCap': (p: { type: string; max: number; extra: number }) =>
		`${p.type} takes ${p.max === 0 ? 'nobody more' : p.max === 1 ? 'one person' : `${p.max} people`}. Remove ${p.extra === 1 ? 'one' : p.extra} to add.`,
	/** Read out on a marked chip; the reason itself stands under the field. */
	'contact.relationships.chipRefused': 'cannot be linked this way',
	/** A refusal the save brought back, already a whole sentence. */
	'contact.relationships.refusedSaid': (p: { name: string; reason: string }) =>
		`${p.name}: ${p.reason}`,
	'contact.relationships.removeToAdd': (p: { count: number }): string =>
		p.count === 1
			? 'Remove the marked person to add the others.'
			: 'Remove the marked people to add the others.',
	'contact.relationships.sinceEach': 'Each from their own birthday',
	'contact.relationships.oneDateForAll': 'Use one date for all',
	'contact.relationships.datePerPerson': 'A date per person',
	'contact.relationships.sinceFor': (p: { name: string }) => `Since, for ${p.name}`,
	'contact.relationships.howConnectForAll': (p: { count: number }) =>
		`How they connect (optional · for all ${p.count})`,
	'contact.relationships.addLinks': (p: { count: number }) => `Add ${p.count} links`,
	'contact.relationships.linksSaved': (p: { count: number }) => `${p.count} links saved`,
	'contact.relationships.undoLinksFailed':
		'Could not take the links back. They are still on the page.',
	/*
	 * The likely second parent, offered under the person field for "Child of" (docs/02 §2.4,
	 * *Several people in one go*; rule L3, §2.4.1): one tap makes them a chip.
	 */
	'contact.relationships.secondParentAlso': 'Also',
	'contact.relationships.secondParentAdd': (p: { name: string }) =>
		`Add ${p.name} as the other parent`,
	'contact.relationships.secondParentWhy': (p: { name: string }) => `${p.name}’s partner`,
	/*
	 * *Add all* on the *Also true?* block: the claims one batch can store, said as the link
	 * they become, and stored in one step with one *Undo*.
	 */
	'contact.relationships.addAllParentsOf': (p: { parents: string; child: string }) =>
		`${p.parents} as parents of ${p.child}`,
	'contact.relationships.addAllChildrenOf': (p: { parent: string; children: string }) =>
		`${p.parent} as a parent of ${p.children}`,
	'contact.relationships.addAll': (p: { count: number }) => `Add all ${p.count}`,
	'contact.relationships.alsoTrue': 'Also true?',
	'contact.relationships.parentProposal': (p: { parent: string; child: string }) =>
		`${p.parent} is a parent of ${p.child}`,
	'contact.relationships.siblingProposal': (p: { one: string; other: string }) =>
		`${p.one} and ${p.other} are siblings`,
	'contact.relationships.addThisToo': 'Add this too',
	/*
	 * The undo window's wording (docs/02 §2.23). The toast says what was done rather than that
	 * something was done — several answers can be in flight at once, and "Saved" four times over
	 * tells a member nothing about which one they are about to take back.
	 */
	'contact.relationships.acceptedParent': (p: { parent: string; child: string }) =>
		`Added ${p.parent} as a parent of ${p.child}`,
	'contact.relationships.acceptedSibling': (p: { one: string; other: string }) =>
		`Added ${p.one} and ${p.other} as siblings`,
	'contact.relationships.acceptedClaim': (p: { claim: string }) => `Entered: ${p.claim}`,
	'contact.relationships.declinedNotice': 'Declined — it will not be offered again',
	'contact.relationships.accept': 'Accept',
	'contact.relationships.decline': 'Decline',
	/*
	 * The on-demand review (docs/02 §2.4.1) — the one place a
	 * member can ask what follows from links entered long ago, rather than being told in the
	 * instant after a write.
	 */
	'contact.relationships.review': 'Check relationships',
	'contact.relationships.reviewAgain': 'Check again',
	'contact.relationships.reviewHeading': 'Suggestions',
	'contact.relationships.reviewOpenCount': (p: { count: number }) => `${p.count} open`,
	'contact.relationships.reviewNothing': (p: { name: string }) =>
		`Nothing open. Stella finds nothing around ${p.name} that is not on record already.`,
	'contact.relationships.confidence.certain': 'certain',
	'contact.relationships.confidence.likely': 'likely',
	'contact.relationships.confidence.possible': 'possible',
	'contact.relationships.declinedCount': (p: { count: number }) =>
		p.count === 1 ? '1 declined suggestion' : `${p.count} declined suggestions`,
	'contact.relationships.declinedOn': (p: { day: string }) => `declined on ${p.day}`,
	'contact.relationships.declinedOnBy': (p: { day: string; who: string }) =>
		`declined on ${p.day} by ${p.who}`,
	'contact.relationships.askAgain': 'Offer again',
	'contact.relationships.derived': 'Also related · worked out, not entered',
	/** Stores a worked-out relative as an entered link (docs/02 §2.4.1). */
	'contact.relationships.confirmKin': 'Confirm',
	'contact.relationships.confirmKinLabel': (p: { name: string; term: string }) =>
		`Enter ${p.name} as ${p.term}`,
	'contact.relationships.reallyChild': 'Actually the child',
	'contact.relationships.reallyParent': 'Actually the parent',
	'contact.relationships.reallySibling': 'Actually a sibling',
	'contact.relationships.via': (p: { people: string }) => `via ${p.people}`,
	'contact.relationships.viaAnd': ' and ',

	'contact.notes.add': 'Add note',
	'contact.notes.none': 'Nothing noted yet.',
	'contact.notes.pinned': 'pinned',
	'contact.notes.label': 'Note',
	'contact.notes.placeholder': 'Write a note… (Markdown, @ to mention someone)',
	'contact.notes.pin': 'Pin',
	'contact.notes.remove': 'Remove note',
	'contact.notes.removed': 'Note removed',

	'contact.photos.add': 'Add photos',
	'contact.photos.none': 'No photos yet.',
	'contact.photos.of': (p: { name: string }) => `Photo of ${p.name}`,
	'contact.photos.privateHint': 'Private — only you can see this',
	'contact.photos.pictures': 'Pictures',
	'contact.photos.adding': 'Adding…',
	'contact.photos.uploadFailed': 'Those photos could not be added.',
	'contact.photos.dialog': 'Photo',
	'contact.photos.noCaption': 'No caption',
	'contact.photos.captionPlaceholder': 'Add a caption',
	'contact.photos.caption': 'Caption',
	'contact.photos.share': 'Share with the household',
	'contact.photos.makePrivate': 'Make private',
	'contact.photos.favourite': 'Favourite',
	'contact.photos.takenOn': (p: { date: string }) => `Taken ${p.date}`,
	'contact.photos.pin': 'Pin as favourite',
	'contact.photos.unpin': 'Unpin favourite',
	// Profile pictures cut from a group photo (docs/02 §2.14).
	'contact.photos.cutFrom': (p: { circle: string }) => `From ${p.circle}`,
	'contact.photos.onGroupPhotos': 'On group photos',
	'contact.photos.groupPhotoOf': (p: { circle: string }) => `Group photo of ${p.circle}`,
	// The card's tabs, its *All* tile, and the one lightbox for both sources (§2.14, §2.24.3).
	'contact.photos.tabsLabel': 'Which photos',
	'contact.photos.tabAll': 'All',
	'contact.photos.tabStella': 'Stella',
	'contact.photos.tabImmich': 'Immich',
	'contact.photos.sourceStella': 'Stella',
	'contact.photos.sourceImmich': 'Immich',
	'contact.photos.allCount': (p: { count: number; shown: string }) =>
		`All ${p.shown} ${p.count === 1 ? 'photo' : 'photos'}`,
	'contact.photos.noneInStella': 'No photos added in Stella yet.',
	'contact.photos.previous': 'Previous photo',
	'contact.photos.next': 'Next photo',
	'contact.photos.position': (p: { at: number; count: number }) => `${p.at} of ${p.count}`,

	'contact.mentions.in': 'in',
	'contact.mentions.notes': 'notes',
	'contact.mentions.journal': 'journal',
	'contact.mentions.by': (p: { author: string }) => `by ${p.author}`
};

/** The key set every translation of this area has to provide. */
export type ContactMessages = typeof contact;
