import type { NewInteraction } from '../../interactions/interactions';
import type { NewNote } from '../../notes/notes';
import type { Gift } from '../../gifts/gifts';
import type { Todo } from '../../todos/todos';
import { giftFromMonica } from '../../../../gifts/conversion';
import type { MonicaId, SourceExport } from './monica-export';
import type { MonicaPlanContext, SkippedKind } from './plan';
import { taskDone, taskLine } from './tasks';
import { humanise, orNull } from './text';

/*
 * What Monica kept about each person (docs/02 §2.16, docs/monica-mapping.md): notes, gifts,
 * tasks and activities have a record of their own here; life events and pets, which Stella has
 * no home for, become notes, and so does a gift the conversion refuses.
 */

export interface PersonRecords {
	notes: NewNote[];
	gifts: Gift[];
	todos: Todo[];
	interactions: NewInteraction[];
}

export function planPersonRecords(exp: SourceExport, ctx: MonicaPlanContext): PersonRecords {
	const { prefix, contactId, liveIds, opts, skip, stamp } = ctx;
	const wording = opts.wording;
	const notes: NewNote[] = [];
	const noteFor = (
		id: string,
		monicaContactId: MonicaId,
		title: string | null,
		body: string,
		isPinned = false,
		what: SkippedKind = 'note'
	) => {
		if (!liveIds.has(monicaContactId)) {
			skip(what, 'belongsToDeletedContact');
			return;
		}
		notes.push({ id, contactId: contactId(monicaContactId), ...stamp, title, body, isPinned });
	};
	for (const n of exp.notes)
		noteFor(`${prefix}:note:${n.id}`, n.contactId, null, n.body, n.isFavorited);
	// A Monica gift becomes a gift record (docs/02 §2.25.4) under the id its note had, so a
	// note left from an earlier import and its gift are one record. One the conversion refuses
	// — given without a day, a status Monica does not have — stays the note it always was.
	const gifts: Gift[] = [];
	for (const g of exp.gifts) {
		const made = giftFromMonica({
			name: g.name,
			status: g.status,
			day: g.date,
			comment: g.comment,
			url: g.url
		});
		if (made.ok) {
			if (!liveIds.has(g.contactId)) {
				skip('gift', 'belongsToDeletedContact');
				continue;
			}
			gifts.push({
				id: `${prefix}:gift:${g.id}`,
				contactId: contactId(g.contactId),
				...stamp,
				...made.gift,
				occasion: null
			});
			continue;
		}
		const meta = [g.status, g.date ? wording.day(g.date) : null].filter(Boolean).join(', ');
		const lines = [
			`🎁 **${g.name}**${meta ? ` — ${meta}` : ''}`,
			orNull(g.comment),
			orNull(g.url)
		].filter(Boolean);
		noteFor(`${prefix}:gift:${g.id}`, g.contactId, wording.gift, lines.join('\n\n'), false, 'gift');
	}
	// ── Tasks → to-dos (docs/02 §2.26.8) ───────────────────────────────────
	const todos: Todo[] = [];
	for (const t of exp.tasks) {
		if (t.contactId === null) {
			skip('task', 'attachedToNoPerson');
			continue;
		}
		if (!liveIds.has(t.contactId)) {
			skip('task', 'belongsToDeletedContact');
			continue;
		}
		const title = taskLine(t);
		if (title === null) {
			skip('task', 'empty');
			continue;
		}
		const done = taskDone(t, opts.now);
		todos.push({
			id: `${prefix}:task:${t.id}`,
			contactId: contactId(t.contactId),
			...stamp,
			title,
			dueOn: null,
			doneAt: done?.doneAt ?? null,
			doneOn: done?.doneOn ?? null,
			// Monica does not say who ticked it; the import is the importing member's word.
			doneBy: done ? opts.userId : null
		});
	}

	for (const e of exp.lifeEvents) {
		const head = `📅 **${e.name ?? (e.typeKey ? humanise(e.typeKey) : wording.lifeEvent)}**${e.typeKey && e.name ? ` (${humanise(e.typeKey)})` : ''}`;
		const when = e.happenedAt ? ` — ${wording.day(e.happenedAt)}` : '';
		noteFor(
			`${prefix}:lifeevent:${e.id}`,
			e.contactId,
			wording.lifeEvent,
			[head + when, orNull(e.note)].filter(Boolean).join('\n\n'),
			false,
			'lifeEvent'
		);
	}
	for (const p of exp.pets) {
		noteFor(
			`${prefix}:pet:${p.id}`,
			p.contactId,
			wording.pet,
			`🐾 **${p.name ?? wording.pet}**${p.category ? `, ${p.category}` : ''}`,
			false,
			'pet'
		);
	}

	// ── Activities → interactions ───────────────────────────────────────────
	const interactions: NewInteraction[] = [];
	for (const a of exp.activities) {
		const people = a.contactIds.filter((id) => liveIds.has(id));
		if (people.length === 0) {
			skip(
				'activity',
				a.contactIds.length === 0 ? 'linkedToNoPerson' : 'linkedOnlyToDeletedContacts'
			);
			continue;
		}
		const [subject, ...participants] = people;
		const description = [
			orNull(a.description),
			a.typeKey ? wording.monicaActivity(humanise(a.typeKey)) : null
		]
			.filter(Boolean)
			.join('\n\n');
		interactions.push({
			id: `${prefix}:activity:${a.id}`,
			contactId: contactId(subject!),
			...stamp,
			kind: 'met',
			happenedAt: a.happenedAt,
			title: orNull(a.summary),
			description: orNull(description),
			participantIds: participants.map(contactId)
		});
	}
	return { notes, gifts, todos, interactions };
}
