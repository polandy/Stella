import { deserialize } from '$app/forms';
import { ACTION_HEADER } from '$lib/undo/submit-action';

/*
 * Moving the people just created into the address the relationship form offered them (docs/02
 * §2.4, *Lives at …*). An adapter: it posts what *Also lives here …* posts, to the same action,
 * and only says whether it went through. Already decided — someone just created has no address
 * of their own to ask about.
 */
export async function postLivesAt(
	contactId: string,
	address: string,
	withIds: readonly string[]
): Promise<boolean> {
	const body = new FormData();
	body.set('address', address);
	for (const id of withIds) body.append('withIds', id);
	body.set('decided', 'true');
	try {
		const response = await fetch(`/contacts/${contactId}?/shareAddress`, {
			method: 'POST',
			body,
			headers: { [ACTION_HEADER]: 'true' }
		});
		const result = deserialize(await response.text());
		// The action answers a share with the way back to the page.
		return result.type === 'redirect' || result.type === 'success';
	} catch {
		return false;
	}
}
