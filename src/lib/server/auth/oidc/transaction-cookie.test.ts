import { describe, expect, it } from 'bun:test';
import { openOidcTransaction, sealOidcTransaction } from './transaction-cookie';

const SECRET = 'a-session-secret';
const TX = { state: 'the-state', nonce: 'the-nonce', codeVerifier: 'the-verifier' };

describe('the OIDC transaction cookie', () => {
	it('opens what it sealed with the same secret', () => {
		expect(openOidcTransaction(sealOidcTransaction(TX, SECRET), SECRET)).toEqual(TX);
	});

	it('refuses a value sealed with another secret', () => {
		expect(openOidcTransaction(sealOidcTransaction(TX, 'another-secret'), SECRET)).toBeNull();
	});

	it('refuses a planted payload carrying the genuine signature of another', () => {
		const [, mac] = sealOidcTransaction(TX, SECRET).split('.');
		const planted = Buffer.from(JSON.stringify({ ...TX, state: 'attacker' })).toString('base64url');
		expect(openOidcTransaction(`${planted}.${mac}`, SECRET)).toBeNull();
	});

	it('refuses the unsigned plain JSON the cookie used to hold', () => {
		expect(openOidcTransaction(JSON.stringify(TX), SECRET)).toBeNull();
	});

	it('refuses a genuinely signed value that is not a transaction', () => {
		const sealed = sealOidcTransaction({ ...TX, nonce: 7 } as unknown as typeof TX, SECRET);
		expect(openOidcTransaction(sealed, SECRET)).toBeNull();
	});

	it('refuses garbage', () => {
		for (const raw of ['', '.', 'a.b.c', 'not base64!.x']) {
			expect(openOidcTransaction(raw, SECRET)).toBeNull();
		}
	});
});
