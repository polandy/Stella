import type { JsonCommand } from '../commands/commands';
import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from './status';

/*
 * The relationships card's add form, read as the command it saves (docs/02 §2.4). One person
 * picked saves exactly as it always has, as `relationship.add`; several save as one
 * `relationship.addMany` batch, all or nothing (ADR-118), the type, status and description
 * shared and the since day per pair.
 */

export interface AddRelationshipIssue {
	/** The command's name, made where it was issued. */
	id: string;
	/** The person whose page the form is on. */
	contactId: string;
	issuedAt: number;
}

/** The command the form's fields make, or null when they do not make one. */
export function addRelationshipCommand(
	fields: FormData,
	issue: AddRelationshipIssue
): JsonCommand | null {
	const targetIds = fields.getAll('targetId').map(String).filter(Boolean);
	const typeChoice = String(fields.get('typeChoice') ?? '');
	if (targetIds.length === 0 || !typeChoice) return null;
	const text = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null;
	const { id, contactId, issuedAt } = issue;
	if (targetIds.length === 1) {
		return {
			id,
			type: 'relationship.add',
			payload: {
				contactId,
				targetId: targetIds[0],
				typeChoice,
				description: text(fields.get('description')),
				sinceDate: text(fields.get('sinceDate')),
				status: text(fields.get('status'))
			},
			issuedAt
		};
	}
	// One field for every pair, or one per pair in the order the people were picked.
	const sinceDates = fields.getAll('sinceDate');
	if (sinceDates.length !== 1 && sinceDates.length !== targetIds.length) return null;
	const status = RELATIONSHIP_STATUSES.find((s) => s === fields.get('status'));
	return {
		id,
		type: 'relationship.addMany',
		payload: {
			contactId,
			typeChoice,
			status: status ?? CURRENT_RELATIONSHIP_STATUS,
			description: text(fields.get('description')),
			links: targetIds.map((targetId, index) => ({
				targetId,
				sinceDate: text(sinceDates.length === 1 ? sinceDates[0] : sinceDates[index])
			}))
		},
		issuedAt
	};
}
