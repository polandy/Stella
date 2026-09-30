import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./app";
import { LINK, seedHousehold } from "./seed";

/*
 * A keyboard answer keeps its place (docs/05 §5.5, issue #127). The focused *Accept* or
 * *Decline* leaves the page with its row, and without a decision the browser drops focus on
 * `<body>` — the next Tab starts again at the top of the document. Written after the owner
 * checked the behaviour in the running app (docs/08 §8.4.1).
 *
 * Every case asserts *which* control has focus, never merely that it is not the body: "not
 * body" would pass on almost anything. The row leaves after a short transition (or at once
 * under reduced motion); `toBeFocused` retries, so no case waits for it by the clock.
 *
 * Each case seeds a family of its own under a surname the demo household does not use and
 * narrows the review to it with `q=` — the suite shares one database, and the review spans the
 * whole household. Answers are only held for the undo window, never sent here; nothing in these
 * cases depends on them reaching the server.
 */

const REVIEW = "/settings/relationships";

const reviewFor = (surname: string) => `${REVIEW}?review&q=${surname}`;

const rows = (page: Page) => page.locator("main [data-kin-row]");

const rowByKey = (page: Page, key: string) =>
  page.locator(`main [data-kin-row="${key}"]`);

const answerIn = (row: Locator, control: "Accept" | "Decline") =>
  row.getByRole("button", { name: control });

/**
 * Puts keyboard focus on a row's answer the way a reader does: from its neighbour with Tab or
 * Shift+Tab, so the browser counts it as keyboard focus. The `:focus-visible` check is the
 * precondition the fix keys on — without it this case would be testing the pointer path.
 */
async function tabTo(
  page: Page,
  row: Locator,
  control: "Accept" | "Decline",
): Promise<Locator> {
  const accept = answerIn(row, "Accept");
  const decline = answerIn(row, "Decline");
  if (control === "Decline") {
    await accept.focus();
    await page.keyboard.press("Tab");
  } else {
    await decline.focus();
    await page.keyboard.press("Shift+Tab");
  }
  const target = control === "Accept" ? accept : decline;
  await expect(target).toBeFocused();
  expect(await target.evaluate((el) => el.matches(":focus-visible"))).toBe(
    true,
  );
  return target;
}

/**
 * Two parents of one sibling make two claims about the other — both filed under that one
 * person, so the review shows them as two rows of one card.
 */
async function twoRowsOfOneCard(
  page: Page,
  surname: string,
): Promise<string[]> {
  const [one, other, mother, father] = [
    "Linus",
    "Frida",
    "Agnes",
    "Konrad",
  ].map((first) => `${first} ${surname}`);
  await seedHousehold(
    page,
    [one, other, mother, father],
    [
      { from: one, to: other, type: LINK.siblingOf },
      { from: mother, to: one, type: LINK.parentOf },
      { from: father, to: one, type: LINK.parentOf },
    ],
  );
  await page.goto(reviewFor(surname));
  const card = page
    .locator("main section")
    .filter({ hasText: `${mother} is a parent of ${other}` });
  const cardRows = card.locator("[data-kin-row]");
  await expect(cardRows).toHaveCount(2);
  return cardRows.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.kinRow ?? ""),
  );
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const control of ["Decline", "Accept"] as const) {
  test(`a keyboard ${control} hands focus to the ${control} of the row that took its place`, async ({
    page,
  }) => {
    const [answered, next] = await twoRowsOfOneCard(page, `Fokus${control}`);

    await (await tabTo(page, rowByKey(page, answered), control)).press("Enter");

    // The answered row is gone, and the reader is on the same answer one row down — so a run
    // of Enter goes on down the list.
    await expect(rowByKey(page, answered)).toHaveCount(0);
    await expect(answerIn(rowByKey(page, next), control)).toBeFocused();
  });
}

