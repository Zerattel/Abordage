// server/auth.js
const express = require('express');
const router = express.Router();

// Подтягиваем секреты из .env
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_CALLBACK_URL;

// Тот самый белый список. Впиши сюда свой Discord ID (в кавычках)
const GM_WHITELIST = ['498547326672044033'];

// 1. Маршрут: Отправляем пользователя на страницу входа Discord
router.get('/login', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

// 2. Маршрут: Discord возвращает пользователя сюда с временным кодом
router.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('Ошибка: Нет кода авторизации');

    try {
        // Обмениваем код на токен доступа (используем встроенный fetch)
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        });

        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const tokenData = await tokenResponse.json();

        // По токену запрашиваем профиль пользователя
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
        });
        const userData = await userResponse.json();

        // Сохраняем данные пользователя в сессию сервера
        req.session.user = {
            id: userData.id,
            username: userData.username,
            avatar: `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`,
            isGM: GM_WHITELIST.includes(userData.id) // Проверка на Рассказчика
        };

        // Успех! Отправляем в основной интерфейс инструмента
        res.redirect('/app.html'); 
    } catch (error) {
        console.error(error);
        res.send('Сбой на линиях связи при авторизации.');
    }
});

// 3. Маршрут: Отдает текущего пользователя (понадобится нам для фронтенда позже)
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Не авторизован' });
    res.json(req.session.user);
});

module.exports = router;