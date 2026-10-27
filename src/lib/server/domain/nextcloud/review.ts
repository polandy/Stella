import type { Locale } from '../../../i18n/locales';
import type { NextcloudSource } from '../../../import-match/card';
import type { ContactReview } from '../../../import-match/review';
import type { Viewer } from '../../access/visibility';
import {
	applyContactReview,
	type CardAnswer,
	type ContactReviewDeps
} from '../import/contact-review';
import type { ImportWording } from '../import/monica/plan';
import { prepareContactReview } from '../import/review-view';
import type { ContactSourceRepository, ReviewScope } from '../import/source-links';
import type { AvatarUpload } from '../media/avatars';
import { storablePicture } from './card-photo';
import type { NextcloudStore } from './store';

/*
 * The linked book's new cards in the matching review (docs/02 §2.16.3). Every card of the book
 * Stella has not met yet is asked about once, as a card of an uploaded file would be, but read
 * from what the sync holds rather than from a file, remembered under the book's source, and
 * matched against shared people only: a private person never reaches the book. A new person
 * is always shared. There is no browser photo step: a card's picture is stored as it is when
 * it fits, the way the sync stores one.
 */

export interface BookCardsDeps {
	store: Pick<NextcloudStore, 'cards'>;
	sources: Pick<ContactSourceRepository, 'answersFor'>;
}

export interface BookReviewDeps extends ContactReviewDeps {
	store: Pick<NextcloudStore, 'cards'>;
	/** Stores a card's picture as the person's photo: the path every new avatar takes. */
	setAvatar(uploader: Viewer, contactId: string, upload: AvatarUpload): Promise<string>;
}

export interface BookReviewRequest {
	viewer: Viewer;
	source: NextcloudSource;
	/** By card key. */
	answers: ReadonlyMap<string, CardAnswer>;
	wording: ImportWording;
	locale: Locale;
}

export interface BookReviewOutcome {
	added: number;
	completed: number;
	skipped: number;
	/** Card pictures stored as a person's photo. */
	photos: number;
}

const scopeOf = (source: NextcloudSource): ReviewScope => ({ source, sharedOnly: true });

/** The book's cards nobody has answered for yet, as one vCard file; '' when there are none. */
export async function unansweredCards(
	deps: BookCardsDeps,
	viewer: Viewer,
	source: NextcloudSource
): Promise<string> {
	const [cards, answers] = await Promise.all([
		deps.store.cards(viewer.householdId, source),
		deps.sources.answersFor(viewer, source)
	]);
	return cards
		.filter((c) => !answers.has(c.uid))
		.map((c) => c.vcard)
		.join('');
}

/** The review of the book's new cards. */
export async function prepareBookReview(
	deps: BookCardsDeps & { sources: ContactSourceRepository },
	viewer: Viewer,
	source: NextcloudSource
): Promise<ContactReview> {
	const text = await unansweredCards(deps, viewer, source);
	return prepareContactReview(deps, viewer, text, scopeOf(source));
}

/**
 * Apply the answers to the book's new cards as they stand now: a card answered meanwhile is
 * not asked about, and one new since makes the review unanswered.
 */
export async function applyBookReview(
	deps: BookReviewDeps,
	request: BookReviewRequest
): Promise<BookReviewOutcome> {
	const { viewer, source } = request;
	const text = await unansweredCards(deps, viewer, source);
	if (text === '') return { added: 0, completed: 0, skipped: 0, photos: 0 };
	const outcome = await applyContactReview(deps, {
		viewer,
		text,
		answers: request.answers,
		visibility: 'shared',
		wording: request.wording,
		locale: request.locale,
		scope: scopeOf(source)
	});

	let photos = 0;
	for (const photo of outcome.photos) {
		if (!photo.isAvatar || photo.dataUrl === null) continue;
		const base64 = photo.dataUrl.slice(photo.dataUrl.indexOf(',') + 1);
		const storable = storablePicture({ mime: photo.mime, base64 });
		if (!storable) continue;
		const { bytes, width, height } = storable;
		await deps.setAvatar(viewer, photo.contactId, { image: bytes, thumb: bytes, width, height });
		photos++;
	}
	const { added, completed, skipped } = outcome;
	return { added, completed, skipped, photos };
}
