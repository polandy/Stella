import { redirect } from '@sveltejs/kit';
import { requireRemover } from '$lib/server/auth/guards';
import { CircleGoneError } from '$lib/server/domain/circles/circle-details';
import { deleteCircle } from '$lib/server/domain/circles/delete-circle';
import type { Actions } from '../$types';

/*
 * Deleting a circle from its header's confirm step (docs/02 §2.4.2): its creator always, an admin
 * when it is shared — checked by the write itself. Afterwards the member lands on the circles
 * list, where the page that posted says *Class 1B deleted*.
 */
export const deleteActions = {
	deleteCircle: async ({ params, locals }) => {
		const remover = requireRemover(locals);
		try {
			await deleteCircle(locals.services.circles.deleteCircleDeps, remover, params.id);
		} catch (err) {
			// Already gone — a second tab, a second tap — is done, never a failure (§2.23).
			if (!(err instanceof CircleGoneError)) throw err;
		}
		throw redirect(303, '/circles');
	}
} satisfies Actions;
