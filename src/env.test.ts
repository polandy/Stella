import { describe, expect, it } from 'bun:test';
import { configKeys } from '#lib/server/config-schema.js';
import { variables } from './env';

describe('variables', () => {
	it('declares every key the config schema reads, so none arrives empty', () => {
		expect(Object.keys(variables).sort()).toEqual([...configKeys].sort());
	});
});
