# Changelog

## Unreleased

- **Importing a kit from a hand-written conventions file says what's missing.** A markdown doc that was never produced by `export` has no `relai-ruleset:` frontmatter, and the old error stopped at naming that fact. It now offers both ways forward: import it with a name, or paste a frontmatter block on top.

## 0.5.5

The panel's Japanese and Chinese stop being spaced by hand.

- **The panel stopped hand-typing its Japanese and Chinese spacing.** Every gap between CJK and Latin used to be a literal half-width space in the string — uneven by hand (`10レイヤー` had none while `MCP サーバー` had one) and wrong in every other context. The strings are now written without them and `text-autospace` puts back the 1/8 em the typography actually calls for, which is what the site has always done; `applyI18n` sets the document language so the engine knows which rules to run.
- A pitfall's advice sharpened: an atom escapes the variant-set text sync only if its variants are standalone components rather than a set of their own.

## 0.5.4

Writing the law now says what it did to the kit.

- **Writing the law into a file that follows a kit now says so.** `manage_conventions action:set` checks the kit link afterwards and, when the two have just forked, names the kit and both directions — push sends the file's law up, leaving it keeps the difference local. It never pushes on its own: which way the law travels is the designer's ruling, and the panel's "update" button runs the opposite way and would overwrite what was just written.
- **Two pitfalls from a component-set text repair** (37 now): text edits inside a component set propagate to every variant — style, decoration and fills alike, at node level and via `setRange*`, with layer names offering no escape — so per-size typography has to be applied before `combineAsVariants` or moved into its own atom; and `leadingTrim` written on a node detaches its text style, stranding the style's typography variables on the node (bind the parent's height to the leading variable instead).

## 0.5.3

The catalog finds the library by itself, and starts naming components instead of variants.

- **The library catalog stopped asking for a URL, and stopped hiding the components that matter.** `get_design_system` now resolves every library this file consumes on its own: a published asset knows its home file (`GET /v1/component_sets/{key}` → `meta.file_key`), and the plugin already hands out keys off nodes in the file, so the loop closes without anyone pasting a link. A token is the only requirement now. Two API rules make the probe work and both cost a real afternoon to learn: `.`-prefixed assets are never published, so their keys 404 everywhere; and a component SET's key resolves only at `/component_sets`, never at `/components`. Worse, `/files/{key}/components` returns the individual VARIANTS — `size=md, state=default` — so the old catalog listed 933 variant rows and not one of the 34 component sets a designer actually names. Sets are now first-class and variants are folded away with a count. This is not cosmetic: a `TextArea` sat published in a design system while the panel below it was hand-built from a stretched `Text Field`, because the file had never placed the real one and nothing could see past what the file already used.
- **Four scars from a real library migration, now spoken as error hints.** A component property's identity is its `#id` suffix, not its display name — renaming `show label#4525:247` to `hasLabel#4525:247` in the library keeps every instance override alive, and only VARIANT axes, which carry no id, fall back to a default; auditing a migration means snapshotting the axes and leaving the rest alone. `importComponentSetByKeyAsync` hands back the file's LOCAL copy, so a stale component reads as authoritative — ask REST what is actually published. `Plugin runtime aborted` is an out-of-memory from deep-wrapping properties across tens of thousands of nodes, not a timeout, and it now says so instead of looking like a hang. And GRID auto-layout: anchor indices are readonly (`setGridChildPosition`), track-size arrays reject assignment while the counts are writable and each `GridTrackSize` has its own setters.

## 0.5.2

The token stops living in a config file, and the panel learns to say when it is missing.

