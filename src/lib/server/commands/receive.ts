import { isQueueable, type CommandAnswer } from '../../commands/commands';
import type { Translate } from '../../i18n/translate';
import { dispatchCommand, type CommandActor, type CommandDeps } from '../domain/commands/dispatch';
import { parseCommand } from './parse';

/*
 * What `POST /api/commands` does with a phone's outbox (docs/concepts/offline-capture.md §4):
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
			answers.push({ id: claimedId(raw), status: 'refused', reason: t('errors.command.malformed') });
			continue;
		}
		if (!isQueueable(command.type)) {
			answers.push({ id: command.id, status: 'refused', reason: t('errors.command.notQueueable') });
			continue;
		}
		try {
			const outcome = await dispatchCommand(deps, actor, command);
			answers.push(
				outcome.status === 'applied'
					? { id: command.id, status: 'applied', result: outcome.result }
					: outcome.status === 'refused'
						? { id: command.id, status: 'refused', reason: outcome.reason(t) }
						: { id: command.id, status: 'busy' }
			);
		} catch (err) {
			console.error(`Command ${command.id} (${command.type}) failed:`, err);
			answers.push({ id: command.id, status: 'failed' });
		}
	}
	return answers;
}
