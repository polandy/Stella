# Monica → Stella mapping

What the Monica import (docs/02 §2.16) does with each record of a Monica 4.x export. The code
is `src/lib/server/domain/import/monica/`; this table is the human-readable contract and
changes with it.

Monica offers **two** exports and Stella reads both, working out which one a file is from the
file itself. A **vCard** is accepted through the same wizard and is described at the end of
this file; the table below is about Monica. They carry the same household but not the same shape, so read the table below as
being about Monica's *records* — the SQL column names are named where they differ:

| | SQL dump (`mariadb-dump`) | JSON export (*Settings → Export data*) |
|---|---|---|
| Shape | tables and rows | one document: records with `properties`, children in `{count, type, values}` buckets |
| A record's key | auto-increment number | `uuid` |
| Pictures | named; the files stay in Monica's storage folder | embedded in the file as `data:` URLs |
| Deleted people | present, with `deleted_at`; left out and counted | not in the file at all |
| Relationship types | a table, with the reverse wording | only the forward name, on each link |
| "How you met" / where | present | **not exported by Monica**; the import says so |

Every imported row gets a **stable source id** of the form `<source>:<what>:<key>` — `monica:`
for either Monica export, `vcard:` for a vCard — so
importing the same export again inserts nothing new. The id is Monica's own key, which the two
formats spell differently — so importing *both* exports of the same Monica into one household
writes everything twice. Pick one format and stay with it. Everything is attributed to the importing
member and gets the visibility chosen in the wizard. The ids assume **one household per
deployment** (docs/03 §household): two households importing two Monicas into one database
would collide on them — scope the ids by household before multi-tenancy (docs/06).

## People

| Monica | Stella |
|---|---|
| `contacts` (not `deleted_at`) | `contact` — `first_name` + `middle_name` → `first_name`; `last_name`; `nickname`; `description`; `job` → `job_title`; `company`; `is_dead` → `is_deceased` |
| `contacts.deleted_at` set | left out, counted in the report |
| `contacts.is_partial` (name-only placeholders) | imported like any other person |
| `genders.type` `M` / `F` / `O` | `gender` `male` / `female` / empty |
| `special_dates` via `birthday_special_date_id` | `birth_date`: full day → `full`; `is_year_unknown` → `--MM-DD`, `month_day`; `is_age_based` → the year only, `age` ("born around 2016", never a birthday) |
| `special_dates` via `deceased_special_date_id` | `death_date` |
| `special_dates` via `first_met_special_date_id`, `first_met_where`, `first_met_additional_info`, `first_met_through_contact_id` | `met_date`, `met_place`, `how_we_met` ("… (through Name)") |
| `contacts.avatar_photo_id` (when `avatar_source = photo`) | that photo becomes the avatar |

## Relationships

Monica stores every link twice (one row per direction, each with its own type name).
Stella stores one row whose type carries both labels, so mirrored pairs collapse to one.

| Monica type name | Stella type |
|---|---|
| `partner`, `spouse`, `sibling`, `friend`, `colleague` | the built-in of the same name |
| `parent` / `child` | built-in `parent_child` (parent on the forward side) |
| `grandparent` / `grandchild` | built-in `grandparent_grandchild` |
| `mentor` / `protege` | built-in `mentor_mentee` |
| `cousin` | custom *Cousin of* (family, symmetric) |
| `uncle` / `nephew` | custom *Uncle/aunt of* / *Nephew/niece of* (family) |
| `godfather` / `godson` | custom *Godparent of* / *Godchild of* (family) |
| `stepparent` / `stepchild` | custom *Step-parent of* / *Step-child of* (family) |
| `bestfriend` | custom *Best friend of* (social, symmetric) |
| `boss` / `subordinate` | custom *Boss of* / *Reports to* (professional) |
| `date`, `lover`, `ex`, `ex_husband` | custom *Dating*, *Lover of*, *Ex of*, *Ex-spouse of* (romantic, symmetric) |
| `inlovewith` / `lovedby` | custom *In love with* / *Loved by* (romantic) |
| any user-defined name | custom symmetric type named after it (category *other*), with a warning |

