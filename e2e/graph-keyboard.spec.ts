import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./app";
import { settled } from "./graph-canvas";
import { nextInDirection, type Direction } from "../src/lib/graph/keyboard";

/*
 * Walking the relationship map from the keyboard (docs/05 §5.8). Written after the owner
 * signed the change off in the running app (docs/08 §8.4.1).
 *
 * A canvas has no DOM to read, so every case reads what the page says aloud — the live line
 * that names who the keyboard is on, the peek panel, the path prompt — and, for which node
 * the cursor ring is on, the renderer's own class. Where the next step should land is asked
 * of the same pure rule the canvas uses (`nextInDirection`) over the positions the renderer
 * holds, so the spec checks the wiring, not a guess at the layout.
 *
 * Read-only against the demo household.
 */

const LENA = "demo-c-lena";
const ARROW: Record<Direction, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};
const DIRECTIONS: Direction[] = ["right", "down", "left", "up"];

interface ShownNode {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** Everyone the canvas shows, where it holds them — the same set the keyboard walks. */
async function shownNodes(page: Page): Promise<ShownNode[]> {
  return page.evaluate(() => {
    type Node = {
      id(): string;
      data(key: string): string;
      hasClass(name: string): boolean;
      position(): { x: number; y: number };
    };
    let el: HTMLElement | null = document.querySelector("canvas");
    while (el && !("_cyreg" in el)) el = el.parentElement;
    const cy = (el as unknown as { _cyreg: { cy: { nodes(): Node[] } } })._cyreg
      .cy;
    return cy
      .nodes()
      .filter((n) => !n.hasClass("filtered-out"))
      .map((n) => ({
        id: n.id(),
        label: n.data("label"),
        kind: n.data("kind"),
        ...n.position(),
      }));
  });
}

const positionsOf = (nodes: ShownNode[]) =>
  new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

/** The node the renderer has ringed as the keyboard's, or null. */
async function ringed(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    type Node = { id(): string; hasClass(name: string): boolean };
    let el: HTMLElement | null = document.querySelector("canvas");
    while (el && !("_cyreg" in el)) el = el.parentElement;
    const cy = (el as unknown as { _cyreg: { cy: { nodes(): Node[] } } })._cyreg
      .cy;
    return (
      cy
        .nodes()
        .find((n) => n.hasClass("cursor"))
        ?.id() ?? null
    );
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What the live line says for somebody: their name, the "+N" spelled out, and whether selected. */
const spoken = (label: string, selected = false) =>
  new RegExp(
    `^${escape(label)}(, \\d+ more to open up)?${selected ? ", selected" : ""}$`,
  );

/** The peek panel; the desktop sidebar is a complementary landmark too, so it is told by its link. */
const peekPanel = (page: Page) =>
  page
    .getByRole("complementary")
    .filter({ has: page.getByRole("link", { name: "Open profile" }) });

const canvasOf = (page: Page) =>
  page.getByRole("application", { name: "Relationship map" });
/** The line that names who the keyboard is on (the canvas itself has no text). */
const announcement = (page: Page) =>
  page.locator('[role="application"] ~ p[aria-live="polite"]');

/** Opens the explorer on Lena and waits until the layout has put everyone in place. */
async function openMap(page: Page): Promise<Locator> {
  await page.goto(`/graph?center=${LENA}`);
  await expect(page.locator("canvas").first()).toBeVisible();
  await settled(page);
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute("tabindex", "0");
  return canvas;
}

/**
 * Tabs onto the map from the control after it, the way a keyboard arrives, so the canvas sees
 * `:focus-visible` rather than a script's focus.
 */
async function tabOntoMap(page: Page, canvas: Locator): Promise<void> {
  await page.getByLabel("Find a person").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(canvas).toBeFocused();
}

/** Presses an arrow and checks the ring and the live line landed where the rule says. */
async function step(
  page: Page,
  nodes: ShownNode[],
  from: string,
  direction: Direction,
) {
  const to = nextInDirection(positionsOf(nodes), from, direction);
  if (!to) throw new Error(`nobody stands ${direction} of ${from}`);
  await page.keyboard.press(ARROW[direction]);
  const label = nodes.find((n) => n.id === to)!.label;
  await expect(announcement(page)).toHaveText(spoken(label));
  await expect.poll(() => ringed(page)).toBe(to);
  return to;
}

test("the map is one tab stop, and the keyboard arrives on the selected person", async ({
  page,
}) => {
  const canvas = await openMap(page);
  await tabOntoMap(page, canvas);

  // The explorer opens with the centre selected, so that is where the keyboard starts.
  await expect(announcement(page)).toHaveText(spoken("Lena Brunner", true));
  await expect.poll(() => ringed(page)).toBe(LENA);

  // One stop: the next Tab leaves the map for the toolbar, not for somebody on it.
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Find a person")).toBeFocused();
  // Leaving takes the ring away with the focus.
  await expect.poll(() => ringed(page)).toBeNull();
});

test("arrows step to the nearest person that way, Enter selects, Home goes back, Escape lets go", async ({
  page,
}) => {
  const canvas = await openMap(page);
  const nodes = await shownNodes(page);
  const positions = positionsOf(nodes);
  await tabOntoMap(page, canvas);
  await expect(announcement(page)).toHaveText(spoken("Lena Brunner", true));

  // Somebody next to Lena who is a person, so Enter on them opens their peek panel.
  const towards = DIRECTIONS.find((d) => {
    const to = nextInDirection(positions, LENA, d);
    return to !== null && nodes.find((n) => n.id === to)!.kind === "person";
  });
  if (!towards) throw new Error("nobody stands next to Lena on the map");
  const neighbour = await step(page, nodes, LENA, towards);
  const neighbourName = nodes.find((n) => n.id === neighbour)!.label;

  // Enter does what a click does: the neighbour is selected and their panel opens.
  await page.keyboard.press("Enter");
  await expect(announcement(page)).toHaveText(spoken(neighbourName, true));
  const peek = peekPanel(page);
  await expect(peek.getByText(neighbourName, { exact: true })).toBeVisible();

  // Step away, then Home brings the keyboard back to the selection — not to the centre.
  const away = DIRECTIONS.find(
    (d) => nextInDirection(positions, neighbour, d) !== null,
  )!;
  const elsewhere = await step(page, nodes, neighbour, away);
  expect(elsewhere).not.toBe(neighbour);
  await page.keyboard.press("Home");
  await expect(announcement(page)).toHaveText(spoken(neighbourName, true));
  await expect.poll(() => ringed(page)).toBe(neighbour);

  // Escape lets go of the selection: the keyboard stays on the neighbour, no longer
  // selected, and the panel closes.
  await page.keyboard.press("Escape");
  await expect(announcement(page)).toHaveText(spoken(neighbourName));
  await expect(peek).toHaveCount(0);

  // With nothing selected, Home returns to the centre.
  await page.keyboard.press("Home");
  await expect(announcement(page)).toHaveText(spoken("Lena Brunner"));
  await expect.poll(() => ringed(page)).toBe(LENA);
});

test("Space selects like Enter", async ({ page }) => {
  const canvas = await openMap(page);
  const nodes = await shownNodes(page);
  const positions = positionsOf(nodes);
  await tabOntoMap(page, canvas);

  const towards = DIRECTIONS.find((d) => {
    const to = nextInDirection(positions, LENA, d);
    return to !== null && nodes.find((n) => n.id === to)!.kind === "person";
  })!;
  const neighbour = await step(page, nodes, LENA, towards);
  const neighbourName = nodes.find((n) => n.id === neighbour)!.label;

  await page.keyboard.press("Space");
  await expect(announcement(page)).toHaveText(spoken(neighbourName, true));
  await expect(
    peekPanel(page).getByText(neighbourName, { exact: true }),
  ).toBeVisible();
});

test("an arrow with nobody further that way keeps the cursor and the page where they are", async ({
  page,
}) => {
  const canvas = await openMap(page);
  const nodes = await shownNodes(page);
  const positions = positionsOf(nodes);
  await tabOntoMap(page, canvas);

  // Every arrow press is recorded once the map has had its say, so "the browser did not
  // scroll" is read as a positive fact: the map claimed the key.
  await page.evaluate(() => {
    const log: { key: string; claimed: boolean }[] = [];
    (window as unknown as { arrowLog: typeof log }).arrowLog = log;
    window.addEventListener("keydown", (event) => {
      if (event.key.startsWith("Arrow"))
        log.push({ key: event.key, claimed: event.defaultPrevented });
    });
  });

  // Walk left until nobody stands further left; the walk is bounded by who is on the map.
  let at = LENA;
  for (
    let next = nextInDirection(positions, at, "left");
    next;
    next = nextInDirection(positions, at, "left")
  ) {
    at = await step(page, nodes, at, "left");
  }
  const edgeName = nodes.find((n) => n.id === at)!.label;
  const steps = await page.evaluate(
    () => (window as unknown as { arrowLog: unknown[] }).arrowLog.length,
  );

  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { arrowLog: unknown[] }).arrowLog.length,
      ),
    )
    .toBe(steps + 1);
  const last = await page.evaluate(() => {
    const log = (
      window as unknown as { arrowLog: { key: string; claimed: boolean }[] }
    ).arrowLog;
    return log[log.length - 1];
  });
  expect(last).toEqual({ key: "ArrowLeft", claimed: true });
  // And the cursor did not move off the person at the edge.
  expect(await ringed(page)).toBe(at);
  await expect(announcement(page)).toHaveText(spoken(edgeName, at === LENA));
});

