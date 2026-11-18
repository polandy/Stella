import { describe, expect, it } from 'bun:test';
import { giftGroupAddCommand, giftGroupPayload } from './gift-group-command';

/*
 * The form for several people as the `giftGroup.add` command the outbox keeps (docs/dev/02
 * §2.25.11), read the way the form action reads it. Null when the fields are not one yet.
 */

const formOf = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};
const RECIPIENTS = JSON.stringify([{ contactId: 'mia' }, { contactId: 'noah', birthYear: '2022' }]);

describe('giftGroupPayload', () => {
	it('reads the title, the shared when, its occasion and everyone chosen', () => {
		const payload = giftGroupPayload(
			formOf({
				title: ' Puzzle ',
				note: 'Ravensburger',
				whenKind: 'at_age',
				whenAge: '5',
				visibility: 'surprise',
				recipients: RECIPIENTS
			})
		);
		expect(payload).toEqual({
			title: 'Puzzle',
			note: 'Ravensburger',
			url: null,
			occasion: 'birthday',
			visibility: 'shared',
			hiddenFromRecipients: true,
			when: { kind: 'at_age', age: 5 },
			recipients: [{ contactId: 'mia' }, { contactId: 'noah', birthYear: '2022' }]
		});
	});

	it('reads no when as now, and a private idea as kept from nobody', () => {
		const payload = giftGroupPayload(
			formOf({ title: 'Book', visibility: 'private', recipients: RECIPIENTS })
		);
		expect(payload).toMatchObject({ when: null, visibility: 'private', hiddenFromRecipients: false });
	});

	it('is none without a title, without anyone, or with a broken field', () => {
		expect(giftGroupPayload(formOf({ recipients: RECIPIENTS }))).toBeNull();
		expect(giftGroupPayload(formOf({ title: 'Book', recipients: '[]' }))).toBeNull();
		expect(giftGroupPayload(formOf({ title: 'Book', recipients: '{' }))).toBeNull();
		expect(
			giftGroupPayload(formOf({ title: 'Book', whenKind: 'at_age', whenAge: '0', recipients: RECIPIENTS }))
		).toBeNull();
	});
});

describe('giftGroupAddCommand', () => {
	it('wraps the payload as the command the outbox keeps', () => {
		const command = giftGroupAddCommand(formOf({ title: 'Book', recipients: RECIPIENTS }), 'c1', 7);
		expect(command).toMatchObject({ id: 'c1', type: 'giftGroup.add', issuedAt: 7 });
		expect(giftGroupAddCommand(formOf({}), 'c1', 7)).toBeNull();
	});
});
