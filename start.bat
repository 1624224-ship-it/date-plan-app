@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo  起動中...

REM すでに起動中のnodeを止める
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM バックエンド（このウィンドウを閉じたら終了）
start "バックエンド[閉じない]" /min cmd /k "title バックエンド[閉じないで！] && cd /d "%~dp0backend" && node server.js"
timeout /t 3 /nobreak >nul

REM フロントエンド（スマホからもアクセス可能）
start "フロントエンド[閉じない]" /min cmd /k "title フロントエンド[閉じないで！] && cd /d "%~dp0frontend" && npm run dev -- --host"
timeout /t 8 /nobreak >nul

start http://localhost:5173
echo  ブラウザを開きました！
echo  タスクバーの黒いウィンドウ2つは閉じないでください。
pause

