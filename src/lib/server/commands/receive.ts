import {
	COMMAND_SCHEMA_VERSION,
	isQueueable,
	MAX_COMMAND_BATCH,
	type Command,
	type CommandAnswer
} from '../../commands/commands';
import type { Translate } from '../../i18n/translate';
import { dispatchCommand, type CommandActor, type CommandDeps } from '../domain/commands/dispatch';
import { RelationshipsRefusedError } from '../domain/relationships/add-many';
import { parseCommand } from './parse';

/*
 * What `POST /api/commands` does with a phone's outbox (docs/dev/04 §4.11.2):
 * each command in the order sent, each answered on its own. One the phone cannot fix by
 * waiting is *refused*, in the member's language; one that failed on our side is *failed*,
 * which says nothing about the command, so the phone keeps it and tries again later.
 *
 * Only additions are accepted here. A change never waits on a device, so a queued one is
 * either a bug or a forgery, and this is the place that does not rely on the device knowing.
 */

/** The id `raw` claims to have, so even an unreadable command is answered by its name. */
function claimedId(raw: unknown): string {
	if (typeof raw !== 'object' || raw === null) return '';
	const id = (raw as Record<string, unknown>).id;
	return typeof id === 'string' ? id : '';
}

/**
 * What to tell the phone about `command`, applied or not. Our own failure answers `failed`, so
 * the phone keeps the command and tries later; it is logged here, where it happened.
 */
export async function answerFor(
	deps: CommandDeps,
	actor: CommandActor,
	t: Translate,
	command: Command
): Promise<CommandAnswer> {
	try {
		const outcome = await dispatchCommand(deps, actor, command);
		if (outcome.status === 'applied') {
			const { result, repeated } = outcome;
			return repeated
				? { id: command.id, status: 'applied', result, repeated: true }
				: { id: command.id, status: 'applied', result };
		}
		if (outcome.status === 'refused') {
			const reason = outcome.reason(t);
			// A batch of links names each refused person, so the form can mark their chips (§2.4).
			if (outcome.error instanceof RelationshipsRefusedError) {
				const refusals = outcome.error.refusals.map((refusal) => ({
					targetId: refusal.targetId,
					reason: refusal.reason(t)
				}));
				return { id: command.id, status: 'refused', reason, refusals };
			}
			return { id: command.id, status: 'refused', reason };
		}
		return { id: command.id, status: 'busy' };
	} catch (err) {
		// A `CommandFailedError` names the command itself; its cause is what broke.
		console.error(err);
		return { id: command.id, status: 'failed' };
	}
}

/** A batch's commands, still unread, or why the batch is not read at all. */
export type BatchReading =
	{ ok: true; commands: unknown[] } | { ok: false; code: 'invalidBatch' | 'schemaAhead' };

/**
 * The envelope of a phone's batch: `{ schemaVersion, commands }`. A batch from a build before
 * versions has none and is read as it always was; one from a newer build is not read at all,
 * since its fields this build does not know would be dropped, and the phone keeps it.
 */
export function readBatch(body: unknown): BatchReading {
	if (typeof body !== 'object' || body === null) return { ok: false, code: 'invalidBatch' };
	const { schemaVersion, commands } = body as Record<string, unknown>;
	if (!Array.isArray(commands) || commands.length > MAX_COMMAND_BATCH) {
		return { ok: false, code: 'invalidBatch' };
	}
	if (schemaVersion === undefined) return { ok: true, commands };
	if (!Number.isInteger(schemaVersion)) return { ok: false, code: 'invalidBatch' };
	if ((schemaVersion as number) > COMMAND_SCHEMA_VERSION) return { ok: false, code: 'schemaAhead' };
	return { ok: true, commands };
}

/** Apply `raws` for `actor` in order, answering each. */
export async function receiveQueued(
	deps: CommandDeps,
	actor: CommandActor,
	t: Translate,
	raws: readonly unknown[]
): Promise<CommandAnswer[]> {
	const answers: CommandAnswer[] = [];
	for (const raw of raws) {
		const command = parseCommand(raw);
		if (!command) {
			answers.push({
				id: claimedId(raw),
				status: 'refused',
				reason: t('errors.command.malformed')
			});
			continue;
		}
		if (!isQueueable(command.type)) {
			answers.push({ id: command.id, status: 'refused', reason: t('errors.command.notQueueable') });
			continue;
		}
		answers.push(await answerFor(deps, actor, t, command));
	}
	return answers;
}
