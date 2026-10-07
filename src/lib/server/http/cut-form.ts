import * as v from 'valibot';
import type { CutProfilePictureInput } from '../domain/media/cuts';

/*
 * The form a profile picture cut from a group photo is sent with (docs/02 §2.14): which photo and
 * whom, the square in the full picture's pixels, and that square rendered by the browser at 1024 px
 * with its thumbnail. Read the same way from the circle page's lightbox and from the person page,
 * which both send it.
 */

const Id = v.pipe(v.string(), v.minLength(1));
const Measure = v.pipe(v.string(), v.transform(Number), v.number());

/** The form as a cut, or null when it is not one. */
export async function readCutForm(form: FormData): Promise<CutProfilePictureInput | null> {
	const image = form.get('image');
	const thumb = form.get('thumb');
	if (!(image instanceof File) || !(thumb instanceof File)) return null;
	const parsed = v.safeParse(
		v.object({
			photoId: Id,
			contactId: Id,
			cropX: Measure,
			cropY: Measure,
			cropSize: Measure,
			width: Measure,
			height: Measure
		}),
		Object.fromEntries(
			['photoId', 'contactId', 'cropX', 'cropY', 'cropSize', 'width', 'height'].map((key) => [
				key,
				form.get(key)
			])
		)
	);
	if (!parsed.success) return null;
	const f = parsed.output;
	return {
		photoId: f.photoId,
		contactId: f.contactId,
		crop: { x: f.cropX, y: f.cropY, size: f.cropSize },
		upload: {
			image: new Uint8Array(await image.arrayBuffer()),
			thumb: new Uint8Array(await thumb.arrayBuffer()),
			width: f.width,
			height: f.height
		}
	};
}
