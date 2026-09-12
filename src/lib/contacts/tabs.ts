/*
 * The tabs on a person's page (docs/05 §5.5). Here rather than in the page component because
 * the tab ids are now a shared vocabulary: a link may ask for one (`?tab=`), and the passive
 * "Mentioned in" list builds such a link per reference (docs/02 §2.20.1). Two spellings of
 * "notes" in two files would drift on the first rename.
 */

/** Every tab, in the order they are shown. People leads: who this is comes before what happened. */
export const CONTACT_TABS = ['people', 'story', 'notes', 'photos', 'mentions'] as const;

export type ContactTab = (typeof CONTACT_TABS)[number];

/** The tab named by `?tab=`, or null when it names none. */
export function requestedTab(value: string | null): ContactTab | null {
	return CONTACT_TABS.find((name) => name === value) ?? null;
}

/** Which tab a passive reference opens: a note is read on Notes, an entry in the story. */
export const TAB_FOR_REFERENCE = { note: 'notes', journal: 'story' } as const satisfies Record<
	string,
	ContactTab
>;
