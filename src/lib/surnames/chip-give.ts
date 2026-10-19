import type { Translate } from '../i18n/translate';
import { whilePending } from '../sync/pending';
import type { PendingSink } from '../sync/pending-work';
import { ActionFailedError } from '../undo/submit-action';

/*
 * The profile's last-name chip (docs/02 §2.2.4.6). Unlike the bulk paths, which hold a batch
 * for the undo window, a tap here saves at once: the shell's activity indicator shows from the
 * tap until the server has answered and the page has reloaded, so the new name is on screen
 * when it goes. Then a toast says so and offers *Undo*, which takes the name back the same way —
 * unless it was changed meanwhile, which the server refuses (`takeBackLastName`).
 *
 * Plain logic over injected effects, so every step is tested in order without a browser.
 */

/** The status `?/takeBackLastName` answers when the name changed since it was given. */
export const LAST_NAME_CHANGED_STATUS = 409;

const GIVE_ACTION = '?/setLastNames';
const TAKE_BACK_ACTION = '?/takeBackLastName';

/** What the chip needs from the page it stands on. */
export interface ChipGiveDeps {
	/** Posts a form action and resolves once it succeeded; throws `ActionFailedError` otherwise. */
	send(action: string, body: FormData): Promise<void>;
	/** Reloads the page's data, so the name on screen is the stored one. */
	refresh(): Promise<void>;
	/** The shell's pending-work store. */
	pending: PendingSink;
	/** The removals store's `notify`: a message, with *Undo* when `takeBack` is given. */
	notify(text: string, takeBack?: () => void): void;
	t: Translate;
}

/** One tap on a chip: who, which name, and the name as it stood before. */
export interface ChipGive {
	/** The person page's path, which both actions post to. */
	page: string;
	contactId: string;
	lastName: string;
	/** What giving a last name may change, so *Undo* can put it back exactly. */
	before: { displayName: string; firstName: string | null };
}

/**
 * Give the chip's name. True once it is saved and on screen, with the toast up; false when the
 * save failed — the toast says so, and the chip belongs back where it was.
 */
export async function giveFromChip(deps: ChipGiveDeps, give: ChipGive): Promise<boolean> {
	const body = new FormData();
	body.set('contactId', give.contactId);
	body.set('lastName', give.lastName);
	const saved = await whilePending(deps.pending, async () => {
		try {
			await deps.send(`${give.page}${GIVE_ACTION}`, body);
		} catch (error) {
			console.error('Could not give the last name from the chip:', error);
			return false;
		}
		await deps.refresh();
		return true;
	});
	if (!saved) {
		deps.notify(deps.t('surnames.chipFailed'));
		return false;
	}
	deps.notify(
		deps.t('surnames.chipGiven', { name: give.lastName, person: give.before.displayName }),
		() => void takeBackChip(deps, give)
	);
	return true;
}

/**
 * *Undo* on the chip's toast: the name exactly as it was before. True once that is saved and on
 * screen; false when it was refused or failed, each with its own message.
 */
export async function takeBackChip(deps: ChipGiveDeps, give: ChipGive): Promise<boolean> {
	const body = new FormData();
	body.set('contactId', give.contactId);
	body.set('lastName', give.lastName);
	body.set('beforeDisplayName', give.before.displayName);
	body.set('beforeFirstName', give.before.firstName ?? '');
	const outcome = await whilePending(deps.pending, async () => {
		try {
			await deps.send(`${give.page}${TAKE_BACK_ACTION}`, body);
		} catch (error) {
			if (error instanceof ActionFailedError && error.status === LAST_NAME_CHANGED_STATUS) {
				// Show the name as it now stands, which is why nothing was taken back.
				await deps.refresh();
				return 'changed';
			}
			console.error('Could not take back the last name given from the chip:', error);
			return 'failed';
		}
		await deps.refresh();
		return 'done';
	});
	if (outcome === 'changed')
		deps.notify(deps.t('errors.contact.lastNameChanged', { name: give.before.displayName }));
	else if (outcome === 'failed') deps.notify(deps.t('surnames.chipUndoFailed'));
	return outcome === 'done';
}
