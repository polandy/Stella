/*
 * Shared test support for the domain (docs/08 §8.4): the clock and id fakes every use-case test
 * needs, and one in-memory fake per read-model port. Imported by `*.test.ts` files only — a
 * guard in `testing.test.ts` holds that — so nothing here reaches the build.
 *
 * A fake that records the calls it was made, to assert on them, stays in its test: what was
 * called is that test's behaviour, not boilerplate.
 */

export { fixedClock, type FixedClock } from './clock';
export { sequentialIds } from './ids';
export { commandDepsWith, inMemoryReceipts } from './commands';
export {
	contactRepositoryWith,
	inMemoryContactDirectory,
	inMemoryContactNames,
	somebody,
	type FakePerson
} from './contacts';
export {
	circleRepositoryWith,
	inMemoryCircleDirectory,
	inMemoryCircleMemberships,
	membership,
	someCircle,
	type FakeMembership
} from './circles';
export { inMemoryTagLists, someTag, type FakeTag } from './tags';
export { inMemoryGalleryPhotos, photoRepositoryWith, someGalleryPhoto } from './photos';
export { cutRepositoryWith, someGroupPhoto } from './cuts';
export {
	inMemoryKinshipGraph,
	inMemoryRelationshipTies,
	relationshipRepositoryWith,
	relationshipTypeRepositoryWith,
	someTie
} from './relationships';
