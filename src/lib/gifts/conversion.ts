import { INTL_LOCALES } from '../i18n/locales';
import { giftLink, type GiftState } from './gifts';

/*
 * Gifts Stella already held in other shapes, made gift records (docs/02 §2.25.4): the notes the
 * Monica import wrote before gifts existed, and the touchpoints of the dropped kind *gift*. Pure
 * and shared, so the startup job, the restore and the importer decide the same way. Whatever
 * cannot be read back exactly is refused with a reason, never guessed — the caller then leaves
 * the note as it is, so nothing written by hand is lost.
 */

/** A gift's content as a conversion makes it; who it is for and who noted it stay the caller's. */
export interface ConvertedGift {
	state: GiftState;
	title: string;
	givenOn: string | null;
	note: string | null;
	url: string | null;
}

/** Why a gift could not be made: the caller keeps the original and names it in its log. */
export type GiftConversionRefusal =
	'edited' | 'unparseable' | 'unknownStatus' | 'noDay' | 'noTitle';

export type GiftConversion =
	{ ok: true; gift: ConvertedGift } | { ok: false; reason: GiftConversionRefusal };

/** A Monica gift's fields, from the export or read back out of the note the import wrote. */
export interface MonicaGiftFields {
	name: string;
	status: string | null;
	/** ISO YYYY-MM-DD. */
	day: string | null;
	comment: string | null;
	url: string | null;
}

const MONICA_STATES: Record<string, GiftState> = {
	idea: 'idea',
	offered: 'given',
	received: 'received'
};

/** Monica's status as a gift's state: `idea` → idea, `offered` → given, `received` → received. */
export function monicaGiftState(status: string | null): GiftState | null {
	if (status === null) return null;
	return MONICA_STATES[status.trim().toLowerCase()] ?? null;
}

