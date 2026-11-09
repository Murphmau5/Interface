#Requires -Version 7
<#
.SYNOPSIS
  真窗口一次跑完的验收脚本：安装器单屏交互 → 首启内置导入 → 标题栏 → 拖拽 → Ctrl+E → Ctrl+N → 触觉类目说明。

.DESCRIPTION
  开窗策略：全程只启动一次应用窗口，外加一次安装器窗口（安装器项目需要可见界面才能读按钮状态）。
  所有判定都是机械判据（窗口矩形、控件 Enabled、数据库行、文件 mtime），不是「看一眼是否正常」。
  数据目录 `%APPDATA%\com.jiexu.interface` 在首启用例前被整体移到备份，结束时删除测试数据并还原，
  不会留下半新半旧的数据。

.PARAMETER AppExe
  已安装的应用可执行文件。默认 %LOCALAPPDATA%\界序 INTERFACE\界序 INTERFACE.exe。
  首启导入项依赖安装包里的 resources，指向未打包的裸 exe 会失败。

.PARAMETER Installer
  1.0.11 安装包路径。默认取仓库本地 bundle 目录里最新的 *setup.exe。

.PARAMETER SkipInstaller
  跳过安装器单屏交互项（该项目会额外弹出一次安装器窗口）。

.PARAMETER SkipDrop
  跳过拖拽图片导入项（需要 Explorer 窗口与 UIA，机器上没有桌面会话时用）。

.PARAMETER DebugPort
  WebView2 远程调试端口，用来读页面 DOM。默认 9333。

.EXAMPLE
  pwsh -File scripts/real-window/run-acceptance.ps1
#>
[CmdletBinding()]
param(
  [string]$AppExe = (Join-Path $env:LOCALAPPDATA '界序 INTERFACE\界序 INTERFACE.exe'),
  [string]$Installer = '',
  [int]$DebugPort = 9333,
  [string]$OutDir = '',
  [switch]$SkipInstaller,
  [switch]$SkipDrop
)

$ErrorActionPreference = 'Stop'

$script:Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'win32.ps1')
[Jx.Win]::MakeDpiAware()

$script:Cdp = Join-Path $PSScriptRoot 'cdp.mjs'
$script:Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $OutDir) { $OutDir = Join-Path $script:Root "artifacts\acceptance\$script:Stamp" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$script:DataDir = Join-Path $env:APPDATA 'com.jiexu.interface'
$script:DbPath = Join-Path $script:DataDir 'app.db'
$script:Results = [System.Collections.Generic.List[object]]::new()
$script:AppProcess = $null
$script:BackupDir = ""

function Log([string]$message) {
  Write-Host ("[acceptance] " + $message) -ForegroundColor Cyan
}

function Add-Result {
  param(
    [string]$Id,
    [string]$Title,
    [ValidateSet('PASS', 'FAIL', 'BLOCKED', 'SKIP')][string]$Status,
    $Evidence,
    [string]$Note = ''
  )
  $script:Results.Add([pscustomobject]@{
      Id = $Id; Title = $Title; Status = $Status
      Evidence = $Evidence; Note = $Note
    })
  $color = switch ($Status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'BLOCKED' { 'Yellow' } default { 'DarkGray' } }
  Write-Host ("[{0}] {1}" -f $Status, $Title) -ForegroundColor $color
}

function Invoke-Cdp([string]$expression) {
  $raw = $expression | & node $script:Cdp eval $DebugPort 2>&1
  if ($LASTEXITCODE -ne 0) { throw ("CDP 失败：" + ($raw | Out-String).Trim()) }
  $text = ($raw | Out-String).Trim()
  if (-not $text) { return $null }
  return ($text | ConvertFrom-Json -AsHashtable)
}

function Wait-CdpReady([int]$timeoutSec = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    & node $script:Cdp probe $DebugPort *> $null
    if ($LASTEXITCODE -eq 0) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Invoke-Db([string]$sql) {
  $nodeScript = 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1], { readOnly: true }); console.log(JSON.stringify(db.prepare(process.argv[2]).all()));'
  $raw = & node --no-warnings -e $nodeScript $script:DbPath $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw ("数据库查询失败：" + ($raw | Out-String).Trim()) }
  $parsed = ($raw | Out-String).Trim() | ConvertFrom-Json -AsHashtable
  # 单行结果会被 PowerShell 展平成 Hashtable，这里强制包一层数组，调用方统一按 [0] 取行
  return , @($parsed)
}

