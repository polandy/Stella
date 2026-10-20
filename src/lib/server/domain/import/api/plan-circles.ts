import { endsBeforeItStarts } from '../../circles/circle-details';
import { resolveCircleColor, resolveCircleKind } from '../../circles/circles';
import { closesLoop } from '../../circles/nesting';
import {
	circleIdFor,
	isExistingCircle,
	membershipIdFor,
	type ApiCircleDetails,
	type ApiExistingCircle,
	type ApiImportDocument
} from './document';
import type {
	ApiCircleChanges,
	ApiImportContext,
	ApiImportProblem,
	ApiImportReport,
	KnownCircle,
	PlannedCircle,
	PlannedCircleChange,
	PlannedMembership,
	ReportedParent
} from './plan';
import { orNull } from './text';

/*
 * The circles of an API import (docs/02 §2.16.1): new ones created, existing ones given members
 * and — for a circle already in Stella — the details its entry names set. A circle this document
 * created before is left as it is now, hand edits and all.
 *
 * A parent is always a ref listed **earlier**, read before the entry's own ref is known. For a
 * new circle that alone rules out a loop; a circle already in Stella can sit above others, so a
 * move is walked up the household's whole nesting — hidden circles included, as `circleParents`
 * carries them — with every earlier move of the same document applied. The walk is the one the
 * circle page's moves use (`closesLoop`, ADR-126).
 */

type ChangedColumns = PlannedCircleChange['set'];

export function planCircles(
	document: ApiImportDocument,
	context: ApiImportContext,
	personIdByRef: ReadonlyMap<string, string>,
	problems: ApiImportProblem[]
) {
	const { source } = document;
	const visibility = document.visibility ?? context.defaultVisibility;
	const stamps = { createdAt: context.now, updatedAt: context.now };
	const circleIdByRef = new Map<string, string>();
	/** The name of each circle an entry was planned for, as it is after this sending. */
	const nameById = new Map<string, string>();
	/** The household's nesting as it is after the entries planned so far. */
	const parentOf = new Map(context.circleParents);
	const rows: PlannedCircle[] = [];
	const circleChanges: PlannedCircleChange[] = [];
	const memberships: PlannedMembership[] = [];
	const report: ApiImportReport['circles'] = [];
	let alreadyThere = 0;

	/**
	 * The circle a parent ref stands for, if it can be had: one whose own entry was refused
	 * already says why, and is no parent to anything.
	 */
	const parentNamed = (ref: string | null): string | null | undefined => {
		if (ref === null) return null;
		const id = circleIdByRef.get(ref);
		return id !== undefined && nameById.has(id) ? id : undefined;
	};

	const checkPeriod = (start: string | null, end: string | null, path: string) => {
		if (start !== null && end !== null && endsBeforeItStarts(start, end)) {
			problems.push({ code: 'periodBackwards', path });
		}
	};

	document.circles.forEach((entry, index) => {
		const at = `circles[${index}]`;
		if (circleIdByRef.has(entry.ref)) {
			problems.push({ code: 'duplicateRef', path: `${at}.ref`, ref: entry.ref });
			return;
		}
		const id = isExistingCircle(entry) ? entry.existingId : circleIdFor(source, entry.ref);
		const parentRef = isExistingCircle(entry)
			? 'parent' in entry.details
				? (entry.details.parent ?? null)
				: null
			: entry.parent;
		const parentCircleId = parentNamed(parentRef);
		const parentUnknown = parentRef !== null && !circleIdByRef.has(parentRef);
		circleIdByRef.set(entry.ref, id);
		const known = context.circles.get(id);

		if (isExistingCircle(entry)) {
			if (!known) {
				problems.push({ code: 'circleNotFound', path: `${at}.existingId`, id: entry.existingId });
				return;
			}
			const moves = 'parent' in entry.details && parentCircleId !== undefined;
			if (moves && parentCircleId !== null && closesLoop(id, parentCircleId, parentOf)) {
				problems.push({ code: 'circleCycle', path: `${at}.parent`, ref: parentRef ?? '' });
			}
			const { set, changes } = changesOf(
				entry,
				known,
				moves ? parentCircleId : undefined,
				nameById
			);
			// The period is checked whole — the half the entry keeps included — but only when the
			// entry sends a date: a rename is no reason to refuse what is already stored.
			const datesSent = 'startDate' in entry.details || 'endDate' in entry.details;
			if (datesSent) {
				const start = 'startDate' in set ? (set.startDate ?? null) : known.startDate;
				const end = 'endDate' in set ? (set.endDate ?? null) : known.endDate;
				checkPeriod(start, end, `${at}.${'endDate' in entry.details ? 'endDate' : 'startDate'}`);
			}
			if (Object.keys(set).length > 0) {
				circleChanges.push({ id, set, updatedAt: context.now });
			}
			if ('parentCircleId' in set) parentOf.set(id, set.parentCircleId ?? null);
			const name = set.name ?? known.name;
			nameById.set(id, name);
			report.push({ ref: entry.ref, id, name, status: 'existing', changes });
		} else if (context.hiddenIds.has(id)) {
			problems.push({ code: 'idTaken', path: `${at}.ref`, ref: entry.ref });
		} else if (known) {
			nameById.set(id, known.name);
			report.push({ ref: entry.ref, id, name: known.name, status: 'imported', changes: {} });
		} else {
			const name = entry.name.trim();
			const startDate = orNull(entry.startDate);
			const endDate = orNull(entry.endDate);
			checkPeriod(startDate, endDate, `${at}.endDate`);
			rows.push({
				id,
				householdId: context.householdId,
				createdBy: context.actorId,
				visibility,
				name,
				description: orNull(entry.description),
				kind: resolveCircleKind(entry.kind),
				color: resolveCircleColor(null),
				parentCircleId: parentCircleId ?? null,
				startDate,
				endDate,
				...stamps
			});
			parentOf.set(id, parentCircleId ?? null);
			nameById.set(id, name);
			report.push({ ref: entry.ref, id, name, status: 'new', changes: {} });
		}

		if (parentUnknown) {
			problems.push({ code: 'unknownRef', path: `${at}.parent`, ref: parentRef });
		}

		const members = new Set(known?.memberIds ?? []);
		const named = new Set<string>();
		entry.members.forEach((member, position) => {
			const memberAt = `${at}.members[${position}]`;
			if (named.has(member.person)) {
				problems.push({ code: 'duplicateMember', path: memberAt, ref: member.person });
				return;
			}
			named.add(member.person);
			const contactId = personIdByRef.get(member.person);
			if (contactId === undefined) {
				problems.push({ code: 'unknownRef', path: `${memberAt}.person`, ref: member.person });
				return;
			}
			if (members.has(contactId)) {
				alreadyThere++;
				return;
			}
			memberships.push({
				id: membershipIdFor(source, entry.ref, member.person),
				circleId: id,
				contactId,
				role: orNull(member.role),
				startDate: orNull(member.startDate),
				endDate: orNull(member.endDate),
				createdBy: context.actorId,
				...stamps
			});
		});
	});

	return { rows, circleChanges, memberships, report, alreadyThere };
}

