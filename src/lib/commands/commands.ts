/*
 * The command vocabulary (docs/concepts/offline-capture.md §3): every change a member can
 * make, by name, with the payload it carries and the kind of change it is. Pure and shared, so
 * the outbox on a phone and the dispatcher on the server agree on one spelling — and on which
 * commands a device may hold back while Stella is out of reach. Not under `server/`, so the
 * browser can import it; `MentionAudience` stands in for the server's `Visibility`.
 */

import type { MentionAudience } from '../mentions/audience';

/** What a command does to the household's data. Only an addition may wait on a device. */
export type CommandKind = 'add' | 'change' | 'remove';

/** Every command, and its kind. */
const KINDS = {
	'moment.capture': 'add'
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
	/** Display names the composer queued via "Create “Name”". */
	newPeople: string[];
}

/** The payload each command carries. */
export interface CommandPayloads {
	'moment.capture': MomentCapturePayload;
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