function Wait-Until {
  param([scriptblock]$Check, [int]$TimeoutSec, [int]$IntervalMs = 400)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try { $value = & $Check; if ($value) { return $value } } catch { }
    Start-Sleep -Milliseconds $IntervalMs
  }
  return $null
}

function Get-AppProcess {
  return Get-Process -Name '界序 INTERFACE' -ErrorAction SilentlyContinue
}

function Start-AppWindow {
  if (-not (Test-Path $AppExe)) { throw "找不到应用：$AppExe" }
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DebugPort --remote-allow-origins=*"
  try {
    $proc = Start-Process -FilePath $AppExe -PassThru
  } finally {
    Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  }
  $script:AppProcess = $proc

  $hwnd = Wait-Until -TimeoutSec 40 -Check {
    $proc.Refresh()
    if ($proc.HasExited) { throw "应用启动后立即退出（退出码 $($proc.ExitCode)）" }
    $handle = [Jx.Win]::FindTopWindow($proc.Id, '界序 INTERFACE')
    if ($handle -ne [IntPtr]::Zero) { $handle } else { $null }
  }
  if (-not $hwnd) { throw '40s 内没有出现主窗口' }
  Log ("主窗口已出现：0x{0:X}" -f $hwnd.ToInt64())
  return $hwnd
}

function Stop-AppWindow([IntPtr]$hwnd) {
  if ($hwnd -ne [IntPtr]::Zero) { [Jx.Win]::SendClose($hwnd) }
  if (-not $script:AppProcess) { return }
  if (-not $script:AppProcess.WaitForExit(15000)) {
    Stop-Process -Id $script:AppProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
  }
}

function Get-DragPoint([IntPtr]$hwnd) {
  $rect = [Jx.Win]::Rect($hwnd)
  # 0.55 宽度处落在标题栏中段：左侧品牌区已过，右侧窗口按钮未到
  return @{
    X = $rect.Left + [int]($rect.Width * 0.55)
    Y = $rect.Top + 16
  }
}

function Resolve-InstallerPath {
  if ($Installer) { return $Installer }
  $dirs = @(
    (Join-Path $script:Root 'src-tauri\target\release\bundle\nsis'),
    'D:\Program\Tauri\jx-target\release\bundle\nsis'
  )
  foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $file = Get-ChildItem $dir -Filter '*setup.exe' -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($file) { return $file.FullName }
  }
  return ''
}

