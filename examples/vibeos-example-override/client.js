/**
 * vibeos-example-override — browser bundle.
 *
 * A minimal companion plugin for dsh-vibeos showing both extension points:
 *
 *   1. a custom SKIN ("midnight-sakura", dark pink-on-black) registered through
 *      `vibeos.skins.register()` — the same contract config-declared skins use;
 *   2. a COMPONENT OVERRIDE of the taskbar clock that reuses the built-in one
 *      through the `Default` prop instead of reimplementing it.
 *
 * Both registrations are wrapped in `ctx.effect`, so disabling, removing or
 * hot-reloading this plugin removes the skin's <style> tag and restores the
 * stock clock with no restart.
 *
 * Cross-plugin access goes through `ctx.modules.import("dsh-vibeos")`: bundle
 * arrival order is not guaranteed, so a synchronous require() of another
 * plugin's bundle can race its script load. The async import awaits arrival
 * and materialization.
 *
 * Bundle format: window.__ModuleLoader__.load({ id, factory }) — the envelope
 * every dsh client bundle ships in. The factory returns the cordis plugin
 * surface { inject, apply(ctx) }. This file is hand-written: the example has
 * no build step.
 */
window.__ModuleLoader__.load({
	id: "vibeos-example-override",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var SKIN_ID = "midnight-sakura";

		/* Every rule is scoped under [data-skin="<id>"]; the registry prefixes
		   #vibeos-root so nothing can leak onto the DSH page. Tier-1 = the 16
		   tokens the model is told about — all of them are set here, otherwise
		   model-written apps would fall back to the base theme. */
		var SKIN_CSS = [
			'[data-skin="' + SKIN_ID + '"] {',
			"  --radius: 0.5rem;",
			"  --background: #08060b;",
			"  --foreground: #ffd9ec;",
			"  --card: #130d1b;",
			"  --card-foreground: #ffd9ec;",
			"  --muted: #1b1326;",
			"  --muted-foreground: #c68fb2;",
			"  --border: #3a2247;",
			"  --primary: #ff5fa2;",
			"  --primary-foreground: #14060d;",
			"  --accent: #2a1636;",
			"  --accent-foreground: #ffd9ec;",
			"  --brand: #ff5fa2;",
			"  --destructive: #ff5470;",
			"  --run: #57e0a0;",
			"  --warn: #ffc857;",
			"  --brand-foreground: #14060d;",
			"  --popover: #130d1b;",
			"  --popover-foreground: #ffd9ec;",
			"  --secondary: #1b1326;",
			"  --secondary-foreground: #ffd9ec;",
			"  --input: #1b1326;",
			"  --ring: #ff5fa2;",
			"  --idle: #4a3355;",
			"  --sheen: rgba(255, 95, 162, 0.08);",
			"  --desktop: #05030a;",
			"  --window-titlebar: #130d1b;",
			"}",
			'[data-skin="' + SKIN_ID + '"] .vibe-taskbar {',
			"  background: rgba(8, 6, 11, 0.88);",
			"  border-top: 1px solid #3a2247;",
			"}",
			'[data-skin="' + SKIN_ID + '"] .vibe-titlebar {',
			"  border-bottom: 1px solid #3a2247;",
			"}",
			'[data-skin="' + SKIN_ID + '"] .vibe-window {',
			"  box-shadow: 0 18px 48px -12px rgba(255, 95, 162, 0.22);",
			"}"
		].join("\n");

		/* Component override: decorate, don't reimplement. Every overridable
		   component receives `Default` — the next implementation down the
		   chain, with the same props — so the built-in clock keeps ticking and
		   keeps following the locale. */
		function StarClock(props) {
			return React.createElement(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "6px" } },
				React.createElement(
					"span",
					{ style: { color: "var(--brand)", fontSize: "12px", lineHeight: 1 } },
					"★"
				),
				React.createElement(props.Default, null)
			);
		}

		function apply(ctx) {
			var disposed = false;
			var disposers = [];
			ctx.effect(() => () => {
				disposed = true;
				for (var i = disposers.length - 1; i >= 0; i--) disposers[i]();
				disposers.length = 0;
			}, "vibeos-example: registrations");

			ctx.modules.import("dsh-vibeos").then(
				(mod) => {
					if (disposed) return;
					var vibeos = mod.vibeos;
					disposers.push(
						vibeos.skins.register({
							id: SKIN_ID,
							label: "Midnight Sakura",
							css: SKIN_CSS,
							// Optional: re-theme the residual DSH chrome while the
							// desktop is active. Both modes are required.
							dswTokens: {
								"--dsw-alias-brand-primary": { light: "#ff5fa2", dark: "#ff5fa2" },
								"--dsw-alias-brand-text": { light: "#ff5fa2", dark: "#ff5fa2" }
							}
						}),
						vibeos.components.override("clock", StarClock)
					);
				},
				(err) => {
					console.warn("[vibeos-example] dsh-vibeos unavailable:", err);
				}
			);
		}

		exports.apply = apply;
		exports.inject = ["modules"];
		return module.exports;
	}
});
