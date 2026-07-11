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

export async function unassignTag(
	deps: Pick<TagDeps, 'tags'>,
	contactId: string,
	tagId: string
): Promise<void> {
	await deps.tags.unassign(contactId, tagId);
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
