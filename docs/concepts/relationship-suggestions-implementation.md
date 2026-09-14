# Concept — Implementing the suggestion rules

Companion to `relationship-suggestions.md`, which says *what* Stella should propose. This one
says *where the code goes*. Still a concept: nothing here is built, and the UI shape is a
mockup, not a decision.

Read with: `src/lib/kinship/{kinship,propagation}.ts`,
`src/lib/server/domain/relationships/relationships.ts` (`readKinship`, ~line 300),
`src/routes/(app)/contacts/[id]/+page.server.ts` (`?propose=`, `addProposedRelationship`),
`src/routes/(app)/contacts/new/+page.svelte`.

---

## 1. What exists, and what it costs to extend

Today's path is short and works:

```
form action: create link
  → redirect ?propose=<a>:<b>
    → load: readKinship(viewer, subjectId, pair)
       → loadKinshipGraphVisibleTo(viewer)      // visibility settled here
       → suggestPropagation(graph, primaryLink) // pure, two rules
    → page: "Also true?" block, one form per proposal
      → form action addProposedRelationship: create the parent link
```

Three things in it do not survive the rule set growing:

1. **`suggestPropagation` returns only parent links.** Its `SuggestedLink.kind` is the literal
   `'parent'`. Field suggestions and warnings have nowhere to live.
2. **`reason` is an English sentence built in the domain** (`propagation.ts`, `possessive()`).
   Untranslatable, and against the i18n non-negotiable. Every new rule would add another one.
3. **The trigger is implicit.** `primaryLinkBetween` reconstructs "what was just added" by
   searching the graph for the pair. That works for one link; it cannot express *person
   created* or *form opened*, which is where the field rules fire.

None of this is wasted work — the pure-function shape, the visibility-settled-before-inference
rule and the opt-in flow all carry over. What changes is the envelope.

---

## 2. Module layout

```
src/lib/suggestions/
  types.ts        Trigger, SuggestionView, Suggestion, Confidence, RuleId
  view.ts         buildView(graph, extras) — the read model, plus its indexes
  rules/
    links.ts      L1 L2 L3 L3b L5 (L6–L8 behind a flag)
    fields.ts     F1 F1b F2 F3 F4 F5 F6 F7 F8
    consistency.ts C1 C5 C6   (C2 C3 C4 C7 stay where they are — they are guards, not rules)
  engine.ts       evaluate(trigger, view) — runs rules, applies suppressions, orders, caps
  reasons.ts      Phrase builders, one per reason shape
```

Why a new folder rather than growing `kinship/`: `kinship/` answers *what is true*, and is read
on every person-page load. `suggestions/` answers *what should we offer*, runs only after a
write or on a form, and will carry rules that have nothing to do with kinship (company,
address, circles). Keeping them apart also keeps `deriveKinship` off the hot path of a rule
engine that will grow.

`engine.ts` imports `deriveKinship` to answer suppression #2 (§4). That dependency is
one-way and stays that way.

---

## 3. Types

```ts
export type RuleId = 'L1' | 'L2' | 'L3' | 'L5' | 'F1' | /* … */ 'C6';
export type Confidence = 'certain' | 'likely' | 'possible';

export type Trigger =
  | { kind: 'link-stored'; link: PrimaryLink }
  | { kind: 'link-retyped'; link: PrimaryLink }
  | { kind: 'person-created'; personId: string; viaAnchorId: string | null }
  | { kind: 'form-opened'; form: 'new-person'; anchorId: string; role: AnchorRole }
  | { kind: 'person-reviewed'; subjectId: string };   // on demand, not after a write

export type Suggestion =
  | { id: RuleId; kind: 'link';    confidence: Confidence; link: PrimaryLink;  reason: Phrase }
  | { id: RuleId; kind: 'field';   confidence: Confidence; field: FieldFill;   reason: Phrase }
  | { id: RuleId; kind: 'warning'; severity: 'warn';       subject: Pair;      reason: Phrase };
```

`FieldFill` is `{ field: 'lastName' | 'company' | 'address' | 'gender' | …; value: string;
sourceId: string; prefill: boolean }`. **`prefill: false` is F3** — offered, not filled in. That
one boolean is the whole F1/F3 asymmetry, so it belongs in the type rather than in the
component.

`SuggestionView` extends `KinshipGraph` with what the non-kinship rules need:

