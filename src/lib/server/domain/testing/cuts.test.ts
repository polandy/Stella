import { describe, expect, it } from 'bun:test';
import { cutRepositoryWith, someGroupPhoto } from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('someGroupPhoto', () => {
	it('is a shared photo of one circle, added by someone else', () => {
		expect(someGroupPhoto('g1')).toEqual({
			id: 'g1',
			circleId: 'k1',
			createdBy: 'u2',
			visibility: 'shared',
			width: 2000,
			height: 1500
		});
	});

	it('takes the fields a test is about', () => {
		const own = someGroupPhoto('g2', { createdBy: 'u', visibility: 'private' });
		expect([own.createdBy, own.visibility]).toEqual(['u', 'private']);
	});
});

describe('cutRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const group = someGroupPhoto('g1');
		const repo = cutRepositoryWith({ findVisibleGroupPhoto: async () => group });
		expect(await repo.findVisibleGroupPhoto(viewer, 'g1')).toBe(group);
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = cutRepositoryWith({});
		await expect(repo.listCutsOfCircle(viewer, 'k1')).rejects.toThrow(
			'CutRepository.listCutsOfCircle was not expected in this test'
		);
	});
});
