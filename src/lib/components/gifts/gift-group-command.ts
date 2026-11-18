import * as v from 'valibot';
import type { JsonCommand } from '$lib/commands/commands';
import { GiftGroupAddSchema } from '$lib/commands/gift-todo-payloads';
import { groupOccasion } from '$lib/gifts/group-form';
import { visibilityFromForm } from '$lib/gifts/gifts';
import { GIFT_WHEN_KINDS } from '$lib/gifts/idea-when';
import { parsedWhenFromForm } from '$lib/when/form';

/*
 * The form for several people as the `giftGroup.add` command the outbox keeps (docs/dev/02
 * §2.25.11), read the way the form action reads it. Null when the fields are not one yet.
 */

type GiftGroupPayload = v.InferOutput<typeof GiftGroupAddSchema>;

const text = (data: FormData, key: string): string | null => {
	const value = String(data.get(key) ?? '').trim();
	return value.length > 0 ? value : null;
};

function json(raw: string | null): unknown {
	try {
		return raw === null ? null : JSON.parse(raw);
	} catch {
		return null;
	}
}

/** The fields as the payload `giftGroup.add` carries; the form action and the outbox share it. */
export function giftGroupPayload(formData: FormData): GiftGroupPayload | null {
	const parsed = parsedWhenFromForm((key) => text(formData, key), GIFT_WHEN_KINDS);
	if (!parsed) return null;
	const when = parsed.when ?? null;
	const { visibility, hiddenFromRecipient } = visibilityFromForm(text(formData, 'visibility'));
	const payload = v.safeParse(GiftGroupAddSchema, {
		title: text(formData, 'title') ?? '',
		note: text(formData, 'note'),
		url: text(formData, 'url'),
		occasion: groupOccasion(when),
		visibility,
		hiddenFromRecipients: hiddenFromRecipient,
		when,
		recipients: json(text(formData, 'recipients'))
	});
	return payload.success ? payload.output : null;
}

export function giftGroupAddCommand(
	formData: FormData,
	id: string,
	issuedAt: number
): Extract<JsonCommand, { type: 'giftGroup.add' }> | null {
	const payload = giftGroupPayload(formData);
	return payload === null ? null : { id, type: 'giftGroup.add', payload, issuedAt };
}

const GroupNotedSchema = v.object({
	giftIds: v.array(v.string()),
	skipped: v.array(v.object({ contactId: v.string() }))
});

/** What `giftGroup.add` answered: how many got the idea, and who was left out. */
export function groupNotedOf(result: unknown): { noted: number; skipped: string[] } {
	const parsed = v.safeParse(GroupNotedSchema, result);
	if (!parsed.success) throw new Error('giftGroup.add answered without its gifts');
	return {
		noted: parsed.output.giftIds.length,
		skipped: parsed.output.skipped.map((s) => s.contactId)
	};
}
