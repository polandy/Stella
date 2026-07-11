import { describe, expect, it } from 'bun:test';
import {
	assembleDashboard,
	buildDashboard,
	excerpt,
	type DashboardRepository,
	type RecentContactRow,
	type RecentNoteRow
} from './dashboard';
import type { Viewer } from '../../access/visibility';

/*
 * Dashboard composition (docs/02 §2.12) — pure assembly, tested without a DB. Proves that a
 * member's own items are flagged, that "your contributions" merges contacts + notes newest-
 * first, and that note excerpts are flattened.
 */

const contact = (over: Partial<RecentContactRow> = {}): RecentContactRow => ({
	id: 'c1',
	displayName: 'Mara',
	description: null,
	avatarPhotoId: null,
	createdBy: 'u1',
	createdAt: 100,
	...over
});
const note = (over: Partial<RecentNoteRow> = {}): RecentNoteRow => ({
	id: 'n1',
	contactId: 'c1',
	contactName: 'Mara',
	title: null,
	body: 'Hello',
	isPinned: false,
	createdBy: 'u1',
	createdAt: 100,
	...over
});

describe('excerpt', () => {
	it('flattens markdown and whitespace', () => {
		expect(excerpt('# Title\n\n*hello*   world')).toBe('Title hello world');
	});
	it('truncates with an ellipsis', () => {
		expect(excerpt('abcdef', 3)).toBe('abc…');
	});
});

describe('assembleDashboard', () => {
	it('flags the viewer’s own people and notes', () => {
		const d = assembleDashboard(
			[contact({ id: 'c1', createdBy: 'u1' }), contact({ id: 'c2', createdBy: 'u2' })],
			[note({ id: 'n1', createdBy: 'u2' })],
			'u1'
		);
		expect(d.newPeople.find((p) => p.id === 'c1')?.addedByYou).toBe(true);
		expect(d.newPeople.find((p) => p.id === 'c2')?.addedByYou).toBe(false);
		expect(d.recentNotes[0].addedByYou).toBe(false);
	});

	it('builds contributions from the viewer’s own items, newest first', () => {
		const d = assembleDashboard(
			[contact({ id: 'c1', createdBy: 'u1', createdAt: 50 })],
			[
				note({ id: 'n1', createdBy: 'u1', createdAt: 200, title: 'Call' }),
				note({ id: 'n2', createdBy: 'u2', createdAt: 300 }) // someone else — excluded
			],
			'u1'
		);
		expect(d.contributions.map((c) => c.id)).toEqual(['n1', 'c1']);
		expect(d.contributions[0]).toMatchObject({ kind: 'note', label: 'Call', contactId: 'c1' });
	});

	it('labels an untitled note by its contact', () => {
		const d = assembleDashboard([], [note({ createdBy: 'u1', title: null, contactName: 'Mara' })], 'u1');
		expect(d.contributions[0].label).toBe('Note on Mara');
	});

	it('excerpts note bodies in the recent-notes panel', () => {
		const d = assembleDashboard([], [note({ body: '## Big **news** today' })], 'u1');
		expect(d.recentNotes[0].excerpt).toBe('Big news today');
	});
});

describe('buildDashboard', () => {
	it('fetches recent records and composes them', async () => {
		const repo: DashboardRepository = {
			recentContacts: async () => [contact({ id: 'c1', createdBy: 'u1' })],
			recentNotes: async () => [note({ id: 'n1', createdBy: 'u1' })]
		};
		const viewer: Viewer = { id: 'u1', householdId: 'h1' };
		const d = await buildDashboard({ dashboard: repo }, viewer);
		expect(d.newPeople).toHaveLength(1);
		expect(d.contributions).toHaveLength(2);
	});
});
