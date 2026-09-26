import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./app";
import { clickNode, filterMenu, settled, stateOf } from "./graph-canvas";

/*
 * Grouping a circle's members by role on the map (docs/02 §2.7, docs/05 §5.8). Written after
 * the maintainer tried it in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household: it centres Lena and opens her Turnverein, whose two
 * "Aktive" — Sandra and Franziska, friends with each other — are the only role held twice.
 * Lena (Kinderriege) and Beat (Leiter) hold theirs alone and stay ordinary nodes.
 */

const LENA = "demo-c-lena";
const TURNVEREIN = "demo-circle-turnverein";
const SANDRA = "demo-c-sandra";
const FRANZISKA = "demo-c-franziska";
const BEAT = "demo-c-beat";
const AKTIVE = `rolegroup:${TURNVEREIN}:=Aktive`;

/** What the renderer holds about the grouping right now, read off the running core. */
async function groupingOnCanvas(page: Page) {
  return page.evaluate(
    ({ group, circle, a, b }) => {
      type Collection = {
        empty(): boolean;
        length: number;
        hasClass(name: string): boolean;
        style(name: string): string;
        data(key: string): string;
        parent(): Collection;
        id(): string;
        filter(fn: (e: Collection) => boolean): Collection;
      };
      let el: HTMLElement | null = document.querySelector("canvas");
      while (el && !("_cyreg" in el)) el = el.parentElement;
      const cy = (
        el as unknown as {
          _cyreg: { cy: { $id(id: string): Collection; edges(): Collection } };
        }
      )._cyreg.cy;
      const parentOf = (id: string) => {
        const parent = cy.$id(id).parent();
        return parent.empty() ? null : parent.id();
      };
      const between = (x: string, y: string) =>
        cy
          .edges()
          .filter(
            (e) =>
              (e.data("source") === x && e.data("target") === y) ||
              (e.data("source") === y && e.data("target") === x),
          );
      const shown = (edges: Collection) =>
        edges.filter((e) => e.style("display") !== "none").length;
      return {
        frame: !cy.$id(group).empty(),
        parents: { a: parentOf(a), b: parentOf(b) },
        /** Lines from the circle to the group, and to each member, that are actually drawn. */
        circleToGroup: shown(between(circle, group)),
        circleToMembers: shown(between(circle, a)) + shown(between(circle, b)),
        /** The friendship between the two members, drawn or tucked away. */
        inner: shown(between(a, b)),
      };
    },
    { group: AKTIVE, circle: TURNVEREIN, a: SANDRA, b: FRANZISKA },
  );
}

/**
 * Taps a group's frame where the frame itself is on top: its centre is where a member stands,
 * and the lines to and between the members cross it, so the spot is asked of the renderer's
 * own hit test rather than guessed — where they fall depends on the layout.
 */
async function clickFrame(page: Page, id: string) {
  const at = await page.evaluate((frameId) => {
    type Box = { x1: number; y1: number; x2: number; y2: number };
    type Core = {
      $id(id: string): { renderedBoundingBox(o: object): Box };
      pan(): { x: number; y: number };
      zoom(): number;
      renderer(): {
        findNearestElement(
          x: number,
          y: number,
          interactive: boolean,
          touch: boolean,
        ): { id(): string } | undefined;
      };
    };
    let el: HTMLElement | null = document.querySelector("canvas");
    while (el && !("_cyreg" in el)) el = el.parentElement;
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    const box = el!.getBoundingClientRect();
    const bb = cy.$id(frameId).renderedBoundingBox({ includeLabels: false });
    const [pan, zoom] = [cy.pan(), cy.zoom()];
    const STEPS = 12;
    for (let i = 1; i < STEPS; i++) {
      for (let j = 1; j < STEPS; j++) {
        const x = bb.x1 + ((bb.x2 - bb.x1) * i) / STEPS;
        const y = bb.y1 + ((bb.y2 - bb.y1) * j) / STEPS;
        const hit = cy
          .renderer()
          .findNearestElement(
            (x - pan.x) / zoom,
            (y - pan.y) / zoom,
            true,
            false,
          );
        if (hit?.id() !== frameId) continue;
        const point = { x: box.left + x, y: box.top + y };
        if (
          document.elementFromPoint(point.x, point.y)?.tagName.toLowerCase() ===
          "canvas"
        ) {
          return point;
        }
      }
    }
    return null;
  }, id);
  if (!at)
    throw new Error(`nowhere on the frame ${id} is the frame itself on top`);
  await page.mouse.click(at.x, at.y);
}