# ---------------------------------------------------------------- 1. 安装器单屏交互
function Test-InstallerWindow {
  $exe = Resolve-InstallerPath
  if (-not $exe -or -not (Test-Path $exe)) {
    Add-Result 'installer' '安装器单屏交互（协议勾选 → 按钮状态）' 'SKIP' @{ installer = $exe } '没有找到安装包'
    return
  }

  $installDirBefore = Join-Path $env:LOCALAPPDATA '界序 INTERFACE'
  $beforeMtime = if (Test-Path $installDirBefore) { (Get-Item $installDirBefore).LastWriteTimeUtc } else { $null }

  Log "启动安装器：$exe"
  $proc = Start-Process -FilePath $exe -PassThru
  $hwnd = Wait-Until -TimeoutSec 25 -Check {
    $handle = [Jx.Win]::FindTopWindow($proc.Id, '界序 INTERFACE')
    if ($handle -eq [IntPtr]::Zero) { return $null }
    if ([Jx.Win]::Children($handle).Count -lt 4) { return $null }
    $handle
  }
  if (-not $hwnd) {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Add-Result 'installer' '安装器单屏交互（协议勾选 → 按钮状态）' 'BLOCKED' @{ installer = $exe } '安装器窗口 25s 内没有出现'
    return
  }

  $next = [Jx.Win]::DlgItem($hwnd, 1)
  $before = @{ enabled = [Jx.Win]::Enabled($next); text = [Jx.Win]::TextOf($next) }

  $checkbox = $null
  foreach ($child in [Jx.Win]::Children($hwnd)) {
    if ($child.Text -like '*我已阅读并同意*') { $checkbox = [IntPtr]$child.Handle; break }
  }

  if ($null -eq $checkbox) {
    $controls = [Jx.Win]::Children($hwnd) | ForEach-Object { $_.ToString() }
    [Jx.Win]::SendClose($hwnd)
    Start-Sleep -Milliseconds 800
    if (-not $proc.HasExited) { [Jx.Win]::Command($hwnd, 2); Start-Sleep -Milliseconds 500 }
    Add-Result 'installer' '安装器单屏交互（协议勾选 → 按钮状态）' 'FAIL' @{ controls = $controls } '没找到协议勾选框'
    return
  }

  [Jx.Win]::ClickControl($checkbox)
  Start-Sleep -Milliseconds 400
  $after = @{ enabled = [Jx.Win]::Enabled($next); text = [Jx.Win]::TextOf($next) }

  [Jx.Win]::ClickControl($checkbox)
  Start-Sleep -Milliseconds 400
  $reverted = @{ enabled = [Jx.Win]::Enabled($next); text = [Jx.Win]::TextOf($next) }

  # 取消退出：先 WM_CLOSE，NSIS 若弹确认框再按「是」
  [Jx.Win]::SendClose($hwnd)
  $exited = $proc.WaitForExit(2000)
  if (-not $exited) {
    [Jx.Win]::Command($hwnd, 2)
    $dialog = Wait-Until -TimeoutSec 3 -Check {
      $extra = [Jx.Win]::FindTopWindow($proc.Id, '')
      if ($extra -ne [IntPtr]::Zero -and $extra -ne $hwnd) { $extra } else { $null }
    }
    if ($dialog) { [Jx.Win]::Command($dialog, 6) }
    $exited = $proc.WaitForExit(8000)
  }
  if (-not $exited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }

  $afterMtime = if (Test-Path $installDirBefore) { (Get-Item $installDirBefore).LastWriteTimeUtc } else { $null }
  $installUntouched = ($beforeMtime -eq $afterMtime)

  $ok = (-not $before.enabled) -and ($before.text -like '*请先勾选协议*') -and
    $after.enabled -and ($after.text -like '*立即安装*') -and
    (-not $reverted.enabled) -and ($reverted.text -like '*请先勾选协议*') -and
    $installUntouched

  Add-Result 'installer' '安装器单屏交互（协议勾选 → 按钮状态）' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    installer = $exe
    buttonBefore = $before
    buttonAfterCheck = $after
    buttonAfterUncheck = $reverted
    installerExited = $exited
    installDirUntouched = $installUntouched
  } '按钮文案与 Enabled 随勾选联动，取消后未写入安装目录'
}

# ---------------------------------------------------------------- 2. 首启内置导入
function Test-FirstLaunchImport([IntPtr]$hwnd) {
  $hit = Wait-Until -TimeoutSec 30 -IntervalMs 500 -Check {
    if (-not (Test-Path $script:DbPath)) { return $null }
    $rows = Invoke-Db 'select count(*) as n from cases where deleted_at is null'
    if ($rows[0].n -ge 78) { $rows[0].n } else { $null }
  }
  if (-not $hit) {
    Add-Result 'first-launch' '全新数据目录首启内置包导入' 'FAIL' @{ db = $script:DbPath } '30s 内案例数没有到 78'
    return
  }

  $cases = Invoke-Db 'select count(*) as n from cases where deleted_at is null'
  $packages = Invoke-Db 'select id, source, item_count from content_packages order by installed_at'
  $packageItems = Invoke-Db 'select count(*) as n from content_package_items'
  $haptic = Invoke-Db "select note from categories where id = 'fb.haptic'"
  $dom = $null
  try { $dom = Invoke-Cdp "({ hash: location.hash, text: document.body.innerText.slice(0, 400) })" } catch { }

  $builtin = $packages | Where-Object { $_.source -eq 'builtin' -and $_.item_count -eq 78 } | Select-Object -First 1
  $ok = ($cases[0].n -eq 78) -and $builtin -and ($packageItems[0].n -eq 78)

  Add-Result 'first-launch' '全新数据目录首启内置包导入' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    cases = $cases[0].n
    packages = $packages
    packageItems = $packageItems[0].n
    hapticNote = if ($haptic.Count) { $haptic[0].note } else { $null }
    dom = $dom
  } '数据目录在启动前被整体移走，库文件由应用首次创建'
}

