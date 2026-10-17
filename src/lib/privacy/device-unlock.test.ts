import { describe, expect, test } from 'bun:test';
import {
	UNLOCK_STORAGE_KEY,
	creationOptions,
	fromBase64Url,
	readRecord,
	requestOptions,
	toBase64Url,
	unlockStatus,
	writeRecord
} from './device-unlock';

/*
 * Device unlock (docs/02 §2.10.1): a passkey checked on the device alone, asked before the
 * veil lifts. Being set up is a fact about this device, kept in its storage under the member.
 */
const MEMBER = { id: 'u-1', name: 'Andy', email: 'andy@example.com' };
const CHALLENGE = new Uint8Array([1, 2, 3, 4]);

describe('the stored record', () => {
	test('round-trips for the member who set it up', () => {
		const record = { userId: 'u-1', credentialId: 'AQID', since: '2026-10-17' };
		expect(readRecord(writeRecord(record), 'u-1')).toEqual(record);
	});

	test('belongs to its member: another one signing in on the same device has none', () => {
		const raw = writeRecord({ userId: 'u-1', credentialId: 'AQID', since: '2026-10-17' });
		expect(readRecord(raw, 'u-2')).toBeNull();
	});

	test('anything unreadable counts as not set up', () => {
		expect(readRecord(null, 'u-1')).toBeNull();
		expect(readRecord('not json', 'u-1')).toBeNull();
		expect(readRecord('{"userId":"u-1"}', 'u-1')).toBeNull();
		expect(readRecord('[]', 'u-1')).toBeNull();
	});

	test('is kept under a key of its own', () => {
		expect(UNLOCK_STORAGE_KEY).toBe('stella.deviceUnlock');
	});
});

describe('unlockStatus', () => {
	test('says what the device can do', () => {
		const record = { userId: 'u-1', credentialId: 'AQID', since: '2026-10-17' };
		expect(unlockStatus(null, record)).toBe('checking');
		expect(unlockStatus(false, record)).toBe('unsupported');
		expect(unlockStatus(true, null)).toBe('none');
		expect(unlockStatus(true, record)).toBe('set-up');
	});
});

describe('base64url', () => {
	test('round-trips bytes without padding or URL-unsafe characters', () => {
		const bytes = new Uint8Array([251, 255, 0, 62, 63]);
		const text = toBase64Url(bytes);
		expect(text).not.toMatch(/[+/=]/);
		expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes));
	});
});

describe('the passkey prompts', () => {
	test('creating asks this device itself to verify the member, nothing roaming', () => {
		const options = creationOptions(MEMBER, CHALLENGE, 'Stella');
		expect(options.rp).toEqual({ name: 'Stella' });
		expect(options.user.name).toBe('andy@example.com');
		expect(options.user.displayName).toBe('Andy');
		expect(new TextDecoder().decode(options.user.id as Uint8Array)).toBe('u-1');
		expect(options.authenticatorSelection).toEqual({
			authenticatorAttachment: 'platform',
			userVerification: 'required',
			residentKey: 'discouraged'
		});
		expect(options.attestation).toBe('none');
		expect(options.pubKeyCredParams.map((param) => param.alg)).toEqual([-7, -257]);
	});

	test('verifying names the one credential set up here and requires the check', () => {
		const options = requestOptions('AQID', CHALLENGE);
		expect(options.userVerification).toBe('required');
		expect(options.allowCredentials).toHaveLength(1);
		expect(Array.from(options.allowCredentials![0].id as Uint8Array)).toEqual([1, 2, 3]);
		expect(options.challenge).toBe(CHALLENGE);
	});
});
