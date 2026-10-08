/*
 * The command vocabulary (docs/04 §4.11.2): every change a member can
 * make, by name, with the payload it carries and the kind of change it is. Pure and shared, so
 * the outbox on a phone and the dispatcher on the server agree on one spelling — and on which
 * commands a device may hold back while Stella is out of reach. Not under `server/`, so the
 * browser can import it. Each payload is what its schema in `payloads.ts` reads; this module
 * imports only their types, so the browser does not load Valibot for the vocabulary.
 */

import type * as v from 'valibot';
import type { COMMAND_PAYLOAD_SCHEMAS, MomentNewPersonSchema } from './payloads';

/** What a command does to the household's data. Only an addition may wait on a device. */
export type CommandKind = 'add' | 'change' | 'remove';

/** Every command, and its kind. */
const KINDS = {
	'moment.capture': 'add',
	'moment.photo': 'add',
	'note.add': 'add',
	'interaction.log': 'add',
	'gift.add': 'add',
	// Somebody may have seen the gift already, so these wait for Stella rather than the device.
	'gift.edit': 'change',
	'gift.markGiven': 'change',
	'gift.remove': 'remove',
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

/** A person named for the first time in a moment (`MomentNewPersonSchema`). */
export type MomentNewPerson = v.InferOutput<typeof MomentNewPersonSchema>;

/** The id a moment's body mentions a person by until Stella has created them. */
export function newPersonMentionId(key: string): string {
	return `new:${key}`;
}

/**
 * A photo following the command it belongs to, named by that command's id: a moment or a
 * journal-page entry (`moment.photo`), a gallery upload (`gallery.photo`) or a circle's photo
 * upload (`circleGallery.photo`). The only commands
 * with bytes in them, so they travel as multipart rather than in a JSON batch. Not read off its
 * schema: the wire may send null where the payload leaves a field out (`PhotoWireSchema`).
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

/** The commands that carry a photo's bytes, and so travel on their own as multipart. */
export const PHOTO_COMMAND_TYPES = [
	'moment.photo',
	'gallery.photo',
	'circleGallery.photo'
] as const satisfies readonly CommandType[];

/** A command that carries a photo's bytes. */
export type PhotoCommandType = (typeof PHOTO_COMMAND_TYPES)[number];

/** Whether `type` carries a photo's bytes. */
export function isPhotoCommandType(type: CommandType): type is PhotoCommandType {
	return (PHOTO_COMMAND_TYPES as readonly CommandType[]).includes(type);
}

/**
 * The payload each command carries: what its schema in `payloads.ts` reads, so the type and
 * the check cannot drift apart.
 */
export type CommandPayloads = {
	[T in CommandType]: T extends PhotoCommandType
		? PhotoPayload
		: v.InferOutput<(typeof COMMAND_PAYLOAD_SCHEMAS)[T]>;
};

/** A moment as the composer hands it over (docs/02 §2.22.1). */
export type MomentCapturePayload = CommandPayloads['moment.capture'];

/** One type of link to several people at once (docs/02 §2.4, ADR-118). */
export type RelationshipAddManyPayload = CommandPayloads['relationship.addMany'];

/** A new person, as the *Add person* form hands them over (docs/02 §2.2). */
export type ContactAddPayload = CommandPayloads['contact.add'];

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
