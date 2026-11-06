import type { CommandAnswer, RefusedTarget } from '../commands/commands';

/*
 * A save the member is watching (docs/04 ADR-076): a form saving in reach goes through the
 * outbox too, and learns here what became of it. Pure, like `outbox.ts`.
 */

/**
 * What became of a save the member is watching (docs/04 ADR-076: online saves go through the
 * outbox too). *Applied* hands the form Stella's result; *refused* its reason, for the form to
 * show where the action's own error would be; *kept* means it waits on this device.
 */
export type Delivery =
	| { status: 'applied'; result: unknown }
	| { status: 'refused'; reason: string; refusals?: RefusedTarget[] }
	| { status: 'kept' };

/**
 * What Stella's answer to a watched save means for whoever watches it; null while that is not
 * known yet — a "not now", or photos of it still on their way.
 */
export function deliveryFor(answer: CommandAnswer, photosLeft: boolean): Delivery | null {
	if (answer.status === 'refused') {
		const { reason, refusals } = answer;
		return refusals ? { status: 'refused', reason, refusals } : { status: 'refused', reason };
	}
	if (answer.status === 'applied' && !photosLeft)
		return { status: 'applied', result: answer.result };
	return null;
}

/**
 * A watched save still unsettled when a sending round ends: done if Stella took it (`applied`,
 * only its photos left to send later), kept otherwise.
 */
export function deliveryLeftOver(applied: { result: unknown } | null): Delivery {
	return applied ? { status: 'applied', result: applied.result } : { status: 'kept' };
}
