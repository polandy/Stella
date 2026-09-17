# Concept — Implementing the suggestion rules

Companion to `relationship-suggestions.md`, which says *what* Stella should propose. This one
says *where the code goes*. The rules beyond L1/L2 are still a concept, and the UI shape is a
mockup, not a decision.

**Built so far: slices 1 and 2** — the reasons are translated, and the engine, its read model
and the universal suppressions are in place with L1 and L2 running through them. No user-visible
behaviour changed: the *Also true?* block offers exactly what it offered before, in the reader's
language. Slice 3 (**L3**, the other parent) is the first one the household will feel.

Read with: `src/lib/suggestions/` (`types`, `view`, `engine`, `suppressions`, `reasons`,
`rules/links`), `src/lib/kinship/kinship.ts`,
`src/lib/server/domain/relationships/relationships.ts` (`readKinship`),
`src/routes/(app)/contacts/[id]/+page.server.ts` (`?propose=`, `addProposedRelationship`),
`src/routes/(app)/contacts/new/+page.svelte`.

---

## 1. What existed, and what it cost to extend

The path was short and worked:

```
form action: create link
  → redirect ?propose=<a>:<b>
    → load: readKinship(viewer, subjectId, pair)
       → loadKinshipGraphVisibleTo(viewer)      // visibility settled here
       → suggestPropagation(graph, primaryLink) // pure, two rules
    → page: "Also true?" block, one form per proposal
      → form action addProposedRelationship: create the parent link
```

It still is, with `evaluate({ kind: 'link-stored', link }, buildView(graph))` where
`suggestPropagation` was. The shape of the flow was never the problem.

Three things in it did not survive the rule set growing. **All three are addressed as far as
one trigger and two rules can address them**; what is left is noted against each.

1. **`suggestPropagation` returned only parent links.** Its `SuggestedLink.kind` was the
   literal `'parent'`, so field suggestions and warnings had nowhere to live. `Suggestion` is
   now a discriminated union on `kind`; today it has only the `link` member, and the `field`
   and `warning` members join it with the rules that raise them, rather than sitting there
   unbuilt.
2. **`reason` was an English sentence built in the domain** (`possessive()`). It is now a
   `LinkedPhrase`, built by a named builder in `suggestions/reasons.ts`, and the English genitive
   lives in the English catalogue where a language that has one can keep it.
3. **The trigger was implicit.** `readKinship` now builds a `link-stored` trigger explicitly,
   and `Trigger` is the discriminated union that `person-created`, `form-opened` and
   `person-reviewed` extend. `primaryLinkBetween` still reconstructs *which* link was added by
   searching the graph for the pair — deliberately, because reading it back is what stops a
   hand-written `?propose=` URL naming a link that does not exist or that the viewer may not
   see. What changed is that the answer is now wrapped in a trigger rather than passed
   straight to a rule.

None of this is wasted work — the pure-function shape, the visibility-settled-before-inference
rule and the opt-in flow all carry over. What changes is the envelope.

---

## 2. Module layout

As built, with what is still to come in brackets:

```
src/lib/suggestions/
  types.ts        Trigger, Suggestion, Relation, Confidence, RuleId, Rule, PrimaryLink
  view.ts         buildView(graph) — the read model, its indexes, and pairKey
  suppressions.ts the universal suppressions as pure predicates
  rules/
    links.ts      L1 L2 [L3 L3b L5, L6–L8 behind a flag]
    [fields.ts]     F1 F1b F2 F3 F4 F5 F6 F7 F8
    [consistency.ts] C1 C5 C6  (C2 C3 C4 C7 stay where they are — they are guards, not rules)
  engine.ts       evaluate(trigger, view) — runs rules, applies suppressions, orders [caps]
  reasons.ts      sentence builders, one per reason shape
```

The suppressions went into a file of their own rather than into `engine.ts` as first drafted.
They are pure predicates over the view, so they can be *asked* a question rather than only made
to act — which is what suppression 5 will need when the entry guards become predicates — and
the one that matters gets its own suite without a rule test in the way.

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
  | { id: RuleId; kind: 'link';    confidence: Confidence; link: PrimaryLink;  reason: LinkedPhrase }
  | { id: RuleId; kind: 'field';   confidence: Confidence; field: FieldFill;   reason: LinkedPhrase }
  | { id: RuleId; kind: 'warning'; severity: 'warn';       subject: Pair;      reason: LinkedPhrase };
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

Then: sort by confidence, rule id, subject display name, object display name, and keep one row
per **claim** — the household answers the claim, not the rule that happened to surface it, which
is the same reason a dismissal is keyed by it (rules §6.4).

