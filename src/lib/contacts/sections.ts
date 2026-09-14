/*
 * The cards a person's page can be pointed at (docs/05 §5.5). Here rather than in the page
 * component because the ids are a shared vocabulary: a form action redirects back to the card
 * it acted on, the passive "Mentioned in" list builds such a link per reference (docs/02
 * §2.20.1), and the card itself carries the id as its anchor. Three spellings of "notes" in
 * three files would drift on the first rename.
 *
 * These were tabs until the person's page put its content in one column (docs/05 §5.5). Links
 * with the old `?tab=` are still answered — see `sectionForLegacyTab`.
 */

/** Every addressable card, in the order the page shows them. */
export const CONTACT_SECTIONS = ['relationships', 'story', 'notes', 'photos', 'mentions'] as const;

export type ContactSection = (typeof CONTACT_SECTIONS)[number];

/** The id the card carries, and the fragment that scrolls to it. */
export function sectionAnchor(section: ContactSection): string {
	return `section-${section}`;
}

/** A link to one card of a person's page — the one place this URL is spelled. */
export function contactSectionPath(contactId: string, section: ContactSection): string {
	return `/contacts/${contactId}#${sectionAnchor(section)}`;
}

/** Which card a passive reference opens: a note is read on Notes, an entry in the story. */
export const SECTION_FOR_REFERENCE = {
	note: 'notes',
	journal: 'story'
} as const satisfies Record<string, ContactSection>;

/**
 * What the tabs were called while the page had them. A bookmark or a browser-history entry
 * still carries `?tab=people`, and dropping it on the floor would land the reader at the top
 * of the page with no hint that their link meant something.
 */
export const SECTION_FOR_LEGACY_TAB = {
	people: 'relationships',
	story: 'story',
	notes: 'notes',
	photos: 'photos',
	mentions: 'mentions'
} as const satisfies Record<string, ContactSection>;

/** The card an old `?tab=` value asked for, or null when it names none. */
export function sectionForLegacyTab(value: string | null): ContactSection | null {
	if (value === null) return null;
	return Object.hasOwn(SECTION_FOR_LEGACY_TAB, value)
		? SECTION_FOR_LEGACY_TAB[value as keyof typeof SECTION_FOR_LEGACY_TAB]
		: null;
}
