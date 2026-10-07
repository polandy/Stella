import { describe, expect, it } from 'bun:test';
import {
	WELCOME_EXIT,
	WELCOME_FLAG,
	WELCOME_SEQUENCE,
	WELCOME_STILL_MS,
	dockMove,
	shouldWelcome,
	type Box
} from './welcome';

/*
 * `src/app.html` carries the welcome as its own inline copy — it has to play before the app's
 * JavaScript arrives, so it cannot import `welcome.ts` or `Logo.svelte`. These tests read that
 * copy as text and hold it to them: the same mark, the same timings, the same two decisions.
 * The inline scripts are run against a stand-in document, so it is their behaviour that is
 * compared, not their spelling.
 */

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();
const appHtml = await read('../../app.html');
const logoSvelte = await read('../components/Logo.svelte');
const logoSvg = await read('../../../static/logo.svg');

const overlayMarkup = /<div id="stella-welcome"[\s\S]*?<\/svg>[\s\S]*?<\/div>/.exec(appHtml)?.[0];
const overlayStyle = /<style>([\s\S]*?)<\/style>/.exec(appHtml)?.[1] ?? '';
const scripts = [...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const headScript = scripts.find((s) => s.includes('stella-theme')) ?? '';
const overlayScript = scripts.find((s) => s.includes('welcome-cue')) ?? '';

interface Circle {
	cx: string;
	cy: string;
	r: string;
	fill: string | undefined;
	cls: string | undefined;
}

function circles(svg: string): Circle[] {
	return [...svg.matchAll(/<circle([^>]*)\/>/g)].map(([, attrs]) => {
		const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
		return {
			cx: attr('cx')!,
			cy: attr('cy')!,
			r: attr('r')!,
			fill: attr('fill'),
			cls: attr('class')
		};
	});
}
const paths = (svg: string) => [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
const geometry = (list: Circle[]) => list.map(({ cx, cy, r }) => `${cx},${cy},${r}`);

describe('the welcome mark in app.html', () => {
	it('is there', () => {
		expect(overlayMarkup).toBeDefined();
	});

	const markup = overlayMarkup ?? '';
	const nodes = circles(markup).filter((c) => c.cls !== 'halo');

	it('draws the same threads as Logo.svelte and static/logo.svg', () => {
		expect(paths(markup)).toEqual(paths(logoSvelte));
		expect(paths(markup)).toEqual(paths(logoSvg));
	});

	it('places the same nodes, in the same colours, as Logo.svelte', () => {
		expect(geometry(nodes)).toEqual(geometry(circles(logoSvelte)));
		expect(geometry(nodes)).toEqual(geometry(circles(logoSvg)));
		expect(nodes.map((c) => c.fill)).toEqual(circles(logoSvelte).map((c) => c.fill));
	});

	it('names each node by its colour, so the timings below land on the right one', () => {
		for (const node of nodes) expect(node.fill).toBe(`var(--accent-${node.cls?.slice(2)})`);
	});

	it('ripples its halo from the centre node', () => {
		const halo = circles(markup).find((c) => c.cls === 'halo');
		const centre = nodes.find((c) => c.cls === 'n-pink');
		expect(halo && `${halo.cx},${halo.cy},${halo.r}`).toBe(
			centre && `${centre.cx},${centre.cy},${centre.r}`
		);
	});

	it('draws the mauve thread from its pink end, the others from the centre outwards', () => {
		expect(markup).toMatch(/class="thread t-mauve back" pathLength="1" d="M18,62 Q30,60 42,50"/);
		expect(markup).toMatch(/class="thread t-blue" pathLength="1" d="M42,50/);
		expect(markup).toMatch(/class="thread t-yellow" pathLength="1" d="M42,50/);
		expect(markup).toMatch(/class="thread t-peach" pathLength="1" d="M66,60/);
	});

	it('is decorative', () => {
		expect(markup).toContain('aria-hidden="true"');
	});

	it('takes every colour from a semantic token, never a hex value', () => {
		expect(markup + overlayStyle).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(markup + overlayStyle).not.toContain('--ctp-');
	});
});

describe('the welcome timings in app.html', () => {
	function animation(selector: string): string | undefined {
		const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return new RegExp(`${escaped}\\s*\\{[^}]*?animation:\\s*([^;]+);`).exec(overlayStyle)?.[1];
	}

	for (const [part, { delayMs, durationMs }] of Object.entries(WELCOME_SEQUENCE)) {
		// A node pops with its own overshoot; everything else moves on the standard easing.
		const easing = part.startsWith('n-') ? '--welcome-overshoot' : '--ease-standard';
		it(`plays ${part} for ${durationMs} ms from ${delayMs} ms`, () => {
			expect(animation(`#stella-welcome .${part}`)).toMatch(
				new RegExp(`^welcome-[\\w-]+ ${durationMs}ms var\\(${easing}\\) ${delayMs}ms both$`)
			);
		});
	}

	it('cues the exit at the moment the sequence says', () => {
		expect(animation('#stella-welcome')).toBe(
			`welcome-cue 0s linear ${WELCOME_EXIT.startMs}ms both`
		);
	});

	it('docks the mark, fades the wordmark and the backdrop for as long as the sequence says', () => {
		expect(animation('#stella-welcome.dock svg')).toMatch(
			new RegExp(`^welcome-dock ${WELCOME_EXIT.dockMs}ms var\\(--ease-standard\\) forwards$`)
		);
		expect(animation('#stella-welcome.dock .word')).toMatch(
			new RegExp(`^welcome-out ${WELCOME_EXIT.wordOutMs}ms var\\(--ease-standard\\) forwards$`)
		);
		expect(animation('#stella-welcome.dock')).toMatch(
			new RegExp(
				`^welcome-backdrop ${WELCOME_EXIT.backdropMs}ms var\\(--ease-standard\\) forwards$`
			)
		);
	});

	it('fades in place for as long as the sequence says', () => {
		expect(animation('#stella-welcome.fade')).toBe(
			`welcome-fade ${WELCOME_EXIT.fadeMs}ms var(--ease-standard) forwards`
		);
	});

	it('holds the still mark for as long as the sequence says, and moves nothing', () => {
		expect(animation("[data-welcome='still'] #stella-welcome")).toBe(
			`welcome-cut 0s linear ${WELCOME_STILL_MS}ms both`
		);
		expect(animation("[data-welcome='still'] #stella-welcome *")).toBe('none');
	});
});

/** Runs the head script in a stand-in page and says what it decided. */
function startPage(flag: string | null, reducedMotion: boolean, theme: string | null = null) {
	const attributes = new Map<string, string>();
	const session = new Map<string, string>(flag === null ? [] : [[WELCOME_FLAG, flag]]);
	const document = {
		documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) }
	};
	const localStorage = { getItem: (key: string) => (key === 'stella-theme' ? theme : null) };
	const sessionStorage = {
		getItem: (key: string) => session.get(key) ?? null,
		setItem: (key: string, value: string) => session.set(key, value)
	};
	const matchMedia = (query: string) => ({
		matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion
	});
	new Function('document', 'localStorage', 'sessionStorage', 'matchMedia', headScript)(
		document,
		localStorage,
		sessionStorage,
		matchMedia
	);
	return { attributes, flag: session.get(WELCOME_FLAG) ?? null };
}

describe('the head script', () => {
	for (const flag of [null, '1']) {
		for (const reduced of [false, true]) {
			const expected = shouldWelcome(flag, reduced);
			it(`decides ${expected} for flag ${flag} and reduced motion ${reduced}, as shouldWelcome does`, () => {
				const page = startPage(flag, reduced);
				expect(page.attributes.get('data-welcome') ?? 'skip').toBe(expected);
				expect(page.flag).not.toBeNull();
			});
		}
	}

	it('still applies the stored theme', () => {
		expect(startPage(null, false, 'dark').attributes.get('data-theme')).toBe('dark');
	});
});

type Listener = (event: { animationName?: string }) => void;

/** Runs the overlay script in a stand-in page, with the mark and the page's logos at these boxes. */
function overlayPage(mode: string | null, mark: Box, logos: Box[]) {
	const viewport = { width: 400, height: 800 };
	const rect = (box: Box) => () => ({
		...box,
		right: box.left + box.width,
		bottom: box.top + box.height
	});
	const attributes = new Map<string, string>(mode ? [['data-welcome', mode]] : []);
	const overlayListeners = new Map<string, Listener>();
	const windowListeners = new Map<string, Listener>();
	const state = {
		removed: false,
		classes: new Set<string>(),
		properties: new Map<string, string>()
	};
	const overlay = {
		remove: () => (state.removed = true),
		classList: { add: (name: string) => state.classes.add(name) },
		style: { setProperty: (name: string, value: string) => state.properties.set(name, value) },
		addEventListener: (type: string, listener: Listener) => overlayListeners.set(type, listener),
		querySelector: () => ({ getBoundingClientRect: rect(mark) })
	};
	const document = {
		documentElement: {
			hasAttribute: (name: string) => attributes.has(name),
			getAttribute: (name: string) => attributes.get(name) ?? null,
			removeAttribute: (name: string) => attributes.delete(name),
			clientWidth: viewport.width,
			clientHeight: viewport.height
		},
		getElementById: (id: string) => (id === 'stella-welcome' ? overlay : null),
		querySelectorAll: () => logos.map((box) => ({ getBoundingClientRect: rect(box) }))
	};
	const window = {
		addEventListener: (type: string, listener: Listener) => windowListeners.set(type, listener),
		removeEventListener: (type: string) => windowListeners.delete(type)
	};
	new Function('window', 'document', overlayScript)(window, document);
	return {
		state,
		attributes,
		windowListeners,
		animationEnd: (animationName: string) =>
			overlayListeners.get('animationend')?.({ animationName }),
		expected: dockMove(mark, logos, viewport)
	};
}

describe('the overlay script', () => {
	const mark = { left: 152, top: 352, width: 96, height: 96 };
	const sidebarHidden = { left: 0, top: 0, width: 0, height: 0 };
	const topBarLogo = { left: 16, top: 12, width: 26, height: 26 };

	it('removes the overlay at once when the session was welcomed already', () => {
		expect(overlayPage(null, mark, [topBarLogo]).state.removed).toBe(true);
	});

	it('docks onto the first visible logo with the move dockMove gives', () => {
		const page = overlayPage('animate', mark, [sidebarHidden, topBarLogo]);
		expect(page.state.removed).toBe(false);
		page.animationEnd('welcome-cue');
		expect([...page.state.classes]).toEqual(['dock']);
		expect(page.expected).not.toBeNull();
		expect(page.state.properties.get('--dx')).toBe(`${page.expected?.dx}px`);
		expect(page.state.properties.get('--dy')).toBe(`${page.expected?.dy}px`);
		expect(page.state.properties.get('--k')).toBe(`${page.expected?.scale}`);
	});

	it('fades in place where dockMove finds no logo', () => {
		const page = overlayPage('animate', mark, [sidebarHidden]);
		page.animationEnd('welcome-cue');
		expect([...page.state.classes]).toEqual(['fade']);
	});

	it('goes, and shows the logo again, when the mark lands', () => {
		const page = overlayPage('animate', mark, [topBarLogo]);
		page.animationEnd('welcome-cue');
		page.animationEnd('welcome-pop');
		expect(page.state.removed).toBe(false);
		page.animationEnd('welcome-dock');
		expect(page.state.removed).toBe(true);
		expect(page.attributes.has('data-welcome')).toBe(false);
		expect(page.windowListeners.size).toBe(0);
	});

	it('goes when the fade in place or the still mark is over', () => {
		for (const name of ['welcome-fade', 'welcome-cut']) {
			const page = overlayPage('animate', mark, []);
			page.animationEnd(name);
			expect(page.state.removed).toBe(true);
		}
	});

	it('goes at once on a tap or a key press', () => {
		for (const type of ['pointerdown', 'keydown']) {
			const page = overlayPage('animate', mark, [topBarLogo]);
			page.windowListeners.get(type)?.({});
			expect(page.state.removed).toBe(true);
			expect(page.attributes.has('data-welcome')).toBe(false);
		}
	});
});

describe('the logos it docks into', () => {
	it('are marked on Logo.svelte, by a prop the shell sets', () => {
		expect(logoSvelte).toMatch(/data-welcome-target=\{welcomeTarget \? '' : undefined\}/);
	});

	it('are the sidebar, the phone top bar and the sign-in layout', async () => {
		const app = await read('../../routes/(app)/+layout.svelte');
		const auth = await read('../../routes/(auth)/+layout.svelte');
		expect(app.match(/<Logo [^>]*\bwelcomeTarget\b/g)?.length).toBe(2);
		expect(auth.match(/<Logo [^>]*\bwelcomeTarget\b/g)?.length).toBe(1);
	});

	it('are hidden while the welcome runs, so the mark can land on an empty spot', () => {
		expect(overlayStyle).toMatch(
			/\[data-welcome\] \[data-welcome-target\]\s*\{\s*visibility: hidden;/
		);
	});
});
