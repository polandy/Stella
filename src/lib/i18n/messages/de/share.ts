import type { ShareMessages } from '../en/share';

/** German for `messages/en/share.ts`. */
export const share: ShareMessages = {
	'share.title': 'In Stella teilen',
	'share.close': 'Schließen, ohne zu speichern',
	'share.offline':
		'Stella ist gerade nicht erreichbar. Was du speicherst, bleibt auf dem Handy und geht raus, sobald sie wieder da ist.',
	'share.shared': 'Was geteilt wurde',
	'share.photo': (p) => `Geteiltes Foto ${p.n}`,
	'share.photoCount': (p) => (p.count === 1 ? '1 Foto' : `${p.count} Fotos`),
	'share.photosDropped': (p) =>
		`Nur die ersten ${p.max} werden übernommen, ${p.dropped} bleiben weg.`,
	'share.photosLeftBehind':
		'Die Fotos sind nicht mitgekommen. Teile sie nochmal, sobald Stella auf diesem Handy als App installiert ist.',
	'share.gone':
		'Das wurde schon gespeichert oder ist abgelaufen. Teile es nochmal aus der anderen App.',
	'share.nothing': 'Es kam nichts mit, das Stella speichern könnte.',
	'share.who': 'Über wen?',
	'share.search': 'Person suchen',
	'share.searchPlaceholder': 'Name suchen',
	'share.recent': 'Zuletzt angesehen',
	'share.noMatch': 'Niemand mit diesem Namen.',
	'share.as': 'Als',
	'share.target.gallery': 'Zu den Fotos',
	'share.target.galleryHint': (p) =>
		p.count === 1 ? 'Ohne Standortdaten' : `Alle ${p.count} Fotos, ohne Standortdaten`,
	'share.target.avatar': 'Als Profilbild',
	'share.target.avatarHint': 'Ersetzt das jetzige',
	'share.target.moment': 'Moment',
	'share.target.momentHint': 'Der Link landet im Text',
	'share.target.gift': 'Geschenkidee',
	'share.target.giftHint': 'Mit dem Link als Link der Idee',
	'share.target.todo': 'Todo',
	'share.target.todoHint': 'Etwas, das zu tun ist',
	'share.blocked.severalPhotos': 'Nur bei einem einzelnen Foto',
	'share.blocked.offline': 'Braucht Verbindung',
	'share.moment.label': (p) => `Was war? Heute, über ${p.name}`,
	'share.gift.title': 'Idee',
	'share.gift.link': 'Link',
	'share.todo.label': 'Was ist zu tun?',
	'share.todo.linkAdded': 'Der Link wird ans Ende angehängt.',
	'share.avatar.hint': 'Danach wählst du den Ausschnitt, wie beim Profilbild sonst auch.',
	'share.needsPerson': 'Wähle erst, über wen es ist.',
	'share.save': 'Speichern',
	'share.saveForLater': 'Für später speichern',
	'share.saving': 'Speichert …',
	'share.failed': 'Das hat nicht geklappt. Versuch es nochmal.',
	'share.saved.gallery': (p) => (p.count === 1 ? 'Foto gespeichert' : 'Fotos gespeichert'),
	'share.saved.avatar': 'Profilbild gesetzt',
	'share.saved.moment': 'Moment gespeichert',
	'share.saved.gift': 'Geschenkidee gespeichert',
	'share.saved.todo': 'Todo gespeichert',
	'share.keptForLater': 'Für später gespeichert'
};