- **The token has a home that isn't a config file.** `npx figma-relai login` verifies a personal access token against `/v1/me`, names the account back to you, and writes it to `~/.figma-relai/credentials.json` at mode 0600; `logout` removes it. The token is read by the MCP server process only — it never travels the relay socket, because a credential with account-wide file read has no business on a port any local process can dial. `FIGMA_TOKEN` in the MCP config still works and still wins, so nothing existing breaks. The token never arrives as an argv value: piped stdin or a hidden prompt, since argv lands in shell history and in every `ps` on the machine.
- **No-go zones stopped going quiet inside `execute_figma`.** Guards blocked code execution when the *current* page was off-limits, but code that reached across to another guarded page passed without a word — while the scope lock, facing the identical blind spot, had always reported it. Arbitrary code can't be intercepted up front, so guards now lint the same way afterwards: touched nodes living on a no-go page come back as `GUARD VIOLATION`. Detection, not prevention — the same honest limit the scope lock carries.
- **The panel shows whether the token is there — an ACCESS TOKEN pill, held apart from RELAY and AGENT.** Those two are this session's plumbing; the token is your account, so it sits at the right edge under Figma's own mark. "TOKEN" alone would have read as a design token in a panel full of variables. The pills also went quiet: each carries a Phosphor mark now, and a green lamp says everything a word would — only WAITING, RETRY… and NONE spell themselves out, with the full reading in the tooltip. The plugin now sends the relay's own `hello` probe on connect and the relay answers with what its host process can reach. Presence only, never the value: a credential with account-wide file read has no business crossing a port any local process can dial. NONE is clickable and opens a panel that names what stays locked and hands over `npx figma-relai login` to copy — a silent clipboard write was too quiet to read as an answer. The chip hides itself entirely when the relay cannot know (standalone relay, or the link is down), because a confident "NONE" would be a guess.
- **An unknown command says so instead of going silent.** Any word the CLI didn't recognise fell through and started the stdio MCP server, which prints nothing and waits on stdin forever — so a typo, or a subcommand newer than the copy npx happened to fetch, looked exactly like a hang. It now names the word, lists what exists, and points at `npx -y figma-relai@latest` for the version-skew case.
- **`doctor` stopped lying about what the token unlocks.** It said "everything works except comments" — untrue since library catalogs started needing it too. It now names the source (env or file), reports the file's mode, and warns if that mode is looser than 0600.
- **Enabled libraries' variables are readable at last.** `get_design_system` always claimed to report them; the plugin was never allowed to ask. `figma.teamLibrary` requires `"permissions": ["teamlibrary"]` in the manifest and it was missing, so every call came back "teamlibrary permission not specified" and the library-collections list stayed empty. Component catalogs are a different story and unchanged: the Plugin API offers no way to enumerate a library's components — keys only come off nodes the file already contains — so a full catalog still needs `FIGMA_TOKEN` plus `libraryFileUrl`.

## 0.5.1

One afternoon of real kit use, three corrections.

- **The rules row tracks the law live.** Restoring from a kit filled the file but left the row saying "add"; an agent rewriting the conventions never moved the drift state. Every law change now refreshes both halves of the row — content and kit status — and the drawer's restore-on-link guard reads fresh truth instead of a stale cache. Seeded precedents also flow through the memory write path now, so the MEMORY list and the recall index update on restore.
- **Deleting the kit in use says one sentence.** The rules stay — they are the file's own — but the panel used to drop the kit's name without a word, which read as a stuck display. A `FILE ›` card now marks the moment: "Kit “gin” was deleted. My rules are my own — they stay."
- **"Follow" retired.** A kit is not a feed — you use one, or none. The radio list, the first-run question and the READMEs now say *use* (使う/使用); ten dead vocabulary keys, including the never-shown "in sync", left with it.

## 0.5.0

The law gets a home. One designer usually runs one product; its files share the same rules — and Figma silently discards file-carried law on every branch→main merge. This release answers both.

