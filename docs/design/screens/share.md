## 5.5.15 Share sheet

### Intent

A member in another app — the gallery, the browser, a chat — has something worth keeping about
somebody and wants it in Stella in two taps, without opening the person first and without
caring whether home can be reached right now.

### Rules

- **`/share`**, opened by the system *Share* menu (docs/02 §2.18.3). One column, phone first,
  `max-w-xl`. Mockup: https://claude.ai/artifact/SCWyk1NLXCiA9b2ia3j4zQ
- The header: a ghost close button (the remove icon, *Close without saving*) and the title
  *Share to Stella*. Closing forgets the share and opens Home.
- Out of reach, a dashed `bg-card` line with the offline icon above everything says saving still
  works and waits on the phone, as on the other offline pages.
- **What came** (`SharedPreview`, `bg-card`, `shadow-card`): photos as a row of thumbnails with
  the count, and how many were left out past ten; words and a link as one card — the link
  icon, the words in `--fg` (two lines at most), the address under it in `--fg-muted`.
- **About whom?** (`SharePersonPicker`): the search field first, then a four-column grid of
  44 px avatars with the first name, the picked one ringed in `--primary`. Without a search the
  grid shows *Recently viewed*: up to eight. A search shows up to 24 matches, or *Nobody by
  that name.*
- **As** (`ShareTargetPicker`): a radio row per choice, its icon, name and a hint in
  `--fg-muted`. A choice that cannot be used now stays in the list, dimmed and disabled, its
  hint replaced by the reason (*Only with a single photo*, *Needs a connection*), so the
  member learns it exists. The first usable choice is preselected: the gallery for photos,
  the moment for words.
- **The fields** (`ShareFields`) belong to the choice: the moment's text in the serif of the
  composer, prefilled with the words and the link; the gift idea's title and link; the to-do's
  line with *The link is added at the end.* The profile photo has only a hint that the crop
  comes next. Every choice but the profile photo ends with the shared/private radios.
- One primary button across the width: *Save*, or *Save for later* out of reach. Without a
  person it is disabled and a line above it says *Pick who it is about first.* A refusal shows
  above the button, the sheet stays.
- After saving, the person's page with the toast (*Moment saved*, *Saved for later*, …); no undo
  in the toast — the entry is removed where it landed.

### Why

The person comes before the kind because that is the decision the member arrived with; the
kind is usually obvious from what was shared, so it is preselected. *Recently viewed on this
device* is the best guess of whom a share is about — one usually shares right after looking a
person up — and the household's last-written-about fills the rest without a setting. The
disabled choice with its reason is kept rather than hidden, so a single photo shared next time
does not seem to grow a new option out of nowhere. Saving through the outbox makes the train
case the same as the home case: nothing on the sheet depends on the connection except the
profile photo, which is a change and says so.
