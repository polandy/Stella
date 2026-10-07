## 5.5.6 Circles

### Intent

A circle is a group of people the household knows together (docs/02 §2.4.2). The list is where a reader finds one; a circle's page shows who is in it by role, and
its photos, and lets the household manage members in bulk.

### Rules

#### The list

- A find-as-you-type field and kind chips over a grid of **cards**.
- Each card: the circle's cover photo as a flat strip across the top when it has one (80 px,
  filled from the centre, decorative), then the colour dot, name, kind and member count, the
  description, and a stack of the first four faces with *+n* for the rest.
- A query that matches nothing gets the empty state (§5.5.10), not a blank page.

#### A circle's page

- The members stand in **grids** of avatar cards, one per role under a small uppercase heading
  with its count; no headings when nobody has a role.
- *Add member* is the card's one disclosure.
- *Select* in the card header turns each card into a checkbox target, with an *all* box beside
  every role heading, and raises a **selection bar** fixed to the bottom of the screen: the
  count, *Everyone / No one*, a role field with the circle's roles as suggestions and *Apply*,
  and *Remove*.
- Leaving select mode drops the bar and the selection.
- On a phone the bar sits above the bottom tab bar (§5.4) and a step below a toast (§5.7).
- The role field is a **Combobox** (§5.7), not a plain input.
- The header carries *Open in the graph*; the explorer offers *Back to the <name> circle* in
  return (docs/02 §2.7).

#### Photos

- A circle with a cover opens with it as a wide **strip** above the header; a role with a lead
  photo gets the same strip as a **banner** between its heading and its people.
- Strips are about 3:1 on a phone and a fixed height on a wide screen (192 px cover, 144 px
  banner), filled from the centre, with a count badge when the lightbox has more than one photo
  to walk. Each strip is one button.
- Below the members a *Photos* card holds the role chips (the Circles chip style, only with more
  than one group) and a square grid (three columns, five from `sm`) whose tiles carry the role
  and the date on the gradient, a star when pinned and a lock when private.
- *Add photos* is the Photos card's disclosure: the files, *Who is in them?* and *Who can see
  them?* as pill radios, and the submit naming how many photos it adds.
- The lightbox is the person gallery's dialog (§5.9), with a step back and forward for touch,
  the role as a select, *Use as profile picture for …*, and the uploader's actions below a
  dashed rule.
- On a photo people wear, *Make private* and *Remove* first turn that area into a short warning
  — how many people wear it, and that they keep it — with the confirming button and *Cancel*.
- *Use as profile picture for …* opens a dialog: a search field; the members of the photo's
  role under the role's name; the other members under *Others in this circle*; anyone else
  under *Everyone else* once something is typed. Each is a row with the avatar and a check mark
  when they already wear a cut.
- After a cut the dialog says who now wears the photo, with *Next person* (primary) and *Done*.

### Why

The cover strip on a card is decorative because the name already says what the circle is. The
selection bar is fixed rather than in the card so it stays in reach in a long circle, and its
place on a phone means neither it nor a toast ever hides the other. The role field is a Combobox
because a plain input's suggestions do not show on Mobile Safari. *Open in the graph* is the same
way out a person's People card offers (there in its ⋯), because a circle is a node like any
other. Strips have a fixed height on a wide screen so the members stay in view.
