import type { JsonCommand } from '$lib/commands/commands';
import { isAddableGiftState, occasionFromForm, visibilityFromForm } from '$lib/gifts/gifts';
import { GIFT_WHEN_KINDS } from '$lib/gifts/idea-when';
import { parsedWhenFromForm } from '$lib/when/form';

/*
 * The Gifts card's add form as the `gift.add` command the outbox keeps (docs/dev/02 §2.18,
 * §2.25), read the way the form action reads it. Null when the fields are not one yet.
 */

const text = (data: FormData, key: string): string | null => {
	const value = String(data.get(key) ?? '').trim();
	return value.length > 0 ? value : null;
};

export function giftAddCommand(
	formData: FormData,
	id: string,
	contactId: string,
	issuedAt: number
): Extract<JsonCommand, { type: 'gift.add' }> | null {
	const title = text(formData, 'title');
	const state = String(formData.get('state') ?? '');
	const givenOn = text(formData, 'givenOn');
	// A when the schema refuses goes to the server, which says why.
	const when =
		state === 'idea' ? parsedWhenFromForm((key) => text(formData, key), GIFT_WHEN_KINDS) : {};
	if (!title || !isAddableGiftState(state) || (state !== 'idea' && !givenOn) || !when) return null;
	return {
		id,
		type: 'gift.add',
		payload: {
			contactId,
			state,
			title,
			note: text(formData, 'note'),
			url: text(formData, 'url'),
			givenOn: state === 'idea' ? null : givenOn,
			occasion: occasionFromForm(text(formData, 'occasionChoice'), text(formData, 'occasionText')),
			...visibilityFromForm(text(formData, 'visibility')),
			...when
		},
		issuedAt
	};
}
