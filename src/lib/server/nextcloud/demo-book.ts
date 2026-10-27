/*
 * The demo household's Nextcloud address book (`NEXTCLOUD_DEMO=true`): a few cards as a family's
 * phones would hold them, so the link has something to sync. Markus's and Thomas's cards share a
 * phone with the people the demo seed creates and say a little more, so the review offers a
 * match; Petra is nobody in Stella yet.
 */

const card = (uid: string, ...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', `UID:${uid}`, ...lines, 'END:VCARD', ''].join('\r\n');

/** File name → vCard, a fresh copy each call. */
export function demoAddressBook(): Record<string, string> {
	return {
		'markus.vcf': card(
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