# ---------------------------------------------------------------- 3. 标题栏拖动
function Test-TitleBarDrag([IntPtr]$hwnd) {
  [Jx.Win]::Focus($hwnd)
  if ([Jx.Win]::IsMaximized($hwnd)) {
    [Jx.Win]::Restore($hwnd)
    Start-Sleep -Milliseconds 600
  }
  $start = [Jx.Win]::Rect($hwnd)
  $point = Get-DragPoint $hwnd
  [Jx.Win]::Drag($point.X, $point.Y, $point.X + 64, $point.Y + 48, 12, 25)
  Start-Sleep -Milliseconds 500
  $end = [Jx.Win]::Rect($hwnd)

  $dx = $end.Left - $start.Left
  $dy = $end.Top - $start.Top
  $ok = ([Math]::Abs($dx - 64) -le 8) -and ([Math]::Abs($dy - 48) -le 8) -and
    ([Math]::Abs($end.Width - $start.Width) -le 2) -and ([Math]::Abs($end.Height - $start.Height) -le 2)

  Add-Result 'titlebar-drag' '标题栏拖动（位移跟随鼠标）' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    start = $start.ToString()
    end = $end.ToString()
    delta = "$dx,$dy"
    expected = '64,48 (±8)'
  } '自绘标题栏走 data-tauri-drag-region'
}

# ---------------------------------------------------------------- 4. 双击最大化 / 还原
function Test-TitleBarDoubleClick([IntPtr]$hwnd) {
  $before = [Jx.Win]::Rect($hwnd)
  $point = Get-DragPoint $hwnd
  [Jx.Win]::DoubleClickAt($point.X, $point.Y)
  Start-Sleep -Milliseconds 900
  $maximized = [Jx.Win]::IsMaximized($hwnd)
  $maxRect = [Jx.Win]::Rect($hwnd)

  $maxPoint = Get-DragPoint $hwnd
  [Jx.Win]::DoubleClickAt($maxPoint.X, $maxPoint.Y)
  Start-Sleep -Milliseconds 900
  $restored = -not [Jx.Win]::IsMaximized($hwnd)
  $restoredRect = [Jx.Win]::Rect($hwnd)

  $grew = $maxRect.Width -gt ($before.Width + 80)
  $cameBack = ([Math]::Abs($restoredRect.Width - $before.Width) -le 8) -and
    ([Math]::Abs($restoredRect.Left - $before.Left) -le 8)
  $ok = $maximized -and $restored -and $grew -and $cameBack

  Add-Result 'titlebar-dblclick' '标题栏双击最大化 / 再次双击还原' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    before = $before.ToString()
    maximized = $maximized
    maxRect = $maxRect.ToString()
    restored = $restored
    restoredRect = $restoredRect.ToString()
  } 'IsZoomed 与窗口矩形同时判定'
}

