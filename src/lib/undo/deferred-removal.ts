import type { PendingSink } from '../sync/pending-work';
import { whilePending } from '../sync/pending';
import { removalKey, type RemovalKind } from './keys';
import type { Removal } from './pending-removals';
import { ActionFailedError, submitAction, type ActionFetch } from './submit-action';

/*
 * What a RemoveButton hands to the undo store (docs/02 §2.23): the item's key, what the toast
 * says, and the work to do once the window has closed. It lives here rather than inside the
 * component because it holds a rule of its own — which part of a removal is work the app
 * should say it is doing (docs/05 §5.7) — and a rule inside a `<script>` is a rule no unit
 * test can reach.
 */

/** One press of a remove button, before anything has been sent. */
export interface RemovalRequest {
	/** With `id`, the key the surrounding list checks to hide the row. */
	kind: RemovalKind;
	id: string;
	/** What the toast says while Undo is on offer, e.g. "Date removed". */
	label: string;
	/** The form action the button would have posted to, e.g. `?/removeDate`. */
	action: string;
	/** The action's own fields, as the form carried them. */
	body: FormData;
}

export interface DeferredRemovalDeps {
	fetch: ActionFetch;
	/** Brings the screen behind the removal up to date — `invalidateAll` in the app. */
	reload: () => Promise<void>;
	/**
	 * Told about the commit, where a section shows how long a change is taking. The undo
	 * window itself is never counted: nothing is on its way to the server during it, and a
	 * reader thinking it over is not the app being slow.
	 */
	pending?: PendingSink;
}

/**
 * Posts one held removal to its form action. A 404 means the item is already gone — another
 * tab or another member removed it first — so the goal is reached: it resolves, the screen is
 * reloaded, and the reader is not told something failed (docs/02 §2.23). Every other refusal
 * rejects, and the undo store brings the row back.
 */
export async function removeThroughAction(
	fetch: ActionFetch,
	action: string,
	body: FormData
): Promise<void> {
	try {
		await submitAction(fetch, action, body);
	} catch (error) {
		if (error instanceof ActionFailedError && error.status === 404) return;
		throw error;
	}
}

/**
 * The removal to hold for one undo window. Nothing happens until `commit` is called, which the
 * store does when the window closes or the page is left; a commit that fails rejects, and the
 * store brings the row back.
 */
export function deferredRemoval(request: RemovalRequest, deps: DeferredRemovalDeps): Removal {
	const { fetch, reload, pending } = deps;
	const remove = async () => {
		await removeThroughAction(fetch, request.action, request.body);
		await reload();
	};
	return {
		key: removalKey(request.kind, request.id),
		label: request.label,
		commit: () => (pending ? whilePending(pending, remove) : remove())
	};
}
