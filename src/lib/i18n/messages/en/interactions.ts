/* The kinds of contact an interaction can record (docs/02 §2.6). */

export const interactions = {
	'interactions.kind.met': 'Met in person',
	'interactions.kind.call': 'Call',
	'interactions.kind.video': 'Video call',
	'interactions.kind.message': 'Message',
	'interactions.kind.letter': 'Letter',
	'interactions.kind.gift': 'Gift',
	'interactions.kind.other': 'Other'
};

/** The key set every translation of this area has to provide. */
export type InteractionsMessages = typeof interactions;
