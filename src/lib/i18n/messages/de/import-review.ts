import type { ImportReviewMessages } from '../en/import-review';

/** German for `messages/en/import-review.ts`. */

const kontakte = (n: number) => (n === 1 ? '1 Kontakt' : `${n} Kontakte`);

export const importReview: ImportReviewMessages = {
	'import.step.review': 'abgleich',
	'import.reviewContacts': 'Kontakte abgleichen',

	'import.review.title': 'Wer ist wer?',
	'import.review.summary': (p) =>
		`${kontakte(p.total)} in ${p.source}.` +
		(p.settled === 0
			? ''
			: p.settled === 1
				? ' 1 ist schon mit seiner Person verknüpft und seither unverändert, er wird nicht gezeigt.'
				: ` ${p.settled} sind schon mit ihren Personen verknüpft und seither unverändert, sie werden nicht gezeigt.`),
	'import.review.nothingToAsk': 'Nichts zu fragen: Jeder Kontakt dieser Datei hat seine Antwort.',
	'import.review.count.linked': 'seither geändert',
	'import.review.count.strong': 'gleiche E-Mail oder Nummer',
	'import.review.count.weak': 'nur gleicher Name',
	'import.review.count.several': 'mehrere Personen',
	'import.review.count.none': 'noch niemand',
	'import.review.confirmSure': (p) =>
		p.count === 1
			? 'Den sicheren Treffer bestätigen'
			: `Alle ${p.count} sicheren Treffer bestätigen`,
	'import.review.skipRest': 'Restliche überspringen',
	'import.review.skippedBefore': (p) =>
		p.count === 1
			? '1 Kontakt wurde früher übersprungen und bleibt es.'
			: `${p.count} Kontakte wurden früher übersprungen und bleiben es.`,
	'import.review.linkPhotos': (p) =>
		p.count === 1
			? '1 Foto ist in diesem Export nur ein Link und wird nicht importiert.'
			: `${p.count} Fotos sind in diesem Export nur Links und werden nicht importiert.`,

	'import.review.kind.linked': 'Geändert',
	'import.review.kind.strong': 'Sicherer Treffer',
	'import.review.kind.weak': 'Nur der Name',
	'import.review.kind.several': 'Mehrere Personen',
	'import.review.kind.none': 'Neu',
	'import.review.why.email': (p) => `gleiche E-Mail ${p.value}`,
	'import.review.why.phone': (p) => `gleiche Nummer ${p.value}`,
	'import.review.why.phoneAlike': (p) => `fast gleiche Nummer ${p.value}`,
	'import.review.why.name': 'gleicher Name, sonst stimmt nichts überein',
	'import.review.why.several': (p) => `${p.count} Personen kommen infrage`,
	'import.review.why.none': 'niemand in Stella hat diesen Namen, diese E-Mail oder Nummer',
	'import.review.why.linked':
		'früher mit dieser Person verknüpft; die Karte hat sich seither geändert',

	'import.review.from.google': 'Von Google',
	'import.review.from.nextcloud': 'Von Nextcloud',
	'import.review.from.other': 'Aus der Datei',
	'import.review.inStella': 'In Stella',
	'import.review.pickOne': 'Wer ist es?',
	'import.review.wouldAdd': 'Käme dazu',
	'import.review.nothingNew': 'Nichts Neues hinzuzufügen.',
	'import.review.kept': (p) => `Nicht übernommen: ${p.list}`,
	'import.review.conflict.firstName': 'Vorname weicht ab',
	'import.review.conflict.lastName': 'Nachname weicht ab',
	'import.review.conflict.birthday': 'Geburtstag weicht ab',
	'import.review.keepStella': 'Stellas behalten',
	'import.review.takeCard': 'Den der Karte nehmen',
	'import.review.nobody': 'Niemand in Stella hat diesen Namen, diese E-Mail oder Nummer.',
	'import.review.newWill': 'Kommt als neue Person mit allem von der Karte.',
	'import.review.born': (p) => `geboren ${p.date}`,

	'import.review.answer.same': 'Dieselbe Person',
	'import.review.answer.other': 'Jemand anderen wählen',
	'import.review.answer.new': 'Neue Person',
	'import.review.answer.skip': 'Überspringen',
	'import.review.answered.new': 'Neue Person',
	'import.review.answered.skip': 'Übersprungen',
	'import.review.change': 'Ändern',
	'import.review.search': 'Person suchen',
	'import.review.searchHint': 'Mindestens zwei Buchstaben eines Namens eingeben.',
	'import.review.searchNone': 'Niemand mit diesem Namen.',

	'import.review.fact.email': 'E-Mail',
	'import.review.fact.phone': 'Telefon',
	'import.review.fact.address': 'Adresse',
	'import.review.fact.url': 'Website',
	'import.review.fact.birthday': 'Geburtstag',
	'import.review.fact.lastName': 'Nachname',
	'import.review.fact.company': 'Arbeitet bei',
	'import.review.fact.jobTitle': 'Beruf',
	'import.review.fact.nickname': 'Spitzname',
	'import.review.fact.tag': 'Schlagwörter',
	'import.review.fact.photo': 'Foto',
	'import.review.photo.inline': 'Bild auf der Karte',
	'import.review.photo.link': 'nur ein Link, wird nicht importiert',

	'import.review.left': (p) =>
		p.count === 0 ? 'Jeder Kontakt hat eine Antwort.' : `${p.count} ohne Antwort`,
	'import.review.import': (p) =>
		p.count === 1 ? '1 Antwort importieren' : `${p.count} Antworten importieren`,
	'import.review.done': (p) =>
		`${p.completed} ergänzt, ${p.added} neu, ${p.skipped} übersprungen. Ein erneuter Import dieser Datei fragt nur nach Neuem oder Geändertem.`,

	'import.skipped.title': 'Übersprungene Kontakte',
	'import.skipped.intro':
		'Ein beim Abgleich übersprungener Kontakt wird nicht wieder gefragt, auch wenn er sich ändert.',
	'import.skipped.askAgain': 'Erneut fragen',
	'import.skipped.askAgainLabel': (p) => `Erneut fragen nach ${p.name}`,
	'import.skipped.gone': 'Dieser Kontakt ist nicht mehr übersprungen.'
};
