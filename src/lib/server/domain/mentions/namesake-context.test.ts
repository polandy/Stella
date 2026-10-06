import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import type { Viewer } from '../../access/visibility';
import type { ContactSummary } from '../contacts/contacts';
import type {
	ContextMembershipRow,
	ContextTieRow,
	PersonContextReads
} from '../contacts/person-context';
import { withNamesakeContext, type NamesakeContextDeps } from './namesake-context';
import { AmbiguousMentionError, resolveForAudience } from './resolve-for-audience';

/*
 * A refused `@Thomas` names a namesake with nothing typed by a relationship or a circle, as the
 * pickers do (docs/02 §2.2.3) — read only once a text is refused. Tested with recording fakes
 * (docs/08 §8.3).
 */

const viewer: Viewer = { id: 'u-andy', householdId: 'h1' };
// Noon on 2026-09-29, the server's day.
const NOW = new Date(2026, 8, 29, 12).getTime();

const person = (id: string, over: Partial<ContactSummary> = {}): ContactSummary => ({
	id,
	displayName: 'Thomas',
	firstName: 'Thomas',
	lastName: null,
	nickname: null,
	formerName: null,
	jobTitle: null,
	company: null,
	description: null,
	metPlace: null,
	metDate: null,
	visibility: 'shared',
	avatarPhotoId: null,
	birthDate: null,
	...over
});

const household = [
	person('thomas-hut', { description: 'Mountain guide at the hut' }),
	person('thomas-bare'),
	person('thomas-choir'),
	person('sandra', { displayName: 'Sandra Brunner', firstName: 'Sandra', lastName: 'Brunner' })
];

const tieToAndy: ContextTieRow = {
	contactId: 'thomas-bare',
	typeKey: 'sibling',
	side: 'forward',
	label: 'Sibling of',
	otherId: 'andy',
	otherName: 'Andy Brunner',
	category: 'family',
	sortOrder: 30,
	status: 'current',
	createdAt: 1
};

const membership = (name: string, endDate: string | null): ContextMembershipRow => ({
	contactId: 'thomas-choir',
	circleId: name.toLowerCase(),
	parentCircleId: null,
	name,
	role: null,
	startDate: null,
	endDate
});

function fakeDeps(memberships: ContextMembershipRow[] = [membership('Kirchenchor', null)]) {
	const asked: { viewer: Viewer; ids: readonly string[] }[] = [];
	const selfAsked: string[] = [];
	const contextReads: PersonContextReads = {
		async listTiesOfVisibleTo(v, ids) {
			asked.push({ viewer: v, ids });
			return [tieToAndy].filter((t) => ids.includes(t.contactId));
		},
		async listMembershipsOfVisibleTo(v, ids) {
			asked.push({ viewer: v, ids });
			return memberships.filter((m) => ids.includes(m.contactId));
		}
	};
	const deps: NamesakeContextDeps = {
		contextReads,
		async selfContactOf(userId) {
			selfAsked.push(userId);
			return 'andy';
		},
		clock: { now: () => NOW }
	};
	return { deps, asked, selfAsked };
}

async function refusalOf(deps: NamesakeContextDeps, body: string): Promise<AmbiguousMentionError> {
	try {
		await withNamesakeContext(deps, viewer, async () =>
			resolveForAudience(household, 'shared', body)
		);
	} catch (err) {
		if (err instanceof AmbiguousMentionError) return err;
		throw err;
	}
	throw new Error(`expected "${body}" to be refused`);
}

describe('withNamesakeContext', () => {
	it('names a refused namesake with nothing typed by what the author may see of their links and circles', async () => {
		const { deps, asked, selfAsked } = fakeDeps();
		const refusal = await refusalOf(deps, 'hiked with @Thomas and @SandraBrunner');

		expect(refusal.phrase(createTranslator('en'))).toBe(
			'@Thomas could be 3 people: Thomas (Mountain guide at the hut), Thomas (Your sibling), Thomas (Kirchenchor). Pick the one you mean from the list that opens when you type @.'
		);
		expect(refusal.phrase(createTranslator('de'))).toContain(
			'Thomas (Mountain guide at the hut), Thomas (Dein Geschwister), Thomas (Kirchenchor)'
		);
		// Asked as the author, and only about the refused people with nothing typed.
		expect(asked).toEqual([
			{ viewer, ids: ['thomas-bare', 'thomas-choir'] },
			{ viewer, ids: ['thomas-bare', 'thomas-choir'] }
		]);
		expect(selfAsked).toEqual([viewer.id]);
	});

	it("leaves out a circle someone left before the author's today", async () => {
		const { deps } = fakeDeps([membership('Kirchenchor', '2026-09-28')]);
		const refusal = await refusalOf(deps, 'with @Thomas');
		expect(refusal.phrase(createTranslator('en'))).toContain(
			'Thomas (Your sibling), Thomas (Nothing yet to tell them apart)'
		);
	});

	it('reads nothing for a text it lets through', async () => {
		const { deps, asked, selfAsked } = fakeDeps();
		const written = await withNamesakeContext(deps, viewer, async () =>
			resolveForAudience(household, 'shared', 'with @SandraBrunner')
		);
		expect(written.ids).toEqual(['sandra']);
		expect(asked).toEqual([]);
		expect(selfAsked).toEqual([]);
	});

	it('passes any other refusal through as it was, reading nothing', async () => {
		const { deps, asked } = fakeDeps();
		const other = new Error('the journal is gone');
		const thrown = await withNamesakeContext(deps, viewer, async () => {
			throw other;
		}).catch((err: unknown) => err);
		expect(thrown).toBe(other);
		expect(asked).toEqual([]);
	});
});
