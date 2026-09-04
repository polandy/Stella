# Monica → Stella mapping

What the Monica import (docs/02 §2.16) does with each table of a Monica 4.x database dump.
The code is `src/lib/server/domain/import/monica/`; this table is the human-readable
contract and changes with it.

Every imported row gets a **stable source id** of the form `monica:<what>:<monica id>`, so
importing the same dump again inserts nothing new. Everything is attributed to the importing
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
| `contact_fields` whose type has an `http…` protocol (WhatsApp, Telegram, …) | `contact_field` `url` labelled with the type name, value = protocol + data |
| other `contact_fields` | `contact_field` `custom` labelled with the type name |
| `addresses` + `places` | `contact_field` `address`: "street, postal city, province, country" |
| `notes` | `note`; `is_favorited` → pinned |
| `gifts` | `note` titled *Gift*: "🎁 **name** — status, date", comment and URL below |
| `life_events` | `note` titled *Life event*: "📅 **name** (type) — date", note below |
| `pets` | `note` titled *Pet*: "🐾 **name**, category" |
| `activities` + `activity_contact` | `interaction` of kind `met` on the first linked person, the others as participants; summary → title, description + "(Monica activity: type)" |
| `tags` + `contact_tag` | `tag` (reused by name if the household already has it) + assignments |
| `photos` + `contact_photo` | `photo` on the person; the file is uploaded in the wizard's photo step |
| `reminders` for birthdays / deaths / first met | left out — Stella derives them (docs/02 §2.13) |
| `entries` (free journal entries not attached to a person) | left out and named in the report |
| `users` beyond the first | counted in a warning; everything is attributed to the importer |

Not read at all: Monica's `conversations`, `calls`, `tasks`, `debts`, `documents`, audit
logs, API keys and settings. If your Monica has data there, say so — the report will not
mention them.