# ---------------------------------------------------------------- 5. 边缘吸附
function Test-EdgeSnap([IntPtr]$hwnd) {
  [Jx.Win]::Focus($hwnd)
  if ([Jx.Win]::IsMaximized($hwnd)) {
    [Jx.Win]::Restore($hwnd)
    Start-Sleep -Milliseconds 600
  }
  $before = [Jx.Win]::Rect($hwnd)
  $area = [Jx.Win]::WorkArea($hwnd)
  $point = Get-DragPoint $hwnd
  $targetX = $area.Left + 2
  $targetY = $area.Top + [int]($area.Height / 2)

  [Jx.Win]::Drag($point.X, $point.Y, $targetX, $targetY, 20, 25)
  Start-Sleep -Milliseconds 900
  $snapped = [Jx.Win]::Rect($hwnd)

  $halfWidth = [int]($area.Width / 2)
  $ok = ($snapped.Left -le $area.Left + 4) -and
    ([Math]::Abs($snapped.Width - $halfWidth) -le 12) -and
    ($snapped.Top -le $area.Top + 8) -and
    ($snapped.Height -ge [int]($area.Height * 0.9))

  [Jx.Win]::Place($hwnd, $before.Left, $before.Top, $before.Width, $before.Height)
  Start-Sleep -Milliseconds 500
  $after = [Jx.Win]::Rect($hwnd)

  Add-Result 'edge-snap' '拖到屏幕左边缘吸附半屏' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    before = $before.ToString()
    workArea = $area.ToString()
    snapped = $snapped.ToString()
    expectedWidth = $halfWidth
    restored = $after.ToString()
  } '吸附成功后脚本强制还原到原矩形，避免影响后续用例'
}

# ---------------------------------------------------------------- 6. 触觉类目「暂缺」说明
function Test-HapticNote {
  # 用面板导航到反馈域，再点左栏入口展开二级导航
  try {
    Invoke-Cdp "location.hash = '#/feedback'; 'ok'" | Out-Null
    Start-Sleep -Milliseconds 900
    $click = Invoke-Cdp @'
(() => {
  const target = [...document.querySelectorAll(".rail-item")]
    .find((node) => node.innerText.trim().startsWith("反馈与状态"));
  if (!target) return { clicked: false };
  target.click();
  return { clicked: true };
})()
'@
    Start-Sleep -Milliseconds 800

    $probe = Invoke-Cdp @'
(() => {
  const layers = [...document.querySelectorAll(".nav-layer")];
  const active = layers.find((node) => node.dataset.state === "active") ?? layers.at(-1);
  if (!active) return { error: "没有二级导航层", layerStates: layers.map((n) => n.dataset.state) };
  const button = [...active.querySelectorAll("button")]
    .find((node) => node.innerText.includes("触觉"));
  if (!button) return { error: "二级导航里没有触觉类目", text: active.innerText };
  const note = button.parentElement.querySelector("p");
  const count = button.querySelector(".rail-count");
  return {
    label: button.innerText.trim(),
    count: count ? count.textContent : null,
    note: note ? note.textContent : null,
    selected: button.getAttribute("aria-pressed"),
  };
})()
'@
  } catch {
    Add-Result 'haptic-note' '触觉类目「暂缺」说明在左栏渲染' 'BLOCKED' @{ error = "$_" } 'CDP 不可用'
    return
  }

  $ok = ($probe.note -and $probe.note -match '无触觉通道') -and ($probe.count -eq '0')
  Add-Result 'haptic-note' '触觉类目「暂缺」说明在左栏渲染' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    click = $click
    probe = $probe
  } 'note 只在计数为 0 且类目有 note 时显示'
}

