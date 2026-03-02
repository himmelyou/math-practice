#!/bin/bash

# 切换到脚本所在目录（项目根目录）
cd "$(dirname "$0")"

# 使用本地 Node 运行静态服务器（线上环境，端口 8080，连接线上 Render 后端）
export ADMIN_PORT=8080
node local-admin-server.js

