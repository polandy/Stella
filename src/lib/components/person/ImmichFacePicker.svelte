<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { submitAction } from '$lib/undo/submit-action';

	/*
	 * *Find in Immich* (docs/02 §2.24.2): the faces in the household's Immich, searched
	 * by the person's name, and one tap links the face that is them. The face does the work — you
	 * recognise your aunt faster than you read her name — so faces lead and names follow. Faces
	 * come through Stella's signed proxy, never from Immich directly: each arrives with a URL
	 * signed for this person's picker (docs/04 ADR-097).
	 *
	 * Opened by the Photos card's menu through `open`; a pick is a plain form post, so the page
	 * reloads with the link and the dialog goes with it. Opened from the picture's chooser
	 * (docs/02 §2.24.6) it is given `onlinked` instead: the link is posted in place, the page's
	 * data reloaded, and the chooser opens again on the person's Immich photos. A face already linked to another person
	 * stays in the grid — leaving it out would read as "Immich does not know them" — but cannot
	 * be picked, and says whose it is when the member may see that person (docs/04 ADR-096).
	 */
	interface Props {
		contactId: string;
		/** The person's name as the page shows it, for the title. */
		name: string;
		/** What the search starts with: the person's first and last name. */
		searchName: string;
		/** Bindable: set to open the dialog; the dialog clears it when it closes. */
		open?: boolean;
		/** When given, a pick links in place and this follows, instead of the page navigating. */
		onlinked?: () => void;
	}
	let { contactId, name, searchName, open = $bindable(false), onlinked }: Props = $props();

	/** A face as the faces route sends it; `linkedTo` is set when another person has it already. */
	interface Face {
		id: string;
		name: string;
		linkedTo: { name: string | null } | null;
		/** The face's thumbnail, through Stella's signed proxy. */
		faceUrl: string;
	}

	const i18n = useI18n();
	const t = i18n.t;

	let dialog: HTMLDialogElement | undefined = $state();
	let query = $state('');
	let faces = $state<Face[]>([]);
	let error = $state<string | null>(null);
	let searching = $state(false);
	/** Searched at least once since opening, so "nobody" is only said after an answer. */
	let answered = $state(false);
	/* Only the latest search may fill the list: an earlier, slower answer arriving last would
	 * otherwise show faces for a name no longer in the field. */
	let latest = 0;

	async function search() {
		const asked = ++latest;
		searching = true;
		error = null;
		try {
			const response = await fetch(
				`/contacts/${contactId}/immich/faces?q=${encodeURIComponent(query)}`
			);
			if (!response.ok) throw new Error(`faces answered ${response.status}`);
			const body = (await response.json()) as { faces: Face[]; error: string | null };
			if (asked !== latest) return;
			faces = body.faces;
			error = body.error;
		} catch {
			if (asked !== latest) return;
			faces = [];
			error = t('immich.error.unreachable');
		} finally {
			if (asked === latest) {
				searching = false;
				answered = true;
			}
		}
	}

	$effect(() => {
		if (!open || !dialog || dialog.open) return;
		query = searchName;
		faces = [];
		answered = false;
		dialog.showModal();
		void search();
	});

	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		void search();
	}

	/** A pick posted in place, for a caller that carries on from the link (`onlinked`). */
	async function linkInPlace(event: SubmitEvent) {
		if (!onlinked) return;
		event.preventDefault();
		const done = onlinked;
		error = null;
		try {
			const body = new FormData(event.currentTarget as HTMLFormElement);
			await submitAction(fetch, `/contacts/${encodeURIComponent(contactId)}?/linkImmich`, body, {
				keepalive: false
			});
			dialog?.close();
			await invalidateAll();
			done();
		} catch {
			error = t('common.somethingWentWrong');
		}
	}

	const INPUT =
		'min-w-0 flex-1 rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg';
</script>

<dialog
	bind:this={dialog}
	aria-label={t('immich.picker.title', { name })}
	onclose={() => (open = false)}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="m-auto w-full max-w-lg rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
	data-testid="immich-picker"
>
	<div class="flex max-h-[85vh] flex-col gap-3 p-4">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold">{t('immich.picker.title', { name })}</h2>
			<Button variant="ghost" size="sm" onclick={() => dialog?.close()}>{t('common.close')}</Button>
		</div>

		<form {onsubmit} role="search" class="flex gap-2">
			<input
				type="search"
				bind:value={query}
				aria-label={t('immich.picker.search')}
				placeholder={t('immich.picker.search')}
				class={INPUT}
			/>
			<Button type="submit" size="sm" icon="search" disabled={searching}
				>{t('common.search')}</Button
			>
		</form>

		<FormError message={error} />
		{#if searching}
			<p class="text-xs text-fg-subtle" role="status">{t('immich.picker.searching')}</p>
		{/if}

		<div class="-mx-1 flex-1 overflow-y-auto px-1">
			{#if faces.length > 0}
				<p class="mb-2 text-sm text-fg-muted">{t('immich.picker.hint')}</p>
				<ul class="grid grid-cols-3 gap-3 sm:grid-cols-4" data-testid="immich-faces">
					{#each faces as face (face.id)}
						<li>
							{#if face.linkedTo}
								<div
									class="flex w-full flex-col items-center gap-1.5 p-1.5 text-center opacity-60"
									data-testid="immich-face-taken"
								>
									<img
										src={face.faceUrl}
										alt=""
										class="aspect-square w-full rounded-full bg-bg-sunken object-cover grayscale"
										loading="lazy"
									/>
									<span class="w-full truncate text-xs text-fg">{face.name}</span>
									<span class="w-full text-[0.6875rem] leading-tight text-fg-muted">
										{face.linkedTo.name === null
											? t('immich.picker.linkedElsewhere')
											: t('immich.picker.linkedTo', { name: face.linkedTo.name })}
									</span>
								</div>
							{:else}
								<form method="POST" action="?/linkImmich" onsubmit={linkInPlace}>
									<input type="hidden" name="immichPersonId" value={face.id} />
									<button
										type="submit"
										aria-label={t('immich.picker.link', { immichName: face.name, name })}
										class="flex w-full flex-col items-center gap-1.5 rounded-control p-1.5 text-center hover:bg-bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
									>
										<img
											src={face.faceUrl}
											alt=""
											class="aspect-square w-full rounded-full bg-bg-sunken object-cover"
											loading="lazy"
										/>
										<span class="w-full truncate text-xs text-fg">{face.name}</span>
									</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{:else if answered && !searching && !error}
				<p class="text-sm text-fg-subtle" data-testid="immich-no-faces">
					{t('immich.picker.none')}
				</p>
			{/if}
		</div>
	</div>
</dialog>
