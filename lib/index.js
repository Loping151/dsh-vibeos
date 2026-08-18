import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { createAssistantMessage, createToolResultMessage, createUserMessage } from "@deepseek-ai/dsh-llm/message";
import { WebSocketServer } from "ws";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import Schema from "schemastery";
//#region src/shared/domain/app.ts
/** Preset apps rendered natively (real React), never AI-hallucinated. */
const NATIVE_PRESET_APPS = [
	"settings",
	"activity-monitor",
	"app-store",
	"recycle-bin",
	"welcome"
];
//#endregion
//#region src/shared/domain/skin.ts
const DEFAULT_SKIN = "devdock";
const BUILTIN_SKINS = [
	{
		id: "devdock",
		label: "DevDock",
		css: "",
		builtin: true
	},
	{
		id: "xp",
		label: "Windows XP",
		css: "",
		builtin: true
	},
	{
		id: "aqua",
		label: "Mac Aqua",
		css: "",
		builtin: true
	},
	{
		id: "harness",
		label: "Harness",
		css: "",
		builtin: true
	}
];
const DEFAULT_SETTINGS = {
	theme: "dark",
	skin: DEFAULT_SKIN,
	locale: "zh",
	modelOverrides: {},
	prefs: {},
	updatedAt: 0
};
function makeEnvelope(type, payload, id) {
	return {
		v: 1,
		id,
		ts: Date.now(),
		type,
		payload
	};
}
//#endregion
//#region src/shared/util/emoji.ts
/**
* VibeOS forbids emoji in any generated UI/content. This strips emoji and
* related pictographs/modifiers from a string. Shared by client and host so
* enforcement is consistent everywhere AI text surfaces.
*/
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}\u{2122}\u{2139}]/gu;
function stripEmoji(text) {
	return text.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}
