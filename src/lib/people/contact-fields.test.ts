import { describe, expect, it } from 'bun:test';
import { isContactFieldKind } from './contact-fields';

/* Contact field kinds (docs/02 §2.3): a form field is one only if the list names it. */

describe('isContactFieldKind', () => {
	it('knows the kinds a field can have, and nothing else', () => {
		expect(isContactFieldKind('phone')).toBe(true);
		expect(isContactFieldKind('custom')).toBe(true);
		expect(isContactFieldKind('fax')).toBe(false);
		expect(isContactFieldKind('')).toBe(false);
	});
});
