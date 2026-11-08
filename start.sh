#!/bin/bash
# ============================================================================
# 灵感雷达 IDEA RADAR · 一键启动脚本（可运行文件夹版）
# 用法：
#   bash start.sh            # 默认端口 3000
#   PORT=8080 bash start.sh  # 指定端口
# 依赖：Node.js >= 18（未安装时脚本会提示）
# ============================================================================

set -euo pipefail

# 定位项目根目录（脚本所在目录）
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3000}"

# ---------- 1. 查找可用的 node ----------
NODE=""
for cand in \
  "$(command -v node 2>/dev/null || true)" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "/private/tmp/nodejs/bin/node" \
  "$HOME/.nvm/versions/node/"*/bin/node \
  "$HOME/.fnm/current/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then
    NODE="$cand"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo "✗ 未找到 Node.js。请先安装 Node.js >= 18：https://nodejs.org/"
  exit 1
fi
echo "✓ Node.js: $($NODE -v 2>/dev/null || echo 未知) ($NODE)"

# ---------- 2. 检查构建产物，缺失则构建 ----------
NEXT_BIN="$PROJECT_DIR/node_modules/next/dist/bin/next"
if [ ! -d "$PROJECT_DIR/.next" ]; then
  echo "· 未检测到构建产物 .next，正在构建…（首次需 1-3 分钟）"
  cd "$PROJECT_DIR"
  NPM="$(dirname "$NODE")/npm"
  if [ -x "$NPM" ]; then
    "$NPM" install --no-audit --no-fund
  fi
  "$NODE" "$NEXT_BIN" build
fi

# ---------- 3. 启动服务 ----------
echo "· 启动服务：http://localhost:$PORT （Ctrl+C 停止）"
echo "· 数据源：Reddit RSS 实时抓取；网络受限/限流时自动降级为内置种子数据（80+ 条）"
cd "$PROJECT_DIR"
"$NODE" "$NEXT_BIN" start -p "$PORT"

# macOS 自动打开浏览器（可选）
# open "http://localhost:$PORT"
