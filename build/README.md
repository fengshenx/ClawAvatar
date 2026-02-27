# Electron Build Resources

此目录包含 Electron 打包所需的资源文件。

## 必需文件

### icon.icns
**状态：** ⚠️ 缺失（需要准备）

**如何准备：**

1. **在线工具（推荐）：**
   - 准备一个 **1024x1024** 的 PNG 图标
   - 访问 https://iconut.com/
   - 上传 PNG，下载 icns 文件
   - 重命名为 `icon.icns`，放到此目录

2. **使用 ImageMagick：**
   ```bash
   # 安装 ImageMagick
   brew install imagemagick
   
   # 生成不同尺寸
   for size in 16 32 128 256 512 1024; do
     convert your-icon.png -resize ${size}x${size} icon_${size}x${size}.png
     convert your-icon.png -resize $((size*2))x$((size*2)) icon_${size}x${size}@2x.png
   done
   
   # 创建 iconset
   mkdir icon.iconset
   for size in 16 32 128 256 512 1024; do
     mv icon_${size}x${size}.png icon.iconset/icon_${size}x${size}.png
     mv icon_${size}x${size}@2x.png icon.iconset/icon_${size}x${size}@2x.png
   done
   
   # 生成 icns
   iconutil -c icns icon.iconset -o icon.icns
   mv icon.icns build/
   ```

3. **临时方案：**
   如果暂时没有图标，编辑 `package.json`，注释掉 `icon` 配置：
   ```json
   "mac": {
     // "icon": "build/icon.icns",
     ...
   }
   ```

---

## 配置文件

### entitlements.mac.plist
**状态：** ✅ 已生成

用于 macOS 代码签名和权限配置。

---

## 输出目录

打包后的文件会输出到项目根目录的 `dist/` 文件夹。
