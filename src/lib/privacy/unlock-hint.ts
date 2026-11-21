import type { UnlockStatus } from './veil';

/*
 * The device-unlock hint (docs/dev/02 §2.10.1): the card on Home that offers device unlock once
 * per member and device. Pure: the day is passed in, never read from the clock. The browser
 * side is `unlock-hint.svelte.ts`.
 */

/** How many days *Later* waits. */
export const SNOOZE_DAYS = 7;

/** What the member answered on this device: *Later* until a day, or *Not on this device*. */
export type HintAnswer = { snoozedUntil: string } | 'never';

export interface HintInput {
	/** *Blur my private entries*; off, there is nothing to unlock. */
	blurOn: boolean;
	/** The member has written at least one private entry. */
	hasPrivateEntry: boolean;
	capability: UnlockStatus;
	answer: HintAnswer | null;
	/** `YYYY-MM-DD` on this device. */
	today: string;
}

export function unlockHint(input: HintInput): 'hidden' | 'show' {
	if (!input.blurOn || !input.hasPrivateEntry) return 'hidden';
	// Absent until the browser answers, so the card never flashes in and out.
	if (input.capability !== 'none') return 'hidden';
	const { answer, today } = input;
	if (answer === 'never') return 'hidden';
	if (answer && today < answer.snoozedUntil) return 'hidden';
	return 'show';
}

export function answerNever(): HintAnswer {
	return 'never';
}

export function answerLater(today: string): HintAnswer {
	const day = new Date(`${today}T00:00:00Z`);
	day.setUTCDate(day.getUTCDate() + SNOOZE_DAYS);
	return { snoozedUntil: day.toISOString().slice(0, 10) };
}

/** Where this device keeps a member's answer. */
export function hintStorageKey(userId: string): string {
	return `stella.unlockHint.${userId}`;
}

export function writeAnswer(answer: HintAnswer): string {
	return JSON.stringify(answer);
}

/** The stored answer, or null when there is none or it cannot be read. */
export function readAnswer(raw: string | null): HintAnswer | null {
	if (!raw) return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (value === 'never') return 'never';
	if (typeof value !== 'object' || value === null) return null;
	const { snoozedUntil } = value as Record<string, unknown>;
	return typeof snoozedUntil === 'string' ? { snoozedUntil } : null;
}
