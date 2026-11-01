/*
 * What another app shared into Stella (docs/02 §2.18.3), and where it can go. Pure: the share
 * sheet reads it on the device, offline too, and the service worker only hands over the parts.
 *
 * Android is loose about the fields: a browser sharing a page often sends its title as `title`
 * and the address inside `text`, leaving `url` empty. So the link is taken from `url` when it
 * is one, else from the first web address in the text, and the words are what is left.
 */

/** The most photos one share takes; the rest are left out and the sheet says so. */
export const MAX_SHARED_PHOTOS = 10;

/** The parts of a share as the form fields and the file count arrive. */
export interface ShareParts {
	title: string;
	text: string;
	url: string;
	photoCount: number;
}

/** What a share is, once read. */
export type Shared =
	| { kind: 'photos'; count: number; dropped: number }
	| { kind: 'words'; words: string; link: string | null }
	| { kind: 'nothing' };

/** The words of a share, as every target below takes them. */
export type SharedWords = Extract<Shared, { kind: 'words' }>;

/** Where a share can be saved. */
export type ShareTarget = 'moment' | 'gift' | 'todo' | 'gallery' | 'avatar';

/** Why a target cannot be picked: several photos make no profile photo, and it is online-only. */
export type ShareBlock = 'severalPhotos' | 'offline';

export interface ShareChoice {
	id: ShareTarget;
	blockedBy: ShareBlock | null;
}

const WEB_ADDRESS = /https?:\/\/[^\s<>"]+/i;

/** Punctuation that closes the sentence around a link rather than belonging to it. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]'"]+$/;

function webAddress(value: string): string | null {
	const trimmed = value.trim();
	return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

function firstWebAddressIn(text: string): string | null {
	const found = WEB_ADDRESS.exec(text);
	return found ? found[0].replace(TRAILING_PUNCTUATION, '') : null;
}

export function readShared(parts: ShareParts): Shared {
	if (parts.photoCount > 0) {
		const count = Math.min(parts.photoCount, MAX_SHARED_PHOTOS);
		return { kind: 'photos', count, dropped: parts.photoCount - count };
	}
	const link = webAddress(parts.url) ?? firstWebAddressIn(parts.text);
	const rest = (link ? parts.text.replace(link, '') : parts.text).trim();
	const words = rest || parts.title.trim();
	if (!words && !link) return { kind: 'nothing' };
	return { kind: 'words', words, link };
}

/** A moment's text: the words, and the link as a paragraph of its own below them. */
export function momentBodyFrom(shared: SharedWords): string {
	return [shared.words, shared.link].filter(Boolean).join('\n\n');
}

/** A gift idea named by the words, or by the link when nothing else came; the link kept apart. */
export function giftIdeaFrom(shared: SharedWords): { title: string; url: string | null } {
	return { title: shared.words || (shared.link ?? ''), url: shared.link };
}

/** A to-do is one line: the words with their breaks folded, the link at the end. */
export function todoTitleFrom(shared: SharedWords): string {
	return [shared.words.replace(/\s+/g, ' ').trim(), shared.link].filter(Boolean).join(' ');
}

/**
 * The targets a share can go to, the one picked at first leading. Every target but the
 * profile photo waits in the outbox when Stella cannot be reached (docs/02 §2.18.1); a profile
 * photo is cropped and sent at once, so it needs the connection.
 */
export function choicesFor(shared: Shared, { reachable }: { reachable: boolean }): ShareChoice[] {
	switch (shared.kind) {
		case 'words':
			return [
				{ id: 'moment', blockedBy: null },
				{ id: 'gift', blockedBy: null },
				{ id: 'todo', blockedBy: null }
			];
		case 'photos':
			return [
				{ id: 'gallery', blockedBy: null },
				{
					id: 'avatar',
					blockedBy: shared.count > 1 ? 'severalPhotos' : reachable ? null : 'offline'
				}
			];
		case 'nothing':
			return [];
	}
}
