@echo off
chcp 65001 >nul
title Abordage GM Launcher

echo [1] Запускаем квантовый туннель (ngrok)...
start "Ngrok" ngrok http 3000

echo Ожидание инициализации шлюза...
timeout /t 4 /nobreak >nul

echo [2] Получаем координаты сервера...
:: Обращаемся к локальному API ngrok, чтобы вытащить сгенерированную ссылку
FOR /F "tokens=*" %%g IN ('powershell -Command "(Invoke-RestMethod -Uri 'http://localhost:4040/api/tunnels').tunnels[0].public_url"') do (SET NGROK_URL=%%g)

echo.
echo ==========================================================
echo БАЗОВЫЙ АДРЕС: %NGROK_URL%
echo ==========================================================
echo.
echo ШАГ 1: Вставь эту ссылку в Discord Developer Portal (Redirect URIs):
echo %NGROK_URL%/auth/discord/callback
echo.
echo ШАГ 2: Обнови переменную DISCORD_CALLBACK_URL в файле .env
echo.
echo Ссылка для игроков уже скопирована в твой буфер обмена! (%NGROK_URL%/login)
echo | set /p dummyName="%NGROK_URL%/login" | clip

echo.
echo Как только сохранишь файл .env, нажми любую клавишу для старта сервера!
pause >nul

echo.
echo [3] Запуск ядра Абордажа...
node server/index.js
pause