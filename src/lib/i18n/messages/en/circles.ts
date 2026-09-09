/* Circles: the shared contexts people belong to (docs/02 §2.4.2). */

export const circles = {
	'circles.title': 'Circles · Stella',
	'circles.heading': 'Circles',
	'circles.intro': 'The contexts people share — a class, a club, a team, a choir.',
	'circles.new': 'New circle',
	'circles.create': 'Create circle',
	'circles.name': 'Name',
	'circles.namePlaceholder': 'e.g. Kegelclub Bühl',
	'circles.kindLabel': 'Kind',
	'circles.descriptionLabel': 'Description (optional)',
	'circles.colour': 'Colour',
	'circles.find': 'Find a circle',
	'circles.findPlaceholder': 'Find a circle…',
	'circles.empty.title': 'No circles yet',
	'circles.empty.hint': 'A circle is a context people share. Add the first one and put people in it.',
	'circles.noMatch.title': 'No circle matches',
	'circles.noMatch.hint': 'Try part of a name, or a word from a description.',
	'circles.memberCount': (p: { count: number }) => (p.count === 1 ? '1 member' : `${p.count} members`),
	'circles.nobodyYet': 'Nobody in it yet',
	'circles.private': 'private',
	'circles.detail.title': (p: { name: string }) => `${p.name} · Circles · Stella`,
	'circles.members': 'Members',
	'circles.addMember': 'Add member',
	'circles.person': 'Person',
	'circles.roleLabel': 'Role (optional)',
	'circles.rolePlaceholder': 'member',
	'circles.removeMember': (p: { name: string }) => `Remove ${p.name} from circle`,
	'circles.removedFromCircle': 'Removed from the circle',
	'circles.noMembers.title': 'Nobody in this circle yet',
	'circles.noMembers.hint':
		'Add the people who share this context; each of them will show it on their page.',
	'circles.kind.all': 'All',
	'circles.kind.friends': 'Friends',
	'circles.kind.family': 'Family',
	'circles.kind.school': 'School',
	'circles.kind.class': 'Class',
	'circles.kind.course': 'Course',
	'circles.kind.club': 'Club',
	'circles.kind.team': 'Team',
	'circles.kind.work': 'Work',
	'circles.kind.neighborhood': 'Neighbourhood',
	'circles.kind.other': 'Other'
};

/** The key set every translation of this area has to provide. */
export type CirclesMessages = typeof circles;
