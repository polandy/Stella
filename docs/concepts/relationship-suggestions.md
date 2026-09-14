# Concept — Relationship suggestions

Status: **concept only**. No UI, no implementation decided. This paper maps *what Stella
could propose* when a relationship or a person is entered, and states the **rule set** that
decides it. It extends `docs/02-features.md` §2.4.1 (derived kinship & propagation), which
already ships two of these rules; everything else here is new ground.

---

## 1. Why

Adding a person to a family is repetitive work that the graph mostly already knows. Entering
*Lio, child of Peter* implies, in most households, that Lio is also Lisa's child (Peter's
partner), a sibling of Peter's other children, carries Peter's surname, lives at Peter's
address, and belongs to the same family circle. Stella can see all of that; the member should
confirm, not type.

Three kinds of help, deliberately kept apart because they behave differently:

| Kind | What it produces | Written when |
|---|---|---|
| **Link suggestion** | a `relationship` row Stella offers to store | on confirmation, one tap each |
| **Field suggestion** | a prefilled value in the person/link form | on save of that form, editable before |
| **Consistency signal** | a warning or a refusal, no proposal | never — it only blocks or cautions |

A fourth is explicitly *not* produced: anything the kinship engine already **derives**
(grandparent, aunt, cousin, in-law, step-family). Deriving it and offering to store it would
be the same fact twice, and a stored edge outranks a derived one on the profile, so storing
it would actually *lose* the "worked out, not entered" marking. **If it can be derived, it is
never suggested.** This is the single most important rule in this paper.

---

## 2. Vocabulary

- **Trigger** — the event that makes a rule run: a link stored, a link retyped, a person
  created, a form opened.
- **Anchor** — the person the flow started from (the profile that was open).
- **Subject / Object** — the two endpoints of a proposed link.
- **Primary links** — `parent_child`, `sibling`, `partner`, `spouse`. The only types the
  kinship engine reads, and the only types a rule may propose *storing* (§6.1).
- **Confidence** — `certain` (logically implied by what is stored), `likely`
  (conventionally implied; a real household would usually agree), `possible` (a context
  hint that is as often wrong as right).
- **Reason** — the sentence shown with the suggestion. Must be a `Phrase` with parameters,
  never an English string (§7.3).

---

## 3. Catalogue — link suggestions

Rule ids are stable: `L` = link, `F` = field, `C` = consistency.

### 3.1 Shipped today

| id | Trigger | Proposal | Conf. |
|---|---|---|---|
| **L1** | parent link `P → C` stored | `P → S` for every sibling `S` of `C` | certain |
| **L2** | sibling link `A ↔ B` stored | every parent of `A` as parent of `B`, and vice versa | certain |

Both live in `src/lib/kinship/propagation.ts` and are opt-in per suggestion.

### 3.2 The other parent — the gap this concept closes

| id | Trigger | Condition | Proposal | Conf. |
|---|---|---|---|---|
| **L3** | parent link `P → C` stored | `P` has exactly one partner/spouse `Q` with `status ≠ former` | `Q → C` as parent | likely |
| **L3b** | same | `P` has several partners, or the only one is `former` | nothing | — |

L3 is the rule the household actually wants when it adds a child. It is **not** `certain`:
`Q` may be a step-parent, and a step-parent tie is exactly the thing Stella refuses to store
(§2.4.1, shipped decision) because the profile already names it. The rule therefore needs a
discriminator, and there are only two honest ones:

- **Partnership age.** If `C.birth_date` is known and the partner link's `since_date` is
  known and *later* than the birth, `Q` is a step-parent → **no suggestion**. If `since_date`
  is earlier, or either date is missing, the suggestion stands at `likely`.
- **Existing parent count.** If `C` already has two stored parents, no third is offered
  (see C1).

L3b is stated as a rule so the silence is deliberate rather than an oversight: with several
current partners Stella has no basis to pick one, and guessing wrong writes a false parent.

### 3.3 Siblings of the new child

| id | Trigger | Condition | Proposal | Conf. |
|---|---|---|---|---|
| **L4** | parent link `P → C` stored | `P` has other children `S₁…Sₙ` | **nothing** | — |
| **L5** | person created as child of `P` | a sibling `S` is known **only** through a parent who is *not in Stella* | explicit `sibling` link `C ↔ S` | likely |

L4 is a *non-rule* on purpose, and it is the one a naive reading of "suggest siblings" gets
wrong. Sharing a stored parent already makes two people siblings — both the kinship engine
and `propagation.ts`'s own index treat a shared parent as a sibling tie. Offering to store
the edge would add a row that changes nothing except to replace a derived label with an
entered one.

L5 is the residual case that genuinely needs an edge: two people are siblings but no common
parent is recorded (the parent died before Stella, or is deliberately not kept). Then a
stored `sibling` link is the only carrier of the fact.

### 3.4 Non-family propagation

