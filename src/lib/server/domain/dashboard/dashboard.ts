import type { Viewer } from '../../access/visibility';

/*
 * Personal dashboard (docs/02 §2.12): a read/aggregation view — no new tables. The server
 * fetches recent, access-scoped records once and this module *composes* them into panels for
 * the signed-in member. The assembly (marking a member's own items, building their
 * contributions stream, excerpting note bodies) is pure and unit-tested; only the fetch is
 * I/O. Panels tied to features not built yet (activity feed §2.11, gifts, upcoming dates
 * §2.13) are added here as those land — this stays a composition point.
 */

const PEOPLE_LIMIT = 6;
const NOTES_LIMIT = 5;
const CONTRIBUTIONS_LIMIT = 6;
const EXCERPT_MAX = 120;

export interface RecentContactRow {
	id: string;
	displayName: string;
	description: string | null;
	avatarPhotoId: string | null;
	createdBy: string;
	createdAt: number;
}

export interface RecentNoteRow {
	id: string;
	contactId: string;
	contactName: string;
	title: string | null;
	body: string;
	isPinned: boolean;
	createdBy: string;
	createdAt: number;
}

export interface DashboardPerson {
	id: string;
	displayName: string;
	description: string | null;
	avatarPhotoId: string | null;
	createdAt: number;
	addedByYou: boolean;
}

export interface DashboardNote {
	id: string;
	contactId: string;
	contactName: string;
	title: string | null;
	excerpt: string;
	isPinned: boolean;
	createdAt: number;
	addedByYou: boolean;
}

/** One thing the signed-in member recently added, for the "Your contributions" panel. */
export interface Contribution {
	kind: 'contact' | 'note';
	id: string;
	label: string;
	contactId: string;
	at: number;
}

export interface Dashboard {
	newPeople: DashboardPerson[];
	recentNotes: DashboardNote[];
	contributions: Contribution[];
}

/** A short single-line preview of a (Markdown) note body. */
export function excerpt(body: string, max = EXCERPT_MAX): string {
	const flat = body
		.replace(/[#>*_`~-]/g, ' ') // drop the most common Markdown markers
		.replace(/\s+/g, ' ')
		.trim();
	if (flat.length <= max) return flat;
	return flat.slice(0, max).trimEnd() + '…';
}

/**
 * Compose the dashboard for `viewerId` from recent contacts and notes (already visibility-
 * scoped by the caller). Pure and deterministic. Inputs are assumed newest-first.
 */
export function assembleDashboard(
	contacts: RecentContactRow[],
	notes: RecentNoteRow[],
	viewerId: string
): Dashboard {
	const newPeople: DashboardPerson[] = contacts.slice(0, PEOPLE_LIMIT).map((c) => ({
		id: c.id,
		displayName: c.displayName,
		description: c.description,
		avatarPhotoId: c.avatarPhotoId,
		createdAt: c.createdAt,
		addedByYou: c.createdBy === viewerId
	}));

	const recentNotes: DashboardNote[] = notes.slice(0, NOTES_LIMIT).map((n) => ({
		id: n.id,
		contactId: n.contactId,
		contactName: n.contactName,
		title: n.title,
		excerpt: excerpt(n.body),
		isPinned: n.isPinned,
		createdAt: n.createdAt,
		addedByYou: n.createdBy === viewerId
	}));

	const mine: Contribution[] = [
		...contacts
			.filter((c) => c.createdBy === viewerId)
			.map((c): Contribution => ({ kind: 'contact', id: c.id, label: c.displayName, contactId: c.id, at: c.createdAt })),
		...notes
			.filter((n) => n.createdBy === viewerId)
			.map((n): Contribution => ({
				kind: 'note',
				id: n.id,
				label: n.title ?? `Note on ${n.contactName}`,
				contactId: n.contactId,
				at: n.createdAt
			}))
	];
	mine.sort((a, b) => b.at - a.at);

	return { newPeople, recentNotes, contributions: mine.slice(0, CONTRIBUTIONS_LIMIT) };
}

// ── Use-case ────────────────────────────────────────────────────────────────

export interface DashboardRepository {
	recentContacts(viewer: Viewer, limit: number): Promise<RecentContactRow[]>;
	recentNotes(viewer: Viewer, limit: number): Promise<RecentNoteRow[]>;
}

export interface DashboardDeps {
	dashboard: DashboardRepository;
}

/** Fetch recent visible records and compose the signed-in member's dashboard. */
export async function buildDashboard(deps: DashboardDeps, viewer: Viewer): Promise<Dashboard> {
	// fetch a little more than each panel shows so "your contributions" has enough to filter
	const [contacts, notes] = await Promise.all([
		deps.dashboard.recentContacts(viewer, 12),
		deps.dashboard.recentNotes(viewer, 12)
	]);
	return assembleDashboard(contacts, notes, viewer.id);
}
