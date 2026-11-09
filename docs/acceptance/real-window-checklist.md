# 真机验收清单（1.0.11，一次开窗跑完）

> 目的：把攒下来的、必须在真实窗口里才能确认的项目，压成**一次开窗、一条命令**跑完。
> 每一项都有机械判据（窗口矩形、控件 Enabled、SQL 行、文件 mtime），不写「看一眼是否正常」。

## 一键执行

```powershell
# 前置：已安装 1.0.11，应用未运行，人在电脑前（会出现安装器窗口）
pwsh -File scripts/real-window/run-acceptance.ps1
```

- 默认应用：`%LOCALAPPDATA%\界序 INTERFACE\界序 INTERFACE.exe`
- 默认安装包：`src-tauri\target\release\bundle\nsis\` 或 `D:\Program\Tauri\jx-target\release\bundle\nsis\` 里最新的 `*setup.exe`
- 报告：`artifacts\acceptance\<时间戳>\report.md` + `results.json`
- 退出码：有 `FAIL` 为 1，否则 0；`BLOCKED` 不影响退出码，但会在报告里单独标出

可选参数：

| 参数 | 作用 |
|---|---|
| `-SkipInstaller` | 不弹安装器（只跑应用内项目） |
| `-SkipDrop` | 跳过拖拽导入（无桌面会话 / 不想开 Explorer 时） |
| `-AppExe <path>` | 指定被测可执行文件 |
| `-Installer <path>` | 指定安装包 |
| `-OutDir <path>` | 指定报告目录 |
| `-DebugPort 9333` | WebView2 调试端口（DOM 断言用） |

## 窗口预算

| 窗口 | 次数 | 说明 |
|---|---|---|
| 安装器 | 1 | 只停在协议页，勾选/取消勾选后关闭，不写入安装目录 |
| 应用主窗口 | 1 | 首启导入、标题栏、快捷键、拖拽全部在这一次启动里完成 |
| Explorer | 1 | 仅拖拽用例，拖完由脚本关闭 |

## 执行顺序与判据

顺序是固定的：安装器 → 首启导入 → 标题栏拖动 → 双击最大化 → 边缘吸附 → 触觉说明 → `Ctrl+E` → 拖拽导入 → `Ctrl+N`。
`Ctrl+N` 放最后，因为它会留下一个未保存的新建表单。

### 1. 安装器单屏交互（`installer`）

**操作**：启动安装包，停在协议页；读「下一步/安装」按钮状态 → 勾选协议 → 再读 → 取消勾选 → 再读 → 关闭安装器。

**判据（全部满足才 PASS）**：

- 勾选前：按钮 `IsWindowEnabled == false`，文案含「请先勾选协议」
- 勾选后：按钮 `IsWindowEnabled == true`，文案含「立即安装」
- 取消勾选后：回到禁用 + 「请先勾选协议」（证明是双向绑定，不是一次性解锁）
- 关闭后安装器进程退出，`%LOCALAPPDATA%\界序 INTERFACE` 的 `LastWriteTimeUtc` 与启动前一致（证明取消真的没装）

**失败意味着**：协议门禁失效（未勾选也能装）、按钮状态不刷新、或取消路径会写文件。

### 2. 全新数据目录首启内置导入（`first-launch`）

**操作**：整个 `%APPDATA%\com.jiexu.interface` 移到备份目录 → 启动应用 → 等库文件出现 → 查询。

**判据**：

- `cases` 表（`deleted_at IS NULL`）== 78
- `content_packages` 里存在 `source == 'builtin'` 且 `item_count == 78` 的包
- `content_package_items` == 78
- `categories['fb.haptic'].note` 非空（顺带确认迁移种子落库）

**失败意味着**：内置包没打进安装包、首启导入未触发、或导入只写了包记录没写条目。

> 该项依赖安装包里的 `resources`，用裸 exe（未打包）跑会失败，属预期。

### 3. 标题栏拖动（`titlebar-drag`）

**操作**：窗口还原态，在标题栏 55% 宽度处按下，真实鼠标移动 (+64, +48) 后松开。

**判据**：窗口 `Left/Top` 位移 ≈ (64, 48)，容差 ±8px；宽高变化 ≤2px（拖动不能改变尺寸）。

**失败意味着**：`data-tauri-drag-region` 没生效、拖拽区域被其他元素覆盖、或拖动时窗口被误缩放。

### 4. 双击最大化 / 再次双击还原（`titlebar-dblclick`）

**操作**：标题栏双击 → 读状态 → 在当前标题栏位置再双击 → 读状态。

**判据**：`IsZoomed` 由 false→true→false；最大化后宽度比之前至少大 80px；还原后 `Left/Width` 与初始相差 ≤8px。

**失败意味着**：自绘标题栏吞掉了双击、或还原时丢位置。

### 5. 拖到屏幕左边缘吸附（`edge-snap`）

**操作**：标题栏拖到工作区左边界（x = workArea.Left + 2，y = 垂直中点）松开。

**判据**：吸附后 `Left ≤ workArea.Left + 4`、`Width ≈ workArea.Width / 2`（容差 12px）、`Top ≤ workArea.Top + 8`、高度 ≥ 90% 工作区高度。
完成后脚本把窗口强制还原到吸附前矩形，避免影响后续用例。

**失败意味着**：无边框窗口没拿到 `WS_THICKFRAME` 语义，Win11 边缘吸附不可用。这一项历史上从未实测，FAIL 是有效结论，不是脚本问题。

### 6. 触觉类目「暂缺」说明（`haptic-note`）

**操作**：跳 `#/feedback` → 点左栏「反馈与状态」展开二级导航 → 读触觉类目的说明节点。

