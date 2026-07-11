# 08 — Coding Guidelines

How we write code for Stella. These are binding conventions, not suggestions. When a
rule and pragmatism genuinely conflict, favor readability and testability.

## 8.1 Core principles (agreed)

1. **Test-first (TDD).** Specify behavior with a failing test, then write the minimal
   implementation to make it pass, then refactor. No production logic without a test that
   described it first.
2. **Clean, readable code** over cleverness. Code is read far more often than written.
3. **Encapsulation & single responsibility.** Each unit owns its data and behavior and has
   one reason to change. Objects/modules hide their internals.
4. **Minimal exposure.** Export/expose as little as possible. Default to private; make
   things public deliberately.
5. **Descriptive names.** Prefer a longer, clear name over a short, cryptic one.
   `resolveReverseRelationshipLabel` beats `revLbl`.
6. **Well-sliced, testable units.** Small functions, low complexity, easy to test in
   isolation.
7. **Minimal dependencies.** Prefer the standard library and built-in platform APIs
   (Bun, Web APIs). Every new dependency must earn its place.

## 8.2 Additions we also follow

8. **Framework-agnostic domain layer.** Business logic lives in `src/lib/server/domain`
   and `src/lib/server/access` as plain TypeScript with no SvelteKit/HTTP imports. The
   framework (routes, hooks, `$env`, `$app`) stays at the edges and is thin. This is what
   makes domain logic unit-testable with `bun test` and no framework bootstrapping.
9. **Dependency injection over globals.** Domain functions receive their collaborators
   (a `db` handle/repository, a `clock`, an `idGenerator`) as arguments. No reaching into
   module-level singletons from within domain logic. The edge wires the real
   implementations; tests pass fakes.
10. **Determinism.** No `Date.now()` / `Math.random()` / `crypto.randomUUID()` buried in
    logic. Inject a `Clock` and an `IdGenerator` so tests are deterministic and fast.
11. **Fail loud.** Validate at boundaries (Valibot) and throw on misconfiguration/invalid
    state rather than limping on with bad data. No empty `catch {}` that swallows errors.
12. **Strict typing.** `strict` TypeScript, no `any` (use `unknown` + narrowing). Make
    illegal states unrepresentable with the type system where practical.
13. **Test behavior, not implementation.** Assert observable outcomes through the public
    API. Avoid tests coupled to internal structure — they should survive refactors.
14. **Immutability & pure functions** where reasonable. Prefer returning new values over
    mutating arguments; isolate side effects.
15. **Comments explain _why_.** The code shows _what_. Comment intent, trade-offs, and
    non-obvious constraints — not the obvious.
16. **YAGNI.** Build what the current milestone needs. The specs leave doors open (e.g.
    multi-tenancy) without paying for them now.
17. **Consistency.** Follow existing patterns in the codebase over personal preference.
18. **Automated formatting & linting.** Formatting is not a code-review topic; a tool
    decides it. (Prettier/ESLint to be wired in M0.)
19. **Security by default.** Least privilege, validate all external input, no secrets in
    code or logs, central access-control (§3.7) as the only authorization path.

## 8.3 Ports & Adapters (how DI and encapsulation coexist)

Dependency injection and encapsulation act on **different axes** and reinforce each other
when applied as Ports & Adapters. Misused DI (injecting raw infrastructure everywhere)
*does* break encapsulation — these rules prevent that.

- **Encapsulation** hides a unit's internal state/implementation (its own data stays
  private). **DI** only changes *how a unit obtains its collaborators* — it declares what
  it needs instead of constructing it. Injected collaborators are **not** the unit's
  private data, so encapsulation is untouched.
- **A global singleton (`import { db }`) is _hidden_ coupling, not encapsulation.** It only
  looks clean; the dependency is invisible and untestable. DI makes the same dependency
  **explicit and honest**.
- **The domain owns the interface (the _port_); infrastructure implements it (the
  _adapter_).** Inject the narrow port, never the concrete DB/SQL. The domain must never
  learn it is backed by SQLite.

Layering and single responsibility:

1. **Pure logic** (entities, value objects, rules) takes **no** dependencies — maximum
   encapsulation. Prefer pushing logic here (e.g. `access/visibility.ts`, relationship
   reciprocity, partial-date handling).
2. **Use-cases / services** depend on **ports** the domain defines
   (`ContactRepository`, `Clock`, `IdGenerator`), passed as an explicit `deps` argument.
   They never import a singleton or concrete infrastructure.
3. **Adapters** implement ports over real infrastructure (Drizzle/`bun:sqlite`, system
   clock, ULID).
4. **Composition root** — the SvelteKit edge (`routes/`, `hooks.server.ts`) — is the
   **only** place that constructs concretes and wires them into use-cases.

