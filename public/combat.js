// public/combat.js

window.isTargeting = false;
window.combatAttackerId = null;

// Функция для безопасной регистрации сокетов
function initCombatSockets() {
    if (typeof socket === 'undefined' || !socket || typeof socket.on !== 'function') {
        setTimeout(initCombatSockets, 100);
        return;
    }

    socket.on('preset_saved', (entityId) => {
        if (typeof addLog === 'function') addLog("Пресет атаки успешно сохранен и применен.", true);
        // Если открыт интерфейс атаки для этого персонажа - перерисовываем его, чтобы показать новый пресет!
        if (window.combatAttackerId === entityId && window.combatTargetId) {
            window.openAttackInterface(window.combatAttackerId, window.combatTargetId);
        }
    });

    socket.on('play_attack_animation', async (data) => {
        // Выводим детальный лог в локальный чат игры
        if (typeof addLog === 'function' && data.logMessage) {
            addLog(`[БОЙ] ${data.logMessage} ➔ Урон: ${data.totalDamage}`, false);
        }

        // Создаем черный полупрозрачный экран
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed'; overlay.style.top = '0'; overlay.style.left = '0';
        overlay.style.width = '100vw'; overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
        overlay.style.zIndex = '10000'; overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
        overlay.style.fontFamily = "'Courier New', Courier, monospace";
        overlay.style.transition = 'opacity 0.5s';
        
        // Брутальная хазард-панель заголовка
        const titleContainer = document.createElement('div');
        titleContainer.style.background = 'repeating-linear-gradient(45deg, #440000, #440000 10px, #220000 10px, #220000 20px)';
        titleContainer.style.borderTop = '3px solid #ff0000';
        titleContainer.style.borderBottom = '3px solid #ff0000';
        titleContainer.style.width = '100vw';
        titleContainer.style.padding = '15px 0';
        titleContainer.style.marginBottom = '50px';
        titleContainer.style.textAlign = 'center';
        titleContainer.style.boxShadow = '0 0 20px rgba(255,0,0,0.5)';

        const title = document.createElement('h1');
        title.innerText = `АТАКА: ${data.attackerName} ➔ ${data.targetName}`;
        title.style.color = '#fff'; title.style.margin = '0'; title.style.letterSpacing = '4px'; title.style.textTransform = 'uppercase';
        titleContainer.appendChild(title);
        overlay.appendChild(titleContainer);

        const diceContainer = document.createElement('div');
        diceContainer.style.display = 'flex'; diceContainer.style.gap = '15px'; diceContainer.style.flexWrap = 'wrap';
        diceContainer.style.justifyContent = 'center'; diceContainer.style.minHeight = '80px';
        overlay.appendChild(diceContainer);

        // Контейнер для нижних панелей (П/П и Щит)
        const bottomPanelsContainer = document.createElement('div');
        bottomPanelsContainer.style.display = 'flex';
        bottomPanelsContainer.style.gap = '30px';
        bottomPanelsContainer.style.marginTop = '50px';
        bottomPanelsContainer.style.flexWrap = 'wrap';
        bottomPanelsContainer.style.justifyContent = 'center';

        // Панель Порога Промаха
        const thresholdPanel = document.createElement('div');
        thresholdPanel.id = 'anim-threshold-panel';
        thresholdPanel.style.padding = '15px 40px';
        thresholdPanel.style.border = '2px solid #555'; 
        thresholdPanel.style.borderRight = '10px solid #555'; // Зеркально щиту
        thresholdPanel.style.textAlign = 'center'; 
        thresholdPanel.style.background = 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 10px, transparent 10px, transparent 20px)';
        thresholdPanel.style.transition = 'all 0.4s';
        thresholdPanel.style.boxShadow = '0 0 15px rgba(0,0,0,0.5)';
        thresholdPanel.innerHTML = `
            <span id="anim-th-title" style="color:#888; font-size:12px; letter-spacing: 2px;">ПОРОГ ПРОМАХА</span><br>
            <b id="anim-th-val" style="font-size:32px; color:#aaa; text-shadow: 0 0 10px #000;">${data.threshold}</b><br>
            <span id="anim-th-desc" style="color:#666; font-size:12px; letter-spacing: 1px;">БАЗ:${data.baseThreshold || 0} УКР:${data.coverPenalty || 0} ДАЛ:${data.rangePenalty || 0}</span>
        `;
        bottomPanelsContainer.appendChild(thresholdPanel);

// Кибер-щит с острыми углами (Теперь показывает ХП Броню и Барьерную Броню)
        const shieldPanel = document.createElement('div');
        shieldPanel.style.padding = '15px 40px';
        shieldPanel.style.border = '2px solid #00ffff'; 
        shieldPanel.style.borderLeft = '10px solid #00ffff'; 
        shieldPanel.style.textAlign = 'center'; 
        shieldPanel.style.background = 'repeating-linear-gradient(45deg, rgba(0,255,255,0.05), rgba(0,255,255,0.05) 10px, transparent 10px, transparent 20px)';
        shieldPanel.style.transition = 'all 0.4s';
        shieldPanel.style.boxShadow = '0 0 15px rgba(0,255,255,0.2)';
        
        let shieldText = `${data.baseArmor}`;
        if (data.isTanking) shieldText += ` <span style="color:#888;">|</span> <span style="color:#00ffff;">${data.barrierArmor}</span>`;
        
        shieldPanel.innerHTML = `<span style="color:#00ffff; font-size:12px; letter-spacing: 2px;">БРОНЯ (ХП | БАРЬЕР)</span><br><b style="font-size:32px; color:#fff; text-shadow: 0 0 10px #00ffff;">${shieldText}</b><br><span style="font-size: 12px; color: #888;">Б/П: ${data.armorPen}</span>`;
        bottomPanelsContainer.appendChild(shieldPanel);

        overlay.appendChild(bottomPanelsContainer);

        const sleep = ms => new Promise(r => setTimeout(r, ms));

        let diceDivs = [];
        for (let i = 0; i < data.rollsData.length; i++) {
            const d = document.createElement('div');
            d.style.width = '60px'; d.style.height = '60px';
            d.style.border = '2px solid #fff'; d.style.display = 'flex';
            d.style.alignItems = 'center'; d.style.justifyContent = 'center';
            d.style.fontSize = '28px'; d.style.fontWeight = 'bold'; d.style.color = '#fff';
            d.style.backgroundColor = '#111';
            d.style.transition = 'all 0.3s ease';
            d.style.boxShadow = '0 0 10px rgba(255,255,255,0.2)';
            d.innerText = data.diceFaces; 
            diceContainer.appendChild(d);
            diceDivs.push(d);
        }

        await sleep(1000);

        let flickerIntervals = [];
        diceDivs.forEach((d, i) => {
            flickerIntervals[i] = setInterval(() => {
                d.innerText = Math.floor(Math.random() * data.diceFaces) + 1;
            }, 50);
        });

        await sleep(1000);

        for (let i = 0; i < data.rollsData.length; i++) {
            clearInterval(flickerIntervals[i]);
            diceDivs[i].innerText = data.rollsData[i].val;
            diceDivs[i].style.backgroundColor = '#222';
            await sleep(250);
        }

        await sleep(600);

        let activeDivs = [];
        let hasMisses = false;
        for (let i = 0; i < data.rollsData.length; i++) {
            if (!data.rollsData[i].passed) {
                diceDivs[i].style.borderColor = '#ff0000';
                diceDivs[i].style.color = '#ff0000';
                diceDivs[i].style.boxShadow = '0 0 20px #ff0000';
                hasMisses = true;
            } else {
                activeDivs.push({ el: diceDivs[i], rollData: data.rollsData[i] });
            }
        }

        if (hasMisses) {
            const thPanel = document.getElementById('anim-threshold-panel');
            thPanel.style.borderColor = '#ff0000';
            thPanel.style.borderRightColor = '#ff0000';
            thPanel.style.boxShadow = '0 0 20px rgba(255,0,0,0.5)';
            thPanel.style.background = 'repeating-linear-gradient(-45deg, rgba(255,0,0,0.1), rgba(255,0,0,0.1) 10px, transparent 10px, transparent 20px)';
            document.getElementById('anim-th-val').style.color = '#ff4444';
        }
        
        await sleep(800);

        for (let i = 0; i < data.rollsData.length; i++) {
            if (!data.rollsData[i].passed) {
                diceDivs[i].style.transform = 'scale(0)'; 
                diceDivs[i].style.opacity = '0';
                diceDivs[i].style.borderWidth = '0';
                setTimeout(() => { 
                    diceDivs[i].style.width = '0'; 
                    diceDivs[i].style.margin = '0'; 
                }, 300);
            }
        }

        await sleep(800);

        // Вспышка и вычитание (Теперь кубик визуально уменьшается ровно на ту цифру брони, об которую он ударился)
        let hasBlocks = activeDivs.some(obj => obj.rollData.blocked > 0);
        if (hasBlocks) {
            shieldPanel.style.borderColor = '#ffaa00';
            shieldPanel.style.borderLeftColor = '#ffaa00';
            shieldPanel.style.boxShadow = '0 0 20px #ffaa00';
            
            activeDivs.forEach(obj => {
                if (obj.rollData.blocked > 0) {
                    obj.el.style.backgroundColor = '#aa0000';
                    obj.el.style.transform = 'translateY(-10px)';
                }
            });
            await sleep(200);
            
            activeDivs.forEach(obj => {
                if (obj.rollData.blocked > 0) {
                    obj.el.innerText = obj.rollData.final; // Точное вычитание с сервера
                    obj.el.style.backgroundColor = '#222';
                    obj.el.style.transform = 'translateY(0)';
                }
            });
            await sleep(800);
        }

        diceContainer.innerHTML = '';
        const finalResult = document.createElement('div');
        finalResult.style.textAlign = 'center';
        finalResult.style.transform = 'scale(0.5)';
        finalResult.style.opacity = '0';
        finalResult.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        
        // Раздельный показ урона
        let resultHtml = ``;
        if (data.totalBarrierDamage > 0) {
            resultHtml += `<div style="font-size: 40px; color: #00ffff; text-shadow: 0 0 20px #00ffff; margin-bottom: 10px;">БАРЬЕР: -${data.totalBarrierDamage}</div>`;
        }
        if (data.totalHpDamage > 0 || data.totalBarrierDamage === 0) {
            resultHtml += `<div style="font-size: 60px; font-weight: bold; color: #00ff00; text-shadow: 0 0 30px #00aa00;">УРОН ХП: -${data.totalHpDamage}</div>`;
        }
        finalResult.innerHTML = resultHtml;
        diceContainer.appendChild(finalResult);

        setTimeout(() => {
            finalResult.style.transform = 'scale(1)';
            finalResult.style.opacity = '1';
        }, 50);

        // Обновляем локальные данные сразу
        if (typeof localEntities !== 'undefined') {
            const t = localEntities.find(e => e.id === data.targetId);
            if (t) {
                t.hp = data.newHp;
                if (data.newConc !== undefined) t.concentration = data.newConc;
            }
        }
        
        await sleep(3000); 
        overlay.style.opacity = '0';
        await sleep(500);
        overlay.remove();
        if (typeof drawMap === 'function') drawMap();
    });
}

