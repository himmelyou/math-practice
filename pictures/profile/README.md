# 批量上传头像入口（本地）

把你要批量导入的头像图片放到本目录下即可。

## 支持格式

- `.png` / `.jpg` / `.jpeg` / `.webp`

## 如何导入到系统

1. 先启动本地 API（`server/server.js`）
2. 打开管理端 `docs/admin/` → **头像管理** → 点击「批量导入 profile 目录」

导入后图片会被复制到后端数据目录的 `avatar-assets` 下，并写入 `avatars.json`（不会直接使用本目录作为线上资源）。