# ---------------------------------------------------------------- 7. Ctrl+E 导出落盘
function Test-ExportShortcut([IntPtr]$hwnd) {
  try {
    Invoke-Cdp "location.hash = '#/library'; 'ok'" | Out-Null
    Start-Sleep -Milliseconds 1000
    $detail = Invoke-Cdp @'
(() => {
  const section = document.querySelector('[aria-labelledby^="assets-heading"]');
  const title = document.querySelector(".stage h2, main h2");
  return { detailMounted: Boolean(section), title: title ? title.textContent : null };
})()
'@
  } catch {
    Add-Result 'ctrl-e-export' 'Ctrl+E 导出并落盘到 exports/' 'BLOCKED' @{ error = "$_" } 'CDP 不可用'
    return
  }

  if (-not $detail.detailMounted) {
    Add-Result 'ctrl-e-export' 'Ctrl+E 导出并落盘到 exports/' 'FAIL' @{ detail = $detail } '当前没有选中案例，导出动作未注册'
    return
  }

  $exportsDir = Join-Path $script:DataDir 'exports'
  $startedAt = Get-Date
  [Jx.Win]::Focus($hwnd)
  Start-Sleep -Milliseconds 300
  [Jx.Win]::CtrlKey(0x45) # E

  $written = Wait-Until -TimeoutSec 12 -IntervalMs 400 -Check {
    if (-not (Test-Path $exportsDir)) { return $null }
    $files = Get-ChildItem $exportsDir -File | Where-Object {
      $_.LastWriteTime -ge $startedAt.AddSeconds(-2) -and $_.Length -gt 0
    }
    if (@($files).Count -ge 2) { @($files) } else { $null }
  }

  if (-not $written) {
    Add-Result 'ctrl-e-export' 'Ctrl+E 导出并落盘到 exports/' 'FAIL' @{ exportsDir = $exportsDir; detail = $detail } '12s 内没有出现新的导出文件'
    return
  }

  $list = @($written | ForEach-Object {
      @{ name = $_.Name; bytes = $_.Length; writtenAt = $_.LastWriteTime.ToString('HH:mm:ss.fff') }
    })
  $hasMarkdown = @($written | Where-Object { $_.Extension -eq '.md' }).Count -ge 1
  $hasJson = @($written | Where-Object { $_.Extension -eq '.json' }).Count -ge 1
  $ok = $hasMarkdown -and $hasJson

  Add-Result 'ctrl-e-export' 'Ctrl+E 导出并落盘到 exports/' ($(if ($ok) { 'PASS' } else { 'FAIL' })) @{
    caseTitle = $detail.title
    exportsDir = $exportsDir
    files = $list
  } '按 mtime 判定，文件名同日重复会被覆盖也不影响结论'
}

# ---------------------------------------------------------------- 8. 拖拽图片导入
function New-DropFixture([string]$dir) {
  Add-Type -AssemblyName System.Drawing
  $path = Join-Path $dir 'drop-target.png'
  $bitmap = New-Object System.Drawing.Bitmap 480, 320
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::FromArgb(245, 248, 250))
  $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(29, 78, 216))
  $graphics.FillRectangle($accent, 32, 32, 416, 12)
  $graphics.FillRectangle($accent, 32, 64, 240, 12)
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(84, 101, 117))
  for ($i = 0; $i -lt 4; $i += 1) {
    $graphics.FillRectangle($muted, 32, (120 + $i * 36), (380 - $i * 40), 10)
  }
  $font = New-Object System.Drawing.Font 'Segoe UI', 14
  $graphics.DrawString('drop fixture 480x320', $font, $muted, 32, 268)
  $graphics.Dispose()
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  return $path
}

