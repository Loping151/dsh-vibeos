<div align="center">

<img src="docs/assets/icon.png" width="120" alt="VibeOS" />

# VibeOS

[English](./README.en.md) · **简体中文**

**基于 DeepSeek Harness 的鲸鱼操作系统？（伪）**

</div>

![VibeOS](docs/assets/hero.png)

真·AI驱动的操作系统！

## 长这样

| | |
|---|---|
| ![](docs/assets/shots/01-aqua-desktop.png) | ![](docs/assets/shots/02-xp-browser.png) |
| ![](docs/assets/shots/03-dark-sites-settings.png) | ![](docs/assets/shots/04-light-files.png) |

## 安装

Linux / macOS：

```sh
mkdir -p ~/dsh-plugins && cd ~/dsh-plugins      # 你的插件目录，放哪都行
git clone https://github.com/Loping151/dsh-vibeos.git && cd dsh-vibeos
dsh plugin --profile web add file:.
```

Windows（PowerShell）：

```powershell
mkdir -Force ~\dsh-plugins; cd ~\dsh-plugins
git clone https://github.com/Loping151/dsh-vibeos.git; cd dsh-vibeos
dsh plugin --profile web add file:.
```

重启 dsh web，硬刷新浏览器。无需本地构建；更新时 `git pull` 后 remove 再 add 一次。

## 日常

- **关机（经典模式）**：随时切回常规 DSH——开始菜单、托盘电源钮、设置里都能切，右下角 VibeOS 按钮返回桌面。关机状态下后台不再调用模型。
- **永久关闭**：`dsh plugin --profile web remove dsh-vibeos`
- **撤销 / 重做**：`Ctrl+Z` / `Ctrl+Shift+Z` 回退、恢复当前窗口的上一帧。
- **重启**：相当于开新会话——当前会话自动归档（保留最近 3 个），设置 → 通用里可随时恢复；系统设置始终保留。

## 配置

不写配置文件。两处界面即改即生效、互相同步：

- 桌面内的 **系统设置** 应用——模型、皮肤、语言、后台节奏、生成风格、壁纸。
- 经典模式下，DSH 设置对话框的 **VibeOS** 分区——同一套设置。

模型默认跟随 DSH 并优先 flash 档，可分角色（界面 / 后台）覆盖。

## 扩展

- [自定义皮肤](docs/skins.md)——一段 CSS 就是一套皮肤。
- [客户端 API](docs/client-api.md)——覆盖时钟、任务栏等 15 个组件，注册原生应用、皮肤与菜单。

## 数据

全部状态在 `~/.dsh/storages/vibeos_*.json` 与 `vibeos-images/`；不建会话、不进聊天记录，删除即出厂。

## 致谢

[VibeOS](https://github.com/benis-me/VibeOS)（MIT），桌面内核与交互契约皆源于此。

原始灵感来自 Microsoft Build 2026 "Vibe OS"（[视频](https://www.youtube.com/watch?v=zh6fMtL_cSM)）。

[MIT](./LICENSE)
