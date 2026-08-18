# vibeos-example-override

A ~120-line companion plugin for [dsh-vibeos](../../README.md) that demonstrates both extension
points at once:

- **a custom skin** — `midnight-sakura`, dark pink-on-black, covering all 16 Tier-1 tokens, registered
  with `vibeos.skins.register()`;
- **a component override** — the taskbar `clock`, prefixed with a `★`, built by reusing the default
  implementation through the `Default` prop instead of reimplementing it.

Both registrations are wrapped in `ctx.effect(...)`, so disabling or removing the plugin removes the
skin's style tag and restores the stock clock — no restart needed.

There is no build step: `client.js` is a hand-written `window.__ModuleLoader__.load({ id, factory })`
envelope, exactly the shape every dsh client bundle ships in.

## Install

```sh
# dsh-vibeos must already be installed in the same profile
dsh plugin --profile web add file:/absolute/path/to/dsh-vibeos/examples/vibeos-example-override
```

Restart the web app, hard-refresh, then pick **Midnight Sakura** in Settings → General → Skin (or in
the desktop's right-click menu) and look at the taskbar clock.

## Files

| File | Role |
|---|---|
| `package.json` | `dsh.client.platform: web` (serve `./client.js` to the browser) + `dsh.bundle.patch` (self-registration) |
| `cordis.patch.yml` | inserts the row `vibeos-example-override` into the profile composition |
| `index.js` | host half — a no-op; it only exists so the row can activate |
| `client.js` | the whole example: skin CSS, the clock override, `apply(ctx)` |

---

# vibeos-example-override（中文）

一个约 120 行的 [dsh-vibeos](../../README.md) 伴生插件，同时演示两个扩展点：

- **自定义皮肤** —— `midnight-sakura`，黑底粉字的暗色皮肤，覆盖全部 16 个 Tier-1 令牌，用
  `vibeos.skins.register()` 注册；
- **组件覆盖** —— 任务栏 `clock`，在时间前面加一个 `★`；实现方式是通过 `Default` 属性复用默认实现，而不是重写
  一遍。

两处注册都包在 `ctx.effect(...)` 里，所以禁用或卸载本插件时，皮肤的样式标签会被移除、时钟恢复原样，无需重启。

没有构建步骤：`client.js` 是手写的 `window.__ModuleLoader__.load({ id, factory })` 信封，与所有 dsh 客户端
bundle 的形态一致。

## 安装

```sh
# 同一个 profile 里必须已经装了 dsh-vibeos
dsh plugin --profile web add file:/绝对路径/dsh-vibeos/examples/vibeos-example-override
```

重启 web 应用并强制刷新，然后在 设置 → 通用 → 皮肤（或桌面右键菜单）里选 **Midnight Sakura**，再看看任务栏
的时钟。

## 文件说明

| 文件 | 作用 |
|---|---|
| `package.json` | `dsh.client.platform: web`（把 `./client.js` 发给浏览器）+ `dsh.bundle.patch`（自注册） |
| `cordis.patch.yml` | 往 profile 组合里插入 `vibeos-example-override` 这一行 |
| `index.js` | 主机半边——空实现，只为让这一行能激活 |
| `client.js` | 示例的全部内容：皮肤 CSS、时钟覆盖、`apply(ctx)` |
