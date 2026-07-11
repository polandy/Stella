<script lang="ts">
	// Authenticated home — a placeholder dashboard for M0. The real dashboard (panels,
	// drill-down) arrives in M2 (docs/02 §2.12).
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ThemeChoice = 'light' | 'dark' | 'system';
	let theme = $state<ThemeChoice>('system');

	function applyTheme(choice: ThemeChoice) {
		theme = choice;
		const root = document.documentElement;
		if (choice === 'system') {
			root.removeAttribute('data-theme');
			localStorage.removeItem('stella-theme');
		} else {
			root.setAttribute('data-theme', choice);
			localStorage.setItem('stella-theme', choice);
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
	<header class="flex items-center gap-4">
		<div
			class="grid size-12 place-items-center rounded-app bg-primary text-xl text-primary-fg shadow-lg"
		>
			★
		</div>
		<div>
			<h1 class="text-2xl font-semibold text-fg">Hello, {data.user.name}</h1>
			<p class="text-sm text-fg-muted">Welcome to Stella.</p>
		</div>
	</header>

	<div class="rounded-app border border-border bg-card p-6">
		<p class="text-fg-muted">
			Your household is set up. Contacts, relationships, and the explorer arrive with M1 —
			see <code>docs/06-roadmap.md</code>.
		</p>
	</div>

	<div class="flex items-center justify-between">
		<div class="flex gap-1 rounded-app border border-border bg-card p-1">
			{#each ['light', 'system', 'dark'] as const as choice (choice)}
				<button
					onclick={() => applyTheme(choice)}
					class="rounded-md px-3 py-1.5 text-sm capitalize transition-colors"
					class:bg-primary={theme === choice}
					class:text-primary-fg={theme === choice}
					class:text-fg-muted={theme !== choice}
				>
					{choice}
				</button>
			{/each}
		</div>

		<form method="POST" action="/logout">
			<button
				class="rounded-app border border-border px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
			>
				Sign out
			</button>
		</form>
	</div>
</main>