test("the connection path is traced from the keyboard alone", async ({
  page,
}) => {
  const canvas = await openMap(page);
  const nodes = await shownNodes(page);
  const positions = positionsOf(nodes);

  // Into path mode from its button, by keyboard.
  const pathButton = page.getByRole("button", { name: "Connection path" });
  await pathButton.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(pathButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(pathButton).toHaveAttribute("aria-pressed", "true");
  const prompt = page.getByTestId("path-prompt");
  await expect(prompt).toHaveText(
    "Pick two people to trace how they’re connected.",
  );

  // Back onto the map. Path mode clears the selection, so the keyboard starts on the centre.
  await tabOntoMap(page, canvas);
  await expect(announcement(page)).toHaveText(spoken("Lena Brunner"));

  // Enter picks the first person; Escape takes that pick back before anything else.
  await page.keyboard.press("Enter");
  await expect(prompt).toHaveText("Now pick the second person…");
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveText(
    "Pick two people to trace how they’re connected.",
  );
  await expect(pathButton).toHaveAttribute("aria-pressed", "true");

  // Pick Lena, step to somebody next to her, pick them: the chain runs from one to the other.
  await page.keyboard.press("Enter");
  await expect(prompt).toHaveText("Now pick the second person…");
  const towards = DIRECTIONS.find((d) => {
    const to = nextInDirection(positions, LENA, d);
    return to !== null && nodes.find((n) => n.id === to)!.kind === "person";
  })!;
  const second = await step(page, nodes, LENA, towards);
  const secondName = nodes.find((n) => n.id === second)!.label;
  await page.keyboard.press("Enter");
  await expect(prompt).toHaveText(
    new RegExp(`^Lena Brunner → (.+ → )?${escape(secondName)}$`),
  );

  // Escape with no pick half-made leaves path mode.
  await page.keyboard.press("Escape");
  await expect(pathButton).toHaveAttribute("aria-pressed", "false");
  await expect(prompt).toHaveCount(0);
});
