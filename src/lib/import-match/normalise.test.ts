import { describe, expect, it } from 'bun:test';
import { foldName, normaliseEmail, normalisePhone, samePhone } from './normalise';

/*
 * The spellings two address books share (docs/02 §2.16.2): an email in
 * any case, a phone in any grouping, a name in any order and with or without its accents.
 */

describe('normaliseEmail', () => {
	it('ignores case and the spaces around it', () => {
		expect(normaliseEmail('  Anna.Example@Work.Example.COM ')).toBe(
			'anna.example@work.example.com'
		);
	});
});

describe('normalisePhone', () => {
	it('keeps the digits and a leading plus', () => {
		expect(normalisePhone('+41 (79) 000-00 01')).toEqual({
			international: '+41790000001',
			tail: '790000001'
		});
	});

	it('reads 00 as the international plus', () => {
		expect(normalisePhone('0041 79 000 00 05').international).toBe('+41790000005');
	});

	it('leaves a national number without a country', () => {
		expect(normalisePhone('079 000 00 03')).toEqual({ international: null, tail: '790000003' });
	});

	it('has no tail for a number too short to compare', () => {
		expect(normalisePhone('117').tail).toBeNull();
	});
});

describe('samePhone', () => {
	it('is the same number when both carry the same country', () => {
		expect(samePhone(normalisePhone('+41 79 000 00 01'), normalisePhone('0041790000001'))).toBe(
			'same'
		);
	});

	it('is only alike when one side has no country and the last nine digits agree', () => {
		expect(samePhone(normalisePhone('079 000 00 01'), normalisePhone('+41 79 000 00 01'))).toBe(
			'alike'
		);
	});

	it('is different when two countries disagree, even with the same tail', () => {
		expect(samePhone(normalisePhone('+41 79 000 00 01'), normalisePhone('+49 79 000 00 01'))).toBe(
			'different'
		);
	});
});

describe('foldName', () => {
	it('ignores case, accents and word order', () => {
		expect(foldName('Zoë  Müller')).toBe(foldName('muller zoe'));
	});

	it('is empty for a blank name', () => {
		expect(foldName('   ')).toBe('');
	});
});
