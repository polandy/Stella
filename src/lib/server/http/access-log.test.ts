import { describe, expect, it } from 'bun:test';
import { accessLogLine } from './access-log';

const request = {
	requestId: 'r-1',
	method: 'GET',
	url: 'https://stella.example/people/7?q=secret#frag',
	status: 200,
	durationMs: 12.3456
};

describe('accessLogLine', () => {
	it('is one JSON object with method, path, status, duration and request id', () => {
		const line = accessLogLine(request);
		expect(line).not.toContain('\n');
		expect(JSON.parse(line)).toEqual({
			msg: 'request',
			requestId: 'r-1',
			method: 'GET',
			path: '/people/7',
			status: 200,
			durationMs: 12.3
		});
	});

	it('leaves the query string out of the log', () => {
		expect(accessLogLine(request)).not.toContain('secret');
	});

	it('keeps a path that would break a line as an escaped string', () => {
		const line = accessLogLine({ ...request, url: 'https://stella.example/a%0Ab' });
		expect(line.split('\n')).toHaveLength(1);
		expect(JSON.parse(line).path).toBe('/a%0Ab');
	});
});
