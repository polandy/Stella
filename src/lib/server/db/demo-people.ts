export type Gender = 'male' | 'female';

export interface Person {
	key: string;
	first: string;
	last: string;
	gender: Gender;
	birth?: string; // ISO YYYY-MM-DD
	nickname?: string;
	job?: string;
	company?: string;
	description?: string;
}

/*
 * The cast. Adults born in the early-to-mid 80s, three Brunner kids in school / kindergarten,
 * four grandparents, an uncle's family, two befriended families whose children share the
 * Brunner kids' classes and football team, plus teachers, coaches and neighbours.
 */
export const PEOPLE: readonly Person[] = [
	// ── Core household: the Brunners ──
	{
		key: 'markus',
		first: 'Markus',
		last: 'Brunner',
		gender: 'male',
		birth: '1983-03-14',
		job: 'Bauingenieur',
		company: 'Rytz + Partner AG',
		description: 'Familienvater, Vorstand im FC Länggasse.'
	},
	{
		key: 'sandra',
		first: 'Sandra',
		last: 'Brunner-Keller',
		gender: 'female',
		birth: '1985-07-02',
		job: 'Primarlehrerin',
		company: 'Schule Breitenrain',
		description: 'Singt im Frauenchor Bern.'
	},
	{
		key: 'lena',
		first: 'Lena',
		last: 'Brunner',
		gender: 'female',
		birth: '2015-05-20',
		description: '5. Klasse, spielt Klavier und turnt.'
	},
	{
		key: 'noah',
		first: 'Noah',
		last: 'Brunner',
		gender: 'male',
		birth: '2017-09-08',
		description: '3. Klasse, Torhüter bei den Junioren E.'
	},
	{
		key: 'elias',
		first: 'Elias',
		last: 'Brunner',
		gender: 'male',
		birth: '2020-01-30',
		description: 'Kindergarten Spitalacker.'
	},

	// ── Grandparents ──
	{
		key: 'hans',
		first: 'Hans',
		last: 'Brunner',
		gender: 'male',
		birth: '1955-11-02',
		job: 'pensioniert',
		description: 'Markus’ Vater, ehemaliger Schreiner.'
	},
	{
		key: 'rosa',
		first: 'Rosa',
		last: 'Brunner-Aebi',
		gender: 'female',
		birth: '1957-04-19',
		job: 'pensioniert'
	},
	{
		key: 'peter',
		first: 'Peter',
		last: 'Keller',
		gender: 'male',
		birth: '1954-06-11',
		job: 'pensioniert',
		description: 'Sandras Vater, wohnt in Thun.'
	},
	{
		key: 'ursula',
		first: 'Ursula',
		last: 'Keller-Marti',
		gender: 'female',
		birth: '1956-08-23',
		job: 'pensioniert'
	},

	// ── Uncle's family (Brunner side) ──
	{
		key: 'daniel',
		first: 'Daniel',
		last: 'Brunner',
		gender: 'male',
		birth: '1985-12-01',
		job: 'Informatiker',
		company: 'Swisscom',
		description: 'Markus’ jüngerer Bruder, wohnt in Zürich.'
	},
	{
		key: 'nadia',
		first: 'Nadia',
		last: 'Brunner-Rossi',
		gender: 'female',
		birth: '1987-02-17',
		job: 'Physiotherapeutin'
	},
	{
		key: 'timo',
		first: 'Timo',
		last: 'Brunner',
		gender: 'male',
		birth: '2016-06-25',
		description: 'Cousin von Lena und Noah.'
	},

	// ── Aunt (Keller side) ──
	{
		key: 'corinne',
		first: 'Corinne',
		last: 'Keller',
		gender: 'female',
		birth: '1988-09-30',
		job: 'Grafikerin',
		description: 'Sandras Schwester, Gotti von Elias.'
	},

	// ── Befriended family: the Widmers ──
	{
		key: 'thomas',
		first: 'Thomas',
		last: 'Widmer',
		gender: 'male',
		birth: '1982-04-05',
		job: 'Sekundarlehrer',
		description: 'Guter Freund von Markus, Juniorentrainer beim FC Länggasse.'
	},
	{
		key: 'franziska',
		first: 'Franziska',
		last: 'Widmer',
		gender: 'female',
		birth: '1984-10-12',
		job: 'Pflegefachfrau'
	},
	{
		key: 'mia',
		first: 'Mia',
		last: 'Widmer',
		gender: 'female',
		birth: '2015-03-11',
		description: 'Beste Freundin von Lena, gleiche Klasse.'
	},
	{
		key: 'luca',
		first: 'Luca',
		last: 'Widmer',
		gender: 'male',
		birth: '2017-11-22',
		description: 'Spielt mit Noah in den Junioren E.'
	},

	// ── Befriended family: the Steiners ──
	{
		key: 'beat',
		first: 'Beat',
		last: 'Steiner',
		gender: 'male',
		birth: '1980-01-19',
		job: 'Elektriker',
		description: 'Nachbar und Freund, im Turnverein aktiv.'
	},
	{
		key: 'jan',
		first: 'Jan',
		last: 'Steiner',
		gender: 'male',
		birth: '2017-07-14',
		description: 'Teamkollege von Noah.'
	},

	// ── Friends ──
	{
		key: 'nicole',
		first: 'Nicole',
		last: 'Frei',
		gender: 'female',
		birth: '1986-05-28',
		job: 'Journalistin',
		description: 'Freundin von Sandra aus dem Frauenchor.'
	},

	// ── Teachers & coaches ──
	{
		key: 'vreni',
		first: 'Vreni',
		last: 'Zbinden',
		gender: 'female',
		birth: '1972-02-08',
		job: 'Klassenlehrerin 5b',
		company: 'Schule Breitenrain'
	},
	{
		key: 'reto',
		first: 'Reto',
		last: 'Hofer',
		gender: 'male',
		birth: '1979-09-03',
		job: 'Klassenlehrer 3a',
		company: 'Schule Breitenrain'
	},
	{
		key: 'bettina',
		first: 'Bettina',
		last: 'Roth',
		gender: 'female',
		birth: '1990-12-15',
		job: 'Kindergärtnerin',
		company: 'Kindergarten Spitalacker'
	},

	// ── Neighbours ──
	{
		key: 'kurt',
		first: 'Kurt',
		last: 'Lehmann',
		gender: 'male',
		birth: '1963-03-27',
		job: 'Postbote',
		description: 'Nachbar an der Spitalackerstrasse.'
	},
	{
		key: 'heidi',
		first: 'Heidi',
		last: 'Lehmann',
		gender: 'female',
		birth: '1965-07-09',
		job: 'Coiffeuse'
	}
];

