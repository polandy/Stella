import {
	Upload,
	Archive,
	Blend,
	BookmarkPlus,
	BookOpen,
	Briefcase,
	CalendarDays,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	CircleDot,
	CloudOff,
	DownloadCloud,
	Download,
	Ellipsis,
	Expand,
	ExternalLink,
	Gift,
	Handshake,
	House,
	Image,
	KeyRound,
	Lightbulb,
	Link,
	ListFilter,
	Lock,
	LogOut,
	Maximize,
	Mail,
	MessageCircle,
	Minimize,
	Pencil,
	Phone,
	Plus,
	Route,
	Search,
	Settings,
	Shrink,
	SquarePen,
	Star,
	UserPlus,
	Users,
	UserRound,
	UserRoundPen,
	UsersRound,
	Video,
	Unlink,
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
	back: ChevronLeft,
	// Unfold a folded list and fold it again, e.g. a person's People card (docs/05 §5.5).
	expand: ChevronDown,
	collapse: ChevronUp,
	signOut: LogOut,
	// Actions
	add: Plus,
	// A person added to the household — the top bar's quiet *Add person* (docs/05 §5.4).
	addPerson: UserPlus,
	// The phone's Filter pill on Home (docs/05 §5.5).
	filter: ListFilter,
	write: SquarePen,
	// Change a name where it is read, e.g. a circle's role heading (docs/02 §2.4.2).
	rename: Pencil,
	journal: BookOpen,
	explore: Waypoints,
	// Two points and the way between them: "how are we connected?" (docs/02 §2.7). Its own
	// glyph, because it sits next to "Open in the graph" and two identical icons say nothing.
	connectionPath: Route,
	photo: Image,
	remove: X,
	// Graph canvas to the whole screen and back.
	enterFullscreen: Maximize,
	exitFullscreen: Minimize,
	// A phone's map preview grown inside its card and back (docs/05 §5.5) — not full screen.
	enlargeMap: Expand,
	shrinkMap: Shrink,
	// Keep the graph's Filter-menu state under a name (docs/02 §2.7).
	saveView: BookmarkPlus,
	more: Ellipsis,
	pinned: Star,
	archive: Archive,
	// People known by a first name only, to be tidied up (docs/02 §2.2.3)
	tidy: UserRoundPen,
	// A credential a script signs in with (docs/02 §2.16.1) — not `private`, which is about who sees a record.
	apiToken: KeyRound,
	// States
	private: Lock,
	// The network is gone, not the data (docs/02 §2.18).
	offline: CloudOff,
	// Adding Stella to a home screen (docs/02 §2.18) — not `import`, which is about data.
	install: DownloadCloud,
	// The member's own person (docs/02 §2.1.3).
	self: UserRound,
	// A step already taken, on the first-run card (docs/02 §2.22.3).
	done: Check,
	// What someone does and where (docs/02 §2.2).
	work: Briefcase,
	// Leaving Stella for another app — *Open in Immich* (docs/02 §2.24.3).
	openElsewhere: ExternalLink,
	// Undoing a link to another app's record, not deleting anything.
	unlink: Unlink,
	calendar: CalendarDays,
	shared: UsersRound,
	// A gift not given yet, and the shop page it may link to (docs/02 §2.25).
	idea: Lightbulb,
	link: Link,
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
