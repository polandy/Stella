# Concept: removing a member

Status: **decided with the maintainer on 2026-10-10, not built.** Source: docs/06 *Removing a
member*. Mockup: [remove-member.html](remove-member.html). Once all slices are built, the rules
move into docs/02 §2.1, docs/03 and docs/05, and this file is deleted.

---

## 1. What exists today

- **Nobody can be removed, and no screen lists the members.** docs/02 §2.1 says an admin
  "can invite/remove members, change roles", but none of it is built. Settings holds the
  language, *You*, the data checks, API tokens, Data, Immich, Account and About
  (docs/05 `screens/settings.md`). The only reader of the member list is
  `domain/household/members.ts` (`listMembers`), and it serves names: `authorNames` names an
  author in the timeline and on photos, and `membersViewerFirst` fills the stream's *who did
  it* filter (§2.22.2).
- **There are two ways in, and invitations are not one of them.** The first-run setup creates
  the household and its first admin, who has a password and `role_locked = 1`
  (`registerFirstAdmin`). Every later member arrives through SSO: `planLogin`
  (`auth/oidc/login-planner.ts`) uses the identity known by `iss` + `sub`, otherwise links by
  verified email, otherwise provisions just in time, otherwise refuses with `no-account`. The
  `invitation` table exists, but nothing writes or reads it.
- **What hangs off a user** (`schema/household.ts`):
  - `session`, `api_token`, `identity` and `command_receipt` cascade with the user row;
  - `invitation.created_by` references it with no action;
  - everything a member writes carries `created_by` (contact, note, photo, journal_entry,
    interaction, gift, circle, relationship, immich links) or `actor_id` (`activity_log`), each
    a plain reference with no `ON DELETE`. **Deleting a user row is refused** as soon as they
    wrote anything.
- **Who a request is** (`auth/request-identity.ts`): a session cookie or an API token resolves
  to a user id, and `findUser` (`AccountRepository.findById`) turns it into the `AuthUser`. A
  user `findUser` doesn't find signs nobody in, and a page then clears the stale cookie.
- **Private records** are visible to their author alone (docs/02 §2.10, docs/03 §3.7). Admins
  gain nothing on them. Removing an authored record lets an admin remove a **shared** one,
  never a private one.
- **The timeline already copes with an author it doesn't know**: `authorNames` answers `null`
  for an id outside the household's members, and the item names nobody (§2.23).
- **Precedent for an irreversible, household-wide step**: deleting a person (§2.2) is
  admins only, an inline confirm step whose focus starts on *Keep them*, no Undo, and one
  `activity_log` row that links nowhere.

## 2. Decisions

Asked and answered on 2026-10-10:

1. **The account is marked removed, not deleted.** `user.removed_at` is stamped, and the row
   stays, so every `created_by` and `actor_id` keeps pointing at a real author. The removal
   deletes the member's **sessions** and **API tokens** in the same transaction. Their
   **SSO identity stays**: it is what lets Stella recognise them at the next SSO sign-in and
   turn them away, instead of provisioning a fresh, empty account. Their **password hash
   stays** too, never checked while they are removed (asked as a follow-up the same day):
   nothing yet sets a new password, so a cleared hash would lock a restored member out.
2. **Their private records stay sealed.** Nothing about them changes: they were visible to
   their author alone, and that author no longer signs in, so nobody sees them. Admins still
   gain nothing. Restoring the member (slice 2) brings them back as they were. They stay in
   the database and in a backup.
3. **Their name stays.** A note, photo or touchpoint they wrote still says *Nina*, and a
   stream line they caused still reads *Nina added …*. Nothing marks them as gone. They leave
   every list of current members: the stream's *who did it* filter and the Members page's main
   list.
4. **A removal is confirmed and logged, with no Undo toast, and a removed member can be
   restored.** One `activity_log` row tells the household: *Andy removed Nina from the
   household*. The Members page lists removed members under *Former members*, where an admin
   restores one. Restoring is its own slice (slice 2).

Decided without asking. Each is open to a change in the PR:

