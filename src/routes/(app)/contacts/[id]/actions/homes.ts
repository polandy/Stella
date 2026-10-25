import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireViewer } from '$lib/server/auth/guards';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import {
	changeHomeLine,
	HomeGoneError,
	leaveHome,
	shareAddress,
	type SharedAddress
} from '$lib/server/domain/homes/homes';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, RequestEvent } from '../$types';

/*
 * A shared home on the person page (docs/02 §2.2, *A shared home*): sharing an address with
 * the people picked, rewriting it for everyone or for this person only, and moving out. Not
 * commands: like editing a field, these wait for a connection (docs/02 §2.18).
 */

/** `field:<id>` or `home:<id>` — which of the person's addresses is being shared. */
const AddressSchema = v.pipe(
	v.string(),
	v.regex(/^(field|home):.+$/),
	v.transform((raw): SharedAddress => {
		const [source, id] = [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)];
		return source === 'field' ? { field: id } : { home: id };
	})
);

const ShareSchema = v.object({
	address: AddressSchema,
	withIds: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
	// Present once the editor has asked about the addresses that differ.
	decided: v.boolean(),
	replace: v.array(v.string())
});

const ChangeLineSchema = v.object({
	homeId: v.pipe(v.string(), v.minLength(1)),
	label: v.optional(v.pipe(v.string(), v.trim())),
	value: v.pipe(v.string(), v.trim(), v.minLength(1)),
	scope: v.picklist(['everyone', 'only'])
});

const strings = (form: FormData, name: string) =>
	form.getAll(name).filter((value): value is string => typeof value === 'string');

/** A person or a home gone in the meantime: the page is reloaded with the reason. */
function gone(locals: RequestEvent['locals'], err: unknown): never {
	if (err instanceof ContactGoneError) throw error(404, say(locals, 'errors.contact.notFound'));
	if (err instanceof HomeGoneError) throw error(404, err.phrase(translator(locals)));
	throw err;
}

export const homeActions = {
	shareAddress: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const parsed = v.safeParse(ShareSchema, {
			address: form.get('address'),
			withIds: strings(form, 'withIds'),
			decided: form.has('decided'),
			replace: strings(form, 'replace')
		});
		if (!parsed.success) return fail(400, { homeError: say(locals, 'errors.home.pickSomeone') });

		const { address, withIds, decided, replace } = parsed.output;
		const outcome = await shareAddress(locals.services.records.homeDeps, viewer, {
			contactId: params.id,
			address,
			withIds,
			replace: decided ? replace : null
		}).catch((err: unknown) => gone(locals, err));

		if (outcome.status === 'decide') {
			// Nothing was written: the editor asks which of these to replace, then sends again.
			return fail(409, { homeDecide: { withIds, addresses: outcome.addresses } });
		}
		throw redirect(303, `/contacts/${params.id}`);
	},

	changeHomeLine: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const parsed = v.safeParse(ChangeLineSchema, {
			homeId: form.get('homeId'),
			label: form.get('label') ?? undefined,
			value: form.get('value'),
			scope: form.get('scope') ?? 'everyone'
		});
		if (!parsed.success) return fail(400, { homeError: say(locals, 'errors.field.needValue') });

		const { changedFor } = await changeHomeLine(locals.services.records.homeDeps, viewer, {
			contactId: params.id,
			homeId: parsed.output.homeId,
			label: parsed.output.label ?? null,
			value: parsed.output.value,
			scope: parsed.output.scope
		}).catch((err: unknown) => gone(locals, err));
		// The toast says how many people's address this changed.
		return { homeChangedFor: changedFor };
	},

	/** *Moved out*, for this person or — from the × on their chip — for someone living with them. */
	leaveHome: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const homeId = form.get('homeId');
		const contactId = form.get('contactId') ?? params.id;
		if (typeof homeId !== 'string' || typeof contactId !== 'string') return fail(400, {});

		await leaveHome(locals.services.records.homeDeps, viewer, { contactId, homeId }).catch(
			(err: unknown) => gone(locals, err)
		);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
