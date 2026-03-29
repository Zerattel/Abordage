// server/state.js
const { v4: uuidv4 } = require('uuid');

// --- ГЛОБАЛЬНЫЕ ДАННЫЕ КАРТЫ ---
const GRID_SIZE = 20;
// Теперь карта по умолчанию заполняется Полем (1), а не Пустотой (0)
let mapGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(1));
let mapBackground = ""; 
let entities = []; // Хранилище всех фигурок на доске

// --- КЛАССЫ СУЩНОСТЕЙ ---
class Entity {
    constructor(data) {
        this.id = uuidv4();
        this.name = data.name || "Unknown Entity";
        this.affiliation = data.affiliation || "enemy"; 
        
        // Координаты на сетке
        this.x = data.x || 0;
        this.y = data.y || 0;

        this.avatarUrl = data.avatarUrl || "";
        this.description = data.description || "";
        
        this.maxHp = data.maxHp || 100;
        this.hp = this.maxHp;
        this.maxConcentration = data.maxConcentration || 0;
        this.concentration = this.maxConcentration;
        this.baseMobility = data.mobility || 15;
        this.dynamicMobility = this.baseMobility;
        this.armor = data.armor || 0;
        this.barrierArmor = data.barrierArmor || 0; // Независимая броня барьера
        this.tankWithConcentration = data.tankWithConcentration || false;
        
        this.attackPresets = data.attackPresets || [];
        this.hasActedThisRound = false;
        this.periodicEffects = [];

        this.presets = data.presets || [];

        if (this.maxConcentration > 0) {
            this.addPeriodicEffect('concentration', 5, 0);
        }
    }

    addPeriodicEffect(name, stat, amount, duration) {
        this.periodicEffects.push({
            id: uuidv4(),
            name: name,
            stat: stat, // 'hp' или 'concentration'
            amount: parseInt(amount) || 0,
            duration: duration // null означает перманентно
        });
    }

    removePeriodicEffect(id) {
        this.periodicEffects = this.periodicEffects.filter(e => e.id !== id);
    }

    processNewRound() {
        this.dynamicMobility = this.baseMobility;
        this.hasActedThisRound = false;
        
        let logs = [];
        // Проходим с конца, чтобы безопасно удалять закончившиеся эффекты из массива
        for (let i = this.periodicEffects.length - 1; i >= 0; i--) {
            let effect = this.periodicEffects[i];
            
            if (effect.amount !== 0) {
                let statName = "";
                if (effect.stat === 'hp') {
                    this.hp = Math.max(0, Math.min(this.maxHp, this.hp + effect.amount));
                    statName = "ХП";
                } else if (effect.stat === 'concentration') {
                    this.concentration = Math.max(0, Math.min(this.maxConcentration, this.concentration + effect.amount));
                    statName = "Концентрации";
                }

                let action = effect.amount > 0 ? "восстанавливает" : "теряет";
                let emoji = effect.amount > 0 ? "🟢" : "🩸";
                logs.push(`${emoji} **${this.name}** ${action} **${Math.abs(effect.amount)}** ${statName} от эффекта [${effect.name}]`);
            }

            // Уменьшаем длительность, если эффект не перманентный
            if (effect.duration !== null) {
                effect.duration -= 1;
                if (effect.duration <= 0) {
                    logs.push(`💨 Эффект [${effect.name}] спал с **${this.name}**.`);
                    this.periodicEffects.splice(i, 1);
                }
            }
        }
        return logs;
    }
}

// Добавь эту строку перед module.exports
let currentRound = 1; 
let discordWebhookUrl = '';

module.exports = { 
    GRID_SIZE,
    mapGrid,
    discordWebhookUrl,
    mapBackground,
    entities,
    currentRound, // НОВОЕ: Экспортируем текущий раунд
    Entity 
};