import type { BirthDatePrecision } from '../../contacts/contacts';
import { deriveDisplayName } from '../../../../people/display-name';
import type { Gender } from '../../../../people/gender';
import { resolveTagColor, type NewTag } from '../../tags/tags';
import type { MonicaContact, MonicaId, MonicaSpecialDate, SourceExport } from './monica-export';
import type { ImportedContact, ImportedPhoto, ImportWording, MonicaPlanContext } from './plan';
import { orNull } from './text';

/*
 * The Monica contacts that were not deleted there, with the tags on them and their photos
 * (docs/02 §2.16, docs/monica-mapping.md).
 */

/** Monica's gender codes → Stella's gender. "Prefer not to say" stays empty. */
const GENDER: Record<string, Gender> = { M: 'male', F: 'female' };

/** A Monica special date → Stella's stored value plus precision (docs/03 §3.4). */
function birthDateOf(date: MonicaSpecialDate | undefined): {
	birthDate: string | null;
	birthDatePrecision: BirthDatePrecision;
} {
	if (!date) return { birthDate: null, birthDatePrecision: 'full' };
	if (date.isAgeBased) return { birthDate: date.date.slice(0, 4), birthDatePrecision: 'age' };
	if (date.isYearUnknown)
		return { birthDate: `--${date.date.slice(5)}`, birthDatePrecision: 'month_day' };
	return { birthDate: date.date, birthDatePrecision: 'full' };
}

function howWeMetOf(
	c: MonicaContact,
	nameOf: (id: MonicaId) => string | null,
	wording: ImportWording
): string | null {
	const info = orNull(c.firstMetAdditionalInfo);
	const through = c.firstMetThroughContactId === null ? null : nameOf(c.firstMetThroughContactId);
	if (info && through) return wording.metThroughInfo(info, through);
	if (through) return wording.metThrough(through);
	return info;
}

export function planContacts(
	exp: SourceExport,
	live: readonly MonicaContact[],
	ctx: MonicaPlanContext
): ImportedContact[] {
	const { contactId, opts, stamp } = ctx;
	const wording = opts.wording;
	const specialDates = new Map(exp.specialDates.map((d) => [d.id, d]));
	const genders = new Map(exp.genders.map((g) => [g.id, g.type]));
	const nameOf = (id: MonicaId): string | null => {
		const c = exp.contacts.find((x) => x.id === id);
		return c
			? deriveDisplayName(
					{ firstName: c.firstName, lastName: c.lastName, nickname: c.nickname },
					opts.locale
				)
			: null;
	};

	return live.map((c): ImportedContact => {
		const firstName = orNull([c.firstName, c.middleName].filter(Boolean).join(' '));
		const lastName = orNull(c.lastName);
		const nickname = orNull(c.nickname);
		const birthday = birthDateOf(
			c.birthdaySpecialDateId === null ? undefined : specialDates.get(c.birthdaySpecialDateId)
		);
		const death =
			c.deceasedSpecialDateId === null ? undefined : specialDates.get(c.deceasedSpecialDateId);
		const met =
			c.firstMetSpecialDateId === null ? undefined : specialDates.get(c.firstMetSpecialDateId);
		const genderType = c.genderId === null ? null : (genders.get(c.genderId) ?? null);
		return {
			id: contactId(c.id),
			householdId: opts.householdId,
			...stamp,
			displayName: deriveDisplayName({ firstName, lastName, nickname }, opts.locale),
			firstName,
			lastName,
			nickname,
			description: orNull(c.description),
			howWeMet: howWeMetOf(c, nameOf, wording),
			metDate: met?.date ?? null,
			metPlace: orNull(c.firstMetWhere),
			...birthday,
			gender: genderType === null ? null : (GENDER[genderType] ?? null),
			jobTitle: orNull(c.job),
			company: orNull(c.company),
			isDeceased: c.isDead,
			deathDate: death?.date ?? null
		};
	});
}

export function planTags(
	exp: SourceExport,
	ctx: MonicaPlanContext
): { tags: NewTag[]; contactTags: { contactId: string; tagId: string }[] } {
	const { prefix, contactId, liveIds, opts } = ctx;
	const tags: NewTag[] = [];
	const contactTags: { contactId: string; tagId: string }[] = [];
	for (const t of exp.tags) {
		const tagId = `${prefix}:tag:${t.id}`;
		tags.push({
			id: tagId,
			householdId: opts.householdId,
			name: t.name,
			color: resolveTagColor(null),
			createdAt: opts.now,
			updatedAt: opts.now
		});
		for (const c of t.contactIds) {
			if (liveIds.has(c)) contactTags.push({ contactId: contactId(c), tagId });
		}
	}
	return { tags, contactTags };
}

export function planPhotos(
	exp: SourceExport,
	live: readonly MonicaContact[],
	ctx: MonicaPlanContext
): ImportedPhoto[] {
	const { prefix, contactId, liveIds, skip } = ctx;
	const avatarOf = new Map(
		live
			.filter((c) => c.avatarSource === 'photo' && c.avatarPhotoId !== null)
			.map((c) => [c.avatarPhotoId!, c.id])
	);
	const photos: ImportedPhoto[] = [];
	for (const p of exp.photos) {
		if (p.contactId === null) {
			skip('photo', 'attachedToNoPerson');
			continue;
		}
		if (!liveIds.has(p.contactId)) {
			skip('photo', 'belongsToDeletedContact');
			continue;
		}
		photos.push({
			id: `${prefix}:photo:${p.id}`,
			contactId: contactId(p.contactId),
			sourcePath: p.path,
			mime: p.mime,
			sizeBytes: p.sizeBytes,
			isAvatar: avatarOf.get(p.id) === p.contactId,
			dataUrl: p.dataUrl
		});
	}
	return photos;
}
