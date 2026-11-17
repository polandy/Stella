import type { JsonCommand } from '$lib/commands/commands';
import { isPlanWhen, PLAN_WHEN_KINDS, planVisibilityFromForm } from '$lib/plans/plans';
import { parsedWhenFromForm } from '$lib/when/form';

/*
 * The Outings card's add form as the `plan.add` command the outbox keeps (docs/dev/02 §2.18,
 * §2.27), read the way the form action reads it. Null when the fields are not one yet.
 */

const text = (data: FormData, key: string): string | null => {
	const value = String(data.get(key) ?? '').trim();
	return value.length > 0 ? value : null;
};

export function planAddCommand(
	formData: FormData,
	id: string,
	contactId: string,
	issuedAt: number
): Extract<JsonCommand, { type: 'plan.add' }> | null {
	const title = text(formData, 'title');
	// A when the schema refuses goes to the server, which says why.
	const parsed = parsedWhenFromForm((key) => text(formData, key), PLAN_WHEN_KINDS);
	if (!title || !parsed) return null;
	const when = parsed.when;
	if (when && !isPlanWhen(when)) return null;
	return {
		id,
		type: 'plan.add',
		payload: {
			contactId,
			title,
			note: text(formData, 'note'),
			url: text(formData, 'url'),
			...planVisibilityFromForm(text(formData, 'visibility')),
			when
		},
		issuedAt
	};
}
