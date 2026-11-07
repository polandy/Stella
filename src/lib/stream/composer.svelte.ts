import { processImage } from '$lib/media/process-image';
import type { MomentDraft } from '$lib/people/story-forms';
import type { KeptPhoto } from '$lib/pwa/outbox';
import { outbox } from '$lib/pwa/outbox.svelte';
import { reachability } from '$lib/pwa/reachability.svelte';
import { untrack } from 'svelte';
import { ulid } from 'ulid';
import {
	composerAfter,
	type ComposerCommand,
	type ComposerEvent,
	type ComposerState
} from './composer-state';

/*
 * The moment composer's browser half (docs/02 §2.22.1): it holds the state `composer-state.ts`
 * moves on, and carries out the commands each step hands back — the outbox, photo processing
 * and fresh command names here, everything that touches the page through its `host`.
 */

/** What the composer on the page does when a step asks for it. */
export interface ComposerHost {
	focusText(caret: number | null): Promise<void>;
	focusCreate(): Promise<void>;
	/** Home to the stream, then point to the moment that landed in `entryId`. */
	backToStream(href: string, entryId: string): Promise<void>;
	/** Whether a save stays on this page (an `onSaved` is given) rather than going home. */
	savesInPlace(): boolean;
	onSaved(): void;
	onKept(): void;
	onEditDone(): void;
	onCancel(draft: MomentDraft): void;
}

export class ComposerController {
	// Raw, and read through one derived per field on the page, so an event that changes one of
	// them re-runs only what reads that one.
	state: ComposerState;
	readonly #host: ComposerHost;

	constructor(start: ComposerState, host: ComposerHost) {
		this.state = $state.raw(start);
		this.#host = host;
	}

	/** Moves the state on, then carries out what it asks for; settles once all of it has. */
	dispatch = async (event: ComposerEvent): Promise<void> => {
		// Untracked: an effect that dispatches must not come to depend on the state it writes, nor
		// on whatever a command reads on its way.
		const step = composerAfter(
			untrack(() => this.state),
			event
		);
		this.state = step.state;
		await Promise.all(untrack(() => step.commands.map((c) => this.#carryOut(c))));
	};

	async #carryOut(command: ComposerCommand): Promise<void> {
		const host = this.#host;
		switch (command.kind) {
			case 'focusText':
				return host.focusText(command.caret);
			case 'focusCreate':
				return host.focusCreate();
			case 'preparePhotos': {
				const prepared = await preparePhotos(command.files);
				return this.dispatch({
					type: 'photosPrepared',
					photos: prepared,
					reachable: reachability.reachable
				});
			}
			case 'keep':
				// Keep the moment, and its photos, on this device until Stella answers again.
				try {
					await outbox.add(
						{
							id: command.id,
							type: 'moment.capture',
							payload: command.payload,
							issuedAt: Date.now()
						},
						command.photos
					);
					await this.dispatch({ type: 'keptOnDevice', nextCommandId: ulid() });
				} catch {
					await this.dispatch({ type: 'keepFailed' });
				}
				return;
			case 'submit': {
				const delivery = await outbox.submit(
					{
						id: command.id,
						type: 'moment.capture',
						payload: command.payload,
						issuedAt: Date.now()
					},
					command.photos
				);
				return this.dispatch({
					type: 'answered',
					delivery,
					inPlace: host.savesInPlace(),
					nextCommandId: ulid()
				});
			}
			case 'revise': {
				const saved = await outbox.revise(command.id, command.payload, ulid());
				return this.dispatch({ type: 'revised', saved, nextCommandId: ulid() });
			}
			case 'backToStream':
				return host.backToStream(command.href, command.entryId);
			case 'onSaved':
				return host.onSaved();
			case 'onKept':
				return host.onKept();
			case 'onEditDone':
				return host.onEditDone();
			case 'onCancel':
				return host.onCancel(command.draft);
		}
	}
}

/**
 * The picked photos, processed in the browser (downscaled, location stripped) and each named
 * as a command of its own — once per save, so a save that ends up kept for later sends the
 * very same photos under the very same names.
 */
async function preparePhotos(files: readonly File[]): Promise<KeptPhoto[]> {
	const prepared: KeptPhoto[] = [];
	for (const file of files) {
		const { image, thumb, width, height, takenAt } = await processImage(file);
		prepared.push({ id: ulid(), image, thumb, width, height, takenAt });
	}
	return prepared;
}
