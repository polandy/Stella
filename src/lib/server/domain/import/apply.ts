import type { Clock } from '../../clock';
import type { Visibility } from '../../access/visibility';
import { planMonicaImport, type ImportCounts, type ImportPlan } from './monica/plan';
import { readImportFile } from './read';

/*
 * Import use-cases (docs/02 §2.16): preview an export, then apply its plan. Either of
 * Monica's formats arrives here as text and is recognised by `readImportFile`. The plan is pure;
 * writing it is the repository's job and happens in one transaction, so a failure half-way
 * leaves nothing behind. Because every row carries a stable source id, applying the same
 * dump again inserts only what is new — the outcome reports what was actually written so a
 * re-run is visibly a no-op rather than a silent one.
 */

/** What the repository actually inserted; equals the plan's counts on a first run. */
export interface ImportOutcome {
	inserted: ImportCounts;
}

/** Port the domain owns; the adapter writes a whole plan atomically. */
export interface ImportRepository {
	applyPlan(plan: ImportPlan): Promise<ImportOutcome>;
}

export interface ImportDeps {
	importer: ImportRepository;
	clock: Clock;
}

export interface ImportRequest {
	householdId: string;
	userId: string;
	visibility: Visibility;
}

/**
 * Parse and plan a Monica export without writing anything. Throws `SqlDumpError` or
 * `MonicaJsonError` when the file is not one Monica wrote.
 */
export function previewImport(
	deps: Pick<ImportDeps, 'clock'>,
	fileText: string,
	request: ImportRequest
): ImportPlan {
	return planMonicaImport(readImportFile(fileText), { ...request, now: deps.clock.now() });
}

/** Plan and apply a Monica export. Returns the plan (for the report) and what was written. */
export async function applyImport(
	deps: ImportDeps,
	fileText: string,
	request: ImportRequest
): Promise<{ plan: ImportPlan; outcome: ImportOutcome }> {
	const plan = previewImport(deps, fileText, request);
	const outcome = await deps.importer.applyPlan(plan);
	return { plan, outcome };
}
