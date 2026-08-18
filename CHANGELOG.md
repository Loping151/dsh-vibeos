# Changelog

## 0.1.0

First release: a port of [VibeOS](https://github.com/benis-me/VibeOS) (MIT, by @benis-me) into a
native DeepSeek Harness web plugin — one package, host half plus browser bundle.

- **Desktop takeover** — the client bundle shadows the shell's `root` slot with a full-viewport
  `#vibeos-root` container: wallpaper, desktop icons on a snap grid, window manager (drag, 8-way
  resize, minimize/maximize, z-order, cascade, per-app geometry memory), taskbar with reorderable
  window buttons, start menu, spotlight, notification toasts and center, context menus.
- **Model-written windows** — each window body is model-generated HTML, DOMPurify-sanitized
  (`<style>` additionally forbidden, `.ai-surface` hardened with `contain: layout paint`) and driven
  by six delegated listeners; full-snapshot regeneration plus `data-vibeos-region` incremental
  patching with streaming region frames, scroll memory and input preservation.
- **Eight syscalls** — `notify`, `open`, `spawn-window`, `install`, `create-file`, `focus`, `close`,
  `chrome`, each validated individually and capped per batch.
- **Host platform mapping** — `ctx.llm.stream` behind the preserved `SdkManager` seam (two roles,
  re-arming stall timeout, one bounded retry, latest-wins preemption); three DSH storage domains
  (`vibeos-core`, `vibeos-memory`, `vibeos-activity`) plus a content-addressed image file store; one
  plugin-owned WebSocket at `/vibeos/ws` and one HTTP route at `/vibeos/img`, both behind a
  loopback/same-origin trust fence; every registration is a `ctx.effect` disposer.
- **Three agents** — ui-generation, system-event (~75 s) and maintenance (~300 s) on jittered
  fiber-bound timers, with a config master switch.
- **Apps & files** — preset apps, app store with templates, freeze a window into an app, `.vibeapp`
  export/import, virtual file system with shortcuts and a recycle bin.
- **Activity Monitor** — paged agent-run history with token counts and a Stop button.
- **Skins** — `devdock`, `xp`, `aqua`, and the new `harness` skin that maps the desktop onto DSH theme
  tokens; custom skins from config (`skins.custom`) or from another plugin, validated and scoped to
  `#vibeos-root`; optional `dswTokens` bridge that re-themes residual DSH chrome while the desktop is
  active.
- **Public client API** — `require('dsh-vibeos/client').vibeos`: skins, 15 keyed component overrides
  (each receiving the previous implementation as `Default`), native apps, window chromes, menu
  transformers, icons, i18n dictionaries and desktop/classic mode control.
- **Classic mode** — start menu / Settings / taskbar menu toggle plus a `shell.overlay` return pill,
  and `desktop.startInClassicMode` for the first-boot default. Removing or disabling the plugin
  restores the stock UI completely.
- **Undo/redo per window** (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`) and a confirmed **system reset** that
  wipes the session but keeps settings.
- **Bilingual zh/en** shell and generation locale; multi-tab mirroring of one shared desktop.
- **Tooling** — `aiStub` mode for deterministic offline runs, `scripts/e2e.mjs` boot/handshake check,
  committed `lib/` so git installs need no build, and `examples/vibeos-example-override/` showing a
  custom skin plus a component override.

Dropped from upstream VibeOS on purpose: its own provider registry and API-key management (DSH owns
providers and credentials), image generation (wallpaper upload kept), cost estimation, SQLite and its
write queue, and the `motion` / icon-font dependencies.
