# ClawAvatar 打包指南

## 快速开始

### 1. 安装依赖

```bash
cd ~/Documents/code/ClawAvatar
npm install
```

### 2. 准备图标

**图标文件路径：** `build/icon.icns`

#### 方式 1：使用在线工具（推荐）

1. 准备一个 **1024x1024** 的 PNG 图标
2. 访问 https://iconut.com/ 或 https://cloudconvert.com/png-to-icns
3. 上传 PNG，下载 icns 文件
4. 重命名为 `icon.icns`，放到 `build/` 目录

#### 方式 2：使用命令行工具

```bash
# 安装 iconutil（macOS 自带，无需安装）
# 准备 icon.iconset 目录，包含不同尺寸的图标
mkdir -p build/icon.iconset

# 需要这些尺寸的 PNG：
# icon_16x16.png
# icon_32x32.png
# icon_128x128.png
# icon_256x256.png
# icon_512x512.png
# icon_1024x1024.png
# 以及对应的 @2x 版本

# 生成 icns
iconutil -c icns build/icon.iconset -o build/icon.icns
```

#### 临时方案：使用默认图标

如果暂时没有图标，可以先注释掉 `package.json` 中的配置：

```json
"mac": {
  // "icon": "build/icon.icns",  // 暂时注释
  ...
}
```

---

### 3. 打包

```bash
# 打包但不生成安装包（测试用）
npm run pack

# 生成 macOS 安装包（ARM64 + x64 通用）
npm run dist:mac

# 只生成 Apple Silicon 版本
npm run dist:mac:arm64

# 只生成 Intel 版本
npm run dist:mac:x64
```

**输出位置：** `dist/` 目录

- `ClawAvatar-0.2.0-arm64.dmg` - Apple Silicon 安装包
- `ClawAvatar-0.2.0-x64.dmg` - Intel 安装包
- `ClawAvatar-0.2.0.dmg` - 通用二进制（推荐）
- `ClawAvatar-0.2.0-mac.zip` - 归档版本

---

## 发布到 GitHub Releases

### 1. 创建 GitHub Personal Access Token

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 勾选权限：
   - ✅ `repo` (full control of private repositories)
4. 生成并复制 token

### 2. 配置环境变量

```bash
export GH_TOKEN="your_token_here"
```

或添加到 `~/.zshrc`：

```bash
echo 'export GH_TOKEN="your_token_here"' >> ~/.zshrc
source ~/.zshrc
```

### 3. 发布

```bash
# 打标签并推送到 GitHub
git tag v0.2.0
git push origin v0.2.0

# 自动构建并上传到 GitHub Releases
npm run release
```

---

## 测试安装包

```bash
# 安装（会打开 DMG 拖拽）
open dist/ClawAvatar-0.2.0.dmg

# 或直接运行打包后的应用
open dist/mac/ClawAvatar.app
```

---

## 常见问题

### 1. "No valid matching arm64 found"

确保你在 Apple Silicon Mac 上打包，或使用 `--mac --x64` 指定架构。

### 2. "Code sign failed"

如果是开发测试，可以禁用代码签名：

```json
"mac": {
  "hardenedRuntime": false,
  "gatekeeperAssess": false
}
```

### 3. 应用无法打开（来自身份不明开发者）

在终端运行：

```bash
xattr -cr /Applications/ClawAvatar.app
```

---

## 文件大小优化

如果打包后太大（>100MB），可以：

1. 检查 `node_modules` 是否包含不必要的依赖
2. 使用 `compression: maximum`：
   ```json
   "mac": {
     "compression": "maximum"
   }
   ```
3. 排除不必要的文件：
   ```json
   "files": [
     "electron/**/*",
     "dist/**/*",
     "node_modules/**/*",
     "!node_modules/**/test/**/*",
     "!node_modules/**/*.md",
     "!node_modules/**/*.map"
   ]
   ```

---

## 下一步

- [ ] 准备图标（build/icon.icns）
- [ ] 本地测试打包（npm run pack）
- [ ] 生成 DMG（npm run dist:mac）
- [ ] 测试安装和运行
- [ ] 发布到 GitHub Releases
