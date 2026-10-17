import type { UnlockStatus } from './veil';

/*
 * Device unlock (docs/02 §2.10.1): before the veil lifts, the device's own fingerprint, face or
 * PIN, asked through a passkey. The check stays on the device: the assertion is not sent
 * anywhere, so it works offline and needs nothing on the server. That makes it a guard for the
 * screen, not for the data, which is all the veil is for.
 *
 * Pure: the stored record and the two prompts' options. The browser calls are the adapter's,
 * `device-unlock.svelte.ts`.
 */

/** Where this device keeps the fact that it is set up. */
export const UNLOCK_STORAGE_KEY = 'stella.deviceUnlock';

export interface UnlockRecord {
	/** The member who set it up: another one signing in here has not. */
	userId: string;
	/** The passkey's credential id, base64url. */
	credentialId: string;
	/** The day it was set up, `YYYY-MM-DD`. */
	since: string;
}

export function writeRecord(record: UnlockRecord): string {
	return JSON.stringify(record);
}

/** The record for this member, or null when there is none or it cannot be read. */
export function readRecord(raw: string | null, userId: string): UnlockRecord | null {
	if (!raw) return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof value !== 'object' || value === null) return null;
	const { userId: owner, credentialId, since } = value as Record<string, unknown>;
	if (typeof owner !== 'string' || typeof credentialId !== 'string' || typeof since !== 'string')
		return null;
	return owner === userId ? { userId: owner, credentialId, since } : null;
}

/** `supported` is null until the browser has answered whether it can. */
export function unlockStatus(supported: boolean | null, record: UnlockRecord | null): UnlockStatus {
	if (supported === null) return 'checking';
	if (!supported) return 'unsupported';
	return record ? 'set-up' : 'none';
}

export function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** The prompt that makes the passkey: on this device itself, which must verify the member. */
export function creationOptions(
	member: { id: string; name: string; email: string },
	challenge: Uint8Array<ArrayBuffer>,
	appName: string
): PublicKeyCredentialCreationOptions {
	return {
		rp: { name: appName },
		user: { id: new TextEncoder().encode(member.id), name: member.email, displayName: member.name },
		challenge,
		// ES256, then RS256 for the authenticators that only have that.
		pubKeyCredParams: [
			{ type: 'public-key', alg: -7 },
			{ type: 'public-key', alg: -257 }
		],
		authenticatorSelection: {
			authenticatorAttachment: 'platform',
			userVerification: 'required',
			// Not a sign-in passkey: it is only ever asked for by its id, so it need not be listed.
			residentKey: 'discouraged'
		},
		attestation: 'none',
		timeout: 60_000
	};
}

/** The prompt that asks for it: the one credential set up here, verified, not merely present. */
export function requestOptions(
	credentialId: string,
	challenge: Uint8Array<ArrayBuffer>
): PublicKeyCredentialRequestOptions {
	return {
		challenge,
		allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) }],
		userVerification: 'required',
		timeout: 60_000
	};
}

/** Port: device unlock as the veil and Settings use it; the adapter is `device-unlock.svelte.ts`. */
export interface DeviceUnlock {
	/** Reactive. */
	readonly status: UnlockStatus;
	/** The day it was set up here, `YYYY-MM-DD`, or null. */
	readonly since: string | null;
	/** Makes the passkey; false when the member cancelled or the device refused. */
	setUp(): Promise<boolean>;
	/** Asks for it; false when the member cancelled or it failed. */
	verify(): Promise<boolean>;
	/** Drops it from this device; the passkey stays in the password manager. */
	forget(): void;
}
