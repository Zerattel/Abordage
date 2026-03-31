// server/index.js
require('dotenv').config();
const gameState = require('./state');
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const socketIo = require('socket.io');

const authRouter = require('./auth');

const app = express();

// Фикс для работы через ngrok: отключаем страницу-предупреждение
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

const server = http.createServer(app);
const io = socketIo(server);

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

app.use('/auth/discord', authRouter);
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Отправка сообщений в Discord
async function sendDiscordWebhook(message) {
    if (!gameState.discordWebhookUrl) return;
    try {
        await fetch(gameState.discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (e) { console.error("Ошибка отправки вебхука:", e); }
}

function getCord(x, y) {
    let letters = ''; let tempX = x;
    while (tempX >= 0) {
        letters = String.fromCharCode(65 + (tempX % 26)) + letters;
        tempX = Math.floor(tempX / 26) - 1;
    }
    return `${letters}${y + 1}`;
}

const connectedClients = {}; // Хранилище всех подключенных пользователей
// Логика WebSockets
// Логика WebSockets
io.on('connection', (socket) => {
    const user = socket.request.session.user;
    if (!user) { socket.disconnect(); return; }

    console.log(`[SOCKET] Подключен: ${user.username} (${user.isGM ? 'ГМ' : 'Игрок'})`);

    // Добавляем пользователя в реестр подключений (по умолчанию не готов)
    connectedClients[socket.id] = { 
        id: user.id, 
        username: user.username, 
        avatar: user.avatar, 
        isGM: user.isGM, 
        isReady: false 
    };

    // Рассылаем всем обновленный список клиентов для панели голосования
    io.emit('clients_updated', Object.values(connectedClients));

    socket.broadcast.emit('system_log', { message: `${user.username.toUpperCase()} вошел в тактическую сеть.`, isSystem: true });
    socket.emit('system_log', { message: `Соединение с хостом установлено. Пинг стабильный.`, isSystem: true });

    socket.emit('init_map', {
        grid: gameState.mapGrid,
        size: gameState.GRID_SIZE,
        background: gameState.mapBackground,
        entities: gameState.entities,
        currentRound: gameState.currentRound
    });

    // Обработка кликов по сетке
    socket.on('cell_clicked', (data) => {
        if (user.isGM && data.x >= 0 && data.x < gameState.GRID_SIZE && data.y >= 0 && data.y < gameState.GRID_SIZE) {
            gameState.mapGrid[data.y][data.x] = data.type;
            io.emit('map_updated', { x: data.x, y: data.y, value: data.type });
        }
    });

    socket.on('update_background', (data) => {
        if (user.isGM) {
            gameState.mapBackground = data.url;
            io.emit('background_updated', { url: data.url });
            io.emit('system_log', { message: 'Рассказчик обновил тактическую схему.', isSystem: true });
        }
    });

    socket.on('spawn_entity', (data) => {
        if (user.isGM) {
            const newEntity = new gameState.Entity({ name: "Тестовый Враг", affiliation: "enemy", x: data.x, y: data.y });
            gameState.entities.push(newEntity);
            io.emit('entity_spawned', newEntity);
        }
    });

    // Обновление сущности через режим редактирования (ГМ)
    socket.on('update_entity', (data) => {
        if (user.isGM) {
            const entity = gameState.entities.find(e => e.id === data.id);
            if (entity) {
                if (data.updates.name !== undefined) entity.name = data.updates.name;
                if (data.updates.avatarUrl !== undefined) entity.avatarUrl = data.updates.avatarUrl;
                if (data.updates.affiliation !== undefined) entity.affiliation = data.updates.affiliation;
                
                if (data.updates.hp !== undefined) entity.hp = parseInt(data.updates.hp) || 0;
                if (data.updates.maxHp !== undefined) entity.maxHp = parseInt(data.updates.maxHp) || 0;
                if (data.updates.concentration !== undefined) entity.concentration = parseInt(data.updates.concentration) || 0;
                if (data.updates.maxConcentration !== undefined) entity.maxConcentration = parseInt(data.updates.maxConcentration) || 0;
                if (data.updates.armor !== undefined) entity.armor = parseInt(data.updates.armor) || 0;
                if (data.updates.baseMobility !== undefined) entity.baseMobility = parseInt(data.updates.baseMobility) || 0;
                
                // НОВЫЕ ПОЛЯ БАРЬЕРА (Теперь сервер их не выкинет!)
                if (data.updates.barrierArmor !== undefined) entity.barrierArmor = parseInt(data.updates.barrierArmor) || 0;
                if (data.updates.tankWithConcentration !== undefined) entity.tankWithConcentration = data.updates.tankWithConcentration;

                io.emit('init_map', {
                    grid: gameState.mapGrid,
                    size: gameState.GRID_SIZE,
                    background: gameState.mapBackground,
                    entities: gameState.entities,
                    currentRound: gameState.currentRound
                });
            }
        }
    });

    // НОВОЕ: Быстрое переключение барьера (Доступно Игроку и ГМу)
    socket.on('toggle_barrier', (id) => {
        const entity = gameState.entities.find(e => e.id === id);
        if (entity && (user.isGM || entity.affiliation === 'player')) {
            entity.tankWithConcentration = !entity.tankWithConcentration;
            
            io.emit('init_map', {
                grid: gameState.mapGrid,
                size: gameState.GRID_SIZE,
                background: gameState.mapBackground,
                entities: gameState.entities,
                currentRound: gameState.currentRound
            });
            
            // Логируем действие в системный чат
            const stateMsg = entity.tankWithConcentration ? "АКТИВИРОВАЛ(А)" : "ОТКЛЮЧИЛ(А)";
            io.emit('system_log', { message: `[БАРЬЕР] ${entity.name} ${stateMsg} барьер.`, isSystem: true });
        }
    });

    socket.on('move_entity', (data) => {
        const entity = gameState.entities.find(e => e.id === data.id);
        if (!entity) return;

        // 1. РЕЖИМ БОГА: ГМ вне симуляции (Свободный телепорт)
        if (user.isGM && data.isFreeMove) {
            // Сохраняем старые координаты до перемещения
            const oldX = entity.x;
            const oldY = entity.y;

            entity.x = data.x;
            entity.y = data.y;

            io.emit('entity_moved', { 
                id: entity.id, x: entity.x, y: entity.y, 
                dynamicMobility: entity.dynamicMobility,
                hasActedThisRound: entity.hasActedThisRound 
            });
            
            // Отправляем лог перемещения в Discord
            const costText = "бесплатно";
            sendDiscordWebhook(`🏃 **${entity.name}** на [${oldX}, ${oldY}] переместился на [${entity.x}, ${entity.y}], ${costText}.`);

            const cordStr = getCord(data.x, data.y);
            io.emit('system_log', { message: `[ГМ] ${entity.name} переброшен на ${cordStr}`, isSystem: true });
            return;
        }

        // 2. ИГРОВОЙ РЕЖИМ: (Игрок или ГМ в симуляции)
        const myMobility = Number(entity.baseMobility);
        
        // Находим ВСЕХ персонажей на доске, кто строго БЫСТРЕЕ нас
        const predecessors = gameState.entities.filter(e => Number(e.baseMobility) > myMobility);
        
        // Мы можем ходить, если все, кто быстрее нас, уже завершили ход (или если мы самые быстрые)
        const allPredecessorsActed = predecessors.every(e => e.hasActedThisRound);

        // Теперь игроки с ОДИНАКОВОЙ мобильностью могут ходить в любом порядке между собой!
        const isPlayerAllowed = !user.isGM && entity.affiliation === 'player' && allPredecessorsActed;
        const isGMSimAllowed = user.isGM && !data.isFreeMove && allPredecessorsActed;

        if (isPlayerAllowed || isGMSimAllowed) {
            // Сохраняем старые координаты до перемещения
            const oldX = entity.x;
            const oldY = entity.y;

            // Списываем мобильность и помечаем, что персонаж сходил в этом раунде
            entity.dynamicMobility -= data.cost;
            entity.hasActedThisRound = true;
            entity.x = data.x;
            entity.y = data.y;

            io.emit('entity_moved', { 
                id: entity.id, x: entity.x, y: entity.y, 
                dynamicMobility: entity.dynamicMobility,
                hasActedThisRound: entity.hasActedThisRound
            });
            
            // Отправляем лог перемещения в Discord
            const costText = `затратив **${data.cost || 0}** УЕ`;
            sendDiscordWebhook(`🏃 **${entity.name}** на [${oldX}, ${oldY}] переместился на [${entity.x}, ${entity.y}], ${costText}.`);

            const cordStr = getCord(data.x, data.y);
            io.emit('system_log', { message: `[ХОД] ${entity.name} переместился на ${cordStr}`, isSystem: false });
        } else {
            socket.emit('system_log', { message: "ОШИБКА: Сейчас ход другого персонажа.", isSystem: false });
        }
    });

    // Экспорт сохранения
    socket.on('request_save', () => {
        if (user.isGM) {
            const saveData = {
                grid: gameState.mapGrid,
                size: gameState.GRID_SIZE,
                background: gameState.mapBackground,
                entities: gameState.entities,
                currentRound: gameState.currentRound
            };
            socket.emit('save_data_response', saveData);
        }
    });

    // Импорт сохранения
    socket.on('load_save', (saveData) => {
        if (user.isGM && saveData) {
            gameState.mapGrid = saveData.grid || [];
            gameState.GRID_SIZE = saveData.size || 20;
            gameState.mapBackground = saveData.background || null;
            gameState.currentRound = saveData.currentRound || 1;
            
            // Восстанавливаем сущности, бережно перенося их свойства
            gameState.entities = (saveData.entities || []).map(entData => {
                const newEnt = new gameState.Entity({ name: entData.name, affiliation: entData.affiliation, x: entData.x, y: entData.y });
                Object.assign(newEnt, entData); // Накатываем сохраненные статы (УЕЗ, броня и т.д.)
                return newEnt;
            });

            // Заставляем всех клиентов принудительно перезагрузить карту
            io.emit('init_map', {
                grid: gameState.mapGrid,
                size: gameState.GRID_SIZE,
                background: gameState.mapBackground,
                entities: gameState.entities,
                currentRound: gameState.currentRound
            });
            io.emit('system_log', { message: "Рассказчик загрузил новую тактическую обстановку из резервной копии.", isSystem: true });
        }
    });

    socket.on('delete_entity', (id) => {
        if (user.isGM) {
            const ent = gameState.entities.find(e => e.id === id);
            gameState.entities = gameState.entities.filter(e => e.id !== id);
            io.emit('entity_deleted', id);
            if (ent) io.emit('system_log', { message: `Энтити ${ent.name} удален с поля боя.`, isSystem: true });
        }
    });

    socket.on('skip_turn', (id) => {
        const entity = gameState.entities.find(e => e.id === id);
        if (!entity) return;

        const myMobility = Number(entity.baseMobility);
        const predecessors = gameState.entities.filter(e => Number(e.baseMobility) > myMobility);
        const allPredecessorsActed = predecessors.every(e => e.hasActedThisRound);

        const isPlayerAllowed = !user.isGM && entity.affiliation === 'player' && allPredecessorsActed;
        const isGMSimAllowed = user.isGM && allPredecessorsActed;

        // ГМ вне симуляции может заставить пропустить ход кого угодно
        if (isPlayerAllowed || isGMSimAllowed || user.isGM) {
            entity.hasActedThisRound = true;
            entity.dynamicMobility = 0;
            io.emit('entity_moved', { 
                id: entity.id, x: entity.x, y: entity.y, 
                dynamicMobility: entity.dynamicMobility,
                hasActedThisRound: true 
            });
            io.emit('system_log', { message: `[ХОД] ${entity.name} завершает свои действия.`, isSystem: false });
        } else {
            socket.emit('system_log', { message: "ОШИБКА: Сейчас ход другого персонажа.", isSystem: false });
        }
    });

    // НОВОЕ: Кнопка голосования игрока
    socket.on('toggle_ready', () => {
        if (connectedClients[socket.id]) {
            connectedClients[socket.id].isReady = !connectedClients[socket.id].isReady;
            io.emit('clients_updated', Object.values(connectedClients));
            io.emit('system_log', { message: `${user.username.toUpperCase()} изменил статус готовности.`, isSystem: false });
        }
    });

    // Смена раунда (Только ГМ)
    socket.on('next_round', () => {
        if (user.isGM) {
            gameState.currentRound += 1;
            let effectLogs = [];

            // Обрабатываем эффекты на всех фишках и собираем логи
            gameState.entities.forEach(entity => {
                const logs = entity.processNewRound();
                if (logs && logs.length > 0) {
                    effectLogs = effectLogs.concat(logs);
                }
            });
            
            io.emit('init_map', {
                grid: gameState.mapGrid,
                size: gameState.GRID_SIZE,
                background: gameState.mapBackground,
                entities: gameState.entities,
                currentRound: gameState.currentRound
            });
            
            // Отправка в Discord
            let roundMsg = `🔔 **РАУНД ${gameState.currentRound} НАЧАЛСЯ!**`;
            if (effectLogs.length > 0) {
                roundMsg += `\n\n**Сводка периодических эффектов:**\n` + effectLogs.join('\n');
            }
            sendDiscordWebhook(roundMsg);
            
            // Локальные логи
            io.emit('system_log', { message: `Раунд ${gameState.currentRound} начался!`, isSystem: true });
            if (effectLogs.length > 0) io.emit('system_log', { message: `Сработали эффекты. Проверьте консоль Discord.`, isSystem: true });
            
            // Обновляем открытые карточки, чтобы показать изменение ХП от яда/регена
            io.emit('effects_updated', 'all'); 
        }
    });

    // Добавление периодического эффекта
    socket.on('add_effect', (data) => {
        if (user.isGM) {
            const entity = gameState.entities.find(e => e.id === data.entityId);
            if (entity) {
                entity.addPeriodicEffect(data.name, data.stat, data.amount, data.duration);
                io.emit('init_map', {
                    grid: gameState.mapGrid, size: gameState.GRID_SIZE,
                    background: gameState.mapBackground, entities: gameState.entities,
                    currentRound: gameState.currentRound
                });
                io.emit('effects_updated', entity.id);
            }
        }
    });

    // Удаление периодического эффекта
    socket.on('remove_effect', (data) => {
        if (user.isGM) {
            const entity = gameState.entities.find(e => e.id === data.entityId);
            if (entity) {
                entity.removePeriodicEffect(data.effectId);
                io.emit('init_map', {
                    grid: gameState.mapGrid, size: gameState.GRID_SIZE,
                    background: gameState.mapBackground, entities: gameState.entities,
                    currentRound: gameState.currentRound
                });
                io.emit('effects_updated', entity.id);
            }
        }
    });

    socket.on('disconnect', () => {
        delete connectedClients[socket.id]; // Удаляем из списка при отключении
        io.emit('clients_updated', Object.values(connectedClients));
        io.emit('system_log', { message: `${user.username.toUpperCase()} покинул сеть.`, isSystem: false });
    });

    socket.on('set_webhook', (url) => {
        if (user.isGM) {
            gameState.discordWebhookUrl = url;
            socket.emit('system_log', { message: `Вебхук Discord успешно привязан.`, isSystem: true });
        }
    });

    // Сохранение пресета атаки
    socket.on('save_attack_preset', (data) => {
        const entity = gameState.entities.find(e => e.id === data.entityId);
        if (entity && (user.isGM || entity.affiliation === 'player')) {
            if (!entity.presets) entity.presets = [];
            entity.presets.push(data.preset);
            
            // Рассылаем всем клиентам команду на обновление карты, чтобы пресет появился сразу
            io.emit('init_map', {
                grid: gameState.mapGrid,
                size: gameState.GRID_SIZE,
                background: gameState.mapBackground,
                entities: gameState.entities,
                currentRound: gameState.currentRound
            });
            socket.emit('preset_saved', entity.id);
        }
    });

    // Обработка броска и урона (Сервер кидает кубы, чтобы никто не читерил)
    socket.on('execute_attack', (data) => {
        const attacker = gameState.entities.find(e => e.id === data.attackerId);
        const target = gameState.entities.find(e => e.id === data.targetId);
        if (!attacker || !target) return;

        // Бросаем кубики
        let rolls = [];
        for (let i = 0; i < data.diceCount; i++) {
            rolls.push(Math.floor(Math.random() * data.diceFaces) + 1);
        }

        // Продвинутая Логика Абордажа (Пошаговый расчет каждого кубика)
        let totalHpDamage = 0;
        let totalBarrierDamage = 0;
        let blockedDamage = 0;

        let currentHp = target.hp;
        let currentConc = target.concentration;
        const isTanking = target.tankWithConcentration;

        const effHpArmor = Math.max(0, target.armor - data.armorPen);
        const effBarrierArmor = Math.max(0, (target.barrierArmor || 0) - data.armorPen);

        let rollsDisplay = [];
        let activeRollsData = []; // Инструкции для анимации

        for (let r of rolls) {
            if (r < data.threshold) {
                rollsDisplay.push(`~~${r}~~`);
                activeRollsData.push({ val: r, passed: false, blocked: 0, final: 0 });
                continue;
            }

            let dieBlocked = 0;
            let dieHpDmg = 0;
            let dieBarrierDmg = 0;
            
            if (isTanking && currentConc > 0) {
                // Удар по барьеру
                let potDmg = Math.max(0, r - effBarrierArmor);
                dieBlocked += (r - potDmg); // Отражено броней барьера

                if (potDmg > currentConc) {
                    // Барьер пробит, остаток идет в ХП
                    dieBarrierDmg = currentConc;
                    let leftover = potDmg - currentConc;
                    currentConc = 0;

                    let hpDmg = Math.max(0, leftover - effHpArmor);
                    dieBlocked += (leftover - hpDmg); // Отражено основной броней
                    dieHpDmg = hpDmg;
                } else {
                    // Барьер выдержал
                    dieBarrierDmg = potDmg;
                    currentConc -= potDmg;
                }
            } else {
                // Прямой удар по ХП
                dieHpDmg = Math.max(0, r - effHpArmor);
                dieBlocked += (r - dieHpDmg);
            }

            totalHpDamage += dieHpDmg;
            totalBarrierDamage += dieBarrierDmg;
            blockedDamage += dieBlocked;

            rollsDisplay.push(`${r}`);
            activeRollsData.push({ val: r, passed: true, blocked: dieBlocked, final: dieHpDmg + dieBarrierDmg });
        }

        // ФИКС ОШИБКИ: Вычитаем накопленный урон из ХП
        target.hp = Math.max(0, currentHp - totalHpDamage);
        target.concentration = currentConc;

        // НОВОЕ ПРАВИЛО: Атака полностью осушает мобильность
        attacker.dynamicMobility = 0;

        // Формируем логи
        const attackerUser = user.discordName || "Неизвестный игрок";
        const logMsg = `${attackerUser} совершил атаку за ${attacker.name} по ${target.name} на [${target.x}, ${target.y}] (${data.diceCount}d${data.diceFaces} П/П:${data.threshold}, Б/П:${data.armorPen})`;

        const webhookMsg = `**${attacker.name}** атакует **${target.name}**!\n-# ${data.diceCount}d${data.diceFaces} П/П:${data.threshold} Б/П:${data.armorPen} Б/Ц:${target.armor} Б/Б:${target.barrierArmor || 0}\n\n💠 Урон по Барьеру: **${totalBarrierDamage}**\n⚔️ Урон по Здоровью: **${totalHpDamage}**\n🛡️ Отражено: **${blockedDamage}**\n🎲 Броски: (${rollsDisplay.join(', ')})`;

        // Транслируем анимацию ВСЕМ игрокам
        io.emit('play_attack_animation', {
            attackerName: attacker.name,
            targetName: target.name,
            targetId: target.id,
            newHp: target.hp,
            newConc: target.concentration,
            rollsData: activeRollsData,
            totalHpDamage: totalHpDamage,
            totalBarrierDamage: totalBarrierDamage,
            diceFaces: data.diceFaces,
            baseArmor: target.armor,
            barrierArmor: target.barrierArmor || 0,
            isTanking: isTanking,
            armorPen: data.armorPen,
            threshold: data.threshold,
            baseThreshold: data.baseThreshold,
            coverPenalty: data.coverPenalty,
            rangePenalty: data.rangePenalty,
            logMessage: logMsg
        });

        // Отправляем лог в Дискорд
        sendDiscordWebhook(webhookMsg);

        // Синхронизируем обнуление мобильности у всех клиентов на карте
        io.emit('entity_moved', { 
            id: attacker.id, x: attacker.x, y: attacker.y, 
            dynamicMobility: attacker.dynamicMobility,
            hasActedThisRound: attacker.hasActedThisRound 
        });
    });

    // НОВОЕ: Изменение размера карты Рассказчиком
    socket.on('resize_map', (data) => {
        if (user.isGM) {
            const newSize = parseInt(data.size);
            if (newSize >= 10 && newSize <= 100) {
                gameState.GRID_SIZE = newSize;
                
                // Создаем новую сетку, бережно перенося старые препятствия, если они влезают
                const newGrid = Array(newSize).fill(null).map(() => Array(newSize).fill(1));
                for(let y = 0; y < Math.min(newSize, gameState.mapGrid.length); y++) {
                    for(let x = 0; x < Math.min(newSize, gameState.mapGrid[y].length); x++) {
                        newGrid[y][x] = gameState.mapGrid[y][x];
                    }
                }
                gameState.mapGrid = newGrid;
                
                // Рассылаем всем клиентам команду на полную перерисовку
                io.emit('init_map', {
                    grid: gameState.mapGrid,
                    size: gameState.GRID_SIZE,
                    background: gameState.mapBackground,
                    entities: gameState.entities,
                    currentRound: gameState.currentRound
                });
                io.emit('system_log', { message: `Размер тактической сетки изменен на ${newSize}x${newSize}.`, isSystem: true });
            }
        }
    });
    
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SYSTEM] Сервер Абордажа запущен. Терминал активен на порту ${PORT}`);
});