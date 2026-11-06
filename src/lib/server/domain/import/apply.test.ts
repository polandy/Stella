import { describe, expect, it } from 'bun:test';
import { fixedClock } from '../testing';
import { applyImport, previewImport, type ImportRequest } from './apply';
import { englishWording } from './monica/wording.fixture';
import type { ImportPlan } from './monica/plan';
import { MonicaJsonError } from './monica/json-export';

/*
 * The import use-cases (docs/02 §2.16): a preview plans without writing, an apply hands that
 * same plan to the repository in one go. The plan itself is `monica/plan.test.ts`'s.
 */

const VCARD = ['BEGIN:VCARD', 'VERSION:4.0', 'UID:u1', 'FN:Severin Hauenstein', 'END:VCARD'].join(
	'\r\n'
);

const request: ImportRequest = {
	householdId: 'h1',
	userId: 'u1',
	visibility: 'shared',
	wording: englishWording,
	locale: 'en'
};

const clock = fixedClock(1_700_000_000_000);

describe('previewImport', () => {
	it('plans an export stamped with the clock’s time', () => {
		const plan = previewImport({ clock }, VCARD, request);

		expect(plan.report.counts.contacts).toBe(1);
		expect(plan.contacts[0]).toMatchObject({
			id: 'vcard:contact:u1',
			householdId: 'h1',
			createdBy: 'u1',
			createdAt: 1_700_000_000_000
		});
	});

	it('refuses a file Monica did not write', () => {
		expect(() => previewImport({ clock }, '{"not":"monica"}', request)).toThrow(MonicaJsonError);
	});
});

describe('applyImport', () => {
	it('hands the planned export to the repository and reports what it wrote', async () => {
		const applied: ImportPlan[] = [];
		const inserted = { ...previewImport({ clock }, VCARD, request).report.counts, contacts: 0 };

		const result = await applyImport(
			{
				clock,
				importer: {
					async applyPlan(plan) {
						applied.push(plan);
						return { inserted };
					}
				}
			},
			VCARD,
			request
		);

		expect(applied).toEqual([result.plan]);
		expect(result.plan).toEqual(previewImport({ clock }, VCARD, request));
		expect(result.outcome).toEqual({ inserted });
	});

	it('writes nothing when the file does not read', async () => {
		let writes = 0;
		const importer = {
			async applyPlan() {
				writes++;
				return { inserted: previewImport({ clock }, VCARD, request).report.counts };
			}
		};

		await expect(applyImport({ clock, importer }, '{"not":"monica"}', request)).rejects.toThrow(
			MonicaJsonError
		);
		expect(writes).toBe(0);
	});
});
