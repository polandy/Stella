import { isSafeMediaPath } from './archive';
import type { RestoreContext } from './restore-context';
import { int, ms, real, record, str, visibilityOf, type Row } from './restore-fields';

/*
 * The photos an archive brings (docs/02 §2.14, §2.15), wherever they hang: a person's gallery,
 * a journal entry, or a circle. The person and circle planners add them as they meet them; the
 * plan takes the survivors once every photo is in, since a framing needs its photo restored too.
 */

export type PhotoOwner =
	{ contactId: string; journalEntryId: string | null } | { circleId: string };

export interface PhotoPlan {
	add: (row: Row, owner: PhotoOwner) => void;
	/**
	 * Once every photo is in: the photos to insert, each framing with its photo and each cut-out
	 * without a lost source, and the media files they need as relative keys.
	 */
	finish: () => { photos: Row[]; mediaPaths: string[] };
}

export function photoPlan(ctx: RestoreContext): PhotoPlan {
	const { warn } = ctx;
	const photos: Row[] = [];
	const mediaPaths = new Set<string>();

	const add = (row: Row, owner: PhotoOwner) => {
		const file = str(row, 'file');
		const thumb = str(row, 'thumb');
		const view = str(row, 'view');
		if (file === null || thumb === null) {
			warn({ code: 'photoWithoutFile' });
			return;
		}
		if (
			!isSafeMediaPath(file) ||
			!isSafeMediaPath(thumb) ||
			(view !== null && !isSafeMediaPath(view))
		) {
			// A path out of the media directory is the one thing in an archive that could reach
			// the rest of the disk. It is refused, not cleaned up.
			warn({ code: 'photoBadPath', file });
			return;
		}
		mediaPaths.add(file);
		mediaPaths.add(thumb);
		if (view !== null) mediaPaths.add(view);
		const crop = record(row.crop);
		photos.push({
			id: str(row, 'id') ?? ctx.ids.next(),
			household_id: ctx.householdId,
			contact_id: 'contactId' in owner ? owner.contactId : null,
			journal_entry_id: 'contactId' in owner ? owner.journalEntryId : null,
			circle_id: 'circleId' in owner ? owner.circleId : null,
			circle_role: 'circleId' in owner ? str(row, 'role') : null,
			created_by: ctx.author(row),
			visibility: visibilityOf(row),
			file_path: file,
			thumb_path: thumb,
			view_path: view,
			mime: str(row, 'mime') ?? 'image/jpeg',
			width: int(row, 'width'),
			height: int(row, 'height'),
			size_bytes: int(row, 'bytes'),
			caption: str(row, 'caption'),
			taken_at: str(row, 'taken_at'),
			framing_of: str(row, 'framing_of'),
			cut_from: str(row, 'cut_from'),
			crop_x: crop ? real(crop, 'x') : null,
			crop_y: crop ? real(crop, 'y') : null,
			crop_size: crop ? real(crop, 'size') : null,
			pinned_at: ms(row, 'pinned_at'),
			created_at: ms(row, 'created_at') ?? ctx.now
		});
	};

	// A framing whose photo was refused above would be worn by nobody's gallery and could never
	// be removed from the interface; it goes with its photo, files included (docs/02 §2.14).
	// A profile picture cut from a group photo is such a framing too (concept §6). A photo that
	// was cut from one before only remembers it, so it stays and forgets a group photo refused.
	const finish = () => {
		const photoIds = new Set(photos.filter((p) => p.framing_of === null).map((p) => p.id));
		const kept = photos
			.filter((p) => {
				const framingOf = p.framing_of;
				if (typeof framingOf !== 'string' || photoIds.has(framingOf)) return true;
				mediaPaths.delete(p.file_path as string);
				mediaPaths.delete(p.thumb_path as string);
				return false;
			})
			.map((p) =>
				typeof p.cut_from === 'string' && !photoIds.has(p.cut_from) ? { ...p, cut_from: null } : p
			);
		return { photos: kept, mediaPaths: [...mediaPaths] };
	};

	return { add, finish };
}
