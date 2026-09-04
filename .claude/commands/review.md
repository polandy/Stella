Review uncommitted or recently committed changes against project standards:

1. Run `git diff HEAD` (or `git diff HEAD~1` if the working tree is clean) to see the changes.
2. Read `docs/08-coding-guidelines.md` and `CLAUDE.md`'s **Non-negotiables**. **Those files are
   the standard** — check the diff against them rather than against a list restated here, which
   is how a third copy goes stale without anything turning red.
3. Beyond what those files say, check:
   - Test-first: is there a driving test for each new behaviour, and does its *name* say which
     rule would break?
   - Every new data access goes through `src/lib/server/access/`; nothing in `routes/` or
     components touches the DB directly.
   - Domain code (`src/lib/server/{domain,access}`, `src/lib/graph/model`) stays free of
     SvelteKit/`$env`/`$app` imports and takes its collaborators as a `deps` argument.
   - UI uses semantic tokens (`--fg`, `--bg`, `--primary`, …), never `--ctp-*` or hex.
   - Comments explain "why", not "what"; doc-comments on exported symbols.
   - No security issues (OWASP top 10); secrets never reach code or logs.
   - `docs/02` / `docs/03` / `docs/05` updated when behaviour, model or UI changed, and
     `using-stella.md` when the change is visible to a user of the app.
   - The delivery loop (`docs/08` §8.4.1): unit/integration tests come with the change; the
     Playwright e2e only after the owner's OK — and then it asserts rendered content, never
     just the URL, and never waits on a timeout.
   - Conventional Commit type matches the user-facing impact (release-please derives the
     version from it).
4. Report findings concisely: what's good, what needs fixing. If everything is clean, say so
   briefly.

For a pull request rather than a working tree, use the `pr-review` skill instead — it is the
fuller checklist and it posts its verdict.
