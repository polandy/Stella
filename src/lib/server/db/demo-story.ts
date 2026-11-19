import { dayOfInstant } from '../../dates/today';
import { extractMentionIds, mentionToken, mentionsOtherThan } from '../../mentions/mentions';

// A few contact fields for the core adults, so contact detail pages aren't bare.
export interface Field {
	person: string;
	kind: 'phone' | 'email' | 'address';
	label: string;
	value: string;
}

export const FIELDS: readonly Field[] = [
	{ person: 'markus', kind: 'email', label: 'Privat', value: 'markus.brunner@bluewin.ch' },
	{ person: 'markus', kind: 'phone', label: 'Mobil', value: '+41 79 214 55 03' },
	{
		person: 'markus',
		kind: 'address',
		label: 'Zuhause',
		value: 'Spitalackerstrasse 22, 3013 Bern'
	},
	{ person: 'sandra', kind: 'email', label: 'Privat', value: 'sandra.brunner@bluewin.ch' },
	{ person: 'sandra', kind: 'phone', label: 'Mobil', value: '+41 78 655 12 88' },
	{
		person: 'sandra',
		kind: 'address',
		label: 'Zuhause',
		value: 'Spitalackerstrasse 22, 3013 Bern'
	},
	{ person: 'thomas', kind: 'phone', label: 'Mobil', value: '+41 79 330 87 41' },
	{ person: 'daniel', kind: 'address', label: 'Zuhause', value: 'Hofackerstrasse 7, 8032 Zürich' }
];

// A couple of notes for flavour on the graph/contact pages.
export interface Note {
	person: string;
	title: string;
	body: string;
	pinned?: boolean;
}

export const NOTES: readonly Note[] = [
	{
		person: 'lena',
		title: 'Klavier-Vorspiel',
		body: 'Lena hat am Vorspiel der Musikschule *Für Elise* gespielt — hat super geklappt. Nächstes Ziel: ein vierhändiges Stück mit @{person:mia}.',
		pinned: true
	},
	{
		person: 'noah',
		title: 'Fussballsaison',
		body: 'Noah steht neu im Tor bei den Junioren E. Training jeweils Dienstag und Donnerstag, Heimspiele am Samstag auf dem Spitalacker.'
	},
	{
		person: 'thomas',
		title: 'Kennengelernt',
		body: 'Thomas und Markus kennen sich seit dem Zivildienst. Treffen sich regelmässig am FC-Training.'
	}
];

export interface ImportantDateSeed {
	person: string;
	kind: 'anniversary' | 'custom';
	label?: string;
	date: string;
	/** One-off rather than yearly. */
	once?: boolean;
}

/* Only what a birth date cannot express — birthdays come from `contact.birth_date`. */
export const IMPORTANT_DATES: readonly ImportantDateSeed[] = [
	{ person: 'markus', kind: 'anniversary', label: 'Hochzeitstag', date: '2009-06-13' },
	{ person: 'sandra', kind: 'anniversary', label: 'Hochzeitstag', date: '2009-06-13' },
	{ person: 'hans', kind: 'anniversary', label: 'Goldene Hochzeit', date: '1980-09-13' },
	{ person: 'rosa', kind: 'anniversary', label: 'Goldene Hochzeit', date: '1980-09-13' },
	{ person: 'thomas', kind: 'custom', label: 'Jubiläum FC Länggasse', date: '2015-09-20' },
	{ person: 'vreni', kind: 'custom', label: 'Letzter Schultag der 5b', date: '2027-07-02' }
];

/*
 * The story so far (docs/dev/02 §2.23): journal entries and touchpoints, dated relative to the
 * day the seed runs so "last written about" always has something to say.
 * Lena is deliberately left out — the e2e suite writes her story itself and counts it.
 * Opa Hans carries enough for the timeline to need a second page.
 */
export interface StorySeed {
	person: string;
	daysAgo: number;
	/**
	 * A touchpoint's kind, or `gift` for a gift given that day — once the touchpoint kind the
	 * gift record replaced (docs/dev/02 §2.25.4). It keeps its place in this list so every seeded
	 * id stays what it was, and an older demo database converted at start is not seeded twice.
	 */
	kind?: 'met' | 'call' | 'video' | 'message' | 'letter' | 'gift';
	text: string;
	/** Written by the household's second member, so the story shows two names (docs/dev/02 §2.23). */
	byMember?: true;
}

