#!/bin/bash
# ============================================================================
# 灵感雷达 · 每日自动刷新脚本
# 功能：拉取 Reddit 最新抱怨数据 → 生成每日榜单 → 生成周报 → 生成异常预警
# 运行：bash scripts/daily-refresh.sh （手动） / launchd 每天 09:00 触发
# 日志：.data/refresh.log （追加，可追溯每次执行）
# 产物：.data/weekly-YYYY-MM-DD.md / .data/anomaly-YYYY-MM-DD.json
# ============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$PROJECT_DIR/.data"
LOG_FILE="$DATA_DIR/refresh.log"
PORT=3001
BASE="http://localhost:$PORT"
DATE="$(date +%Y-%m-%d)"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

mkdir -p "$DATA_DIR"

# ---------- 辅助 ----------
log() {
  echo "$(date '+%H:%M:%S') | $1" >> "$LOG_FILE"
}
fail() {
  log "❌ FAIL | $1"
  exit 1
}

# ---------- 1. 确保服务在线 ----------
log "──────────────────────────────────────────"
log "▶ 开始每日刷新"
START_SEC="$(date +%s)"

# 用静态首页检查服务（避免 /api/complaints 缓存过期触发慢抓取而误判为离线）
if ! curl -s -o /dev/null --max-time 3 "$BASE/"; then
  log "⚠  服务 $BASE 不在线，尝试启动…"
  cd "$PROJECT_DIR"
  ( nohup /Users/huangdanting/.local/share/nodejs/bin/node ./node_modules/next/dist/bin/next start -p $PORT \
      > "$DATA_DIR/.next-start.log" 2>&1 & )
  for i in $(seq 1 15); do
    sleep 2
    if curl -s -o /dev/null --max-time 3 "$BASE/"; then
      log "✅ 服务启动成功（等待 ${i}×2s）"
      break
    fi
    [ "$i" -eq 15 ] && fail "服务 30s 内未启动，放弃本次刷新"
  done
else
  log "✅ 服务已在线"
fi

# ---------- 2. 刷新抓取 + 生成榜单 ----------
log "▶ 抓取 Reddit 最新数据（?refresh=1）…"
REFRESH_JSON="$(curl -s --max-time 120 "$BASE/api/complaints?refresh=1" 2>/dev/null || true)"
TOTAL="$(echo "${REFRESH_JSON:-}" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('complaints',[])))" 2>/dev/null || echo "0")"
RANK_SIZE="$(echo "${REFRESH_JSON:-}" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('rankMeta',{}).get('size','—'))" 2>/dev/null || echo "—")"
MODE="$(echo "${REFRESH_JSON:-}" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print('RSS' if d.get('live') else ('seed' if d.get('mode')=='seed' else 'fallback'))" 2>/dev/null || echo "unknown")"
log "✅ 抓取完成 | 总 $TOTAL 条 | 榜单 $RANK_SIZE | 模式 $MODE"

# ---------- 3. 生成周报 ----------
log "▶ 生成周报…"
WEEKLY_JSON="$(curl -s -X POST "$BASE/api/assistant" \
  -H "Content-Type: application/json" -d '{"action":"weekly-report"}' \
  --max-time 60 2>/dev/null || true)"
ENGINE="$(echo "${WEEKLY_JSON:-}" | /usr/bin/python3 -c "import sys,json; print(json.load(sys.stdin).get('engine','?'))" 2>/dev/null || echo "?")"
ANSWER="$(echo "${WEEKLY_JSON:-}" | /usr/bin/python3 -c "import sys,json; print(json.load(sys.stdin).get('answer',''))" 2>/dev/null || echo "")"
if [ -n "$ANSWER" ]; then
  echo "# 灵感雷达 · 每日周报" > "$DATA_DIR/weekly-$DATE.md"
  echo "" >> "$DATA_DIR/weekly-$DATE.md"
  echo "- 生成时间：$TS" >> "$DATA_DIR/weekly-$DATE.md"
  echo "- 抓取模式：$MODE" >> "$DATA_DIR/weekly-$DATE.md"
  echo "- 总抱怨：$TOTAL 条 | 榜单：$RANK_SIZE" >> "$DATA_DIR/weekly-$DATE.md"
  echo "- 引擎：$ENGINE" >> "$DATA_DIR/weekly-$DATE.md"
  echo "" >> "$DATA_DIR/weekly-$DATE.md"
  echo "---" >> "$DATA_DIR/weekly-$DATE.md"
  echo "" >> "$DATA_DIR/weekly-$DATE.md"
  echo "$ANSWER" >> "$DATA_DIR/weekly-$DATE.md"
  log "✅ 周报已保存：weekly-$DATE.md（引擎 ${ENGINE}）"
else
  log "⚠  周报无内容，跳过保存"
fi

# ---------- 4. 异常预警 ----------
log "▶ 生成异常预警…"
ANOMALY_JSON="$(curl -s -X POST "$BASE/api/assistant" \
  -H "Content-Type: application/json" -d '{"action":"anomaly"}' \
  --max-time 30 2>/dev/null || true)"
BAD_COUNT="$(echo "${ANOMALY_JSON:-}" | /usr/bin/python3 -c "
import sys,json
d=json.load(sys.stdin)
alerts=d.get('alerts',[])
print(len([a for a in alerts if a['level']!='info']))
" 2>/dev/null || echo "0")"
echo "${ANOMALY_JSON:-}" > "$DATA_DIR/anomaly-$DATE.json" 2>/dev/null || true
log "✅ 异常预警已保存（需关注 $BAD_COUNT 项）"

# ---------- 完成 ----------
END_SEC="$(date +%s)"
ELAPSED=$(( END_SEC - START_SEC ))
log "⏱  总耗时 ${ELAPSED}s | 本次刷新结束"
