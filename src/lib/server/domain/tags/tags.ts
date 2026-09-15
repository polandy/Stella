import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { ContactSummary } from '../contacts/contacts';
import type { IdGenerator } from '../../id';

/*
 * Tag use-cases (docs/02 §2.8). Tags are household-global labels; assignments to contacts
 * are visibility-scoped in the adapter. Colour validation and orchestration are pure.
 */

export const TAG_COLORS = [
	'rosewater',
	'flamingo',
	'pink',
	'mauve',
	'red',
	'maroon',
	'peach',
	'yellow',
	'green',
	'teal',
	'sky',
	'sapphire',
	'blue',
	'lavender'
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

const DEFAULT_COLOR: TagColor = 'blue';

/** Validate/normalise a tag colour: blank → default, unknown → error. */
export function resolveTagColor(color: string | null | undefined): TagColor {
	const trimmed = (color ?? '').trim();
	if (trimmed === '') return DEFAULT_COLOR;
	if ((TAG_COLORS as readonly string[]).includes(trimmed)) return trimmed as TagColor;
	throw new Error(`Unknown tag colour: ${trimmed}`);
}

export interface Tag {
	id: string;
	householdId: string;
	name: string;
	color: TagColor;
}

export interface NewTag extends Tag {
	createdAt: number;
	updatedAt: number;
}

export interface TagRepository {
	findByName(householdId: string, name: string): Promise<Tag | null>;
	insert(tag: NewTag): Promise<void>;
	listByHousehold(householdId: string): Promise<Tag[]>;
	assign(contactId: string, tagId: string): Promise<void>;
	unassign(contactId: string, tagId: string): Promise<void>;
	/** How many contacts carry this tag, across the whole household — never viewer-scoped. */
	countAssignments(tagId: string): Promise<number>;
	/** Delete a tag, scoped to its household so a forged id cannot reach another one's. */
	deleteTag(householdId: string, tagId: string): Promise<void>;
	/** Delete every tag in the household nobody carries; answers how many went. */
	deleteOrphans(householdId: string): Promise<number>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Tag[]>;
	listContactsByTagVisibleTo(viewer: Viewer, tagId: string): Promise<ContactSummary[]>;
}

export interface TagDeps {
	tags: TagRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** Find a tag by name in the household (creating it if needed) and assign it to a contact. */
export async function assignTagByName(
	deps: TagDeps,
	householdId: string,
	contactId: string,
	name: string,
	color?: string | null
): Promise<string> {
	const trimmedName = name.trim();
	if (trimmedName === '') {
		throw new Error('A tag needs a name.');
	}
	const resolvedColor = resolveTagColor(color);

	let tag = await deps.tags.findByName(householdId, trimmedName);
	if (!tag) {
		const now = deps.clock.now();
		const id = deps.ids.next();
		await deps.tags.insert({
			id,
			householdId,
			name: trimmedName,
			color: resolvedColor,
			createdAt: now,
			updatedAt: now
		});
		tag = { id, householdId, name: trimmedName, color: resolvedColor };
	}

	await deps.tags.assign(contactId, tag.id);
	return tag.id;
}

/**
 * Take a tag off a contact, and delete the tag itself once nobody carries it any more.
 *
 * Tags come into being by being named on a person, so there is no other way to be rid of one:
 * an orphan would sit in the household's chip row forever, filtering to an empty page. The
 * count deliberately spans the whole household rather than what the actor may see — a tag
 * still on someone else's private contact is still in use, and deleting it there would take
 * it off that contact behind their back (docs/02 §2.8).
 *
 * `householdId` is the actor's, and scopes the delete: the caller takes `tagId` from a form,
 * where a forged id would otherwise reach a tag of an entirely different household.
 */
export async function unassignTag(
	deps: Pick<TagDeps, 'tags'>,
	householdId: string,
	contactId: string,
	tagId: string
): Promise<void> {
	await deps.tags.unassign(contactId, tagId);
	// MUTATION PROBE B: delete-on-last-unassign removed.
}

/**
 * Sweep up the tags nobody carries any more. A deleted contact takes its assignments with it
 * by cascade rather than through `unassignTag`, so the tags it was the last carrier of have to
 * be collected afterwards (docs/02 §2.8). Answers how many went, and is safe to call when
 * nothing is orphaned.
 */
export async function pruneOrphanTags(
	deps: Pick<TagDeps, 'tags'>,
	householdId: string
): Promise<number> {
	return deps.tags.deleteOrphans(householdId);
}

export async function listTags(deps: Pick<TagDeps, 'tags'>, householdId: string): Promise<Tag[]> {
	return deps.tags.listByHousehold(householdId);
}

export async function listTagsForContact(
	deps: Pick<TagDeps, 'tags'>,
	viewer: Viewer,
	contactId: string
): Promise<Tag[]> {
	return deps.tags.listForContactVisibleTo(viewer, contactId);
}

export async function listContactsByTag(
	deps: Pick<TagDeps, 'tags'>,
	viewer: Viewer,
	tagId: string
): Promise<ContactSummary[]> {
	return deps.tags.listContactsByTagVisibleTo(viewer, tagId);
}
