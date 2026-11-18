## 5.5.20 Who has it?

### Intent

A member who noted one idea for several children follows it up from any one of them: who has
it, who still waits and for which day, and the few things done to all of them at once
(docs/dev/02 §2.25.11). Mockup: https://claude.ai/artifact/B4yqCiMfPD7nwQKS3iSa7m

### Rules

- **Way in**: *also for Ben and Lea ›* under the gift's line on the Gifts card (`GiftRow`, the
  names by `Intl.ListFormat`), on ideas, given and received gifts alike.
- **`GiftGroupPanel`** is a `<dialog>`: a bottom sheet on a phone (`rounded-t-app`, `mt-auto`),
  centred from `md`. Header: the title, ✎ *Change*, **⋯** (*Dissolve*, *Remove the open ones*
  in `text-danger`), close. Under it in `text-fg-muted`: the time as noted · visibility ·
  *noted by*.
- **Rows** (`GiftGroupMember`): `Avatar`, name, then the status — given in `text-success-text`
  with a tick, else *bought ·* and the `WhenChip`, with *own time* / *own title* tags on
  `bg-bg-sunken`. *Mark as given…* opens `GiftGiveForm` in the row; a **⋯** at the right end.
  Given rows first, then the open ones soonest first (`panelOrder`). A row on its way out under
  *Undo* is hidden until the window closes.
- **Footer**: *+ Person* and *Bought for everyone (n)*, disabled when no idea is open.
- *+ Person* and ✎ swap the list for a form in the same panel (`GiftGroupAdd`,
  `GiftGroupEdit`), *Cancel* returning to it. The edit form previews a changed time per open
  idea; its scope radios (*for every open one* / *only for Mia*) sit at the right end.
- A menu item closes its menu from the submit handler, once the form has been read.

### Why

- **In the card's own page, not a page of its own**: the follow-up is a glance and one tap,
  started from the person in front of you (D7).
- **Given first**: what is settled reads as the story; the open rows below are the to-do.
- **Change for one** lives in the same form as change for all: the member decides the scope
  where the edit is made, not by finding the other card.
