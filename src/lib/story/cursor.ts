import * as v from 'valibot';
import type { StoryCursorView } from './item';

/*
 * The wire format of the story cursor (docs/02 §2.23). The client posts back exactly what the
 * previous page handed it, so anything else is refused rather than coerced: a cursor silently
 * read as "from the top" re-serves the whole story, and one read as "finished" truncates it.
 * Both failures look like a rendering glitch and are impossible to diagnose from the screen.
 */

const PointSchema = v.object({
	day: v.pipe(v.string(), v.minLength(1)),
	recordedAt: v.number()
});

/** A source resumes at the top, after a point, or not at all. */
const ResumeSchema = v.union([v.literal('top'), v.literal('finished'), PointSchema]);

/*
 * Every source is required, gifts included (docs/02 §2.25): a page opened before gifts joined
 * the story posts a cursor without them, and reading that as "from the top" or "finished"
 * would repeat or drop them. It is refused, and the page's *Show earlier* says so; a reload
 * hands it a whole cursor.
 */
const CursorSchema = v.object({
	journal: ResumeSchema,
	interactions: ResumeSchema,
	gifts: ResumeSchema
});

/** Parse a posted story cursor, or `null` when it is not one. */
export function parseStoryCursor(body: unknown): StoryCursorView | null {
	const parsed = v.safeParse(CursorSchema, body);
	return parsed.success ? parsed.output : null;
}
