/* Das verknüpfte Nextcloud-Adressbuch des Haushalts: sein Bereich und seine Abweichungen (docs/02 §2.16.3). */

export const nextcloud = {
	'nextcloud.error.notLinked': 'Mit Stella ist kein Nextcloud-Adressbuch verknüpft.',
	'nextcloud.error.unreachable':
		'Das Nextcloud-Adressbuch war nicht erreichbar. Nichts wurde geändert – versuch es später noch einmal.',
	'nextcloud.panel.title': 'Nextcloud-Adressbuch',
	'nextcloud.panel.intro':
		'Stella und das Adressbuch des Haushalts halten sich gegenseitig auf dem Laufenden: Namen, Telefonnummern, E-Mails, Adressen, Geburtstage und Fotos. Private Personen verlassen Stella nie.',
	'nextcloud.panel.syncedAt': (p: { when: string }) => `Zuletzt abgeglichen ${p.when}.`,
	'nextcloud.panel.never': 'Noch nicht abgeglichen.',
	'nextcloud.panel.failing': 'Beim letzten Versuch war Nextcloud nicht erreichbar.',
	'nextcloud.panel.syncNow': 'Jetzt abgleichen',
	'nextcloud.panel.synced': (p: { written: number; updated: number; unlinked: number }) =>
		`Abgeglichen: ${p.written} nach Nextcloud geschrieben, ${p.updated} in Stella ergänzt, ${p.unlinked} entknüpft.`,
	'nextcloud.panel.newCards': (p: { count: number }) =>
		p.count === 1 ? '1 neue Karte zu prüfen' : `${p.count} neue Karten zu prüfen`,
	'nextcloud.panel.review': 'Prüfen',
	'nextcloud.panel.conflicts': (p: { count: number }) =>
		p.count === 1
			? '1 Abweichung wartet auf eine Antwort'
			: `${p.count} Abweichungen warten auf eine Antwort`,
	'nextcloud.conflicts.pageTitle': 'Nextcloud-Abweichungen · Stella',
	'nextcloud.conflicts.title': 'Nextcloud-Abweichungen',
	'nextcloud.conflicts.blurb': 'Wo eine verknüpfte Karte und Stella sich widersprechen.',
	'nextcloud.conflicts.intro':
		'Ein Abgleich hat eine verknüpfte Karte gefunden, die etwas anderes sagt als Stella. Bis du antwortest, behält Stella ihre Seite und lässt die Karte dieser Person, wie sie ist.',
	'nextcloud.conflicts.empty.title': 'Nichts zu beantworten',
	'nextcloud.conflicts.empty.hint': 'Jede verknüpfte Karte stimmt mit Stella überein.',
	'nextcloud.conflicts.photo': 'Foto weicht ab',
	'nextcloud.conflicts.noPhoto': 'kein Foto',
	'nextcloud.conflicts.keepStella': 'Stellas behalten',
	'nextcloud.conflicts.takeCard': 'Die der Karte nehmen',
	'nextcloud.conflicts.gone': 'Diese Abweichung wartet nicht mehr.'
};
