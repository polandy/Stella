import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { CircleJoinSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { removeMember, setMembersRole } from '$lib/server/domain/circles/circles';
import { getCircleDeps, getCommandDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** One membership's role from the circles editor; blank takes the role away. */
const RoleSchema = v.object({
	circleId: v.pipe(v.string(), v.minLength(1)),
	role: v.pipe(v.string(), v.trim())
});

/** The profile card's circles (docs/02 §2.7). */
export const circleActions = {
	joinCircle: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'circle.join',
			payload: { ...fromFormData(CircleJoinSchema, form), contactId: params.id },
			issuedAt: systemClock.now()
		});
		if (!reading.ok) return fail(400, { circleError: say(locals, 'errors.circle.needName') });
		const { command } = reading;
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command);
		if (outcome.status !== 'applied') {
			return fail(400, {
				circleError:
					outcome.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.circle.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	/* Their role in one circle, changed where their circles are read (docs/02 §2.2). */
	setCircleRole: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const parsed = v.safeParse(RoleSchema, {
			circleId: form.get('circleId'),
			role: form.get('role') ?? ''
		});
		if (!parsed.success) return fail(400, {});

		// Only a member the viewer can see in that circle is re-roled; anyone else is left out.
		await setMembersRole(
			getCircleDeps(),
			viewer,
			parsed.output.circleId,
			[params.id],
			parsed.output.role
		);
		throw redirect(303, `/contacts/${params.id}`);
	},

	leaveCircle: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const circleId = form.get('circleId');
		if (typeof circleId !== 'string') return fail(400, {});

		await removeMember(getCircleDeps(), circleId, params.id);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
