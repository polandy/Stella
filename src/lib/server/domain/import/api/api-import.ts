import type { Viewer, Visibility } from '../../../access/visibility';
import type { Clock } from '../../../clock';
import type { IdGenerator } from '../../../id';
import type { NewActivityEntry } from '../../activity/activity';
import type { ApiImportDocument } from './document';
import {
	idsNamedBy,
	planApiImport,
	type ApiImportContext,
	type ApiImportPlan,
	type ApiImportProblem,
	type ApiImportReport
} from './plan';

/*
 * The import API's use-case (docs/02 §2.16.1). The member's token has already been resolved to
 * them at the edge; from here on an API import is that member adding people, so every read is
 * scoped to what they may see and every record is written as theirs.
 *
 * A dry run stops after planning: it is the same reading and the same answer, which is what
 * makes it worth asking for before the real thing.
 */

/** What the household holds for one document — the context minus who is asking and when. */
export type HouseholdReading = Omit<
	ApiImportContext,
	'householdId' | 'actorId' | 'defaultVisibility' | 'now'
>;

/** How many rows of each kind were written (or, in a dry run, would be). */
export interface ApiImportCounts {
	people: number;
	fields: number;
	relationships: number;
	circles: number;
	memberships: number;
}

/** Port the domain owns; the adapter reads with the member's scope and writes in one go. */
export interface ApiImportRepository {
	readHousehold(
		viewer: Viewer,
		ids: { contactIds: string[]; circleIds: string[] }
	): Promise<HouseholdReading>;
	/**
	 * Write the plan and the log entry in **one** transaction, leaving out any row whose id or
	 * unique key is already taken — so two sendings racing each other still add everything once.
	 * Returns what was actually inserted.
	 */
	applyPlan(plan: ApiImportPlan, audit: NewActivityEntry | null): Promise<ApiImportCounts>;
}

export interface ApiImportDeps {
	imports: ApiImportRepository;
	clock: Clock;
	ids: IdGenerator;
}

/** Who is importing: a household member, through their token. */
export interface ApiImportActor {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
}

/**
 * The words the import writes into the household's log. The entry is data the household keeps,
 * so it is written in the language of the member whose token sent the document (docs/02 §2.19).
 */
export interface ApiImportWording {
	/** "imported 12 people from kindergarten-2023". */
	imported: (people: number, source: string) => string;
}

export interface ApiImportOptions {
	dryRun: boolean;
	wording: ApiImportWording;
}

export type ApiImportResult =
	| { ok: true; dryRun: boolean; added: ApiImportCounts; report: ApiImportReport }
	| { ok: false; problems: ApiImportProblem[] };

const countsOf = (plan: ApiImportPlan): ApiImportCounts => ({
	people: plan.contacts.length,
	fields: plan.fields.length,
	relationships: plan.relationships.length,
	circles: plan.circles.length,
	memberships: plan.memberships.length
});

const isEmpty = (counts: ApiImportCounts) => Object.values(counts).every((n) => n === 0);

/** Plan a document for the member and, unless it is a dry run, write it. */
export async function importViaApi(
	deps: ApiImportDeps,
	actor: ApiImportActor,
	document: ApiImportDocument,
	options: ApiImportOptions
): Promise<ApiImportResult> {
	const viewer: Viewer = { id: actor.userId, householdId: actor.householdId };
	const reading = await deps.imports.readHousehold(viewer, idsNamedBy(document));
	const now = deps.clock.now();
	const planned = planApiImport(document, {
		...reading,
		householdId: actor.householdId,
		actorId: actor.userId,
		defaultVisibility: actor.defaultVisibility,
		now
	});
	if (!planned.ok) return planned;
	const { plan } = planned;

	const wouldAdd = countsOf(plan);
	if (options.dryRun) return { ok: true, dryRun: true, added: wouldAdd, report: plan.report };

	// A re-sent document adds nothing, and a log entry saying "imported 0 people" is noise.
	const audit: NewActivityEntry | null = isEmpty(wouldAdd)
		? null
		: {
				id: deps.ids.next(),
				householdId: actor.householdId,
				actorId: actor.userId,
				action: 'import',
				entityType: 'household',
				entityId: actor.householdId,
				contactId: null,
				// Mirrors what was imported: a private batch is logged for its author alone.
				visibility: document.visibility ?? actor.defaultVisibility,
				summary: options.wording.imported(plan.contacts.length, document.source),
				createdAt: now
			};
	const added = await deps.imports.applyPlan(plan, audit);
	return { ok: true, dryRun: false, added, report: plan.report };
}