export const STORY: readonly StorySeed[] = [
	{ person: 'markus', daysAgo: 1, kind: 'call', text: 'Sunday call' },
	{
		person: 'markus',
		daysAgo: 2,
		text: 'Markus fixed the garden gate at last — with @{person:noah} holding the screws.'
	},
	{
		person: 'hans',
		daysAgo: 8,
		text: 'Opa Hans told the story about the 1972 flood again, this time with the photo of the bridge. #family-history'
	},
	{ person: 'hans', daysAgo: 30, kind: 'met', text: 'Lunch at the Bären' },
	{
		person: 'hans',
		daysAgo: 45,
		byMember: true,
		text: 'Hans sharpened every knife in the house and pretended it was nothing.'
	},
	{ person: 'hans', daysAgo: 60, kind: 'call', text: 'Called about the roof' },
	{
		person: 'hans',
		daysAgo: 75,
		text: 'Hans found his old carpentry ledger from 1969. Every chair in the village is in it. #family-history #crafts'
	},
	{ person: 'hans', daysAgo: 90, kind: 'video', byMember: true, text: 'Video call with the kids' },
	{
		person: 'hans',
		daysAgo: 110,
		byMember: true,
		text: 'Hans and @{person:rosa} danced in the kitchen. Nobody was supposed to see.'
	},
	{ person: 'hans', daysAgo: 130, kind: 'gift', text: 'Brought him the biography he mentioned' },
	{
		person: 'hans',
		daysAgo: 150,
		text: 'Hans taught @{person:noah} how to whittle a whistle. It even works. #crafts'
	},
	{ person: 'hans', daysAgo: 170, kind: 'letter', text: 'Postcard from the Engadin' },
	{
		person: 'hans',
		daysAgo: 190,
		text: 'Hans mended the sled runner the night before the first snow. #crafts #winter'
	},
	{ person: 'hans', daysAgo: 210, kind: 'met', text: 'Sunday roast at theirs' },
	{
		person: 'hans',
		daysAgo: 230,
		text: 'Hans told us he was once a very fast skater. Rosa confirmed it, grudgingly.'
	},
	{
		person: 'hans',
		daysAgo: 250,
		kind: 'message',
		text: 'Sent him the photos from the christening'
	},
	{ person: 'nadia', daysAgo: 20, kind: 'met', text: 'Coffee in Bern' },
	{
		person: 'rosa',
		daysAgo: 100,
		text: 'Rosa sent the recipe for the plum cake. Written on the back of an envelope, of course. #recipes'
	},
	{ person: 'peter', daysAgo: 95, kind: 'gift', text: 'Birthday wine' },
	{ person: 'vreni', daysAgo: 200, text: 'Vreni turned 80. The whole choir came.' },
	{ person: 'heidi', daysAgo: 240, kind: 'letter', text: 'Christmas card, late' },
	{ person: 'reto', daysAgo: 300, text: 'Reto helped move the piano. Owe him a dinner.' }
];

export const DAY_MS = 86_400_000;

/**
 * How long ago the household "added" its people and relationships. Dated back so the stream
 * opens on the story rather than on forty "You linked …" rows from the moment the seed ran.
 */
export const SEED_AGE_DAYS = 400;
export const dayBefore = (now: number, days: number) =>
	new Date(now - days * DAY_MS).toISOString().slice(0, 10);

export const cid = (key: string) => `demo-c-${key}`;
export const circleId = (key: string) => `demo-circle-${key}`;
export const SYMMETRIC_TYPES = new Set([
	'sibling',
	'spouse',
	'partner',
	'friend',
	'colleague',
	'neighbor',
	'acquaintance',
	'knows'
]);

/*
 * *On this day* (docs/dev/02 §2.12.1): what the household wrote on today's date in earlier years,
 * so Home's band has a photo-less day to show — two moments and two touchpoints, one more than
 * the band holds, so *More* leads to the page. Dated by whole years from the day the seed runs.
 */
export const MEMORIES: readonly {
	key: string;
	person: string;
	yearsAgo: number;
	kind?: 'met' | 'call';
	text: string;
}[] = [
	{
		key: 'choir',
		person: 'vreni',
		yearsAgo: 1,
		text: 'Choir concert in the Münster with @{person:rosa}.'
	},
	{
		key: 'sandra-call',
		person: 'sandra',
		yearsAgo: 1,
		kind: 'call',
		text: 'Long call about the move'
	},
	{ key: 'hike', person: 'thomas', yearsAgo: 3, kind: 'met', text: 'Hike up the Gurten' },
	{
		key: 'garden',
		person: 'rosa',
		yearsAgo: 6,
		text: 'Rosa showed us her garden, the dahlias were huge.'
	}
];

