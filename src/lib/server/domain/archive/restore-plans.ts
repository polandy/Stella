import { giftLink } from '../../../gifts/gifts';
import { isPlanWhen } from '../../../plans/plans';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';
import { todayFor } from '../../../dates/today';
import { whenColumns, whenFromOutside } from '../../../when/when';
import type { RestoreContext } from './restore-context';
import { bool, int, ms, records, str, visibilityOf, type Row } from './restore-fields';

/*
 * A restored person's outing ideas (docs/dev/02 §2.27, §2.15). An idea needs its line; a link that
 * is not a web address, a when of a kind ideas do not have and a moment that did not come along
 * are dropped rather than the idea. An archive from before ideas existed brings none.
 */

const isRealDay = (day: string | null): day is string =>
	day !== null && FULL_DATE_SHAPE.test(day) && isRealCalendarDay(day);

export function planRowsOf(
	person: Row,
	contactId: string,
	restoredEntries: ReadonlySet<string>,
	ctx: RestoreContext
): Row[] {
	const rows: Row[] = [];
	const member = (id: string | null) => (id !== null && ctx.members.has(id) ? id : null);
	for (const planRow of records(person, 'plans')) {
		const title = str(planRow, 'title');
		if (title === null) {
			ctx.warn({ code: 'planIncomplete' });
			continue;
		}
		const when = whenFromOutside({
			whenKind: str(planRow, 'when_kind'),
			whenOn: str(planRow, 'when_on'),
			whenAge: int(planRow, 'when_age')
		});
		const kept = when !== null && isPlanWhen(when) ? when : null;
		const { whenKind, whenOn, whenAge } = whenColumns(kept);
		const link = giftLink(str(planRow, 'url') ?? '');
		const bookedAt = ms(planRow, 'booked_at');
		const doneAt = ms(planRow, 'done_at');
		const doneOn = str(planRow, 'done_on');
		const momentId = str(planRow, 'moment_id');
		const visibility = visibilityOf(planRow);
		rows.push({
			id: str(planRow, 'id') ?? ctx.ids.next(),
			contact_id: contactId,
			created_by: ctx.author(planRow),
			visibility,
			// Only a shared idea can be kept from the person it is with.
			hidden_from_person: visibility === 'shared' && bool(planRow, 'hidden_from_person') ? 1 : 0,
			title,
			note: str(planRow, 'note'),
			url: link.ok ? link.url : null,
			when_kind: whenKind,
			when_on: whenOn,
			when_age: whenAge,
			booked_at: bookedAt,
			booked_by: bookedAt === null ? null : member(str(planRow, 'booked_by')),
			done_at: doneAt,
			done_on:
				doneAt === null ? null : isRealDay(doneOn) ? doneOn : todayFor({ now: () => doneAt }),
			done_by: doneAt === null ? null : member(str(planRow, 'done_by')),
			moment_id: momentId !== null && restoredEntries.has(momentId) ? momentId : null,
			...ctx.stamps(planRow)
		});
	}
	return rows;
}
