# TODO

Open implementation work, in order. A finished item is deleted in the PR that finishes it.

## Photos in a diary entry (owner request 2026-11-13)

Step 1 (adding and removing own photos while editing a moment) is built. Left:

- **Immich photos as a reference, not a copy.** In the moment editor (and the composer), *From
  Immich* stores a reference to the Immich asset and shows it through the existing server-side
  Immich proxy (`/media/immich/[token]`, no key in the browser) instead of copying it — this
  departs from ADR-129's copy for journal photos, so the ADR gets a successor. Removing a
  reference never touches the asset in Immich. Tests: Immich unreachable, asset deleted in
  Immich (a placeholder, not a broken image), a reference the viewer may no longer see.
