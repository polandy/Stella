<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { processImage } from '$lib/image/process-image';
	import { activeHandle, handleFor, insertHandle, suggest, type ActiveHandle } from '$lib/mentions/picker';
	import { tick } from 'svelte';

	/*
	 * The "What happened?" field (docs/02 §2.22.1). A plain textarea that posts natively; the
	 * @-picker, inline "Create …" queue and browser-side photo processing are enhancements.
	 */

	interface Candidate {
		id: string;
		displayName: string;
		firstName: string | null;
		lastName: string | null;
		visibility: 'shared' | 'private';
	}
	interface Props {
		/** People the author may see; the picker narrows to the moment's audience itself. */
		candidates: Candidate[];
		me: { id: string; name: string; avatarPhotoId?: string | null };
		today: string;
		error?: string | null;
		/** Body to restore after a failed submit. */
		draft?: string | null;
		autofocus?: boolean;
	}
	let { candidates, me, today, error = null, draft = null, autofocus = false }: Props = $props();

	// svelte-ignore state_referenced_locally -- the draft is only a starting value on purpose
	let body = $state(draft ?? '');
	let visibility = $state<'shared' | 'private'>('shared');
	let newPeople = $state<string[]>([]);
	let picked = $state<File[]>([]);
	let saving = $state(false);
	let localError = $state<string | null>(null);
	let textarea: HTMLTextAreaElement | undefined = $state();

	// Picker state: the handle under the caret and the ranked suggestions for it.
	let active = $state<ActiveHandle | null>(null);
	let selected = $state(0);
	const audience = $derived(
		visibility === 'shared' ? candidates.filter((c) => c.visibility === 'shared') : candidates
	);
	const known = $derived([
		...audience,
		...newPeople.map((n) => ({ id: `new:${n}`, displayName: n, firstName: null, lastName: null }))
	]);
	const suggestions = $derived(active ? suggest(active.query, known) : { people: [], create: null });
	const rows = $derived([
		...suggestions.people.map((p) => ({ kind: 'person' as const, person: p })),
		...(suggestions.create ? [{ kind: 'create' as const, name: suggestions.create }] : [])
	]);

	// The people the text currently references, for the "goes to …'s journal" line.
	const referenced = $derived.by(() => {
		const handles = body.match(/(?<![\p{L}\p{N}@\\])@[\p{L}][\p{L}\p{N}]*/gu) ?? [];
		const byHandle = new Map(known.map((c) => [handleFor(c).toLowerCase(), c]));
		const out: { id: string; displayName: string }[] = [];
		for (const h of handles) {
			const c = byHandle.get(h.toLowerCase());
			if (c && !out.some((o) => o.id === c.id)) out.push(c);
		}
		return out;
	});
	const canSave = $derived(body.trim().length > 0 && referenced.length > 0 && !saving);

	function refreshPicker() {
		if (!textarea) return;
		active = activeHandle(body, textarea.selectionStart);
		selected = 0;
	}

	async function choose(index: number) {
		const row = rows[index];
		if (!row || !active || !textarea) return;
		let handle: string;
		if (row.kind === 'create') {
			if (!newPeople.includes(row.name)) newPeople = [...newPeople, row.name];
			handle = '@' + row.name;
		} else {
			handle = handleFor(row.person);
		}
		const r = insertHandle(body, active, textarea.selectionStart, handle);
		body = r.text;
		active = null;
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	function onKeydown(event: KeyboardEvent) {
		if (active && rows.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				selected = (selected + 1) % rows.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				selected = (selected - 1 + rows.length) % rows.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				void choose(selected);
				return;
			}
			if (event.key === 'Escape') {
				active = null;
				return;
			}
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSave) {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}

	function onFiles(event: Event) {
		picked = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
	}

	// With photos, process them client-side and post via fetch; otherwise the form posts natively.
	async function onSubmit(event: SubmitEvent) {
		if (picked.length === 0) return;
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		saving = true;
		localError = null;
		try {
			const data = new FormData(formEl);
			for (const file of picked) {
				const { image, thumb, width, height } = await processImage(file);
				data.append('image', image, 'photo.jpg');
				data.append('thumb', thumb, 'thumb.jpg');
				data.append('width', String(width));
				data.append('height', String(height));
			}
			const res = await fetch('/?/capture', { method: 'POST', body: data, redirect: 'follow' });
			if (!res.ok) throw new Error();
			body = '';
			picked = [];
			newPeople = [];
			formEl.reset();
			await invalidateAll();
		} catch {
			localError = 'Could not save. Try standard JPEG or PNG images.';
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (autofocus) textarea?.focus();
	});
</script>

<form
	method="POST"
	action="/?/capture"
	enctype="multipart/form-data"
	onsubmit={onSubmit}
	class="relative flex flex-col rounded-app bg-card shadow-card transition-shadow focus-within:ring-2 focus-within:ring-primary/40"
>
	{#if error || localError}
		<p class="mx-3 mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error ?? localError}</p>
	{/if}
	<div class="flex items-start gap-3 p-3 pb-2">
		<Avatar id={me.id} name={me.name} avatarPhotoId={me.avatarPhotoId ?? null} size={40} />
		<textarea
			bind:this={textarea}
			bind:value={body}
			name="body"
			rows="2"
			required
			data-moment-body
			placeholder="Met someone? Type it here, mention people with @"
			aria-label="What happened?"
			aria-autocomplete="list"
			onkeydown={onKeydown}
			oninput={refreshPicker}
			onclick={refreshPicker}
			onkeyup={(e) => (e.key.startsWith('Arrow') ? refreshPicker() : undefined)}
			onblur={() => setTimeout(() => (active = null), 120)}
			class="min-h-14 flex-1 resize-y bg-transparent font-serif text-[17px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
		></textarea>
	</div>

	{#if active && rows.length > 0}
		<ul
			role="listbox"
			class="absolute left-14 top-16 z-10 w-[min(320px,calc(100%-4rem))] rounded-app border border-border bg-card p-1 shadow-pop"
		>
			<li class="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">People</li>
			{#each rows as row, i (row.kind === 'person' ? row.person.id : 'create')}
				<li>
					<button
						type="button"
						role="option"
						aria-selected={i === selected}
						onmousedown={(e) => {
							e.preventDefault();
							void choose(i);
						}}
						onmouseenter={() => (selected = i)}
						class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
					>
						{#if row.kind === 'person'}
							<Avatar id={row.person.id} name={row.person.displayName} size={22} />
							<span class="truncate">{row.person.displayName}</span>
							{#if row.person.id.startsWith('new:')}<span class="ml-auto text-xs text-fg-subtle">just created</span>{/if}
						{:else}
							<span class="grid size-[22px] place-items-center rounded-full border border-dashed border-success text-success">+</span>
							<span class="font-semibold text-success">Create “{row.name}”</span>
							<span class="ml-auto text-xs text-fg-subtle">new person</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#each newPeople as name (name)}
		<input type="hidden" name="newPeople" value={name} />
	{/each}

	<div class="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">
		<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted has-checked:border-transparent has-checked:bg-primary-soft has-checked:font-semibold has-checked:text-primary">
			<input type="checkbox" class="sr-only" checked={visibility === 'shared'} onchange={(e) => (visibility = (e.currentTarget as HTMLInputElement).checked ? 'shared' : 'private')} />
			<Icon name={visibility === 'shared' ? 'shared' : 'private'} size={13} />
			{visibility === 'shared' ? 'Shared' : 'Private'}
		</label>
		<input type="hidden" name="visibility" value={visibility} />
		<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg">
			<Icon name="photo" size={13} />
			{picked.length ? `${picked.length} photo${picked.length > 1 ? 's' : ''}` : 'Photo'}
			<input type="file" accept="image/*" multiple onchange={onFiles} class="hidden" />
		</label>
		<label class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted">
			<input type="date" name="entryDate" value={today} max={today} required class="bg-transparent text-fg-muted" aria-label="Day" />
		</label>
		<span class="text-xs text-fg-subtle" aria-live="polite">
			{#if referenced.length}
				Goes to <b class="font-semibold text-fg-muted">{referenced[0].displayName}</b>’s journal{referenced.length > 1 ? `, mentions ${referenced.length - 1}` : ''}
			{:else if body.trim()}
				Mention at least one person with @
			{/if}
		</span>
		<Button variant="primary" disabled={!canSave} class="ml-auto">
			{saving ? 'Saving…' : 'Save'}
			<kbd class="rounded border border-primary-fg/40 px-1 text-[10px] font-medium opacity-75">⌘⏎</kbd>
		</Button>
	</div>
</form>
