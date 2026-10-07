import { circleActions } from './actions/circles';
import { dateActions } from './actions/dates';
import { fieldActions } from './actions/fields';
import { immichActions } from './actions/immich';
import { noteActions } from './actions/notes';
import { photoActions } from './actions/photos';
import { profileActions } from './actions/profile';
import { recordActions } from './actions/record';
import { relationshipActions } from './actions/relationships';
import { storyActions } from './actions/story';
import { tagActions } from './actions/tags';
import { lastNameActions } from '$lib/server/last-names-actions';
import type { Actions } from './$types';

/*
 * The person page (docs/02 §2.2, docs/05 §5.5). What it reads is `load.ts`; what its forms
 * post is grouped in `actions/` the way the page groups its cards, so each card's actions sit
 * in one short file rather than in one long list.
 */
export { load } from './load';

export const actions = {
	...profileActions,
	...recordActions,
	...relationshipActions,
	...noteActions,
	...fieldActions,
	...dateActions,
	...storyActions,
	...tagActions,
	...photoActions,
	...circleActions,
	// Which Immich person they are (docs/02 §2.24.2).
	...immichActions,
	// The chip under the name and passing a name on (docs/concepts/surnames.md §3.3, §3.4).
	...lastNameActions
} satisfies Actions;
