import * as v from 'valibot';
import { CONTACT_FIELD_KINDS } from '../people/contact-fields';
import { IMPORTANT_DATE_KINDS } from '../dates/kinds';
import { GENDERS } from '../people/gender';
import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '../relationships/status';
import { TAG_COLORS } from '../design/tag-colors';
import { nonEmpty, optionalText, requiredText, visibility } from './payload-fields';

/*
 * What the commands about a person themselves carry (docs/dev/04 §4.11.2) — adding them, their
 * tags, circles, links, ways to reach them and dates — one Valibot schema each.
 */

/** A tag put on a person by name; a name the household has not used yet makes a new tag. */
export const TagAssignSchema = v.object({
	contactId: nonEmpty,
	name: requiredText,
	color: v.optional(v.nullable(v.picklist(TAG_COLORS)), null)
});

/** A person put in a circle by name; a name nobody visible uses yet makes a new circle. */
export const CircleJoinSchema = v.object({
	contactId: nonEmpty,
	circleName: requiredText,
	role: optionalText
});

/** A link between the person whose page it was entered on and someone else (docs/dev/02 §2.4). */
export const RelationshipAddSchema = v.object({
	contactId: nonEmpty,
	targetId: nonEmpty,
	/** Type *and* side, as the picker encodes them (`encodeRelationshipChoice`). */
	typeChoice: nonEmpty,
	description: optionalText,
	sinceDate: optionalText,
	untilDate: optionalText,
	status: optionalText
});

/**
 * One type of link between the person whose page it was entered on and several others at once
 * (docs/dev/02 §2.4, ADR-118). The type, status and description are shared; each pair keeps its
 * own since day. Applied all or nothing: one person refused, and none of the links is stored.
 */
export const RelationshipAddManySchema = v.object({
	contactId: nonEmpty,
	/** Type *and* side, as the picker encodes them (`encodeRelationshipChoice`). */
	typeChoice: nonEmpty,
	// A link that exists is current until someone ends it, so "not said" reads as current.
	status: v.optional(
		v.pipe(
			v.nullable(v.picklist(RELATIONSHIP_STATUSES)),
			v.transform((status) => status ?? CURRENT_RELATIONSHIP_STATUS)
		),
		CURRENT_RELATIONSHIP_STATUS
	),
	/** Copied onto each link; editable on its own row afterwards. */
	description: optionalText,
	untilDate: optionalText,
	/** At least one; a since day the form worked out per pair, or null for none. */
	links: v.pipe(v.array(v.object({ targetId: nonEmpty, sinceDate: optionalText })), v.minLength(1))
});

/** A new person, as the *Add person* form hands them over (docs/dev/02 §2.2). */
export const ContactAddSchema = v.pipe(
	v.object({
		firstName: optionalText,
		lastName: optionalText,
		nickname: optionalText,
		description: optionalText,
		howWeMet: optionalText,
		metPlace: optionalText,
		/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is not known. */
		birthDate: optionalText,
		/** A `YYYY` worked out from an age alone; absent from an older build, meaning none. */
		birthYearEstimate: optionalText,
		// Left out by a build from before the field, which is the same as none chosen.
		gender: v.optional(v.nullable(v.picklist(GENDERS)), null),
		visibility,
		// "This is me" (docs/dev/02 §2.1.3): Stella records this person as who the member is. Absent
		// from a build that predates it, which means no.
		isSelf: v.optional(v.boolean(), false)
	}),
	// A person needs something to be called by (docs/dev/02 §2.2).
	v.check((p) => Boolean(p.firstName || p.lastName || p.nickname))
);

/** A phone number, address or other way to reach a person (docs/dev/02 §2.3). */
export const FieldAddSchema = v.object({
	contactId: nonEmpty,
	kind: v.picklist(CONTACT_FIELD_KINDS),
	label: optionalText,
	value: requiredText
});

/**
 * A birth year worked out from an age alone (docs/dev/02 §2.13.1), on the writer's device so a
 * kept command keeps its year. Whether an age gives it is the use-case's to judge.
 */
export const BirthEstimateSchema = v.object({
	contactId: nonEmpty,
	year: v.pipe(v.string(), v.regex(/^\d{4}$/))
});

/**
 * An important date on a person (docs/dev/02 §2.13). The day — ISO `YYYY-MM-DD`, or `--MM-DD`
 * when the year is not known — is the use-case's to judge, with a reason to show.
 */
export const DateAddSchema = v.object({
	contactId: nonEmpty,
	kind: v.picklist(IMPORTANT_DATE_KINDS),
	label: optionalText,
	date: requiredText,
	recursYearly: v.optional(v.boolean(), true),
	remind: v.optional(v.boolean(), true)
});
