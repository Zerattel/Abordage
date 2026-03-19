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

    socket.on('update_entity', (data) => {
        if (user.isGM) {
            const entity = gameState.entities.find(e => e.id === data.id);
            if (entity) {
                entity.name = data.updates.name !== undefined ? data.updates.name : entity.name;
                entity.avatarUrl = data.updates.avatarUrl !== undefined ? data.updates.avatarUrl : entity.avatarUrl;
                entity.affiliation = data.updates.affiliation || entity.affiliation;
                entity.hp = data.updates.hp !== undefined ? parseInt(data.updates.hp) : entity.hp;
                entity.maxHp = data.updates.maxHp !== undefined ? parseInt(data.updates.maxHp) : entity.maxHp;
                entity.concentration = data.updates.concentration !== undefined ? parseInt(data.updates.concentration) : entity.concentration;
                entity.maxConcentration = data.updates.maxConcentration !== undefined ? parseInt(data.updates.maxConcentration) : entity.maxConcentration;
                entity.armor = data.updates.armor !== undefined ? parseInt(data.updates.armor) : entity.armor;
                entity.barrier = data.updates.barrier !== undefined ? parseInt(data.updates.barrier) : entity.barrier;
                entity.baseMobility = data.updates.baseMobility !== undefined ? parseInt(data.updates.baseMobility) : entity.baseMobility;
                io.emit('entity_updated', entity);
            }
        }
    });

    socket.on('move_entity', (data) => {
        const entity = gameState.entities.find(e => e.id === data.id);
        if (!entity) return;

        // 1. РЕЖИМ БОГА: ГМ вне симуляции (Свободный телепорт)
        if (user.isGM && data.isFreeMove) {
            entity.x = data.x;
            entity.y = data.y;

            io.emit('entity_moved', { 
                id: entity.id, x: entity.x, y: entity.y, 
                dynamicMobility: entity.dynamicMobility,
                hasActedThisRound: entity.hasActedThisRound 
            });
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
            // ... дальше оставляй старый код с вычитанием мобильности и отправкой логов ...
            entity.dynamicMobility -= data.cost;
            entity.hasActedThisRound = true;
            entity.x = data.x;
            entity.y = data.y;

            io.emit('entity_moved', { 
                id: entity.id, x: entity.x, y: entity.y, 
                dynamicMobility: entity.dynamicMobility,
                hasActedThisRound: entity.hasActedThisRound
            });
            
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

    // НОВОЕ: Кнопка голосования игрока
    socket.on('toggle_ready', () => {
        if (connectedClients[socket.id]) {
            connectedClients[socket.id].isReady = !connectedClients[socket.id].isReady;
            io.emit('clients_updated', Object.values(connectedClients));
            io.emit('system_log', { message: `${user.username.toUpperCase()} изменил статус готовности.`, isSystem: false });
        }
    });

    socket.on('next_round', () => {
        if (user.isGM) {
            gameState.currentRound++;

            // Сбрасываем готовность всех подключенных игроков
            Object.values(connectedClients).forEach(c => c.isReady = false);
            io.emit('clients_updated', Object.values(connectedClients));

            const logs = [];
            const logManager = { addEntry: (msg) => logs.push(msg) };

            gameState.entities.forEach(ent => {
                ent.processNewRound(logManager); 
                // Класс Entity сам сбрасывает hasActedThisRound на false внутри processNewRound
            });

            io.emit('round_updated', { round: gameState.currentRound, entities: gameState.entities });
            io.emit('system_log', { message: `--- НАЧАЛО РАУНДА ${gameState.currentRound} ---`, isSystem: true });
            logs.forEach(msg => io.emit('system_log', { message: msg, isSystem: false }));
        }
    });

    socket.on('disconnect', () => {
        delete connectedClients[socket.id]; // Удаляем из списка при отключении
        io.emit('clients_updated', Object.values(connectedClients));
        io.emit('system_log', { message: `${user.username.toUpperCase()} покинул сеть.`, isSystem: false });
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