```ts
export interface SuggestionView extends KinshipGraph {
  partnerEdges: readonly PartnerEdge[];   // widened: + status, + sinceDate
  attributes: ReadonlyMap<string, PersonAttributes>; // surname, birthDate, company, homeAddress
  circles: ReadonlyMap<string, readonly string[]>;
  dismissed: ReadonlySet<string>;         // `${relation}|${pairKey}` — the claim, not the rule
}
```

### The one schema-shaped change

`KinshipGraph.partnerEdges` is a bare `Pair` today. **L3 cannot be written without
`status` and `sinceDate` on it** — status separates a current partner from a former one, and
the date is the step-parent discriminator. The column exists on `relationship`
(`status`, `since_date`); the graph projection in `src/lib/server/db/kinship-graph-read.ts`
does not even select them. So: widen `PartnerEdge`, add the two columns to that select and to
the `partnerEdges` branch, and leave `deriveKinship` reading the pair as before. Both
repositories share that one read, so neither can end up with a different answer. No migration.

---

## 4. The engine

```ts
export function evaluate(trigger: Trigger, view: SuggestionView): Suggestion[]
```

Each rule is `(trigger, view, index) => Suggestion[]`, registered in a table with the triggers
it answers. `evaluate` selects by trigger, concatenates, then applies the suppressions in
order — **centrally, never per rule**, because a rule that filters is a rule that can forget to:

1. pair already carries a stored relationship of any type
2. the proposal is derivable — `deriveKinship` already names this pair
3. self
4. either endpoint outside the view
5. the guards a manual entry passes would refuse it (`C2`/`C3`/`C4`/`C6`)
6. dismissed

Then: sort by confidence, rule id, object display name; cap at `SUGGESTION_LIMIT_LINKS`;
`possible` suggestions are returned but flagged `collapsed: true` rather than counted
against the cap.

Suppression 5 means the guards must be callable without a DB round-trip. Today the generation
guard is written inline in `createRelationship` — two `deps.relationships.exists()` calls and a
`ContradictoryRelationshipError` — so it cannot be asked a question, only made to throw. It
needs to become a pure predicate over the view that both the use-case and the engine call. That
refactor is small and is the only place the two layers touch.

---

## 5. Wiring at the edges

### Link suggestions — extend the existing path
`readKinship` keeps its signature and its `?propose=` pointer; it builds a
`link-stored` trigger instead of calling `suggestPropagation` directly, and returns
`Suggestion[]` instead of `ProposedLink[]`. The page block grows a confidence chip and a
*Dismiss* control. `addProposedRelationship` already re-runs every guard on confirmation — keep that;
the engine's suppression 5 is a display filter, not a substitute for the write-side guard.

### Field suggestions — a new endpoint on the add-person flow
`contacts/new` is a client-side form that already talks to `/contacts/suggest` for duplicate
candidates. Add `GET /contacts/suggest/fields?anchor=<id>&role=<role>`, which builds a
`form-opened` trigger and returns the `FieldFill[]`. The page shows each filled field with a
*from Peter Meier* chip and an undo affordance; `prefill: false` renders as a one-tap offer
next to an empty input.

The endpoint reads through `contactVisibleTo` like every other read — a field value must not
cross a visibility boundary, and that is a test, not a comment.

### The on-demand review — a person-scoped entry point
`evaluate` selects rules by trigger, so `person-reviewed` needs rules that can answer a
*person* rather than a link: for L1/L2/L3 that means running them over every primary link the
subject already has, and keeping the suppressions to collapse the duplicates that produces.
Worth stating plainly because it is the one place the engine does real work — an event trigger
looks at one link, a review trigger at a whole neighbourhood.

It surfaces as a control in the person page's relationship section, with the result rendered
by the same component the *Also true?* block uses, plus the *show dismissed* toggle. Confirm
posts to `addProposedRelationship` as today; dismiss posts to a new action that writes the
dismissal row; leaving a suggestion alone writes nothing and it returns on the next run.

### Warnings
C1 and C5 surface where the link is entered, as a non-blocking line under the submit button,
and the submit stays enabled. C6 joins the existing refusals in the create use-case and
returns a domain error with a `Phrase`, like C2 does today.

---

## 6. Reasons as Phrases

`reasons.ts` holds one builder per reason shape, e.g.

