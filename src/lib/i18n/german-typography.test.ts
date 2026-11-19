import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dir, 'messages/de');

describe('German catalogue typography', () => {
	it('sets a dash as the spaced en dash, never the em dash', () => {
		const offenders = readdirSync(DIR)
			.filter((file) => file.endsWith('.ts'))
			.filter((file) => readFileSync(join(DIR, file), 'utf8').includes('—'));
		expect(offenders).toEqual([]);
	});
});
