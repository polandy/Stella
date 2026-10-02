import { roleKey } from '../../../circles/role-key';
import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { CirclePhotoRepository } from './circle-photos';
import type { CircleRepository } from './circles';

/*
 * Renaming one role of a circle (docs/02 §2.4.2). A role is free text on each membership and on
 * each circle photo, so a rename is a rewrite of every one that carries it — folded by case, the
 * rule the members list groups by. The rename stays inside the one circle: a "Teacher" elsewhere
 * is another circle's word. Like re-roling, it touches only what the viewer can see (§3.7).
 */

/** A role cannot be renamed to nothing; taking roles away is the selection bar's job. */
export class BlankRoleNameError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.roleNameBlank'), 'BlankRoleNameError');
	}
}

export interface RenameRoleDeps {
	circles: Pick<CircleRepository, 'listMembersVisibleTo' | 'renameRole'>;
	circlePhotos: Pick<CirclePhotoRepository, 'listVisible'>;
	clock: Clock;
}

/**
 * Give every visible member and photo of `circleId` whose role folds to `from` the trimmed `to`.
 * Those already carrying `to` in another spelling take it as typed too, so renaming onto an
 * existing role merges the two groups under exactly the name entered. `from` blank (*No role*)
 * renames nothing.
 */
export async function renameCircleRole(
	deps: RenameRoleDeps,
	viewer: Viewer,
	input: { circleId: string; from: string; to: string }
): Promise<void> {
	const role = input.to.trim();
	if (role === '') throw new BlankRoleNameError();
	const fromKey = roleKey(input.from);
	if (fromKey === null) return;

	const keys = new Set([fromKey, roleKey(role)]);
	const carries = (r: string | null) => {
		const key = roleKey(r);
		return key !== null && keys.has(key);
	};
	const [members, photos] = await Promise.all([
		deps.circles.listMembersVisibleTo(viewer, input.circleId),
		deps.circlePhotos.listVisible(viewer, input.circleId)
	]);
	// Only the old role decides whether there is anything to rename; the target alone is not one.
	const renamed = (r: string | null) => roleKey(r) === fromKey;
	if (!members.some((m) => renamed(m.role)) && !photos.some((p) => renamed(p.role))) return;

	await deps.circles.renameRole({
		circleId: input.circleId,
		contactIds: members.filter((m) => carries(m.role)).map((m) => m.contactId),
		photoIds: photos.filter((p) => carries(p.role)).map((p) => p.id),
		role,
		updatedAt: deps.clock.now()
	});
}