//#endregion
//#region src/shared/util/id.ts
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Monotonic-ish ULID generator (timestamp + randomness). */
function ulid(now = Date.now()) {
	let ts = now;
	const time = new Array(10);
	for (let i = 9; i >= 0; i--) {
		time[i] = ENCODING.charAt(ts % 32);
		ts = Math.floor(ts / 32);
	}
	let rand = "";
	for (let i = 0; i < 16; i++) rand += ENCODING.charAt(Math.floor(Math.random() * 32));
	return time.join("") + rand;
}
//#endregion
//#region src/host/agents/bus.ts
var VibeosBus = class {
	ee = new EventEmitter();
	constructor() {
		this.ee.setMaxListeners(50);
	}
	emit(type, payload) {
		this.ee.emit(type, payload);
	}
	on(type, fn) {
		this.ee.on(type, fn);
		return () => this.ee.off(type, fn);
	}
};
//#endregion
//#region src/shared/prompt/syscall-schema.ts
/**
* Zod schemas validating the AI's structured output (the syscall block).
* HOST-ONLY value import: never pull this module into the client bundle.
*/
const notificationKindSchema = z.enum([
	"info",
	"success",
	"warning",
	"error"
]);
const vfsLocationSchema = z.enum([
	"desktop",
	"folder",
	"recyclebin"
]);
const syscallSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("notify"),
		title: z.string().min(1).max(120),
		body: z.string().max(500).optional(),
		kind: notificationKindSchema.optional()
	}),
	z.object({
		type: z.literal("open"),
		appId: z.string().min(1)
	}),
	z.object({
		type: z.literal("spawn-window"),
		title: z.string().min(1).max(80),
		prompt: z.string().min(1).max(2e3),
		appId: z.string().min(1).optional(),
		width: z.number().min(240).max(2e3).optional(),
		height: z.number().min(160).max(1400).optional()
	}),
	z.object({
		type: z.literal("install"),
		name: z.string().min(1).max(60),
		icon: z.string().max(60).optional(),
		manifest: z.record(z.string(), z.unknown()).optional()
	}),
	z.object({
		type: z.literal("create-file"),
		name: z.string().min(1).max(120),
		mime: z.string().max(120).optional(),
		content: z.string().max(2e4).optional(),
		location: vfsLocationSchema.optional()
	}),
	z.object({
		type: z.literal("focus"),
		windowId: z.string().min(1)
	}),
	z.object({
		type: z.literal("close"),
		windowId: z.string().min(1)
	}),
	z.object({
		type: z.literal("chrome"),
		set: z.record(z.string(), z.string())
	})
]);
z.object({ calls: z.array(syscallSchema).max(8).default([]) });
//#endregion
//#region src/host/log.ts
const ORDER = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40
};
const threshold = ORDER[process.env.VIBEOS_LOG_LEVEL ?? "info"] ?? ORDER.info;
function ts() {
	return (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
}
function emit(level, tag, msg, extra) {
	if (ORDER[level] < threshold) return;
	const head = `${ts()} ${level.toUpperCase().padEnd(5)} [vibeos:${tag}]`;
	if (extra !== void 0) console.log(head, msg, typeof extra === "string" ? extra : safe(extra));
	else console.log(head, msg);
}
function safe(v) {
	try {
		const s = JSON.stringify(v);
		return s && s.length > 600 ? `${s.slice(0, 600)}…` : s ?? String(v);
	} catch {
		return String(v);
	}
}
function logger(tag) {
	return {
		debug: (m, e) => emit("debug", tag, m, e),
		info: (m, e) => emit("info", tag, m, e),
		warn: (m, e) => emit("warn", tag, m, e),
		error: (m, e) => emit("error", tag, m, e)
	};
}
//#endregion
//#region src/host/ai/streamParser.ts
const log$11 = logger("syscall");
const HTML_OPEN = "<vibeos-html>";
const HTML_CLOSE = "</vibeos-html>";
const SUMMARY_RE = /<vibeos-summary>([\s\S]*?)<\/vibeos-summary>/i;
const SYSCALL_RE = /```vibeos-syscall\s*([\s\S]*?)```/i;
const APPLET_RE = /<vibeos-applet>([\s\S]*?)<\/vibeos-applet>/i;
/** Incrementally extract the streaming HTML body for live patching. */
function extractStreamingHtml(buffer) {
	const start = buffer.indexOf(HTML_OPEN);
	if (start === -1) return null;
	const from = start + 13;
	const end = buffer.indexOf(HTML_CLOSE, from);
	return end === -1 ? buffer.slice(from) : buffer.slice(from, end);
}
/** Parse the complete AI output into its structured parts. */
function parseAiOutput(full) {
	const applet = APPLET_RE.exec(full)?.[1]?.trim();
	const html = extractFullHtml(full);
	const summary = SUMMARY_RE.exec(full)?.[1]?.trim() ?? "";
	const result = {
		syscalls: parseSyscalls(full),
		summary
	};
	if (applet) {
		result.applet = applet;
		return result;
	}
	if (html !== null) {
		const regions = extractRegions(html);
		if (regions.length > 0 && isOnlyRegions(html, regions)) result.regions = regions;
		else result.html = html.trim();
	}
	return result;
}
function extractFullHtml(full) {
	const start = full.indexOf(HTML_OPEN);
	if (start === -1) return null;
	const from = start + 13;
	const end = full.indexOf(HTML_CLOSE, from);
	return end === -1 ? full.slice(from).trim() : full.slice(from, end).trim();
}
const VOID_TAGS$1 = /* @__PURE__ */ new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
]);
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
const REGION_ATTR = /\bdata-vibeos-region\s*=\s*["']([^"']+)["']/;
/**
* Depth-aware extraction of every element carrying data-vibeos-region, including
* its full (possibly nested) inner HTML. A regex like /…<\/tag>/ would stop at
* the first closing tag and shred nested content — so we scan tag-by-tag and
* balance open/close tags to find the true end of each region element.
*/
function extractRegions(html) {
	const out = [];
	OPEN_TAG.lastIndex = 0;
	let m;
	while ((m = OPEN_TAG.exec(html)) !== null) {
		const tag = m[1].toLowerCase();
		const attrs = m[2] ?? "";
		const regionMatch = REGION_ATTR.exec(attrs);
		if (!regionMatch) continue;
		const regionId = regionMatch[1];
		const startIdx = m.index;
		if (attrs.trim().endsWith("/") || VOID_TAGS$1.has(tag)) {
			out.push({
				region: regionId,
				html: html.slice(startIdx, OPEN_TAG.lastIndex)
			});
			continue;
		}
		const endIdx = findElementEnd$1(html, OPEN_TAG.lastIndex, tag);
		if (endIdx === -1) continue;
		out.push({
			region: regionId,
			html: html.slice(startIdx, endIdx)
		});
		OPEN_TAG.lastIndex = endIdx;
	}
	return out;
}
/** Find the index just past the matching close tag for `tag`, starting at `from`. */
function findElementEnd$1(html, from, tag) {
	const re = new RegExp(`<(/?)(${tag})\\b[^>]*?(/?)>`, "gi");
	re.lastIndex = from;
	let depth = 1;
	let m;
	while ((m = re.exec(html)) !== null) {
		const isClose = m[1] === "/";
		const selfClose = m[3] === "/";
		if (isClose) {
			depth--;
			if (depth === 0) return re.lastIndex;
		} else if (!selfClose) depth++;
	}
	return -1;
}
function isOnlyRegions(html, regions) {
	let rest = html;
	for (const r of regions) rest = rest.replace(r.html, "");
	return rest.trim().length === 0;
}
function parseSyscalls(full) {
	const block = SYSCALL_RE.exec(full)?.[1]?.trim();
	if (!block) return [];
	let json;
	try {
		json = JSON.parse(block);
	} catch {
		log$11.warn("unparseable block dropped");
		return [];
	}
	const raw = Array.isArray(json) ? json : Array.isArray(json?.calls) ? json.calls : [];
	const out = [];
	for (const item of raw) {
		const parsed = syscallSchema.safeParse(item);
		if (parsed.success) out.push(parsed.data);
		else log$11.warn(`dropped invalid call: ${parsed.error.issues[0]?.message}`, JSON.stringify(item).slice(0, 120));
	}
	return out;
}
//#endregion
//#region src/host/agents/MaintenanceAgent.ts
/**
* Background consolidation: folds each open window's recent interactions into a
* tighter episode summary, and prunes old agent runs. Uses the fast model.
*/
var MaintenanceAgent = class {
	deps;
	role = "maintenance";
	constructor(deps) {
		this.deps = deps;
	}
	async tick() {
		const { windows, apps, memory, runs, sdk, runHistory } = this.deps;
		await runs.prune(runHistory);
		for (const win of windows.listOpenWindows()) {
			const mem = memory.getMemory(win.id);
			const recent = memory.recentInteractions(win.id);
			if (recent.length < 6) continue;
			const app = apps.getApp(win.appId);
			const prompt = `[APP]\n${app?.name ?? win.appId}\n\n[CURRENT EPISODE SUMMARY]\n${mem?.episodeSummary ?? "(none)"}\n\n[RECENT INTERACTIONS]\n${recent.map((r) => `- ${r.opKind} ${JSON.stringify(r.opPayload).slice(0, 120)}`).join("\n")}\n\n[TASK]\nProduce an updated concise episode summary.`;
			const result = await sdk.run({
				role: "maintenance",
				trigger: "timer",
				prompt,
				appName: app?.name ?? "Maintenance"
			});
			if (!result.ok) continue;
			const parsed = parseAiOutput(result.text);
			sdk.recordSummary(result.runId, parsed.summary || "Consolidated memory");
			if (parsed.summary) await memory.saveSummary(win.id, parsed.summary);
		}
	}
};
//#endregion
//#region src/host/agents/scheduler.ts
const log$10 = logger("agents");
/**
* Wires the event-driven UI generation agent and the timer-driven ambient
* agents. Each tick reschedules itself with jitter (0.5×–1.5× the interval).
*/
var AgentScheduler = class {
	ctx;
	uiAgent;
	scheduled;
	stopped = true;
	timers = /* @__PURE__ */ new Map();
	uiOff = null;
	constructor(ctx, uiAgent, scheduled) {
		this.ctx = ctx;
		this.uiAgent = uiAgent;
		this.scheduled = scheduled;
	}
	start() {
		if (!this.stopped) return;
		this.stopped = false;
		this.uiOff = this.uiAgent.register();
		for (const entry of this.scheduled) this.schedule(entry);
		log$10.info("scheduler started (ui-generation + system-event + maintenance)");
	}
	stop() {
		if (this.stopped) return;
		this.stopped = true;
		for (const dispose of this.timers.values()) dispose();
		this.timers.clear();
		this.uiOff?.();
		this.uiOff = null;
	}
	schedule({ agent, enabled, interval }) {
		const loop = () => {
			if (this.stopped) return;
			const jitter = interval() * (.5 + Math.random());
			this.timers.get(agent.role)?.();
			this.timers.set(agent.role, this.ctx.timeout(() => {
				this.runTick(agent, enabled).finally(loop);
			}, jitter));
		};
		loop();
	}
	async runTick(agent, enabled) {
		if (this.stopped || !enabled()) return;
		try {
			await agent.tick();
		} catch (e) {
			log$10.warn(`${agent.role} tick failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
};
//#endregion
//#region src/host/agents/SystemEventAgent.ts
/**
* Ambient daemon: periodically invents small believable system events
* (notifications) so the OS feels alive. Uses the fast model.
*/
var SystemEventAgent = class {
	deps;
	role = "system-event";
	constructor(deps) {
		this.deps = deps;
	}
	async tick() {
		if (this.deps.windows.listOpenWindows().length === 0 && Math.random() > .4) return;
		const prompt = `[GLOBAL STATE]\n${JSON.stringify(this.deps.kernelState.snapshotForPrompt())}\n\n[TASK]\nInvent at most one small, atmospheric system event appropriate to the current state. Emit a single notify syscall and a summary. If nothing fits, return an empty calls array.`;
		const result = await this.deps.sdk.run({
			role: "system-event",
			trigger: "timer",
			prompt,
			appName: "System"
		});
		if (!result.ok) return;
		const parsed = parseAiOutput(result.text);
		this.deps.sdk.recordSummary(result.runId, parsed.summary || "Ambient event");
		if (parsed.syscalls.length > 0) await this.deps.syscalls.execute(parsed.syscalls, { source: "agent" });
	}
};
//#endregion
//#region src/host/ai/webTools.ts
const log$9 = logger("web");
const WEB_TOOL_SCHEMAS = [{
	name: "web_search",
	description: "Search the real internet. Use it to ground generated pages in real data: real search results, news, product info, documentation. Returns numbered results with title, url and snippet.",
	parameters: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "The search query."
			},
			maxResults: {
				type: "integer",
				minimum: 1,
				maximum: 10
			}
		},
		required: ["query"],
		additionalProperties: false
	}
}, {
	name: "web_fetch",
	description: "Fetch a real URL and return its readable content (title, text, links). Use it when the user navigates to a real website so the rendered page matches reality.",
	parameters: {
		type: "object",
		properties: { url: {
			type: "string",
			description: "Absolute http(s) URL."
		} },
		required: ["url"],
		additionalProperties: false
	}
}];
const PRIVATE_V4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
async function assertPublicHost(url) {
	const host = url.hostname;
	if (host === "localhost" || PRIVATE_V4.test(host) || host === "::1" || host === "[::1]") throw new Error("private address blocked");
	const { address } = await lookup(host);
	if (PRIVATE_V4.test(address) || address === "::1" || address.startsWith("fe80:") || address.startsWith("fd")) throw new Error("private address blocked");
}
/** Anonymous direct HTTP fallback when the profile assembles no fetch provider. */
async function directFetch(rawUrl, timeoutMs) {
	const url = new URL(rawUrl);
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http(s)");
	await assertPublicHost(url);
	const res = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
		redirect: "follow",
		headers: {
			"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
			accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
			"accept-language": "zh-CN,zh;q=0.9,en;q=0.6"
		}
	});
	const type = res.headers.get("content-type") ?? "";
	const content = await res.text();
	return {
		url: res.url,
		statusCode: res.status,
		kind: type.includes("html") ? "html" : "text",
		content: content.slice(0, 8e5)
	};
}
/** Strip an HTML document down to a readable digest the model can rebuild from. */
function htmlDigest(html, maxChars) {
	const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
	const links = [];
	const linkRe = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
	let m;
	while ((m = linkRe.exec(html)) && links.length < 25) {
		const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
		if (label && m[1].startsWith("http")) links.push(`${label} -> ${m[1]}`);
	}
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&(nbsp|#160);/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, maxChars);
	return [
		title ? `TITLE: ${title}` : "",
		`TEXT: ${text}`,
		links.length ? `LINKS:\n${links.join("\n")}` : ""
	].filter(Boolean).join("\n");
}
var WebToolRuntime = class {
	ctx;
	cfg;
	constructor(ctx, cfg) {
		this.ctx = ctx;
		this.cfg = cfg;
	}
	available() {
		return this.cfg.enabled && !!this.ctx.get("web");
	}
	get maxCalls() {
		return this.cfg.maxCalls;
	}
	async exec(name, argsJson) {
		const web = this.ctx.get("web");
		if (!web) return {
			text: "web access unavailable",
			isError: true
		};
		let args;
		try {
			args = JSON.parse(argsJson);
		} catch {
			return {
				text: "invalid tool arguments",
				isError: true
			};
		}
		const signal = AbortSignal.timeout(this.cfg.timeoutMs);
		try {
			if (name === "web_search") {
				const query = String(args.query ?? "").slice(0, 400);
				if (!query) return {
					text: "empty query",
					isError: true
				};
				const res = await web.search({
					query,
					maxResults: Math.min(Number(args.maxResults) || 8, 10)
				}, signal);
				const lines = res.sources.map((s, i) => `${i + 1}. ${s.title ?? s.url}\n   ${s.url}${s.snippet ? `\n   ${s.snippet}` : ""}`);
				const body = [res.content?.slice(0, this.cfg.maxChars / 2), lines.join("\n")].filter(Boolean).join("\n\n");
				log$9.info(`web_search "${query.slice(0, 60)}" -> ${res.sources.length} sources`);
				return {
					text: body.slice(0, this.cfg.maxChars) || "no results",
					isError: false
				};
			}
			if (name === "web_fetch") {
				const url = String(args.url ?? "");
				if (!/^https?:\/\//i.test(url)) return {
					text: "only http(s) urls",
					isError: true
				};
				let finalUrl;
				let status;
				let kind;
				let content;
				try {
					const res = await web.fetch({ url }, signal);
					finalUrl = res.url;
					status = res.statusCode;
					kind = res.body.kind;
					content = res.body.content ?? "";
				} catch (e) {
					const direct = await directFetch(url, this.cfg.timeoutMs);
					finalUrl = direct.url;
					status = direct.statusCode;
					kind = direct.kind;
					content = direct.content;
				}
				const digest = kind === "html" ? htmlDigest(content, this.cfg.maxChars) : content.slice(0, this.cfg.maxChars);
				log$9.info(`web_fetch ${url.slice(0, 80)} -> HTTP ${status}, ${digest.length} chars`);
				return {
					text: `HTTP ${status} ${finalUrl}\n${digest}`,
					isError: false
				};
			}
			return {
				text: `unknown tool ${name}`,
				isError: true
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			log$9.warn(`${name} failed: ${msg}`);
			return {
				text: `${name} failed: ${msg}`,
				isError: true
			};
		}
	}
};
//#endregion
//#region src/host/prompt/presetTemplates.ts
/**
* Hints that seed the AI's first render for preset apps. These are NOT the
* literal HTML — they describe the kind of app the AI should hallucinate so
* preset apps feel recognizable while still being AI-generated.
*/
const HINTS = {
	browser: "A web browser. Structure: a top chrome containing back/forward buttons and the address bar wrapped in its OWN region: <form data-vibeos-region='addressbar' data-vibeos-action='navigate'><input name='url' value='<current url>' …></form>; then the page body as <div data-vibeos-region='page'>…</div>. CRITICAL navigation: the user's typed text arrives in the OPERATION as value=/form=. On navigate you MUST return BOTH regions: (1) data-vibeos-region='addressbar' with the input value set to the EXACT URL the user typed, and (2) data-vibeos-region='page' rendering the page the user ASKED FOR (not a random/homepage). Never ignore the user's input or keep the old URL. Links inside the page carry data-vibeos-action='navigate' data-url='…'. REAL SITES: when the URL is a real-world site (baidu.com, github.com, zhihu.com, …), render a CONVINCING replica of that site's actual page: its layout, color scheme, typography feel, logo drawn with styled text/CSS shapes (never <img> from the real domain), its signature modules (search box, nav, feed, sidebar), plausible dense content in the site's own language. Every link/button/search works via data-vibeos-action and navigates to further in-site pages. Search on the replica returns believable results. NEVER say the page cannot be loaded, never render an empty or placeholder page, never break character about the content's origin. GROUND IN REALITY: you have web_search / web_fetch tools — for real sites CALL web_fetch(url) first and rebuild the page from the real content; for search-engine queries CALL web_search(query) and render the REAL results (real titles, real snippets; keep each real URL in data-url so clicking navigates there). In-page search boxes submit as a navigate action carrying the engine's real query URL (e.g. https://www.baidu.com/s?wd=<query>).",
	"command-line": "A terminal emulator. The OS itself draws the prompt line 'dev@vibeos:~$ ' and echoes the command: never render an input, a form, a prompt line, your own hostname prompt, or the command the user typed. FIRST RENDER ONLY: output the boot banner as <div data-vibeos-region='scrollback' style='padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.35'>…1-3 banner lines…</div>. EVERY LATER TURN: the scrollback above is IMMUTABLE and already on screen — you may only APPEND. Still answer inside the usual <vibeos-html>…</vibeos-html> envelope, but put ONLY the new output lines inside it: bare sibling <div> elements, one per line, with NO surrounding container and NO data-vibeos-region attribute. Never repeat earlier lines, never restate the command, never wrap them in the region again. Respond plausibly to EVERY command, known or not, with AT LEAST ONE line of output (unknown → 'command not found'; 'ls' lists plausible files; a command that truly prints nothing still gets a status line). 'clear' outputs the single token CLEAR and nothing else. Align columns with plain spaces (monospace); box-drawing tables, trees and progress bars are welcome.",
	"file-manager": "A file manager browsing the VibeOS virtual filesystem. Show a toolbar, a path breadcrumb, and a grid/list of files & folders (each data-vibeos-action='open' data-name=...). Reflect any real desktop files from system state when known.",
	settings: "A system settings panel. Show sections for Appearance (theme), About (boot count, version), and Model performance. Controls carry data-vibeos-action. Keep it consistent with the real settings provided in system state."
};
function presetHint(presetId) {
	if (!presetId) return void 0;
	return HINTS[presetId];
}
//#endregion
//#region src/host/prompt/PromptAssembler.ts
const SUMMARY_BUDGET = 1200;
/**
* Pre-decide the render mode before the AI runs. The OS only *forces* full when
* it's structurally unavoidable; otherwise it nudges toward incremental but
* lets the AI (which knows the action's intent) make the final call.
*/
function decideRenderMode(input) {
	if (input.firstRender || input.isSpawn || input.isDrag || input.isNavigate || !input.hasSnapshot) return "force-full";
	return "prefer-incremental";
}
const SKIN_STYLE_HINTS = {
	devdock: "clean contemporary minimalism — soft rounded corners, generous spacing, quiet flat surfaces",
	xp: "the classic Windows XP / 98 era — beveled 3D buttons, gray panels, chunky toolbars, dense compact controls, small utilitarian typography",
	aqua: "the Mac OS X Aqua era — glossy gel buttons, pinstripe headers, rounded lozenge controls, brushed-metal moods",
	harness: "neutral modern product UI that blends with a developer tool"
};
function assemblePrompt(input) {
	const { app, memory, recent, globalState, windowSize, op, drag, seedPrompt, firstRender, renderMode, regionIds, userProfile, stylePrompt, skin, terminalPrompt } = input;
	const parts = [];
	if (userProfile?.trim()) parts.push(`[USER PROFILE]\nWhat the user told us about themselves — tailor content to it (don't echo it verbatim):\n${truncate(userProfile.trim(), 800)}`);
	if (skin) {
		const hint = SKIN_STYLE_HINTS[skin] ?? `an OS skin named "${skin}" — let its name inform the era and material of your layout`;
		parts.push(`[ACTIVE SKIN]\nThe OS is skinned as "${skin}": ${hint}. Match that era in LAYOUT and CONTROL STYLING (button shapes, borders, chrome density) while still using ONLY the design-system tokens for colors. The user's style preference below, if present, wins over this.`);
	}
	if (stylePrompt?.trim()) parts.push(`[USER STYLE PREFERENCE]\nThe user wants generated app UIs in this style — honor it within the design-system token rules:\n${truncate(stylePrompt.trim(), 400)}`);
	parts.push(`[APP]\nname: ${app.name}\nkind: ${app.kind}${app.presetId ? `\npreset: ${app.presetId}` : ""}` + (app.manifest.description ? `\nabout: ${app.manifest.description}` : ""));
	const hint = presetHint(app.presetId);
	if (hint) parts.push(`[APP STYLE GUIDE]\n${hint}`);
	if (app.manifest.chrome) parts.push(chromeDirective(String(app.manifest.chrome), terminalPrompt));
	if (memory?.episodeSummary) parts.push(`[EPISODE MEMORY]\n${truncate(memory.episodeSummary, SUMMARY_BUDGET)}`);
	const gs = { ...compact(globalState) };
	if (windowSize) gs.windowSize = `${Math.round(windowSize.w)}x${Math.round(windowSize.h)}px`;
	parts.push(`[GLOBAL STATE]\n${JSON.stringify(gs, null, 0)}`);
	if (recent.length > 0) {
		const lines = recent.map((r) => `- ${r.opKind} ${summarizeOp(r.opPayload)}${r.resultSummary ? ` → ${r.resultSummary}` : ""}`).join("\n");
		parts.push(`[RECENT INTERACTIONS]\n${lines}`);
	}
	if (!firstRender && memory?.htmlSnapshot) {
		const budget = input.snapshotBudget ?? 0;
		const snap = budget > 0 ? truncateHtml(memory.htmlSnapshot, budget) : memory.htmlSnapshot;
		parts.push(`[CURRENT UI]\n${snap}`);
	}
	let opLine;
	if (seedPrompt) opLine = `This is a new window opened by the system, for the following purpose:\n${seedPrompt}`;
	else if (firstRender) opLine = `The user just launched this application.`;
	else if (drag) opLine = `The user dropped a ${drag.kind} (${drag.label ?? drag.ref}) onto this window. React to it.`;
	else if (op) opLine = `The user performed: ${op.kind}` + (op.action ? ` action="${op.action}"` : "") + (op.sel ? ` target="${op.sel}"` : "") + (op.value !== void 0 ? ` value="${op.value}"` : "") + (op.dataset && Object.keys(op.dataset).length ? ` data=${JSON.stringify(op.dataset)}` : "") + (op.formData ? ` form=${JSON.stringify(op.formData)}` : "");
	else opLine = `Update the interface.`;
	const modeDirective = renderMode === "force-full" ? `[RENDER MODE: FULL]\nReturn the COMPLETE window body in <vibeos-html>. Tag stable, updatable parts with data-vibeos-region="<stable-id>" so future changes can be patched incrementally. Do NOT return bare region fragments this time.` : `[RENDER MODE: INCREMENTAL PREFERRED]\nThe window is already rendered (see CURRENT UI${regionIds?.length ? `, regions: ${regionIds.join(", ")}` : ""}). DECIDE which fits this action:
- If the action changes only part(s) of the screen → return ONLY those data-vibeos-region elements (for accumulating regions like terminal/chat/list, include ALL their existing content plus the new part). This is the default — prefer it.
- If the action structurally replaces the screen (page navigation, switching to a totally different view) → return the FULL body instead.
Choose deliberately before you write: do not re-emit the whole window for a small change, and do not emit a fragment when the layout truly changed.`;
	parts.push(`[OPERATION]\n${opLine}\n\n${modeDirective}`);
	return parts.join("\n\n");
}
/** Per-app instructions when the OS provides a native chrome shell. */
function chromeDirective(chrome, terminalPrompt) {
	if (chrome === "terminal" && terminalPrompt) return `[NATIVE CHROME: terminal]\nThe OS draws the prompt line "${terminalPrompt}:~$ " and echoes the command itself. Never print a prompt, a hostname or the typed command.`;
	if (chrome === "browser") return `[NATIVE CHROME: browser]
This window has a NATIVE address bar provided by the OS (back / forward / reload / URL field). You generate ONLY the page CONTENT below it — do NOT draw an address bar, toolbar, tabs, or any browser chrome yourself.
- Navigation arrives as an OPERATION with action="navigate" and the target in value/form (a URL or a search query). Render that page's content.
- A clicked link or anything that changes the page is also an OPERATION — render the new page.
- WHENEVER the shown page changes (navigation, clicked link, redirect, search) you MUST emit a chrome syscall so the address bar stays in sync:
\`\`\`vibeos-syscall
{ "calls": [ { "type": "chrome", "set": { "url": "https://example.com/path", "title": "Page title" } } ] }
\`\`\``;
	return `[NATIVE CHROME: ${chrome}]\nThis window has a native shell provided by the OS; generate ONLY the inner content. Update the shell when the content's state changes via a chrome syscall: { "type":"chrome", "set": { ... } }.`;
}
function compact(state) {
	const out = {};
	for (const [k, v] of Object.entries(state)) {
		const s = JSON.stringify(v);
		if (s && s.length < 800) out[k] = v;
	}
	return out;
}
function summarizeOp(payload) {
	try {
		const s = JSON.stringify(payload);
		return s.length > 160 ? `${s.slice(0, 160)}…` : s;
	} catch {
		return "";
	}
}
function truncate(s, max) {
	if (s.length <= max) return s;
	return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}
/**
* Truncate an HTML snapshot for context. Cuts at the last COMPLETE tag boundary
* before `max` so the AI never sees a half-open tag, and marks the elision —
* noting that unchanged regions are preserved automatically, so the model
* shouldn't try to reconstruct the parts it can't see.
*/
function truncateHtml(s, max) {
	if (s.length <= max) return s;
	const head = s.slice(0, max);
	const lastClose = head.lastIndexOf(">");
	const cut = lastClose > max * .6 ? head.slice(0, lastClose + 1) : head;
	return `${cut}\n<!-- …[${s.length - cut.length} chars truncated; regions you don't see here are kept as-is — only re-emit a data-vibeos-region you actually change] -->`;
}
//#endregion
//#region src/host/agents/regionMerge.ts
/**
* Server-side region merge so the persisted snapshot stays in sync with what
* the client renders. Uses string replacement keyed by data-vibeos-region,
* mirroring the client's DOM-based applyRegions.
*/
const VOID_TAGS = /* @__PURE__ */ new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
]);
function applyRegionsServer(current, regions) {
	let out = current;
	for (const r of regions) {
		const span = findRegionSpan(out, r.region);
		if (span) out = out.slice(0, span.start) + r.html + out.slice(span.end);
		else out += r.html;
	}
	return out;
}
/** Locate the [start,end) of the element carrying data-vibeos-region=id, nesting-aware. */
function findRegionSpan(html, id) {
	const openTag = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
	const attrRe = new RegExp(`\\bdata-vibeos-region\\s*=\\s*["']${escapeRe(id)}["']`);
	let m;
	while ((m = openTag.exec(html)) !== null) {
		const attrs = m[2] ?? "";
		if (!attrRe.test(attrs)) continue;
		const tag = m[1].toLowerCase();
		const start = m.index;
		if (attrs.trim().endsWith("/") || VOID_TAGS.has(tag)) return {
			start,
			end: openTag.lastIndex
		};
		const end = findElementEnd(html, openTag.lastIndex, tag);
		return end === -1 ? null : {
			start,
			end
		};
	}
	return null;
}
function findElementEnd(html, from, tag) {
	const re = new RegExp(`<(/?)(${tag})\\b[^>]*?(/?)>`, "gi");
	re.lastIndex = from;
	let depth = 1;
	let m;
	while ((m = re.exec(html)) !== null) if (m[1] === "/") {
		if (--depth === 0) return re.lastIndex;
	} else if (m[3] !== "/") depth++;
	return -1;
}
/** List the data-vibeos-region ids present in a snapshot. */
function extractRegionIds(html) {
	const ids = [];
	const re = /data-vibeos-region\s*=\s*["']([^"']+)["']/g;
	let m;
	while ((m = re.exec(html)) !== null) ids.push(m[1]);
	return ids;
}
function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//#endregion
//#region src/host/agents/UiGenerationAgent.ts
const log$8 = logger("ui-gen");
/**
* Preemptive, per-window concurrency.
*
* - Different windows run fully in PARALLEL (each tracked independently).
* - Within ONE window, a new trigger PREEMPTS the in-flight one: we abort the
*   old SDK call and start the new one immediately ("latest wins"). The aborted
*   run writes nothing.
*
* UI generation runs STATELESS — each op is a fresh conversation (no session
* resume). The full current UI is sent every time via [CURRENT UI], so the
* model has the complete structure without relying on accumulated session
* history (which would grow unbounded and could drift from the merged DOM).
*/
/** Append new terminal output inside the existing scrollback region.
* `CLEAR` (the model's answer to `clear`) empties it instead. */
/** The OS prints the prompt and echoes the command itself, so every prompt-ish
* line the model emits is a duplicate: strip them all, wherever they appear. */
function stripPromptLines(added, typed) {
	const escaped = typed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const isPromptish = (text) => {
		const t = text.replace(/\u00a0/g, " ").trim();
		if (!t) return false;
		if (/^[\w.-]+@[\w.-]+[^\n]{0,40}?[$#>]\s*$/.test(t)) return true;
		if (typed && new RegExp(`^[\\w.@:~/\\-]*[$#>]\\s*${escaped}\\s*$`).test(t)) return true;
		return typed ? t === typed : false;
	};
	return added.replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (whole, inner) => isPromptish(String(inner).replace(/<[^>]+>/g, "")) ? "" : whole).trim();
}
function escapeHtml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function appendToScrollback(current, added) {
	if (!added.trim()) return current;
	if (isClear(added)) return clearedScrollback(current);
	const open = /<div[^>]*data-vibeos-region=['"]scrollback['"][^>]*>/i.exec(current);
	if (!open) return current ? `${current}\n${added}` : added;
	const start = open.index + open[0].length;
	const close = current.lastIndexOf("</div>");
	if (close <= start) return current;
	return current.slice(0, close) + added + current.slice(close);
}
function isClear(added) {
	const text = added.replace(/<[^>]+>/g, "").trim();
	return text.toUpperCase() === "CLEAR" && text.length === 5;
}
/** `clear` empties the scrollback but keeps its wrapper (and layout). */
function clearedScrollback(current) {
	const open = /<div[^>]*data-vibeos-region=['"]scrollback['"][^>]*>/i.exec(current);
	if (!open) return "";
	const start = open.index + open[0].length;
	const close = current.lastIndexOf("</div>");
	return close > start ? current.slice(0, start) + current.slice(close) : current;
}
var UiGenerationAgent = class {
	deps;
	inflight = /* @__PURE__ */ new Map();
	genCounter = /* @__PURE__ */ new Map();
	constructor(deps) {
		this.deps = deps;
	}
	register() {
		const { bus } = this.deps;
		const offs = [
			bus.on("window.firstRender", ({ windowId }) => this.dispatch(windowId, { firstRender: true })),
			bus.on("window.spawnRender", ({ windowId, seedPrompt }) => this.dispatch(windowId, {
				firstRender: true,
				seedPrompt
			})),
			bus.on("op.received", ({ windowId, op }) => this.dispatch(windowId, { op })),
			bus.on("op.dragdrop", ({ windowId, source }) => {
				if (windowId) this.dispatch(windowId, { drag: source });
			}),
			bus.on("window.closed", ({ windowId }) => this.abortWindow(windowId)),
			bus.on("window.abortRender", ({ windowId }) => this.abortWindow(windowId))
		];
		return () => {
			for (const off of offs) off();
		};
	}
	dispatch(windowId, trigger) {
		if (this.inflight.has(windowId) && !trigger.firstRender) {
			log$8.debug(`busy [${windowId.slice(-6)}] — action ignored while rendering`);
			this.deps.gateway.broadcast("s2c.ui.busy", {
				windowId,
				busy: true
			});
			return;
		}
		const gen = (this.genCounter.get(windowId) ?? 0) + 1;
		this.genCounter.set(windowId, gen);
		const abort = new AbortController();
		this.inflight.set(windowId, {
			abort,
			gen
		});
		this.generate(windowId, trigger, gen, abort).catch((e) => {
			if (abort.signal.aborted) return;
			log$8.error(`generate threw [${windowId.slice(-6)}]`, e instanceof Error ? e.message : e);
			this.deps.gateway.broadcast("s2c.ui.busy", {
				windowId,
				busy: false
			});
		}).finally(() => {
			if (this.inflight.get(windowId)?.gen === gen) this.inflight.delete(windowId);
		});
	}
	/** Stop every in-flight generation (system reset). */
	/** Prompt identity: user setting wins over the deployment config. */
	promptId() {
		const pref = this.deps.settings.loadSettings().prefs.terminalPrompt;
		return (typeof pref === "string" && pref.trim() ? pref : this.deps.config.terminal.prompt).trim() || "dev@vibeos";
	}
	abortAll() {
		for (const windowId of [...this.inflight.keys()]) this.abortWindow(windowId);
	}
	/**
	* Stop the in-flight generation for a window (e.g. when it's closed). Bumping
	* the generation counter makes any straggler result count as stale and commit
	* nothing.
	*/
	abortWindow(windowId) {
		const cur = this.inflight.get(windowId);
		if (cur) {
			cur.abort.abort();
			this.inflight.delete(windowId);
			this.genCounter.set(windowId, (this.genCounter.get(windowId) ?? 0) + 1);
			log$8.debug(`[${windowId.slice(-6)}] window closed — generation aborted`);
		}
	}
	/** True if this run has been superseded by a newer one for the same window. */
	isStale(windowId, gen, abort) {
		return abort.signal.aborted || this.genCounter.get(windowId) !== gen;
	}
	async generate(windowId, trigger, gen, abort) {
		const { gateway, windows, apps, memory, settings, kernelState, sdk, syscalls, config } = this.deps;
		const win = windows.getWindow(windowId);
		const app = win ? apps.getApp(win.appId) : null;
		if (!win?.isOpen || !app) return;
		await memory.ensureMemory(windowId, app.id);
		const mem = memory.getMemory(windowId);
		const firstRender = trigger.firstRender ?? false;
		gateway.broadcast("s2c.ui.busy", {
			windowId,
			busy: true
		});
		if (trigger.op || trigger.drag) await memory.addInteraction({
			windowId,
			opKind: trigger.op?.kind ?? "dragdrop",
			opPayload: trigger.op ?? trigger.drag
		});
		let snapshotForPrompt = mem?.htmlSnapshot ?? "";
		if (app.manifest.chrome === "terminal" && trigger.op?.action === "run" && typeof trigger.op.value === "string" && trigger.op.value.trim()) {
			const cmd = escapeHtml(trigger.op.value.trim());
			const echoed = appendToScrollback(snapshotForPrompt, `<div><span style="color:var(--run)">${escapeHtml(this.promptId())}:~$</span> ${cmd}</div>`);
			if (echoed !== snapshotForPrompt) {
				snapshotForPrompt = echoed;
				await memory.saveSnapshot(windowId, echoed);
				gateway.broadcast("s2c.ui.patch", {
					windowId,
					mode: "full",
					html: echoed
				});
			}
		}
		const snapshot = snapshotForPrompt;
		const renderMode = decideRenderMode({
			firstRender,
			hasSnapshot: snapshot.trim().length > 0,
			isDrag: !!trigger.drag,
			isSpawn: !!trigger.seedPrompt,
			isNavigate: trigger.op?.action === "navigate"
		});
		const regionIds = renderMode === "prefer-incremental" ? extractRegionIds(snapshot) : void 0;
		const prompt = assemblePrompt({
			app,
			memory: mem,
			recent: memory.recentInteractions(windowId),
			globalState: kernelState.snapshotForPrompt(),
			windowSize: {
				w: win.rect.w,
				h: win.rect.h - 36
			},
			op: trigger.op,
			drag: trigger.drag,
			seedPrompt: trigger.seedPrompt,
			firstRender,
			renderMode,
			regionIds,
			terminalPrompt: app.manifest.chrome === "terminal" ? this.promptId() : void 0,
			userProfile: settings.loadSettings().userProfile,
			stylePrompt: settings.loadSettings().prefs.stylePrompt,
			skin: settings.loadSettings().skin,
			snapshotBudget: config.ui.snapshotBudget
		});
		const reason = firstRender ? "first-render" : trigger.op ? `op:${trigger.op.kind}/${trigger.op.action ?? "?"}` : trigger.drag ? `drop:${trigger.drag.kind}` : "?";
		log$8.info(`${app.name} [${windowId.slice(-6)}] ${reason} mode=${renderMode} (prompt ${prompt.length} chars)`);
		const t0 = performance.now();
		let buffer = "";
		let lastStreamed = "";
		const streamedRegions = /* @__PURE__ */ new Map();
		const web = this.deps.webTools?.available() ? this.deps.webTools : void 0;
		const result = await sdk.run({
			role: "ui-generation",
			trigger: firstRender ? "user" : "event",
			prompt,
			abort,
			appName: app.name,
			...web ? {
				tools: WEB_TOOL_SCHEMAS,
				onToolCall: (name, args) => web.exec(name, args),
				maxToolCalls: web.maxCalls
			} : {},
			onDelta: (text) => {
				if (this.isStale(windowId, gen, abort)) return;
				buffer += text;
				if (buffer.includes("<vibeos-applet>")) return;
				const body = extractStreamingHtml(buffer);
				if (body === null) return;
				if (renderMode === "force-full") {
					if (body !== lastStreamed && body.length > lastStreamed.length) {
						lastStreamed = body;
						gateway.broadcast("s2c.ui.patch", {
							windowId,
							mode: "full",
							html: body,
							streaming: true
						});
					}
					return;
				}
				const regions = extractRegions(body);
				if (regions.length === 0) return;
				let rest = body;
				for (const r of regions) rest = rest.replace(r.html, "");
				if (/<\/[a-zA-Z][\w-]*\s*>/.test(rest)) return;
				if (/data-vibeos-region/.test(rest)) return;
				const fresh = regions.filter((r) => streamedRegions.get(r.region) !== r.html);
				if (fresh.length === 0) return;
				for (const r of fresh) streamedRegions.set(r.region, r.html);
				gateway.broadcast("s2c.ui.patch", {
					windowId,
					mode: "regions",
					regions: fresh,
					streaming: true
				});
			}
		});
		if (this.isStale(windowId, gen, abort)) {
			if (this.genCounter.get(windowId) !== gen) log$8.debug(`${app.name} [${windowId.slice(-6)}] result discarded (superseded)`);
			else {
				log$8.warn(`${app.name} [${windowId.slice(-6)}] aborted (${result.error ?? "timeout"})`);
				gateway.broadcast("s2c.ui.busy", {
					windowId,
					busy: false
				});
				gateway.broadcast("s2c.error", {
					code: "ai_failed",
					detail: result.error,
					windowId
				});
			}
			return;
		}
		const dt = (performance.now() - t0).toFixed(0);
		const parsed = parseAiOutput(result.text);
		const current = memory.getMemory(windowId)?.htmlSnapshot ?? mem?.htmlSnapshot ?? "";
		if (app.manifest.chrome === "terminal" && !firstRender && parsed.html !== void 0) {
			const typed = typeof trigger.op?.value === "string" ? trigger.op.value.trim() : "";
			const merged = appendToScrollback(current, stripPromptLines(parsed.html.trim(), typed));
			parsed.html = merged.trim() ? merged : current;
		}
		if (parsed.applet !== void 0) {
			await memory.saveSnapshot(windowId, `<vibeos-applet>${parsed.applet}</vibeos-applet>`);
			gateway.broadcast("s2c.ui.patch", {
				windowId,
				mode: "full",
				applet: parsed.applet,
				done: true
			});
			log$8.info(`${app.name} [${windowId.slice(-6)}] applet ${parsed.applet.length} chars, ${parsed.syscalls.length} syscall(s) in ${dt}ms`);
		} else if (parsed.html !== void 0) {
			await memory.saveSnapshot(windowId, parsed.html);
			gateway.broadcast("s2c.ui.patch", {
				windowId,
				mode: "full",
				html: parsed.html,
				done: true
			});
			log$8.info(`${app.name} [${windowId.slice(-6)}] full render ${parsed.html.length} chars, ${parsed.syscalls.length} syscall(s) in ${dt}ms`);
		} else if (parsed.regions && parsed.regions.length > 0) {
			const merged = applyRegionsServer(current, parsed.regions);
			await memory.saveSnapshot(windowId, merged);
			gateway.broadcast("s2c.ui.patch", {
				windowId,
				mode: "regions",
				regions: parsed.regions,
				done: true
			});
			log$8.info(`${app.name} [${windowId.slice(-6)}] patched ${parsed.regions.length} region(s), ${parsed.syscalls.length} syscall(s) in ${dt}ms`);
		} else {
			gateway.broadcast("s2c.ui.busy", {
				windowId,
				busy: false
			});
			log$8.warn(`${app.name} [${windowId.slice(-6)}] no HTML returned (ok=${result.ok}, text ${result.text.length} chars) in ${dt}ms`);
			if (!result.ok) gateway.broadcast("s2c.error", {
				code: "ai_failed",
				detail: result.error,
				windowId
			});
		}
		if (parsed.summary) {
			await memory.saveSummary(windowId, parsed.summary);
			log$8.debug(`  summary: ${parsed.summary}`);
		}
		const what = parsed.summary || (parsed.html !== void 0 ? "Rendered full window" : parsed.regions?.length ? `Patched ${parsed.regions.length} region(s)` : "No output");
		sdk.recordSummary(result.runId, what);
		if (parsed.syscalls.length > 0) {
			log$8.debug(`  syscalls: ${parsed.syscalls.map((c) => c.type).join(", ")}`);
			await syscalls.execute(parsed.syscalls, {
				windowId,
				appId: app.id,
				source: "syscall"
			});
		}
	}
};
//#endregion
//#region src/host/ai/appSearch.ts
const log$7 = logger("app-search");
const SEARCH_INSTRUCTION = `You are the app search engine of VibeOS, an AI operating system where any app can be hallucinated into existence. Given a user's query, return a list of 4-8 plausible results that would satisfy it — a mix of obvious matches and a couple of imaginative ones. They don't need to exist; they will be generated on demand.

Reply with ONLY a fenced JSON code block, nothing else:
\`\`\`json
{ "results": [
  { "name": "App Name", "description": "one short line", "icon": "calculator", "kind": "app" }
] }
\`\`\`
Rules:
- name ≤ 30 chars; description ≤ 60 chars.
- kind: "widget" for a small, glanceable, single-purpose panel (clock, weather, stocks ticker, timer, mini player, to-do, system stat); "app" for a full interactive application (editor, browser, game, file tool, dashboard). Pick the more natural form for each result; include a sensible mix.
- icon: choose the SINGLE closest name from THIS list ONLY, nothing else: ${[
	"globe",
	"terminal",
	"folder",
	"settings",
	"calculator",
	"music",
	"mail",
	"image",
	"calendar",
	"map",
	"gamepad-2",
	"notebook-pen",
	"cloud-sun",
	"palette",
	"paint-brush",
	"app-window",
	"file-text",
	"chat",
	"camera",
	"clock",
	"timer",
	"star",
	"heart",
	"user",
	"search",
	"bell",
	"video",
	"book-open",
	"shopping-cart",
	"code",
	"database",
	"chart-bar",
	"compass",
	"home",
	"wrench",
	"cloud",
	"sun",
	"moon",
	"trophy",
	"gift",
	"lightbulb",
	"fire",
	"leaf",
	"heartbeat",
	"barbell",
	"fork-knife",
	"coffee",
	"wallet",
	"credit-card",
	"briefcase",
	"car",
	"airplane",
	"rocket",
	"newspaper",
	"graduation-cap",
	"bug",
	"lightning"
].join(", ")}. Never invent a name, never use an emoji.
No prose outside the block.`;
const JSON_RE = /```(?:json)?\s*([\s\S]*?)```/i;
/** Spotlight search micro-agent. A newer keystroke aborts the older query. */
var AppSearch = class {
	sdk;
	constructor(sdk) {
		this.sdk = sdk;
	}
	async searchApps(query, abort) {
		const t0 = performance.now();
		const result = await this.sdk.run({
			role: "system-event",
			trigger: "user",
			systemPromptOverride: SEARCH_INSTRUCTION,
			prompt: `[QUERY]\n${query}`,
			appName: "App Search",
			abort
		});
		if (abort?.signal.aborted) return [];
		const parsed = parse(result.text);
		this.sdk.recordSummary(result.runId, `"${query}" → ${parsed.length} results`);
		log$7.info(`"${query}" → ${parsed.length} results in ${(performance.now() - t0).toFixed(0)}ms`);
		return parsed;
	}
};
function parse(text) {
	const block = JSON_RE.exec(text)?.[1] ?? text;
	try {
		const json = JSON.parse(block);
		return (Array.isArray(json.results) ? json.results : []).map((r) => {
			const o = r;
			if (typeof o.name !== "string") return null;
			const name = stripEmoji(o.name).slice(0, 40);
			if (!name) return null;
			const rawIcon = typeof o.icon === "string" ? stripEmoji(o.icon).trim() : "";
			return {
				name,
				description: typeof o.description === "string" ? stripEmoji(o.description).slice(0, 80) : "",
				icon: rawIcon || "app-window",
				kind: o.kind === "widget" ? "widget" : "app"
			};
		}).filter((r) => r !== null).slice(0, 8);
	} catch {
		log$7.warn("could not parse search results");
		return [];
	}
}
//#endregion
//#region src/host/ai/commandPalette.ts
const log$6 = logger("command");
const INSTRUCTION = `You are the COMMAND interpreter of VibeOS, an AI operating system. The user types a natural-language command; you carry it out by operating the OS on their behalf — emitting system calls.

Reply with ONLY a fenced code block tagged vibeos-syscall containing JSON, nothing else:
\`\`\`vibeos-syscall
{ "calls": [ { "type": "...", ... } ] }
\`\`\`

Available calls:
- open (appId) — open/focus an EXISTING app. Use an id from installedApps.
- spawn-window (title, prompt, width?, height?) — create + generate a NEW app/window live. Use for "open/make/create a <thing>" when no installed app matches. "prompt" describes what the window should show.
- install (name, icon, manifest?) — add a NEW app + desktop shortcut. icon = a lucide-react icon name in kebab-case (e.g. "calculator", "music", "calendar"). Use only when the user wants it permanently added.
- create-file (name, mime?, content?, location?) — create a file (location defaults to "desktop").
- close (windowId) / focus (windowId) — act on a window from openWindows.
- notify (title, body?, kind?) — show a notification.

Rules:
- Choose the SMALLEST set of calls that fulfills the command. Prefer 'open' for an existing app; 'spawn-window' to create something new; 'install' only to add permanently.
- ALWAYS end with a 'notify' call briefly confirming what you did, written in the user's language.
- If the command is unclear or impossible, emit ONLY a single 'notify' explaining that.
- Output nothing outside the vibeos-syscall block.`;
/**
* Interpret a natural-language command into a batch of syscalls. The caller
* executes them. A newer command aborts this one (abort → empty batch).
*/
var CommandPalette = class {
	sdk;
	deps;
	constructor(sdk, deps) {
		this.sdk = sdk;
		this.deps = deps;
	}
	async runCommand(text, abort) {
		const t0 = performance.now();
		const result = await this.sdk.run({
			role: "system-event",
			trigger: "user",
			systemPromptOverride: `${INSTRUCTION}\n\nCURRENT SYSTEM STATE:\n${this.systemContext()}`,
			prompt: `[COMMAND]\n${text}`,
			appName: "Command",
			abort
		});
		if (abort?.signal.aborted) return [];
		const { syscalls } = parseAiOutput(result.text);
		this.sdk.recordSummary(result.runId, `"${text}" → ${syscalls.length} call(s)`);
		log$6.info(`"${text}" → ${syscalls.map((c) => c.type).join(", ") || "none"} in ${(performance.now() - t0).toFixed(0)}ms`);
		return syscalls;
	}
	/** Compact snapshot of what the command can act on (installed apps, open windows). */
	systemContext() {
		const installedApps = this.deps.listApps().map((a) => ({
			id: a.id,
			name: a.name,
			preset: a.presetId ?? null
		}));
		const openWindows = this.deps.listOpenWindows().map((w) => ({
			windowId: w.id,
			title: w.title,
			appId: w.appId
		}));
		return JSON.stringify({
			installedApps,
			openWindows
		});
	}
};
//#endregion
//#region src/host/ai/modelPolicy.ts
var ModelPolicy = class {
	ctx;
	config;
	getSettings;
	/** Flash-preferred default, primed once at boot; null until priming lands. */
	primedDefault = null;
	constructor(ctx, config, getSettings) {
		this.ctx = ctx;
		this.config = config;
		this.getSettings = getSettings;
	}
	/**
	* When neither settings nor config pin a model, prefer a "flash" model from
	* the agent-default provider's catalog over the (typically heavier) current
	* selection. resolve() stays sync: it reads this cache, falling back to
	* currentSelection() until priming completes.
	*/
	async primeDefaults() {
		const selection = this.ctx.agentDefaultModel.currentSelection();
		let model = selection.model;
		try {
			const flash = (await this.ctx.llm.listModels(selection.provider)).find((m) => m.id.toLowerCase().includes("flash"));
			if (flash) model = flash.id;
		} catch {}
		this.primedDefault = {
			provider: selection.provider,
			model
		};
	}
	resolve(role) {
		const roleConfig = role === "ui" ? this.config.ui : this.config.fast;
		const reasoningEffort = roleConfig.reasoningEffort;
		const override = this.getSettings().modelOverrides[role];
		if (override?.provider && override.model) return {
			provider: override.provider,
			model: override.model,
			reasoningEffort,
			source: "settings"
		};
		const configured = roleConfig.model;
		if (configured?.provider && configured.model) return {
			provider: configured.provider,
			model: configured.model,
			reasoningEffort,
			source: "config"
		};
		if (role === "fast") return {
			...this.resolve("ui"),
			reasoningEffort
		};
		const fallback = this.primedDefault ?? this.ctx.agentDefaultModel.currentSelection();
		return {
			provider: fallback.provider,
			model: fallback.model,
			reasoningEffort,
			source: "default"
		};
	}
	effectiveModels() {
		return {
			ui: this.resolve("ui"),
			fast: this.resolve("fast")
		};
	}
	/** Advisory catalog for the Settings ModelsPane; a provider that fails to list yields []. */
	async listCatalog() {
		const out = [];
		for (const provider of this.ctx.llm.listProviders()) try {
			const models = await this.ctx.llm.listModels(provider.id);
			out.push({
				provider: provider.id,
				models: models.map((m) => ({
					id: m.id,
					name: m.name
				}))
			});
		} catch {
			out.push({
				provider: provider.id,
				models: []
			});
		}
		return out;
	}
};
//#endregion
//#region src/host/prompt/systemPrompts.ts
const DESIGN_SYSTEM = `
VibeOS DESIGN SYSTEM — every screen MUST follow this so all apps look like one cohesive OS:
- Use CSS variables that the shell provides; NEVER hardcode hex colors. Available vars:
  var(--background) var(--foreground) var(--card) var(--card-foreground) var(--muted)
  var(--muted-foreground) var(--border) var(--primary) var(--primary-foreground)
  var(--accent) var(--accent-foreground) var(--brand) var(--destructive)
  var(--run)(green) var(--warn)(amber) var(--radius)(0.625rem).
- Surfaces: background var(--background); cards/panels background var(--card) with
  1px solid var(--border) and border-radius var(--radius).
- Text: primary text var(--foreground); secondary/labels var(--muted-foreground).
- Accent / primary actions use var(--brand) or var(--primary).
- Font: inherit (the OS sets Geist); use system font stack, never custom @font.
- Spacing rhythm: 8px / 12px / 16px. Generous padding (12–16px) on panels.
- Buttons: padding 6px 12px; border-radius calc(var(--radius) - 2px); subtle, flat,
  no heavy shadows; hover slightly lighter via background var(--accent).
- Inputs: background var(--background); 1px solid var(--border); border-radius
  calc(var(--radius) - 2px); padding 6px 10px.
- Keep it clean, neutral, modern (think macOS/shadcn) — minimal, lots of whitespace,
  thin borders, no gradients unless subtle.
- ABSOLUTELY NO EMOJI anywhere — not in headings, labels, buttons, list items,
LOOPING ANIMATION (allowed, use tastefully): reference these predefined keyframes from INLINE style only — animation: vibe-spin 2s linear infinite (rotation: discs, loaders), vibe-pulse 1.6s ease-in-out infinite (breathing emphasis), vibe-blink 1.1s step-end infinite (cursors, recording dots), vibe-bounce 1s ease-in-out infinite, vibe-float 3s ease-in-out infinite (hovering cards), vibe-marquee 8s linear infinite (scrolling text inside an overflow:hidden parent), vibe-shimmer 1.8s linear infinite (loading sweeps; pair with a 200% background gradient), vibe-eq 0.9s ease-in-out infinite (audio bars: several thin bars with different animation-delay + transform-origin:bottom). These are the ONLY animation names that exist; @keyframes cannot be declared (no <style>). Music players, visualizers and dashboards SHOULD animate. 
  icons, placeholders, or content. Use text, simple inline SVG, or CSS shapes
  for icons instead. This is a hard rule with no exceptions.
- NEVER reveal that this OS is AI-driven. User-visible text must NEVER contain
  words like "AI", "model", "assistant", "generated", "LLM", "prompt",
  "人工智能", "模型", "生成". You ARE the program — never describe yourself as
  producing or generating the interface. Loading/progress copy stays neutral:
  "加载中" / "Loading", "处理中" / "Working". This is a hard rule with no
  exceptions.

RESPONSIVE — the window can be ANY size and the user can resize it both ways, so the UI MUST fluidly adapt:
- Return ONE single root element that fills the window: style="height:100%;width:100%;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden".
- VERTICAL FILL (important): the layout must stretch to the FULL height — never leave an empty gap at the bottom when the window is tall. Give the main content area flex:1 (and min-height:0) so it absorbs all remaining vertical space; headers/toolbars/footers stay flex:0 0 auto. A footer/status bar should sit at the very bottom (use margin-top:auto or a flex:1 content area above it).
- Use fluid layout: flex / grid with fr units / %, min-width:0, gap. NEVER hardcode fixed pixel widths/heights for layout containers.
- The scrollable content region uses overflow:auto with flex:1 + min-height:0 so it scrolls inside the window instead of overflowing.
- box-sizing:border-box on padded boxes. Prefer max-width + width:100% over fixed widths.
- The current window size is provided in GLOBAL STATE — design for it, but stay fluid for resizes in BOTH dimensions.`;
const OUTPUT_CONTRACT = `
CHOOSE YOUR OUTPUT FORMAT FIRST:
APPLETS — REAL JAVASCRIPT (for games, simulations, canvas toys, editors): when the app genuinely needs a game loop, physics, canvas drawing, audio synthesis or per-frame input, do NOT fake it frame-by-frame. Instead answer with a SINGLE <vibeos-applet>...</vibeos-applet> block containing a complete self-contained HTML document (your own <style> and <script> are allowed and DO run). It executes in a sandboxed iframe with no network and no access to the OS, so everything must be inline — no external URLs, no imports, no fetch. Size the layout to 100% width/height of its frame and use the injected CSS variables (var(--background), var(--foreground), var(--primary), var(--brand)...) so it matches the current skin. Inside an applet the global 'vibeos' API is available: vibeos.op(action, data) hands an event back to the OS for a follow-up render, vibeos.notify(title, body) raises a system notification, vibeos.setTitle(t), vibeos.close(). An applet output replaces the window body entirely — do not mix it with <vibeos-html> or regions in the same reply. Use plain <vibeos-html> for everything that is ordinary UI; reach for an applet only when real interactivity per frame is the point (snake, tetris, paint, synth, particle demo, physics sandbox). GAME RULES: start the loop IMMEDIATELY on load — no "press start" gate (a pause/restart control is fine); bind BOTH keyboard (window keydown, preventDefault on arrows/space so nothing scrolls) AND on-screen buttons for every control; size the canvas to its container and handle resize.

Otherwise answer with the ordinary markup contract below.

You MUST reply with EXACTLY these three parts, in this order, and nothing else:

1. An HTML fragment wrapped in <vibeos-html>…</vibeos-html>.
   - It is the BODY of an application window. Do NOT include <html>, <head>, <body>, <script>, or <style> tags.
   - Style ONLY with inline style="" attributes, using the VibeOS design system variables above. Do NOT invent your own color palette — reuse the OS tokens so every app looks consistent.
   - You MAY use <form>, <input>, <button>, <select>, <textarea>, <ul>/<li>, <table>, etc.
   - CRITICAL: EVERY interactive element (buttons, links, clickable list items, file/folder icons, tabs, menu items, inputs, forms) MUST carry data-vibeos-action="<verb>" describing what it does (e.g. data-vibeos-action="open-email" data-id="3"). Add extra data-* attributes for context. When MANY controls share one action (calculator keys, list rows, grid cells, color swatches), give each a DISTINGUISHING data attribute (e.g. data-value="7") so the OS can tell them apart — never make them ambiguous. If the user can interact with it, it MUST have data-vibeos-action — otherwise it will do nothing.
   - Actions trigger on a SINGLE click. Do NOT rely on double-click, hover, or right-click to open things — make a single click open files, folders, list rows, etc. (a double-click is also accepted, but single click must work).
   - Wrap text inputs in a <form data-vibeos-action="..."> so Enter submits, and ALWAYS give each input a name="" (e.g. name="url", name="query", name="message"). The user's typed text is delivered back to you in the OPERATION as value="…" and form={…}.
   - USE THE USER'S INPUT: when an OPERATION includes a submitted value/form, your new UI MUST be a direct response to THAT text — search for it, navigate to it, send it, compute it, etc. NEVER ignore it or render generic/random content that doesn't match what the user typed.
   - EVERYTHING RESPONDS: every visible control MUST carry data-vibeos-action, and every user interaction MUST produce a visible change in the next render. Never render decorative dead controls.
   - Terminal/console/command apps MUST respond plausibly to ANY submitted command — an unknown command still gets program-consistent output (like a real shell: an error line, or simulated results). Never ignore a submitted command.
   - Free-form input submitted via Enter or a form MUST always be answered in the UI.
   - Never wire text inputs to per-keystroke behavior; inputs respond only when submitted (Enter, form submit, or a dedicated button).
   - INCREMENTAL UPDATES (prefer this): tag stable parts of your first render with data-vibeos-region="<stable-id>". On later interactions, return ONLY the region(s) that actually changed — do NOT re-emit the whole window. When a region ACCUMULATES content (terminal scrollback, chat log, feed, list you append to), you MUST include ALL the previous content of that region (it's provided to you in CURRENT UI) plus the new lines — never replace it with just the new part, or earlier content will be lost. Only return the full body when the layout itself changes structurally.
   - STATEFUL INPUTS: when you re-render after an input/submit, you MUST set the value="" of inputs to reflect the new state. E.g. a browser address bar must show the URL the user just navigated to (value="https://..."), a search box keeps the submitted query, a logged-in form clears. Never blank out or revert a value the user just entered unless the action's purpose is to clear it. Prefer patching just the content region (data-vibeos-region) and leaving the input region untouched when only the page body changed.
   - DRAG & DROP (optional): make an item draggable to other apps by adding draggable="true" data-vibeos-drag plus data-drag-kind="text|image|file" data-drag-ref="<value/url/id>" data-drag-label="<name>". When the user drops something onto this window, you receive it as the OPERATION (a "dropped" item with its kind/ref/label) — react to it.
   - Make it feel like a real, lived-in application with believable, specific (hallucinated) content.

2. A fenced code block tagged vibeos-syscall containing JSON, OR omit it if there are no system effects:
\`\`\`vibeos-syscall
{ "calls": [ { "type": "notify", "title": "...", "body": "...", "kind": "info" } ] }
\`\`\`
   Allowed call types:
   - notify (title, body, kind)
   - open (appId) — open/focus an existing app's window
   - spawn-window (title, prompt, width?, height?) — pop up a NEW window and generate its content from "prompt". Use this whenever an action should open something in a separate window (a detail view, a dialog, "open in new window", a document, a nested app, etc.). The prompt should describe what that window shows.
   - install (name, icon, manifest) — add a new app + desktop shortcut. icon MUST be a lucide-react icon name in kebab-case (e.g. "calculator", "music", "mail", "image", "calendar", "map", "gamepad-2", "notebook-pen"). NEVER an emoji.
   - create-file (name, mime, content, location)
   - focus (windowId), close (windowId)
   - chrome (set) — update THIS window's native shell when it has one (e.g. a browser address bar): { "type": "chrome", "set": { "url": "https://…", "title": "…" } }

3. A one-sentence episode summary wrapped in <vibeos-summary>…</vibeos-summary> describing what just happened.

Never explain yourself outside these tags. Never output markdown prose.`;
const WEB_TOOLS_NOTE = `
REAL DATA (tools): you may call web_search / web_fetch to ground your UI in real internet data — real websites, real search results, live information. When the user navigates to a real site or searches in a search engine, you SHOULD call them and reproduce the real page/results faithfully: real titles, real snippets, real link targets carried in data-url. Call tools BEFORE emitting <vibeos-html>; never emit partial HTML first. If a tool fails, render a believable page anyway — never surface tool errors to the user.`;
const UI_ROLE = `You are the live UI engine of VibeOS, an operating system whose entire interface is hallucinated in real time by you. The user interacts with a window; you decide what its contents become next, as if it were a real program responding to their action. Stay consistent with the window's prior state and episode memory. Keep a single, cohesive visual language across ALL apps (see design system). Be imaginative but coherent — this is a believable simulated computer, not a chatbot.
${DESIGN_SYSTEM}`;
const SYSTEM_EVENT_ROLE = `You are the ambient system daemon of VibeOS. Invent ONE small, believable system event (a new "email", a background "update", a reminder, a friend "messaging"). Be brief and atmospheric. NEVER use emoji in the title or body. NEVER reveal AI involvement — the title and body must not contain "AI", "model", "assistant", "generated", "人工智能", "模型" or "生成"; events read like a real OS.

Reply with NOTHING but this exact structure — no tools, no reasoning, no prose:
\`\`\`vibeos-syscall
{ "calls": [ { "type": "notify", "title": "<short>", "body": "<one line>", "kind": "info" } ] }
\`\`\`
<vibeos-summary>One sentence describing the event.</vibeos-summary>

If nothing fits, reply with an empty calls array. Output the answer immediately in your first message.`;
const MAINTENANCE_ROLE = `You are the memory-consolidation daemon of VibeOS. Given a window's recent interactions and current episode summary, produce a single concise updated episode summary (1-3 sentences) capturing the durable narrative state, discarding transient detail. Respond ONLY with a vibeos-summary block.`;
function systemPromptFor(role) {
	switch (role) {
		case "ui-generation": return `${UI_ROLE}\n${OUTPUT_CONTRACT}\n${WEB_TOOLS_NOTE}`;
		case "system-event": return SYSTEM_EVENT_ROLE;
		case "maintenance": return MAINTENANCE_ROLE;
	}
}
/**
* Appended to every system prompt so ALL generated content (app UIs,
* notifications, summaries, app-search results) is written in the user's
* chosen language. Structural tokens (HTML tags, syscall JSON) are unaffected.
*/
function localeDirective(locale) {
	return locale === "en" ? `\n\nLANGUAGE: Write ALL user-facing text (UI labels, content, notification titles and bodies, summaries) in English. Do NOT translate HTML tag/attribute names or the syscall JSON keys.` : `\n\nLANGUAGE: 所有面向用户的文本（界面文字、正文内容、通知标题与正文、摘要）必须使用简体中文。不要改动 HTML 标签/属性名或 syscall JSON 的键名。`;
}
//#endregion
//#region src/host/ai/llmClient.ts
/**
* Contract (frozen): abort/preemption → ok:false with NO error; a finish
* error with non-empty streamed text is salvaged as ok:true.
* Tool rounds: on finish kind 'tool-calls' the calls are executed and the
* loop continues; the returned text is the FINAL round's text.
*/
async function runLlm(ctx, o) {
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: o.prompt
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-vibeos"
		}
	})];
	const totals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0,
		seen: false
	};
	let calls = 0;
	const maxCalls = o.maxToolCalls ?? 3;
	for (;;) {
		const options = {
			provider: o.provider,
			model: o.model,
			reasoningEffort: o.reasoningEffort,
			messages,
			system: o.system,
			maxTokens: o.maxTokens,
			...o.tools?.length && calls < maxCalls ? { tools: o.tools } : {},
			signal: o.abort.signal
		};
		let text = "";
		const toolCalls = [];
		let usage;
		let finish = { kind: "stop" };
		for await (const chunk of ctx.llm.stream(options)) if (chunk.type === "text-delta") {
			text += chunk.text;
			o.onDelta?.(chunk.text);
		} else if (chunk.type === "block-end" && chunk.block.type === "tool-call") toolCalls.push(chunk.block);
		else if (chunk.type === "usage") usage = chunk.usage;
		else if (chunk.type === "finish") finish = chunk.reason;
		if (usage) {
			totals.seen = true;
			totals.input += usage.inputTokens + (usage.cacheReadTokens ?? 0);
			totals.output += usage.outputTokens;
			totals.cacheRead += usage.cacheReadTokens ?? 0;
			totals.cacheWrite += usage.cacheWriteTokens ?? 0;
			totals.reasoning += usage.reasoningTokens ?? 0;
		}
		if (finish.kind === "aborted") return {
			text,
			ok: false
		};
		if (finish.kind === "tool-calls" && toolCalls.length && o.onToolCall && calls < maxCalls) {
			messages.push(createAssistantMessage({
				content: [...text ? [{
					type: "text",
					text
				}] : [], ...toolCalls],
				source: {
					provider: o.provider,
					model: o.model
				}
			}));
			for (const call of toolCalls) {
				calls++;
				const result = calls <= maxCalls ? await o.onToolCall(call.name, call.arguments) : {
					text: "tool budget exhausted",
					isError: true
				};
				messages.push(createToolResultMessage({
					callId: call.id,
					content: [{
						type: "text",
						text: result.text
					}],
					isError: result.isError
				}));
			}
			continue;
		}
		if (finish.kind === "error") return {
			text,
			ok: text.length > 0,
			error: text ? void 0 : `${finish.failure.code}: ${finish.failure.message}`,
			usage: sumUsage(totals)
		};
		return {
			text,
			ok: true,
			usage: sumUsage(totals)
		};
	}
}
/** VibeOS inputTokens = billed input, so cache reads fold back in. */
function sumUsage(t) {
	if (!t.seen) return void 0;
	return {
		inputTokens: t.input,
		outputTokens: t.output,
		cacheReadTokens: t.cacheRead,
		cacheWriteTokens: t.cacheWrite,
		reasoningTokens: t.reasoning
	};
}
//#endregion
//#region src/host/ai/stub.ts
/** Deterministic offline stub so the OS is usable without any model calls. */
function stubResponse(role, prompt) {
	if (role === "ui-generation") {
		if (prompt.includes("just launched")) return `<vibeos-html>
<div data-vibeos-region="root" style="display:flex;flex-direction:column;gap:12px;padding:8px">
  <h2 style="margin:0;font-size:18px">Hello from VibeOS (stub)</h2>
  <p style="color:#888;margin:0">The text model is in stub mode. Disable the aiStub config to go live.</p>
  <button data-vibeos-action="ping" style="align-self:flex-start;padding:6px 12px;border:1px solid #555;border-radius:8px;background:transparent;color:inherit">Ping</button>
</div>
</vibeos-html>
<vibeos-summary>The app launched in stub mode.</vibeos-summary>`;
		return `<vibeos-html>
<div data-vibeos-region="root" style="padding:8px">
  <p style="margin:0">You interacted (stub). Time: ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}</p>
  <button data-vibeos-action="ping" style="margin-top:8px;padding:6px 12px;border:1px solid #555;border-radius:8px;background:transparent;color:inherit">Ping again</button>
</div>
</vibeos-html>
<vibeos-summary>The user pinged the stub app.</vibeos-summary>`;
	}
	if (role === "system-event") return `\`\`\`vibeos-syscall
{ "calls": [ { "type": "notify", "title": "System (stub)", "body": "A quiet moment passes in VibeOS.", "kind": "info" } ] }
\`\`\`
<vibeos-summary>An ambient stub event fired.</vibeos-summary>`;
	return `<vibeos-summary>Memory consolidated (stub).</vibeos-summary>`;
}
//#endregion
//#region src/host/ai/SdkManager.ts
const log$5 = logger("sdk");
/** Failure codes worth waiting out before the single same-model retry. */
const RETRYABLE_CODES = /* @__PURE__ */ new Set([
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT",
	"EMPTY_RESPONSE"
]);
const FALLBACK_RETRY_DELAY_MS = 1500;
/**
* The single seam between the OS and the model. Resolves the role's model +
* localized system prompt, tracks the run for the Activity Monitor, handles
* stub mode, then streams through ctx.llm. Callers never see the provider.
*/
var SdkManager = class {
	ctx;
	config;
	policy;
	runs;
	gateway;
	getSettings;
	/** Live runs by id → their abort controller, so the UI can stop one. */
	runRegistry = /* @__PURE__ */ new Map();
	/** Runs the user explicitly stopped (recorded as "aborted", not "error"). */
	stoppedRuns = /* @__PURE__ */ new Set();
	constructor(ctx, config, policy, runs, gateway, getSettings) {
		this.ctx = ctx;
		this.config = config;
		this.policy = policy;
		this.runs = runs;
		this.gateway = gateway;
		this.getSettings = getSettings;
		ctx.effect(() => () => {
			for (const controller of this.runRegistry.values()) controller.abort();
			this.runRegistry.clear();
		}, "vibeos: abort inflight generations");
	}
	/** Abort an in-flight run by id (Activity Monitor "Stop"). */
	stopRun(runId) {
		const controller = this.runRegistry.get(runId);
		if (!controller) return;
		this.stoppedRuns.add(runId);
		controller.abort();
	}
	/** Attach a one-line summary of what a run produced, and re-broadcast it. */
	recordSummary(runId, summary) {
		if (!runId || !summary.trim()) return;
		this.runs.setSummary(runId, summary.trim().slice(0, 200)).then((run) => {
			if (run) this.gateway.broadcast("s2c.agent.run", { run });
		}).catch((e) => log$5.warn(`recordSummary failed: ${String(e)}`));
	}
	async run(opts) {
		const modelRole = opts.role === "ui-generation" ? "ui" : "fast";
		const resolved = this.policy.resolve(modelRole);
		const run = await this.runs.startRun({
			role: opts.role,
			trigger: opts.trigger,
			model: resolved.model,
			provider: resolved.provider,
			appName: opts.appName
		});
		this.gateway.broadcast("s2c.agent.run", { run });
		const finish = async (result) => {
			this.runRegistry.delete(run.id);
			const status = this.stoppedRuns.has(run.id) ? "aborted" : result.ok ? "ok" : "error";
			this.stoppedRuns.delete(run.id);
			const finished = await this.runs.endRun(run.id, status, result.error, result.usage);
			if (finished) this.gateway.broadcast("s2c.agent.run", { run: finished });
			return {
				...result,
				runId: run.id
			};
		};
		if (this.config.aiStub) {
			const text = stubResponse(opts.role, opts.prompt);
			opts.onDelta?.(text);
			return finish({
				text,
				ok: true
			});
		}
		const locale = this.getSettings().locale ?? this.config.locale ?? "zh";
		const systemPrompt = (opts.systemPromptOverride ?? systemPromptFor(opts.role)) + localeDirective(locale);
		const controller = opts.abort ?? new AbortController();
		const preempt = controller.signal;
		this.runRegistry.set(run.id, controller);
		const maxTokens = modelRole === "ui" ? this.config.ui.maxTokens : this.config.fast.maxTokens;
		const genTimeoutMs = this.config.ui.genTimeoutMs;
		const attempt = async (stream) => {
			const abort = new AbortController();
			const onPreempt = () => abort.abort();
			if (preempt.aborted) abort.abort();
			else preempt.addEventListener("abort", onPreempt, { once: true });
			let timedOut = false;
			let timer;
			const arm = () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					timedOut = true;
					abort.abort();
				}, genTimeoutMs);
			};
			arm();
			try {
				const r = await runLlm(this.ctx, {
					system: systemPrompt,
					prompt: opts.prompt,
					provider: resolved.provider,
					model: resolved.model,
					reasoningEffort: resolved.reasoningEffort,
					maxTokens,
					abort,
					tools: opts.tools,
					onToolCall: opts.onToolCall,
					maxToolCalls: opts.maxToolCalls,
					onDelta: stream && opts.onDelta ? (t) => {
						arm();
						opts.onDelta(t);
					} : void 0
				});
				return {
					result: timedOut ? {
						...r,
						ok: false,
						error: `timed out after ${genTimeoutMs}ms`
					} : r,
					timedOut
				};
			} finally {
				clearTimeout(timer);
				preempt.removeEventListener("abort", onPreempt);
			}
		};
		log$5.debug(`query ${opts.role} via ${resolved.provider} model=${resolved.model} effort=${resolved.reasoningEffort} locale=${locale}`);
		let { result, timedOut } = await attempt(true);
		if (!result.ok && !timedOut && !preempt.aborted) {
			log$5.warn(`${resolved.provider}/${resolved.model} failed (${result.error}); retrying once`);
			await this.retryDelay(resolved.provider, result.error);
			if (!preempt.aborted) ({result, timedOut} = await attempt(false));
		}
		if (!result.ok) log$5.error(`run failed (${opts.role}): ${result.error ?? "unknown"}`);
		return finish(result);
	}
	async retryDelay(provider, error) {
		const code = error?.split(":", 1)[0]?.trim();
		if (!code || !RETRYABLE_CODES.has(code)) return;
		let delayMs = FALLBACK_RETRY_DELAY_MS;
		try {
			const policy = this.ctx.llm.providerRetryPolicy(provider);
			delayMs = Math.min(policy.initialDelayMs, policy.maxDelayMs);
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
};
//#endregion
//#region src/host/gateway/trust.ts
const LOOPBACK_HOSTNAMES = /* @__PURE__ */ new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"[::1]"
]);
function headerValue(req, name) {
	const v = req.headers[name];
	return Array.isArray(v) ? v[0] : v;
}
function hostIsLoopback(host) {
	if (!host) return false;
	try {
		return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
	} catch {
		return false;
	}
}
function secFetchSiteOk(req) {
	const site = headerValue(req, "sec-fetch-site");
	return site === void 0 || site === "same-origin" || site === "none";
}
function isTrustedUpgrade(req) {
	const host = headerValue(req, "host");
	if (!hostIsLoopback(host)) return false;
	const origin = headerValue(req, "origin");
	if (origin !== void 0) try {
		if (new URL(origin).host !== host) return false;
	} catch {
		return false;
	}
	return secFetchSiteOk(req);
}
/** Same fence minus the Origin requirement (plain same-origin GETs omit it). */
function isTrustedHttp(req) {
	return hostIsLoopback(headerValue(req, "host")) && secFetchSiteOk(req);
}
//#endregion
//#region src/host/gateway/httpRoutes.ts
const IMAGE_ROUTE_PATH = "/vibeos/img";
function registerImageRoute(ctx, store) {
	return ctx.webServer.register({
		kind: "prefix",
		path: IMAGE_ROUTE_PATH,
		handler: async (req, res) => {
			if (!isTrustedHttp(req)) {
				res.writeHead(403).end();
				return;
			}
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405).end();
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
			const id = pathname.startsWith(`/vibeos/img/`) ? pathname.slice(12) : "";
			const img = id ? await store.get(id) : null;
			if (!img) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, {
				"Content-Type": img.mime,
				"Content-Length": img.bytes.length,
				"Cache-Control": "public, max-age=31536000, immutable"
			});
			res.end(req.method === "HEAD" ? void 0 : Buffer.from(img.bytes));
		}
	});
}
//#endregion
//#region src/shared/protocol/schema.ts
/**
* Runtime validation for inbound client->server messages. The WS boundary is the
* one place untrusted input enters the host, so every frame is parsed here
* before dispatch. HOST-ONLY value import: never pull this module into the
* client bundle (it would drag zod in).
*/
const aiOp = z.object({
	kind: z.enum([
		"click",
		"input",
		"submit",
		"change",
		"key",
		"custom"
	]),
	action: z.string().optional(),
	sel: z.string().optional(),
	dataset: z.record(z.string(), z.string()).optional(),
	value: z.string().optional(),
	formData: z.record(z.string(), z.string()).optional()
});
const dragPayload = z.object({
	kind: z.enum([
		"text",
		"image",
		"file",
		"desktop-object",
		"app-shortcut"
	]),
	ref: z.string(),
	label: z.string().optional()
});
const dropTarget = z.object({
	windowId: z.string().optional(),
	action: z.string().optional(),
	sel: z.string().optional()
});
const empty = z.object({});
/** Build a `{ type: <literal>, payload }` message schema, preserving the literal. */
const msg = (type, payload) => z.object({
	type: z.literal(type),
	payload
});
const clientToServerSchema = z.discriminatedUnion("type", [
	msg("c2s.boot.hello", z.object({ clientId: z.string().optional() })),
	msg("c2s.op", z.object({
		windowId: z.string(),
		op: aiOp
	})),
	msg("c2s.op.dragdrop", z.object({
		windowId: z.string().optional(),
		source: dragPayload,
		target: dropTarget
	})),
	msg("c2s.window.open", z.object({
		appId: z.string(),
		hint: z.string().optional()
	})),
	msg("c2s.window.close", z.object({ windowId: z.string() })),
	msg("c2s.window.focus", z.object({ windowId: z.string() })),
	msg("c2s.window.minimize", z.object({ windowId: z.string() })),
	msg("c2s.window.maximize", z.object({ windowId: z.string() })),
	msg("c2s.window.move", z.object({
		windowId: z.string(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number()
	})),
	msg("c2s.window.reorder", z.object({ ids: z.array(z.string()) })),
	msg("c2s.window.undo", z.object({ windowId: z.string() })),
	msg("c2s.window.redo", z.object({ windowId: z.string() })),
	msg("c2s.vfs.move", z.object({
		nodeId: z.string(),
		location: z.enum([
			"desktop",
			"folder",
			"recyclebin"
		]),
		x: z.number().optional(),
		y: z.number().optional(),
		parentId: z.string().optional()
	})),
	msg("c2s.vfs.open", z.object({ nodeId: z.string() })),
	msg("c2s.vfs.delete", z.object({ nodeId: z.string() })),
	msg("c2s.vfs.empty", empty),
	msg("c2s.settings.update", z.object({ partial: z.record(z.string(), z.unknown()) })),
	msg("c2s.app.uninstall", z.object({ appId: z.string() })),
	msg("c2s.wallpaper.upload", z.object({ dataUrl: z.string() })),
	msg("c2s.notification.read", z.object({ id: z.string() })),
	msg("c2s.notification.click", z.object({ id: z.string() })),
	msg("c2s.app.search", z.object({
		query: z.string(),
		requestId: z.string()
	})),
	msg("c2s.command.run", z.object({
		text: z.string(),
		requestId: z.string()
	})),
	msg("c2s.app.launch", z.object({
		name: z.string(),
		description: z.string().optional(),
		icon: z.string().optional(),
		widget: z.boolean().optional()
	})),
	msg("c2s.app.save", z.object({
		windowId: z.string(),
		name: z.string().optional(),
		icon: z.string().optional()
	})),
	msg("c2s.app.export", z.object({ appId: z.string() })),
	msg("c2s.app.import", z.object({ json: z.string() })),
	msg("c2s.activity.fetch", z.object({
		before: z.number().optional(),
		limit: z.number().optional()
	})),
	msg("c2s.activity.stop", z.object({ runId: z.string() })),
	msg("c2s.models.list", empty),
	msg("c2s.system.reset", empty),
	msg("c2s.session.list", z.object({})),
	msg("c2s.session.restore", z.object({ id: z.string() })),
	msg("c2s.session.export", z.object({ id: z.string() })),
	msg("c2s.session.import", z.object({ json: z.string() }))
]);
/** Validate an inbound `{ type, payload }`; returns the typed message or null. */
function parseClientMessage(input) {
	const r = clientToServerSchema.safeParse(input);
	return r.success ? r.data : null;
}
//#endregion
//#region src/host/gateway/router.ts
const log$4 = logger("router");
var VibeosRouter = class {
	deps;
	/** The latest in-flight app search per connection, so a new query preempts it. */
	appSearchAborts = /* @__PURE__ */ new WeakMap();
	/** The latest in-flight command per connection, so a new command preempts it. */
	commandAborts = /* @__PURE__ */ new WeakMap();
	constructor(deps) {
		this.deps = deps;
	}
	async handleMessage(ws, raw) {
		const { gateway } = this.deps;
		let envelope;
		try {
			envelope = JSON.parse(raw);
		} catch {
			log$4.warn("malformed frame", raw.slice(0, 120));
			gateway.sendTo(ws, "s2c.error", { code: "bad_json" });
			return;
		}
		const msg = parseClientMessage({
			type: envelope.type,
			payload: envelope.payload
		});
		if (!msg) {
			log$4.warn(`rejected invalid message: ${String(envelope.type)}`);
			gateway.sendTo(ws, "s2c.error", {
				code: "bad_message",
				detail: String(envelope.type)
			});
			return;
		}
		log$4.debug(`recv ${msg.type}`, msg.payload);
		const t0 = performance.now();
		try {
			await this.dispatch(ws, msg);
			log$4.debug(`done ${msg.type} (${(performance.now() - t0).toFixed(0)}ms)`);
		} catch (e) {
			log$4.error(`fail ${msg.type}`, e instanceof Error ? e.stack : e);
			gateway.sendTo(ws, "s2c.error", {
				code: "internal",
				detail: e instanceof Error ? e.message : String(e)
			});
		}
	}
	handleClose(ws) {
		this.appSearchAborts.get(ws)?.abort();
		this.commandAborts.get(ws)?.abort();
	}
	async dispatch(ws, msg) {
		const { gateway, bus, windows, windowService, vfs, geometry, notifications, sdk, runs } = this.deps;
		switch (msg.type) {
			case "c2s.boot.hello": return this.sendBootState(ws);
			case "c2s.op":
				bus.emit("op.received", msg.payload);
				return;
			case "c2s.op.dragdrop":
				bus.emit("op.dragdrop", msg.payload);
				return;
			case "c2s.window.open": return this.handleOpen(msg.payload.appId);
			case "c2s.window.close": return windowService.close(msg.payload.windowId);
			case "c2s.window.focus": return windowService.focus(msg.payload.windowId);
			case "c2s.window.minimize": {
				const w = await windows.setWindowState(msg.payload.windowId, "minimized");
				if (w) gateway.broadcast("s2c.window.stateChanged", { window: w });
				return;
			}
			case "c2s.window.maximize": {
				const next = windows.getWindow(msg.payload.windowId)?.state === "maximized" ? "normal" : "maximized";
				const w = await windows.setWindowState(msg.payload.windowId, next);
				if (w) gateway.broadcast("s2c.window.stateChanged", { window: w });
				return;
			}
			case "c2s.window.move": {
				const { windowId, x, y, w, h } = msg.payload;
				const win = await windows.moveWindow(windowId, {
					x,
					y,
					w,
					h
				});
				if (win) {
					gateway.broadcast("s2c.window.moved", { window: win });
					await geometry.rememberForWindow(win, {
						x,
						y,
						w,
						h
					});
				}
				return;
			}
			case "c2s.window.reorder":
				await windows.reorderWindows(msg.payload.ids);
				gateway.broadcast("s2c.window.reordered", { ids: msg.payload.ids });
				return;
			case "c2s.window.undo": return this.handleHistorySwap(ws, msg.payload.windowId, "undo");
			case "c2s.window.redo": return this.handleHistorySwap(ws, msg.payload.windowId, "redo");
			case "c2s.vfs.move": {
				const node = await vfs.moveNode(msg.payload);
				if (node) gateway.broadcast("s2c.vfs.changed", { node });
				return;
			}
			case "c2s.vfs.delete":
				if (await vfs.deleteNode(msg.payload.nodeId)) gateway.broadcast("s2c.vfs.removed", { ids: [msg.payload.nodeId] });
				return;
			case "c2s.vfs.empty": {
				const ids = await vfs.emptyRecycleBin();
				if (ids.length) gateway.broadcast("s2c.vfs.removed", { ids });
				return;
			}
			case "c2s.vfs.open": {
				const node = vfs.getNode(msg.payload.nodeId);
				if (node?.type === "shortcut" && node.targetAppId) return this.handleOpen(node.targetAppId);
				if (node) return this.handleOpen("file-manager");
				return;
			}
			case "c2s.settings.update": return this.handleSettingsUpdate(msg.payload.partial);
			case "c2s.wallpaper.upload": return this.handleWallpaperUpload(ws, msg.payload);
			case "c2s.notification.read":
				await notifications.markRead(msg.payload.id);
				gateway.broadcast("s2c.notification.read", { id: msg.payload.id });
				return;
			case "c2s.notification.click": return this.handleNotificationClick(msg.payload.id);
			case "c2s.app.search": {
				this.appSearchAborts.get(ws)?.abort();
				const ctrl = new AbortController();
				this.appSearchAborts.set(ws, ctrl);
				const results = await this.deps.appSearch.searchApps(msg.payload.query, ctrl);
				if (ctrl.signal.aborted) return;
				gateway.sendTo(ws, "s2c.app.searchResults", {
					requestId: msg.payload.requestId,
					results
				});
				return;
			}
			case "c2s.command.run": {
				this.commandAborts.get(ws)?.abort();
				const ctrl = new AbortController();
				this.commandAborts.set(ws, ctrl);
				try {
					const calls = await this.deps.commandPalette.runCommand(msg.payload.text, ctrl);
					if (ctrl.signal.aborted) return;
					await this.deps.syscalls.execute(calls, { source: "syscall" });
					gateway.sendTo(ws, "s2c.command.result", {
						requestId: msg.payload.requestId,
						count: calls.length
					});
				} catch (e) {
					if (ctrl.signal.aborted) return;
					gateway.sendTo(ws, "s2c.command.result", {
						requestId: msg.payload.requestId,
						count: 0,
						error: e instanceof Error ? e.message : String(e)
					});
				}
				return;
			}
			case "c2s.app.launch": return this.handleAppLaunch(msg.payload);
			case "c2s.app.save": return this.handleAppSave(msg.payload);
			case "c2s.app.export": return this.handleAppExport(ws, msg.payload);
			case "c2s.app.import": return this.handleAppImport(msg.payload);
			case "c2s.app.uninstall": return this.handleAppUninstall(msg.payload);
			case "c2s.activity.fetch": {
				const limit = Math.min(Math.max(msg.payload.limit ?? 40, 1), 100);
				const page = runs.page(msg.payload.before, limit);
				gateway.sendTo(ws, "s2c.activity.page", page);
				return;
			}
			case "c2s.activity.stop":
				sdk.stopRun(msg.payload.runId);
				return;
			case "c2s.models.list":
				gateway.sendTo(ws, "s2c.models.info", {
					effective: this.deps.policy.effectiveModels(),
					catalog: await this.deps.policy.listCatalog()
				});
				return;
			case "c2s.system.reset": return this.deps.reset.reset();
			case "c2s.session.list":
				gateway.sendTo(ws, "s2c.session.list", { sessions: this.deps.reset.listArchives() });
				return;
			case "c2s.session.export": {
				const rec = this.deps.reset.exportArchive(msg.payload.id);
				if (!rec) {
					gateway.sendTo(ws, "s2c.error", {
						code: "no_app",
						detail: msg.payload.id
					});
					return;
				}
				const stamp = new Date(rec.archivedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
				gateway.sendTo(ws, "s2c.session.exported", {
					name: `vibeos-session-${stamp}`,
					json: JSON.stringify(rec, null, 2)
				});
				return;
			}
			case "c2s.session.import":
				this.deps.reset.importArchive(msg.payload.json).then((ok) => {
					if (!ok) gateway.sendTo(ws, "s2c.error", { code: "bad_json" });
					else gateway.sendTo(ws, "s2c.session.list", { sessions: this.deps.reset.listArchives() });
				});
				return;
			case "c2s.session.restore":
				this.deps.reset.restore(msg.payload.id).then((ok) => {
					if (!ok) gateway.sendTo(ws, "s2c.error", {
						code: "no_app",
						detail: msg.payload.id
					});
				});
				return;
		}
	}
	/** Single-slot undo/redo: abort the window's in-flight run, swap snapshots. */
	async handleHistorySwap(ws, windowId, kind) {
		const { gateway, bus, memory } = this.deps;
		bus.emit("window.abortRender", { windowId });
		const html = await memory.swapSnapshot(windowId);
		if (html === void 0) {
			gateway.sendTo(ws, "s2c.ui.busy", {
				windowId,
				busy: false
			});
			return;
		}
		gateway.broadcast("s2c.ui.patch", {
			windowId,
			mode: "full",
			html,
			done: true
		});
		await memory.addInteraction({
			windowId,
			opKind: kind,
			opPayload: null,
			resultSummary: kind === "undo" ? "用户撤销了上一次界面变更" : "用户重做了界面变更"
		});
	}
	async handleOpen(appId) {
		const app = this.deps.apps.getApp(appId);
		if (!app) {
			this.deps.gateway.broadcast("s2c.error", {
				code: "no_app",
				detail: appId
			});
			return;
		}
		await this.deps.windowService.openApp(app);
	}
	async handleSettingsUpdate(partial) {
		const settings = await this.deps.settings.updateSettings(partial);
		this.deps.gateway.broadcast("s2c.settings.changed", { settings });
	}
	async handleWallpaperUpload(ws, p) {
		const path = await this.deps.imageStore.put(p.dataUrl, this.deps.config.wallpaperMaxBytes);
		if (!path) {
			this.deps.gateway.sendTo(ws, "s2c.error", { code: "wallpaper_bad_image" });
			return;
		}
		await this.handleSettingsUpdate({ prefs: { wallpaper: path } });
	}
	async handleNotificationClick(id) {
		const { gateway, bus, notifications, apps, windowService } = this.deps;
		await notifications.markRead(id);
		gateway.broadcast("s2c.notification.read", { id });
		const notif = notifications.get(id);
		if (!notif) return;
		log$4.info(`notification clicked: "${notif.title}" (app=${notif.appId ?? "—"})`);
		const targetAppId = notif.action?.openAppId ?? notif.appId;
		if (targetAppId && apps.getApp(targetAppId)) {
			const windowId = await windowService.ensureOpenWindow(targetAppId);
			if (windowId) bus.emit("op.received", {
				windowId,
				op: {
					kind: "custom",
					action: "open-notification",
					dataset: {
						notificationTitle: notif.title,
						notificationBody: notif.body ?? "",
						notificationId: notif.id
					}
				}
			});
		} else {
			const appId = await apps.ensureTransientApp();
			const w = await windowService.openSeeded({
				appId,
				title: notif.title,
				kind: "app",
				rect: {
					x: 150,
					y: 100,
					w: 640,
					h: 460
				}
			});
			const seed = `The user clicked a system notification titled "${notif.title}"${notif.body ? ` with the message: "${notif.body}"` : ""}. Open the relevant screen that this notification leads to — e.g. the new email/message, the update details, the reminder, etc. Generate a complete, believable view for what opening this notification reveals.`;
			bus.emit("window.spawnRender", {
				windowId: w.id,
				seedPrompt: seed
			});
		}
	}
	/** Spawn a fresh window (or desktop widget) and generate its content live. */
	async handleAppLaunch(p) {
		const { apps, windowService, bus } = this.deps;
		const appId = await apps.ensureTransientApp();
		const widget = !!p.widget;
		const w = await windowService.openSeeded({
			appId,
			title: p.name,
			kind: widget ? "widget" : "app",
			rect: widget ? {
				x: 60,
				y: 60,
				w: 320,
				h: 260
			} : {
				x: 140,
				y: 90,
				w: 820,
				h: 580
			}
		});
		const seed = widget ? `Generate a compact desktop WIDGET called "${p.name}".${p.description ? ` It is: ${p.description}.` : ""} It must be a small, glanceable, self-contained panel WITHOUT any window chrome that fills its area (e.g. a clock, weather, stocks, a mini to-do or player). It sits on a FROSTED-GLASS surface: use a fully TRANSPARENT background (no opaque page/container background — at most subtle translucent layers), and high-contrast, legible text and icons that read clearly over a blurred backdrop. Keep it minimal and visually striking.` : `Generate the application "${p.name}".${p.description ? ` It is: ${p.description}.` : ""} Produce a complete, believable, fully usable first screen for this app.`;
		log$4.info(`launch ${widget ? "widget" : "app"} "${p.name}" → window [${w.id.slice(-6)}]`);
		bus.emit("window.spawnRender", {
			windowId: w.id,
			seedPrompt: seed
		});
	}
	/** Freeze a window's current UI as a reusable installed app (+ desktop shortcut). */
	async handleAppSave(p) {
		const { gateway, windows, memory, apps, vfs } = this.deps;
		const win = windows.getWindow(p.windowId);
		if (!win) return;
		const snapshot = memory.getSnapshot(p.windowId);
		if (!snapshot.trim()) {
			gateway.broadcast("s2c.error", {
				code: "ai_failed",
				detail: "nothing to save yet",
				windowId: win.id
			});
			return;
		}
		const src = apps.getApp(win.appId);
		const name = (p.name ?? win.title ?? src?.name ?? "App").trim() || "App";
		const app = await apps.installApp({
			name,
			icon: p.icon ?? src?.icon ?? "app-window",
			manifest: {
				description: src?.manifest.description,
				defaultSize: src?.manifest.defaultSize,
				seedHtml: snapshot
			}
		});
		const shortcut = await vfs.ensureShortcut(app.id, app.name, app.icon);
		gateway.broadcast("s2c.syscall.appInstalled", {
			app,
			shortcut: shortcut ?? void 0
		});
		log$4.info(`saved window [${win.id.slice(-6)}] as app "${name}"`);
	}
	/** Export an installed app to a shareable .vibeapp file on the desktop. */
	async handleAppExport(ws, p) {
		const { gateway, apps } = this.deps;
		const app = apps.getApp(p.appId);
		if (!app) return;
		const json = JSON.stringify({
			vibeapp: 1,
			name: app.name,
			icon: app.icon,
			manifest: app.manifest
		}, null, 2);
		gateway.sendTo(ws, "s2c.app.exported", {
			name: app.name,
			json
		});
		log$4.info(`exported app "${app.name}" as download`);
	}
	/** Import an app from a .vibeapp JSON string. */
	async handleAppUninstall(p) {
		const { apps, vfs, windows, windowService, gateway } = this.deps;
		if (!await apps.removeApp(p.appId)) {
			gateway.broadcast("s2c.error", {
				code: "no_app",
				detail: p.appId
			});
			return;
		}
		for (const win of windows.listOpenWindows().filter((w) => w.appId === p.appId)) await windowService.close(win.id);
		const nodes = vfs.listByTargetApp(p.appId);
		for (const n of nodes) await vfs.deleteNode(n.id);
		gateway.broadcast("s2c.app.removed", {
			appId: p.appId,
			nodeIds: nodes.map((n) => n.id)
		});
	}
	async handleAppImport(p) {
		const { gateway, apps, vfs } = this.deps;
		let data = null;
		try {
			data = JSON.parse(p.json);
		} catch {}
		if (!data || typeof data.name !== "string" || !data.name.trim()) {
			gateway.broadcast("s2c.error", { code: "bad_json" });
			return;
		}
		const app = await apps.installApp({
			name: data.name,
			icon: data.icon,
			manifest: data.manifest ?? {}
		});
		const shortcut = await vfs.ensureShortcut(app.id, app.name, app.icon);
		gateway.broadcast("s2c.syscall.appInstalled", {
			app,
			shortcut: shortcut ?? void 0
		});
		log$4.info(`imported app "${app.name}"`);
	}
	/** The whole restore story: full desktop state replayed on every (re)connect. */
	sendBootState(ws) {
		const { gateway, config, version, kernelState, settings, windows, apps, vfs, notifications } = this.deps;
		const open = windows.listOpenWindows();
		const snapshots = {};
		for (const w of open) snapshots[w.id] = this.deps.memory.getSnapshot(w.id);
		gateway.sendTo(ws, "s2c.boot.state", {
			phase: "ready",
			version,
			bootCount: kernelState.bootCount,
			settings: settings.loadSettings(),
			windows: open,
			apps: apps.listApps(),
			desktopNodes: vfs.listByLocation("desktop"),
			recycleBinNodes: vfs.listByLocation("recyclebin"),
			notifications: notifications.listRecent(),
			globalState: kernelState.get(),
			snapshots,
			agentRuns: this.deps.runs.recentRuns(),
			skins: [...this.deps.skins],
			effective: this.deps.policy.effectiveModels(),
			features: {
				imageGen: false,
				classicDefault: config.desktop.startInClassicMode,
				bridgeDshTheme: config.skins.bridgeDshTheme,
				pinnedApps: config.desktop.pinnedApps,
				searchDebounceMs: config.desktop.searchDebounceMs,
				terminalPrompt: config.terminal.prompt
			}
		});
		gateway.sendTo(ws, "s2c.boot.ready", {});
	}
};
//#endregion
//#region src/host/gateway/wsGateway.ts
function rawToString(data) {
	if (typeof data === "string") return data;
	if (Buffer.isBuffer(data)) return data.toString("utf8");
	if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
	return String(data);
}
var WsGateway = class {
	wss = new WebSocketServer({ noServer: true });
	sockets = /* @__PURE__ */ new Set();
	/** Connected browser tabs; ambient agents idle at zero. */
	clientCount() {
		return this.sockets.size;
	}
	handler = null;
	attach(handler) {
		this.handler = handler;
	}
	/** Called by the /vibeos/ws upgrade route AFTER the trust fence passed. */
	handleUpgrade(req, socket, head) {
		this.wss.handleUpgrade(req, socket, head, (ws) => this.register(ws));
	}
	register(ws) {
		this.sockets.add(ws);
		ws.on("message", (data) => {
			this.handler?.handleMessage(ws, rawToString(data));
		});
		const drop = () => {
			if (!this.sockets.delete(ws)) return;
			this.handler?.handleClose(ws);
		};
		ws.on("close", drop);
		ws.on("error", drop);
	}
	/** Send a single frame to one socket (request/response-ish messages only). */
	sendTo(ws, type, payload) {
		if (ws.readyState !== ws.OPEN) return;
		ws.send(JSON.stringify(makeEnvelope(type, payload, ulid())));
	}
	/**
	* Broadcast a frame to every connected socket. Load-bearing: multiple tabs
	* mirror the one shared desktop through this fan-out.
	*/
	broadcast(type, payload) {
		if (this.sockets.size === 0) return;
		const data = JSON.stringify(makeEnvelope(type, payload, ulid()));
		for (const ws of this.sockets) if (ws.readyState === ws.OPEN) ws.send(data);
	}
	teardown() {
		for (const ws of this.wss.clients) ws.terminate();
		for (const ws of this.sockets) ws.terminate();
		this.sockets.clear();
		this.wss.close();
	}
};
//#endregion
//#region src/host/skins/customSkins.ts
const CUSTOM_SKIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const CUSTOM_SKIN_MAX_CSS_BYTES = 131072;
const SKIN_ROOT_SELECTOR = "#vibeos-root";
/** Tokens the UI-generation prompt exposes to the model; a skin that skips one leaks the base theme. */
const AI_CONTRACT_TOKENS = [
	"--background",
	"--foreground",
	"--card",
	"--card-foreground",
	"--muted",
	"--muted-foreground",
	"--border",
	"--primary",
	"--primary-foreground",
	"--accent",
	"--accent-foreground",
	"--brand",
	"--destructive",
	"--run",
	"--warn",
	"--radius"
];
const NESTED_AT_RULES = /* @__PURE__ */ new Set([
	"media",
	"supports",
	"container",
	"layer",
	"scope"
]);
const VERBATIM_AT_RULES = /* @__PURE__ */ new Set([
	"keyframes",
	"-webkit-keyframes",
	"-moz-keyframes"
]);
const AI_SURFACE_LAYOUT_PROPS = /(^|[;{\s])(display|flex-direction|flex-flow|flex-wrap)\s*:/i;
var SkinCssError = class extends Error {};
/**
* Validate + scope the configured custom skins. Never throws: a bad entry is
* dropped with a reason so one typo cannot take the desktop down.
*/
function prepareCustomSkins(entries) {
	const skins = [];
	const rejected = [];
	const warnings = [];
	const taken = new Set(BUILTIN_SKINS.map((skin) => skin.id));
	for (const entry of entries) {
		const name = typeof entry?.name === "string" ? entry.name.trim() : "";
		try {
			if (!CUSTOM_SKIN_NAME_PATTERN.test(name)) throw new SkinCssError(`name must match ${String(CUSTOM_SKIN_NAME_PATTERN)}`);
			if (taken.has(name)) throw new SkinCssError("name collides with an already registered skin");
			const css = scopeSkinCss(name, entry.css ?? "");
			const dswTokens = validateDswTokens(entry.dswTokens);
			const missing = AI_CONTRACT_TOKENS.filter((token) => !definesToken(css, token));
			if (missing.length > 0) warnings.push(`skin "${name}" does not define ${missing.join(", ")} (falls back to the base theme)`);
			taken.add(name);
			skins.push({
				id: name,
				label: typeof entry.label === "string" && entry.label.trim() !== "" ? entry.label : name,
				css,
				...dswTokens === void 0 ? {} : { dswTokens },
				builtin: false
			});
		} catch (error) {
			rejected.push({
				name: name === "" ? "<unnamed>" : name,
				reason: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return {
		skins,
		rejected,
		warnings
	};
}
/**
* Enforce the custom-skin contract and prefix every selector with `#vibeos-root`
* so the skin cannot escape the desktop container. Throws on any violation.
*/
function scopeSkinCss(name, source) {
	if (typeof source !== "string") throw new SkinCssError("css must be a string");
	if (Buffer.byteLength(source, "utf8") > 131072) throw new SkinCssError(`css exceeds ${CUSTOM_SKIN_MAX_CSS_BYTES} bytes`);
	if (/<\/\s*style/i.test(source)) throw new SkinCssError("css must not contain a \"</style\" sequence");
	const css = stripComments(source);
	if (css.trim() === "") return "";
	return transformRules(css, name, 0);
}
function transformRules(css, name, depth) {
	if (depth > 4) throw new SkinCssError("at-rule nesting is too deep");
	let out = "";
	let i = 0;
	while (i < css.length) {
		const char = css[i];
		if (char === void 0) break;
		if (/\s/.test(char)) {
			out += char;
			i += 1;
			continue;
		}
		if (char === "}") throw new SkinCssError("unbalanced \"}\" in css");
		const preludeEnd = findPreludeEnd(css, i);
		const prelude = css.slice(i, preludeEnd).trim();
		if (css[preludeEnd] === ";" || preludeEnd >= css.length) {
			if (prelude.startsWith("@")) throw new SkinCssError(`at-rule "${atRuleName(prelude)}" is not allowed`);
			throw new SkinCssError("declarations must live inside a scoped rule");
		}
		const blockEnd = findBlockEnd(css, preludeEnd);
		const body = css.slice(preludeEnd + 1, blockEnd);
		if (prelude.startsWith("@")) {
			const at = atRuleName(prelude);
			if (NESTED_AT_RULES.has(at)) out += `${prelude}{${transformRules(body, name, depth + 1)}}`;
			else if (VERBATIM_AT_RULES.has(at)) {
				assertSafeValues(body);
				out += `${prelude}{${body}}`;
			} else throw new SkinCssError(`at-rule "@${at}" is not allowed`);
		} else {
			const selectors = splitSelectors(prelude).map((selector) => scopeSelector(selector, name));
			assertSafeValues(body);
			if (selectors.some(targetsAiSurface) && AI_SURFACE_LAYOUT_PROPS.test(body)) throw new SkinCssError(".ai-surface flex layout rules must not be overridden");
			out += `${selectors.join(",")}{${body}}`;
		}
		i = blockEnd + 1;
	}
	return out;
}
function scopeSelector(selector, name) {
	const trimmed = selector.trim();
	if (trimmed === "") throw new SkinCssError("empty selector");
	const scoped = trimmed.startsWith("#vibeos-root") ? trimmed.slice(12).trimStart() : trimmed;
	if (!new RegExp(`^\\[\\s*data-skin\\s*=\\s*(?:"${name}"|'${name}'|${name})\\s*\\]`).test(scoped)) throw new SkinCssError(`selector "${trimmed}" must start with [data-skin="${name}"] (bare :root, html, body and other skins are rejected)`);
	return SKIN_ROOT_SELECTOR + scoped;
}
function targetsAiSurface(selector) {
	return /\.ai-surface\s*$/.test(selector);
}
function assertSafeValues(body) {
	const urls = body.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi);
	for (const match of urls) {
		const target = (match[2] ?? "").trim().toLowerCase();
		if (!target.startsWith("data:") && !target.startsWith("#")) throw new SkinCssError("external url() references are not allowed (offline rule); use data: URLs");
	}
}
function definesToken(css, token) {
	return new RegExp(`${token}\\s*:`).test(css);
}
function validateDswTokens(tokens) {
	if (tokens === void 0) return void 0;
	const out = {};
	for (const [key, value] of Object.entries(tokens)) {
		if (!/^--[a-zA-Z0-9-]+$/.test(key)) throw new SkinCssError(`dswTokens key "${key}" is not a css variable name`);
		if (typeof value !== "object" || value === null || typeof value.light !== "string" || typeof value.dark !== "string") throw new SkinCssError(`dswTokens["${key}"] must be a { light, dark } pair of strings`);
		for (const mode of [value.light, value.dark]) {
			if (mode.trim() === "") throw new SkinCssError(`dswTokens["${key}"] has an empty value`);
			if (/[;{}<>]/.test(mode)) throw new SkinCssError(`dswTokens["${key}"] contains a forbidden character`);
			assertSafeValues(mode);
		}
		out[key] = {
			light: value.light,
			dark: value.dark
		};
	}
	return Object.keys(out).length === 0 ? void 0 : out;
}
function stripComments(css) {
	let out = "";
	let i = 0;
	let quote = "";
	while (i < css.length) {
		const char = css[i];
		if (quote !== "") {
			out += char;
			if (char === "\\") {
				out += css[i + 1] ?? "";
				i += 2;
				continue;
			}
			if (char === quote) quote = "";
			i += 1;
			continue;
		}
		if (char === "\"" || char === "'") {
			quote = char;
			out += char;
			i += 1;
			continue;
		}
		if (char === "/" && css[i + 1] === "*") {
			const end = css.indexOf("*/", i + 2);
			if (end === -1) throw new SkinCssError("unterminated css comment");
			out += " ";
			i = end + 2;
			continue;
		}
		out += char;
		i += 1;
	}
	if (quote !== "") throw new SkinCssError("unterminated string in css");
	return out;
}
/** Index of the `{` or `;` that ends the rule prelude starting at `from`. */
function findPreludeEnd(css, from) {
	let i = from;
	let quote = "";
	let parens = 0;
	while (i < css.length) {
		const char = css[i];
		if (quote !== "") {
			if (char === "\\") i += 1;
			else if (char === quote) quote = "";
		} else if (char === "\"" || char === "'") quote = char;
		else if (char === "(") parens += 1;
		else if (char === ")") parens = Math.max(0, parens - 1);
		else if (parens === 0 && (char === "{" || char === ";")) return i;
		else if (parens === 0 && char === "}") throw new SkinCssError("unbalanced \"}\" in css");
		i += 1;
	}
	return css.length;
}
/** Index of the `}` matching the `{` at `open`. */
function findBlockEnd(css, open) {
	let i = open + 1;
	let depth = 1;
	let quote = "";
	while (i < css.length) {
		const char = css[i];
		if (quote !== "") {
			if (char === "\\") i += 1;
			else if (char === quote) quote = "";
		} else if (char === "\"" || char === "'") quote = char;
		else if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
		i += 1;
	}
	throw new SkinCssError("unterminated css block");
}
function splitSelectors(prelude) {
	const parts = [];
	let current = "";
	let quote = "";
	let parens = 0;
	let brackets = 0;
	for (let i = 0; i < prelude.length; i += 1) {
		const char = prelude[i];
		if (quote !== "") {
			current += char;
			if (char === "\\") {
				current += prelude[i + 1] ?? "";
				i += 1;
			} else if (char === quote) quote = "";
			continue;
		}
		if (char === "\"" || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === "(") parens += 1;
		if (char === ")") parens = Math.max(0, parens - 1);
		if (char === "[") brackets += 1;
		if (char === "]") brackets = Math.max(0, brackets - 1);
		if (char === "," && parens === 0 && brackets === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts.filter((part) => part.trim() !== "");
}
function atRuleName(prelude) {
	return (/^@([-a-zA-Z]+)/.exec(prelude)?.[1] ?? "").toLowerCase();
}
//#endregion
//#region src/host/state/domains.ts
/** Storage unit names must match /^[a-z][a-z0-9_]*$/ — hyphens throw at defineDomain. */
const CORE_DOMAIN_NAME = "vibeos_core";
const MEMORY_DOMAIN_NAME = "vibeos_memory";
const ACTIVITY_DOMAIN_NAME = "vibeos_activity";
const ARCHIVE_DOMAIN_NAME = "vibeos_archive";
const sizeSchema = z.object({
	w: z.number(),
	h: z.number()
});
const rectSchema = z.object({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number()
});
const modelRefSchema = z.object({
	provider: z.string(),
	model: z.string()
});
const manifestSchema = z.looseObject({
	description: z.string().optional(),
	category: z.string().optional(),
	defaultSize: sizeSchema.optional(),
	minSize: sizeSchema.optional(),
	chrome: z.string().optional(),
	singleInstance: z.boolean().optional(),
	seedHtml: z.string().optional()
}).catch({});
const SettingsSchema = z.object({
	theme: z.enum(["light", "dark"]),
	skin: z.string().optional(),
	locale: z.enum(["zh", "en"]).optional(),
	userProfile: z.string().optional(),
	modelOverrides: z.object({
		ui: modelRefSchema.optional(),
		fast: modelRefSchema.optional()
	}).catch({}),
	prefs: z.looseObject({
		proactiveAgents: z.boolean().optional(),
		wallpaper: z.string().optional(),
		classicMode: z.boolean().optional(),
		bridgeDshTheme: z.boolean().optional()
	}).catch({}),
	updatedAt: z.number()
});
const KernelSchema = z.object({
	bootCount: z.number(),
	lastBootAt: z.number(),
	globalState: z.record(z.string(), z.unknown()).catch({}),
	sessionId: z.string().optional()
});
const AppRecordSchema = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(["preset", "virtual"]),
	presetId: z.enum([
		"browser",
		"command-line",
		"file-manager",
		"settings",
		"activity-monitor",
		"app-store",
		"recycle-bin",
		"welcome"
	]).optional(),
	icon: z.string(),
	manifest: manifestSchema,
	isInstalled: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number()
});
const WindowRecordSchema = z.object({
	id: z.string(),
	appId: z.string(),
	title: z.string(),
	kind: z.enum([
		"app",
		"system",
		"widget"
	]),
	rect: rectSchema,
	z: z.number(),
	state: z.enum([
		"normal",
		"minimized",
		"maximized"
	]),
	isOpen: z.boolean(),
	focused: z.boolean(),
	order: z.number(),
	openedAt: z.number(),
	updatedAt: z.number()
});
const VfsRecordSchema = z.object({
	id: z.string(),
	parentId: z.string().optional(),
	name: z.string(),
	type: z.enum([
		"file",
		"folder",
		"shortcut"
	]),
	mime: z.string().optional(),
	content: z.string().optional(),
	targetAppId: z.string().optional(),
	location: z.enum([
		"desktop",
		"folder",
		"recyclebin"
	]),
	x: z.number().optional(),
	y: z.number().optional(),
	deletedAt: z.number().optional(),
	meta: z.record(z.string(), z.unknown()).catch({}),
	createdAt: z.number(),
	updatedAt: z.number()
});
const RectRecordSchema = z.object({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number(),
	updatedAt: z.number()
});
const AppMemoryRecordSchema = z.object({
	windowId: z.string(),
	appId: z.string(),
	htmlSnapshot: z.string(),
	prevSnapshot: z.string().optional(),
	episodeSummary: z.string(),
	updatedAt: z.number()
});
const InteractionListRecordSchema = z.object({
	windowId: z.string(),
	items: z.array(z.object({
		id: z.string(),
		windowId: z.string(),
		seq: z.number(),
		opKind: z.string(),
		opPayload: z.unknown(),
		resultSummary: z.string().optional(),
		createdAt: z.number()
	}))
});
const NotificationSchema = z.object({
	id: z.string(),
	kind: z.enum([
		"info",
		"success",
		"warning",
		"error"
	]),
	title: z.string(),
	body: z.string().optional(),
	appId: z.string().optional(),
	source: z.enum([
		"syscall",
		"agent",
		"system"
	]),
	read: z.boolean(),
	action: z.object({
		label: z.string(),
		openAppId: z.string().optional()
	}).optional(),
	createdAt: z.number()
});
const AgentRunSchema = z.object({
	id: z.string(),
	role: z.enum([
		"ui-generation",
		"system-event",
		"maintenance"
	]),
	trigger: z.enum([
		"timer",
		"event",
		"user"
	]),
	model: z.string().optional(),
	status: z.enum([
		"running",
		"ok",
		"error",
		"aborted"
	]),
	startedAt: z.number(),
	endedAt: z.number().optional(),
	error: z.string().optional(),
	appName: z.string().optional(),
	summary: z.string().optional(),
	inputTokens: z.number().optional(),
	outputTokens: z.number().optional(),
	cacheReadTokens: z.number().optional(),
	cacheWriteTokens: z.number().optional(),
	reasoningTokens: z.number().optional(),
	provider: z.string().optional()
});
/** Small, low-frequency state: settings, kernel, apps, open windows, VFS, geometry. */
const CORE = defineDomain({
	name: CORE_DOMAIN_NAME,
	version: 1,
	global: {
		schema: z.object({
			settings: SettingsSchema,
			kernel: KernelSchema
		}),
		initial: {
			settings: DEFAULT_SETTINGS,
			kernel: {
				bootCount: 0,
				lastBootAt: 0,
				globalState: {}
			}
		}
	},
	tables: {
		apps: domainTable(AppRecordSchema),
		windows: domainTable(WindowRecordSchema),
		vfs: domainTable(VfsRecordSchema),
		geometry: domainTable(RectRecordSchema)
	}
});
/** Large, hot state kept apart so a notification never rewrites HTML snapshots. */
const MEMORY = defineDomain({
	name: MEMORY_DOMAIN_NAME,
	version: 1,
	tables: {
		memory: domainTable(AppMemoryRecordSchema),
		interactions: domainTable(InteractionListRecordSchema)
	}
});
/** Notifications + agent-run history. */
const ACTIVITY = defineDomain({
	name: ACTIVITY_DOMAIN_NAME,
	version: 1,
	global: {
		schema: z.object({ notifications: z.array(NotificationSchema) }),
		initial: { notifications: [] }
	},
	tables: { runs: domainTable(AgentRunSchema) }
});
/** Archived desktop sessions (restart keeps the last few restorable). */
const ArchiveRecordSchema = z.object({
	id: z.string(),
	archivedAt: z.number(),
	windows: z.record(z.string(), z.unknown()),
	apps: z.record(z.string(), z.unknown()),
	vfs: z.record(z.string(), z.unknown()),
	geometry: z.record(z.string(), z.unknown()),
	memory: z.record(z.string(), z.unknown()),
	interactions: z.record(z.string(), z.unknown()),
	globalState: z.record(z.string(), z.unknown()).catch({})
});
const ARCHIVE = defineDomain({
	name: ARCHIVE_DOMAIN_NAME,
	version: 1,
	tables: { archives: domainTable(ArchiveRecordSchema) }
});
function createQueue() {
	let tail = Promise.resolve();
	return (fn) => {
		const run = tail.then(fn, fn);
		tail = run.then(() => void 0, () => void 0);
		return run;
	};
}
/** Open all three domains; a failure part-way closes whatever already opened.
* `namespace` isolates a deployment's state (test profiles vs the real one):
* vibeos_<ns>_core instead of vibeos_core. Must match /^[a-z0-9_]{0,16}$/. */
async function openDomains(ctx, namespace = "") {
	if (!/^[a-z0-9_]{0,16}$/.test(namespace)) throw new Error(`bad storage namespace: ${namespace}`);
	const opened = [];
	const open = async (spec) => {
		const named = namespace ? {
			...spec,
			name: spec.name.replace(/^vibeos_/, `vibeos_${namespace}_`)
		} : spec;
		const domain = await ctx.storageDomain.open(named);
		opened.push(domain);
		return {
			domain,
			enqueue: createQueue()
		};
	};
	try {
		return {
			core: await open(CORE),
			memory: await open(MEMORY),
			activity: await open(ACTIVITY),
			archive: await open(ARCHIVE),
			closeAll: () => closeAll(opened)
		};
	} catch (e) {
		await closeAll(opened);
		throw e;
	}
}
async function closeAll(opened) {
	const pending = opened.splice(0, opened.length);
	await Promise.all(pending.map((d) => d.close()));
}
//#endregion
//#region src/host/state/imageStore.ts
const IMAGE_URL_PREFIX = "/vibeos/img/";
const ID_RE = /^[0-9a-f]{32}$/;
const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/;
const TYPES = [
	{
		mime: "image/png",
		ext: "png"
	},
	{
		mime: "image/jpeg",
		ext: "jpg"
	},
	{
		mime: "image/webp",
		ext: "webp"
	},
	{
		mime: "image/gif",
		ext: "gif"
	}
];
/** Magic-byte sniff; the stored mime is never taken from the uploader. */
function sniff(b) {
	if (b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return TYPES[0];
	if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return TYPES[1];
	if (b.length >= 12 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) return TYPES[2];
	if (b.length >= 6 && b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56) return TYPES[3];
	return null;
}
function dshStoragesPath() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "storages");
}
var ImageStore = class {
	dir;
	constructor(dir = join(dshStoragesPath(), "vibeos-images")) {
		this.dir = dir;
	}
	/** `dataUrl` → served path, or null when it is not a decodable image (or too big). */
	async put(dataUrl, maxBytes) {
		const m = DATA_URL_RE.exec(dataUrl);
		if (!m) return null;
		const body = m[3] ?? "";
		let bytes;
		try {
			bytes = m[2] ? new Uint8Array(Buffer.from(body, "base64")) : new Uint8Array(Buffer.from(decodeURIComponent(body)));
		} catch {
			return null;
		}
		if (!bytes.length) return null;
		if (maxBytes != null && bytes.length > maxBytes) return null;
		const type = sniff(bytes);
		if (!type) return null;
		const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
		const target = join(this.dir, `${id}.${type.ext}`);
		await mkdir(this.dir, {
			recursive: true,
			mode: 448
		});
		const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
		try {
			await writeFile(temp, bytes, { mode: 384 });
			await rename(temp, target);
		} catch (e) {
			await unlink(temp).catch(() => {});
			throw e;
		}
		return IMAGE_URL_PREFIX + id;
	}
	async get(id) {
		if (!ID_RE.test(id)) return null;
		for (const type of TYPES) {
			let buf;
			try {
				buf = await readFile(join(this.dir, `${id}.${type.ext}`));
			} catch {
				continue;
			}
			const bytes = new Uint8Array(buf);
			const sniffed = sniff(bytes);
			if (!sniffed) return null;
			return {
				mime: sniffed.mime,
				bytes
			};
		}
		return null;
	}
};
//#endregion
//#region src/host/kernel/presets.ts
const PRESET_APPS = [
	{
		id: "browser",
		name: "Browser",
		icon: "globe",
		manifest: {
			description: "A web browser into the hallucinated internet.",
			category: "system",
			defaultSize: {
				w: 880,
				h: 600
			},
			chrome: "browser"
		}
	},
	{
		id: "command-line",
		name: "Terminal",
		icon: "square-terminal",
		manifest: {
			description: "A command line into the VibeOS shell.",
			category: "system",
			defaultSize: {
				w: 720,
				h: 460
			},
			chrome: "terminal"
		}
	},
	{
		id: "file-manager",
		name: "Files",
		icon: "folder",
		manifest: {
			description: "Browse the virtual filesystem.",
			category: "system",
			defaultSize: {
				w: 760,
				h: 520
			}
		}
	},
	{
		id: "settings",
		name: "Settings",
		icon: "settings",
		manifest: {
			description: "System settings.",
			category: "system",
			defaultSize: {
				w: 900,
				h: 620
			},
			minSize: {
				w: 850,
				h: 480
			},
			singleInstance: true
		}
	},
	{
		id: "activity-monitor",
		name: "Activity Monitor",
		icon: "activity",
		manifest: {
			description: "Live view of AI agent runs, models, latency and token cost.",
			category: "system",
			defaultSize: {
				w: 720,
				h: 560
			},
			singleInstance: true
		}
	},
	{
		id: "app-store",
		name: "App Store",
		icon: "layout-grid",
		manifest: {
			description: "Browse, install, export and share apps.",
			category: "system",
			defaultSize: {
				w: 820,
				h: 580
			},
			singleInstance: true
		}
	},
	{
		id: "recycle-bin",
		name: "Recycle Bin",
		icon: "trash-2",
		manifest: {
			description: "Restore or permanently delete items you've thrown away.",
			category: "system",
			defaultSize: {
				w: 640,
				h: 500
			},
			singleInstance: true
		}
	},
	{
		id: "welcome",
		name: "Welcome",
		icon: "hand-waving",
		manifest: {
			description: "Get started with VibeOS — try generating your first app.",
			category: "system",
			defaultSize: {
				w: 460,
				h: 500
			},
			singleInstance: true
		}
	}
];
//#endregion
//#region src/host/state/repos/AppRepo.ts
/**
* Hidden anchor app for AI-spawned popup windows not tied to a real installed
* app. Never listed (isInstalled = false).
*/
const TRANSIENT_APP_ID = "__transient__";
const PRESET_RANK = new Map(PRESET_APPS.map((p, i) => [p.id, i]));
/** SQLite `ORDER BY created_at` equivalent: presets keep their seed order inside one timestamp. */
function compareApps(a, b) {
	if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
	const ra = PRESET_RANK.get(a.id) ?? Number.MAX_SAFE_INTEGER;
	const rb = PRESET_RANK.get(b.id) ?? Number.MAX_SAFE_INTEGER;
	if (ra !== rb) return ra - rb;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
var AppRepo = class {
	core;
	table;
	constructor(core) {
		this.core = core;
		this.table = core.domain.table("apps");
	}
	listApps() {
		const rows = [];
		for (const [, app] of this.table.entries()) if (app.isInstalled) rows.push(app);
		return rows.sort(compareApps);
	}
	getApp(id) {
		return this.table.get(id) ?? null;
	}
	findByPreset(presetId) {
		for (const [, app] of this.table.entries()) if (app.presetId === presetId) return app;
		return null;
	}
	/** Idempotent by preset id; existing rows get name/icon/manifest refreshed from code. */
	seedPresets() {
		return this.core.enqueue(async () => {
			const now = Date.now();
			for (const p of PRESET_APPS) {
				const existing = this.findByPreset(p.id);
				if (existing) {
					await this.table.put(existing.id, {
						...existing,
						name: p.name,
						icon: p.icon,
						manifest: { ...p.manifest },
						updatedAt: now
					});
					continue;
				}
				await this.table.put(p.id, {
					id: p.id,
					name: p.name,
					kind: "preset",
					presetId: p.id,
					icon: p.icon,
					manifest: { ...p.manifest },
					isInstalled: true,
					createdAt: now,
					updatedAt: now
				});
			}
		});
	}
	/** Hard-delete an installed (non-preset) app row. */
	removeApp(appId) {
		return this.core.enqueue(async () => {
			const app = this.table.get(appId);
			if (!app || app.kind === "preset") return false;
			await this.table.delete(appId);
			return true;
		});
	}
	installApp(input) {
		return this.core.enqueue(async () => {
			const now = Date.now();
			const id = ulid(now);
			const app = {
				id,
				name: stripEmoji(input.name) || "App",
				kind: "virtual",
				icon: (input.icon ? stripEmoji(input.icon).trim() : "") || "app-window",
				manifest: { ...input.manifest ?? {} },
				isInstalled: true,
				createdAt: now,
				updatedAt: now
			};
			await this.table.put(id, app);
			return app;
		});
	}
	clearAll() {
		return this.core.enqueue(async () => {
			for (const id of [...this.table.keys()]) await this.table.delete(id);
		});
	}
	ensureTransientApp() {
		return this.core.enqueue(async () => {
			if (this.table.get("__transient__")) return TRANSIENT_APP_ID;
			const now = Date.now();
			await this.table.put(TRANSIENT_APP_ID, {
				id: TRANSIENT_APP_ID,
				name: "Window",
				kind: "virtual",
				icon: "app-window",
				manifest: {},
				isInstalled: false,
				createdAt: now,
				updatedAt: now
			});
			return TRANSIENT_APP_ID;
		});
	}
};
//#endregion
//#region src/host/state/repos/GeometryRepo.ts
var GeometryRepo = class {
	core;
	table;
	constructor(core) {
		this.core = core;
		this.table = core.domain.table("geometry");
	}
	getGeometry(appId) {
		const r = this.table.get(appId);
		return r ? {
			x: r.x,
			y: r.y,
			w: r.w,
			h: r.h
		} : null;
	}
	rememberGeometry(appId, r) {
		return this.core.enqueue(() => this.table.put(appId, {
			x: Math.round(r.x),
			y: Math.round(r.y),
			w: Math.round(r.w),
			h: Math.round(r.h),
			updatedAt: Date.now()
		}));
	}
	clearAll() {
		return this.core.enqueue(async () => {
			for (const id of [...this.table.keys()]) await this.table.delete(id);
		});
	}
	/** Widgets and transient launches have no app identity worth remembering. */
	async rememberForWindow(win, r) {
		if (win.kind === "widget" || win.appId === "__transient__") return;
		await this.rememberGeometry(win.appId, r);
	}
};
//#endregion
//#region src/host/state/repos/KernelRepo.ts
var KernelRepo = class {
	core;
	constructor(core) {
		this.core = core;
	}
	loadKernel() {
		return this.core.domain.global.get().kernel;
	}
	recordBoot() {
		return this.core.enqueue(async () => {
			const state = this.core.domain.global.get();
			const kernel = {
				bootCount: state.kernel.bootCount + 1,
				lastBootAt: Date.now(),
				globalState: state.kernel.globalState,
				sessionId: state.kernel.sessionId ?? ulid()
			};
			await this.core.domain.global.set({
				...state,
				kernel
			});
			return kernel;
		});
	}
	/** System reset: fresh session, first-boot counter, empty global state. */
	resetKernel() {
		return this.core.enqueue(async () => {
			const state = this.core.domain.global.get();
			const kernel = {
				bootCount: 1,
				lastBootAt: Date.now(),
				globalState: {},
				sessionId: ulid()
			};
			await this.core.domain.global.set({
				...state,
				kernel
			});
			return kernel;
		});
	}
	/** Swap in an archived session's identity + global state (boot count kept). */
	restoreSession(globalState, sessionId) {
		return this.core.enqueue(async () => {
			const state = this.core.domain.global.get();
			await this.core.domain.global.set({
				...state,
				kernel: {
					...state.kernel,
					globalState,
					sessionId,
					lastBootAt: Date.now()
				}
			});
		});
	}
	saveGlobalState(globalState) {
		return this.core.enqueue(async () => {
			const state = this.core.domain.global.get();
			await this.core.domain.global.set({
				...state,
				kernel: {
					...state.kernel,
					globalState
				}
			});
		});
	}
};
//#endregion
//#region src/host/state/repos/MemoryRepo.ts
var MemoryRepo = class {
	handle;
	memory;
	interactions;
	constructor(handle) {
		this.handle = handle;
		this.memory = handle.domain.table("memory");
		this.interactions = handle.domain.table("interactions");
	}
	getMemory(windowId) {
		return this.memory.get(windowId) ?? null;
	}
	getSnapshot(windowId) {
		return this.memory.get(windowId)?.htmlSnapshot ?? "";
	}
	ensureMemory(windowId, appId) {
		return this.handle.enqueue(async () => {
			if (this.memory.get(windowId)) return;
			await this.memory.put(windowId, {
				windowId,
				appId,
				htmlSnapshot: "",
				episodeSummary: "",
				updatedAt: Date.now()
			});
		});
	}
	/** Shifts the current snapshot into the single undo slot before writing. */
	saveSnapshot(windowId, html) {
		return this.patch(windowId, (m) => ({
			...m,
			prevSnapshot: m.htmlSnapshot.trim() ? m.htmlSnapshot : m.prevSnapshot,
			htmlSnapshot: html
		}));
	}
	/**
	* Swap current and previous snapshots (self-inverse: undo and redo are the
	* same operation). Returns the new current html, or undefined without prev.
	*/
	swapSnapshot(windowId) {
		return this.handle.enqueue(async () => {
			const m = this.memory.get(windowId);
			const prev = m?.prevSnapshot;
			if (!m || !prev?.trim()) return void 0;
			await this.memory.put(windowId, {
				...m,
				htmlSnapshot: prev,
				prevSnapshot: m.htmlSnapshot,
				updatedAt: Date.now()
			});
			return prev;
		});
	}
	saveSummary(windowId, summary) {
		return this.patch(windowId, (m) => ({
			...m,
			episodeSummary: summary
		}));
	}
	patch(windowId, fn) {
		return this.handle.enqueue(async () => {
			const current = this.memory.get(windowId) ?? {
				windowId,
				appId: "",
				htmlSnapshot: "",
				episodeSummary: "",
				updatedAt: 0
			};
			await this.memory.put(windowId, {
				...fn(current),
				updatedAt: Date.now()
			});
		});
	}
	/** Oldest-first, last {@link RECENT_LIMIT} ops. */
	recentInteractions(windowId) {
		return (this.interactions.get(windowId)?.items ?? []).slice(-12).map((r) => ({
			id: r.id,
			windowId: r.windowId,
			seq: r.seq,
			opKind: r.opKind,
			opPayload: r.opPayload ?? null,
			resultSummary: r.resultSummary,
			createdAt: r.createdAt
		}));
	}
	addInteraction(input) {
		return this.handle.enqueue(async () => {
			const now = Date.now();
			const items = this.interactions.get(input.windowId)?.items ?? [];
			const seq = (items.length ? items[items.length - 1].seq : 0) + 1;
			const next = {
				id: ulid(now),
				windowId: input.windowId,
				seq,
				opKind: input.opKind,
				opPayload: input.opPayload,
				resultSummary: input.resultSummary,
				createdAt: now
			};
			await this.interactions.put(input.windowId, {
				windowId: input.windowId,
				items: [...items, next].slice(-50)
			});
		});
	}
	/** Window close is a hard delete: drop the snapshot and the op log with it. */
	forget(windowId) {
		return this.handle.enqueue(async () => {
			await this.memory.delete(windowId);
			await this.interactions.delete(windowId);
		});
	}
	clearAll() {
		return this.handle.enqueue(async () => {
			for (const id of [...this.memory.keys()]) await this.memory.delete(id);
			for (const id of [...this.interactions.keys()]) await this.interactions.delete(id);
		});
	}
};
//#endregion
//#region src/host/state/repos/NotificationRepo.ts
/** How many notifications survive; the client only ever shows the newest 50. */
const CAP = 100;
var NotificationRepo = class {
	activity;
	constructor(activity) {
		this.activity = activity;
	}
	/** Newest first. */
	listRecent(limit = 50) {
		return this.activity.domain.global.get().notifications.slice(0, limit);
	}
	get(id) {
		return this.activity.domain.global.get().notifications.find((n) => n.id === id) ?? null;
	}
	/** Emoji are stripped at this boundary — a belt over the prompt's no-emoji rule. */
	create(input) {
		return this.activity.enqueue(async () => {
			const now = Date.now();
			const notification = {
				id: ulid(now),
				kind: input.kind,
				title: stripEmoji(input.title),
				body: input.body ? stripEmoji(input.body) : void 0,
				appId: input.appId,
				source: input.source,
				read: false,
				action: input.action,
				createdAt: now
			};
			const state = this.activity.domain.global.get();
			await this.activity.domain.global.set({
				...state,
				notifications: [notification, ...state.notifications].slice(0, CAP)
			});
			return notification;
		});
	}
	clearAll() {
		return this.activity.enqueue(async () => {
			const state = this.activity.domain.global.get();
			await this.activity.domain.global.set({
				...state,
				notifications: []
			});
		});
	}
	markRead(id) {
		return this.activity.enqueue(async () => {
			const state = this.activity.domain.global.get();
			const notifications = state.notifications.map((n) => n.read || id !== "all" && n.id !== id ? n : {
				...n,
				read: true
			});
			await this.activity.domain.global.set({
				...state,
				notifications
			});
		});
	}
};
//#endregion
//#region src/host/state/repos/RunRepo.ts
const DEFAULT_KEEP = 500;
/** Newest first; ULIDs break timestamp ties in insertion order. */
function byRecency(a, b) {
	return b.startedAt - a.startedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}
var RunRepo = class {
	activity;
	table;
	constructor(activity) {
		this.activity = activity;
		this.table = activity.domain.table("runs");
	}
	getRun(id) {
		return this.table.get(id);
	}
	async startRun(input) {
		return this.activity.enqueue(async () => {
			const now = Date.now();
			const run = {
				id: ulid(now),
				role: input.role,
				trigger: input.trigger,
				model: input.model,
				provider: input.provider,
				appName: input.appName,
				status: "running",
				startedAt: now
			};
			await this.table.put(run.id, run);
			return run;
		});
	}
	async endRun(id, status, error, usage) {
		return this.activity.enqueue(async () => {
			const current = this.table.get(id);
			if (!current) return void 0;
			const next = {
				...current,
				status,
				endedAt: Date.now(),
				error,
				inputTokens: usage?.inputTokens,
				outputTokens: usage?.outputTokens,
				cacheReadTokens: usage?.cacheReadTokens,
				cacheWriteTokens: usage?.cacheWriteTokens,
				reasoningTokens: usage?.reasoningTokens
			};
			await this.table.put(id, next);
			return next;
		});
	}
	async setSummary(id, summary) {
		return this.activity.enqueue(async () => {
			const current = this.table.get(id);
			if (!current) return void 0;
			const next = {
				...current,
				summary
			};
			await this.table.put(id, next);
			return next;
		});
	}
	/** Newest runs first. */
	recentRuns(limit = 50) {
		const rows = [];
		for (const [, run] of this.table.entries()) rows.push(run);
		return rows.sort(byRecency).slice(0, limit);
	}
	/** `before` is a startedAt cursor for scroll pagination. */
	page(before, limit = 40) {
		const rows = [];
		for (const [, run] of this.table.entries()) if (before == null || run.startedAt < before) rows.push(run);
		rows.sort(byRecency);
		return {
			runs: rows.slice(0, limit),
			hasMore: rows.length > limit
		};
	}
	clearAll() {
		return this.activity.enqueue(async () => {
			for (const id of [...this.table.keys()]) await this.table.delete(id);
		});
	}
	async prune(keep = DEFAULT_KEEP) {
		return this.activity.enqueue(async () => {
			const rows = [];
			for (const [, run] of this.table.entries()) rows.push(run);
			if (rows.length <= keep) return;
			rows.sort(byRecency);
			for (const run of rows.slice(keep)) await this.table.delete(run.id);
		});
	}
};
//#endregion
//#region src/host/state/repos/SettingsRepo.ts
var SettingsRepo = class {
	core;
	constructor(core) {
		this.core = core;
	}
	loadSettings() {
		return this.core.domain.global.get().settings;
	}
	/** Materialize the singleton on first boot; `seed` supplies plugin-config defaults. */
	ensureSettings(seed) {
		return this.core.enqueue(async () => {
			const state = this.core.domain.global.get();
			if (state.settings.updatedAt !== 0) return state.settings;
			const settings = {
				...DEFAULT_SETTINGS,
				skin: seed?.skin ?? DEFAULT_SETTINGS.skin,
				locale: seed?.locale ?? DEFAULT_SETTINGS.locale,
				modelOverrides: { ...DEFAULT_SETTINGS.modelOverrides },
				prefs: {
					proactiveAgents: true,
					...DEFAULT_SETTINGS.prefs
				},
				updatedAt: Date.now()
			};
			await this.core.domain.global.set({
				...state,
				settings
			});
			return settings;
		});
	}
	/**
	* Deep merge: per-role model config and per-key prefs merge instead of being
	* replaced, so updating one field never wipes the rest.
	*/
	updateSettings(partial) {
		return this.core.enqueue(async () => {
			const state = this.core.domain.global.get();
			const current = state.settings;
			const modelOverrides = { ...current.modelOverrides };
			for (const [role, cfg] of Object.entries(partial.modelOverrides ?? {})) {
				const key = role;
				if (cfg === null) delete modelOverrides[key];
				else modelOverrides[key] = {
					...modelOverrides[key],
					...cfg
				};
			}
			const settings = {
				theme: partial.theme ?? current.theme,
				skin: partial.skin ?? current.skin,
				locale: partial.locale ?? current.locale,
				userProfile: partial.userProfile ?? current.userProfile,
				modelOverrides,
				prefs: {
					...current.prefs,
					...partial.prefs
				},
				updatedAt: Date.now()
			};
			await this.core.domain.global.set({
				...state,
				settings
			});
			return settings;
		});
	}
};
//#endregion
//#region src/host/state/repos/VfsRepo.ts
const GRID_ROWS = 7;
var VfsRepo = class {
	core;
	table;
	constructor(core) {
		this.core = core;
		this.table = core.domain.table("vfs");
	}
	listByLocation(location) {
		const rows = [];
		for (const [, node] of this.table.entries()) if (node.location === location) rows.push(node);
		return rows.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}
	getNode(id) {
		return this.table.get(id) ?? null;
	}
	gridSlot() {
		let n = 0;
		for (const [, node] of this.table.entries()) if (node.location === "desktop") n++;
		const col = Math.floor(n / GRID_ROWS);
		const row = n % GRID_ROWS;
		return {
			x: 24 + col * 96,
			y: 24 + row * 100
		};
	}
	createNode(input) {
		return this.core.enqueue(async () => {
			const now = Date.now();
			const id = ulid(now);
			const location = input.location ?? "desktop";
			const slot = location === "desktop" ? this.gridSlot() : void 0;
			const node = {
				id,
				name: input.name,
				type: input.type,
				mime: input.mime,
				content: input.content,
				targetAppId: input.targetAppId,
				location,
				x: slot?.x,
				y: slot?.y,
				meta: { ...input.meta ?? {} },
				createdAt: now,
				updatedAt: now
			};
			await this.table.put(id, node);
			return node;
		});
	}
	/** Moving into the recycle bin is the soft delete; x/y keep their old value when omitted. */
	moveNode(input) {
		return this.core.enqueue(async () => {
			const current = this.table.get(input.nodeId);
			if (!current) return null;
			const now = Date.now();
			const next = {
				...current,
				location: input.location,
				x: input.x ?? current.x,
				y: input.y ?? current.y,
				parentId: input.parentId,
				deletedAt: input.location === "recyclebin" ? now : void 0,
				updatedAt: now
			};
			await this.table.put(input.nodeId, next);
			return next;
		});
	}
	listByTargetApp(appId) {
		return [...this.table.entries()].map(([, n]) => n).filter((n) => n.targetAppId === appId);
	}
	deleteNode(nodeId) {
		return this.core.enqueue(() => this.table.delete(nodeId));
	}
	emptyRecycleBin() {
		return this.core.enqueue(async () => {
			const ids = [];
			for (const [id, node] of this.table.entries()) if (node.location === "recyclebin") ids.push(id);
			for (const id of ids) await this.table.delete(id);
			return ids;
		});
	}
	clearAll() {
		return this.core.enqueue(async () => {
			for (const id of [...this.table.keys()]) await this.table.delete(id);
		});
	}
	/** Desktop shortcut to an app; idempotent by target app. */
	ensureShortcut(appId, name, icon) {
		return this.core.enqueue(async () => {
			for (const [, node] of this.table.entries()) if (node.targetAppId === appId && node.type === "shortcut") return node;
			const now = Date.now();
			const id = ulid(now);
			const slot = this.gridSlot();
			const node = {
				id,
				name,
				type: "shortcut",
				targetAppId: appId,
				location: "desktop",
				x: slot.x,
				y: slot.y,
				meta: { icon: icon ?? "app-window" },
				createdAt: now,
				updatedAt: now
			};
			await this.table.put(id, node);
			return node;
		});
	}
};
//#endregion
//#region src/host/state/repos/WindowRepo.ts
const DEFAULT_SIZE = {
	w: 760,
	h: 520
};
var WindowRepo = class {
	core;
	geometry;
	memory;
	table;
	constructor(core, geometry, memory) {
		this.core = core;
		this.geometry = geometry;
		this.memory = memory;
		this.table = core.domain.table("windows");
	}
	listOpenWindows() {
		const rows = [];
		for (const [, win] of this.table.entries()) if (win.isOpen) rows.push(win);
		return rows.sort((a, b) => a.order - b.order || a.z - b.z);
	}
	getWindow(id) {
		return this.table.get(id) ?? null;
	}
	findOpenWindowByApp(appId) {
		for (const [, win] of this.table.entries()) if (win.appId === appId && win.isOpen) return win;
		return null;
	}
	nextZ() {
		let max = 0;
		for (const [, win] of this.table.entries()) if (win.isOpen && win.z > max) max = win.z;
		return max + 1;
	}
	nextOrder() {
		let max = 0;
		for (const [, win] of this.table.entries()) if (win.isOpen && win.order > max) max = win.order;
		return max + 1;
	}
	async unfocusAll() {
		for (const [id, win] of this.table.entries()) if (win.isOpen && win.focused) await this.table.put(id, {
			...win,
			focused: false
		});
	}
	/** Geometry resolve order: explicit rect → remembered per-app rect → cascade. */
	openWindow(input) {
		return this.core.enqueue(async () => {
			const now = Date.now();
			const id = ulid(now);
			const z = this.nextZ();
			const order = this.nextOrder();
			const remembered = input.rect ? null : this.geometry.getGeometry(input.appId);
			const rect = input.rect ?? remembered ?? {
				x: 70 + z % 8 * 30,
				y: 60 + z % 8 * 30,
				w: input.size?.w ?? DEFAULT_SIZE.w,
				h: input.size?.h ?? DEFAULT_SIZE.h
			};
			await this.unfocusAll();
			const win = {
				id,
				appId: input.appId,
				title: input.title,
				kind: input.kind ?? "app",
				rect,
				z,
				state: "normal",
				isOpen: true,
				focused: true,
				order,
				openedAt: now,
				updatedAt: now
			};
			await this.table.put(id, win);
			return win;
		});
	}
	closeWindow(id) {
		return this.core.enqueue(async () => {
			await this.table.delete(id);
			await this.memory.forget(id);
		});
	}
	focusWindow(id) {
		return this.core.enqueue(async () => {
			const current = this.table.get(id);
			if (!current) return null;
			const z = this.nextZ();
			await this.unfocusAll();
			const next = {
				...current,
				focused: true,
				z,
				state: current.state === "minimized" ? "normal" : current.state,
				updatedAt: Date.now()
			};
			await this.table.put(id, next);
			return next;
		});
	}
	setWindowState(id, state) {
		return this.core.enqueue(async () => {
			const current = this.table.get(id);
			if (!current) return null;
			const next = {
				...current,
				state,
				updatedAt: Date.now()
			};
			await this.table.put(id, next);
			return next;
		});
	}
	moveWindow(id, rect) {
		return this.core.enqueue(async () => {
			const current = this.table.get(id);
			if (!current) return null;
			const next = {
				...current,
				rect: { ...rect },
				updatedAt: Date.now()
			};
			await this.table.put(id, next);
			return next;
		});
	}
	clearAll() {
		return this.core.enqueue(async () => {
			for (const id of [...this.table.keys()]) await this.table.delete(id);
		});
	}
	/** Persist a new taskbar order (window ids left → right). */
	reorderWindows(ids) {
		return this.core.enqueue(async () => {
			const now = Date.now();
			for (let i = 0; i < ids.length; i++) {
				const current = this.table.get(ids[i]);
				if (!current) continue;
				await this.table.put(ids[i], {
					...current,
					order: i,
					updatedAt: now
				});
			}
		});
	}
};
//#endregion
//#region src/host/syscall/SyscallInterpreter.ts
const log$3 = logger("syscall");
var SyscallInterpreter = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/** Per-call errors are logged and swallowed — one bad call never kills a batch. */
	async execute(calls, ctx) {
		for (const call of calls) try {
			log$3.info(`exec ${call.type}`, call);
			await this.one(call, ctx);
		} catch (e) {
			log$3.error(`failed ${call.type}`, e instanceof Error ? e.message : e);
		}
	}
	async one(call, ctx) {
		const { gateway, bus, apps, vfs, notifications, windowService } = this.deps;
		switch (call.type) {
			case "notify": {
				const notification = await notifications.create({
					kind: call.kind ?? "info",
					title: call.title,
					body: call.body,
					appId: ctx.appId,
					source: ctx.source
				});
				gateway.broadcast("s2c.syscall.notify", { notification });
				return;
			}
			case "open": {
				const app = apps.getApp(call.appId);
				if (!app) return;
				await windowService.openApp(app);
				return;
			}
			case "spawn-window": {
				let appId = call.appId ?? ctx.appId;
				if (!appId || !apps.getApp(appId)) appId = await apps.ensureTransientApp();
				const w = await windowService.openSeeded({
					appId,
					title: call.title,
					kind: "app",
					rect: {
						x: 130,
						y: 100,
						w: call.width ?? 640,
						h: call.height ?? 460
					}
				});
				bus.emit("window.spawnRender", {
					windowId: w.id,
					seedPrompt: call.prompt
				});
				log$3.info(`spawned window "${call.title}" [${w.id.slice(-6)}]`);
				return;
			}
			case "install": {
				const app = await apps.installApp({
					name: call.name,
					icon: call.icon,
					manifest: call.manifest
				});
				const shortcut = await vfs.ensureShortcut(app.id, app.name, app.icon);
				gateway.broadcast("s2c.syscall.appInstalled", {
					app,
					shortcut: shortcut ?? void 0
				});
				return;
			}
			case "create-file": {
				const node = await vfs.createNode({
					name: call.name,
					type: "file",
					mime: call.mime,
					content: call.content,
					location: call.location ?? "desktop"
				});
				gateway.broadcast("s2c.syscall.fileCreated", { node });
				return;
			}
			case "focus":
				await windowService.focus(call.windowId);
				return;
			case "close":
				await windowService.close(call.windowId);
				return;
			case "chrome":
				if (!ctx.windowId) return;
				gateway.broadcast("s2c.chrome.set", {
					windowId: ctx.windowId,
					patch: call.set
				});
				return;
		}
	}
};
//#endregion
//#region src/host/kernel/kernelState.ts
/**
* In-memory mirror of the global system state the AI gets to "see".
* Write-through to storage. Kept compact — it goes into every prompt.
*/
var KernelState = class {
	kernel;
	windows;
	settings;
	bootCount = 0;
	global = {};
	constructor(kernel, windows, settings) {
		this.kernel = kernel;
		this.windows = windows;
		this.settings = settings;
	}
	load() {
		const k = this.kernel.loadKernel();
		this.bootCount = k.bootCount;
		this.global = k.globalState;
	}
	setBootCount(n) {
		this.bootCount = n;
	}
	get() {
		return this.global;
	}
	async patch(partial) {
		this.global = {
			...this.global,
			...partial
		};
		await this.kernel.saveGlobalState(this.global);
	}
	/** Compact snapshot for the prompt: time, theme, open windows. */
	snapshotForPrompt() {
		const openWindows = this.windows.listOpenWindows().map((w) => ({
			windowId: w.id,
			appId: w.appId,
			title: w.title,
			state: w.state
		}));
		return {
			bootCount: this.bootCount,
			now: (/* @__PURE__ */ new Date()).toISOString(),
			theme: this.settings.loadSettings().theme,
			openWindows,
			...this.global
		};
	}
};
//#endregion
//#region src/host/kernel/reset.ts
const ARCHIVE_KEEP = 3;
function dumpTable(domain, name) {
	const t = domain.table(name);
	return Object.fromEntries(t.entries());
}
async function loadTable(domain, name, rows) {
	const t = domain.table(name);
	for (const k of [...t.keys()]) await t.delete(k);
	for (const [k, v] of Object.entries(rows)) await t.put(k, v);
}
const log$2 = logger("reset");
var SystemResetService = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/** Snapshot the live session into the archive ring (skipped when empty). */
	async archiveCurrent() {
		const d = this.deps;
		const core = d.domains.core.domain;
		const mem = d.domains.memory.domain;
		const windows = dumpTable(core, "windows");
		const apps = dumpTable(core, "apps");
		const nonPreset = Object.values(apps).filter((a) => a.kind !== "preset").length;
		const vfs = dumpTable(core, "vfs");
		if (!Object.keys(windows).length && !nonPreset && !Object.keys(vfs).length) return;
		const kernel = d.kernelRepo.loadKernel();
		const record = {
			id: kernel.sessionId ?? `s${Date.now()}`,
			archivedAt: Date.now(),
			windows,
			apps,
			vfs,
			geometry: dumpTable(core, "geometry"),
			memory: dumpTable(mem, "memory"),
			interactions: dumpTable(mem, "interactions"),
			globalState: kernel.globalState
		};
		const archives = this.deps.domains.archive.domain.table("archives");
		await this.deps.domains.archive.enqueue(async () => {
			await archives.put(record.id, record);
			const all = [...archives.entries()].map(([, v]) => v).sort((a, b) => b.archivedAt - a.archivedAt);
			for (const stale of all.slice(ARCHIVE_KEEP)) await archives.delete(stale.id);
		});
	}
	listArchives() {
		return [...this.deps.domains.archive.domain.table("archives").entries()].map(([, v]) => v).sort((a, b) => b.archivedAt - a.archivedAt).map((a) => ({
			id: a.id,
			archivedAt: a.archivedAt,
			windows: Object.keys(a.windows).length,
			apps: Object.values(a.apps).filter((x) => x.kind !== "preset").length
		}));
	}
	/** Raw archive record for download. */
	exportArchive(id) {
		return this.deps.domains.archive.domain.table("archives").get(id);
	}
	/** Adopt an archive file produced by exportArchive. */
	async importArchive(json) {
		let rec;
		try {
			rec = JSON.parse(json);
		} catch {
			return false;
		}
		if (!rec || typeof rec !== "object" || !rec.windows || !rec.apps) return false;
		const archives = this.deps.domains.archive.domain.table("archives");
		const id = `${rec.id ?? "imported"}-${Date.now().toString(36)}`;
		await this.deps.domains.archive.enqueue(() => archives.put(id, {
			...rec,
			id,
			archivedAt: rec.archivedAt ?? Date.now()
		}));
		return true;
	}
	/** Swap an archived session back in (the current one is archived first). */
	async restore(id) {
		const d = this.deps;
		const archives = d.domains.archive.domain.table("archives");
		const rec = archives.get(id);
		if (!rec) return false;
		await this.archiveCurrent();
		d.uiAgent.abortAll();
		const core = d.domains.core.domain;
		const mem = d.domains.memory.domain;
		await loadTable(core, "windows", rec.windows);
		await loadTable(core, "apps", rec.apps);
		await loadTable(core, "vfs", rec.vfs);
		await loadTable(core, "geometry", rec.geometry);
		await loadTable(mem, "memory", rec.memory);
		await loadTable(mem, "interactions", rec.interactions);
		await d.kernelRepo.restoreSession(rec.globalState, rec.id);
		d.kernelState.load();
		await d.apps.seedPresets();
		await d.domains.archive.enqueue(() => archives.delete(id));
		d.gateway.broadcast("s2c.system.reset", {});
		log$2.info(`session ${id} restored`);
		return true;
	}
	async reset() {
		const d = this.deps;
		await this.archiveCurrent();
		d.uiAgent.abortAll();
		await d.windows.clearAll();
		await d.apps.clearAll();
		await d.vfs.clearAll();
		await d.geometry.clearAll();
		await d.memory.clearAll();
		await d.runs.clearAll();
		await d.notifications.clearAll();
		await d.kernelRepo.resetKernel();
		d.kernelState.load();
		await d.apps.seedPresets();
		await d.windowInit.openWelcomeOnFirstBoot();
		d.gateway.broadcast("s2c.system.reset", {});
		log$2.info("system reset — session wiped, presets reseeded, settings kept");
	}
};
//#endregion
//#region src/host/kernel/windowInit.ts
const log$1 = logger("boot");
var WindowInitializer = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* Decide how a freshly-opened window gets its first content:
	*  - native preset app (Settings / Activity Monitor / App Store) → nothing (React renders it)
	*  - app with a frozen `seedHtml` → push that snapshot immediately
	*  - otherwise → an AI first render
	*/
	async renderInitialWindow(windowId, app) {
		if (app.presetId && NATIVE_PRESET_APPS.includes(app.presetId)) return;
		const seed = typeof app.manifest.seedHtml === "string" ? app.manifest.seedHtml : "";
		if (seed.trim()) {
			await this.deps.memory.saveSnapshot(windowId, seed);
			this.deps.gateway.broadcast("s2c.ui.patch", {
				windowId,
				mode: "full",
				html: seed,
				done: true
			});
			return;
		}
		this.deps.bus.emit("window.firstRender", { windowId });
	}
	/**
	* Cold start: on the very first boot, open the Welcome app so a fresh desktop
	* isn't empty. It's a normal native window — left open it persists across
	* refreshes/reboots, and once the user closes it it stays closed. Runs before
	* any client connects, so no broadcast.
	*/
	async openWelcomeOnFirstBoot() {
		const app = this.deps.apps.getApp("welcome");
		if (!app) return;
		const w = await this.deps.windows.openWindow({
			appId: "welcome",
			title: app.name,
			kind: "system",
			size: app.manifest.defaultSize
		});
		await this.deps.memory.ensureMemory(w.id, "welcome");
		log$1.info("first boot — opened Welcome window");
	}
};
//#endregion
//#region src/host/kernel/windows.ts
var WindowService = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* Single-instance apps focus their existing window; multi-instance apps
	* (browser / files / terminal / virtual apps) open a fresh window each time.
	*/
	async openApp(app) {
		if (app.manifest.singleInstance) {
			const existing = this.deps.windows.findOpenWindowByApp(app.id);
			if (existing) {
				await this.focus(existing.id);
				return;
			}
		}
		const w = await this.deps.windows.openWindow({
			appId: app.id,
			title: app.name,
			kind: app.presetId ? "system" : "app",
			size: app.manifest.defaultSize
		});
		await this.deps.memory.ensureMemory(w.id, app.id);
		this.deps.gateway.broadcast("s2c.window.opened", { window: w });
		await this.deps.init.renderInitialWindow(w.id, app);
	}
	/**
	* Open the app's window if not already open; returns the window id (or null).
	* No first-render emit for an already-rendered window — the caller drives
	* generation via an op.
	*/
	async ensureOpenWindow(appId) {
		const app = this.deps.apps.getApp(appId);
		if (!app) return null;
		const existing = this.deps.windows.findOpenWindowByApp(appId);
		if (existing) {
			await this.focus(existing.id);
			return existing.id;
		}
		const w = await this.deps.windows.openWindow({
			appId,
			title: app.name,
			kind: app.presetId ? "system" : "app",
			size: app.manifest.defaultSize
		});
		await this.deps.memory.ensureMemory(w.id, appId);
		this.deps.gateway.broadcast("s2c.window.opened", { window: w });
		if (!this.deps.memory.getMemory(w.id)?.htmlSnapshot) this.deps.bus.emit("window.firstRender", { windowId: w.id });
		return w.id;
	}
	/** Open + announce a window whose content the caller seeds (spawn/launch paths). */
	async openSeeded(input) {
		const w = await this.deps.windows.openWindow(input);
		await this.deps.memory.ensureMemory(w.id, input.appId);
		this.deps.gateway.broadcast("s2c.window.opened", { window: w });
		return w;
	}
	/** Close = abort any in-flight generation, hard-delete, announce. */
	async close(windowId) {
		this.deps.bus.emit("window.closed", { windowId });
		await this.deps.windows.closeWindow(windowId);
		this.deps.gateway.broadcast("s2c.window.closed", { windowId });
	}
	async focus(windowId) {
		const w = await this.deps.windows.focusWindow(windowId);
		if (w) this.deps.gateway.broadcast("s2c.window.focused", { windowId: w.id });
	}
};
//#endregion
//#region src/host/kernel/boot.ts
const WS_PATH = "/vibeos/ws";
const log = logger("boot");
const MIN_SYSTEM_EVENT_MS = 3e4;
const MIN_MAINTENANCE_MS = 12e4;
function settingsInterval(settings, key) {
	const raw = settings.loadSettings().prefs.agentIntervals?.[key];
	return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : void 0;
}
/** Bundle-relative first (lib/index.js → ../package.json), source-relative in dev. */
function packageVersion() {
	const require = createRequire(import.meta.url);
	for (const candidate of ["../package.json", "../../../package.json"]) try {
		const pkg = require(candidate);
		if (pkg.name === "dsh-vibeos" && pkg.version) return pkg.version;
	} catch {}
	return "0.0.0";
}
async function boot(ctx, config) {
	const domains = await openDomains(ctx, config.storage.namespace);
	ctx.effect(() => () => domains.closeAll(), "vibeos: storage domains");
	const settings = new SettingsRepo(domains.core);
	const kernelRepo = new KernelRepo(domains.core);
	const apps = new AppRepo(domains.core);
	const geometry = new GeometryRepo(domains.core);
	const memory = new MemoryRepo(domains.memory);
	const windows = new WindowRepo(domains.core, geometry, memory);
	const vfs = new VfsRepo(domains.core);
	const notifications = new NotificationRepo(domains.activity);
	const runs = new RunRepo(domains.activity);
	const kernelState = new KernelState(kernelRepo, windows, settings);
	const imageStore = new ImageStore();
	await settings.ensureSettings({
		skin: config.skins.default,
		locale: config.locale
	});
	await apps.seedPresets();
	await kernelRepo.recordBoot();
	kernelState.load();
	const prepared = prepareCustomSkins(config.skins.custom);
	for (const r of prepared.rejected) log.warn(`custom skin "${r.name}" rejected: ${r.reason}`);
	for (const w of prepared.warnings) log.warn(w);
	const skins = [...BUILTIN_SKINS, ...prepared.skins];
	const bus = new VibeosBus();
	const gateway = new WsGateway();
	const policy = new ModelPolicy(ctx, config, () => settings.loadSettings());
	policy.primeDefaults().catch((e) => log.warn(`model default priming failed: ${String(e)}`));
	const sdk = new SdkManager(ctx, config, policy, runs, gateway, () => settings.loadSettings());
	const windowInit = new WindowInitializer({
		apps,
		windows,
		memory,
		gateway,
		bus
	});
	const windowService = new WindowService({
		apps,
		windows,
		memory,
		gateway,
		bus,
		init: windowInit
	});
	const syscalls = new SyscallInterpreter({
		gateway,
		bus,
		apps,
		vfs,
		notifications,
		windowService
	});
	const appSearch = new AppSearch(sdk);
	const commandPalette = new CommandPalette(sdk, {
		listApps: () => apps.listApps(),
		listOpenWindows: () => windows.listOpenWindows()
	});
	const uiAgent = new UiGenerationAgent({
		bus,
		gateway,
		windows,
		apps,
		memory,
		settings,
		kernelState,
		sdk,
		syscalls,
		config,
		webTools: new WebToolRuntime(ctx, config.web)
	});
	const reset = new SystemResetService({
		gateway,
		uiAgent,
		kernelRepo,
		kernelState,
		apps,
		windows,
		vfs,
		geometry,
		memory,
		runs,
		notifications,
		windowInit,
		domains
	});
	const router = new VibeosRouter({
		config,
		version: packageVersion(),
		gateway,
		bus,
		kernelState,
		settings,
		apps,
		windows,
		windowService,
		memory,
		vfs,
		notifications,
		runs,
		geometry,
		sdk,
		policy,
		syscalls,
		appSearch,
		commandPalette,
		imageStore,
		reset,
		skins
	});
	gateway.attach(router);
	if (kernelState.bootCount === 1) await windowInit.openWelcomeOnFirstBoot();
	ctx.effect(() => registerImageRoute(ctx, imageStore), "vibeos: /vibeos/img");
	ctx.effect(() => ctx.webServer.registerUpgrade({
		path: WS_PATH,
		handler: (req, socket, head) => {
			if (!isTrustedUpgrade(req)) {
				socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
				socket.destroy();
				return;
			}
			gateway.handleUpgrade(req, socket, head);
		}
	}), "vibeos: /vibeos/ws");
	ctx.effect(() => () => gateway.teardown(), "vibeos: terminate ws clients");
	if (config.agents.enabled !== false) {
		const foreground = () => gateway.clientCount() > 0 && settings.loadSettings().prefs.classicMode !== true;
		const scheduler = new AgentScheduler(ctx, uiAgent, [{
			agent: new SystemEventAgent({
				windows,
				kernelState,
				sdk,
				syscalls
			}),
			enabled: () => foreground() && config.agents.proactive && settings.loadSettings().prefs.proactiveAgents !== false,
			interval: () => Math.max(MIN_SYSTEM_EVENT_MS, settingsInterval(settings, "systemEventMs") ?? config.agents.systemEventIntervalMs)
		}, {
			agent: new MaintenanceAgent({
				windows,
				apps,
				memory,
				runs,
				sdk,
				runHistory: config.agents.runHistory
			}),
			enabled: foreground,
			interval: () => Math.max(MIN_MAINTENANCE_MS, settingsInterval(settings, "maintenanceMs") ?? config.agents.maintenanceIntervalMs)
		}]);
		ctx.effect(() => {
			scheduler.start();
			return () => scheduler.stop();
		}, "vibeos: agents");
	}
	log.info(`vibeos booted (boot #${kernelState.bootCount}, ${windows.listOpenWindows().length} window(s) restored, aiStub=${config.aiStub})`);
}
//#endregion
//#region src/host/config.ts
const Config = Schema.object({
	ui: Schema.object({
		model: Schema.object({
			provider: Schema.string(),
			model: Schema.string()
		}).description("UI-generation (strong) model; both-or-neither. Default: ctx.agentDefaultModel.currentSelection()"),
		reasoningEffort: Schema.union([
			"off",
			"low",
			"high",
			"max"
		]).default("off"),
		genTimeoutMs: Schema.natural().default(18e4),
		snapshotBudget: Schema.natural().default(0),
		maxTokens: Schema.natural().default(16e3)
	}).default({}),
	fast: Schema.object({
		model: Schema.object({
			provider: Schema.string(),
			model: Schema.string()
		}).description("Ambient/system-event/maintenance/search model. Recommend deepseek-v4-flash. Default: same as ui."),
		reasoningEffort: Schema.union([
			"off",
			"low",
			"high",
			"max"
		]).default("off"),
		maxTokens: Schema.natural().default(4e3)
	}).default({}),
	agents: Schema.object({
		enabled: Schema.boolean().default(true),
		proactive: Schema.boolean().default(true),
		systemEventIntervalMs: Schema.natural().default(75e3),
		maintenanceIntervalMs: Schema.natural().default(3e5),
		runHistory: Schema.natural().default(500)
	}).default({}),
	skins: Schema.object({
		default: Schema.string().default("devdock"),
		custom: Schema.array(Schema.object({
			name: Schema.string().pattern(/^[a-z][a-z0-9-]*$/).required(),
			label: Schema.string(),
			css: Schema.string().role("textarea").required(),
			dswTokens: Schema.dict(Schema.object({
				light: Schema.string(),
				dark: Schema.string()
			}))
		})).default([]),
		bridgeDshTheme: Schema.boolean().default(true)
	}).default({}),
	desktop: Schema.object({
		startInClassicMode: Schema.boolean().default(false),
		pinnedApps: Schema.array(Schema.string()).default([
			"browser",
			"file-manager",
			"command-line",
			"settings"
		]),
		searchDebounceMs: Schema.natural().default(1e3)
	}).default({}),
	storage: Schema.object({ namespace: Schema.string().pattern(/^[a-z0-9_]{0,16}$/).default("") }).default({}),
	web: Schema.object({
		enabled: Schema.boolean().default(true),
		timeoutMs: Schema.natural().default(12e3),
		maxChars: Schema.natural().default(6e3),
		maxCalls: Schema.natural().default(3)
	}).default({}),
	terminal: Schema.object({ prompt: Schema.string().default("dev@vibeos").description("Terminal prompt identity, e.g. \"you@laptop\"; overridable in Settings.") }).default({}),
	locale: Schema.union(["zh", "en"]).default("zh"),
	wallpaperMaxBytes: Schema.natural().default(4e6),
	aiStub: Schema.boolean().default(false)
});
//#endregion
//#region src/host/index.ts
const name = "dsh-vibeos";
const inject = [
	"webServer",
	"storageDomain",
	"llm",
	"timer",
	"agentDefaultModel"
];
async function apply(ctx, config) {
	await boot(ctx, config);
}
//#endregion
export { Config, apply, inject, name };