function Test-DragDropImage([IntPtr]$hwnd) {
  if ($SkipDrop) {
    Add-Result 'drag-drop-image' '拖一张图片进窗口导入' 'SKIP' @{} '按参数跳过'
    return
  }

  $fixtureDir = Join-Path $OutDir 'fixture'
  New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null
  $png = New-DropFixture $fixtureDir

  $before = (Invoke-Db "select count(*) as n from assets where original_name = 'drop-target.png'")[0].n

  # 应用占右半屏，Explorer 留在左侧，保证两边同时可见
  $area = [Jx.Win]::WorkArea($hwnd)
  $appWidth = [int]($area.Width / 2) - 60
  [Jx.Win]::Place($hwnd, ($area.Left + [int]($area.Width / 2) + 30), ($area.Top + 40), $appWidth, [int]($area.Height * 0.8))
  Start-Sleep -Milliseconds 600

  Start-Process explorer.exe -ArgumentList ('/select,"' + $png + '"') | Out-Null
  Start-Sleep -Milliseconds 1800

  $iconRect = $null
  $uiaError = ''
  try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -AssemblyName Microsoft.VisualBasic
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $folderName = Split-Path $fixtureDir -Leaf
    $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty, $folderName)
    $explorerWindow = Wait-Until -TimeoutSec 12 -Check {
      $candidate = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $windowCondition)
      if ($candidate) { $candidate } else { $null }
    }
    if (-not $explorerWindow) { throw "找不到标题为 $folderName 的 Explorer 窗口" }

    $nameCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty, 'drop-target.png')
    $item = Wait-Until -TimeoutSec 10 -Check {
      $candidate = $explorerWindow.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $nameCondition)
      if ($candidate) { $candidate } else { $null }
    }
    if (-not $item) { throw 'Explorer 里找不到 drop-target.png 列表项' }

    $rect = $item.Current.BoundingRectangle
    if ($rect.Width -le 0) { throw '文件项的 UIA 矩形为空' }
    $iconRect = @{
      X = [int]($rect.X + $rect.Width / 2)
      Y = [int]($rect.Y + $rect.Height / 2)
    }
    [Microsoft.VisualBasic.Interaction]::AppActivate($explorerWindow.Current.ProcessId) | Out-Null
    Start-Sleep -Milliseconds 500
  } catch {
    $uiaError = "$($_.Exception.Message)"
  }

  if (-not $iconRect) {
    Add-Result 'drag-drop-image' '拖一张图片进窗口导入' 'BLOCKED' @{
      fixture = $png
      uiaError = $uiaError
    } '桌面自动化（UIA 定位 Explorer 文件项）不可用，需要人工拖一次'
    return
  }

  $appRect = [Jx.Win]::Rect($hwnd)
  $dropX = $appRect.Left + [int]($appRect.Width * 0.55)
  $dropY = $appRect.Top + [int]($appRect.Height * 0.45)
  Log "从 Explorer ($($iconRect.X),$($iconRect.Y)) 拖到窗口 ($dropX,$dropY)"
  [Jx.Win]::Drag($iconRect.X, $iconRect.Y, $dropX, $dropY, 24, 25)
  Start-Sleep -Milliseconds 800

  $after = Wait-Until -TimeoutSec 15 -IntervalMs 500 -Check {
    $rows = Invoke-Db "select id, original_name, mime, byte_size from assets where original_name = 'drop-target.png'"
    if ($rows.Count -gt $before) { $rows } else { $null }
  }

  Add-Result 'drag-drop-image' '拖一张图片进窗口导入' ($(if ($after) { 'PASS' } else { 'FAIL' })) @{
    fixture = $png
    before = $before
    after = if ($after) { $after } else { 0 }
    dropPoint = "$dropX,$dropY"
  } '判定看 assets 表是否新增同名行，不看提示文案'
}

# ---------------------------------------------------------------- 9. Ctrl+N 新建
function Test-NewCaseShortcut([IntPtr]$hwnd) {
  [Jx.Win]::Focus($hwnd)
  Start-Sleep -Milliseconds 400
  [Jx.Win]::CtrlKey(0x4E) # N

  $probe = Wait-Until -TimeoutSec 8 -IntervalMs 300 -Check {
    try {
      $value = Invoke-Cdp @'
(() => {
  const input = document.getElementById("case-title-input");
  return {
    form: Boolean(input),
    focused: document.activeElement ? document.activeElement.id : null,
    hash: location.hash,
  };
})()
'@
      if ($value.form) { $value } else { $null }
    } catch { $null }
  }

  if (-not $probe) {
    Add-Result 'ctrl-n-new' 'Ctrl+N 新建案例并聚焦标题' 'FAIL' @{} '8s 内没有出现标题输入框'
    return
  }

  $ok = ($probe.form -eq $true) -and ($probe.focused -eq 'case-title-input') -and
    ($probe.hash -match '^#/(style|motion|feedback|component|theme)')
  Add-Result 'ctrl-n-new' 'Ctrl+N 新建案例并聚焦标题' ($(if ($ok) { 'PASS' } else { 'FAIL' })) $probe '跨路由时先落到内容域再展开表单'
}

# ---------------------------------------------------------------- 主流程
$appHwnd = [IntPtr]::Zero
$reportPath = Join-Path $OutDir 'report.md'