/** Lena's map with her Turnverein opened, every role of it on the canvas. */
async function openTurnverein(page: Page) {
  await page.goto(`/graph?center=${LENA}`);
  await settled(page);
  await clickNode(page, TURNVEREIN);
  const peek = page.getByRole("complementary");
  await peek.getByRole("button", { name: "Expand connections" }).click();
  await expect.poll(() => stateOf(page, FRANZISKA)).toBe("drawn");
  await peek.getByRole("button", { name: "Close" }).click();
  await settled(page);
}

async function switchOn(page: Page, name: string) {
  const menu = await filterMenu(page);
  const item = menu.getByRole("menuitemcheckbox", {
    name: new RegExp(`^${name}`),
  });
  await item.click();
  await page.keyboard.press("Escape");
  await settled(page);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("stands a role’s people in one group, on one line to the circle, their link between them drawn", async ({
  page,
}) => {
  await openTurnverein(page);

  // Off by default: each member on a line of their own, nobody framed.
  expect(await groupingOnCanvas(page)).toMatchObject({
    frame: false,
    parents: { a: null, b: null },
    circleToMembers: 2,
  });
  const menu = await filterMenu(page);
  await expect(
    menu.getByRole("menuitemcheckbox", { name: /^Group by role/ }),
  ).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  await switchOn(page, "Group by role");

  await expect
    .poll(() => groupingOnCanvas(page))
    .toEqual({
      frame: true,
      parents: { a: AKTIVE, b: AKTIVE },
      circleToGroup: 1,
      circleToMembers: 0,
      inner: 1,
    });
  // A role held once stays an ordinary node.
  expect(await stateOf(page, BEAT)).toBe("drawn");
  const beatParent = await page.evaluate((id) => {
    let el: HTMLElement | null = document.querySelector("canvas");
    while (el && !("_cyreg" in el)) el = el.parentElement;
    const cy = (
      el as unknown as {
        _cyreg: { cy: { $id(id: string): { isChild(): boolean } } };
      }
    )._cyreg.cy;
    return cy.$id(id).isChild();
  }, BEAT);
  expect(beatParent).toBe(false);
});

test("tucks the links within a group away when that switch is off", async ({
  page,
}) => {
  await openTurnverein(page);
  await switchOn(page, "Group by role");
  await expect.poll(async () => (await groupingOnCanvas(page)).inner).toBe(1);

  await switchOn(page, "Links within groups");

  await expect.poll(async () => (await groupingOnCanvas(page)).inner).toBe(0);
  // Still there to be shown: selecting Sandra names her friendship again.
  await clickNode(page, SANDRA);
  await expect.poll(async () => (await groupingOnCanvas(page)).inner).toBe(1);
});

test("a tapped group lists its people and can be shown individually", async ({
  page,
}) => {
  await openTurnverein(page);
  await switchOn(page, "Group by role");
  await expect
    .poll(async () => (await groupingOnCanvas(page)).frame)
    .toBe(true);

  await clickFrame(page, AKTIVE);

  const peek = page.getByTestId("group-peek");
  await expect(peek.getByText("Aktive · 2")).toBeVisible();
  await expect(peek.getByText("in Turnverein Länggasse")).toBeVisible();
  await expect(
    peek.getByRole("link", { name: /Sandra Brunner-Keller/ }),
  ).toBeVisible();
  await expect(
    peek.getByRole("link", { name: /Franziska Widmer/ }),
  ).toBeVisible();

  await peek.getByRole("button", { name: "Show individually" }).click();

  await expect
    .poll(() => groupingOnCanvas(page))
    .toMatchObject({
      frame: false,
      parents: { a: null, b: null },
      circleToMembers: 2,
    });
  await expect(peek).toHaveCount(0);
});

test("remembers the switch on this device", async ({ page }) => {
  await openTurnverein(page);
  await switchOn(page, "Group by role");

  await page.reload();
  await settled(page);

  const menu = await filterMenu(page);
  await expect(
    menu.getByRole("menuitemcheckbox", { name: /^Group by role/ }),
  ).toHaveAttribute("aria-checked", "true");
});