- **Kits** (`manage_rulesets`, the 33rd tool). Save a file's rules under a name; other files follow it. A followed file that opens with its law wiped heals — one click, or automatically with the kit's auto-restore switch on. Drift never resolves itself: update (kit→file) and publish (file→kit) both wait for you. Promote a single precedent into the kit (↑ in the MEMORY list) and every follower inherits it. Export/import as a markdown package. Choosing is exclusive and visible: a radio list with "follow none" as a first-class option, the followed kit unfolding in place.
- **The file speaks in moments, not vocabulary.** Three cards signed `FILE ›`, built like the approval card: "My rules are gone — put them back from “gin”?" · "My rules differ from “gin” now." · "I have no rules yet. Follow “gin”?" One question at a time, in your words, using the kit's name instead of concepts. The panel's steady state teaches nothing and needs nothing learned.
- **Session history.** Every write lands in a per-machine timeline (last 500): grouped by session, click a row to jump to the layer, bulk operations flagged. "What did the agent touch that day" survives past the live feed.
- **Rule proposals.** When the agent reads an enforceable sentence in your conventions ("never touch the Cover page"), it can propose the promotion — a card with the quoted reason; the guard turns on only when you accept, and the acceptance is recorded as a precedent.
- **Panel reorganized by who the information belongs to.** Session plumbing became two quiet pills (RELAY · AGENT); the file card carries the file's name and its law, with the rules' origin as a label on the RULES row (`RULES  gin · view`); the room moved next to Disconnect. Empty rules now show "add" with guidance instead of hiding the row. A gentle check-up reminder appears when the last full audit is over a week old.
- **CJK input fix:** the IME's conversion-Enter no longer triggers save in the kit and precedent inputs.
- Skills teach the new machinery in-band; `manage_variables action:snapshot` pairs with kits for before/after accounting.

## 0.4.2

Everything in this release was harvested from one long day of real design-system surgery — each fix is a scar with a story.

