<script lang="ts">
	/*
	 * A picture of a person's map (docs/05 §5.5): the viewed contact at the centre, their
	 * directly connected people around them. Pure presentation over the relationships the page
	 * already loaded — no graph engine, no extra fetch — and drawn by the server, so the People
	 * card shows the shape at once and keeps it where the engine never arrives. It is a picture
	 * rather than the map: no links, hidden from a screen reader (the list beside it names and
	 * links everybody), one button as a whole in the card. Category accents follow docs/05 §5.6.
	 *
	 * Two shapes, both drawn at their own size, so a narrow card crops their ends rather than
	 * shrinking the names. `ring` is the phone's 9.5 rem preview: a ring with every first name,
	 * the people past its last place folded into a "+N" disc (`namedRing`). `strip` is a wide
	 * card's 7.5 rem strip: a sideways fan with every first name (`stripFan`).
	 */
	import { categoryDiscFill, categoryVar } from '$lib/design/tokens';
	import { namedRing } from '$lib/graph/layout/named-ring';
	import { stripFan } from '$lib/graph/layout/strip-fan';
	import { thumbnailUrl } from '$lib/media/urls';
	import {
		RELATIONSHIP_CATEGORIES,
		type RelationshipCategory
	} from '$lib/relationships/categories';

	interface EgoNode {
		id: string;
		name: string;
		/** What the picture writes beside the face: the first name. */
		firstName: string;
		category: string;
		/** A face where there is one, so this reads like the interactive map it precedes. */
		avatarPhotoId?: string | null;
		/** Joined to the centre by former links alone, so its line is dashed, as on the map. */
		former?: boolean;
	}
	let {
		centerName,
		centerPhotoId = null,
		nodes,
		variant
	}: {
		centerName: string;
		centerPhotoId?: string | null;
		nodes: EgoNode[];
		variant: 'ring' | 'strip';
	} = $props();

	// Clip ids are document-wide, and a page holds the ring and the strip at once.
	const uid = $props.id();

	const categoryOf = (category: string): RelationshipCategory =>
		(RELATIONSHIP_CATEGORIES as readonly string[]).includes(category)
			? (category as RelationshipCategory)
			: 'other';

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.map((w) => w[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	// The strip's faces are small enough for two rows in 7.5 rem.
	const STRIP_CENTER_R = 16;
	const STRIP_NODE_R = 11;

	const layout = $derived.by(() => {
		if (variant === 'strip') {
			const fan = stripFan(nodes.length);
			return {
				width: fan.width,
				height: fan.height,
				center: { ...fan.center, r: STRIP_CENTER_R },
				nodeR: STRIP_NODE_R,
				places: fan.nodes,
				more: null,
				labelWidth: fan.labelWidth
			};
		}
		const ring = namedRing(nodes.length);
		return {
			width: ring.width,
			height: ring.height,
			center: { ...ring.center, r: ring.centerR },
			nodeR: ring.nodeR,
			places: ring.nodes,
			more: ring.more,
			labelWidth: ring.labelWidth
		};
	});
	// The ring may show fewer people than there are; the rest are its "+N".
	const placed = $derived(
		nodes.slice(0, layout.places.length).map((n, i) => ({
			...n,
			...layout.places[i],
			color: categoryVar(categoryOf(n.category)),
			disc: categoryDiscFill(categoryOf(n.category))
		}))
	);
	const c = $derived(layout.center);
	const r = $derived(layout.nodeR);
</script>

<svg
	class="ego shape-{variant}"
	viewBox="0 0 {layout.width} {layout.height}"
	width={layout.width}
	height={layout.height}
	preserveAspectRatio="xMidYMid meet"
	aria-hidden="true"
>
	<!--
		One clip per disc: an SVG image is a rectangle until something rounds it, and the
		interactive map draws the same faces as circles (docs/05 §5.8).
	-->
	<defs>
		<clipPath id="{uid}-center"><circle cx={c.x} cy={c.y} r={c.r} /></clipPath>
		{#each placed as n (n.id)}
			<clipPath id="{uid}-{n.id}"><circle cx={n.x} cy={n.y} {r} /></clipPath>
		{/each}
	</defs>

	<!-- edges first so nodes sit on top -->
	{#each placed as n (n.id)}
		<line
			x1={c.x}
			y1={c.y}
			x2={n.x}
			y2={n.y}
			stroke="var(--border)"
			stroke-width={n.former ? 1.2 : 2}
			stroke-dasharray={n.former ? '6 3' : undefined}
		/>
	{/each}

	<circle cx={c.x} cy={c.y} r={c.r} fill="var(--primary)" />
	{#if centerPhotoId}
		<image
			href={thumbnailUrl(centerPhotoId)}
			x={c.x - c.r}
			y={c.y - c.r}
			width={c.r * 2}
			height={c.r * 2}
			preserveAspectRatio="xMidYMid slice"
			clip-path="url(#{uid}-center)"
		/>
	{:else}
		<text
			x={c.x}
			y={c.y}
			dy="0.35em"
			text-anchor="middle"
			fill="var(--primary-fg)"
			font-weight="700"
			font-size="12"
		>
			{initials(centerName)}
		</text>
	{/if}

	{#each placed as n (n.id)}
		<circle cx={n.x} cy={n.y} {r} fill={n.disc} stroke={n.color} stroke-width="2" />
		{#if n.avatarPhotoId}
			<image
				href={thumbnailUrl(n.avatarPhotoId)}
				x={n.x - r}
				y={n.y - r}
				width={r * 2}
				height={r * 2}
				preserveAspectRatio="xMidYMid slice"
				clip-path="url(#{uid}-{n.id})"
			/>
		{/if}
		<!-- A long first name is squeezed into its slot rather than run into the next one. -->
		<text
			x={n.x}
			y={n.labelY}
			text-anchor="middle"
			fill="var(--fg-muted)"
			class="who"
			textLength={n.firstName.length * 6.5 > layout.labelWidth - 8
				? layout.labelWidth - 8
				: undefined}
			lengthAdjust="spacingAndGlyphs">{n.firstName}</text
		>
	{/each}
	{#if layout.more}
		{@const more = layout.more}
		<circle
			cx={more.x}
			cy={more.y}
			{r}
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="2"
		/>
		<text x={more.x} y={more.y} dy="0.35em" text-anchor="middle" fill="var(--fg-muted)" class="more"
			>+{more.count}</text
		>
	{/if}
</svg>

<style>
	/* Both keep their own size, centred in their box, which crops what does not fit.
	   (`shape-`, never the bare `ring`: that is a Tailwind utility.) */
	.ego {
		display: block;
		position: absolute;
		top: 0;
		left: 50%;
		translate: -50% 0;
		max-width: none;
	}
	.who {
		font-size: 11px;
		font-weight: 500;
	}
	.more {
		font-size: 10px;
		font-weight: 600;
	}
	text {
		pointer-events: none;
	}
</style>
