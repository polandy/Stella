import { describe, expect, it } from 'bun:test';
import { roleKey } from './role-key';

describe('roleKey', () => {
	it('folds case and surrounding space, so two spellings are one role', () => {
		expect(roleKey('Teacher')).toBe('teacher');
		expect(roleKey('  teacher ')).toBe('teacher');
	});

	it('reads a blank role as no role at all', () => {
		expect(roleKey(null)).toBeNull();
		expect(roleKey(undefined)).toBeNull();
		expect(roleKey('   ')).toBeNull();
	});
});
