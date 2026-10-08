/*
 * The words a gift is made of (docs/02 §2.25). Pure and client-safe, so the form, the command's
 * payload schema and the use-case read one list of states, one list of occasions and one rule
 * for a link.
 */

/** An idea becomes a given gift; a received one is noted as such from the start. */
export const GIFT_STATES = ['idea', 'given', 'received'] as const;

/** One of `GIFT_STATES`. */
export type GiftState = (typeof GIFT_STATES)[number];

/** Whether `value` is one of `GIFT_STATES`. */
export function isGiftState(value: string): value is GiftState {
	return (GIFT_STATES as readonly string[]).includes(value);
}

/**
 * The occasions the form offers as chips. Stored as these keys and worded in the reader's
 * language when shown, so a gift noted in German reads *Birthday* to an English reader; any
 * other occasion is stored as typed.
 */
export const GIFT_OCCASION_PRESETS = ['birthday', 'christmas', 'anniversary'] as const;

/** One of `GIFT_OCCASION_PRESETS`. */
export type GiftOccasionPreset = (typeof GIFT_OCCASION_PRESETS)[number];

/** Whether a stored occasion is one of the presets rather than free text. */
export function isGiftOccasionPreset(value: string): value is GiftOccasionPreset {
	return (GIFT_OCCASION_PRESETS as readonly string[]).includes(value);
}

/** The chip that opens a field for an occasion of the member's own wording. */
export const OTHER_OCCASION = 'other';

/**
 * The occasion a form chose: a preset's key, or the text typed beside *Other*. The chips and
 * the text field are two fields, so the form works without JavaScript too; the action and the
 * outbox's `toCommand` read them the same way through this.
 */
export function occasionFromForm(choice: string | null, typed: string | null): string | null {
	if (choice === OTHER_OCCASION) return (typed ?? '').trim() || null;
	return choice !== null && isGiftOccasionPreset(choice) ? choice : null;
}

/** A link as the form gave it: a web address, none, or something that is not one. */
export type GiftLink = { ok: true; url: string | null } | { ok: false };

const WEB_SCHEME = /^https?:\/\//i;
/** Any scheme at all (`javascript:`, `mailto:`, …) — refused unless it is the web's. */
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The link a gift may carry (docs/02 §2.25): the shop page. Only a web address is kept, because
 * the card renders it as a link and a `javascript:` one would run when tapped. An address pasted
 * without its scheme — `shop.example/teapot` — is read as `https://`.
 */
export function giftLink(raw: string): GiftLink {
	const text = raw.trim();
	if (text.length === 0) return { ok: true, url: null };
	if (/\s/.test(text)) return { ok: false };
	const candidate = WEB_SCHEME.test(text) ? text : ANY_SCHEME.test(text) ? null : `https://${text}`;
	if (candidate === null) return { ok: false };
	try {
		const parsed = new URL(candidate);
		if (parsed.hostname.length === 0) return { ok: false };
	} catch {
		// `new URL` throws on what is not an address; that is the answer, not a failure.
		return { ok: false };
	}
	return { ok: true, url: candidate };
}
