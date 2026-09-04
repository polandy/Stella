# 03 — Data Model

Database: **SQLite** (WAL mode, foreign keys on) accessed via **Drizzle ORM**. This
document is the conceptual schema; the Drizzle definitions in code are the
implementation of record.

## 3.1 Conventions

- **IDs:** text primary keys using a sortable unique id (UUIDv7 or ULID). Sortable ids
  keep inserts local and double as creation-order cursors.
- **Timestamps:** `created_at`, `updated_at` stored as integer Unix epoch (ms), UTC.
  Application layer maintains `updated_at`.
- **Soft delete:** `archived_at` (nullable) where archiving is supported; hard delete
  removes the row and cascades.
- **Visibility:** where present, `visibility` is `'shared' | 'private'` and
  `created_by` references the owning user. These two together drive access control
  (see [02-features.md §2.10](02-features.md#210-privacy-model-shared-vs-private)).
- **Enums** are stored as text with a CHECK constraint (SQLite has no native enum).
- **Booleans** are integers 0/1.
- **Money/none here.**

## 3.2 Entity overview

```
household 1───* user
user      1───* session
user      1───* identity        (federated OIDC logins, e.g. Authelia)
user      1───1 notification_preference   (digest schedule + delivery) [M3]
user      1───* invitation (created_by)

contact   *───1 user            (created_by)
contact   1───* contact_field
contact   1───* note
contact   1───* journal_entry    (per-person diary)      [M2]
contact   1───* interaction
contact   1───* important_date
contact   1───* photo
contact   *───* tag             (contact_tag)
contact   *───* circle          (circle_membership → derived shared-context links)
circle    0───1 circle          (parent_circle_id, optional nesting)
contact   *───* contact         (relationship, via from/to + type)

relationship_type 1───* relationship
interaction   *───* contact     (interaction_participant)
note          *───* contact     (note_mention)          [M2]
journal_entry *───* contact     (journal_mention → passive @-references) [M2]

activity_log *───1 user
activity_log  ───? (entity_type, entity_id)  polymorphic reference
```

## 3.3 Tables

### household
Single row in v1 (one household per deployment), but modeled as a table to keep
multi-tenancy possible later.

| column | type | notes |
|---|---|---|
| id | text pk | |
| name | text | display name of the family/household |
| default_visibility | text | `'shared'` default for the household |
| created_at / updated_at | int | |

### user
A family member with an account.

| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk → household.id | |
| email | text unique | login identifier / linking key |
| name | text | display name |
| password_hash | text null | Argon2id; **null** for SSO-only users |
| role | text | `'admin' \| 'member'` |
| role_locked | int | 0/1; if 1, IdP group-sync will not override the role (protects break-glass admin) |
| avatar_photo_id | text fk → photo.id null | |
| theme_pref | text | `'system' \| 'light' \| 'dark'` |
| accent_pref | text | Catppuccin accent name, e.g. `'mauve'` |
| default_visibility | text | `'shared' \| 'private'` for new records |
| reduced_motion | int | 0/1 |
| totp_secret | text null | [M3] 2FA |
| created_at / updated_at | int | |

### session
Server-side sessions referenced by cookie.

| column | type | notes |
|---|---|---|
| id | text pk | opaque session token id (hashed at rest) |
| user_id | text fk → user.id | cascade delete |
| expires_at | int | |
| created_at | int | |
| user_agent / ip | text null | for the "active sessions" view |

### identity
Links a Stella user to an external OIDC identity (e.g. Authelia). A user may have a local
password, one or more federated identities, or both.

| column | type | notes |
|---|---|---|
| id | text pk | |
| user_id | text fk → user.id | cascade delete |
| provider | text | logical provider name, e.g. `'authelia'` |
| issuer | text | OIDC `iss` claim (validated) |
| subject | text | OIDC `sub` claim (immutable per user) |
| email_at_link | text null | email seen when linked (audit) |
| last_login_at | int null | |
| created_at | int | |

Constraints: unique on `(issuer, subject)`. Login matches an incoming token to a user
via this pair first; email-based linking is a configurable fallback for first login only.

### notification_preference  [M3]
Per-member digest schedule and delivery config (docs/02 §2.11.1). One row per user.

| column | type | notes |
|---|---|---|
| id | text pk | |
| user_id | text fk → user.id | cascade delete; unique |
| frequency | text | `'none' \| 'daily' \| 'weekly' \| 'monthly'` (default `'none'`) |
| email_enabled | int | 0/1 |
| webhook_url | text null | HTTP POST target for the digest JSON |
| webhook_secret | text null | HMAC signing secret for webhook authenticity |
| last_digest_at | int null | end of the last delivered window (idempotency) |
| next_digest_at | int null | when the next digest is due |
| created_at / updated_at | int | |

### invitation
Single-use invite to join the household.

| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk | |
| email | text null | optional pre-fill / restriction |
| role | text | role to grant |
| token_hash | text | hashed invite token |
| created_by | text fk → user.id | |
| expires_at | int | |
| accepted_at | int null | |
| created_at | int | |

### contact
The central person entity.

| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk | |
| created_by | text fk → user.id | owner for privacy |
| visibility | text | `'shared' \| 'private'` |
| first_name | text null | |
| last_name | text null | |
| nickname | text null | |
| prefix / suffix | text null | e.g. Dr., Jr. |
| former_name | text null | maiden/previous |
| display_name | text | computed/entered; required, never empty |
| gender | text null | free-form or preset |
| pronouns | text null | |
| description | text null | one-liner |
| avatar_photo_id | text fk → photo.id null | |
| birth_date | text null | ISO date; see 3.4 partial dates |
| birth_date_precision | text | `'full' \| 'month_day' \| 'year' \| 'age'` |
| is_deceased | int | 0/1 |
| death_date | text null | |
| job_title | text null | |
| company | text null | |
| how_we_met | text null | free text |
| met_date | text null | |
| met_place | text null | |
| archived_at | int null | |
| created_at / updated_at | int | |

FTS: `first_name, last_name, nickname, display_name, description, how_we_met` are
indexed in an FTS5 table (see 3.5).

### contact_field
Repeatable contact methods.

| column | type | notes |
|---|---|---|
| id | text pk | |
| contact_id | text fk → contact.id | cascade delete |
| kind | text | `'phone' \| 'email' \| 'address' \| 'url' \| 'social' \| 'date' \| 'custom'` |
| label | text null | "Home", "Work", "WhatsApp" |
| value | text | primary value (for address: formatted single line) |
| meta | text null | JSON: structured parts (address components, social network, etc.) |
| sort_order | int | |
| created_at / updated_at | int | |

### relationship_type
Defines a directional, reciprocal relationship kind.

| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk null | null = built-in/global; set = custom [M2] |
| key | text | stable machine key, e.g. `'parent_child'` |
| forward_label | text | shown on the "from" side, e.g. "Parent of" |
| reverse_label | text | shown on the "to" side, e.g. "Child of" |
| category | text | `'family' \| 'romantic' \| 'social' \| 'professional' \| 'other'` |
| symmetric | int | 0/1 (partner/sibling/friend = 1) |
| sort_order | int | |

**Built-in seed set.** Shipped with `household_id = NULL`; a household may add custom
types [M2]. `sym` = symmetric (one label, same both ways). Non-symmetric types are
stored once and rendered from whichever side you view. The relationship's free-text
`note` carries the specifics ("second cousin", "manager at Acme").

| key | category | forward label | reverse label | sym |
|---|---|---|---|---|
| `parent_child` | family | Parent of | Child of | — |
| `grandparent_grandchild` | family | Grandparent of | Grandchild of | — |
| `sibling` | family | Sibling of | — | ✓ |
| `pibling_nibling` | family | Aunt / Uncle of | Niece / Nephew of | — |
| `cousin` | family | Cousin of | — | ✓ |
| `step_parent_child` | family | Step-parent of | Step-child of | — |
| `guardian_ward` | family | Guardian of | Ward of | — |
| `godparent_godchild` | family | Godparent of | Godchild of | — |
| `in_law` | family | In-law of | — | ✓ |
| `spouse` | romantic | Spouse of | — | ✓ |
| `partner` | romantic | Partner of | — | ✓ |
| `ex_partner` | romantic | Ex-partner of | — | ✓ |
| `friend` | social | Friend of | — | ✓ |
| `neighbor` | social | Neighbor of | — | ✓ |
| `roommate` | social | Roommate of | — | ✓ |
| `acquaintance` | social | Acquaintance of | — | ✓ |
| `colleague` | professional | Colleague of | — | ✓ |
| `manager_report` | professional | Manager of | Reports to | — |
| `mentor_mentee` | professional | Mentor of | Mentee of | — |
| `teacher_student` | professional | Teacher of | Student of | — |
| `business_partner` | professional | Business partner of | — | ✓ |
| `client_provider` | professional | Client of | Provider to | — |
| `knows` | other | Knows | — | ✓ |
| `other` | other | Connected to | — | ✓ |

The **Add person** flow surfaces the common family types as one-tap shortcuts
(mother, father, sister, brother, child, partner); **Other** opens a picker over the
full set above, grouped by `category`. See `docs/02-features.md` §2.4.

### relationship
An instance connecting two contacts.

| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk | |
| from_contact_id | text fk → contact.id | cascade delete |
| to_contact_id | text fk → contact.id | cascade delete |
| type_id | text fk → relationship_type.id | |
| description | text null | free-text: how these two connect (see §2.4). Column name `note`. |
| since_date | text null | [M2] |
| status | text null | e.g. `'current' \| 'former'` [M2] |
| created_by | text fk → user.id | |
| created_at / updated_at | int | |

Constraints: `from != to`; unique on `(from_contact_id, to_contact_id, type_id)`.
Direction is stored canonically for asymmetric types (from = forward-label side).
Visibility is **derived** from the two endpoints (see 2.10), not stored.

**Reciprocity is implicit — never a second row.** A relationship is stored once and
rendered from whichever contact you view: the `forward_label` on the `from` side, the
`reverse_label` on the `to` side. Adding "Julia is Anna's mother" therefore makes Anna
appear as Julia's child automatically; the app must not create an inverse row.

### note
| column | type | notes |
|---|---|---|
| id | text pk | |
| contact_id | text fk → contact.id | cascade delete |
| created_by | text fk → user.id | |
| visibility | text | `'shared' \| 'private'` |
| title | text null | |
| body | text | Markdown |
| is_pinned | int | 0/1 |
| created_at / updated_at | int | |

FTS: `title, body` indexed (3.5).

### note_mention  [M2]
| column | type | notes |
|---|---|---|
| note_id | text fk → note.id | cascade |
| contact_id | text fk → contact.id | cascade |
| pk (note_id, contact_id) | | |

### journal_entry  [M2]
Per-person diary (§2.20). Distinct from `note`: a note is a reference fact, a journal entry
is a dated diary moment. Child record of a contact; visibility per §3.7.

| column | type | notes |
|---|---|---|
| id | text pk | |
| contact_id | text fk → contact.id | cascade delete |
| created_by | text fk → user.id | the author |
| visibility | text | `'shared' \| 'private'` (private ⇒ only the author) |
| entry_date | text | ISO `YYYY-MM-DD`; the day the entry is *about* |
| title | text null | |
| body | text | Markdown |
| created_at / updated_at | int | |

Unique `(contact_id, created_by, entry_date, visibility)` — one shared and one private entry
per author per contact per day; re-saving a slot edits it. Photos attach via `photo` (§2.14).

### journal_mention  [M2]
A person referenced from a journal entry via an `@`-mention (§2.20.1). Powers the reverse
"Mentioned in" list on the referenced person — the *passive* side of the reference.

| column | type | notes |
|---|---|---|
| journal_entry_id | text fk → journal_entry.id | cascade delete |
| contact_id | text fk → contact.id | cascade delete — the **referenced** person |
| pk (journal_entry_id, contact_id) | | at most one link per (entry, person) |

Indexed on `contact_id` for the reverse lookup. The **source** person (whose journal) and the
**author** are read from the parent `journal_entry`, so they are not duplicated here. A
self-reference (`contact_id` = the entry's own `contact_id`) is **not** stored. Mirrors
`note_mention`; both should be produced by one shared mention parser/resolver (§2.20.1).

### interaction  [M2]
| column | type | notes |
|---|---|---|
| id | text pk | |
| contact_id | text fk → contact.id | the "subject" contact |
| created_by | text fk → user.id | |
| visibility | text | `'shared' \| 'private'` |
| kind | text | `'met' \| 'call' \| 'video' \| 'message' \| 'letter' \| 'gift' \| 'other'` |
| title | text null | |
| description | text null | |
| happened_at | text | ISO date `YYYY-MM-DD` — the day it happened; the timeline orders by it, then `created_at` |
| created_at / updated_at | int | |

### interaction_participant  [M2]
| column | type | notes |
|---|---|---|
| interaction_id | text fk | cascade |
| contact_id | text fk | cascade |
| pk (interaction_id, contact_id) | | |

### important_date  [M2]
| column | type | notes |
|---|---|---|
| id | text pk | |
| contact_id | text fk → contact.id | cascade |
| kind | text | `'birthday' \| 'anniversary' \| 'custom'` |
| label | text null | for custom |
| date | text | ISO date; year optional |
| recurs_yearly | int | 0/1 |
| remind | int | 0/1 |
| created_at / updated_at | int | |

Birthdays are **derived** from `contact.birth_date`, never duplicated as a row. An explicit
`important_date` of kind `birthday` **overrides** the derived one for that contact — which
is how a birthday is corrected without touching the profile, and how it is muted (an
explicit row with `remind = 0`). See docs/02 §2.13.

### photo
| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk | |
| contact_id | text fk → contact.id null | null = general/shared moment |
| created_by | text fk → user.id | |
| visibility | text | `'shared' \| 'private'` |
| file_path | text | path within media volume (original, sanitized) |
| thumb_path | text | generated thumbnail path |
| mime | text | |
| width / height | int | |
| size_bytes | int | |
| caption | text null | |
| taken_at | text null | from EXIF if kept |
| sort_order | int | |
| created_at | int | |

Note: `user.avatar_photo_id` and `contact.avatar_photo_id` reference this table.

### tag
| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk | |
| name | text | unique per household (case-insensitive) |
| color | text | Catppuccin accent name |
| created_at / updated_at | int | |

### contact_tag
| column | type | notes |
|---|---|---|
| contact_id | text fk | cascade |
| tag_id | text fk | cascade |
| pk (contact_id, tag_id) | | |

### circle  [M2]
A named context/group that connects people (class, course, club, team, workplace,
friend group). See [02-features.md §2.4.2](02-features.md).

| column | type | notes |
|---|---|---|
| id | text pk | |
| household_id | text fk → household.id | cascade delete |
| created_by | text fk → user.id | owner for privacy |
| visibility | text | `'shared' \| 'private'` |
| name | text | |
| description | text null | |
| kind | text | `'friends' \| 'family' \| 'school' \| 'class' \| 'course' \| 'club' \| 'team' \| 'work' \| 'neighborhood' \| 'other'` |
| color | text | Catppuccin accent name |
| parent_circle_id | text fk → circle.id null | optional nesting (School › Class) |
| start_date | text null | the context's own period, e.g. school year |
| end_date | text null | |
| archived_at | int null | |
| created_at / updated_at | int | |

### circle_membership  [M2]
A contact's time-bounded membership in a circle. The same two contacts sharing a circle
is what yields a **derived shared-context connection** (not stored as an edge).

| column | type | notes |
|---|---|---|
| id | text pk | |
| circle_id | text fk → circle.id | cascade delete |
| contact_id | text fk → contact.id | cascade delete |
| role | text null | e.g. `student`, `teacher`, `coach`, `member`, `captain` |
| start_date | text null | when the contact joined (null = unknown) |
| end_date | text null | when the contact left (null = ongoing) |
| note | text null | |
| created_by | text fk → user.id | |
| created_at / updated_at | int | |

No uniqueness on `(circle_id, contact_id)` — a contact may have multiple membership
periods in the same circle (left and rejoined). Indexed on `circle_id` and `contact_id`.

### activity_log  [M2]
Feeds the "What's new" household feed and the "last edited by" trails.

| column | type | notes |
|---|---|---|
| id | text pk | sortable id doubles as feed cursor |
| household_id | text fk | |
| actor_id | text fk → user.id | who did it |
| action | text | `'create' \| 'update' \| 'delete' \| 'archive' \| 'merge'` |
| entity_type | text | `'contact' \| 'note' \| 'relationship' \| 'photo' \| 'interaction' \| ...` |
| entity_id | text | polymorphic (no FK; entity may be deleted) |
| contact_id | text null | the contact this change is "about", for grouping/links |
| visibility | text | mirrors the affected record's visibility at write time |
| summary | text | short human-readable description, precomputed |
| created_at | int | |

The feed query filters `visibility='shared' OR actor_id = :viewer` and excludes items
whose subject contact the viewer cannot see.

## 3.4 Partial & fuzzy dates

People often don't know a full birthdate. We store the ISO string plus a **precision**:

- `full` — `1990-04-23`
- `month_day` — `--04-23` (birthday known, year unknown)
- `year` — `1990`
- `age` — store an approximate birth year derived from an entered age at a known point;
  flagged as estimate.

The UI renders accordingly (e.g. age hidden when only month/day known). Reminders use
`month_day`/`full`.

## 3.5 Full-text search (FTS5)

- Two FTS5 virtual tables: `contact_fts` and `note_fts` (contentless / external-content
  linked to base tables), kept in sync via triggers on insert/update/delete.
- Query layer unions results, applies visibility filtering **after** the FTS match, and
  returns snippets with highlight.
- Tokenizer: `unicode61` with diacritics folding (so "Jose" matches "José").

## 3.6 Seed data

On first run, seed the built-in `relationship_type` rows (household_id NULL) and, once
the household exists, no per-household copy is needed unless customized. A small set of
starter tags may be offered but not forced.

## 3.7 Access-control rules (summary)

A viewer `u` may read a record `r` iff:

1. `r.visibility = 'shared'` **and** `r`'s subject contact (itself or its parent
   contact) is visible to `u`; **or**
2. `r.created_by = u.id` (owner always sees their own).

Contact visibility is the root: a `private` contact is visible only to its creator; a
`shared` contact is visible to the whole household. Child records (`note`, `photo`,
`interaction`) additionally hide when they are `private` and not owned by `u`, even on a
shared contact. Relationships require **both** endpoints visible. A **circle** follows the
same contact-like rule (shared to the household, or private to its owner); a
**circle_membership** — and any derived shared-context link — is visible only when both
its circle and the member contact are visible. A **journal_mention** (and the passive
"Mentioned in" item it drives) is visible only when its parent `journal_entry` is visible to
the viewer (child-record rule — a private entry ⇒ only its author) **and** the referenced
contact is visible; a **shared** entry may reference only household-visible contacts, so a
mention never widens access nor reveals a `private` contact's existence. Admins gain no special
access to `private` records.

These rules are enforced centrally in the data-access layer (see
[04-architecture.md](04-architecture.md)), never ad hoc in UI code.
