# 自定义皮肤 · Custom skins

一套皮肤就是一段 CSS：所有规则限定在 `[data-skin="你的id"]` 下，定义一组设计令牌。桌面外壳和模型写出的应用界面都会立即换装。

## 契约

**必须覆盖的 16 个令牌**（模型只认识这些，缺了会回落到基础主题）：

```
--background  --foreground  --card     --card-foreground
--muted       --muted-foreground       --border   --radius
--primary     --primary-foreground     --accent   --accent-foreground
--brand       --destructive            --run      --warn
```

**建议再补**：`--brand-foreground` `--popover(-foreground)` `--secondary(-foreground)` `--input` `--ring` `--idle` `--sheen` `--desktop` `--window-titlebar` `--taskbar-h`。

**可选**：
- `.vibe-*` 外壳钩子（`.vibe-window` `.vibe-taskbar` `.vibe-titlebar` `.vibe-startmenu` `.vibe-menu` …）改窗体气质；
- `.ai-surface` 里对控件材质用 `!important` 强调（参考内置 xp/aqua 的写法，见 `src/client/styles/skins/`）；
- `dswTokens`：一组 `{ light, dark }` 键值（键为 `--dsw-alias-*` 变量名），桌面模式下同步给残留的 DSH 界面。

**限制**：禁止 `@import` 与外部 URL；单皮肤 ≤128 KiB；不要改 `.ai-surface` 的 flex 布局规则；标题栏高度固定 36px。

## 注册

写一个伴生插件，在浏览器侧注册（完整可运行示例：[`examples/vibeos-example-override/`](../examples/vibeos-example-override/)）：

```js
const { vibeos } = await ctx.modules.import('dsh-vibeos');
const dispose = vibeos.skins.register({ id: 'my-skin', label: 'My Skin', css: SKIN_CSS });
```

注册后立即出现在 设置 → 皮肤 下拉和桌面右键的外观菜单里。

---

*English*: a skin is one CSS block scoped under `[data-skin="your-id"]` defining the 16 required
tokens above (plus the recommended extras). No `@import`/external URLs, ≤128 KiB, don't touch
`.ai-surface` flex rules, titlebar stays 36px. Register it from a companion plugin via
`vibeos.skins.register(...)` — see the runnable example in `examples/vibeos-example-override/`.
