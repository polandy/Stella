import type { MonicaTask } from './monica-export';

/*
 * A Monica task, read as a Stella to-do (docs/02 §2.26.8). Pure. A to-do is one short line, so
 * a task's description goes after its title on that line rather than being lost; a completed
 * task is done on the day Monica completed it, so it takes its place in the person's Activity.
 */

/** One line of text: every run of whitespace, line breaks included, a single space. */
const oneLine = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** The to-do's line — title, then description after a dash — or null when both are empty. */
export function taskLine(task: MonicaTask): string | null {
	const line = [oneLine(task.title), oneLine(task.description)]
		.filter((part) => part.length > 0)
		.join(' — ');
	return line.length > 0 ? line : null;
}

/**
 * A Monica timestamp as epoch ms. A dump writes `2024-05-06 22:30:00`, a JSON export
 * `2024-05-06T22:30:00.000000Z`; both are UTC, Laravel's default. Null when it does not read.
 */
function momentOf(stamp: string | null): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?)?/.exec(
		stamp ?? ''
	);
	if (!m) return null;
	const [, y, mo, d, h = '0', mi = '0', s = '0', ms = '0'] = m;
	const at = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s, +ms.padEnd(3, '0'));
	return Number.isNaN(at) ? null : at;
}

/**
 * When a completed task was done, as the to-do keeps it; null while open. A completed task
 * without a completion stamp (Monica's column is nullable) takes its last change instead, then
 * its creation, then the import itself.
 */
export function taskDone(task: MonicaTask, now: number): { doneAt: number; doneOn: string } | null {
	if (!task.completed) return null;
	const doneAt =
		momentOf(task.completedAt) ?? momentOf(task.updatedAt) ?? momentOf(task.createdAt) ?? now;
	return { doneAt, doneOn: new Date(doneAt).toISOString().slice(0, 10) };
}
