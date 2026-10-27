import type { IncomingCard, StellaPerson } from '../../../import-match/card';
import { mergePlan, type Conflict } from '../../../import-match/merge-plan';
import { foldName } from '../../../import-match/normalise';
import { fingerprint } from '../import/vcard-lines';

/*
 * What a changed linked card brings in (docs/02 §2.16.3), worked out three ways: the card now,
 * the card as Stella last saw it (the base), and the person. Only what changed *on the card*
 * since the base counts — so a value Stella dropped is not brought back because the card still
 * has it, and a name Stella changed is not a conflict because the card still says the old one.
 * What does count goes through stage 1's `mergePlan`: missing facts are added, a different name,
 * birthday or picture is asked about. Pure.
 */

/** A fact a sync asks about: stage 1's conflicts, and a picture the card changed. */
export type SyncConflict = Conflict | { kind: 'photo' };

export type SyncConflictKind = SyncConflict['kind'];

/** Fingerprints of the card's picture now and at the base, and of the person's photo. */
export interface PhotoPrints {
	card: string | null;
	base: string | null;
	stella: string | null;
}

/** A picture's fingerprint, the same however a card wraps its base64. */
export const photoPrint = (base64: string): string => fingerprint(base64.replace(/\s/g, ''));

/** Stella's kept-in-step facts on `base` as a person, so `mergePlan` says what is new against it. */
const asPerson = (base: IncomingCard): StellaPerson => ({
	id: 'base',
	firstName: base.firstName,
	lastName: base.lastName,
	displayName: base.displayName,
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: base.birthday,
	hasPhoto: false,
	fields: [
		...base.emails.map((f) => ({ kind: 'email' as const, value: f.value })),
		...base.phones.map((f) => ({ kind: 'phone' as const, value: f.value })),
		...base.addresses.map((f) => ({ kind: 'address' as const, value: f.value }))
	],
	homeLines: [],
	tags: []
});

const sameName = (a: string | null, b: string | null) =>
	(a === null ? null : foldName(a)) === (b === null ? null : foldName(b));

const sameDay = (a: IncomingCard['birthday'], b: IncomingCard['birthday']) =>
	a?.value === b?.value && a?.precision === b?.precision;

/**
 * The card narrowed to what changed on it since `base` — the whole card when Stella has not
 * seen it — and to the facts kept in step: what is not kept in step never comes in this way.
 */
export function changedOnCard(
	base: IncomingCard | null,
	card: IncomingCard,
	photos: PhotoPrints
): IncomingCard {
	const plan = base ? mergePlan(card, asPerson(base)) : null;
	const added = (kind: 'email' | 'phone' | 'address') =>
		plan === null
			? card[`${kind}s`]
			: plan.add.flatMap((f) => (f.kind === kind ? [{ value: f.value, label: f.label }] : []));
	const changed = <T>(now: T, same: boolean): T | null => (base && same ? null : now);

	return {
		...card,
		firstName: changed(card.firstName, sameName(card.firstName, base?.firstName ?? null)),
		lastName: changed(card.lastName, sameName(card.lastName, base?.lastName ?? null)),
		birthday: changed(card.birthday, sameDay(card.birthday, base?.birthday ?? null)),
		emails: added('email'),
		phones: added('phone'),
		addresses: added('address'),
		photo: photos.card !== null && photos.card !== photos.base ? card.photo : null,
		nickname: null,
		company: null,
		jobTitle: null,
		urls: [],
		tags: []
	};
}

/** What the changed card says differently than the person: asked about, Stella's side stays. */
export function syncConflicts(
	changed: IncomingCard,
	person: StellaPerson,
	photos: PhotoPrints
): SyncConflict[] {
	const conflicts: SyncConflict[] = [...mergePlan(changed, person).conflicts];
	if (changed.photo === 'inline' && person.hasPhoto && photos.stella !== photos.card) {
		conflicts.push({ kind: 'photo' });
	}
	return conflicts;
}