| id | Trigger | Condition | Proposal | Conf. |
|---|---|---|---|---|
| **L6** | `colleague` link `A ↔ B` stored | `A.company` is set and equals `B.company` | `colleague` with every other contact carrying that company | possible |
| **L7** | person created with an address | an existing contact shares the normalised address **and** no household/partner tie exists | `neighbor` — or a prompt that this may be the *same* household | possible |
| **L8** | contact joins a circle | the circle has ≤ N members (small course/team) | `knows` with each member | possible |

All three are `possible`: a shared employer is not a working relationship, a shared address is
more often a family member than a neighbour, and a circle already carries the "connected
through" meaning without a pairwise edge (§2.4.2). **Recommendation: L6–L8 are documented but
not built in a first pass**, or built behind an off-by-default household setting. They are
listed here so the rule engine's shape is not designed around family alone.

### 3.5 Never suggested — derived instead

Stated explicitly so nobody re-adds them later: **grandparent / great-grandparent, aunt /
uncle, niece / nephew, cousin, half-sibling, parent-in-law, sibling-in-law, step-parent,
step-child, step-sibling.** Every one of these follows from primary links and is named by the
kinship engine on the profile. A household that wants one *stored* anyway (a grandmother
whose connecting parent is not in Stella) enters it by hand — that path stays open and is the
reason the built-in type set contains `grandparent_grandchild` at all.

---

## 4. Catalogue — field suggestions

Field suggestions prefill a form. They are **visibly marked as taken from someone**
("from Peter Meier") and are freely overwritable before the save. Nothing is copied silently.

| id | Trigger | Source | Proposal | Conf. |
|---|---|---|---|---|
| **F1** | new person added as **child of** `P` | `P.last_name` | prefill `last_name` | likely |
| **F1b** | same, both parents known and surnames differ | both | offer **both** as two choices, prefill neither | likely |
| **F2** | new person added as **sibling of** `S` | `S.last_name` | prefill `last_name` | likely |
| **F3** | new person added as **partner/spouse of** `P` | `P.last_name` | offer, **do not prefill** | possible |
| **F4** | new person added as child/partner of `P` | `P`'s address field labelled *Home* | offer the same address, label *Home* | likely |
| **F5** | new person added as **colleague of** `P` | `P.company` | prefill `company` | likely |
| **F6** | add-person shortcut says *mother / father / sister / brother* | the shortcut itself | set `gender` accordingly | certain |
| **F7** | new person added through any link from `P` | `P.display_name` | prefill the link's free-text as *met through …* | possible |
| **F8** | new person added as child/sibling of `P` | the circles `P` belongs to that are marked family-ish | offer membership | possible |

Notes that decide whether these feel smart or creepy:

- **F1 vs F3.** A child usually takes a parent's surname; a partner very often does not.
  Same mechanism, different default — prefilled vs merely offered. Getting this asymmetry
  wrong is what makes contact apps annoying.
- **F1b** must not pick a winner. When two recorded parents disagree, the household decides.
- **F4** copies the *value*, never links the rows: two people at one address are two
  addresses. A shared-address entity is a separate question (household / §2.4.2), out of
  scope here.
- **F6** is the only `certain` field rule, because the member stated the role themselves.
  It must still be editable — the shortcut is a shorthand, not an assertion about gender.
- No rule ever copies: birth date, deceased state, photos, private notes, `how_we_met`
  narrative text, or any `private`-visibility content (§7.2).

---

## 5. Catalogue — consistency signals

These produce no proposal. Half of them exist already as guards; the rest are new.

| id | Condition | Behaviour | Status |
|---|---|---|---|
| **C1** | a third stored parent is added to a person | **warn**, allow (adoptive/step families are real) | new |
| **C2** | a generation claimed in both directions | **refuse** | shipped |
| **C3** | duplicate pair (same two people, same type) | **refuse** | shipped |
| **C4** | self-relationship | **refuse** | shipped |
| **C5** | proposed parent's `birth_date` is not at least *K* years before the child's | **warn** | new |
| **C6** | a person's ancestor chain would become a cycle beyond one hop (`A→B→C→A`) | **refuse** | new — C2 only covers the one-hop case |
| **C7** | the name being typed matches an existing contact | offer that contact instead of a new row | shipped (§2.2.1) |

`K` in C5 is a named constant, not a literal at the call site, and the warning is soft: adoption
and estimated birth years both produce legitimate violations.

C6 is worth flagging: the shipped guard refuses `A parent-of B` when `B parent-of A` exists,
but nothing today stops a longer loop, and the kinship engine walks ancestors. A cycle check
belongs in the same guard, not in the suggestion engine.

---

## 6. The rule set as a machine

### 6.1 Shape

```
evaluate(trigger: Trigger, view: SuggestionView): Suggestion[]
```

- **Pure.** No repository, no clock beyond an injected one, no `$env`. It belongs in
  `src/lib/` next to `kinship/`, and is unit-tested first (docs/08 §8.3).
- **`SuggestionView`** is a read model built by the caller: people (id, display name, surname,
  gender, birth date), primary edges (parent, sibling, partner with `status` and `since_date`),
  the set of pairs that already carry *any* stored relationship, and — for F4/F5/F8 — the
  anchor's company, home address and circles. It contains **only what the viewer may see**
  (§7.2); the engine never filters, because an engine that filters can forget to.
