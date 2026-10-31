import { describe, expect, it } from 'bun:test';
import type { MonicaTask } from './monica-export';
import { planMonicaImport } from './plan';
import { NOW, contact, emptyExport, opts } from './plan.fixture';

/*
 * Monica's tasks become to-dos on the person they belong to (docs/02 §2.26.8): open ones open,
 * completed ones done on their completion day, so they show in that person's Activity.
 */

const task = (id: number, over: Partial<MonicaTask> = {}): MonicaTask => ({
	id,
	contactId: 1,
	title: 'Buch zurückgeben',
	description: null,
	completed: false,
	completedAt: null,
	createdAt: '2023-01-02 08:00:00',
	updatedAt: '2023-01-03 09:00:00',
	...over
});

describe('planMonicaImport — tasks', () => {
	it('makes an open task an open to-do with no day, stamped like everything imported', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'Hilde', 'Muster')];
		exp.tasks = [task(7, { description: 'das rote' })];
		const plan = planMonicaImport(exp, opts);
		expect(plan.todos).toEqual([
			{
				id: 'monica:task:7',
				contactId: 'monica:contact:1',
				createdBy: 'u1',
				visibility: 'shared',
				title: 'Buch zurückgeben — das rote',
				dueOn: null,
				doneAt: null,
				doneOn: null,
				doneBy: null,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(plan.report.counts.todos).toBe(1);
	});

	it('makes a completed task a to-do done on its completion day, by the importing member', () => {
		const exp = emptyExport();
		exp.contacts = [contact(1, 'Hilde', 'Muster')];
		exp.tasks = [task(8, { completed: true, completedAt: '2024-05-06 22:30:00' })];
		const [todo] = planMonicaImport(exp, { ...opts, visibility: 'private' }).todos;
		expect(todo).toMatchObject({
			visibility: 'private',
			doneAt: Date.UTC(2024, 4, 6, 22, 30, 0),
			doneOn: '2024-05-06',
			doneBy: 'u1'
		});
	});

	it('leaves out a task on no person, on a deleted person, or with nothing written, and says so', () => {
		const exp = emptyExport();
		exp.contacts = [
			contact(1, 'Hilde', 'Muster'),
			contact(2, 'Gone', null, { deletedAt: '2023-06-21 12:55:36' })
		];
		exp.tasks = [
			task(1, { contactId: null }),
			task(2, { contactId: 2 }),
			task(3, { title: ' ', description: null })
		];
		const plan = planMonicaImport(exp, opts);
		expect(plan.todos).toEqual([]);
		expect(plan.report.skipped).toEqual(
			expect.arrayContaining([
				{ what: 'task', count: 1, why: 'attachedToNoPerson' },
				{ what: 'task', count: 1, why: 'belongsToDeletedContact' },
				{ what: 'task', count: 1, why: 'empty' }
			])
		);
	});
});
