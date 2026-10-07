/*
 * The command vocabulary (docs/04 §4.11.2): every change a member can
 * make, by name, with the payload it carries and the kind of change it is. Pure and shared, so
 * the outbox on a phone and the dispatcher on the server agree on one spelling — and on which
 * commands a device may hold back while Stella is out of reach. Not under `server/`, so the
 * browser can import it; `MentionAudience` stands in for the server's `Visibility`.
 */

import type { ContactFieldKind } from '../contact-fields/kinds';
import type { ImportantDateKind } from '../dates/kinds';
import type { InteractionKind } from '../interactions/kinds';
import type { MentionAudience } from '../mentions/audience';
import type { Gender } from '../people/gender';
import type { RelationshipStatus } from '../relationships/status';

/** What a command does to the household's data. Only an addition may wait on a device. */
export type CommandKind = 'add' | 'change' | 'remove';

/** Every command, and its kind. */
const KINDS = {
	'moment.capture': 'add',
	'moment.photo': 'add',
	'note.add': 'add',
	'interaction.log': 'add',
	'tag.assign': 'add',
	'circle.join': 'add',
	'relationship.add': 'add',
	'relationship.addMany': 'add',
	'contact.add': 'add',
	'journal.write': 'add',
	'field.add': 'add',
	'date.add': 'add',
	'gallery.add': 'add',
	'gallery.photo': 'add',
	'circleGallery.add': 'add',
	'circleGallery.photo': 'add'
} as const satisfies Record<string, CommandKind>;

/** One of the commands Stella knows. */
export type CommandType = keyof typeof KINDS;

/** Every command type, for iterating the vocabulary. */
export const COMMAND_TYPES = Object.keys(KINDS) as CommandType[];

/** A moment as the composer hands it over (docs/02 §2.22.1). */
export interface MomentCapturePayload {
	/** Markdown body with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	/** ISO `YYYY-MM-DD` day the moment is about — the writer's day, not the arrival's. */
	entryDate: string;
	visibility: MentionAudience;
	/**
	 * People the composer created with the moment. A person is mentioned in the body by the
	 * placeholder `@{contact:new:<key>}` until Stella has them; a bare display name is what an
	 * older build queued, found in the body by its `@Handle`.
	 */
	newPeople: (string | MomentNewPerson)[];
	/**
	 * The person whose page the moment was written on (docs/02 §2.20): it lands in their journal
	 * without an `@`. Absent, the first person mentioned is the anchor; a phone that queued the
	 * moment before the field existed sends none.
	 */
	anchorId?: string;
}

/** A person named for the first time in a moment, with what tells them apart (docs/02 §2.2.3). */
export interface MomentNewPerson {
	/** Made on the device; the mention's placeholder id is `newPersonMentionId(key)`. */
	key: string;
	firstName: string;
	lastName: string | null;
	description: string | null;
}

/** The id a moment's body mentions a person by until Stella has created them. */
export function newPersonMentionId(key: string): string {
	return `new:${key}`;
}

/**
 * A photo following the command it belongs to, named by that command's id: a moment or a
 * journal-page entry (`moment.photo`), a gallery upload (`gallery.photo`) or a circle's photo
 * upload (`circleGallery.photo`). The only commands
 * with bytes in them, so they travel as multipart rather than in a JSON batch.
 */
export interface PhotoPayload {
	parentId: string;
	image: Uint8Array;
	thumb: Uint8Array;
	/** A large circle photo's 1600 px view beside its full picture (docs/02 §2.4.2). */
	view?: Uint8Array;
	width: number;
	height: number;
	/** When it was taken, as its EXIF said (`../image/taken-at`); absent when it said nothing. */
	takenAt?: string;
}

/** A note on a person (docs/02 §2.5), as the person page's note form hands it over. */
export interface NoteAddPayload {
	contactId: string;
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	visibility: MentionAudience;
	isPinned: boolean;
}

/** A call, visit or other touchpoint with a person (docs/02 §2.6). */
export interface InteractionLogPayload {
	contactId: string;
	kind: InteractionKind;
	/** ISO `YYYY-MM-DD`. */
	happenedAt: string;
	title: string | null;
	description: string | null;
	visibility: MentionAudience;
	participantIds: string[];
}

/** A tag put on a person by name; a name the household has not used yet makes a new tag. */
export interface TagAssignPayload {
	contactId: string;
	name: string;
	color: string | null;
}

/** A person put in a circle by name; a name nobody visible uses yet makes a new circle. */
export interface CircleJoinPayload {
	contactId: string;
	circleName: string;
	role: string | null;
}

/** A link between the person whose page it was entered on and someone else (docs/02 §2.4). */
export interface RelationshipAddPayload {
	contactId: string;
	targetId: string;
	/** Type *and* side, as the picker encodes them (`encodeRelationshipChoice`). */
	typeChoice: string;
	description: string | null;
	sinceDate: string | null;
	status: string | null;
}

/**
 * One type of link between the person whose page it was entered on and several others at once
 * (docs/02 §2.4, ADR-118). The type, status and
 * description are shared; each pair keeps its own since day. Applied all or nothing: one
 * person refused, and none of the links is stored.
 */
export interface RelationshipAddManyPayload {
	contactId: string;
	/** Type *and* side, as the picker encodes them (`encodeRelationshipChoice`). */
	typeChoice: string;
	status: RelationshipStatus;
	/** Copied onto each link; editable on its own row afterwards. */
	description: string | null;
	/** At least one; a since day the form worked out per pair, or null for none. */
	links: { targetId: string; sinceDate: string | null }[];
}

