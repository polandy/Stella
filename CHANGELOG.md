# Changelog

## [0.0.2](https://github.com/polandy/Stella/compare/v0.0.1...v0.0.2) (2026-09-05)


### Features

* add access control, sessions, local + OIDC/Authelia auth, and app shell ([bc05c79](https://github.com/polandy/Stella/commit/bc05c79bba4994fadf5b699ab45ca2bc2b6fcfe3))
* **app:** undo for every removal, and a Saved toast ([f2cf8c2](https://github.com/polandy/Stella/commit/f2cf8c26b7d6c4bcafe93c81e29c729568a04340))
* **auth:** one-click demo sign-in on the login page while SEED_DEMO is on ([129ea65](https://github.com/polandy/Stella/commit/129ea6561c7214f2e024d8f5c09e9cacdcbff6a0))
* **avatars:** contact avatars with browser-side image processing ([ce60ace](https://github.com/polandy/Stella/commit/ce60ace91313bcf0855c840ced3e2a01d62fe901))
* **brand:** add Stella logo, favicon and Logo component ([b919ccc](https://github.com/polandy/Stella/commit/b919ccc102d635e17dd6dd292da934ab00823537))
* **circles:** find as you type and filter by kind ([1cb981a](https://github.com/polandy/Stella/commit/1cb981a9e90a3752418b580c3ac0026105181484))
* **circles:** shared contexts with members, colours, and profile join ([66e670c](https://github.com/polandy/Stella/commit/66e670cf27709b983cd479cd393f28b7f2d633b0))
* **contact-fields:** add repeatable contact methods with quick-action links ([2522491](https://github.com/polandy/Stella/commit/25224913b10f999926cc0f7748bdec53dd44d2e8))
* **contacts:** add quick-add, list, and visibility-scoped profile ([4866ce4](https://github.com/polandy/Stella/commit/4866ce468b7081d0a2b495a6ebc89028881cbdff))
* **contacts:** duplicate and relative suggestions in quick-add ([5bcb962](https://github.com/polandy/Stella/commit/5bcb962d347579163d33b29bf3691ede82d0b013))
* **contacts:** edit the name and description in place ([a75ee11](https://github.com/polandy/Stella/commit/a75ee1136dd62bac014c55f370fac164f7c52d1f))
* **contacts:** one story per person, and a page that reads like one ([7d464b8](https://github.com/polandy/Stella/commit/7d464b85f616ef2b750498eab230e76a6d9dafd1))
* **contacts:** relationship-first person page — ego-graph + inline journal ([c3e4846](https://github.com/polandy/Stella/commit/c3e484615c6e2531c39424e7ab53f8ae9ce67702))
* **dashboard:** personal home composing recent household life ([13fb739](https://github.com/polandy/Stella/commit/13fb739533f244f2b2a00e8277bed3c49e5b303a))
* **dates:** important dates with a "Coming up" band on Home ([a644844](https://github.com/polandy/Stella/commit/a64484451944f39ff52611e0e4fcbe19a3f684e9))
* **design:** avatar nodes, circle cards, a split sign-in, empty states and the story in the demo ([07b7093](https://github.com/polandy/Stella/commit/07b7093527a97f5f0b319a72b03ea60d6d886d65))
* **design:** typography, surface tokens and one icon set ([f3c3b9c](https://github.com/polandy/Stella/commit/f3c3b9c7f5ecb838964a0de6532b1d1c8faab875))
* **dev:** seed a Swiss-family demo dataset on startup behind SEED_DEMO ([2585df5](https://github.com/polandy/Stella/commit/2585df557fe9a953bfbb412c800e6ab66928c16f))
* **graph:** add access-scoped Drizzle GraphDataSource adapter ([4d1b2a4](https://github.com/polandy/Stella/commit/4d1b2a4b57df57cbe7f1409fa84396703c67cec0))
* **graph:** add explorer route with lazy-loaded Cytoscape renderer ([2da5b15](https://github.com/polandy/Stella/commit/2da5b15f22bd24929e65ef7e079fd166939774e4))
* **graph:** add pure relationship & context explorer domain ([ba0f8d6](https://github.com/polandy/Stella/commit/ba0f8d657c44d759a18dcae92f7b250bafc77343))
* **graph:** surface circles and memberships in the explorer ([889ecd0](https://github.com/polandy/Stella/commit/889ecd013f7eebc1c8591391d5ec326e5612dc16))
* **home:** a rail beside the stream, a People directory, and a ⌘K palette ([9880c07](https://github.com/polandy/Stella/commit/9880c075b89edc7b6c6e4dfbf85dc78e02ad5843))
* **import:** guided migration from a Monica database dump ([39f90e9](https://github.com/polandy/Stella/commit/39f90e914ac55c3d750947c8dc762434a8c83a50))
* **interactions:** timeline and "last contacted" on the person page ([7db56f7](https://github.com/polandy/Stella/commit/7db56f722f27561d7f412cf87baf1a5f161d7fa8))
* **journal:** per-person diary with Markdown entries and a daily timeline ([9dcf10c](https://github.com/polandy/Stella/commit/9dcf10c27f0e47ca4a86501bfd85a5714ab933ae))
* **journal:** photos in entries, processed in the browser ([de49d6e](https://github.com/polandy/Stella/commit/de49d6ee049cdfa3feb6cd529a6997856ef54952))
* **journal:** resolve, store and render @-mentions of people ([dc40b37](https://github.com/polandy/Stella/commit/dc40b377cb822a6d41f17486587b7e1c094a92c2))
* **mentions:** shared @-mention parser/resolver for notes and journal ([03b7d6c](https://github.com/polandy/Stella/commit/03b7d6ca79b2aa5890b8cd74e64669e45500f72d))
* **moments:** one-sentence capture on Home and the household stream ([6c1ab9b](https://github.com/polandy/Stella/commit/6c1ab9b192712c3ed09c787d221296eafaf2ffb8))
* **notes:** add Markdown notes with pinning and per-note visibility ([931be15](https://github.com/polandy/Stella/commit/931be155c6455f50d1db55cb83a59ecc8fcf829a))
* **relationships:** add typed, reciprocal relationships with built-in types ([d5bb36f](https://github.com/polandy/Stella/commit/d5bb36f86fa88450906736b27bab5ce9f06b39d9))
* **relationships:** derived kinship and propagation suggestions ([9515ca0](https://github.com/polandy/Stella/commit/9515ca00d22dbc243547100e21b55a48c028488b))
* **search:** add full-text search over contacts and notes (FTS5) ([7bb6baf](https://github.com/polandy/Stella/commit/7bb6bafae3f585927efd0d72f66cf24e036f344d))
* **story:** name who wrote each item ([ff63624](https://github.com/polandy/Stella/commit/ff6362403fcbb4a2be8797e72773d3f26045ad88))
* **story:** remove with undo instead of a confirmation ([45cab72](https://github.com/polandy/Stella/commit/45cab720b918cb3c63709f59b2f94e1e813e1506))
* **tags:** add household tags with colours, assignment, and filtering ([92ebab7](https://github.com/polandy/Stella/commit/92ebab73583ded0f2b863d32393c9135461f1d64))
* **ui:** persistent app shell with sidebar, breadcrumbs & mobile tabs ([6911e1e](https://github.com/polandy/Stella/commit/6911e1ed5ffd56457e92c60fa1f228c1e81dbb94))


### Bug Fixes

* **auth:** set Secure cookie flag from URL scheme, not NODE_ENV ([a5b32ad](https://github.com/polandy/Stella/commit/a5b32ad1cf5df561a4a4693e1fb0eff6b90ffb2c))
* **e2e:** run the Playwright container as the invoking user ([aa1b30e](https://github.com/polandy/Stella/commit/aa1b30e06d9c09db44201cbbcee434f11b33cf02))
* **graph:** render the explorer canvas instead of a blank page ([b8a2269](https://github.com/polandy/Stella/commit/b8a2269390168b9fdc064a9767a86df117aa65fe))
