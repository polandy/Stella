import { describe, expect, it } from 'bun:test';
import { addRelationshipCommand } from './add-command';

/*
 * The relationships card's add form as a command (docs/02 §2.4): one person picked saves as
 * `relationship.add`, several as one `relationship.addMany` batch, the since day per pair.
 */

const AT = 1_800_000_000_000;

function fields(entries: [string, string][]): FormData {
	const data = new FormData();
	for (const [name, value] of entries) data.append(name, value);
	return data;
}

const build = (data: FormData) =>
	addRelationshipCommand(data, { id: 'cmd-1', contactId: 'c-anna', issuedAt: AT });

describe('addRelationshipCommand', () => {
	it('is nothing without a person or a type', () => {
		expect(build(fields([['typeChoice', '1:forward']]))).toBeNull();
		expect(build(fields([['targetId', 'c-bert']]))).toBeNull();
		expect(
			build(
				fields([
					['targetId', ''],
					['typeChoice', '1:forward']
				])
			)
		).toBeNull();
	});

	it('saves one person picked as relationship.add, blank fields as null', () => {
		const command = build(
			fields([
				['targetId', 'c-bert'],
				['typeChoice', '1:forward'],
				['description', '  '],
				['sinceDate', '2001-05-01'],
				['status', 'former']
			])
		);
		expect(command).toEqual({
			id: 'cmd-1',
			type: 'relationship.add',
			payload: {
				contactId: 'c-anna',
				targetId: 'c-bert',
				typeChoice: '1:forward',
				description: null,
				sinceDate: '2001-05-01',
				status: 'former'
			},
			issuedAt: AT
		});
	});

	it('saves several as one batch, one since day shared by every pair', () => {
		const command = build(
			fields([
				['targetId', 'c-bert'],
				['targetId', 'c-cleo'],
				['typeChoice', '1:reverse'],
				['sinceDate', '2010-01-01'],
				['description', 'Twins']
			])
		);
		expect(command).toEqual({
			id: 'cmd-1',
			type: 'relationship.addMany',
			payload: {
				contactId: 'c-anna',
				typeChoice: '1:reverse',
				status: 'current',
				description: 'Twins',
				links: [
					{ targetId: 'c-bert', sinceDate: '2010-01-01' },
					{ targetId: 'c-cleo', sinceDate: '2010-01-01' }
				]
			},
			issuedAt: AT
		});
	});

	it('takes a since day per pair in the order the people were picked', () => {
		const command = build(
			fields([
				['targetId', 'c-bert'],
				['targetId', 'c-cleo'],
				['typeChoice', '1:reverse'],
				['sinceDate', '2010-01-01'],
				['sinceDate', ''],
				['status', 'former']
			])
		);
		expect(command?.type).toBe('relationship.addMany');
		if (command?.type !== 'relationship.addMany') return;
		expect(command.payload.status).toBe('former');
		expect(command.payload.links).toEqual([
			{ targetId: 'c-bert', sinceDate: '2010-01-01' },
			{ targetId: 'c-cleo', sinceDate: null }
		]);
	});

	it('is nothing when the since days match neither one field nor one per pair', () => {
		const command = build(
			fields([
				['targetId', 'c-bert'],
				['targetId', 'c-cleo'],
				['targetId', 'c-dora'],
				['typeChoice', '1:reverse'],
				['sinceDate', '2010-01-01'],
				['sinceDate', '2011-01-01']
			])
		);
		expect(command).toBeNull();
	});

	it('falls back to the current status for an unknown one in a batch', () => {
		const command = build(
			fields([
				['targetId', 'c-bert'],
				['targetId', 'c-cleo'],
				['typeChoice', '1:reverse'],
				['sinceDate', ''],
				['status', 'nonsense']
			])
		);
		expect(command?.type === 'relationship.addMany' && command.payload.status).toBe('current');
	});
});
