#!/usr/bin/env bash
set -euo pipefail
# 解析真实路径（兼容符号链接）
if command -v realpath &>/dev/null; then
  REPO_DIR="$(dirname "$(realpath "$0")")/.."
elif command -v readlink &>/dev/null; then
  REPO_DIR="$(dirname "$(readlink -f "$0")")/.."
else
  REPO_DIR="$(cd "$(dirname "$0")" && pwd)/.."
fi
cd "$REPO_DIR"

LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/crawler-$(date +%Y%m%d).log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] crawl start" >> "$LOG"

export PATH="$HOME/.bun/bin:$PATH"

bun crawl >> "$LOG" 2>&1 && {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] crawl ok, syncing..." >> "$LOG"
  bun sync:remote >> "$LOG" 2>&1 && {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] sync ok" >> "$LOG"
  } || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] sync FAILED" >> "$LOG"
  }
} || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] crawl FAILED" >> "$LOG"
}