<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { activeHandle, handleFor, insertHandle, suggest, type ActiveHandle } from '$lib/mentions/picker';
	import { tick } from 'svelte';

	/*
	 * A textarea that offers people while you type `@` (docs/02 §2.20.1). The picker is an
	 * enhancement over a plain field: the form posts the text either way, and the server resolves
	 * whatever handles it finds. Unlike the moment composer it cannot create a person on the fly —
	 * a note or a journal entry is written about people who already exist.
	 */

	interface Candidate {
		id: string;
		displayName: string;
		firstName: string | null;
		lastName: string | null;
		visibility: 'shared' | 'private';
	}
	interface Props {
		/** Everyone the author may see; the picker narrows to the audience below. */
		candidates: Candidate[];
		/** Audience of the text being written: a shared one may only name shared people. */
		visibility?: 'shared' | 'private';
		name: string;
		value?: string;
		rows?: number;
		required?: boolean;
		placeholder?: string;
		label: string;
		class?: string;
	}
	let {
		candidates,
		visibility = 'shared',
		name,
		value = $bindable(''),
		rows = 3,
		required = false,
		placeholder,
		label,
		class: className = ''
	}: Props = $props();

	let textarea: HTMLTextAreaElement | undefined = $state();
	let active = $state<ActiveHandle | null>(null);
	let selected = $state(0);

	const audience = $derived(
		visibility === 'shared' ? candidates.filter((c) => c.visibility === 'shared') : candidates
	);
	const people = $derived(active ? suggest(active.query, audience).people : []);

	function refreshPicker() {
		if (!textarea) return;
		active = activeHandle(value, textarea.selectionStart);
		selected = 0;
	}

	async function choose(index: number) {
		const person = people[index];
		if (!person || !active || !textarea) return;
		const r = insertHandle(value, active, textarea.selectionStart, handleFor(person));
		value = r.text;
		active = null;
		await tick();
		textarea.focus();
		textarea.setSelectionRange(r.caret, r.caret);
	}

	function onKeydown(event: KeyboardEvent) {
		if (!active || people.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = (selected + 1) % people.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = (selected - 1 + people.length) % people.length;
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			void choose(selected);
		} else if (event.key === 'Escape') {
			active = null;
		}
	}
</script>

<div class="relative">
	<textarea
		bind:this={textarea}
		bind:value
		{name}
		{rows}
		{required}
		{placeholder}
		aria-label={label}
		aria-autocomplete="list"
		onkeydown={onKeydown}
		oninput={refreshPicker}
		onclick={refreshPicker}
		onkeyup={(e) => (e.key.startsWith('Arrow') ? refreshPicker() : undefined)}
		onblur={() => setTimeout(() => (active = null), 120)}
		class={className}
	></textarea>

	{#if active && people.length > 0}
		<ul
			role="listbox"
			aria-label="People"
			data-testid="mention-picker"
			class="absolute left-2 top-full z-10 -mt-1 w-[min(320px,calc(100%-1rem))] rounded-app border border-border bg-card p-1 shadow-pop"
		>
			{#each people as person, i (person.id)}
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
						<Avatar id={person.id} name={person.displayName} size={22} />
						<span class="truncate">{person.displayName}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
