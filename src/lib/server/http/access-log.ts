/*
 * One line per request, for LOG_FORMAT=json (docs/dev/07 §7.4). Pure, so the hook only decides
 * when to write it. The query string is left out: it can carry a search term or a calendar token.
 */

interface FinishedRequest {
	requestId: string;
	method: string;
	url: string;
	status: number;
	durationMs: number;
}

export function accessLogLine(request: FinishedRequest): string {
	return JSON.stringify({
		msg: 'request',
		requestId: request.requestId,
		method: request.method,
		path: new URL(request.url).pathname,
		status: request.status,
		durationMs: Math.round(request.durationMs * 10) / 10
	});
}
