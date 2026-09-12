import {
	Upload,
	Archive,
	Blend,
	BookOpen,
	CalendarDays,
	ChevronRight,
	CircleDot,
	Download,
	Ellipsis,
	Gift,
	Handshake,
	House,
	Image,
	Lock,
	LogOut,
	Mail,
	MessageCircle,
	Moon,
	Phone,
	Plus,
	Search,
	Settings,
	SquarePen,
	Star,
	Users,
	UserRound,
	UsersRound,
	Video,
	Waypoints,
	X
} from '@lucide/svelte';

/*
 * The icon set (docs/05 §5.10): Lucide, self-hosted through `@lucide/svelte`, addressed by an
 * intention-revealing name rather than by glyph. Naming them for the job — `journal`, not
 * `book-open` — means swapping in a better icon for the same job is a one-line change here,
 * and it keeps emoji out of the interface, where they never matched the stroke weight of
 * anything around them.
 *
 * Add an entry when a screen needs an icon; there is no dynamic lookup, so an unused icon is
 * dropped by the bundler.
 */

/** Every icon the interface may render, keyed by what it means here. */
export const ICONS = {
	// Navigation
	home: House,
	people: Users,
	circles: Blend,
	graph: Waypoints,
	search: Search,
	settings: Settings,
	import: Download,
	export: Upload,
	forward: ChevronRight,
	signOut: LogOut,
	// Actions
	add: Plus,
	write: SquarePen,
	journal: BookOpen,
	explore: Waypoints,
	photo: Image,
	remove: X,
	more: Ellipsis,
	pinned: Star,
	archive: Archive,
	// States
	private: Lock,
	// The member's own person (docs/02 §2.1.3).
	self: UserRound,
	calendar: CalendarDays,
	quiet: Moon,
	shared: UsersRound,
	// Interaction kinds (docs/02 §2.6)
	met: Handshake,
	call: Phone,
	video: Video,
	message: MessageCircle,
	letter: Mail,
	gift: Gift,
	other: CircleDot
};

/** One of `ICONS`. */
export type IconName = keyof typeof ICONS;