- **`join_room` with no arguments lists the connected plugins** (room + file name). The relay always knew; now you never have to read a room name off the panel and type it by hand.
- **Target sizes follow WCAG 2.5.8.** The interactive-target rule now defaults to the 24px AA minimum (desktop); pass `platform: "mobile"` for the 44px profile — on `analyze_design`, `analyze_accessibility` and `validate_design_rules`. Pages, sections and documents are exempt: a page named "Button" no longer fails at 0×0.
- **Contrast verdicts compare at display precision.** A 4.46:1 ratio no longer prints the absurd "4.5:1 (minimum 4.5:1)" failure.
- **Ghost census covers whole files in one call.** `analyze_design aspect:ghosts` auto-chunks any number of pages server-side and merges the results; the plugin keeps its 10-page safety cap.
- **`manage_variables action:snapshot`** — a compact inventory of every collection and variable (name + type) in one call. Take one before a branch merge or bulk edit, diff after; born from a merge where 15 new variables could not be traced because no before-list existed.
- **Voice ignores section borders.** Figma sections carry a default hairline that says nothing about your design — it no longer pollutes the stroke signature.
- **Progress lives in the activity feed.** Long scans show percent and the current step on the running entry itself; the floating progress bar is gone. Long memory and no-go lists now scroll inside their panels.
- **Five new pitfalls (#26–30)** from live canvas surgery: bound stroke weights that render nothing, the frame-side four-field binding trap, variant clones escaping their set (severing references and demoting slots), the component-set error deadlock and its escape, and `setProperties` working on nested instances where bindings revert.
- Site and READMEs: the audit vocabulary in Japanese and Chinese now speaks plainly (no more 幽霊参照/就绪度/声纹 jargon); the SCENES section got its block boundaries back.

## 0.4.1

- **Two-tone wordmark.** The cream square from the mark now docks into the "a" of the panel wordmark — panel, site logo, og card and Community cover all carry the same identity.
- **Plainer words in the panel.** The confirmation hint counts layers, not nodes, in all three languages.
- **The file speaks, in the docs too.** The memory-and-precedents skill opens with the four-act shape of a surfaced precedent (said once → kept → touched → your words call a halt); the QA gate names precedent-protected deviations "waived by precedent" instead of re-flagging them.
- **README rewritten in all three languages.** "The file carries the law" is now its own section with a precedent strip; the architecture diagram's tool count is fixed (30 → 32); registration/vocabulary aligned with the site. No tool or logic changes in this release.

## 0.4.0

- **AI no-go zones (page guards).** Guard whole pages in the panel (or via `manage_pages` guard/unguard — agents may only do that when the designer asks). Writes into a guarded page are rejected at dispatch with a clear, named error; batch_execute's nested commands are covered too.
- **One confirmation dial, four stops.** The approval setting is now a single scale — OPEN (nothing asks; branch workflows) · RISK (ghost-making and irreversible ops ask: variable/style/collection deletes, detach, flatten, 10+-node deletions — the default) · BULK (+ code execution, big batches, wide fan-outs) · ALL (every write). Cards label taxed ops `ghost-risk` / `irreversible`. Legacy settings migrate automatically.
- **The file-law cluster.** RULES · MEMORY · NO-GO now sit together at the top of the panel — the laws that travel with the file — while Config below holds only session behavior.
- **Gauges.** `analyze_design` grows three aspects: `voice` (the file's statistical fingerprint — radius/spacing/type signatures, tokenized-paint and instance rates), `readiness` (0–100 agent-readiness with top gaps), and `ghosts` (census of references to soft-deleted variables, live-list criterion — born from a 30,251-reference production repair). `validate_design_rules` gains an advisory `voice_drift` rule that never fails a run: deviations may be intent — record a precedent, or align.
- **Bulk-write evidence markers** in the activity feed (10+ nodes / 10+ batch commands leave a flagged row + session-log event).
- **Gate-precedent denoising**: approval reasons no longer surface on every same-page write; they match only via direct node/variable refs.
- New skill `qa-gate` (eleven total): the review-moment full physical — readiness + ghosts + voice + health + tokens composed into one verdicted report; precedent-protected deviations are never findings. The memory skill now covers promoting repeated rulings into guards (ask-first) and digest-mode reporting that keeps skepticism cheap.

## 0.3.0

- **File memory (precedents).** Every file can now carry its own case law: single adjudications the designer made ("this deviation is intent, not drift"), stored in shared plugin data so they travel with the file to every future session from any AI client. `manage_conventions` grew four actions (`record_precedent` / `list_precedents` / `update_precedent` / `remove_precedent`), and `action:get` returns conventions and recent precedents in one call.
- **In-band surfacing.** Write results automatically carry precedents whose refs (variables, nodes, pages) the command touched — the file's private law arrives the moment it matters, same delivery lane as pitfall hints.
- **Approval gate, more legible + connected to memory.** The approval card now leads with the agent's stated intent (agents that give no description are called out), and an optional reason field turns your approve/reject into a recorded decision precedent.
- **Panel: MEMORY row.** One quiet line (count + view); the modal shows every precedent with delete, plus a manual "note a precedent" input. The record is yours — the panel is where you audit and prune it.
- **User-authored skills.** `~/.figma-relai/skills/*.md` (frontmatter: name/description, optional layer/provenance) load as MCP prompts with a `user:` prefix. `figma-relai doctor` gained a skills check; the manifest stays deterministic (machine-local skills excluded).
- New built-in skill `memory-and-precedents` (when to record, when not to, maintenance) — ten skills total.

## 0.2.8

- Plugin panel: activity-feed status marks are drawn icons instead of text glyphs, and the footer decos became the amber+cream docking mark — the plugin now carries the same identity as the website.
- New pitfall (25 total): Figma's VM omits the failing symbol in "not a function" errors; the commonest cause is API bleed from other agent stacks (`node.query()`, `figma.notify()`) — the runtime hint now says so.
- Verified fixed (no code change needed): document-overview style counts, deep token-coverage in validate_design_rules.

## 0.2.7

- Docs-only release to refresh the npm page: README (×3 languages) gains the project's position statement, a real-session receipt block (45,509 nodes scanned · 30,251 stale bindings → 936, zero visual change, numbers unedited), and an explicit data-path sentence (the relay is local; file contents move only between Figma, your machine, and your AI client). No code changes.

## 0.2.6

- Four new pitfalls from a production ghost-variable recovery (30k dead bindings cleaned in one design system file):
  - Deleted variables are soft-deleted ghosts: `getVariableByIdAsync` still resolves them with name and working values — aliveness means membership in `getLocalVariablesAsync()`.
  - Variables cannot be reordered via the API, and delete-and-recreate to reorder silently kills every binding in the file (bindings follow IDs).
  - A remote library text style dominates variable bindings — `setBoundVariable` snaps back until the style is cleared.
  - Binding writes inside instances silently revert; instance roots in a main are writable, and the two escape hatches are paints-array reassignment and range-level `setRangeBoundVariable`.

## 0.2.5

- npm publishing is now mistake-proof: bare `npm publish` fails with the correct command in the error (`npm run release -- --otp=…`); the release script places the root README/LICENSE before npm captures metadata, and a restored `prepack` keeps the tarball covered either way. (0.2.2–0.2.4 each missed the npm-page README a different way; this closes the case.)
- New pitfall: a freshly-converted Figma slot can still report `type: "FRAME"` to the Plugin API — match slot frames by name, never gate automation on the SLOT type.

## 0.2.4

- Plugin: redial immediately when the Figma window regains attention — backgrounded windows suspend the plugin iframe, freezing the 2s retry loop until now (the relay's staleness sweep would kick the silent socket; the full causal chain is recorded as a pitfall).
- Localization pass across the panel and READMEs: natural-Japanese rewrite of 8 panel strings and 12 README.ja passages; 6 panel strings and full-width punctuation normalization in Chinese; lock label renamed for clarity in ja/zh (選択範囲に限定 / 仅限选区).
- npm publishing: `npm run release` wraps publish so the root README/LICENSE are in place before npm captures metadata — lifecycle hooks alone proved too late, which is why 0.2.2/0.2.3 pages showed no README.

## 0.2.3

- `get_design_system` adds a top-level `TRUNCATED` note when a component list is capped, naming how many items are hidden and that usage-sorting cuts exactly the newest zero-usage components (the per-list field existed but proved missable in a real audit).
- `validate_design_rules` token_coverage now uses the `audit_colors` deep walk with node/prop counts in the message; the legacy shallow calculation (which reported 100% on component sets with unbound variants) remains only as a fallback for old plugin builds.
- npm package: README/LICENSE copy moved to `prepublishOnly` (earliest publish hook) — 0.2.2's tarball contained the README but the registry metadata was captured before `prepack` ran, so the npm page showed none.

## 0.2.2

- Plugin panel: the RULES row is now clickable — a read-only modal shows the file's conventions in full (monospace, selectable text; close via ✕ / backdrop / Esc). Conventions were previously visible only to connected AI clients.
- Panel layout: RULES joined the RELAY/AGENT status rows; the room line moved below as the quiet last line.
- Three pitfalls learned building a real component: Figma's slot feature has no Plugin API (scaffold + let the designer press ⇧⌘S); a converted SLOT node stops hugging (re-assert layout sizing); variantizing can silently pin a hug axis to FIXED (verify sizing modes after combineAsVariants).

## 0.2.1

Fixes and additions driven by a real design-system audit session (the tools were used in anger; these are the gaps that surfaced).

- **Fixed: style counts were always 0** in `get_document_overview` and `get_design_tokens` — the server expected a flat array from the plugin's `get_styles` but receives `{paintStyles, textStyles, …}`. Both shapes are now understood. The overview also stops reporting a misleading "0 components": component counts are marked unknown and deferred to `get_design_system`.
- **Fixed: shallow color audit.** `analyze_design aspect:color` walked only two levels and skipped `visible:false` paints entirely — hidden hardcoded fills on component variants passed as "100% bound". A new plugin-side `audit_colors` command walks the whole subtree in one round-trip and reports hidden unbound paints separately (`hidden: true`, counted in `hiddenCount`). Falls back to the legacy path against older plugin builds.
- **`set_properties` gains `fills` / `strokes`** — raw `Paint[]` passthrough, including `[]` to clear. Clearing a decorative fill no longer requires `execute_figma` (and an approval) for a one-liner.
- **`manage_components action:"reset_instance"`** — clear all overrides on an instance so it re-inherits its main component; returns property snapshots before/after so the caller can re-apply intended content. The manual recipe this replaces took three approvals.
- **`validate_design_rules` gains `orphaned_instances`** — flags instances whose main component was deleted (they survive on a detached internal copy and silently stop updating). Old plugin builds simply omit the rule.

## 0.2.0

Design-system intelligence and designer-side trust controls. All additive — no breaking changes. Tool count: 30 → 32.

- **`get_design_system`** — the "look before you draw" inventory: local components/styles/variable collections with usage counts, remote items the file already uses, and enabled libraries' variable collections. Honest three-tier model for imported libraries; full library catalogs via REST when `FIGMA_TOKEN` + `libraryFileUrl` are provided. `execute_figma` now steers UI building through the file's own system first.
- **Token drift**: `analyze_design` gains a `tokens` aspect — hardcoded colors (OKLab ΔE match) and numbers that visually equal an existing variable, each finding naming the variable to bind. `manage_variables action:"tokenize" fix:true` binds them in one pass.
- **Approval gate**: a plugin setting ("Ask before big edits": off / bulk / all) holds bulk writes and code execution until the designer presses Approve in the panel. Keepalive progress prevents MCP-side timeouts while the card waits; Deny returns the cancelled envelope.
- **Scope lock**: restrict edits to the current selection. Declarative commands are pre-checked (including batch sub-commands); `execute_figma` cannot be intercepted up front and is instead linted after the fact, with violations reported loudly — documented honestly.
- **Dry-run**: `batch_execute` and `set_properties` accept `dryRun:true` and return the exact command plan without touching the canvas.
- **File conventions** (`manage_conventions`) — a CLAUDE.md that lives inside the Figma file (shared plugin data): naming rules, spacing habits, do-not-touch areas. `get_document_overview` auto-includes it; the panel shows a RULES row when present.
- **Comment-driven tasks**: `manage_comments` list gains `since` / `unresolved` filters and a `checkedAt` cursor; a new skill documents the scan → claim → execute → report-back loop (polling, honestly labeled).
- Three new skill prompts: `design-system-first`, `janitorial-cleanup`, `comment-driven-tasks` (nine total).
- **CLI**: `figma-relai manifest` prints the machine-readable contract (tool JSON schemas captured from a real in-process MCP handshake, plugin commands, pitfalls; emitted to `docs/manifest.json` each build — drift-proof by construction and pinned by tests); `figma-relai docs [tool]` renders the same data for humans; `figma-relai doctor` triages the environment (node, relay ports, plugin presence, saved room, token).
- Plugin build target raised to es2017 after root-causing a launch-bricking sandbox crash: Figma's plugin VM cannot compile es2015's generator-lowered `await` inside a `for…of` head. A new test compiles every build in the same VM family so the class is caught in CI.

## 0.1.4

- The plugin's connected card now leads with the **file name**; the room name — infrastructure since auto-pairing, and a secret besides — moved to a small hover-to-copy line. Room listings carry the plugin's file name, so the multiple-plugins error reads `"Landing v2" (room …)` instead of bare room strings.
- Motion polish: named easing tokens replace the browser-default `ease`, the progress bar animates `transform` instead of `width`, and transitions declare explicit properties.
- Docs rewritten for their audience (designer-first README in three languages, truthful SECURITY.md, embedded-relay CONTRIBUTING).

## 0.1.3

Fixes from an adversarial smoke pass against live Figma:

- **Fix (critical): `execute_figma` broke on any `figma.create*` call** — wrapping the `figma` global in a Proxy violated Proxy invariants (its methods are non-configurable), throwing `proxy: inconsistent get`. Created-node tracking now uses deterministic sources instead (relai-created nodes plus node ids present in the script's return value), which also isolates concurrent scripts from each other.
- **Retracted: atomic rollback of failed scripts.** The undo-stack approach proved unreliable in practice; a false atomicity promise is worse than none. Errors no longer claim rollback; docs and the tool description now say plainly that partial changes persist — keep scripts small and idempotent.
- **Fix: presence fast-fail never fired after joining a room** (the join-time presence broadcast raced `currentRoom`); presence is now recorded per room, so commands in a plugin-less room fail in milliseconds instead of a 30s timeout.
- Fix: `relai.query` crashed on empty/garbage selectors — now matches nothing.
- New pitfall entry: nodes are non-extensible (`object is not extensible`) — use `setPluginData` or return the data.

## 0.1.2

- **`relai.*` sandbox helpers**: `execute_figma` scripts get a `relai` object alongside `figma` — `text()` (font-safe), `autoLayout()`, `set()` (ordering-safe), `hug()`, `focusRing()`, `page()` (content-based lookup), `query()` (CSS-like selector subset: types, name matchers, descendant/child combinators, comma), and `placeholder()` (construction veil for work-in-progress sections). The correct way is now the shortest way.
- **Atomic scripts**: a failed `execute_figma` script rolls back its partial changes (undo-step based) — errors leave the file untouched.
- **Silent-mistake lint**: nodes created by a script are checked after it runs; zero-ambiguity problems (spread shadows on a non-clipping frame) come back as `warnings` on the result.
- **Pitfall registry**: Plugin API arcana now lives in one place (`shared/src/pitfalls.ts`) and is delivered through two channels that can't drift — `execute_figma` errors carry the remedy as a `Hint:` (unloaded fonts, dynamic-page lookups, free-plan page limits, fragile name lookups, stale ids, …), and the same registry renders the Pitfalls section of the `figma-plugin-api` cheat sheet at build time.
- `execute_figma` accepts an optional `timeoutMs` (up to 300000) for scripts that create hundreds of nodes — the 60s default remains.

## 0.1.1

- Fix: on rapid server restarts (MCP client reconnect, successive CLI runs), the new process could hit the relay port-handoff window and stay disconnected permanently — host takeover now also runs when the initial connection fails, so the first command self-heals.

## 0.1.0

Initial release.

- **30 consolidated MCP tools** over a granular, precondition-checked plugin command layer: context/analysis/verification (semantic layer with summaries and recommended next steps), declarative editing (`set_properties`, `create_node`, `edit_structure`, `set_text`), design-system management (`manage_components` / `manage_variables` / `manage_styles`, library imports), assets, annotations, and `batch_execute`.
- **`execute_figma`**: run JavaScript against the Figma Plugin API in the plugin sandbox — gated by a persisted "Allow code execution" toggle in the plugin UI (default on); console output captured, results serialized through a node budget.
- **Embedded relay**: the MCP server hosts the WebSocket relay on 127.0.0.1:9055 (bind-or-connect; multiple MCP clients negotiate a host automatically, with takeover when the host exits). A standalone relay (`bun socket`) remains for remote setups.
- **Zero-copy pairing**: the plugin persists its room and auto-connects; the server persists it too, auto-rejoins after reconnects, and auto-discovers the plugin's room — `join_room` exists only to disambiguate multiple plugins. Presence is displayed in the plugin ("AI connected ✓") and turns plugin-absent timeouts into immediate errors.
- **Plugin UI**: English/Japanese toggle, live activity feed (status, duration, click-to-focus), Stop button with cooperative cancellation, reconnection without losing the connected view, tool list generated at build time.
- **Designer events**: selection/node/page changes are buffered (self-edits suppressed) and surfaced as `designer_events` on responses plus a `get_events` tool. `verify_visual` combines screenshot and property assertions.
- **Errors are actionable**: plugin errors carry command, node id, and node type; handlers validate preconditions (node types, auto-layout membership, dimension bounds, text ranges, gradient stops) and messages name the fix. Schemas reject impossible values at the MCP boundary.
- **Design health score**: `analyze_design` aspect `overall` runs all four audits and returns a weighted 0-100 score with per-category breakdown. Accessibility checks follow WCAG thresholds (3:1 for large text, 4.5:1 for body), factor fill/node opacity into contrast, flag text over image/gradient backgrounds, and catch sub-11px text.
- **Audit trail**: `get_events` scope `agent` returns the session's full command log (outcomes, durations); `diff_nodes` gains checkpoint save/compare to show exactly what changed on a node across an editing session.
- **Comments** (`manage_comments`): list/add/reply/delete file comments — including node-anchored ones — via Figma's REST API. Opt-in with a `FIGMA_TOKEN` env var; every other tool works without it. The file key is auto-detected from the open plugin when possible.
- Six skill documents ship as MCP prompts, including a Plugin API cheat sheet for `execute_figma`.
- MIT licensed; unit tests (`bun test`) and CI (build, typecheck, test).
