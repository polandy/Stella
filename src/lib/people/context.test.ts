import { describe, expect, it } from 'bun:test';
import { rankContext, type MembershipCandidate, type TieCandidate } from './context';

/* docs/02 §2.2.3 — which relationship and which circle a namesake's second line may name. */

const TODAY = '2026-09-29';

const tie = (otherName: string, extra: Partial<TieCandidate> = {}): TieCandidate => ({
	typeKey: 'friend',
	side: 'forward',
	label: 'Friend of',
	otherId: otherName.toLowerCase(),
	otherName,
	otherIsViewer: false,
	category: 'social',
	sortOrder: 50,
	status: 'current',
	createdAt: 1,
	...extra
});

const membership = (name: string, extra: Partial<MembershipCandidate> = {}): MembershipCandidate => ({
	circleId: name.toLowerCase(),
	parentCircleId: null,
	name,
	role: null,
	startDate: null,
	endDate: null,
	...extra
});

const namesOf = (ties: readonly { otherName: string }[] | undefined) => ties?.map((t) => t.otherName);

describe('rankContext', () => {
	it('has nothing to say without a current link or a current circle', () => {
		expect(rankContext([], [], TODAY)).toBeNull();
		expect(
			rankContext([tie('Urs', { status: 'former' })], [membership('Chor', { endDate: '2025-06-30' })], TODAY)
		).toBeNull();
	});

	it('puts family first, then the type order, then the oldest link', () => {
		const context = rankContext(
			[
				tie('Reto', { category: 'professional', sortOrder: 10 }),
				tie('Nora', { category: 'social', sortOrder: 40, createdAt: 5 }),
				tie('Lea', { category: 'social', sortOrder: 40, createdAt: 2 }),
				tie('Sabine', { category: 'family', sortOrder: 30 }),
				tie('Hans', { category: 'social', sortOrder: 20 })
			],
			[],
			TODAY
		);
		expect(namesOf(context?.ties)).toEqual(['Sabine', 'Hans', 'Lea']);
	});

	it('leaves a former link out, whatever its category', () => {
		const context = rankContext(
			[tie('Urs', { category: 'family', status: 'former' }), tie('Reto', { category: 'professional' })],
			[],
			TODAY
		);
		expect(namesOf(context?.ties)).toEqual(['Reto']);
	});

	it('names the most specific circle, one with a role before one without', () => {
		const context = rankContext(
			[],
			[
				membership('School Muri', { circleId: 'school', role: 'Parent' }),
				membership('Class 9a', { parentCircleId: 'school' }),
				membership('Turnverein', { role: 'Coach' })
			],
			TODAY
		);
		expect(context?.circle).toEqual({ name: 'Turnverein', role: 'Coach' });
	});

	it('takes the latest start among equals, then the name', () => {
		const context = rankContext(
			[],
			[
				membership('Chor', { startDate: '2019-01-01' }),
				membership('Turnverein', { startDate: '2024' }),
				membership('Alpenclub', { startDate: '2024' })
			],
			TODAY
		);
		expect(context?.circle).toEqual({ name: 'Alpenclub', role: null });
	});

	it('counts a membership as current until its end date has passed, however partial the date', () => {
		const ended = (endDate: string) => rankContext([], [membership('Chor', { endDate })], TODAY);
		expect(ended('2026')).not.toBeNull();
		expect(ended('2026-09')).not.toBeNull();
		expect(ended('2026-09-29')).not.toBeNull();
		expect(ended('2026-09-28')).toBeNull();
		expect(ended('2025')).toBeNull();
	});
});
