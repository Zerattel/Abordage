@echo off
title Abordage Server Launcher

echo [1] Starting Node.js core...
:: Открываем сервер в отдельном окне, чтобы видеть его логи
start "Abordage Node Server" cmd /k "node server/index.js"

echo [2] Starting Ngrok tunnel on static domain...
:: Запускаем туннель в текущем окне, привязывая твой домен
ngrok http --domain=marry-nonfamilial-untechnically.ngrok-free.dev 3000