/** A new person, as the *Add person* form hands them over (docs/02 §2.2). */
export interface ContactAddPayload {
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	description: string | null;
	howWeMet: string | null;
	metPlace: string | null;
	/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is not known. */
	birthDate: string | null;
	/** Optional: a phone that queued the person before the field existed sends none. */
	gender?: Gender | null;
	visibility: MentionAudience;
	/**
	 * The member is adding themselves: Stella records this person as who they are (docs/02
	 * §2.1.3). Optional: a phone that queued the person before the field existed sends none.
	 */
	isSelf?: boolean;
}

/** An entry written on a person's journal page (docs/02 §2.20); its photos follow it. */
export interface JournalWritePayload {
	contactId: string;
	/** ISO `YYYY-MM-DD` day the entry is about. */
	entryDate: string;
	title: string | null;
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	visibility: MentionAudience;
}

/** A phone number, address or other way to reach a person (docs/02 §2.3). */
export interface FieldAddPayload {
	contactId: string;
	kind: ContactFieldKind;
	label: string | null;
	value: string;
}

/** An important date on a person (docs/02 §2.13). */
export interface DateAddPayload {
	contactId: string;
	kind: ImportantDateKind;
	label: string | null;
	/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is not known. */
	date: string;
	recursYearly: boolean;
	remind: boolean;
}

/**
 * Photos going into a person's gallery (docs/02 §2.14). Carries no bytes itself: it checks
 * the person once, and each photo follows as a `gallery.photo` naming it.
 */
export interface GalleryAddPayload {
	contactId: string;
	visibility: MentionAudience;
}

/**
 * Photos going into a circle's gallery (docs/02 §2.4.2). Like a person's gallery upload it
 * carries no bytes: it checks the circle and the role once, and each photo follows as a
 * `circleGallery.photo` naming it.
 */
export interface CircleGalleryAddPayload {
	circleId: string;
	/** One of the circle's roles, or null for the circle as a whole. */
	role: string | null;
	visibility: MentionAudience;
}

/** The payload each command carries. */
export interface CommandPayloads {
	'moment.capture': MomentCapturePayload;
	'moment.photo': PhotoPayload;
	'note.add': NoteAddPayload;
	'interaction.log': InteractionLogPayload;
	'tag.assign': TagAssignPayload;
	'circle.join': CircleJoinPayload;
	'relationship.add': RelationshipAddPayload;
	'relationship.addMany': RelationshipAddManyPayload;
	'contact.add': ContactAddPayload;
	'journal.write': JournalWritePayload;
	'field.add': FieldAddPayload;
	'date.add': DateAddPayload;
	'gallery.add': GalleryAddPayload;
	'gallery.photo': PhotoPayload;
	'circleGallery.add': CircleGalleryAddPayload;
	'circleGallery.photo': PhotoPayload;
}

/** One intent from one member. */
export type Command = {
	[T in CommandType]: {
		/** Made where the command was issued, so a resend is recognisably the same command. */
		id: string;
		type: T;
		payload: CommandPayloads[T];
		/** When the member did it (epoch ms), not when it arrived. */
		issuedAt: number;
	};
}[CommandType];

/** A command that carries a photo's bytes, and so travels on its own as multipart. */
export type PhotoCommandType = 'moment.photo' | 'gallery.photo' | 'circleGallery.photo';

/** A command that travels in a JSON batch — every one but a photo. */
export type JsonCommand = Exclude<Command, { type: PhotoCommandType }>;

/** Whether `value` names a command Stella knows. */
export function isCommandType(value: unknown): value is CommandType {
	return typeof value === 'string' && Object.hasOwn(KINDS, value);
}

/** The kind of change `type` makes. */
export function kindOf(type: CommandType): CommandKind {
	return KINDS[type];
}

/**
 * Whether a device may hold `type` back until Stella answers again. Only additions: nothing
 * anyone else has seen is changed offline, so a queued command never meets a conflict.
 */
export function isQueueable(type: CommandType): boolean {
	return kindOf(type) === 'add';
}

/** The most commands one request to `POST /api/commands` may carry. */
export const MAX_COMMAND_BATCH = 50;

/**
 * What `POST /api/commands` answers for each command it was sent, in the order sent. The
 * outbox acts on the status alone: `applied` leaves the queue, `refused` becomes *Could not
 * send* with the reason (already in the member's language), and `busy` / `failed` stay queued
 * to be tried again — neither says anything about the command itself.
 */
/**
 * One person a refused batch names (`relationship.addMany`), with the reason in the member's
 * language — so the form marks that person's chip rather than only quoting the sentence.
 */
export interface RefusedTarget {
	targetId: string;
	reason: string;
}

export type CommandAnswer =
	| { id: string; status: 'applied'; result: unknown }
	| { id: string; status: 'refused'; reason: string; refusals?: RefusedTarget[] }
	| { id: string; status: 'busy' }
	| { id: string; status: 'failed' };

/** What a photo kept with a command of `type` is sent as, or null when it cannot carry photos. */
export function photoCommandFor(type: JsonCommand['type']): PhotoCommandType | null {
	switch (type) {
		case 'moment.capture':
		case 'journal.write':
			return 'moment.photo';
		case 'gallery.add':
			return 'gallery.photo';
		case 'circleGallery.add':
			return 'circleGallery.photo';
		default:
			return null;
	}
}
