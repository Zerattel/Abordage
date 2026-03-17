// server/auth.js
const express = require('express');
const router = express.Router();

// Подтягиваем секреты из .env (или переменных окружения Render)
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

        // 1. ЗАПРОС ТОКЕНА (API v10 + Защита от Cloudflare)
        const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
            method: 'POST',
            body: params.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'User-Agent': 'Abordage-App (https://abordage.onrender.com, 1.0.0)' 
            }
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[DISCORD API ERROR - TOKEN]:', errorText);
            return res.status(500).send('Ошибка обмена токена. Проверь логи сервера на Render.');
        }

        const tokenData = await tokenResponse.json();

        // 2. ЗАПРОС ПРОФИЛЯ ИГРОКА (API v10 + Защита от Cloudflare)
        const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `${tokenData.token_type} ${tokenData.access_token}`,
                'Accept': 'application/json',
                'User-Agent': 'Abordage-App (https://abordage.onrender.com, 1.0.0)' 
            }
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('[DISCORD API ERROR - USER]:', errorText);
            return res.status(500).send('Ошибка получения профиля. Проверь логи сервера.');
        }

        const userData = await userResponse.json();

        // 3. СОХРАНЕНИЕ СЕССИИ И ПЕРЕНАПРАВЛЕНИЕ
        // Формируем правильную ссылку на аватарку Discord
        const avatarUrl = userData.avatar 
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png'; // Дефолтная серая аватарка, если у юзера её нет

        // Записываем данные в память сервера
        req.session.user = { 
            id: userData.id, 
            username: userData.username,
            avatar: avatarUrl,
            isGM: GM_WHITELIST.includes(userData.id) // Проверка на права Рассказчика
        };

        // Перекидываем на тактический стол (если твой интерфейс лежит в app.html)
        // Если он в index.html, поменяй на res.redirect('/');
        res.redirect('/app.html'); 
        
    } catch (error) {
        console.error('Критическая ошибка авторизации:', error);
        res.status(500).send('Внутренняя ошибка сервера при входе.');
    }
});

// 3. Маршрут: Отдает текущего пользователя (используется фронтендом)
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Не авторизован' });
    res.json(req.session.user);
});

module.exports = router;