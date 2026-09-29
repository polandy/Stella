<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { describeDistinction, type Distinction } from '$lib/people/namesakes';

	/*
	 * The second line under a person in a list where someone else shares their name (docs/02
	 * §2.2.3): the description, else where and when they were met, else a quiet admission that
	 * nothing tells them apart yet — which is itself the cue to add something.
	 */

	let { distinction }: { distinction: Distinction } = $props();

	const t = useTranslate();
</script>

<span data-testid="namesake-line" class="block truncate text-xs text-fg-subtle" class:italic={distinction.kind === 'nothing'}>{describeDistinction(t, distinction)}</span>