/**
 * The same day and month `years` back, on the server's own day as Home reads it (`dayOfInstant`),
 * 28 February standing in for a 29th that year lacks.
 */
export function sameDayYearsBack(now: number, years: number): string {
	const today = dayOfInstant(now);
	const year = Number(today.slice(0, 4)) - years;
	const leapDay = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
	return today.endsWith('-02-29') && !leapDay ? `${year}-02-28` : `${year}${today.slice(4)}`;
}

/*
 * Seed texts name people by their key (`@{person:lena}`); the stored form is the id-based
 * token the app itself writes (docs/dev/02 §2.20.1), so the demo data goes through the same
 * grammar the parser, the chip and the "Mentioned in" list read.
 */
export const withMentions = (text: string) =>
	text.replace(/@\{person:([a-z]+)\}/g, (_match, key: string) => mentionToken(cid(key)));

/**
 * What is still owed Peter, Grosi’s husband (docs/dev/02 §2.26): one overdue, one due this week, one with no
 * day, one private and one already done, so the To-dos card stands at the top of his page and
 * shows every standing. `dueIn` counts days from today, negative for past ones. Two more, on
 * Lena and Beat, give Home's *To-dos* band three faces and *Show all* (docs/dev/02 §2.26.6).
 */
export const TODOS: readonly {
	key: string;
	/** Whom it is about, Peter unless said. */
	person?: string;
	title: string;
	dueIn: number | null;
	byMember?: boolean;
	private?: boolean;
	doneDaysAgo?: number;
}[] = [
	{ key: 'book', title: 'Give back the book about the Gotthard', dueIn: -4 },
	{ key: 'surgery', title: 'Ask how the knee check-up went', dueIn: 3, byMember: true },
	{ key: 'recipe', title: 'Send him Grosi’s plum cake recipe', dueIn: null },
	{ key: 'visit', title: 'Plan a visit before Christmas', dueIn: 40, private: true },
	{ key: 'photos', title: 'Print the photos of his birthday', dueIn: null, doneDaysAgo: 6 },
	{ key: 'pump', person: 'lena', title: 'Bring back her bike pump', dueIn: 0 },
	{ key: 'stove', person: 'beat', title: 'Return the camping stove', dueIn: 12 }
];

/** The people a seeded body names, minus the person it is already about. */
export const mentionedBy = (row: { contactId: string; body: string }) =>
	mentionsOtherThan(extractMentionIds(row.body), [row.contactId]);

/**
 * Gifts for Grosi Ursula (docs/dev/02 §2.25): two open ideas, what was given over two years and one
 * present back, so every tab of the Gifts card has something in it. On a grandparent nobody
 * else's demo story reads, so the story's given and received gifts show without shifting a
 * timeline another case counts. `daysAgo` dates the given and received ones.
 */
export const GIFTS: readonly {
	key: string;
	state: 'idea' | 'given' | 'received';
	title: string;
	note?: string;
	url?: string;
	daysAgo: number;
	occasion?: string;
	byMember?: boolean;
}[] = [
	{
		key: 'player',
		state: 'idea',
		title: 'Audiobook player with big buttons',
		note: 'She said the remote is too fiddly.',
		url: 'https://shop.example/audiobook-player',
		daysAgo: 12
	},
	{
		key: 'photobook',
		state: 'idea',
		title: 'Photo book of the summer at the lake',
		daysAgo: 30,
		byMember: true
	},
	{
		key: 'socks',
		state: 'received',
		title: 'Hand-knitted socks',
		daysAgo: 288,
		occasion: 'christmas'
	},
	{
		key: 'tea',
		state: 'given',
		title: 'Her favourite tea, the big tin',
		daysAgo: 355,
		occasion: 'birthday'
	},
	{
		key: 'slippers',
		state: 'given',
		title: 'Warm slippers',
		daysAgo: 653,
		occasion: 'christmas',
		byMember: true
	},
	{
		key: 'garden',
		state: 'given',
		title: 'Day trip to the garden show',
		note: 'With lunch by the river.',
		daysAgo: 720,
		occasion: 'birthday'
	}
];
