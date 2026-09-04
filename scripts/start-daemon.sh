#!/bin/bash
# 合盖不睡 + 低功耗运行 daemon
# caffeinate -s: 防止系统睡眠（合盖也保持运行，需接电源）
# caffeinate -d: 防止显示睡眠（可选，确保网络不断）
export PATH="/Users/caiguu/.bun/bin:$PATH"
cd /Users/caiguu/Desktop/asoul_timeline/packages/crawler
exec caffeinate -s -i bun run daemon