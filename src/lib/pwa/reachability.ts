/*
 * How a page learns that Stella is out of reach (docs/02 §2.18).
 *
 * Not `navigator.onLine`: it answers "is this device on a network", which is not the
 * question. Stella is on the household's own network, so a phone on mobile data is perfectly
 * online and cannot reach Stella at all — the case the offline story exists for. The only
 * thing that knows the truth is the service worker, which has just either fetched a page or
 * failed to and fallen back to the cache.
 *
 * So the worker reports, and the page asks on load rather than waiting for a report it might
 * have missed. These are the two messages that pass between them; pure, so both sides agree
 * on the wire format and a malformed message from anywhere else is rejected rather than
 * believed.
 */

/** A page asking the worker where things stand, because it has just been opened. */
export const ASK_REACHABILITY = 'stella:reachability?';

/**
 * A page telling the worker that something changed under it without a request to notice: the
 * device lost or joined a network, or the app came back into view. The worker finds out and
 * reports only if the answer changed, so a page left open learns it is offline without a tap.
 */
export const CHECK_REACHABILITY = 'stella:reachability!';

/**
 * A check as a page sends it, with what the page itself just saw of the device. The page hears
 * `offline` and `online` before the worker's own `navigator.onLine` has caught up, so the
 * worker takes the page's word for it rather than its own lagging one.
 */
export interface ReachabilityCheck {
	type: typeof CHECK_REACHABILITY;
	deviceOnline: boolean;
}

/** The check a page sends when `deviceOnline` is what its `navigator.onLine` says now. */
export function checkMessage(deviceOnline: boolean): ReachabilityCheck {
	return { type: CHECK_REACHABILITY, deviceOnline };
}

/**
 * The check in `data` off a `message` event, or null when it is something else. A page of the
 * previous build sends the bare string during an update; it says nothing of the device, so
 * `deviceOnline` is null and the worker asks its own.
 */
export function readCheck(data: unknown): { deviceOnline: boolean | null } | null {
	if (data === CHECK_REACHABILITY) return { deviceOnline: null };
	if (typeof data !== 'object' || data === null) return null;
	const message = data as Record<string, unknown>;
	if (message.type !== CHECK_REACHABILITY || typeof message.deviceOnline !== 'boolean') return null;
	return { deviceOnline: message.deviceOnline };
}

/** What the worker asks to find out: public, no database, and cheap enough for every check. */
export const PROBE_PATH = '/healthz';

/** The worker's answer, sent in reply and again whenever it changes. */
export const REPORT_REACHABILITY = 'stella:reachability';

/** What the worker tells the pages it controls. */
export interface ReachabilityReport {
	type: typeof REPORT_REACHABILITY;
	/** Whether the last request the worker made actually got through to Stella. */
	reachable: boolean;
	/**
	 * When the page on screen was kept (epoch ms), if the worker answered it from the device;
	 * null when it came from Stella or its age is unknown. Absent from a worker of a build
	 * before it, which a page can still hear for a moment during an update.
	 */
	keptAt?: number | null;
}

/** Whether `data` off a `message` event is a report, rather than anything else on the channel. */
export function isReachabilityReport(data: unknown): data is ReachabilityReport {
	if (typeof data !== 'object' || data === null) return false;
	const message = data as Record<string, unknown>;
	return (
		message.type === REPORT_REACHABILITY &&
		typeof message.reachable === 'boolean' &&
		(message.keptAt === undefined || message.keptAt === null || typeof message.keptAt === 'number')
	);
}

/** How the health check was answered, as far as the verdict needs it; null when it was not. */
export interface ProbeAnswer {
	ok: boolean;
	type: ResponseType;
	/** The parsed JSON body, or whatever else came back in its place. */
	body: unknown;
}

/**
 * Whether a check found Stella. A device that says it has no network is believed at once, since
 * a flight-mode request can hang rather than fail; a device that says it is online is not, which
 * is the whole point of asking. Only Stella's own health answer counts: a Wi-Fi login page
 * answers every address with a 200 of its own.
 */
export function probeSays(check: { deviceOnline: boolean; answer: ProbeAnswer | null }): boolean {
	const { deviceOnline, answer } = check;
	if (!deviceOnline || answer === null) return false;
	if (!answer.ok || answer.type !== 'basic') return false;
	const body = answer.body;
	return (
		typeof body === 'object' && body !== null && (body as Record<string, unknown>).status === 'ok'
	);
}
