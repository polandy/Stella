import { phrase } from '../../../i18n/phrase';
import { TranslatableError } from '../../../i18n/translatable';
import type { Remover, Viewer } from '../../access/visibility';
import type { Role } from '../../auth/accounts';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord, type ActivityOf } from '../activity/activity';

/*
 * The household's members as accounts, and removing one (docs/02 §2.1). A removed member is
 * marked, not deleted: everything they wrote keeps its author, their private records stay
 * sealed, and they sign nobody in. Who may remove whom is `canRemoveMember` /
 * `memberRemovableBy` (access/), checked by the write itself.
 */

/** A member as the Members page shows them. */
export interface MemberAccount {
	id: string;
	name: string;
	email: string;
	role: Role;
	/** How they sign in: a password of Stella's own, single sign-on, or both. */
	signIn: { password: boolean; sso: boolean };
	/** When an admin removed them, or null while they belong. */
	removedAt: number | null;
}

/** What the confirm step says about removing one member. */
export interface MemberRemovalPreview {
	memberId: string;
	name: string;
	/** Their records marked private, which nobody sees once they are gone. */
	privateRecords: number;
	signsInWithSso: boolean;
	/** They are the household's last admin who can sign in without the identity provider. */
	onlyAdminWithPassword: boolean;
}

/** Port: the household's accounts, as far as membership goes. */
export interface MemberAccountRepository {
	/** Every account of the household, current and former, by name. */
	listAccounts(householdId: string): Promise<MemberAccount[]>;
	/**
	 * How many records the member marked private. A count across the privacy line on purpose:
	 * the confirm step says what stays sealed, never what it is.
	 */
	countPrivateRecords(memberId: string): Promise<number>;
	/** The member, when the remover may remove them (`memberRemovableBy`). */
	findRemovableBy(remover: Remover, memberId: string): Promise<{ id: string; name: string } | null>;
	/**
	 * Mark the member removed and end their sessions, API tokens and open invitations, with the
	 * activity entry, in one transaction; whether the remover still could.
	 */
	removeRemovableBy(
		remover: Remover,
		memberId: string,
		at: number,
		audit: ActivityOf<'member.removed'>
	): Promise<boolean>;
}

export interface MemberAccountDeps {
	accounts: MemberAccountRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** Removing a member is an admin's to do. */
export class NotAnAdminError extends TranslatableError {
	constructor() {
		super(phrase('errors.admin.only'), 'NotAnAdminError');
	}
}

/** Nobody removes themselves: that alone keeps an admin in the household. */
export class CannotRemoveYourselfError extends TranslatableError {
	constructor() {
		super(phrase('errors.member.notYourself'), 'CannotRemoveYourselfError');
	}
}

/**
 * The member is no longer one the remover may remove: already removed, or never in their
 * household. Answered alike, so a foreign id reveals nothing, and a second tap reads as done.
 */
export class MemberGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.member.gone'), 'MemberGoneError');
	}
}

/** The checks that need no database: an admin, and someone else. */
function refuseOutright(remover: Remover, memberId: string): void {
	if (!remover.isAdmin) throw new NotAnAdminError();
	if (memberId === remover.id) throw new CannotRemoveYourselfError();
}

/** The household's members: the current ones, the viewer first, and the former, latest first. */
export async function listMemberAccounts(
	deps: Pick<MemberAccountDeps, 'accounts'>,
	viewer: Viewer
): Promise<{ current: MemberAccount[]; former: MemberAccount[] }> {
	const accounts = await deps.accounts.listAccounts(viewer.householdId);
	const current = accounts.filter((a) => a.removedAt === null);
	return {
		current: [
			...current.filter((a) => a.id === viewer.id),
			...current.filter((a) => a.id !== viewer.id)
		],
		former: accounts
			.filter((a) => a.removedAt !== null)
			.sort((a, b) => (b.removedAt ?? 0) - (a.removedAt ?? 0))
	};
}

/** What removing this member would leave behind, for the confirm step. */
export async function memberRemovalPreview(
	deps: Pick<MemberAccountDeps, 'accounts'>,
	remover: Remover,
	memberId: string
): Promise<MemberRemovalPreview> {
	refuseOutright(remover, memberId);
	const accounts = await deps.accounts.listAccounts(remover.householdId);
	const member = accounts.find((a) => a.id === memberId && a.removedAt === null);
	if (!member) throw new MemberGoneError();

	const otherAdminWithPassword = accounts.some(
		(a) => a.id !== memberId && a.removedAt === null && a.role === 'admin' && a.signIn.password
	);
	return {
		memberId,
		name: member.name,
		privateRecords: await deps.accounts.countPrivateRecords(memberId),
		signsInWithSso: member.signIn.sso,
		onlyAdminWithPassword:
			member.role === 'admin' && member.signIn.password && !otherAdminWithPassword
	};
}

/** Remove a member from the household, and tell the household. */
export async function removeMember(
	deps: MemberAccountDeps,
	remover: Remover,
	memberId: string
): Promise<void> {
	refuseOutright(remover, memberId);
	const found = await deps.accounts.findRemovableBy(remover, memberId);
	if (!found) throw new MemberGoneError();

	const at = deps.clock.now();
	const audit = activityRecord(
		deps,
		remover,
		{ kind: 'member.removed', memberId, name: found.name },
		at
	);
	if (!(await deps.accounts.removeRemovableBy(remover, memberId, at, audit))) {
		throw new MemberGoneError();
	}
}