**The cap is not applied yet, deliberately.** It only works alongside somewhere to put what it
holds back — the *more* affordance that collapses `possible` rows, which arrives with the review
panel in slice 7. Until then a cap would silently drop `certain` claims with nowhere to show
them: a household with nine siblings would never be offered the ninth parent link. So
`SUGGESTION_LIMIT_LINKS` and the `collapsed` flag land with slice 7, not before.

Suppressions 1–4 are built. 5 and 6 arrive with their slices (4 and 6), and until then the
write-side guards are the only thing refusing a confirmed suggestion — which they must be
regardless, since the engine's suppression 5 is a display filter, never a substitute.

Suppression 5 means the guards must be callable without a DB round-trip. Today the generation
guard is written inline in `createRelationship` — two `deps.relationships.exists()` calls and a
`ContradictoryRelationshipError` — so it cannot be asked a question, only made to throw. It
needs to become a pure predicate over the view that both the use-case and the engine call. That
refactor is small and is the only place the two layers touch.

---

## 5. Wiring at the edges

### Link suggestions — extend the existing path — **done**
`readKinship` kept its signature and its `?propose=` pointer, and builds a `link-stored`
trigger instead of calling `suggestPropagation` directly. `ProposedLink` now extends
`LinkSuggestion`, so a proposal reaches the page carrying `ruleId`, `confidence` and
`relation` as well as the two ids and names — nothing renders them yet, and the page block
still grows a confidence chip and a *Dismiss* control in later slices.
`addProposedRelationship` already re-runs every guard on confirmation — that stays; the
engine's suppression 5 is a display filter, not a substitute for the write-side guard.

### Field suggestions — a new endpoint on the add-person flow
`contacts/new` is a client-side form that already talks to `/contacts/suggest` for duplicate
candidates. Add `GET /contacts/suggest/fields?anchor=<id>&role=<role>`, which builds a
`form-opened` trigger and returns the `FieldFill[]`. The page shows each filled field with a
*from Peter Meier* chip and an undo affordance; `prefill: false` renders as a one-tap offer
next to an empty input.

The endpoint reads through `contactVisibleTo` like every other read — a field value must not
cross a visibility boundary, and that is a test, not a comment.

### The on-demand review — a person-scoped entry point — **done**
`evaluate` selects rules by trigger, so `person-reviewed` needs rules that can answer a
*person* rather than a link. The rules do not each grow a branch for it: `linksInScope(trigger,
view)` hands them either the one stored link or `view.primaryLinksAround(subjectId)`, and the
suppressions collapse the duplicates that produces. Worth stating plainly because it is the one
place the engine does real work — an event trigger looks at one link, a review trigger at a
whole neighbourhood.

**The neighbourhood is the sibling group, not the subject's own links.** The link rules move a
parent across sibling-hood, so read from the other side *“my sister's father is my father”* is a
claim about the subject that no link of theirs mentions — a scope of their own links misses it,
and that is precisely the case a household notices and reports as a bug.

It surfaces as a ghost control in the person page's relationship card header (`?review`), with
the result rendered by the same component the *Also true?* block uses and the declined claims
behind a `<details>` in the same payload. Confirm posts to `addProposedRelationship` as today;
`dismissSuggestion` writes the row and `restoreSuggestion` deletes it; leaving a suggestion
alone writes nothing and it returns on the next run.

The use-cases live in `domain/relationships/suggestion-review.ts`, which declares the narrow
ports it needs (`KinshipGraphSource`, `SuggestionDismissalRepository`) rather than importing
the full relationship repository — so nothing in the suggestion path holds a port it could
write a link through.

### Warnings
C1 and C5 surface where the link is entered, as a non-blocking line under the submit button,
and the submit stays enabled. C6 joins the existing refusals in the create use-case and
returns a domain error with a `Phrase`, like C2 does today.

---

## 6. Reasons as sentences that keep their people

`reasons.ts` holds one builder per reason shape, e.g.

```ts
export const parentThroughSibling = (parent: PersonRef, via: PersonRef, child: PersonRef)
  : LinkedPhrase<'parent' | 'via' | 'child'> =>
  (t) => ({ people: { parent, via, child },
            say: (names) => t('kinship.reason.parentThroughSibling', names) });
```

A reason states **every fact the claim rests on**, not one of them. A parent claim follows from
two — the parent is on record for one child, and that child and this one are siblings — and
naming only the sibling pair, as the first version did, states something true that never
mentions the person being offered. That is the one name the reader is asking about.

The builder returns a `LinkedPhrase` rather than a `Phrase`: a sentence that, once said, can
still be taken apart into words and people, so every name in it is a way to that person's page
(`src/lib/i18n/linked.ts`, docs/04 §4.9). The sentence is written whole in each language and
handed its names — German orders the same three differently and needs a dative apposition where
English uses a genitive — so nothing is ever assembled out of translated fragments.

