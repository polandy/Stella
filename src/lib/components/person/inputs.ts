import { FIELD } from '$lib/components/ui/field';

/** One class for every text input on the page, so they cannot drift apart. */
export const INPUT = `${FIELD} px-3 py-2 text-sm`;

/** The frame of a fact being edited — or, where a fact holds several, of each one of them. */
export const EDIT_FRAME = 'flex flex-col gap-3 rounded-control border border-primary bg-card p-3';
