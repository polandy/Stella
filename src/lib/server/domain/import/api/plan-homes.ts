import { isSameAddress } from '../../../../people/same-address';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { NewHome } from '../../homes/homes';
import { homeIdFor, type ApiImportDocument, type ApiPerson } from './document';
import type { ApiImportContext, ApiImportProblem, ApiImportReport, PlannedResident } from './plan';

/*
 * Who lives together, in an API import (docs/02 §2.16.1): an entry's `home: { with: ref }`
 * moves it in with the person that ref names, as *Also lives here …* does on a person page
 * (docs/02 §2.2, *A shared home*). That person — the holder — must have exactly one address to
 * share: the one home they live in, or else their one own address, which becomes a home and
 * leaves their fields. Two of either is refused rather than guessed, and so is a holder who
 * lives with somebody else in turn, so the document says plainly whose address it is.
 *
 * Someone moving in loses an own line equal to the home's after folding, as on the page; a
 * different one stays theirs. The home made of a ref's address is stored under an id of the
 * source and that ref, so a second sending finds everyone in it already and changes nothing.
 */

/** The home a holder's housemates move into, or why there is none. */
type Settled = { homeId: string; value: string } | { problem: 'homeNoAddress' | 'homeAmbiguous' };

/** What the people half of the plan hands over: the refs' ids, their new fields, the report. */
interface PlannedPeople {
	idByRef: ReadonlyMap<string, string>;
	fields: readonly NewContactField[];
	report: ApiImportReport['people'];
}

export function planHomes(
	document: ApiImportDocument,
	context: ApiImportContext,
	people: PlannedPeople,
	problems: ApiImportProblem[]
) {
	const entryByRef = new Map<string, ApiPerson>();
	for (const entry of document.people) {
		if (!entryByRef.has(entry.ref)) entryByRef.set(entry.ref, entry);
	}
	let fields = [...people.fields];
	const homes: NewHome[] = [];
	const droppedFields: { contactId: string; fieldId: string }[] = [];
	const residents: PlannedResident[] = [];
	const fieldsLeftOut = new Map<string, number>();
	let fieldsAlreadyThere = 0;
	let residentsAlreadyThere = 0;
	const settledByRef = new Map<string, Settled>();

	const resident = (homeId: string, contactId: string): PlannedResident => ({
		homeId,
		contactId,
		createdBy: context.actorId,
		createdAt: context.now
	});
	const isAddress = (field: { kind: string }) => field.kind === 'address';

	/** The holder's one address, made a home when it is not one yet. */
	function settle(ref: string, holderId: string): Settled {
		const held = context.homesOf.get(holderId) ?? [];
		if (held.length > 1) return { problem: 'homeAmbiguous' };
		if (held.length === 1) return { homeId: held[0].id, value: held[0].value };

		const own = (context.fieldsOf.get(holderId) ?? []).filter(isAddress);
		const sent = fields.filter((f) => f.contactId === holderId && isAddress(f));
		if (own.length + sent.length === 0) return { problem: 'homeNoAddress' };
		if (own.length + sent.length > 1) return { problem: 'homeAmbiguous' };

		const address = own[0] ?? sent[0];
		const homeId = homeIdFor(document.source, ref);
		homes.push({
			id: homeId,
			householdId: context.householdId,
			label: address.label,
			value: address.value,
			meta: address.meta,
			createdBy: context.actorId,
			createdAt: context.now,
			updatedAt: context.now
		});
		if (own.length === 1) droppedFields.push({ contactId: holderId, fieldId: own[0].id });
		else fields = fields.filter((f) => f.id !== sent[0].id);
		residents.push(resident(homeId, holderId));
		return { homeId, value: address.value };
	}

	document.people.forEach((entry, index) => {
		if (!entry.home) return;
		const path = `people[${index}].home.with`;
		const ref = entry.home.with;
		const holder = entryByRef.get(ref);
		if (!holder) {
			problems.push({ code: 'unknownRef', path, ref });
			return;
		}
		if (ref === entry.ref) {
			problems.push({ code: 'homeSelf', path, ref });
			return;
		}
		if (holder.home) {
			problems.push({ code: 'homeChain', path, ref });
			return;
		}
		const contactId = people.idByRef.get(entry.ref);
		const holderId = people.idByRef.get(ref);
		// Either entry was refused already, for a reason named at its own path.
		if (contactId === undefined || holderId === undefined) return;

		let settled = settledByRef.get(ref);
		if (!settled) {
			settled = settle(ref, holderId);
			settledByRef.set(ref, settled);
		}
		if ('problem' in settled) {
			problems.push({ code: settled.problem, path, ref });
			return;
		}

		const { homeId, value } = settled;
		if ((context.homesOf.get(contactId) ?? []).some((h) => h.id === homeId)) {
			residentsAlreadyThere++;
			return;
		}
		residents.push(resident(homeId, contactId));
		for (const own of context.fieldsOf.get(contactId) ?? []) {
			if (isAddress(own) && isSameAddress(own.value, value)) {
				droppedFields.push({ contactId, fieldId: own.id });
			}
		}
		const giveWay = fields.filter(
			(f) => f.contactId === contactId && isAddress(f) && isSameAddress(f.value, value)
		);
		if (giveWay.length > 0) {
			fields = fields.filter((f) => !giveWay.includes(f));
			fieldsAlreadyThere += giveWay.length;
			fieldsLeftOut.set(entry.ref, giveWay.length);
		}
	});

	const report = people.report.map((p) => {
		const leftOut = fieldsLeftOut.get(p.ref) ?? 0;
		return leftOut === 0 ? p : { ...p, fieldsAdded: p.fieldsAdded - leftOut };
	});
	return {
		fields,
		homes,
		droppedFields,
		residents,
		report,
		fieldsAlreadyThere,
		residentsAlreadyThere
	};
}