5. **Who removes whom**: an **admin** removes any **other** member, admin or not. **Nobody
   removes themselves.** That alone keeps one admin in the household: the remover is an
   admin and stays. Leaving a household on one's own is out of scope (§5).
6. **The break-glass admin** (`role_locked = 1`) may be removed like any other admin. The
   household then relies on its remaining admins. If none of them has a password, an SSO
   outage locks the household out until an operator steps in, so the confirm step warns
   about exactly that case (§3).
7. **Shared records stay where they are** and keep the member's name. An admin may already
   remove each one (docs/03 §3.7). Shared people and circles the member created are household
   facts and stay too. Nothing is taken over by anyone.
8. **The member's open invitations** (none can exist yet, §1) are deleted with the removal,
   since an invitation speaks for the household in its author's name. Accepted ones stay as
   the record they are.
9. **Their own settings stay untouched**: `self_contact_id`, language, theme, avatar. A
   restored member finds Stella as they left it.
10. **A password sign-in by a removed member fails like a wrong password.** The login form
    never says whether an email belongs to an account. **An SSO sign-in** has already proven
    who it is, so it gets a clear message: *Your access to this household was removed. Ask
    one of its admins.* Role and profile sync never run for a removed member.
11. **The confirm step counts the member's private records**, without naming any, as the
    circle deletion counts photos the deleter can't see. The count says what stays sealed. It
    reveals that records exist, never what they are.
12. **Members see the Members page too**, without the actions: every member already sees the
    others' names, and the page shows who signs in and how. Only admins see *Remove…* and,
    later, *Restore*.

## 3. The behaviour

### The Members page

- Settings gets a **Household** section after *You*, with one link card: **Members** —
  *Who signs in to Stella, and how*. It opens `/settings/members`.
- The page lists the current members, the signed-in one first and the rest by name. A row
  shows the avatar, the name, a *You* badge on one's own row, the email, an *Admin* pill
  for admins, and how they sign in: *Password*, *Single sign-on* or *Password and single
  sign-on*.
- For an admin, every row except their own ends in a ghost **Remove…** button in danger
  colour, whose accessible name carries the member's name (*Remove Nina…*).
- Under the list, once anyone has been removed: **Former members**, the same rows muted,
  with *removed on 10 Oct 2026* in place of the sign-in method. Slice 1 shows them read-only.
  Slice 2 adds *Restore*.

### Removing

- *Remove…* opens an **inline confirm step** under the row (the sunken box of the person and
  circle deletions, not a modal). It reads:
  - **Remove Nina from the household?**
  - *Nina can no longer sign in. Every device signed in as Nina is signed out now, and
    Nina's API tokens stop working.*
  - *What Nina shared stays, under Nina's name. You can still remove any of it.*
  - when they have private records: *Nina's 14 private records stay sealed: nobody sees them,
    you included.* (*If you restore Nina, they come back.* once slice 2 is built.)
  - when they have an SSO identity: *Nina signs in through single sign-on. Stella turns Nina
    away from now on. To be thorough, also remove Nina from the group in your sign-in
    provider.*
  - when the member is the last admin with a password: *Nina is the only admin who can sign
    in with a password. Without Nina, an outage of your sign-in provider locks everyone out.*
  - the buttons: **Remove Nina** (danger) and **Keep Nina** (ghost, focused).
- The counts come from `memberRemovalPreview(deps, remover, memberId)`, loaded when the step
  opens, like `circleDeletionPreview`.
- **The removal runs in one transaction** (`removeMember(deps, remover, memberId)`):
  1. the remover must be an admin (`NotAdminError`, 403) and not the member
     (`CannotRemoveYourselfError`, 400, with a `Phrase`);
  2. the member is stamped `removed_at` only if they are in the remover's household and not
     removed yet, in the `UPDATE`'s own condition. No row changed → `MemberGoneError`, which
     the action answers with 404, read as done (§2.23: a gone item is never a failure);
  3. the member's sessions, API tokens and open invitations are deleted;
  4. the use-case reports `{ kind: 'member.removed', … }`, written in the same transaction.
- Afterwards the row moves to *Former members*, and a toast says *Nina removed* without
  Undo.
