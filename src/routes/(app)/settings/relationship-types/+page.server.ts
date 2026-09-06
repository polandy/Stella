import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { RELATIONSHIP_CATEGORIES } from '$lib/relationships/categories';
import { requireAdmin } from '$lib/server/auth/guards';
import {
	BuiltInRelationshipTypeError,
	InvalidRelationshipTypeError,
	RelationshipTypeInUseError,
	createRelationshipType,
	editRelationshipType,
	removeRelationshipType
} from '$lib/server/domain/relationships/relationship-types';
import { getRelationshipTypeDeps, getRelationshipTypes } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * The household's relationship vocabulary (docs/02 §2.4). Admin only: a type is shared by
 * everyone's pages, so renaming one rewrites what every member reads.
 */

const TypeSchema = v.object({
	forwardLabel: v.pipe(v.string(), v.trim(), v.minLength(1, 'A relationship type needs a label.')),
	reverseLabel: v.optional(v.string(), ''),
	category: v.picklist(RELATIONSHIP_CATEGORIES),
	symmetric: v.optional(v.literal('on'))
});

const WithIdSchema = v.object({ ...TypeSchema.entries, typeId: v.pipe(v.string(), v.minLength(1)) });

const IdOnlySchema = v.object({ typeId: v.pipe(v.string(), v.minLength(1)) });

/** The form's checkbox arrives as `'on'` or not at all. */
const inputOf = (parsed: v.InferOutput<typeof TypeSchema>) => ({
	forwardLabel: parsed.forwardLabel,
	reverseLabel: parsed.reverseLabel,
	category: parsed.category,
	symmetric: parsed.symmetric === 'on'
});

/** The messages a household should see; anything else is a bug and stays loud. */
function messageOf(err: unknown): string | null {
	if (
		err instanceof InvalidRelationshipTypeError ||
		err instanceof RelationshipTypeInUseError ||
		err instanceof BuiltInRelationshipTypeError
	) {
		return err.message;
	}
	return null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAdmin(locals);
	const viewer = { id: user.id, householdId: user.householdId };
	const types = await getRelationshipTypes().listTypes(viewer);

	// A type still in use cannot be removed, so the page counts first and offers the button
	// only where it would succeed — an undo toast that quietly fails at commit would lie.
	const custom = await Promise.all(
		types
			.filter((type) => type.householdId !== null)
			.map(async (type) => ({
				...type,
				usageCount: await getRelationshipTypes().countRelationshipsOfType(viewer, type.id)
			}))
	);

	return { builtIn: types.filter((type) => type.householdId === null), custom };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const parsed = v.safeParse(TypeSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: parsed.issues[0].message });
		try {
			await createRelationshipType(
				getRelationshipTypeDeps(),
				{ id: user.id, householdId: user.householdId },
				inputOf(parsed.output)
			);
		} catch (err) {
			const message = messageOf(err);
			if (!message) throw err;
			return fail(400, { error: message });
		}
		throw redirect(303, '/settings/relationship-types');
	},

	edit: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const parsed = v.safeParse(WithIdSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: parsed.issues[0].message });
		try {
			const changed = await editRelationshipType(
				getRelationshipTypeDeps(),
				{ id: user.id, householdId: user.householdId },
				parsed.output.typeId,
				inputOf(parsed.output)
			);
			if (!changed) return fail(404, { error: 'That relationship type is gone.' });
		} catch (err) {
			const message = messageOf(err);
			if (!message) throw err;
			return fail(400, { error: message });
		}
		throw redirect(303, '/settings/relationship-types');
	},

	remove: async ({ request, locals }) => {
		const user = requireAdmin(locals);
		const parsed = v.safeParse(IdOnlySchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: parsed.issues[0].message });
		try {
			await removeRelationshipType(
				getRelationshipTypeDeps(),
				{ id: user.id, householdId: user.householdId },
				parsed.output.typeId
			);
		} catch (err) {
			const message = messageOf(err);
			if (!message) throw err;
			return fail(400, { error: message });
		}
		throw redirect(303, '/settings/relationship-types');
	}
};
