import { describe, expect, it } from 'bun:test';
import type { MonicaTask } from './monica-export';
import { taskDone, taskLine } from './tasks';

/*
 * A Monica task as a Stella to-do (docs/02 §2.26.8): one line from its title and description,
 * and — once completed — the moment and the day it was done, so it lands in Activity.
 */

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

const task = (over: Partial<MonicaTask> = {}): MonicaTask => ({
	id: 1,
	contactId: 1,
	title: 'Buch zurückgeben',
	description: null,
	completed: false,
	completedAt: null,
	createdAt: '2023-01-02 08:00:00',
	updatedAt: '2023-01-03 09:00:00',
	...over
});

describe('taskLine', () => {
	it('is the title alone when there is no description', () => {
		expect(taskLine(task())).toBe('Buch zurückgeben');
	});

	it('appends the description after a dash, on one line', () => {
		expect(taskLine(task({ description: 'das rote,\n\nvon  Weihnachten ' }))).toBe(
			'Buch zurückgeben — das rote, von Weihnachten'
		);
	});

	it('is the description when the title is empty', () => {
		expect(taskLine(task({ title: '  ', description: 'Rezept schicken' }))).toBe('Rezept schicken');
	});

	it('is nothing when both are empty', () => {
		expect(taskLine(task({ title: null, description: ' \n ' }))).toBeNull();
	});
});

describe('taskDone', () => {
	it('is null for an open task', () => {
		expect(taskDone(task(), NOW)).toBeNull();
	});

	it('takes the completion moment of a dump, read as UTC', () => {
		expect(taskDone(task({ completed: true, completedAt: '2024-05-06 22:30:00' }), NOW)).toEqual({
			doneAt: Date.UTC(2024, 4, 6, 22, 30, 0),
			doneOn: '2024-05-06'
		});
	});

	it('takes the completion moment of a JSON export, microseconds and all', () => {
		expect(
			taskDone(task({ completed: true, completedAt: '2024-05-06T07:08:09.123456Z' }), NOW)
		).toEqual({ doneAt: Date.UTC(2024, 4, 6, 7, 8, 9, 123), doneOn: '2024-05-06' });
	});

	it('falls back to when it was last changed, then made, when Monica kept no completion', () => {
		expect(taskDone(task({ completed: true }), NOW)).toEqual({
			doneAt: Date.UTC(2023, 0, 3, 9, 0, 0),
			doneOn: '2023-01-03'
		});
		expect(taskDone(task({ completed: true, updatedAt: null }), NOW)?.doneOn).toBe('2023-01-02');
	});

	it('is done at the import when Monica kept no moment at all', () => {
		expect(taskDone(task({ completed: true, updatedAt: null, createdAt: 'garbage' }), NOW)).toEqual(
			{ doneAt: NOW, doneOn: '2026-10-31' }
		);
	});
});