test("a keyboard answer carries on under reduced motion, where the row goes at once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [answered, next] = await twoRowsOfOneCard(page, "Fokusruhig");

  await (await tabTo(page, rowByKey(page, answered), "Decline")).press("Enter");

  await expect(rowByKey(page, answered)).toHaveCount(0);
  await expect(answerIn(rowByKey(page, next), "Decline")).toBeFocused();
});

test("a person's last answer carries focus on into the next person's first row", async ({
  page,
}) => {
  /*
   * One parent of one sibling in a group of three: a claim about each of the other two, filed
   * under each of them — two cards. The order of the cards is the page's, so it is read from
   * the page rather than assumed.
   */
  const surname = "Fokuskarte";
  const [one, second, third, parent] = [
    "Levin",
    "Maren",
    "Ruben",
    "Hedwig",
  ].map((first) => `${first} ${surname}`);
  await seedHousehold(
    page,
    [one, second, third, parent],
    [
      { from: one, to: second, type: LINK.siblingOf },
      { from: one, to: third, type: LINK.siblingOf },
      { from: parent, to: one, type: LINK.parentOf },
    ],
  );
  await page.goto(reviewFor(surname));

  const cards = page
    .locator("main section")
    .filter({ has: page.locator("[data-kin-row]") });
  // However many claims the rules raise here, there are at least the two people's cards.
  await expect(cards.nth(1)).toBeVisible();
  const firstCardKeys = await cards
    .nth(0)
    .locator("[data-kin-row]")
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.kinRow ?? ""),
    );
  const secondCardFirst = await cards
    .nth(1)
    .locator("[data-kin-row]")
    .first()
    .getAttribute("data-kin-row");
  // Answer the first card down to its last row, so this answer is that person's last one.
  const last = firstCardKeys.at(-1)!;
  for (const key of firstCardKeys.slice(0, -1)) {
    await answerIn(rowByKey(page, key), "Decline").click();
    await expect(rowByKey(page, key)).toHaveCount(0);
  }

  await (await tabTo(page, rowByKey(page, last), "Decline")).press("Enter");

  await expect(rowByKey(page, last)).toHaveCount(0);
  await expect(
    answerIn(rowByKey(page, secondCardFirst!), "Decline"),
  ).toBeFocused();
});

test("the last answer on the screen hands focus to its heading", async ({
  page,
}) => {
  const surname = "Fokusende";
  const [one, other, parent] = ["Ilvy", "Jannis", "Rosmarie"].map(
    (first) => `${first} ${surname}`,
  );
  await seedHousehold(
    page,
    [one, other, parent],
    [
      { from: one, to: other, type: LINK.siblingOf },
      { from: parent, to: one, type: LINK.parentOf },
    ],
  );
  await page.goto(reviewFor(surname));
  await expect(rows(page)).toHaveCount(1);

  await (await tabTo(page, rows(page).first(), "Accept")).press("Enter");

  // Nothing is left to take its place, so focus lands on the screen's own heading — reachable
  // again with the next Tab — rather than on the page.
  await expect(rows(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Check relationships" }),
  ).toBeFocused();
});

test("a click answers without moving focus", async ({ page }) => {
  /*
   * The pointer path must stay as it was: moving focus could scroll the page and undo the hold
   * that keeps the list still under the reader's hand. The row having left is the positive
   * signal — focus is decided as its transition ends, before it leaves the DOM — and the
   * keyboard cases above, on the same rows, are what prove the move would otherwise happen.
   */
  const [answered, next] = await twoRowsOfOneCard(page, "Fokusmaus");

  await answerIn(rowByKey(page, answered), "Accept").click();

  await expect(rowByKey(page, answered)).toHaveCount(0);
  await expect(page.getByTestId("toast-undo")).toBeVisible();
  await expect(answerIn(rowByKey(page, next), "Accept")).not.toBeFocused();
  await expect(
    page.getByRole("heading", { level: 1, name: "Check relationships" }),
  ).not.toBeFocused();
});
