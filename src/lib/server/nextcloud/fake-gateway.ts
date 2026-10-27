import {
	AddressBookUnreachableError,
	type AddressBookGateway,
	type BookChanges,
	type PutOutcome,
	type RemoteCard
} from '../domain/nextcloud/address-book';

/*
 * A Nextcloud address book that lives in memory (docs/02 §2.16.3): the sync's tests drive it,
 * and the demo/e2e server wires it with `NEXTCLOUD_DEMO=true`, so linking can be tried without a
 * real Nextcloud. It answers the way the HTTP adapter does — a token is a revision, a write names
 * the etag it read — and `phone` stands for the household's phones, editing the book from aside.
 */

/** Where every card lives, like a Nextcloud book's paths. */
export const FAKE_BOOK_PATH = '/remote.php/dav/addressbooks/users/family/contacts/';

interface Stored extends RemoteCard {
	/** The book's revision when this card last changed. */
	rev: number;
}

export interface FakeAddressBook extends AddressBookGateway {
	/** Edits from aside, as a phone's would be; each one moves the book to a new revision. */
	phone: {
		/** Add or replace the card at `name` (a file name in the book). Returns its path. */
		save(name: string, vcard: string): string;
		delete(name: string): void;
	};
	/** The cards as they stand, ordered by path. */
	cards(): RemoteCard[];
	/** Make every call fail until set back to false, as an unreachable server would. */
	setUnreachable(unreachable: boolean): void;
	/** The tokens the server no longer knows, as after Nextcloud cleaned up its change log. */
	forgetTokens(): void;
}

export function createFakeAddressBook(initial: Record<string, string> = {}): FakeAddressBook {
	const cards = new Map<string, Stored>();
	const deletedAt = new Map<string, number>();
	let rev = 0;
	// Tokens older than this were forgotten; a sync from one reads the whole book.
	let oldestKnown = 0;
	let unreachable = false;

	const token = (n: number) => `fake-sync/${n}`;
	const revOf = (t: string): number | null => {
		const n = Number(/^fake-sync\/(\d+)$/.exec(t)?.[1] ?? NaN);
		return Number.isInteger(n) && n >= oldestKnown && n <= rev ? n : null;
	};
	const reachable = () => {
		if (unreachable) throw new AddressBookUnreachableError('fake book set unreachable');
	};
	const copy = ({ href, etag, vcard }: Stored): RemoteCard => ({ href, etag, vcard });

	function store(href: string, vcard: string): string {
		rev += 1;
		const etag = `"${rev}"`;
		cards.set(href, { href, etag, vcard, rev });
		deletedAt.delete(href);
		return etag;
	}

	for (const [name, vcard] of Object.entries(initial)) store(FAKE_BOOK_PATH + name, vcard);

	return {
		async changesSince(since): Promise<BookChanges> {
			reachable();
			const from = since === null ? null : revOf(since);
			const all = [...cards.values()].sort((a, b) => a.href.localeCompare(b.href));
			if (from === null) {
				return { token: token(rev), changed: all.map(copy), deleted: [], complete: true };
			}
			return {
				token: token(rev),
				changed: all.filter((c) => c.rev > from).map(copy),
				deleted: [...deletedAt].filter(([, at]) => at > from).map(([href]) => href),
				complete: false
			};
		},

		async put(href, vcard, etag): Promise<PutOutcome> {
			reachable();
			const card = cards.get(href);
			if (!card) return 'gone';
			if (card.etag !== etag) return 'stale';
			return { etag: store(href, vcard) };
		},

		phone: {
			save: (name, vcard) => {
				const href = FAKE_BOOK_PATH + name;
				store(href, vcard);
				return href;
			},
			delete: (name) => {
				const href = FAKE_BOOK_PATH + name;
				if (!cards.delete(href)) return;
				rev += 1;
				deletedAt.set(href, rev);
			}
		},

		cards: () => [...cards.values()].sort((a, b) => a.href.localeCompare(b.href)).map(copy),
		setUnreachable: (value) => {
			unreachable = value;
		},
		forgetTokens: () => {
			// A fresh revision, so the token the next full read hands out is one it knows again.
			rev += 1;
			oldestKnown = rev;
		}
	};
}