```ts
// domain/contacts/contact-repository.ts — the DOMAIN owns this port
export interface ContactRepository {
	save(contact: NewContact): Promise<ContactId>;
}

// domain/contacts/create-contact.ts — knows nothing about SQLite
export async function createContact(
	input: CreateContactInput,
	deps: { contacts: ContactRepository; clock: Clock; ids: IdGenerator }
): Promise<ContactId> { /* … */ }

// src/routes/… (composition root) — the only place wiring concretes
const id = await createContact(input, { contacts: drizzleContactRepo(db), clock, ids });
```

**Rules of thumb:** inject DI **only** for side-effect collaborators (I/O, time,
randomness/ids), never for plain values; always inject **narrow, domain-owned ports**;
assemble concretes **only at the edge**.

## 8.4 The TDD loop in practice

```
1. Write a test naming the behavior            (red)
2. Run `bun test` — watch it fail for the right reason
3. Write the least code to pass                (green)
4. Refactor with the test as a safety net      (refactor)
5. Repeat
```

- **Unit tests** (the majority): pure domain logic in `src/lib/server/{domain,access}`,
  run with `bun test`, no I/O, dependencies faked.
- **Integration tests**: domain against a real in-memory SQLite (`new Database(':memory:')`
  + migrations) to verify queries and constraints.
- **End-to-end** (later, M2): a few Playwright flows for critical paths (login, quick-add).

Test files are `*.test.ts`, colocated with the code under test.

## 8.5 What is and isn't unit-tested

- **Unit-tested (test-first, always):** access-control/visibility rules, session lifecycle
  logic, relationship reciprocity & guardrails, partial-date handling, OIDC claim→user
  mapping (group→role, allowlist), feed visibility filtering, input validation.
- **Thin edges (covered by integration/e2e, kept trivial):** SvelteKit `load`/actions,
  `hooks.server.ts`, adapter/config wiring, Svelte components’ markup. These contain no
  branching business logic worth unit-testing; if they grow logic, extract it into the
  domain layer and test it there.

## 8.6 Naming & structure conventions

- Files: `kebab-case.ts`. Types/classes: `PascalCase`. Functions/vars: `camelCase`.
  Constants: `UPPER_SNAKE_CASE` only for true compile-time constants.
- One primary concept per file; keep files small.
- Domain modules expose intention-revealing functions; keep DB/row shapes internal and map
  to domain types at the boundary.
- Errors: throw typed `Error` subclasses with actionable messages; never expose secrets.

## 8.7 Definition of Done

A change is done when:

- The behavior was driven by tests and all tests pass (`bun test`).
- Types check (`bun run check`) and formatting/lint pass.
- Public surface is minimal and documented where non-obvious.
- Access control is enforced through the central layer for any new data access.
- Accessibility basics hold for any UI (keyboard, contrast, labels).
- Relevant docs (this suite) are updated if behavior or model changed.

## 8.8 Dependency policy

- **Exact, pinned versions only.** No `^` or `~` ranges in `package.json` — every
  dependency is a single fixed version.
- **Committed lockfile is authoritative.** `bun.lock` carries the exact resolved tree and
  per-package integrity hashes; it is always committed.
- **Enforced automatically:** `bunfig.toml` (`[install] exact = true`) and `.npmrc`
  (`save-exact=true`) make `bun add` write exact versions.
- **Reproducible installs:** CI and the Docker build use `bun install --frozen-lockfile`,
  which fails on any drift between `package.json` and `bun.lock`.
- **Adding a dependency is deliberate** (principle 7): prefer Bun/Web/standard-library
  APIs; weigh transitive cost before adding.
- **Upgrades are intentional:** bump the exact version on purpose, run `bun test`, and
  commit the resulting `bun.lock` change in the same commit.

## 8.9 Commits & releases

- **Conventional Commits** for every commit message:
  `type(optional-scope): summary`. Common types: `feat`, `fix`, `docs`, `refactor`,
  `test`, `chore`, `build`, `ci`, `perf`, `revert`.
  - Breaking changes: add `!` after the type/scope (`feat!: …`) or a `BREAKING CHANGE:`
    footer.
  - Keep the summary imperative and lower-case; explain the _why_ in the body when useful.
  - Examples: `feat(contacts): add quick-add sheet`, `fix(auth): reject expired sessions`,
    `test(access): cover private-contact visibility`, `docs: expand the explorer spec`.
- **Automated releases with [release-please](https://github.com/googleapis/release-please).**
  It watches the default branch, opens/maintains a release PR that bumps the version in
  `package.json` and updates `CHANGELOG.md` from the commit history, and tags a release when
  that PR is merged. So the commit type drives the version bump:
  - `fix:` → patch, `feat:` → minor, breaking → major (pre-1.0: minor, per config).
  - Non-release types (`docs`, `chore`, `test`, `ci`, …) still appear in the changelog
    where relevant but don't force a release on their own.
- **Practical rule:** write the commit type to match the change's user-facing impact — the
  changelog and version are generated from it, so an accurate type matters.
- Config lives in `release-please-config.json` + `.release-please-manifest.json`; the
  workflow is `.github/workflows/release-please.yml` (GitHub Actions).
