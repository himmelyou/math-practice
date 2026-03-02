#!/bin/bash

# 切换到脚本所在目录（项目根目录）
cd "$(dirname "$0")"

# 使用本地 Node 运行静态服务器（测试环境，端口 8081，连接本地后端 http://localhost:3001）
export ADMIN_PORT=8081
node local-admin-server.js

