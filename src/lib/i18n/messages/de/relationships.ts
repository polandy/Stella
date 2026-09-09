import type { RelationshipsMessages } from '../en/relationships';

/** German for `messages/en/relationships.ts`. */
export const relationships: RelationshipsMessages = {
	'relationshipTypes.title': 'Beziehungsarten',
	'relationshipTypes.intro':
		'Die Arten von Verbindungen, die dein Haushalt festhalten kann. Lege eigene an, wo die mitgelieferten es nicht treffen — Patin, Chorkollege, Vermieterin.',
	'relationshipTypes.own': 'Eigene',
	'relationshipTypes.addType': 'Art hinzufügen',
	'relationshipTypes.otherSide': (p) => `von der anderen Seite: ${p.label}`,
	'relationshipTypes.remove': (p) => `Die Art ${p.label} entfernen`,
	'relationshipTypes.removed': 'Beziehungsart entfernt',
	'relationshipTypes.used': (p) => `${p.count}× verwendet`,
	'relationshipTypes.label': 'Bezeichnung',
	'relationshipTypes.category': 'Kategorie',
	'relationshipTypes.fromOtherSide': 'Von der anderen Seite',
	'relationshipTypes.none': 'Noch keine eigenen Arten.',
	'relationshipTypes.labelPlaceholder': 'Patenelternteil von',
	'relationshipTypes.reversePlaceholder': 'Patenkind von',
	'relationshipTypes.symmetric': 'Liest sich von beiden Seiten gleich',
	'relationshipTypes.builtIn': 'Mitgeliefert',
	'relationshipTypes.builtInHint':
		'Diese bringt Stella mit und sie sind überall gleich — damit die Verwandtschaft, die Stella herleitet (Großeltern, Cousinen, Schwiegerfamilie), immer dasselbe bedeutet.',

	'relationships.category.family': 'Familie',
	'relationships.category.romantic': 'Liebe',
	'relationships.category.social': 'Sozial',
	'relationships.category.professional': 'Beruflich',
	'relationships.category.other': 'Sonstiges',

	'relationships.status.current': 'aktuell',
	'relationships.status.former': 'ehemalig',
	'relationships.status.notSaid': 'Nicht gesagt',

	'relationships.type.parent_child.forward': 'Elternteil von',
	'relationships.type.parent_child.reverse': 'Kind von',
	'relationships.type.grandparent_grandchild.forward': 'Großelternteil von',
	'relationships.type.grandparent_grandchild.reverse': 'Enkelkind von',
	'relationships.type.sibling.forward': 'Geschwister von',
	'relationships.type.sibling.reverse': 'Geschwister von',
	'relationships.type.partner.forward': 'Partner von',
	'relationships.type.partner.reverse': 'Partner von',
	'relationships.type.spouse.forward': 'Ehepartner von',
	'relationships.type.spouse.reverse': 'Ehepartner von',
	'relationships.type.friend.forward': 'Freund von',
	'relationships.type.friend.reverse': 'Freund von',
	'relationships.type.colleague.forward': 'Kollege von',
	'relationships.type.colleague.reverse': 'Kollege von',
	'relationships.type.mentor_mentee.forward': 'Mentor von',
	'relationships.type.mentor_mentee.reverse': 'Mentee von',
	'relationships.type.neighbor.forward': 'Nachbar von',
	'relationships.type.neighbor.reverse': 'Nachbar von',
	'relationships.type.acquaintance.forward': 'Bekannter von',
	'relationships.type.acquaintance.reverse': 'Bekannte von',
	'relationships.type.knows.forward': 'Kennt',
	'relationships.type.knows.reverse': 'Kennt',
	'relationships.type.other.forward': 'Verbunden mit',
	'relationships.type.other.reverse': 'Verbunden mit'
};
