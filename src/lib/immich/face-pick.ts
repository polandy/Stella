/*
 * What a tap on a face in *Find in Immich* does (docs/02 §2.24.2). One Immich person is one
 * contact, so a face someone else holds is never linked again from here; but when the member sees
 * who holds it, their photos are worth looking through — a group photo may hold the person the
 * picker is for, unlinked in Immich or nameless there — and one of them can become this person's
 * picture (§2.24.6). Pure, so the rule is tested without the dialog.
 */

/**
 * Who holds a face, as the faces route says it: the contact and their name when the member sees
 * them, neither when not — then only that somebody does.
 */
export type FaceHolder = { contactId: string; name: string } | { contactId: null; name: null };

export type FaceChoice =
	/** Nobody holds it: a tap links it to the person the picker is for. */
	| { kind: 'link' }
	/** Someone the member sees holds it: a tap opens that person's photos in the picker. */
	| { kind: 'browse'; contactId: string; name: string }
	/** Held out of the member's reach, or by the picker's own person: nothing to tap. */
	| { kind: 'taken'; name: string | null };

/** What the face `holder` holds offers in the picker opened for `pickerFor`. */
export function faceChoice(holder: FaceHolder | null, pickerFor: string): FaceChoice {
	if (holder === null) return { kind: 'link' };
	if (holder.contactId === null || holder.contactId === pickerFor)
		return { kind: 'taken', name: holder.name };
	return { kind: 'browse', contactId: holder.contactId, name: holder.name };
}
