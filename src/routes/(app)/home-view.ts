import { mentionToken } from '$lib/mentions/mentions';
import { LINK_PARAM } from '$lib/stream/link-hint';

/*
 * What Home reads off its address and its capture form (docs/02 §2.22), as plain data so it is
 * tested without a request (docs/08 §8.5): `+page.server.ts` asks the household for the people
 * named here and hands the answer back.
 */

/** Query param that opens the composer pre-filled with one person's handle: `?about=<id>`. */
const ABOUT_PARAM = 'about';

/** A person the viewer may still act on, by the name they are shown under. */
interface OnList {
	id: string;
	displayName: string;
}

/** The people the address names: a link hint's pair, and the person a moment is about. */
export interface NamedPeople {
	pair: readonly [string, string];
	about: string;
	/** All of them, for one read of who the viewer may still act on. */
	ids: string[];
}

/** Who `?link=a,b` and `?about=` name; an absent one is ''. */
export function peopleNamedBy(params: URLSearchParams): NamedPeople {
	const [a = '', b = ''] = (params.get(LINK_PARAM) ?? '').split(',');
	const about = params.get(ABOUT_PARAM) ?? '';
	return { pair: [a, b], about, ids: [a, b, about].filter(Boolean) };
}

/** The hint only names people the viewer may see; anything else is silently dropped. */
export function linkSuggestionAmong(named: NamedPeople, onList: readonly OnList[]) {
	const nameOnList = new Map(onList.map((c) => [c.id, c.displayName]));
	const [a, b] = named.pair;
	const [nameA, nameB] = [nameOnList.get(a), nameOnList.get(b)];
	return a && b && nameA && nameB ? { a: { id: a, name: nameA }, b: { id: b, name: nameB } } : null;
}

/** "Write a moment" on an upcoming date opens the composer with that person already in it. */
export function composerFor(
	params: URLSearchParams,
	named: NamedPeople,
	onList: readonly OnList[]
) {
	const about = onList.find((c) => c.id === named.about);
	return {
		compose: params.has('compose') || about !== undefined,
		// As stored, so the composer takes the person as picked — a namesake too (docs/02 §2.2.3).
		draft: about ? `${mentionToken(about.id)} ` : null
	};
}

/** One photo a moment carries, as the composer posts it. */
export interface PostedPhoto {
	image: File;
	thumb: File;
	width: number;
	height: number;
	/** The id the composer named its command by, or null for one to be made here. */
	photoId: string | null;
}

/**
 * The photos of a capture form: `image`, `thumb`, `width`, `height` and `photoId` repeated in
 * step. A pair that is not two files is skipped; a size that does not read is left for the
 * photo command to refuse.
 */
export function photosPosted(form: FormData): PostedPhoto[] {
	const images = form.getAll('image');
	const thumbs = form.getAll('thumb');
	const widths = form.getAll('width');
	const heights = form.getAll('height');
	const photoIds = form.getAll('photoId');
	const posted: PostedPhoto[] = [];
	for (let i = 0; i < images.length; i++) {
		const image = images[i];
		const thumb = thumbs[i];
		if (!(image instanceof File) || !(thumb instanceof File)) continue;
		const photoId = photoIds[i];
		posted.push({
			image,
			thumb,
			width: Number(widths[i]),
			height: Number(heights[i]),
			photoId: typeof photoId === 'string' && photoId ? photoId : null
		});
	}
	return posted;
}
