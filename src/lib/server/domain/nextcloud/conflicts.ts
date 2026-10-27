import type { Locale } from '../../../i18n/locales';
import type { IncomingCard, StellaPerson } from '../../../import-match/card';
import type { Conflict } from '../../../import-match/merge-plan';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord } from '../activity/activity';
import type { ContactReviewWriter } from '../import/contact-review';
import type { ImportWording } from '../import/monica/plan';
import { completionOf, isCompleting } from '../import/review-cards';
import type { AvatarUpload } from '../media/avatars';
import { cardPicture, storablePicture } from './card-photo';
import { NOBODY_NEW } from './card-read';
import { asStellaPerson } from './linked-person';
import type { NextcloudStore, StoredConflict } from './store';
import type { SyncConflictKind } from './sync-plan';

/*
 * The conflicts a sync found, waiting under *Data quality* (docs/02 §2.16.3), and their answer:
 * keep Stella's side, or take the card's. Either way the person is written out at the next sync
 * — Stella's side onto the card, or nothing at all when the card's was taken.
 */

export interface ConflictAnswerDeps {
	store: NextcloudStore;
	writer: ContactReviewWriter;
	setAvatar(uploader: Viewer, contactId: string, upload: AvatarUpload): Promise<string>;
	clock: Clock;
	ids: IdGenerator;
}

export interface ConflictAnswer {
	viewer: Viewer;
	contactId: string;
	kind: SyncConflictKind;
	take: 'stella' | 'card';
	wording: Pick<ImportWording, 'fieldLabel'>;
	locale: Locale;
}

/** The conflicts waiting about people `viewer` may browse, oldest first. */
export const waitingConflicts = (
	deps: Pick<ConflictAnswerDeps, 'store'>,
	viewer: Viewer
): Promise<StoredConflict[]> => deps.store.conflicts(viewer);

/** A card saying what the person holds but for the conflict's fact, which it says the card's way. */
function cardSaying(person: StellaPerson, conflict: Conflict): IncomingCard {
	const card: IncomingCard = {
		key: person.id,
		hash: '',
		firstName: person.firstName,
		lastName: person.lastName,
		displayName: person.displayName,
		nickname: null,
		company: null,
		jobTitle: null,
		birthday: person.birthday,
		emails: [],
		phones: [],
		addresses: [],
		urls: [],
		tags: [],
		photo: null
	};
	return conflict.kind === 'birthday'
		? { ...card, birthday: conflict.card }
		: { ...card, [conflict.kind]: conflict.card };
}

/** Answer one waiting conflict; false when it is no longer waiting or its person is out of reach. */
export async function answerConflict(
	deps: ConflictAnswerDeps,
	answer: ConflictAnswer
): Promise<boolean> {
	const { viewer, contactId, kind } = answer;
	const waiting = (await deps.store.conflicts(viewer)).find(
		(c) => c.contactId === contactId && c.conflict.kind === kind
	);
	const linked = waiting ? await deps.store.linkedCard(viewer, contactId) : null;
	if (!waiting || !linked) return false;

	if (answer.take === 'card') {
		const { conflict } = waiting;
		if (conflict.kind === 'photo') {
			const picture = cardPicture(linked.card.vcard);
			const storable = picture ? storablePicture(picture) : null;
			if (storable) {
				const { bytes, width, height } = storable;
				await deps.setAvatar(viewer, contactId, { image: bytes, thumb: bytes, width, height });
			}
		} else {
			const person = (await deps.store.linkedPeople(viewer, linked.source)).get(linked.card.uid);
			if (!person) return false;
			const now = deps.clock.now();
			const stella = asStellaPerson(person);
			const completion = completionOf(cardSaying(stella, conflict), stella, [conflict.kind], {
				ids: deps.ids,
				now,
				wording: answer.wording,
				locale: answer.locale
			});
			if (isCompleting(completion)) {
				const audit = activityRecord(
					deps,
					viewer,
					{
						kind: 'contacts.reviewed',
						people: 0,
						completed: 1,
						source: linked.source,
						visibility: 'shared',
						locale: answer.locale
					},
					now
				);
				await deps.writer.applyReview(
					viewer,
					{ newPeople: NOBODY_NEW, completions: [completion], links: [], at: now },
					audit
				);
			}
		}
	}

	await deps.store.removeConflict(viewer, contactId, kind);
	// Out of step on purpose: the next sync writes the person as they now are.
	await deps.store.setStellaHash(viewer.householdId, linked.source, linked.card.href, null);
	return true;
}
