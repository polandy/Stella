import { describe, expect, it } from 'bun:test';
import { PlanAddSchema } from '#lib/commands/plan-payloads.js';
import * as v from 'valibot';
import { planAddCommand } from './plan-add-command';

/*
 * The Outings card's add form as the command the outbox keeps (docs/dev/02 §2.18, §2.27): what the
 * three-way visibility and the when post, and that a form which is not an idea yet is none.
 */

const formOf = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};
const idea = (fields: Record<string, string>) =>
	planAddCommand(formOf({ title: 'Climbing hall', ...fields }), 'cmd-1', 'mia', 7);

describe('planAddCommand', () => {
	it('keeps an idea for *Everyone but them* from the person it is with, shared with the rest', () => {
		expect(idea({ visibility: 'surprise' })?.payload).toMatchObject({
			visibility: 'shared',
			hiddenFromPerson: true
		});
	});

	it('keeps a private or shared idea from nobody', () => {
		expect(idea({ visibility: 'private' })?.payload).toMatchObject({
			visibility: 'private',
			hiddenFromPerson: false
		});
		expect(idea({ visibility: 'shared' })?.payload).toMatchObject({ hiddenFromPerson: false });
	});

	it('reads *some time* as no when, and a month as one', () => {
		expect(idea({ whenKind: 'now' })?.payload.when).toBeNull();
		expect(idea({ whenKind: 'in_month', whenOn: '2026-12' })?.payload.when).toEqual({
			kind: 'in_month',
			on: '2026-12'
		});
	});

	it('is no command without a title, or with a when ideas do not have', () => {
		expect(planAddCommand(formOf({ title: ' ' }), 'cmd-1', 'mia', 7)).toBeNull();
		expect(idea({ whenKind: 'later' })).toBeNull();
	});

	it('is what the server reads it as', () => {
		const command = idea({ visibility: 'surprise', whenKind: 'on_date', whenOn: '2026-11-21' });
		expect(v.safeParse(PlanAddSchema, command?.payload).success).toBe(true);
	});
});