- **The activity row**: `action = 'delete'`, `entity_type = 'member'`, `entity_id` the member,
  `contact_id` null, `visibility` shared, and the facts `{"name":"Nina"}` in `summary`. Home
  says the line in each reader's language: *Andy removed Nina from the household*
  (`noticeContentOf`). It links nowhere.

### Signing in afterwards

- `AccountRepository.findById` and `findCredentialsByEmail` find only current members. A
  session or API token that somehow survived signs nobody in, and a password sign-in fails as
  a wrong password does.
- `planLogin` gets the removed state in its lookups. An identity known by `iss` + `sub`, or an
  email that links to a removed member, plans **`deny`** with the new reason `removed`, before
  any role or profile sync. The login page shows the message from decision 10.
- The removed member's email stays taken (`user.email` is unique). A new SSO account with the
  same email can't be provisioned beside them: the email link finds the removed member and
  refuses. To bring the person back, an admin restores them.

### Names afterwards

- `MemberRepository` reads two lists: `listMembers` (current members, for the *who did it*
  filter and the Members page) and `listAuthors` (current and former, for `authorNames`). A
  former member's work keeps their name everywhere it is shown, and the stream's filter no
  longer offers them.
- A household of one is decided by `listMembers`, so a household whose other members have
  all been removed reads as a household of one again (§2.22.3).

### Restoring (slice 2)

- *Restore* on a former member's row clears `removed_at`, and the member signs in again at
  once, with their old password or through SSO.
- Restoring writes `{ kind: 'member.restored' }`: *Andy restored Nina to the household*.

## 4. Slices

Each slice is test-first and carries its UI, both catalogues (`en`, `de`) and its docs. UI
slices follow the delivery loop: hand test, then the e2e on the same branch.

1. **Removing a member.**
   - Schema: `user.removed_at` (int, null) with its migration.
   - Domain (`domain/household/remove-member.ts`): `memberRemovalPreview` and `removeMember`,
     with tests for each refusal (not an admin, oneself, someone gone or outside the
     household), the counts (private records of every kind, SSO identity, last admin with a
     password), and the events.
   - Auth: `findById` and `findCredentialsByEmail` skip removed members; `planLogin`'s
     `removed` denial and its message (`login-planner.test.ts`, `login.test.ts`).
   - Members: `listMembers` current only, `listAuthors` for `authorNames`.
   - Activity: the `member.removed` event, the row and `noticeContentOf`'s line in both
     languages.
   - Repository: the transaction, tested against SQLite (sessions, tokens and open
     invitations gone; password hash, identity, records and self link kept).
   - UI: the *Household* section in Settings, `/settings/members` with the list, *Remove…*,
     the confirm step, *Former members* read-only, the toast.
   - Docs: docs/02 §2.1 and §2.22 (the stream line), docs/03 `user`, `invitation`,
     `activity_log`, docs/04 §4.4 (removed members sign nobody in), docs/05
     `screens/settings.md`, `using-stella.md`.
   - Seed: a third demo member, *Lukas Brunner*, so the spec removes someone no other spec
     signs in as.
   - E2e: `members.spec.ts`: an admin removes a member, the member's open session lands on
     the login page, Home shows the line, a note by the member still names them; a member
     sees no *Remove…*.
2. **Restoring a member.**
   - Domain: `restoreMember`, with the same refusals and its event.
   - UI: *Restore* on *Former members*, its confirm step, and the confirm step's restore
     sentence from slice 1.
   - Docs: docs/02 §2.1, docs/05 `screens/settings.md`, `using-stella.md`, and the docs/06
     entry removed.
   - E2e: restore the member from slice 1's spec and sign in as them with their password.

## 5. Out of scope

- **Changing a member's role.** docs/02 §2.1 promises it too. It is its own entry, and with
  SSO role sync it has its own questions.
- **Invitations.** The table waits for its feature. Decision 8 is all removal needs.
- **Leaving on one's own** ("Leave this household"): a member who wants out asks an admin.
- **Purging a former member's private records**, for someone who wants them gone for good.
  A later step on the *Former members* row, if it is ever asked for.
- **Deleting an account row for good.** Every authored record would need a new author first.