/**
 * The columns an existing circle's entry changes, and the report of each old → new. A detail the
 * entry leaves out is no change, and neither is one sent as the circle already has it — which is
 * what keeps a re-send a no-op. `parentId` is undefined when the entry does not move the circle.
 */
function changesOf(
	entry: ApiExistingCircle,
	known: KnownCircle,
	parentId: string | null | undefined,
	nameById: ReadonlyMap<string, string>
): { set: ChangedColumns; changes: ApiCircleChanges } {
	const set: ChangedColumns = {};
	const changes: ApiCircleChanges = {};
	const sent: Partial<ApiCircleDetails> = entry.details;

	if (sent.name !== undefined) {
		const name = sent.name.trim();
		if (name !== known.name) {
			set.name = name;
			changes.name = { from: known.name, to: name };
		}
	}
	if (sent.kind !== undefined && sent.kind !== known.kind) {
		set.kind = sent.kind;
		changes.kind = { from: known.kind, to: sent.kind };
	}
	for (const key of ['description', 'startDate', 'endDate'] as const) {
		if (!(key in sent)) continue;
		const value = orNull(sent[key] ?? null);
		if (value === known[key]) continue;
		set[key] = value;
		changes[key] = { from: known[key], to: value };
	}
	if (parentId !== undefined && parentId !== (known.parent?.id ?? null)) {
		set.parentCircleId = parentId;
		changes.parent = {
			from: reportedParent(known.parent),
			to: parentId === null ? null : { id: parentId, name: nameById.get(parentId) ?? parentId }
		};
	}
	return { set, changes };
}

const reportedParent = (parent: KnownCircle['parent']): ReportedParent | null =>
	parent === null
		? null
		: parent.name === null
			? { hidden: true }
			: { id: parent.id, name: parent.name };
