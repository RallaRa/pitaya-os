@echo off
chcp 65001 >nul
cd /d C:\pitaya-bridge
del .sync-fingerprint-cache.json 2>nul
echo === BATCH START %date% %time% ===>> sync-batch.log
echo === TODAY ===>> sync-batch.log
node bridge.js today >> sync-batch.log 2>&1
echo === MIGRATE 2025-05-01 ~ today ===>> sync-batch.log
node bridge.js migrate 2025-05-01 2026-06-10 >> sync-batch.log 2>&1
echo === BATCH DONE %date% %time% ===>> sync-batch.log
