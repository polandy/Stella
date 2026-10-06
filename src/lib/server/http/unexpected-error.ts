import { CommandFailedError } from '../domain/commands/dispatch';

/*
 * What `handleError` in `hooks.server.ts` decides, kept pure (docs/04 §4.4). An error nobody
 * planned for is logged once, here at the edge, under the request's id; the member sees the id
 * rather than the error, so "it said something went wrong" can be found in the log.
 */

/** A token a proxy may hand us: short, and nothing that could start a new log line. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * The request's id: the one a reverse proxy already gave it (`X-Request-Id`), so its log and
 * ours agree, or a fresh one. A header is the client's to write, so anything but a plain
 * token is replaced rather than copied into the log.
 */
export function requestIdFrom(header: string | null, generate: () => string): string {
	return header && REQUEST_ID.test(header) ? header : generate();
}

/** Whether a status is ours to log: a page that was not there is not a failure. */
export function isUnexpected(status: number): boolean {
	return status >= 500;
}

interface FailedRequest {
	requestId: string;
	status: number;
	method: string;
	path: string;
	error: unknown;
}

/** The log line's head; the error itself, with its stack and cause, is logged after it. */
export function describeUnexpectedError(failed: FailedRequest): string {
	const head = `[request ${failed.requestId}] ${failed.status} ${failed.method} ${failed.path}`;
	if (failed.error instanceof CommandFailedError) {
		return `${head} · command ${failed.error.commandType} (${failed.error.commandId})`;
	}
	return head;
}
