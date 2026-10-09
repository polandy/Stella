import type { CutRepository, GroupPhoto } from '../media/cuts';

/*
 * Fakes of the cuts' port (`media/cuts.ts`): the circle photo a profile picture is cut from, and
 * the repository that keeps the cut. As with the other fakes, a group photo a test hands in is
 * one the viewer may see: scoping is the access layer's job, covered against SQLite in
 * `db/cut-repository.test.ts`.
 */

/** A shared 2000×1500 photo of circle `k1` added by `u2`, plus whatever the test is about. */
export function someGroupPhoto(
	id: string,
	fields: Partial<Omit<GroupPhoto, 'id'>> = {}
): GroupPhoto {
	return {
		id,
		circleId: 'k1',
		createdBy: 'u2',
		visibility: 'shared',
		width: 2000,
		height: 1500,
		...fields
	};
}

/** Every method of the port: a method added to it and not here fails to compile. */
const CUT_REPOSITORY_METHODS: Record<keyof CutRepository, true> = {
	findVisibleGroupPhoto: true,
	replaceCut: true,
	listCutsOfCircle: true,
	listGroupPhotosOf: true,
	listGroupPhotosToCut: true
};

/**
 * A `CutRepository` that does what the test hands it and fails loud on anything else (as
 * `photoRepositoryWith`). The cuts a test records are its own: that is what it asserts.
 */
export function cutRepositoryWith(methods: Partial<CutRepository>): CutRepository {
	const unexpected = (name: string) => async () => {
		throw new Error(`CutRepository.${name} was not expected in this test`);
	};
	const stubs = Object.fromEntries(
		Object.keys(CUT_REPOSITORY_METHODS).map((name) => [name, unexpected(name)])
	) as unknown as CutRepository;
	return { ...stubs, ...methods };
}