export interface Rel {
	from: string;
	to: string;
	type: string; // relationship_type id (see built-in-types.ts)
	symmetric?: boolean;
}

// Asymmetric links read "from = forward-label side" (e.g. parent_child: from = parent).
export const RELATIONSHIPS: readonly Rel[] = [
	// Parents ↔ children
	{ from: 'markus', to: 'lena', type: 'parent_child' },
	{ from: 'markus', to: 'noah', type: 'parent_child' },
	{ from: 'markus', to: 'elias', type: 'parent_child' },
	{ from: 'sandra', to: 'lena', type: 'parent_child' },
	{ from: 'sandra', to: 'noah', type: 'parent_child' },
	{ from: 'sandra', to: 'elias', type: 'parent_child' },
	// Spouses / partners
	{ from: 'markus', to: 'sandra', type: 'spouse', symmetric: true },
	{ from: 'hans', to: 'rosa', type: 'spouse', symmetric: true },
	{ from: 'peter', to: 'ursula', type: 'spouse', symmetric: true },
	{ from: 'daniel', to: 'nadia', type: 'spouse', symmetric: true },
	{ from: 'thomas', to: 'franziska', type: 'spouse', symmetric: true },
	{ from: 'kurt', to: 'heidi', type: 'spouse', symmetric: true },
	// Siblings among the Brunner kids
	{ from: 'lena', to: 'noah', type: 'sibling', symmetric: true },
	{ from: 'lena', to: 'elias', type: 'sibling', symmetric: true },
	{ from: 'noah', to: 'elias', type: 'sibling', symmetric: true },
	// Grandparents
	{ from: 'hans', to: 'markus', type: 'parent_child' },
	{ from: 'hans', to: 'daniel', type: 'parent_child' },
	{ from: 'rosa', to: 'markus', type: 'parent_child' },
	{ from: 'rosa', to: 'daniel', type: 'parent_child' },
	{ from: 'peter', to: 'sandra', type: 'parent_child' },
	{ from: 'peter', to: 'corinne', type: 'parent_child' },
	{ from: 'ursula', to: 'sandra', type: 'parent_child' },
	{ from: 'ursula', to: 'corinne', type: 'parent_child' },
	{ from: 'hans', to: 'lena', type: 'grandparent_grandchild' },
	{ from: 'hans', to: 'noah', type: 'grandparent_grandchild' },
	{ from: 'hans', to: 'elias', type: 'grandparent_grandchild' },
	{ from: 'rosa', to: 'lena', type: 'grandparent_grandchild' },
	{ from: 'rosa', to: 'noah', type: 'grandparent_grandchild' },
	{ from: 'rosa', to: 'elias', type: 'grandparent_grandchild' },
	{ from: 'peter', to: 'lena', type: 'grandparent_grandchild' },
	{ from: 'peter', to: 'noah', type: 'grandparent_grandchild' },
	{ from: 'ursula', to: 'elias', type: 'grandparent_grandchild' },
	// Uncle / aunt / cousin
	{ from: 'markus', to: 'daniel', type: 'sibling', symmetric: true },
	{ from: 'sandra', to: 'corinne', type: 'sibling', symmetric: true },
	{ from: 'daniel', to: 'timo', type: 'parent_child' },
	{ from: 'nadia', to: 'timo', type: 'parent_child' },
	{ from: 'hans', to: 'timo', type: 'grandparent_grandchild' },
	{ from: 'rosa', to: 'timo', type: 'grandparent_grandchild' },
	// Friendships between the adults
	{ from: 'markus', to: 'thomas', type: 'friend', symmetric: true },
	{ from: 'markus', to: 'beat', type: 'friend', symmetric: true },
	{ from: 'sandra', to: 'franziska', type: 'friend', symmetric: true },
	{ from: 'sandra', to: 'nicole', type: 'friend', symmetric: true },
	// The Widmer kids
	{ from: 'thomas', to: 'mia', type: 'parent_child' },
	{ from: 'thomas', to: 'luca', type: 'parent_child' },
	{ from: 'franziska', to: 'mia', type: 'parent_child' },
	{ from: 'franziska', to: 'luca', type: 'parent_child' },
	{ from: 'mia', to: 'luca', type: 'sibling', symmetric: true },
	{ from: 'beat', to: 'jan', type: 'parent_child' },
	// Friendships between the children
	{ from: 'lena', to: 'mia', type: 'friend', symmetric: true },
	{ from: 'noah', to: 'luca', type: 'friend', symmetric: true },
	{ from: 'noah', to: 'jan', type: 'friend', symmetric: true },
	// Professional
	{ from: 'sandra', to: 'vreni', type: 'colleague', symmetric: true },
	{ from: 'sandra', to: 'reto', type: 'colleague', symmetric: true },
	// Neighbours
	{ from: 'markus', to: 'kurt', type: 'neighbor', symmetric: true },
	{ from: 'sandra', to: 'heidi', type: 'neighbor', symmetric: true },
	{ from: 'beat', to: 'kurt', type: 'neighbor', symmetric: true }
];

