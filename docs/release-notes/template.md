# 发版说明模板

> 复制本文件为 `vX.Y.Z.md`，按实际内容填写。发布前删除本行与未使用的占位。

## vX.Y.Z — YYYY-MM-DD

**发布类型**：初始框架预览版 / 功能版 / 修复版 / 安全更新
**适用平台**：Windows 10 1803+ / Windows 11（x64）

### 摘要

一句话说明本版最重要的变化与适用人群。

### Added

- 新增功能 A（对应 PRD 编号）
- 新增功能 B

### Changed

- 变更点 A
- 变更点 B

### Fixed

- 修复问题 A（关联 Issue #）
- 修复问题 B

### Security

- 安全相关修复或加固（如无可写「无」）

### Known Issues

- 已知问题 A（影响范围、临时规避方式）
- 已知问题 B

### 附件与校验和

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `界序-INTERFACE_X.Y.Z_x64-setup.exe` | （构建后填写） | （构建后填写） |
| `界序-INTERFACE_X.Y.Z_x64.msi`（如提供） | | |

校验方法（PowerShell）：

```powershell
Get-FileHash .\界序-INTERFACE_X.Y.Z_x64-setup.exe -Algorithm SHA256
```

### 升级说明

- 覆盖安装是否保留数据：是 / 否
- 是否需要备份：是 / 否
- 数据库迁移：无 / 有（说明版本）

### 已知限制

- 本版不包含的功能（明确标「规划中」）
- 平台限制（如仅 Windows）
