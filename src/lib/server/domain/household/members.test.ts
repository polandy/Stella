import { describe, expect, it } from 'bun:test';
import { authorNames, type HouseholdMember, type MemberRepository } from './members';

/*
 * Who wrote what (docs/02 §2.23): the story names the member behind each item, so a household
 * of several people can tell "Markus wrote this" from "you wrote this". The rule that matters
 * is the boundary — only the viewer's own household is ever read.
 */

function repositoryOf(members: Record<string, HouseholdMember[]>): MemberRepository {
	return {
		async listMembers(householdId) {
			return members[householdId] ?? [];
		}
	};
}

const deps = {
	members: repositoryOf({
		h1: [
			{ id: 'u1', name: 'Markus Brunner' },
			{ id: 'u2', name: 'Lena Brunner' }
		],
		h2: [{ id: 'u9', name: 'Somebody Else' }]
	})
};

describe('authorNames', () => {
	it('answers with the member behind an id', async () => {
		const nameOf = await authorNames(deps, 'h1');

		expect(nameOf('u1')).toBe('Markus Brunner');
		expect(nameOf('u2')).toBe('Lena Brunner');
	});

	it('never answers for a member of another household', async () => {
		const nameOf = await authorNames(deps, 'h1');

		// positive control: this household's own member does resolve
		expect(nameOf('u1')).toBe('Markus Brunner');
		expect(nameOf('u9')).toBeNull();
	});

	it('answers null for an id nobody has, rather than throwing on a deleted member', async () => {
		const nameOf = await authorNames(deps, 'h1');

		expect(nameOf('gone')).toBeNull();
	});
});