```ts
export const siblingOf = (sibling: string, of: string): Phrase =>
  (t) => t('kinship.reason.siblingOf', { sibling, of });
```

The catalogue needed by L1–L5 and F1–F8 is about eight sentences. The domain returns the
`Phrase`; the route resolves it with `say(locals, …)` and the component with `t()`, exactly as
domain errors already work. `possessive()` in `propagation.ts` disappears — an English
genitive rule has no business in the domain, and German forms it differently anyway.

**This is step one of the work**, not a follow-up: every rule added before it adds another
string to migrate.

---

## 7. Dismissal

One table, one migration:

```
suggestion_dismissal(id pk, household_id fk, relation text, pair_key text,
                     dismissed_at int, dismissed_by fk → user.id)
unique (household_id, relation, pair_key)
```

`pair_key` is the ordered-pair key the engine already computes. **`relation`, not `rule_id`**:
the household declines a claim, not the rule that surfaced it, and two rules can name the same
pair (§6.4 of the rules concept). Household-scoped, not user-scoped: the household decided.

The repository loads the household's dismissals into the view; the engine filters purely. For
the *show dismissed* list, suppression 6 marks instead of dropping —
`evaluate(trigger, view, { includeDismissed })` and a `dismissedAt` on `Suggestion` — while
the other five stay hard drops. Undo is a delete of the row, so it needs no second concept.

This table stops being optional once the on-demand review exists: a control a member can press
repeatedly, against an engine that re-derives everything each time, is unusable without it.

---

## 8. Tests

Test-first, and the shape matters more than the count:

- **Rules** — one table-driven suite per rule file. Each case is a small view literal, a
  trigger, and the expected `Suggestion[]`. Deterministic ordering is asserted as a list.
- **Suppressions** — a suite of its own, because that is where the bugs will be: a rule that
  fires correctly and is then wrongly dropped is invisible in a rule test.
- **L4 as a negative test with a positive signal.** "No sibling link is offered" must assert
  against the *full* returned list for the trigger (which contains the L3 suggestion), not
  against emptiness — an empty result proves nothing, and would stay green if the engine
  silently returned nothing at all.
- **Privacy** — a view built for a viewer who may not see one endpoint yields no suggestion
  naming them, and no field value sourced from them.
- **Phrases** — each reason resolves in `en` and `de`; the German catalogue is typed against
  English, so a missing one is a type error rather than a runtime surprise.
- **e2e** — only after the user's sign-off, per the delivery loop: add a child, confirm the
  offered second parent, see it on both profiles.

---

## 9. PR slicing

| # | Scope | Ships |
|---|---|---|
| 1 | `reasons.ts`, `Phrase`-based `SuggestedLink`, i18n catalogues | no new behaviour |
| 2 | `suggestions/` skeleton: types, view, engine, L1+L2 moved over, suppressions | no new behaviour |
| 3 | widen `PartnerEdge`; **L3 / L3b** | the other parent |
| 4 | C1 / C5 / C6 + the guard-as-predicate refactor | warnings and the cycle refusal |
| 5 | fields endpoint + **F1 F1b F2 F3 F6** | surname and gender prefill |
| 6 | `suggestion_dismissal` + migration + Dismiss control | declining sticks |
| 7 | `person-reviewed` trigger + the review panel + *show dismissed* | **the on-demand button** |
| 8 | F4 F5 F7 F8 | the softer prefills |
| 9 | L5, then L6–L8 behind a household setting | context rules |

1 and 2 are pure refactors and should land before anything user-visible. 3 is the PR the
household will feel first; 7 is the one that makes the rule set reachable at all, since
everything before it only appears in the instant after a write. 6 is a hard prerequisite of 7
and cannot be deferred past it.

---

## 10. Risks

- **The derivable-suppression is load-bearing.** If suppression 2 regresses, Stella starts
  offering to store grandparents and cousins, and every accepted one permanently replaces a
  derived label with an entered row. There is no undo for that beyond deleting the link.
  It deserves its own test file, not a case inside another.
- **L3 without the date discriminator writes step-parents as parents.** Recoverable (delete
  the link) but wrong in the worst place — a family tree people trust.
- **Suggestion fatigue.** With F-rules on the add-person form *and* L-rules after the write,
  one new child produces two separate rounds of asking. The cap and the `possible` collapse
  are the mitigation; whether they are enough is a question for the mockup, not for a doc.
