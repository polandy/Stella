import { describe, expect, it } from 'bun:test';
import { asTyped, newPeopleAsCandidates, shiftPicks, toEditable, toStored, type MentionPick } from './picks';

/*
 * Remembering which person a picked `@Handle` stands for (docs/02 §2.20.1). The field shows
 * `@Thomas`; the pick carries the id, so two people called Thomas stay two people. A pick lives
 * on a range of the text and must follow it through edits — or let go once the name changes.
 */

const thomasHut: MentionPick = { start: 5, end: 12, id: 'thomas-hut' };

describe('shiftPicks', () => {
	it('moves a pick along when text is typed before it', () => {
		expect(shiftPicks('with @Thomas', 'Out with @Thomas', [thomasHut])).toEqual([
			{ start: 9, end: 16, id: 'thomas-hut' }
		]);
	});

	it('moves a pick back when text before it is deleted', () => {
		expect(shiftPicks('with @Thomas', 'h @Thomas', [thomasHut])).toEqual([
			{ start: 2, end: 9, id: 'thomas-hut' }
		]);
	});

	it('keeps a pick in place when text is typed after it', () => {
		expect(shiftPicks('with @Thomas', 'with @Thomas and Lena', [thomasHut])).toEqual([thomasHut]);
	});

	it('lets a pick go once its name is changed', () => {
		expect(shiftPicks('with @Thomas', 'with @Tomas', [thomasHut])).toEqual([]);
	});

	it('lets a pick go when a letter is typed straight after it, which makes it another name', () => {
		expect(shiftPicks('with @Thomas', 'with @Thomasina', [thomasHut])).toEqual([]);
	});

	it('keeps a pick when a space or punctuation follows it', () => {
		expect(shiftPicks('with @Thomas', 'with @Thomas.', [thomasHut])).toEqual([thomasHut]);
	});

	it('keeps each of two picks of the same name apart', () => {
		const picks: MentionPick[] = [
			{ start: 0, end: 7, id: 'thomas-hut' },
			{ start: 12, end: 19, id: 'thomas-lenk' }
		];
		expect(shiftPicks('@Thomas and @Thomas', 'Hi @Thomas and @Thomas', picks)).toEqual([
			{ start: 3, end: 10, id: 'thomas-hut' },
			{ start: 15, end: 22, id: 'thomas-lenk' }
		]);
	});
});

describe('toStored', () => {
	it('writes a picked handle as the id token of the person picked', () => {
		const picks: MentionPick[] = [
			{ start: 0, end: 7, id: 'thomas-hut' },
			{ start: 12, end: 19, id: 'thomas-lenk' }
		];
		expect(toStored('@Thomas and @Thomas hiked', picks)).toBe(
			'@{contact:thomas-hut} and @{contact:thomas-lenk} hiked'
		);
	});

	it('leaves a handle nobody picked for the server to look up by name', () => {
		expect(toStored('with @Thomas and @Lena', [{ start: 17, end: 22, id: 'lena' }])).toBe(
			'with @Thomas and @{contact:lena}'
		);
	});

	it('ignores a pick whose range no longer holds a handle', () => {
		expect(toStored('with Thomas', [thomasHut])).toBe('with Thomas');
	});
});

describe('toEditable', () => {
	const names: Record<string, string> = { 'thomas-hut': '@Thomas', 'thomas-lenk': '@Thomas' };
	const handleOf = (id: string) => names[id] ?? null;

	it('shows each token as its handle and remembers whose it is', () => {
		expect(toEditable('@{contact:thomas-hut} met @{contact:thomas-lenk}.', handleOf)).toEqual({
			text: '@Thomas met @Thomas.',
			picks: [
				{ start: 0, end: 7, id: 'thomas-hut' },
				{ start: 12, end: 19, id: 'thomas-lenk' }
			]
		});
	});

	it('keeps the token of somebody it cannot name, so saving does not lose them', () => {
		expect(toEditable('with @{contact:gone}', handleOf)).toEqual({ text: 'with @{contact:gone}', picks: [] });
	});

	it('round-trips through toStored to the very same body', () => {
		const body = 'Hut with @{contact:thomas-hut}, coffee with @{contact:thomas-lenk}';
		const { text, picks } = toEditable(body, handleOf);
		expect(toStored(text, picks)).toBe(body);
	});
});

describe('asTyped', () => {
	it('reads a stored body back as it was typed, for a moment still waiting to be sent', () => {
		const people = [
			{ id: 'thomas-hut', displayName: 'Thomas', firstName: 'Thomas', lastName: null },
			{ id: 'sandra', displayName: 'Sandra Brunner', firstName: 'Sandra', lastName: 'Brunner' }
		];
		expect(asTyped('@{contact:thomas-hut} and @{contact:sandra} at the hut', people)).toBe(
			'@Thomas and @SandraBrunner at the hut'
		);
	});
});

describe('newPeopleAsCandidates', () => {
	it('offers the people a moment creates under their placeholder id, and an older build’s names by name', () => {
		expect(
			newPeopleAsCandidates([{ key: 'k1', firstName: 'Thomas', lastName: 'Frei', description: null }, 'Vesna'])
		).toEqual([
			{ id: 'new:k1', displayName: 'Thomas Frei', firstName: 'Thomas', lastName: 'Frei' },
			{ id: 'new-name:Vesna', displayName: 'Vesna', firstName: null, lastName: null }
		]);
		expect(asTyped('Met @{contact:new:k1}', newPeopleAsCandidates([{ key: 'k1', firstName: 'Thomas', lastName: null, description: null }]))).toBe(
			'Met @Thomas'
		);
	});
});