The domain returns the phrase and the route says it with `translator(locals)`, then cuts it up
with `segmentsOf`. Segments are what reach the page: a closure cannot cross `load` into `data`.

`possessive()` is gone — an English genitive rule has no business in the domain, and German
forms it differently anyway. **This was step one of the work**, not a follow-up: every rule
added before it would have added another string to migrate.

---

## 7. Dismissal — **done**

One table, one migration:

```
suggestion_dismissal(id pk, household_id fk, relation text, pair_key text,
                     dismissed_at int, dismissed_by fk → user.id)
unique (household_id, relation, pair_key)
```

`pair_key` is the ordered-pair key the engine already computes — it and the claim key now live
in `suggestions/claims.ts`, which is also where `oneRowPerClaim` gets its key, so a claim's
identity is written once. **`relation`, not `rule_id`**:
the household declines a claim, not the rule that surfaced it, and two rules can name the same
pair (§6.4 of the rules concept). Household-scoped, not user-scoped: the household decided.

The repository loads the household's dismissals into the view; the engine filters purely. For
the *show dismissed* list, suppression 6 marks instead of dropping —
`evaluate(trigger, view, { includeDismissed })` and a `dismissed: { at, by } | null` on
`Suggestion` — while the other five stay hard drops. Undo is a delete of the row, so it needs
no second concept. The row also travels in an export (`EXPORTED_TABLES`): a restored backup
that re-asks every settled question is worse than no backup of this at all.

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
  silently returned nothing at all. The same trap caught the claim de-duplication while slice 2
  was built: a case written through `evaluate` passed just as happily with the de-duplication
  deleted, because one trigger selects one rule and nothing can reach a claim twice yet. It is
  tested directly on `oneRowPerClaim` instead, and that test does fail against the unfixed
  build. Any assertion that something is *absent* is worth deleting the code under it once, to
  see the test go red.
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
| ~~1~~ | ~~`reasons.ts`, phrase-based `SuggestedLink`, i18n catalogues~~ — **done** | no new behaviour |
| ~~2~~ | ~~`suggestions/` skeleton: types, view, engine, L1+L2 moved over, suppressions~~ — **done** | no new behaviour |
| 3 | widen `PartnerEdge`; **L3 / L3b** | the other parent |
| 4 | C1 / C5 / C6 + the guard-as-predicate refactor | warnings and the cycle refusal |
| 5 | fields endpoint + **F1 F1b F2 F3 F6** | surname and gender prefill |
| ~~6~~ | ~~`suggestion_dismissal` + migration + Dismiss control~~ — **done** | declining sticks |
| ~~7~~ | ~~`person-reviewed` trigger + the review panel + *show dismissed*~~ — **done** | **the on-demand button** |
| 8 | F4 F5 F7 F8 | the softer prefills |
| 9 | L5, then L6–L8 behind a household setting | context rules |

6 and 7 shipped together, as §9 said they would have to: a review panel without a dismissal log
re-offers every declined claim on every press, so neither is usable alone.

1 and 2 were pure refactors and landed before anything user-visible; `kinship/propagation.ts`
went with them, its rules, filtering and ordering now being the engine's. 3 is the PR the
household will feel first; 7 is the one that makes the rule set reachable at all, since
everything before it only appears in the instant after a write. 6 is a hard prerequisite of 7
and cannot be deferred past it.

Two pieces moved between slices while 1 and 2 were built, both for the same reason — nothing
should land without a caller:

- **`types.ts` moved from slice 1 to slice 2.** Its first consumer is the engine; shipping it a
  slice earlier would have meant exported types nothing imported.
- **The `field` and `warning` members of `Suggestion` wait for slice 5.** The union is open, but
  a member describing rules that do not exist yet is a shape nothing can check.

---

## 10. Risks

- **The derivable-suppression is load-bearing.** If suppression 2 regresses, Stella starts
  offering to store grandparents and cousins, and every accepted one permanently replaces a
  derived label with an entered row. There is no undo for that beyond deleting the link.
  It has its own test file, `suppressions.test.ts`, which asserts both directions against the
  real `deriveKinship` — a step-parent pair still offered as **parent**, an already-derived
  sibling or half-sibling pair dropped — so a change in the kinship engine trips it too.
- **L3 without the date discriminator writes step-parents as parents.** Recoverable (delete
  the link) but wrong in the worst place — a family tree people trust.
- **Suggestion fatigue.** With F-rules on the add-person form *and* L-rules after the write,
  one new child produces two separate rounds of asking. The cap and the `possible` collapse
  are the mitigation; whether they are enough is a question for the mockup, not for a doc.
