#!/bin/sh
set -eu

# 每次启动都按「当前磁盘上实际存在的插件」重建 addon.json，
# 因此切分支后只需 docker compose up -d --force-recreate，不需要改配置、不需要 --build。
node /root/gen-addons.js

if ! node /root/seed-local.js check; then
  echo "[local-init] 首次启动，等待 Hydro 初始化基础表结构..."
  hydrooj --host 127.0.0.1 --port 8889 \
    --template /root/.hydro/addons/ui-custom/templates >/tmp/hydro-init.log 2>&1 &
  INIT_PID=$!

  if ! node /root/seed-local.js wait_ready; then
    cat /tmp/hydro-init.log || true
    kill "$INIT_PID" 2>/dev/null || true
    exit 1
  fi

  kill "$INIT_PID" 2>/dev/null || true
  wait "$INIT_PID" 2>/dev/null || true

  echo "[local-init] 写入 CUGACM 外观配置与本地管理员 (admin / 123456)..."
  node /root/seed-local.js apply
  echo "[local-init] 初始化完成。"
fi

exec "$@"
