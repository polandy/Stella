import { describe, expect, it } from 'bun:test';
import { segmentsOf, textOf } from '$lib/i18n/linked';
import {
	homesShown,
	livesWithSentence,
	movingOutKey,
	shareableAddresses,
	sharingCandidates
} from './home';

describe('livesWithSentence', () => {
	const list = (names: string[]) =>
		new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
	const say = (names: string) => `lives with ${names}`;

	it('joins however many housemates the language’s way, each a link', () => {
		const sentence = livesWithSentence(
			[
				{ id: 'anna', displayName: 'Anna' },
				{ id: 'peter', displayName: 'Peter Brunner' },
				{ id: 'ruth', displayName: 'Ruth' }
			],
			list,
			say
		);

		expect(textOf(sentence)).toBe('lives with Anna, Peter Brunner, and Ruth');
		expect(segmentsOf(sentence)).toEqual([
			{ text: 'lives with ' },
			{ person: { id: 'anna', name: 'Anna' } },
			{ text: ', ' },
			{ person: { id: 'peter', name: 'Peter Brunner' } },
			{ text: ', and ' },
			{ person: { id: 'ruth', name: 'Ruth' } }
		]);
	});
});

describe('shareableAddresses', () => {
	it('offers own addresses, then homes, each on one line', () => {
		expect(
			shareableAddresses(
				[
					{ id: 'f-1', kind: 'address', label: 'Work', value: 'Seeweg 9\n 8800 Thalwil ' },
					{ id: 'f-2', kind: 'phone', label: null, value: '044' }
				],
				[{ id: 'h-1', label: null, value: 'Lindenweg 4' }]
			)
		).toEqual([
			{ key: 'field:f-1', label: 'Work', line: 'Seeweg 9, 8800 Thalwil' },
			{ key: 'home:h-1', label: null, line: 'Lindenweg 4' }
		]);
	});
});

describe('sharingCandidates', () => {
	const people = ['tim', 'ruth', 'anna', 'peter', 'max'].map((id) => ({ id }));

	it('puts current family and partners first, leaves out the excluded', () => {
		const ties = [
			{ otherContactId: 'peter', category: 'family' as const, status: 'current' as const },
			{ otherContactId: 'max', category: 'romantic' as const, status: 'former' as const },
			{ otherContactId: 'ruth', category: 'social' as const, status: 'current' as const },
			{ otherContactId: 'anna', category: 'romantic' as const, status: 'current' as const }
		];

		expect(sharingCandidates(people, ties, ['tim']).map((p) => p.id)).toEqual([
			'anna',
			'peter',
			'ruth',
			'max'
		]);
	});
});

describe('homesShown', () => {
	const homes = [
		{
			id: 'h-1',
			livesWith: [
				{ id: 'anna', displayName: 'Anna' },
				{ id: 'peter', displayName: 'Peter' }
			]
		},
		{ id: 'h-2', livesWith: [] }
	];

	it('hides a home being moved out of, and a housemate moving out', () => {
		const pending = new Set([movingOutKey('h-2', 'tim'), movingOutKey('h-1', 'peter')]);

		expect(homesShown(homes, 'tim', (key) => pending.has(key))).toEqual([
			{ id: 'h-1', livesWith: [{ id: 'anna', displayName: 'Anna' }] }
		]);
	});
});
