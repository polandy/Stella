import { describe, expect, it } from 'bun:test';
import { commandFor } from './command';

const about = { contactId: 'anna', visibility: 'shared' as const, day: '2026-11-01' };
const stamp = { id: 'cmd-1', issuedAt: 5 };

describe('what saving a share sends', () => {
	it('a moment in the person’s journal, on the writer’s day', () => {
		expect(commandFor({ target: 'moment', body: ' Told me about it ' }, about, stamp)).toEqual({
			id: 'cmd-1',
			type: 'moment.capture',
			payload: {
				body: 'Told me about it',
				entryDate: '2026-11-01',
				visibility: 'shared',
				newPeople: [],
				anchorId: 'anna'
			},
			issuedAt: 5
		});
	});

	it('a gift idea with its link', () => {
		const command = commandFor(
			{ target: 'gift', title: 'Lego', url: 'https://x.example' },
			about,
			stamp
		);

		expect(command?.payload).toEqual({
			contactId: 'anna',
			state: 'idea',
			title: 'Lego',
			note: null,
			url: 'https://x.example',
			givenOn: null,
			occasion: null,
			visibility: 'shared'
		});
	});

	it('a gift idea without a link has none', () => {
		const command = commandFor({ target: 'gift', title: 'Lego', url: '  ' }, about, stamp);

		expect(command?.payload).toMatchObject({ url: null });
	});

	it('a to-do, private when asked', () => {
		const command = commandFor(
			{ target: 'todo', title: 'Call back' },
			{ ...about, visibility: 'private' },
			stamp
		);

		expect(command).toMatchObject({
			type: 'todo.add',
			payload: { contactId: 'anna', title: 'Call back', dueOn: null, visibility: 'private' }
		});
	});

	it('photos for the gallery', () => {
		expect(commandFor({ target: 'gallery' }, about, stamp)).toMatchObject({
			type: 'gallery.add',
			payload: { contactId: 'anna', visibility: 'shared' }
		});
	});

	it('nothing when the words were all cleared away', () => {
		expect(commandFor({ target: 'moment', body: '  ' }, about, stamp)).toBeNull();
		expect(
			commandFor({ target: 'gift', title: '', url: 'https://x.example' }, about, stamp)
		).toBeNull();
		expect(commandFor({ target: 'todo', title: '\n' }, about, stamp)).toBeNull();
	});
});
