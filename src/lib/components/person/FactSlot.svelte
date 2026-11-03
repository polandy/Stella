<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Missing } from '$lib/people/identity-card';

	/** A fact the record does not hold yet, once the quiet button was pressed: a dashed slot. */
	let {
		label,
		icon,
		name,
		open,
		key
	}: { label: string; icon: IconName; name: Missing; open: () => void; key: string } = $props();

	const t = useTranslate();
</script>

<div
	class="relative flex min-w-0 flex-col gap-0.5 rounded-control border border-dashed border-border px-2 py-1.5 has-[button:hover]:bg-card-hover"
	data-fact={name}
	data-slot
>
	<dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
		<Icon name={icon} size={12} />{label}
	</dt>
	<dd class="text-sm text-fg-subtle">
		<button
			type="button"
			class="inline-flex items-center gap-1 after:absolute after:inset-0 after:rounded-control"
			aria-label={t('contact.identity.addThings', {
				things: t(`contact.identity.missing.${name}`)
			})}
			data-edit={key}
			onclick={open}
		>
			<Icon name="add" size={14} />{t('common.add')}
		</button>
	</dd>
</div>
