/*
 * What tapping a person's picture offers (docs/02 §2.14, §2.24.6). With nothing to choose from
 * but a file, the tap opens the file picker at once, as it always did. With their group photos
 * (docs/02 §2.14) or with Immich on this instance, it opens a chooser: a
 * file, the group photos, and — with Immich — the person's latest Immich photos, or *Find in
 * Immich* while they are not linked yet. Pure, so the one decision is tested without a page.
 */

export interface AvatarChoiceInput {
	/** How many group photos their picture can be cut from. */
	groupPhotos: number;
	/** Immich as the page has it now; null without Immich, or offline, where none of it is shown. */
	immich: { linked: boolean } | null;
}

export interface AvatarChoices {
	/** Whether the tap opens the chooser, rather than the file picker at once. */
	chooser: boolean;
	/** The chooser's Immich section: their photos, the face picker, or none. */
	immich: 'photos' | 'find' | null;
}

export function avatarChoices({ groupPhotos, immich }: AvatarChoiceInput): AvatarChoices {
	const section = immich === null ? null : immich.linked ? 'photos' : 'find';
	return { chooser: groupPhotos > 0 || section !== null, immich: section };
}
