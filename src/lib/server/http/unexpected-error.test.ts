import { describe, expect, it } from 'bun:test';
import { CommandFailedError } from '../domain/commands/dispatch';
import { describeUnexpectedError, isUnexpected, requestIdFrom } from './unexpected-error';

/*
 * An error nobody planned for is logged once, at the edge, with the request's id; the member
 * is shown that id instead of the error, so a report of "it said something went wrong" can be
 * found in the log (docs/04 §4.4, docs/08 §8.2 item 11).
 */

describe('requestIdFrom', () => {
	const generate = () => 'generated';

	it('makes one up when the request brings none', () => {
		expect(requestIdFrom(null, generate)).toBe('generated');
		expect(requestIdFrom('', generate)).toBe('generated');
	});

	it('keeps the id a reverse proxy already gave the request, so both logs agree', () => {
		expect(requestIdFrom('3f2a-77b1.c:9_x', generate)).toBe('3f2a-77b1.c:9_x');
	});

	it('does not let a header write into the log: anything but a plain token is replaced', () => {
		expect(requestIdFrom('abc\n[request forged] 500', generate)).toBe('generated');
		expect(requestIdFrom('a b', generate)).toBe('generated');
		expect(requestIdFrom('x'.repeat(129), generate)).toBe('generated');
	});
});

describe('isUnexpected', () => {
	it('is a server failure, not a page that was simply not there', () => {
		expect(isUnexpected(500)).toBe(true);
		expect(isUnexpected(503)).toBe(true);
		expect(isUnexpected(404)).toBe(false);
		expect(isUnexpected(400)).toBe(false);
	});
});

describe('describeUnexpectedError', () => {
	const request = { requestId: 'r1', status: 500, method: 'POST', path: '/contacts/c1' };

	it('names the request, its answer and where it went', () => {
		expect(describeUnexpectedError({ ...request, error: new Error('boom') })).toBe(
			'[request r1] 500 POST /contacts/c1'
		);
	});

	it('names the command a failed dispatch was applying', () => {
		const error = new CommandFailedError({ id: 'cmd1', type: 'note.add' }, new Error('disk full'));
		expect(describeUnexpectedError({ ...request, error })).toBe(
			'[request r1] 500 POST /contacts/c1 · command note.add (cmd1)'
		);
	});
});