- **`Trigger`** is a discriminated union: `link-stored`, `link-retyped`, `person-created`,
  `form-opened`. Every rule declares which triggers it answers, so adding a rule never means
  editing a switch that three other rules share.
- **`Suggestion`** carries `ruleId`, `kind` (`link` | `field` | `membership` | `warning`),
  `confidence`, the payload, and a `reason` **Phrase + params**.

### 6.2 Universal suppressions

Applied to every rule's output, before ordering:

1. **Already spoken about.** Drop any link proposal for a pair that carries a stored
   relationship of any type. (Shipped behaviour; keep it central.)
2. **Derivable.** Drop a link proposal when derivation already names *that pair* with *that
   relation* (§3.5). The comparison is on the relation, not the pair: derivation calls
   Peter's partner Lisa the *step-parent* of his child, which is precisely the pair L3 wants
   to offer as **parent** — a different relation, so L3 survives. A proposed `sibling` for a
   pair derivation already calls siblings does not (that is L4).
3. **Self.** Drop `subject === object`.
4. **Invisible.** Drop anything naming a person outside the view.
5. **Guard-refused.** Run the same guards a manual entry passes (C2/C3/C4/C6). A suggestion
   that would be refused on confirmation must never be shown.
6. **Dismissed.** See §6.4.

### 6.3 Ordering and volume

Confidence descending, then rule id, then the object's display name — deterministic, so tests
assert a list rather than a set. A cap is needed (`SUGGESTION_LIMIT` already exists for name
candidates; a separate constant here): more than a handful of "also true?" rows stops reading
as help and starts reading as a chore. `possible`-confidence suggestions are collapsed behind
a *more* affordance rather than counted against the cap.

### 6.4 Dismissal — the one storage question

Suggestions are recomputed from the graph, so a suggestion declined today reappears tomorrow.
Three options:

- **(a) Session-only.** Nothing stored; the block empties as it is worked through (today's
  behaviour). Cheapest, and re-offers forever.
- **(b) Negative fact.** Store "Q is *not* C's parent". Powerful, but it is a new kind of
  truth in the model and every rule would have to consult it.
- **(c) Dismissal log.** `suggestion_dismissal(household_id, rule_id, pair_key, dismissed_at)`
  — one small table, a pure filter in the engine, no new semantics.

**Recommendation: (c)**, with dismissals scoped per household (not per user: the household
decided) and deletable, so a dismissal is not a silent permanent veto.

---

## 7. Constraints this must respect

### 7.1 Opt-in, always
Nothing is written without a per-suggestion confirmation (§2.4.1 principle). No "accept all"
in a first pass: a bulk accept over `likely` rules is how a wrong step-parent gets stored
across a whole family.

### 7.2 Privacy
The engine sees only what `contactVisibleTo` allows. A suggestion must not reveal a private
person's existence through a reason sentence, and a field suggestion must not copy a value
off a contact the viewer may not see. This is a property to test, not a comment to write.

### 7.3 Language
`reason` in today's `SuggestedLink` is an English template string built in the domain — it
works only because the block happens to render it verbatim, and it is not translatable. The
rule engine must carry a `Phrase` with parameters instead, resolved at the edge
(`say(locals, …)` / `t()`), like every other domain error. **Fixing this is a precondition
for adding rules, not a follow-up** — each new rule otherwise adds another untranslatable
sentence.

### 7.4 No new relationship types
No rule invents a type. The family rules propose one of the four primary types; the context
rules L6-L8 propose an existing built-in social or professional type (`colleague`,
`neighbor`, `knows`). No rule reads a custom type's key — custom types are barred from the
four primary keys precisely so inference stays sound.

---

## 8. Suggested order of work

1. **Phrase-based reasons** (§7.3) — refactor, no new behaviour, unblocks everything.
2. **L3 / L3b** — the other parent. The rule the household will notice.
3. **F1 / F1b / F2 / F6** — surname and gender prefill on the add-person flow.
4. **C1 / C5 / C6** — the consistency signals, which are cheap and prevent the graph the
   later rules would reason over from going bad.
5. **Dismissal log** (§6.4) once more than two rules fire at once.
6. **F4 / F5 / F7 / F8** — the softer field prefills.
7. **L5**, then **L6–L8** behind a setting, if the household ever asks.

Each step is a PR of its own: a pure rule with tests, then the edge that surfaces it, then —
after the user's sign-off — the e2e (docs/08 §8.4.1).

## 9. Open questions

- Does L3 need the birth-date discriminator on day one, or is "one current partner" enough
  and the step-parent case rare enough to let the household decline?
- Should field suggestions also fire when **editing** an existing person (a surname changes —
  offer it to the children), or only at creation? Editing is where it gets genuinely useful
  and genuinely dangerous.
- Is a marriage (`spouse`) with a `former` status a signal to stop proposing at all, or only
  to lower confidence?
- Where do the suggestions live in the interface — the existing *Also true?* block only, or
  also inline in the add-person form? (UI question, deliberately unanswered here.)