const blankToNull = (text: string | null): string | null => {
	const trimmed = text?.trim() ?? '';
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * A Monica gift as a gift record. A given or received gift needs its day, so one without is
 * refused rather than dated on the day of the import. A link that is no web address goes into
 * the note, where it stays readable without becoming a link.
 */
export function giftFromMonica(fields: MonicaGiftFields): GiftConversion {
	const title = blankToNull(fields.name);
	if (title === null) return { ok: false, reason: 'noTitle' };
	const state = monicaGiftState(fields.status);
	if (state === null) return { ok: false, reason: 'unknownStatus' };
	if (state !== 'idea' && fields.day === null) return { ok: false, reason: 'noDay' };

	const rawUrl = blankToNull(fields.url);
	const link = rawUrl === null ? null : giftLink(rawUrl);
	const url = link?.ok ? link.url : null;
	const notes = [blankToNull(fields.comment), link?.ok === false ? rawUrl : null].filter(
		(part): part is string => part !== null
	);
	return {
		ok: true,
		gift: {
			state,
			title,
			givenOn: state === 'idea' ? null : fields.day,
			note: notes.length > 0 ? notes.join('\n\n') : null,
			url
		}
	};
}

/** Month names, lower-cased, to their number — in every language the import wrote days in. */
const MONTHS: ReadonlyMap<string, number> = (() => {
	const months = new Map<string, number>();
	for (const locale of Object.values(INTL_LOCALES)) {
		const format = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
		for (let month = 0; month < 12; month++)
			months.set(format.format(Date.UTC(2000, month, 1)).toLowerCase(), month + 1);
	}
	return months;
})();

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `12 October 2023` (en-GB) and `12. Oktober 2023` (de-DE), as `dayLabel` writes them. */
const WRITTEN_DAY = /^(\d{1,2})\.? (\p{L}+) (\d{4})$/u;

const pad = (n: number) => String(n).padStart(2, '0');

/** The ISO day of a day the import wrote into a note, or null when it is not one. */
export function parseNoteDay(text: string): string | null {
	const trimmed = text.trim();
	let year: number, month: number, day: number;
	const iso = ISO_DAY.exec(trimmed);
	const written = WRITTEN_DAY.exec(trimmed);
	if (iso) {
		[year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
	} else if (written) {
		const named = MONTHS.get(written[2].toLowerCase());
		if (named === undefined) return null;
		[year, month, day] = [Number(written[3]), named, Number(written[1])];
	} else {
		return null;
	}
	// A day the calendar does not have (31 February) rolls over in `Date`; refuse it instead.
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
	return `${year}-${pad(month)}-${pad(day)}`;
}

/** `🎁 **Title** — status, day`, the note's first line; the part after the dash is optional. */
const FIRST_LINE = /^🎁 \*\*(.+)\*\*(?: — (.+))?$/u;

/** A last paragraph that reads as one address: no space, and a scheme or a dot. */
const looksLikeAddress = (text: string) =>
	!/\s/.test(text) && (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.includes('.'));

/**
 * The Monica gift a note holds, read back from the shape the import wrote: the first line, then
 * the comment, then the link — each its own paragraph. Null when the first line is not that.
 */
export function parseMonicaGiftNote(body: string): MonicaGiftFields | null {
	const [head, ...rest] = body.split('\n\n');
	const first = FIRST_LINE.exec(head.trim());
	if (!first) return null;

	let status: string | null = null;
	let day: string | null = null;
	const meta = first[2]?.trim() ?? null;
	if (meta !== null) {
		const comma = meta.indexOf(', ');
		if (comma >= 0) {
			status = meta.slice(0, comma);
			day = parseNoteDay(meta.slice(comma + 2));
			if (day === null) return null;
		} else {
			day = parseNoteDay(meta);
			if (day === null) status = meta;
		}
	}

	const paragraphs = rest.map((p) => p.trim()).filter((p) => p.length > 0);
	const last = paragraphs.at(-1);
	const url = last !== undefined && looksLikeAddress(last) ? last : null;
	if (url !== null) paragraphs.pop();
	return {
		name: first[1],
		status,
		day,
		comment: paragraphs.length > 0 ? paragraphs.join('\n\n') : null,
		url
	};
}

/** A gift note as stored: its text and the stamps that tell an edit from the import. */
export interface MonicaGiftNote {
	body: string;
	createdAt: number;
	updatedAt: number;
}

/**
 * A gift note as a gift record — only a note exactly as the import wrote it. The import stamps
 * both times alike, so a later `updatedAt` means somebody wrote in it: that note is left alone.
 */
export function giftFromMonicaNote(note: MonicaGiftNote): GiftConversion {
	if (note.updatedAt !== note.createdAt) return { ok: false, reason: 'edited' };
	const fields = parseMonicaGiftNote(note.body);
	if (fields === null) return { ok: false, reason: 'unparseable' };
	return giftFromMonica(fields);
}

/** A touchpoint of the dropped kind *gift*, with the people it was logged with. */
export interface GiftTouchpoint {
	contactId: string;
	participantIds: readonly string[];
	title: string | null;
	description: string | null;
	happenedAt: string;
}

/** One given gift made from a touchpoint, for one person. */
export interface TouchpointGift {
	contactId: string;
	state: 'given';
	title: string;
	note: string | null;
	givenOn: string;
}

/**
 * A gift touchpoint as given gifts — one per person it was logged with, the person first, since
 * a gift belongs to one person (concept §8 Q3). The title stays the title and the description
 * becomes the note; with no title, the description is the title; with neither, `untitled`.
 */
export function giftsFromTouchpoint(touch: GiftTouchpoint, untitled: string): TouchpointGift[] {
	const title = blankToNull(touch.title);
	const description = blankToNull(touch.description);
	const people = [...new Set([touch.contactId, ...touch.participantIds])];
	return people.map((contactId) => ({
		contactId,
		state: 'given',
		title: title ?? description ?? untitled,
		note: title === null ? null : description,
		givenOn: touch.happenedAt.slice(0, 10)
	}));
}
