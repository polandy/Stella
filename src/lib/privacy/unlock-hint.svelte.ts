import type { DeviceUnlock } from './device-unlock';
import {
	answerLater,
	answerNever,
	hintStorageKey,
	readAnswer,
	unlockHint,
	writeAnswer,
	type HintAnswer
} from './unlock-hint';

/*
 * The browser side of the device-unlock hint (docs/dev/02 §2.10.1): this member's answer on this
 * device's storage, and the day from its clock. The rules are in `unlock-hint.ts`.
 */

export interface UnlockHint {
	/** Reactive: whether Home offers device unlock now. */
	readonly show: boolean;
	/** *Later*: quiet for a week. */
	later(): void;
	/** *Not on this device*: quiet for good. */
	never(): void;
	/** Takes *Not on this device* back. */
	askAgain(): void;
}

/** Today on this device, `YYYY-MM-DD`; en-CA writes it so. */
const today = () => new Date().toLocaleDateString('en-CA');

export function createUnlockHint(options: {
	userId: string;
	device: DeviceUnlock;
	blurOn: () => boolean;
	hasPrivateEntry: () => boolean;
}): UnlockHint {
	const key = hintStorageKey(options.userId);

	function read(): HintAnswer | null {
		try {
			return readAnswer(localStorage.getItem(key));
		} catch {
			// Server render, or storage blocked: no answer.
			return null;
		}
	}

	function write(answer: HintAnswer | null) {
		answered = answer;
		try {
			if (answer === null) localStorage.removeItem(key);
			else localStorage.setItem(key, writeAnswer(answer));
		} catch {
			// Storage blocked: the answer holds for this tab only.
		}
	}

	let answered = $state<HintAnswer | null>(read());

	return {
		get show() {
			return (
				unlockHint({
					blurOn: options.blurOn(),
					hasPrivateEntry: options.hasPrivateEntry(),
					capability: options.device.status,
					answer: answered,
					today: today()
				}) === 'show'
			);
		},
		later: () => write(answerLater(today())),
		never: () => write(answerNever()),
		askAgain: () => write(null)
	};
}
