/* When an idea is for: the picker, its preview and the row chip (docs/dev/02 §2.25.8). */

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
function ordinal(n: number): string {
	const suffix = new Intl.PluralRules('en', { type: 'ordinal' }).select(n);
	return `${n}${{ one: 'st', two: 'nd', few: 'rd' }[suffix as 'one' | 'two' | 'few'] ?? 'th'}`;
}

export const when = {
	'when.label': 'When?',
	'when.kind.now': 'Now',
	'when.kind.from_age': 'From age',
	'when.kind.at_age': 'For a birthday',
	'when.kind.christmas_at_age': 'Christmas at age',
	'when.kind.on_date': 'On a day',
	'when.kind.in_month': 'In a month',
	'when.kind.later': 'Later',
	'when.kind.anytime': 'Some time',
	'when.age': 'Age',
	'when.older': 'One year older',
	'when.younger': 'One year younger',
	'when.day': 'Day',
	'when.month': 'Month',
	'when.saturday': 'Saturday',
	'when.birthday': 'Birthday',
	'when.christmas': (p: { year: string }) => `Christmas ${p.year}`,
	'when.needsYear': 'An age needs their birth year.',
	'when.estimate': 'Estimate age',

	'when.chip.fromAge': (p: { age: number }) => `From age ${p.age}`,
	'when.chip.atAge': (p: { age: number }) => `For the ${ordinal(p.age)} birthday`,
	'when.chip.christmasAtAge': (p: { age: number }) => `Christmas at ${p.age}`,
	'when.chip.onDay': (p: { day: string }) => `For ${p.day}`,
	'when.chip.inMonth': (p: { month: string }) => `In ${p.month}`,
	'when.chip.about': (p: { year: string }) => `about ${p.year}`,
	'when.chip.tomorrow': 'tomorrow',
	'when.chip.today': 'today',
	'when.chip.passed': 'passed',

	'when.preview.now': 'Shows among the ideas now.',
	'when.preview.later': 'Waits under Later. Once a year it asks whether it is still current.',
	'when.preview.ageReached': (p: { age: number }) =>
		`Already ${p.age}, so it shows among the ideas now.`,
	'when.preview.turns': (p: { age: number; day: string }) => `Turns ${p.age} on ${p.day}.`,
	'when.preview.turnsAbout': (p: { age: number; year: string }) =>
		`Turns ${p.age} in about ${p.year}.`,
	'when.preview.christmas': (p: { age: number; year: string }) =>
		`Christmas ${p.year}, at age ${p.age}.`,
	'when.preview.christmasAbout': (p: { age: number; year: string }) =>
		`About Christmas ${p.year}, at age ${p.age}.`,
	'when.preview.onDay': (p: { day: string }) => `Due ${p.day}.`,
	'when.preview.inMonth': (p: { month: string }) => `In ${p.month}.`,
	'when.preview.waits': (p: { day: string }) =>
		`It waits until ${p.day}, then shows among the ideas.`,
	'when.preview.open': 'It shows among the ideas now.',

	'when.ask.passed': 'The occasion has passed. Still current?',
	'when.ask.review': 'Noted for later. Still current?',
	'when.ask.group': (p: { title: string }) => `Is “${p.title}” still current?`,
	'when.ask.keep': 'Keep as idea',
	'when.ask.move': 'New time',

	'when.fold': (p: { count: number }) => `Later · ${p.count}`,
	'when.allWaiting': 'Nothing due yet. The ideas for later wait below.'
};

/** The key set every translation of this area has to provide. */
export type WhenMessages = typeof when;
