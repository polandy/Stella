import type { HouseholdSnapshot, TableRows } from './archive';

/*
 * The export document (docs/02 §2.15): everything the household owns, arranged around the
 * people it is about rather than around Stella's tables — so another program, or a person with
 * a text editor in ten years, can read it without knowing this schema.
 *
 * Two people can share a first and last name, so **the id is the key**: every person carries
 * theirs, and every relationship, mention, participation and membership names people by that id
 * and never by their name.
 *
 * Every column that carries meaning is in here, because whatever this file drops is lost the
 * day the archive is read back. The exceptions are deliberate: `updated_at` (bookkeeping, set
 * afresh on import) and the household's and members' own settings, which belong to the
 * installation the archive lands in rather than to the archive.
 *
 * Pure: rows in, a plain object out. The caller turns it into YAML.
 */

/** Stamped into the document so a reader can refuse a file that is not one of ours. */
export const ARCHIVE_FORMAT = 'stella-archive';

/** Bumped when the document changes shape in a way an older reader cannot follow. */
export const ARCHIVE_VERSION = 1;

type Row = Record<string, unknown>;

const text = (row: Row, column: string): string | null => {
	const value = row[column];
	return typeof value === 'string' && value.length > 0 ? value : null;
};
const num = (row: Row, column: string): number | null => {
	const value = row[column];
	return typeof value === 'number' ? value : null;
};
const flag = (row: Row, column: string): boolean => row[column] === 1 || row[column] === true;
const id = (row: Row, column = 'id'): string => String(row[column] ?? '');
/** A count worth writing only when it is not the default; `present` drops the rest. */
const ordinal = (row: Row, column: string): number | null => num(row, column) || null;

/** An instant as an ISO string, because a millisecond count means nothing to a reader. */
const moment = (row: Row, column: string): string | null => {
	const value = num(row, column);
	return value === null ? null : new Date(value).toISOString();
};

/** Groups child rows under the id they point at, keeping each group in row order. */
function groupBy(rows: TableRows, column: string): Map<string, TableRows> {
	const groups = new Map<string, TableRows>();
	for (const row of rows) {
		const key = id(row, column);
		const group = groups.get(key);
		if (group) group.push(row);
		else groups.set(key, [row]);
	}
	return groups;
}

/** The ids on the far side of a link table, grouped by the near side. */
function linksBy(rows: TableRows, from: string, to: string): Map<string, string[]> {
	const links = new Map<string, string[]>();
	for (const row of rows) {
		const key = id(row, from);
		const list = links.get(key);
		if (list) list.push(id(row, to));
		else links.set(key, [id(row, to)]);
	}
	return links;
}

/** Drops the keys whose value is null, so the document reads as what is there. */
function present<T extends Record<string, unknown>>(value: T): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value)) if (v !== null) out[key] = v;
	return out as Partial<T>;
}

export interface ArchiveDocument {
	format: typeof ARCHIVE_FORMAT;
	version: number;
	exported_at: string;
	household: string;
	counts: Record<string, number>;
	/** The household's accounts. Never their credentials. */
	members: Record<string, unknown>[];
	relationship_types: Record<string, unknown>[];
	tags: Record<string, unknown>[];
	circles: Record<string, unknown>[];
	people: Record<string, unknown>[];
	relationships: Record<string, unknown>[];
	activity: Record<string, unknown>[];
}

