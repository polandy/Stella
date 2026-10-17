import { browser } from '$app/environment';
import {
	UNLOCK_STORAGE_KEY,
	creationOptions,
	readRecord,
	requestOptions,
	toBase64Url,
	unlockStatus,
	writeRecord,
	type DeviceUnlock,
	type UnlockRecord
} from './device-unlock';

/*
 * The browser side of device unlock (docs/02 §2.10.1): WebAuthn for the prompts, the device's
 * storage for the fact that it is set up. The rules are in `device-unlock.ts`.
 *
 * A browser that has no passkey on this device's own authenticator — or no WebAuthn at all, as
 * on the http preview — answers `unsupported`, and the veil falls back to a tap.
 */

function readStorage(): string | null {
	try {
		return localStorage.getItem(UNLOCK_STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStorage(value: string | null): void {
	try {
		if (value === null) localStorage.removeItem(UNLOCK_STORAGE_KEY);
		else localStorage.setItem(UNLOCK_STORAGE_KEY, value);
	} catch {
		// Storage blocked: nothing is remembered, so the next visit asks for a tap again.
	}
}

/** A fresh challenge per prompt; nothing checks it, but the API requires one. */
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** Today on this device, `YYYY-MM-DD`; en-CA writes it so. */
const today = () => new Date().toLocaleDateString('en-CA');

/** Device unlock for this member on this device. Call once, from the app shell. */
export function createDeviceUnlock(member: {
	id: string;
	name: string;
	email: string;
}): DeviceUnlock {
	let supported = $state<boolean | null>(browser ? null : false);
	let record = $state<UnlockRecord | null>(browser ? readRecord(readStorage(), member.id) : null);

	if (browser) {
		const api = window.PublicKeyCredential;
		if (!api || !window.isSecureContext) supported = false;
		else
			api
				.isUserVerifyingPlatformAuthenticatorAvailable()
				.then((available) => (supported = available))
				.catch(() => (supported = false));
	}

	return {
		get status() {
			return unlockStatus(supported, record);
		},
		get since() {
			return record?.since ?? null;
		},
		async setUp() {
			try {
				const credential = await navigator.credentials.create({
					publicKey: creationOptions(member, challenge(), 'Stella')
				});
				if (!(credential instanceof PublicKeyCredential)) return false;
				record = {
					userId: member.id,
					credentialId: toBase64Url(new Uint8Array(credential.rawId)),
					since: today()
				};
				writeStorage(writeRecord(record));
				return true;
			} catch {
				// Cancelled, timed out, or refused by the device: nothing was set up.
				return false;
			}
		},
		async verify() {
			if (!record) return false;
			try {
				const credential = await navigator.credentials.get({
					publicKey: requestOptions(record.credentialId, challenge())
				});
				return credential instanceof PublicKeyCredential;
			} catch {
				return false;
			}
		},
		forget() {
			record = null;
			writeStorage(null);
		}
	};
}