export type CircleKind =
	| 'friends'
	| 'family'
	| 'school'
	| 'class'
	| 'course'
	| 'club'
	| 'team'
	| 'work'
	| 'neighborhood'
	| 'other';

export interface Circle {
	key: string;
	name: string;
	kind: CircleKind;
	color: string;
	parent?: string;
	description?: string;
	start?: string;
}

export const CIRCLES: readonly Circle[] = [
	{
		key: 'schule',
		name: 'Schule Breitenrain',
		kind: 'school',
		color: 'blue',
		description: 'Primarschule im Breitenrain-Quartier, Bern.'
	},
	{
		key: 'klasse5b',
		name: 'Klasse 5b',
		kind: 'class',
		color: 'sky',
		parent: 'schule',
		start: '2024-08-19'
	},
	{
		key: 'klasse3a',
		name: 'Klasse 3a',
		kind: 'class',
		color: 'teal',
		parent: 'schule',
		start: '2024-08-19'
	},
	{
		key: 'kindergarten',
		name: 'Kindergarten Spitalacker',
		kind: 'school',
		color: 'green',
		start: '2025-08-18'
	},
	{
		key: 'fc',
		name: 'FC Länggasse Bern',
		kind: 'club',
		color: 'red',
		description: 'Quartier-Fussballverein.'
	},
	{
		key: 'fcJunioren',
		name: 'FC Länggasse — Junioren E',
		kind: 'team',
		color: 'peach',
		parent: 'fc',
		start: '2025-08-01'
	},
	{
		key: 'turnverein',
		name: 'Turnverein Länggasse',
		kind: 'club',
		color: 'yellow',
		description: 'Kinder- und Erwachsenenriege.'
	},
	{
		key: 'musikschule',
		name: 'Musikschule Konservatorium Bern',
		kind: 'course',
		color: 'mauve',
		description: 'Klavierunterricht.'
	},
	{ key: 'chor', name: 'Frauenchor Bern', kind: 'club', color: 'pink' },
	{
		key: 'freunde',
		name: 'Familien-Freunde',
		kind: 'friends',
		color: 'lavender',
		description: 'Befreundete Familien Widmer und Steiner.'
	},
	{ key: 'nachbarn', name: 'Nachbarschaft Spitalacker', kind: 'neighborhood', color: 'green' }
];