Custom types are created once per household (`monica:reltype:<key>`) and only when used.
A relationship whose end is a deleted contact is left out and reported.

## Fields, notes and the rest

| Monica | Stella |
|---|---|
| `contact_fields` of type `email` / `phone` | `contact_field` `email` / `phone` |
| a field type of `url` (a vCard's `URL`; Monica has no such type) | `contact_field` `url`, value kept as written |
| `contact_fields` whose type has an `http…` protocol (WhatsApp, Telegram, …) | `contact_field` `url` labelled with the type name, value = protocol + data |
| other `contact_fields` | `contact_field` `custom` labelled with the type name |
| `addresses` + `places` | `contact_field` `address`: "street, postal city, province, country" |
| `notes` | `note`; `is_favorited` → pinned |
| `gifts` | `note` titled *Gift*: "🎁 **name** — status, date", comment and URL below |
| `life_events` | `note` titled *Life event*: "📅 **name** (type) — date", note below |
| `pets` | `note` titled *Pet*: "🐾 **name**, category" |
| `activities` + `activity_contact` | `interaction` of kind `met` on the first linked person, the others as participants; summary → title, description + "(Monica activity: type)" |
| `tags` + `contact_tag` | `tag` (reused by name if the household already has it) + assignments |
| `photos` + `contact_photo` | `photo` on the person; the picture is stored in the wizard's photo step — picked out of Monica's folder for a dump, fetched back out of the file for a JSON export |
| `reminders` for birthdays / deaths / first met | left out — Stella derives them (docs/02 §2.13) |
| `entries` (free journal entries not attached to a person) | left out and named in the report |
| `users` beyond the first | counted in a warning; everything is attributed to the importer |

Not read at all: Monica's `conversations`, `calls`, `tasks`, `debts`, `documents`, audit
logs, API keys and settings. From a JSON export, the rated-day journal rows (`type: "day"`)
are left alongside the written entries the same way. If your Monica has data there, say so — the report will not
mention them.

## vCard

A vCard (RFC 6350 for 4.0, RFC 2426 for 3.0) is contacts only, so it fills the same mapping
sparsely. `src/lib/server/domain/import/vcard.ts` reads it; unknown properties are ignored.

| vCard | Stella |
|---|---|
| `UID` | the record's key; `urn:uuid:` stripped. A card without one — or with one that could not survive a URL, since the id ends up in `/contacts/<id>` — is keyed by a fingerprint of its own contents, so the same card imported from two files is one person and two different cards never collide |
| `FN`, `N` | display name, given / additional / family name — `FN` alone when there is no `N` |
| `NICKNAME` | nickname (the first, if the card lists several) |
| `BDAY` | birth date; `--MMDD` becomes a birthday whose year is unknown; free text is ignored |
| `GENDER` | `M` / `F` mapped as Monica's codes are; anything else left empty |
| `ORG`, `TITLE` | company (first component) and job title |
| `EMAIL`, `TEL`, `URL` | `contact_field` `email` / `phone` / `url` |
| `ADR` | `contact_field` `address`, labelled with its `TYPE` |
| `NOTE` | `note` |
| `CATEGORIES` | `tag`, shared across every card that names it; keyed by the name, so two address books never swap each other's tags |
| `PHOTO` with `ENCODING=b` or a `data:` URL | `photo`, and the person's avatar |
| `PHOTO` that is only a URI | left out — the picture is not in the file |
| `RELATED`, and everything else | not read; the report says a vCard carries no relationships |

vCard 2.1's `ENCODING=QUOTED-PRINTABLE` is decoded, soft line breaks included, so a name like
`Ren=C3=A9` arrives as *René* rather than as itself.

A card with neither `FN` nor `N` is refused rather than imported as a nameless person, and so
is a file with no `BEGIN:VCARD` or a card that is never closed.
