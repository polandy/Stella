import { describe, expect, it } from 'bun:test';
import type { Note } from '$lib/server/domain/notes/notes';
import type { StoryItem } from '$lib/server/domain/story/story';
import type { UpcomingDate } from '$lib/server/domain/dates/upcoming';
import { briefBlockView, briefHomes, type BriefViewContext } from './brief-view';

/*
 * What the brief's blocks say and where each row leads (docs/02 §2.2.5). Which blocks stand and
 * in what order is `$lib/people/brief`'s; this is only the last step to the page.
 */

const ctx: BriefViewContext = {
	contactId: 'anna',
	nameOf: (id) => ({ mia: 'Mia' })[id] ?? null
};

const note = (over: Partial<Note> = {}): Note => ({
	id: 'n1',
	contactId: 'anna',
	createdBy: 'u1',
	visibility: 'shared',
	title: null,
	body: 'Allergic to nuts',
	isPinned: true,
	createdAt: 0,
	updatedAt: 0,
	...over
});

describe('briefHomes', () => {
	it('names a shared home with whom they live, then an address of their own', () => {
		const homes = briefHomes(
			[
				{
					id: 'h1',
					label: null,
					value: 'Lindenstraße 4\n80331 München',
					livesWith: [{ id: 'ben', displayName: 'Ben' }]
				}
			],
			[
				{ id: 'f1', kind: 'address', label: 'Work', value: 'Marienplatz 1' },
				{ id: 'f2', kind: 'phone', label: null, value: '+49 89 1234' }
			]
		);
		expect(homes).toEqual([
			{
				id: 'h1',
				line: 'Lindenstraße 4, 80331 München',
				livesWith: [{ id: 'ben', displayName: 'Ben' }]
			},
			{ id: 'f1', line: 'Marienplatz 1', livesWith: [] }
		]);
	});

	it('says an address once when a home already says it', () => {
		const homes = briefHomes(
			[{ id: 'h1', label: null, value: 'Lindenstraße 4', livesWith: [] }],
			[{ id: 'f1', kind: 'address', label: null, value: 'Lindenstraße 4' }]
		);
		expect(homes.map((home) => home.id)).toEqual(['h1']);
	});
});

describe('briefBlockView', () => {
	it('links the next date to whose it is, a relative’s page for a relative’s date', () => {
		const date: UpcomingDate = {
			contactId: 'mia',
			contactName: 'Mia',
			avatarPhotoId: null,
			kind: 'birthday',
			label: null,
			date: '2026-11-14',
			daysUntil: 12,
			turning: 13
		};
		expect(briefBlockView({ kind: 'next', date }, ctx)).toEqual({
			kind: 'next',
			date: { ...date, href: '/contacts/mia' }
		});
	});

	it('cuts a pinned note to one line with its mentions named, and links to the notes', () => {
		const view = briefBlockView(
			{
				kind: 'notes',
				notes: [note({ body: 'Ask **@{contact:mia}** about school', visibility: 'private' })]
			},
			ctx
		);
		expect(view).toEqual({
			kind: 'notes',
			notes: [
				{
					id: 'n1',
					title: null,
					line: 'Ask @Mia about school',
					isPrivate: true,
					href: '/contacts/anna#section-notes'
				}
			]
		});
	});

	it('reads a moment by its title, else its first words, and a touchpoint by its own', () => {
		const items: StoryItem[] = [
			{
				kind: 'journal',
				day: '2026-10-30',
				recordedAt: 2,
				entry: {
					id: 'j1',
					contactId: 'anna',
					subjectIds: ['anna'],
					createdBy: 'u1',
					visibility: 'private',
					entryDate: '2026-10-30',
					title: null,
					body: 'Coffee with @{contact:mia}',
					createdAt: 2,
					updatedAt: 2
				}
			},
			{
				kind: 'interaction',
				day: '2026-10-20',
				recordedAt: 1,
				interaction: {
					id: 'i1',
					contactId: 'anna',
					createdBy: 'u1',
					visibility: 'shared',
					kind: 'call',
					happenedAt: '2026-10-20',
					title: null,
					description: null,
					participants: [],
					createdAt: 1,
					updatedAt: 1
				}
			}
		];
		const view = briefBlockView({ kind: 'lately', items }, ctx);
		expect(view).toEqual({
			kind: 'lately',
			items: [
				{
					kind: 'moment',
					interactionKind: null,
					id: 'j1',
					day: '2026-10-30',
					line: 'Coffee with @Mia',
					isPrivate: true,
					href: '/contacts/anna/journal#entry-j1',
					veilId: 'journal:j1'
				},
				{
					kind: 'touchpoint',
					interactionKind: 'call',
					id: 'i1',
					day: '2026-10-20',
					line: null,
					isPrivate: false,
					href: '/contacts/anna#section-story',
					veilId: 'interaction:i1'
				}
			]
		});
	});

	it('links a home and how we met to the top of the person’s page, family to their own', () => {
		const family = briefBlockView(
			{
				kind: 'family',
				members: [
					{ id: 'mia', name: 'Mia', role: 'child', variant: 'female', age: 12, deceased: false }
				],
				homes: [{ id: 'h1', line: 'Lindenstraße 4', livesWith: [] }]
			},
			ctx
		);
		expect(family).toMatchObject({
			members: [{ id: 'mia', href: '/contacts/mia' }],
			homes: [{ id: 'h1', href: '/contacts/anna' }]
		});
		expect(briefBlockView({ kind: 'met', line: 'At university' }, ctx)).toEqual({
			kind: 'met',
			line: 'At university',
			href: '/contacts/anna'
		});
	});
});
