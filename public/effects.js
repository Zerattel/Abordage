window.addPeriodicEffect = function(entityId) {
    const name = document.getElementById('eff-name').value || 'Неизвестный эффект';
    const stat = document.getElementById('eff-stat').value;
    const amount = parseInt(document.getElementById('eff-amount').value) || 0;
    const durationStr = document.getElementById('eff-duration').value;
    // Если поле пустое, передаем null (перманентный эффект)
    const duration = (durationStr === '' || isNaN(durationStr)) ? null : parseInt(durationStr);

    if (typeof socket !== 'undefined' && socket) {
        socket.emit('add_effect', { entityId, name, stat, amount, duration });
    }
    
    // Визуально блокируем кнопку для обратной связи
    const btn = document.getElementById('btn-add-effect');
    if (btn) {
        btn.innerText = "ДОБАВЛЕНИЕ...";
        btn.style.pointerEvents = "none";
    }
};

window.removePeriodicEffect = function(entityId, effectId) {
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('remove_effect', { entityId, effectId });
    }
};

// Прослушиваем отдельное событие для обновления окна эффектов на лету
const waitSocketEffects = setInterval(() => {
    if (typeof socket !== 'undefined' && socket) {
        clearInterval(waitSocketEffects);
        socket.on('effects_updated', (entityId) => {
            // Если мы прямо сейчас смотрим в досье этого персонажа — обновляем его
            if (typeof window.editingEntityId !== 'undefined' && window.editingEntityId === entityId) {
                if (typeof window.openCharacterCard === 'function') window.openCharacterCard(entityId);
            }
        });
    }
}, 100);