**判据**：触觉类目按钮计数显示 `0`，且其说明段落文本包含「无触觉通道」。

**失败意味着**：`categories.note` 没渲染、或说明节点被条件隐藏（只在计数为 0 时显示）。

### 7. `Ctrl+E` 导出落盘（`ctrl-e-export`）

**操作**：回到 `#/library`，确认详情已挂载（素材区存在）→ 记录时间 → 聚焦窗口发 `Ctrl+E`。

**判据**：12 秒内 `%APPDATA%\com.jiexu.interface\exports\` 出现 mtime 晚于操作时刻、大小 >0 的 `.md` 与 `.json` 各至少一个。
按 mtime 判定，同一天重复导出覆盖同名文件也能得到正确结论。

**失败意味着**：快捷键没注册（无选中案例）、导出 IPC 失败、或文件写到了别处。

### 8. 拖一张图片进窗口（`drag-drop-image`）

**操作**：脚本自绘一张 480×320 PNG（不引用任何外部素材）→ 应用窗口移到右半屏 → Explorer 打开到该文件并选中 → 真实鼠标从文件项拖到窗口中心。

**判据**：`assets` 表新增 `original_name = 'drop-target.png'` 的行（数量比拖动前多），15 秒内出现。

**失败意味着**：Tauri 拖放事件没接到、或导入管线（哈希、去重、落盘）出错。

**自动化边界**：需要用 UIA 定位 Explorer 文件项。若 UIA 拿不到矩形，本项记为 `BLOCKED` 而不是 `FAIL`，并提示人工拖一次——不把「脚本够不到」当成「功能坏了」。

### 9. `Ctrl+N` 新建（`ctrl-n-new`）

**操作**：聚焦窗口发 `Ctrl+N`。

**判据**：8 秒内 `#case-title-input` 出现，`document.activeElement.id == 'case-title-input'`，且 hash 落在 `#/style|#/motion|#/feedback|#/component|#/theme` 之一。

**失败意味着**：跨路由重建表单失效（组件实例复用导致状态没重置）、或焦点没交给标题。

## 数据安全

- 首启项会把 `%APPDATA%\com.jiexu.interface` 整体移到 `*.acceptance-backup-<时间戳>`，**结束时删除测试产生的目录并把备份移回原位**。
- 结束后如果两者同时存在，说明还原被中断，备份目录会保留在 `%APPDATA%` 下，名字带 `acceptance-backup`，可手工改回。
- 脚本不会删除备份；只有确认还原成功才会删测试目录。

## 已知边界

1. **需要人不在打字**：脚本用真实鼠标键盘事件，运行期间抢焦点；跑之前把输入法切到英文。
2. **Explorer 的 UIA 结构随 Windows 版本变化**，定位失败记为 `BLOCKED`。
3. **DOM 断言依赖 WebView2 远程调试端口**（脚本自动设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`）。端口没起来时相关项目记为 `BLOCKED`，但窗口级项目仍会跑完。
4. **多显示器**：吸附判定基于主显示器工作区；多屏时鼠标可能落到副屏边缘，属于 `FAIL` 的有效复现路径，脚本会把 workArea 一起写进证据。
5. 这些项目仍未覆盖：安装器「立即安装」全程、升级覆盖安装、卸载残留、SmartScreen 交互。
