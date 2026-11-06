import type { CardLabel } from '../../../../import-match/card';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { SourceExport } from './monica-export';
import type { ImportWording, MonicaPlanContext } from './plan';
import { orNull } from './text';

/*
 * Monica's contact fields and addresses as Stella's contact fields (docs/02 §2.16,
 * docs/monica-mapping.md), in the order the export lists them.
 */

/** A card's label in words: a known one in the member's language, a typed one as written. */
export const fieldLabelText = (
	label: CardLabel | null,
	wording: Pick<ImportWording, 'fieldLabel'>
): string | null =>
	label === null ? null : 'known' in label ? wording.fieldLabel(label.known) : label.typed;

export function planContactFields(exp: SourceExport, ctx: MonicaPlanContext): NewContactField[] {
	const { prefix, contactId, liveIds, opts, skip } = ctx;
	const fieldTypes = new Map(exp.contactFieldTypes.map((t) => [t.id, t]));
	const contactFields: NewContactField[] = [];
	let sortOrder = 0;
	const fieldStamp = { createdAt: opts.now, updatedAt: opts.now, meta: null };
	for (const f of exp.contactFields) {
		if (!liveIds.has(f.contactId)) {
			skip('contactField', 'belongsToDeletedContact');
			continue;
		}
		const type = fieldTypes.get(f.typeId);
		const base = {
			id: `${prefix}:field:${f.id}`,
			contactId: contactId(f.contactId),
			sortOrder: sortOrder++,
			...fieldStamp
		};
		const label = fieldLabelText(f.label ?? null, opts.wording);
		if (type?.type === 'email')
			contactFields.push({ ...base, kind: 'email', label, value: f.data });
		else if (type?.type === 'phone')
			contactFields.push({ ...base, kind: 'phone', label, value: f.data });
		// A vCard's URL already carries its scheme; only Monica's own types need one prefixed.
		else if (type?.type === 'url')
			contactFields.push({ ...base, kind: 'url', label, value: f.data });
		else if (type?.protocol?.startsWith('http')) {
			contactFields.push({
				...base,
				kind: 'url',
				label: type.name,
				value: `${type.protocol}${f.data}`
			});
		} else
			contactFields.push({ ...base, kind: 'custom', label: type?.name ?? null, value: f.data });
	}
	for (const a of exp.addresses) {
		if (!liveIds.has(a.contactId)) {
			skip('address', 'belongsToDeletedContact');
			continue;
		}
		const cityLine = orNull([a.postalCode, a.city].filter(Boolean).join(' '));
		const value = [a.street, cityLine, a.province, a.country]
			.map(orNull)
			.filter(Boolean)
			.join(', ');
		if (!value) {
			skip('address', 'empty');
			continue;
		}
		contactFields.push({
			id: `${prefix}:address:${a.id}`,
			contactId: contactId(a.contactId),
			kind: 'address',
			label: orNull(a.name),
			value,
			sortOrder: sortOrder++,
			...fieldStamp
		});
	}
	return contactFields;
}
