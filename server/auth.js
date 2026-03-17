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
    const { code } = req.query;
    if (!code) return res.send('Ошибка: Нет кода авторизации');

    try {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        });

        // 1. ЗАПРОС ТОКЕНА (С добавлением User-Agent)
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: params.toString(), // Безопасное кодирование параметров
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Abordage-App (https://abordage.onrender.com, 1.0.0)' // <-- СПАСЕНИЕ ОТ CLOUDFLARE
            }
        });

        // Если Дискорд вернул HTML-заглушку или ошибку, читаем как текст и не крашимся
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[DISCORD API ERROR - TOKEN]:', errorText);
            return res.status(500).send('Ошибка обмена токена. Проверь логи сервера на Render.');
        }

        const tokenData = await tokenResponse.json();

        // 2. ЗАПРОС ПРОФИЛЯ ИГРОКА
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                'Authorization': `${tokenData.token_type} ${tokenData.access_token}`,
                'User-Agent': 'Abordage-App (https://abordage.onrender.com, 1.0.0)' // <-- СПАСЕНИЕ ОТ CLOUDFLARE
            }
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('[DISCORD API ERROR - USER]:', errorText);
            return res.status(500).send('Ошибка получения профиля. Проверь логи сервера.');
        }

        const userData = await userResponse.json();

        // =========================================================
        // === ДАЛЬШЕ ОСТАВЬ СВОЙ СТАРЫЙ КОД (Сохранение сессии) ===
        // =========================================================
        // req.session.user = { 
        //     id: userData.id, 
        //     username: userData.username, ...
        // }
        // res.redirect('/');
        
    } catch (error) {
        console.error('Критическая ошибка авторизации:', error);
        res.status(500).send('Внутренняя ошибка сервера при входе.');
    }
});

// 3. Маршрут: Отдает текущего пользователя (понадобится нам для фронтенда позже)
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Не авторизован' });
    res.json(req.session.user);
});

module.exports = router;