// Запускаем инициализацию сокетов
initCombatSockets();

// --- БАННЕР И ПРИЦЕЛИВАНИЕ ---
window.showTargetingBanner = function() {
    if (document.getElementById('targeting-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'targeting-banner';
    banner.style.position = 'fixed';
    banner.style.top = '0'; banner.style.left = '0'; banner.style.width = '100vw';
    banner.style.padding = '8px 0';
    banner.style.textAlign = 'center';
    banner.style.color = 'rgba(255, 255, 255, 0.9)';
    banner.style.fontSize = '20px';
    banner.style.fontWeight = 'bold';
    banner.style.letterSpacing = '5px';
    banner.style.background = 'repeating-linear-gradient(45deg, rgba(150,0,0,0.8), rgba(150,0,0,0.8) 20px, rgba(80,0,0,0.8) 20px, rgba(80,0,0,0.8) 40px)';
    banner.style.borderBottom = '3px solid #ff0000';
    banner.style.zIndex = '9000';
    banner.style.pointerEvents = 'none'; 
    banner.style.textShadow = '2px 2px 0 #000';
    banner.innerText = 'ВЫБЕРИТЕ ЦЕЛЬ (КЛИК ПО СЕБЕ ДЛЯ ОТМЕНЫ)';
    document.body.appendChild(banner);
};

window.hideTargetingBanner = function() {
    const banner = document.getElementById('targeting-banner');
    if (banner) banner.remove();
};

window.startTargeting = function(id) {
    window.combatAttackerId = id;
    window.isTargeting = true;
    if (typeof closeCharacterCard === 'function') closeCharacterCard();
    window.showTargetingBanner();
};

window.combatTargetId = null;

window.handleTargetingClick = function(clickedEntity) {
    if (!clickedEntity) return;
    if (clickedEntity.id === window.combatAttackerId) {
        window.isTargeting = false;
        window.combatAttackerId = null;
        window.combatTargetId = null;
        window.hideTargetingBanner();
        if (typeof openCharacterCard === 'function') openCharacterCard(clickedEntity.id);
        return;
    }
    window.hideTargetingBanner();
    window.combatTargetId = clickedEntity.id;
    window.openAttackInterface(window.combatAttackerId, clickedEntity.id);
};

// --- ИНТЕРФЕЙС АТАКИ ---
window.openAttackInterface = function(attackerId, targetId) {
    if (typeof localEntities === 'undefined') return;
    
    // Если интерфейс уже открыт - удаляем старый перед отрисовкой нового (для автообновления)
    const existingOverlay = document.getElementById('attack-interface-overlay');
    if (existingOverlay) existingOverlay.remove();
    const attacker = localEntities.find(e => e.id === attackerId);
    const target = localEntities.find(e => e.id === targetId);
    if (!attacker || !target) return;

    const dist = Math.max(Math.abs(attacker.x - target.x), Math.abs(attacker.y - target.y));
    let coverText = "НЕТ";
    let coverPenalty = 0;
    let hasLoS = true;

    if (typeof getBestLoS === 'function') {
        const los = getBestLoS(attacker.x, attacker.y, target.x, target.y, true);
        if (los.targetCover === 3) { coverText = "УКРЫТИЕ (+3 П/П)"; coverPenalty = 3; }
        if (los.targetCover === 4) { coverText = "АМБРАЗУРА (+6 П/П)"; coverPenalty = 6; }
        if (!los.hasLoS) { coverText = "НЕТ ВИДИМОСТИ!"; hasLoS = false; }
    }

    const bgColors = { player: 'rgba(0,255,0,0.1)', enemy: 'rgba(255,0,0,0.1)', neutral: 'rgba(255,255,0,0.1)' };

    const overlay = document.createElement('div');
    overlay.id = 'attack-interface-overlay';
    overlay.style.position = 'fixed'; overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100vw'; overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
    overlay.style.zIndex = '9999'; 
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center'; 
    overlay.style.justifyContent = 'center'; 
    overlay.style.fontFamily = "'Courier New', Courier, monospace";

    const modal = document.createElement('div');
    modal.style.width = '100%'; modal.style.maxWidth = '600px'; 
    modal.style.maxHeight = '95vh'; modal.style.display = 'flex'; 
    modal.style.flexDirection = 'column'; modal.style.backgroundColor = '#050505';
    modal.style.border = '2px solid #ff0000'; // Острые углы
    modal.style.boxShadow = '0 0 20px rgba(255,0,0,0.5), inset 0 0 15px rgba(255,0,0,0.2)';
    modal.style.overflow = 'hidden';

    const header = `
        <div style="height: 6px; background: repeating-linear-gradient(45deg, #ff0000, #ff0000 10px, #000 10px, #000 20px);"></div>
        <div style="display: flex; height: 100px; border-bottom: 2px solid #555;">
            <div style="flex: 1; display: flex; align-items: center; padding: 10px; background: ${bgColors[attacker.affiliation] || '#333'}; border-right: 2px solid #ff0000;">
                <img src="${attacker.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 60px; height: 60px; border: 2px solid white; object-fit: cover;">
                <div style="margin-left: 10px;"><h3 style="margin: 0; color: white; font-size: 16px; text-transform: uppercase;">${attacker.name}</h3></div>
            </div>
            <div style="flex: 1; display: flex; align-items: center; justify-content: flex-end; padding: 10px; background: ${bgColors[target.affiliation] || '#333'};">
                <div style="margin-right: 10px; text-align: right;"><h3 style="margin: 0; color: white; font-size: 16px; text-transform: uppercase;">${target.name}</h3></div>
                <img src="${target.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 60px; height: 60px; border: 2px solid white; object-fit: cover;">
            </div>
        </div>
        <div style="display: flex; justify-content: space-around; padding: 10px; background: #111; border-bottom: 1px solid #333;">
            <div style="text-align: center;"><span style="color: #888; font-size: 12px;">ДИСТАНЦИЯ:</span><br><b style="font-size: 18px; color: #fff;">${dist} УЕ</b></div>
            <div style="text-align: center;"><span style="color: #888; font-size: 12px;">УКРЫТИЕ:</span><br><b style="font-size: 18px; color: ${coverPenalty > 0 ? '#ffaa00' : '#fff'};">${coverText}</b></div>
            <div style="text-align: center;"><span style="color: #888; font-size: 12px;">БРОНЯ (ХП / БАРЬЕР):</span><br><b style="font-size: 18px; color: #aaa;">${target.armor} / ${target.barrierArmor || 0}</b></div>
        </div>
    `;

    let presetsHtml = `<div style="padding: 15px; flex-grow: 1; overflow-y: auto;" id="presets-container">`;
    if (!hasLoS) {
        presetsHtml += `<h3 style="color: red; text-align: center;">Линия Огня заблокирована!</h3>`;
    } else {
        const presets = attacker.presets || [];
        presets.forEach((p) => {
            presetsHtml += `
                <div style="background: rgba(255,255,255,0.05); padding: 10px; margin-bottom: 8px; border-left: 4px solid #aa0000; cursor: pointer;" 
                     onmouseover="this.style.background='rgba(255,0,0,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"
                     onclick="window.fireAttack('${attacker.id}', '${target.id}', '${p.attack}', ${p.threshold}, ${p.range}, ${p.armorPen}, ${dist}, ${coverPenalty})">
                    <h4 style="margin: 0 0 5px 0; color: white;">${p.name}</h4>
                    <div style="display: flex; justify-content: space-between; color: #aaa; font-size: 12px;">
                        <span>Бросок: <b style="color: #fff;">${p.attack}</b></span>
                        <span>П/П: <b style="color: #fff;">${p.threshold}</b></span>
                        <span>Дальность: <b style="color: #fff;">${p.range}</b></span>
                        <span>Б/П: <b style="color: #fff;">${p.armorPen}</b></span>
                    </div>
                </div>
            `;
        });

        presetsHtml += `
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button class="btn-action" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 10px; font-size: 12px;" onclick="window.showNewPresetForm('${attacker.id}')">+ СОЗДАТЬ ПРЕСЕТ</button>
                <button class="btn-action" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 10px; font-size: 12px;" onclick="window.showOneTimeAttackForm('${attacker.id}', '${target.id}', ${dist}, ${coverPenalty})">РАЗОВАЯ АТАКА</button>
            </div>
            
            <div id="new-preset-form" style="display: none; background: #1a1a1a; padding: 15px; margin-top: 15px; border: 1px solid #444;">
                <h4 style="margin-top: 0; color: #ccc;">Новый пресет</h4>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex:1;"><label style="font-size: 12px;">Название:</label><br><input type="text" id="p-name" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                    <div style="flex:1;"><label style="font-size: 12px;">Атака (XnY):</label><br><input type="text" id="p-attack" placeholder="5d6" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex:1;"><label style="font-size: 12px;">Баз. П/П:</label><br><input type="number" id="p-threshold" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                    <div style="flex:1;"><label style="font-size: 12px;">Д/Д:</label><br><input type="number" id="p-range" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                    <div style="flex:1;"><label style="font-size: 12px;">Б/П:</label><br><input type="number" id="p-pen" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                </div>
                <button class="btn-action" style="width: 100%; background: #00aa00; padding: 10px; border: 1px solid #00ff00; border-radius: 0;" onclick="window.saveNewPreset('${attacker.id}', event)">СОХРАНИТЬ ПРЕСЕТ</button>
            </div>
            
            <div id="onetime-form" style="display: none; background: #1a1a1a; padding: 15px; margin-top: 15px; border: 1px solid #444;">
                 <h4 style="margin-top: 0; color: #ffaa00;">Разовая атака</h4>
                 <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex:1;"><label style="font-size: 12px;">Атака:</label><br><input type="text" id="o-attack" placeholder="5d6" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                    <div style="flex:1;"><label style="font-size: 12px;">Баз. П/П:</label><br><input type="number" id="o-threshold" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                    <div style="flex:1;"><label style="font-size: 12px;">Д/Д:</label><br><input type="number" id="o-range" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                    <div style="flex:1;"><label style="font-size: 12px;">Б/П:</label><br><input type="number" id="o-pen" style="width:100%; box-sizing: border-box; background:black; color:white; border:1px solid #555; padding:5px;"></div>
                </div>
                <button class="btn-action" style="width: 100%; background: #aa0000; color: white; padding: 10px;" onclick="window.fireOneTimeAttack('${attacker.id}', '${target.id}', ${dist}, ${coverPenalty})">ОТКРЫТЬ ОГОНЬ</button>
            </div>
        `;
    }
    presetsHtml += `</div>`;

    const footer = `
        <div style="padding: 15px; background: #050505; border-top: 1px solid #333; text-align: center;">
            <button class="btn-action" style="background: transparent; color: #888; border: 1px solid #888; padding: 10px 30px;" onclick="window.closeAttackInterface()">ОТМЕНА</button>
        </div>
    `;

    modal.innerHTML = header + presetsHtml + footer;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
};

window.closeAttackInterface = function() {
    const overlay = document.getElementById('attack-interface-overlay');
    if (overlay) overlay.remove();
};

window.showNewPresetForm = function() {
    document.getElementById('new-preset-form').style.display = 'block';
    document.getElementById('onetime-form').style.display = 'none';
};

window.showOneTimeAttackForm = function() {
    document.getElementById('new-preset-form').style.display = 'none';
    document.getElementById('onetime-form').style.display = 'block';
};

window.saveNewPreset = function(attackerId, event) {
    const preset = {
        name: document.getElementById('p-name').value || 'Новая атака',
        attack: document.getElementById('p-attack').value.toLowerCase(),
        threshold: parseInt(document.getElementById('p-threshold').value) || 0,
        range: parseInt(document.getElementById('p-range').value) || 0,
        armorPen: parseInt(document.getElementById('p-pen').value) || 0
    };
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('save_attack_preset', { entityId: attackerId, preset });
    }
    
    // Блокируем кнопку визуально, показывая процесс. 
    // Мы НЕ закрываем интерфейс — он сам обновится и покажет новый пресет,
    // когда сервер пришлет сигнал 'preset_saved' (прописан в шаге 1)!
    if (event && event.target) {
        event.target.innerText = "СОХРАНЕНИЕ...";
        event.target.style.background = "repeating-linear-gradient(45deg, #aaaa00, #aaaa00 10px, #888800 10px, #888800 20px)";
        event.target.style.pointerEvents = "none";
    }
};

window.fireAttack = function(attackerId, targetId, attackStr, baseThreshold, range, armorPen, dist, coverPenalty) {
    const parts = attackStr.split('d');
    const diceCount = parseInt(parts[0]) || 0;
    const diceFaces = parseInt(parts[1]) || 0;
    
    const rangePenalty = dist > range ? (dist - range) : 0;
    const finalThreshold = baseThreshold + rangePenalty + coverPenalty;

    window.closeAttackInterface();
    window.isTargeting = false; window.combatAttackerId = null;
    window.hideTargetingBanner();

    if (typeof socket !== 'undefined' && socket) {
        // Передаем все штрафы для новой плашки П/П и красивого лога
        socket.emit('execute_attack', {
            attackerId, targetId, diceCount, diceFaces, baseThreshold, threshold: finalThreshold, armorPen, coverPenalty, rangePenalty
        });
    }
};

window.fireOneTimeAttack = function(attackerId, targetId, dist, coverPenalty) {
    const attackStr = document.getElementById('o-attack').value.toLowerCase();
    const baseT = parseInt(document.getElementById('o-threshold').value) || 0;
    const r = parseInt(document.getElementById('o-range').value) || 0;
    const pen = parseInt(document.getElementById('o-pen').value) || 0;
    window.fireAttack(attackerId, targetId, attackStr, baseT, r, pen, dist, coverPenalty);
};