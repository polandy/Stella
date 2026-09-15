import { describe, expect, it } from 'bun:test';
import { circleNameKey } from './name-key';

/*
 * The shared answer to "is this the circle they meant?" (docs/02 §2.4.2) — kept in one place
 * because the name is typed by hand on the person's page and looked up again on the server.
 */
describe('circleNameKey', () => {
	it('ignores the capitalisation somebody typed', () => {
		expect(circleNameKey('Ski Course')).toBe(circleNameKey('ski course'));
	});

	it('ignores padding around the name', () => {
		expect(circleNameKey('  Klasse 5b  ')).toBe(circleNameKey('Klasse 5b'));
	});

	it('keeps two different circles apart', () => {
		expect(circleNameKey('Klasse 5b')).not.toBe(circleNameKey('Klasse 3a'));
	});
});
