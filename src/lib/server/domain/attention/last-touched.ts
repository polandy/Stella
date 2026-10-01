import type { Viewer } from '../../access/visibility';

/*
 * Recorded attention (docs/02 §2.2): the latest day the household wrote anything about a
 * person, as the People list shows it. It measures what was *recorded*, not contact — Stella
 * cannot know about the phone call nobody logged.
 */

/** One person the viewer may see, with the latest day they may see anything about. */
export interface LastTouched {
	contactId: string;
	/** ISO `YYYY-MM-DD` of the most recent story item, or null when there is none. */
	lastTouchedOn: string | null;
}

/** Port: every person the viewer may see, with the latest day they may see anything about. */
export interface AttentionRepository {
	listLastTouchedVisibleTo(viewer: Viewer): Promise<LastTouched[]>;
}
