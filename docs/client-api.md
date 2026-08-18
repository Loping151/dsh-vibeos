# 客户端 API · Client API

任何 web 平台的 DSH 插件都能扩展这个桌面。bundle 到达顺序无保证，所以用异步导入：

```js
exports.inject = ['modules'];
function apply(ctx) {
  ctx.modules.import('dsh-vibeos').then(({ vibeos }) => {
    const dispose = vibeos.components.override('clock', MyClock);
    ctx.effect(() => dispose);
  });
}
```

## 接口面

| 入口 | 作用 |
|---|---|
| `vibeos.components.override(key, FC, {priority}?)` | 覆盖具名组件；你的组件会收到 `Default` 属性（下一层实现），可以装饰而非重写 |
| `vibeos.skins.register / list / apply` | 皮肤注册表（见 [skins.md](./skins.md)） |
| `vibeos.nativeApps.register(presetId, render)` | 注册真 React 原生应用窗口 |
| `vibeos.chromes.register(key, FC)` | 注册窗口外壳（如内置 browser 地址栏） |
| `vibeos.menus.transform(menuId, fn)` | 变换六类右键菜单的条目 |
| `vibeos.icons.register(name, FC)` | 扩展图标表 |
| `vibeos.i18n.extend(locale, dict)` | 扩展词典 |
| `vibeos.mode.get / set / subscribe` | 桌面 / 经典模式 |

**15 个可覆盖组件**：`boot-screen` `wallpaper` `desktop-icon` `taskbar` `start-button` `start-menu`
`clock` `tray` `window-frame` `window-titlebar` `window-buttons` `notification-toast`
`notification-center` `context-menu` `spotlight`。

所有注册都返回 disposer；挂到 `ctx.effect` 上，插件禁用/热重载即自动还原。完整可运行示例（皮肤 + 时钟覆盖）：[`examples/vibeos-example-override/`](../examples/vibeos-example-override/)。

---

*English*: import the API with `ctx.modules.import('dsh-vibeos')` (async — bundle arrival order is
not guaranteed). Every `register`/`override` returns a disposer; tie it to `ctx.effect`. Overrides
receive the previous implementation as a `Default` prop, so decorate instead of reimplementing.
Fifteen component keys are listed above; the runnable example lives in
`examples/vibeos-example-override/`.
