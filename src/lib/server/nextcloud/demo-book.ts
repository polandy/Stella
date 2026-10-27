import { createFakeAddressBook, type FakeAddressBook } from './fake-gateway';

/*
 * The demo household's Nextcloud address book (`NEXTCLOUD_DEMO=true`): a few cards as a family's
 * phones would hold them, so the link has something to sync. Markus's and Thomas's cards share a
 * phone with the people the demo seed creates and say a little more, so the review offers a
 * match; Petra is nobody in Stella yet. Once Stella has written Markus's card, a phone changes it
 * a single time — a new email fills a gap, a birthday a day off Stella's disagrees — so the demo
 * and its e2e show both ways a linked card comes back.
 */

const MARKUS = 'markus.vcf';

/** What the phone changes on Markus's card; the demo seed has him born 1983-03-14. */
export const DEMO_DRIFT = { birthday: '1983-03-15', email: 'markus@familie-brunner.ch' } as const;

const card = (uid: string, ...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', `UID:${uid}`, ...lines, 'END:VCARD', ''].join('\r\n');

/** File name → vCard, a fresh copy each call. */
function demoCards(): Record<string, string> {
	return {
		[MARKUS]: card(
			'demo-markus',
			'FN:Markus Brunner',
			'N:Brunner;Markus;;;',
			'TEL;TYPE=CELL:+41 79 214 55 03',
			'EMAIL;TYPE=WORK:markus.brunner@schreinerei-brunner.ch'
		),
		'thomas.vcf': card(
			'demo-thomas',
			'FN:Thomas Widmer',
			'N:Widmer;Thomas;;;',
			'TEL;TYPE=CELL:+41 79 330 87 41',
			'BDAY:1984-03-02'
		),
		'petra.vcf': card(
			'demo-petra',
			'FN:Petra Gerber',
			'N:Gerber;Petra;;;',
			'TEL;TYPE=CELL:+41 76 410 22 19',
			'ADR;TYPE=HOME:;;Kramgasse 12;Bern;;3011;Schweiz'
		)
	};
}

/** Stella's written card with the phone's change: its birthday replaced, a home email added. */
function drifted(vcard: string): string {
	return vcard
		.replace(/^BDAY[;:].*\r?\n/gm, '')
		.replace(
			'END:VCARD',
			`BDAY:${DEMO_DRIFT.birthday}\r\nEMAIL;TYPE=HOME:${DEMO_DRIFT.email}\r\nEND:VCARD`
		);
}

export function createDemoAddressBook(): FakeAddressBook {
	const book = createFakeAddressBook(demoCards());
	// Stella's write of Markus's card, until the phone has changed it; after that, never again.
	let written: string | null = null;
	let drifts = true;
	return {
		...book,
		async put(href, vcard, etag) {
			const outcome = await book.put(href, vcard, etag);
			if (drifts && href.endsWith('/' + MARKUS) && typeof outcome !== 'string') written = vcard;
			return outcome;
		},
		async changesSince(since) {
			if (written !== null) {
				book.phone.save(MARKUS, drifted(written));
				written = null;
				drifts = false;
			}
			return book.changesSince(since);
		}
	};
}