export function buildArchiveDocument(
	snapshot: HouseholdSnapshot,
	exportedAt: number
): ArchiveDocument {
	const t = (name: string): TableRows => snapshot.tables[name] ?? [];

	const fields = groupBy(t('contact_field'), 'contact_id');
	const dates = groupBy(t('important_date'), 'contact_id');
	const notes = groupBy(t('note'), 'contact_id');
	const entries = groupBy(t('journal_entry'), 'contact_id');
	const interactions = groupBy(t('interaction'), 'contact_id');
	const galleryPhotos = groupBy(
		t('photo').filter((p) => text(p, 'journal_entry_id') === null),
		'contact_id'
	);
	const entryPhotos = groupBy(
		t('photo').filter((p) => text(p, 'journal_entry_id') !== null),
		'journal_entry_id'
	);
	const noteMentions = linksBy(t('note_mention'), 'note_id', 'contact_id');
	const entryMentions = linksBy(t('journal_mention'), 'journal_entry_id', 'contact_id');
	const participants = linksBy(t('interaction_participant'), 'interaction_id', 'contact_id');
	const contactTags = linksBy(t('contact_tag'), 'contact_id', 'tag_id');
	const circleMembers = groupBy(t('circle_membership'), 'circle_id');

	const photo = (row: Row) =>
		present({
			id: id(row),
			file: text(row, 'file_path'),
			thumb: text(row, 'thumb_path'),
			mime: text(row, 'mime'),
			width: num(row, 'width'),
			height: num(row, 'height'),
			bytes: num(row, 'size_bytes'),
			sort_order: ordinal(row, 'sort_order'),
			caption: text(row, 'caption'),
			taken_at: text(row, 'taken_at'),
			visibility: text(row, 'visibility'),
			author: text(row, 'created_by'),
			created_at: moment(row, 'created_at')
		});

	const people = t('contact').map((c) => {
		const person = id(c);
		return present({
			id: person,
			display_name: text(c, 'display_name'),
			first_name: text(c, 'first_name'),
			last_name: text(c, 'last_name'),
			nickname: text(c, 'nickname'),
			prefix: text(c, 'prefix'),
			suffix: text(c, 'suffix'),
			former_name: text(c, 'former_name'),
			gender: text(c, 'gender'),
			pronouns: text(c, 'pronouns'),
			job_title: text(c, 'job_title'),
			company: text(c, 'company'),
			description: text(c, 'description'),
			birth_date: text(c, 'birth_date'),
			birth_date_precision: text(c, 'birth_date_precision'),
			deceased: flag(c, 'is_deceased') ? true : null,
			death_date: text(c, 'death_date'),
			how_we_met: text(c, 'how_we_met'),
			met_date: text(c, 'met_date'),
			met_place: text(c, 'met_place'),
			avatar: text(c, 'avatar_photo_id'),
			visibility: text(c, 'visibility'),
			author: text(c, 'created_by'),
			archived_at: moment(c, 'archived_at'),
			created_at: moment(c, 'created_at'),
			tags: contactTags.get(person) ?? null,
			fields: (fields.get(person) ?? []).map((f) =>
				present({
					id: id(f),
					kind: text(f, 'kind'),
					label: text(f, 'label'),
					value: text(f, 'value'),
					meta: text(f, 'meta'),
					sort_order: ordinal(f, 'sort_order')
				})
			),
			important_dates: (dates.get(person) ?? []).map((d) =>
				present({
					id: id(d),
					kind: text(d, 'kind'),
					label: text(d, 'label'),
					date: text(d, 'date'),
					recurs_yearly: flag(d, 'recurs_yearly') ? true : null,
					remind: flag(d, 'remind') ? true : null
				})
			),
			notes: (notes.get(person) ?? []).map((n) =>
				present({
					id: id(n),
					title: text(n, 'title'),
					body: text(n, 'body'),
					pinned: flag(n, 'is_pinned') ? true : null,
					visibility: text(n, 'visibility'),
					author: text(n, 'created_by'),
					created_at: moment(n, 'created_at'),
					mentions: noteMentions.get(id(n)) ?? null
				})
			),
			journal: (entries.get(person) ?? []).map((e) =>
				present({
					id: id(e),
					date: text(e, 'entry_date'),
					title: text(e, 'title'),
					body: text(e, 'body'),
					visibility: text(e, 'visibility'),
					author: text(e, 'created_by'),
					created_at: moment(e, 'created_at'),
					mentions: entryMentions.get(id(e)) ?? null,
					photos: (entryPhotos.get(id(e)) ?? []).map(photo)
				})
			),
			interactions: (interactions.get(person) ?? []).map((i) =>
				present({
					id: id(i),
					kind: text(i, 'kind'),
					happened_at: text(i, 'happened_at'),
					title: text(i, 'title'),
					description: text(i, 'description'),
					visibility: text(i, 'visibility'),
					author: text(i, 'created_by'),
					created_at: moment(i, 'created_at'),
					participants: participants.get(id(i)) ?? null
				})
			),
			photos: (galleryPhotos.get(person) ?? []).map(photo)
		});
	});

	const counts: Record<string, number> = {};
	for (const [table, rows] of Object.entries(snapshot.tables)) counts[table] = rows.length;

	return {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		exported_at: new Date(exportedAt).toISOString(),
		household: snapshot.householdName,
		counts,
		people,
		members: t('user').map((u) =>
			present({
				id: id(u),
				name: text(u, 'name'),
				email: text(u, 'email'),
				role: text(u, 'role'),
				created_at: moment(u, 'created_at')
			})
		),
		relationship_types: t('relationship_type').map((r) =>
			present({
				id: id(r),
				key: text(r, 'key'),
				forward_label: text(r, 'forward_label'),
				reverse_label: text(r, 'reverse_label'),
				category: text(r, 'category'),
				symmetric: flag(r, 'symmetric') ? true : null,
				sort_order: ordinal(r, 'sort_order')
			})
		),
		tags: t('tag').map((tag) =>
			present({
				id: id(tag),
				name: text(tag, 'name'),
				color: text(tag, 'color'),
				created_at: moment(tag, 'created_at')
			})
		),
		circles: t('circle').map((c) =>
			present({
				id: id(c),
				name: text(c, 'name'),
				kind: text(c, 'kind'),
				description: text(c, 'description'),
				color: text(c, 'color'),
				parent: text(c, 'parent_circle_id'),
				start: text(c, 'start_date'),
				end: text(c, 'end_date'),
				archived_at: moment(c, 'archived_at'),
				visibility: text(c, 'visibility'),
				author: text(c, 'created_by'),
				created_at: moment(c, 'created_at'),
				members: (circleMembers.get(id(c)) ?? []).map((m) =>
					present({
						id: id(m),
						person: id(m, 'contact_id'),
						role: text(m, 'role'),
						// The columns are start_date/end_date; the reader gets the plainer words.
						since: text(m, 'start_date'),
						until: text(m, 'end_date'),
						note: text(m, 'note'),
						author: text(m, 'created_by'),
						created_at: moment(m, 'created_at')
					})
				)
			})
		),
		relationships: t('relationship').map((r) =>
			present({
				id: id(r),
				from: id(r, 'from_contact_id'),
				to: id(r, 'to_contact_id'),
				type: id(r, 'type_id'),
				description: text(r, 'note'),
				since: text(r, 'since_date'),
				status: text(r, 'status'),
				author: text(r, 'created_by'),
				created_at: moment(r, 'created_at')
			})
		),
		activity: t('activity_log').map((a) =>
			present({
				id: id(a),
				action: text(a, 'action'),
				entity_type: text(a, 'entity_type'),
				entity_id: text(a, 'entity_id'),
				person: text(a, 'contact_id'),
				actor: text(a, 'actor_id'),
				summary: text(a, 'summary'),
				visibility: text(a, 'visibility'),
				created_at: moment(a, 'created_at')
			})
		)
	};
}
