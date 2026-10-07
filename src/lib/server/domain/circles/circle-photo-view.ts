import { roleKey } from '../../../circles/role-key';
import { orderGallery, type Orderable } from '../media/gallery-order';

/*
 * How a circle's photos are laid out on its page (docs/02 §2.4.2): the cover, a banner over each
 * role group, the grid and its role chips, and the roles a photo may be given. One rule decides
 * which photo leads a group — the favourite pinned most recently, otherwise the newest — and it is
 * the gallery's own order (`gallery-order.ts`), so the strip and the grid can never disagree about
 * which photo comes first. Pure.
 */

/** What the layout reads from a photo. */
export interface RoledPhoto extends Orderable {
	/** The circle role the photo shows, as stored; null = the circle as a whole. */
	role: string | null;
}

/** A photo as the grid lists it: with the key its role is matched by, and the name it shows. */
export type PlacedPhoto<T> = T & {
	roleKey: string | null;
	/** The members' spelling of the role, or the photo's own once nobody has it; null = no role. */
	roleLabel: string | null;
};

/** One role chip over the grid; `key` null is *No role*. */
export interface RoleChip {
	key: string | null;
	/** The role's name; null for *No role*, which the page names in the reader's language. */
	label: string | null;
	count: number;
}

export interface CirclePhotoView<T> {
	/** Every photo, in the grid's order. */
	photos: PlacedPhoto<T>[];
	/** The circle's cover: the lead photo of those without a role. */
	cover: PlacedPhoto<T> | null;
	/**
	 * The lead photo of each role that has members, by role key. A role whose members are all
	 * gone keeps its photos but has no group to stand above (concept §4).
	 */
	banners: Record<string, PlacedPhoto<T>>;
	/** The groups present among the photos, with counts — empty when there are no photos. */
	chips: RoleChip[];
}

/** The photo that leads the photos of role `key` (null = no role), or null when it has none. */
export function leadPhoto<T extends RoledPhoto>(
	photos: readonly T[],
	key: string | null
): T | null {
	return orderGallery(photos.filter((p) => roleKey(p.role) === key))[0] ?? null;
}

/**
 * Lay out a circle's photos against its members' roles, given in the order the members list
 * shows them (`suggestRoles`). Chips read *No role* first, then the members' roles in that
 * order, then roles only photos still carry, alphabetically.
 */
export function circlePhotoView<T extends RoledPhoto>(
	photos: readonly T[],
	memberRoles: readonly string[]
): CirclePhotoView<T> {
	const memberLabel = new Map<string, string>();
	for (const label of memberRoles) {
		const key = roleKey(label);
		if (key !== null && !memberLabel.has(key)) memberLabel.set(key, label);
	}

	const placed: PlacedPhoto<T>[] = orderGallery(photos).map((p) => {
		const key = roleKey(p.role);
		return {
			...p,
			roleKey: key,
			roleLabel: key === null ? null : (memberLabel.get(key) ?? p.role!.trim())
		};
	});

	const chipsByKey = new Map<string | null, RoleChip>();
	for (const p of placed) {
		const chip = chipsByKey.get(p.roleKey) ?? { key: p.roleKey, label: p.roleLabel, count: 0 };
		chip.count += 1;
		chipsByKey.set(p.roleKey, chip);
	}
	const memberOrder = [...memberLabel.keys()];
	const rank = (chip: RoleChip) => {
		if (chip.key === null) return -1;
		const at = memberOrder.indexOf(chip.key);
		return at === -1 ? memberOrder.length : at;
	};
	const chips = [...chipsByKey.values()].sort(
		(a, b) => rank(a) - rank(b) || (a.label ?? '').localeCompare(b.label ?? '')
	);

	const banners: Record<string, PlacedPhoto<T>> = {};
	for (const key of memberOrder) {
		const lead = leadPhoto(placed, key);
		if (lead) banners[key] = lead;
	}

	return { photos: placed, cover: leadPhoto(placed, null), banners, chips };
}

/**
 * The roles a photo can be given (concept §2, §4): the circle's current roles, plus the photo's
 * own when nobody has it any more, so opening the picker never loses it. *No role* is always a
 * choice besides these. Roles that differ only in case are one.
 */
export function photoRoleOptions(memberRoles: readonly string[], ownRole: string | null): string[] {
	const options = [...memberRoles];
	const ownKey = roleKey(ownRole);
	if (ownKey !== null && !options.some((option) => roleKey(option) === ownKey)) {
		options.push(ownRole!.trim());
	}
	return options;
}

/**
 * The role to store for `picked`: the offered spelling it folds to, `{ role: null }` for a
 * blank pick, or null when it is none of `options` — a role is chosen, never typed (concept §2).
 */
export function matchRoleOption(
	picked: string | null | undefined,
	options: readonly string[]
): { role: string | null } | null {
	const key = roleKey(picked);
	if (key === null) return { role: null };
	const match = options.find((option) => roleKey(option) === key);
	return match === undefined ? null : { role: match };
}