try {
  if (-not $SkipInstaller) {
    try { Test-InstallerWindow } catch { Add-Result 'installer' '安装器单屏交互（协议勾选 → 按钮状态）' 'BLOCKED' @{ error = "$_" } '脚本异常' }
  } else {
    Add-Result 'installer' '安装器单屏交互（协议勾选 → 按钮状态）' 'SKIP' @{} '按参数跳过'
  }

  $running = Get-AppProcess
  if ($running) {
    throw "应用正在运行（PID $($running.Id)），请先退出再跑验收，脚本不会强杀用户窗口"
  }

  # 首启用例：整体移走数据目录，让应用在空目录上首次启动
  if (Test-Path $script:DataDir) {
    $script:BackupDir = "$($script:DataDir).acceptance-backup-$($script:Stamp)"
    if (Test-Path $script:BackupDir) { throw "备份路径已存在：$($script:BackupDir)" }
    Log "备份数据目录 → $($script:BackupDir)"
    Move-Item $script:DataDir $script:BackupDir
  }

  $appHwnd = Start-AppWindow
  if (-not (Wait-CdpReady 25)) {
    Add-Result 'cdp' 'WebView2 调试端口可用' 'BLOCKED' @{ port = $DebugPort } 'DOM 类断言将不可用'
  }

  Test-FirstLaunchImport $appHwnd
  if ($appHwnd -ne [IntPtr]::Zero) {
    Test-TitleBarDrag $appHwnd
    Test-TitleBarDoubleClick $appHwnd
    Test-EdgeSnap $appHwnd
    Test-HapticNote
    Test-ExportShortcut $appHwnd
    Test-DragDropImage $appHwnd
    Test-NewCaseShortcut $appHwnd
  }
} catch {
  Add-Result 'fatal' '验收主流程' 'BLOCKED' @{ error = "$($_.Exception.Message)" } '见上方输出'
} finally {
  Stop-AppWindow $appHwnd
  Start-Sleep -Milliseconds 800
  # 测试数据整体丢弃，原始数据目录原样还回
  if (-not $script:BackupDir -and (Test-Path $script:DataDir)) {
    Remove-Item -Recurse -Force $script:DataDir -ErrorAction SilentlyContinue
  }
  if ($script:BackupDir -and (Test-Path $script:BackupDir)) {
    if (Test-Path $script:DataDir) { Remove-Item -Recurse -Force $script:DataDir -ErrorAction SilentlyContinue }
    Move-Item $script:BackupDir $script:DataDir
    Log '数据目录已还原'
  }
}

# ---------------------------------------------------------------- 报告
$summary = $script:Results | Group-Object Status | ForEach-Object { "$($_.Name) $($_.Count)" }
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# 真窗口验收报告')
$lines.Add('')
$lines.Add("- 时间：$($script:Stamp)")
$lines.Add("- 应用：$AppExe")
$lines.Add("- 安装包：$(if ($Installer) { $Installer } else { (Resolve-InstallerPath) })")
$lines.Add("- 系统：$([System.Environment]::OSVersion.VersionString)")
$lines.Add("- 汇总：$($summary -join ' / ')")
$lines.Add('')
$lines.Add('| 项目 | 结果 | 说明 |')
$lines.Add('|---|---|---|')
foreach ($item in $script:Results) {
  $note = ($item.Note -replace '\|', '/')
  $lines.Add("| $($item.Title) | $($item.Status) | $note |")
}
$lines.Add('')
$lines.Add('## 证据')
foreach ($item in $script:Results) {
  $lines.Add('')
  $lines.Add("### $($item.Title) — $($item.Status)")
  $lines.Add('')
  $lines.Add('```json')
  $lines.Add(($item.Evidence | ConvertTo-Json -Depth 8))
  $lines.Add('```')
}
$lines | Set-Content -Path $reportPath -Encoding utf8
$script:Results | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $OutDir 'results.json') -Encoding utf8

Write-Host ''
Write-Host ("[acceptance] 报告：" + $reportPath) -ForegroundColor Cyan
$failed = @($script:Results | Where-Object { $_.Status -eq 'FAIL' }).Count
exit $(if ($failed -gt 0) { 1 } else { 0 })

