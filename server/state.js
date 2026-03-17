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
        this.barrier = data.barrier || 0;
        this.tankWithConcentration = data.tankWithConcentration || false;
        
        this.attackPresets = data.attackPresets || [];
        this.hasActedThisRound = false;
        this.periodicEffects = [];

        if (this.maxConcentration > 0) {
            this.addPeriodicEffect('concentration', 5, 0);
        }
    }

    addPeriodicEffect(stat, amount, duration) {
        this.periodicEffects.push({ stat, amount, duration });
    }

    processNewRound(logManager) {
        this.dynamicMobility = this.baseMobility;
        this.hasActedThisRound = false;
        // ... (логика эффектов скрыта для экономии места, она остается прежней)
    }
}

// Добавь эту строку перед module.exports
let currentRound = 1; 

module.exports = { 
    GRID_SIZE,
    mapGrid,
    mapBackground,
    entities,
    currentRound, // НОВОЕ: Экспортируем текущий раунд
    Entity 
};