export interface Membership {
	circle: string;
	person: string;
	role?: string;
	start?: string;
}

export const MEMBERSHIPS: readonly Membership[] = [
	// Schule / Klassen
	{ circle: 'schule', person: 'sandra', role: 'Lehrerin' },
	{ circle: 'klasse5b', person: 'lena', role: 'Schülerin', start: '2024-08-19' },
	{ circle: 'klasse5b', person: 'mia', role: 'Schülerin', start: '2024-08-19' },
	{ circle: 'klasse5b', person: 'vreni', role: 'Klassenlehrerin' },
	{ circle: 'klasse3a', person: 'noah', role: 'Schüler', start: '2024-08-19' },
	{ circle: 'klasse3a', person: 'luca', role: 'Schüler', start: '2024-08-19' },
	{ circle: 'klasse3a', person: 'jan', role: 'Schüler', start: '2024-08-19' },
	{ circle: 'klasse3a', person: 'reto', role: 'Klassenlehrer' },
	{ circle: 'kindergarten', person: 'elias', role: 'Kind', start: '2025-08-18' },
	{ circle: 'kindergarten', person: 'bettina', role: 'Kindergärtnerin' },
	// FC Länggasse
	{ circle: 'fc', person: 'markus', role: 'Vorstand' },
	{ circle: 'fc', person: 'thomas', role: 'Juniorentrainer' },
	{ circle: 'fcJunioren', person: 'noah', role: 'Torhüter', start: '2025-08-01' },
	{ circle: 'fcJunioren', person: 'luca', role: 'Stürmer', start: '2025-08-01' },
	{ circle: 'fcJunioren', person: 'jan', role: 'Verteidiger', start: '2025-08-01' },
	{ circle: 'fcJunioren', person: 'thomas', role: 'Trainer' },
	// Turnverein
	{ circle: 'turnverein', person: 'lena', role: 'Kinderriege' },
	{ circle: 'turnverein', person: 'sandra', role: 'Aktive' },
	{ circle: 'turnverein', person: 'franziska', role: 'Aktive' },
	{ circle: 'turnverein', person: 'beat', role: 'Leiter' },
	// Musikschule
	{ circle: 'musikschule', person: 'lena', role: 'Klavierschülerin', start: '2023-09-01' },
	// Chor
	{ circle: 'chor', person: 'sandra' },
	{ circle: 'chor', person: 'nicole' },
	{ circle: 'chor', person: 'franziska' },
	// Freunde
	{ circle: 'freunde', person: 'thomas' },
	{ circle: 'freunde', person: 'franziska' },
	{ circle: 'freunde', person: 'beat' },
	{ circle: 'freunde', person: 'nicole' },
	{ circle: 'freunde', person: 'markus' },
	{ circle: 'freunde', person: 'sandra' },
	// Nachbarn
	{ circle: 'nachbarn', person: 'kurt' },
	{ circle: 'nachbarn', person: 'heidi' },
	{ circle: 'nachbarn', person: 'markus' },
	{ circle: 'nachbarn', person: 'sandra' },
	{ circle: 'nachbarn', person: 'beat' }
];
