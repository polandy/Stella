import { giftFromMonicaNote, giftsFromTouchpoint } from '../../../gifts/conversion';
import type { Locale } from '../../../i18n/locales';
import type { Visibility } from '../../access/visibility';
import type { Gift } from './gifts';

/*
 * The gifts Stella already held in other shapes, made gift records once (docs/02 §2.25.4): the
 * notes the Monica import wrote before gifts existed (id `<source>:gift:<monica id>`), and the
 * touchpoints of the dropped kind *gift*. Runs at every start and after every restore; once
 * nothing is left to convert it writes nothing, and names only the notes it keeps leaving alone.
 *
 * Nothing is lost: each original is removed only together with the gifts made from it, and a
 * note somebody wrote in since the import — or one that no longer reads as the import wrote it —
 * is left as it is and named in the log. The gifts take their original's id (a touchpoint's
 * participants get `<id>:<person>`), so an original that comes back, from an older archive say,
 * finds its gift already there and is only removed.
 */

/** A note the Monica import wrote for a gift. */
export interface HeldGiftNote {
	id: string;
	contactId: string;
	createdBy: string;
	visibility: Visibility;
	body: string;
	createdAt: number;
	updatedAt: number;
}

/** A touchpoint of the kind *gift*, with the people it was logged with. */
export interface HeldGiftTouchpoint {
	id: string;
	contactId: string;
	participantIds: string[];
	createdBy: string;
	visibility: Visibility;
	/** The author's language, for the title of a touchpoint that says nothing. */
	authorLocale: Locale | null;
	title: string | null;
	description: string | null;
	happenedAt: string;
	createdAt: number;
	updatedAt: number;
}

/** Port the domain owns; the adapter makes each replacement one transaction. */
export interface HeldGiftsPort {
	giftNotes(): Promise<HeldGiftNote[]>;
	giftTouchpoints(): Promise<HeldGiftTouchpoint[]>;
	/**
	 * Writes the gift unless its id is already there, and removes the note — together. Answers
	 * how many gifts it wrote: 0 when the gift was already there.
	 */
	replaceNote(noteId: string, gift: Gift): Promise<number>;
	/** Writes the gifts whose ids are not there yet, and removes the touchpoint — together. */
	replaceTouchpoint(interactionId: string, gifts: readonly Gift[]): Promise<number>;
}

export interface ConvertHeldGiftsDeps {
	held: HeldGiftsPort;
	/** The title of a touchpoint with neither title nor description, in its author's language. */
	untitled: (locale: Locale | null) => string;
	/** Where the operator reads what happened: the server log. */
	log: (line: string) => void;
}

export interface HeldGiftsReport {
	notesConverted: number;
	notesLeft: number;
	touchpointsConverted: number;
	/** Gifts new to the database; one already there from an earlier run is not counted. */
	giftsWritten: number;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export async function convertHeldGifts(deps: ConvertHeldGiftsDeps): Promise<HeldGiftsReport> {
	const report: HeldGiftsReport = {
		notesConverted: 0,
		notesLeft: 0,
		touchpointsConverted: 0,
		giftsWritten: 0
	};

	for (const note of await deps.held.giftNotes()) {
		const made = giftFromMonicaNote(note);
		if (!made.ok) {
			report.notesLeft++;
			deps.log(
				`gifts: left the Monica gift note ${note.id} on /contacts/${note.contactId} as it is (${made.reason})`
			);
			continue;
		}
		report.giftsWritten += await deps.held.replaceNote(note.id, {
			id: note.id,
			contactId: note.contactId,
			createdBy: note.createdBy,
			visibility: note.visibility,
			...made.gift,
			occasion: null,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt
		});
		report.notesConverted++;
	}

	for (const touch of await deps.held.giftTouchpoints()) {
		const gifts: Gift[] = giftsFromTouchpoint(touch, deps.untitled(touch.authorLocale)).map(
			(made) => ({
				id: made.contactId === touch.contactId ? touch.id : `${touch.id}:${made.contactId}`,
				createdBy: touch.createdBy,
				visibility: touch.visibility,
				...made,
				url: null,
				occasion: null,
				createdAt: touch.createdAt,
				updatedAt: touch.updatedAt
			})
		);
		report.giftsWritten += await deps.held.replaceTouchpoint(touch.id, gifts);
		report.touchpointsConverted++;
	}

	if (report.notesConverted + report.touchpointsConverted > 0) {
		deps.log(
			`gifts: converted ${plural(report.notesConverted, 'Monica gift note', 'Monica gift notes')} and ` +
				`${plural(report.touchpointsConverted, 'gift touchpoint', 'gift touchpoints')} into ` +
				`${plural(report.giftsWritten, 'gift', 'gifts')}; ` +
				`${plural(report.notesLeft, 'note', 'notes')} left as they are`
		);
	}
	return report;
}
