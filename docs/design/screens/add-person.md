## 5.5.4 Add a person

### Intent

Get somebody into Stella fast. A name is enough; everything else can wait for the person's page.
The one thing worth saying while they type is that this person may already be here.

### Rules

- One card: first and last name, description, how and where you met, visibility.
- Nickname and birthday sit behind a *More* disclosure; nothing else is on the form.
- The heading says so: *a name is enough*.
- Once a surname is typed, an **Already in Stella?** box (docs/02 §2.2.1) slides in under the
  name fields: a sunken panel, one line per person — the name as a link, the reason in muted
  text, a *Link as relative* radio on the right.
- The box is absent until there is something to say and never steals focus.
- The form submits exactly as it would without the box.

### Why

Everything but the name waits for the person's page, so adding somebody costs one field. The
*Already in Stella?* box is a hint, not a step: it never takes focus and never changes what the
form submits.
