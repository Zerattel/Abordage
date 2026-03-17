// server/gameLogic.js

// Типы клеток
const CELL_TYPES = {
    VOID: 0,      // Пустота
    FIELD: 1,     // Поле
    WALL: 2,      // Стена
    COVER: 3,     // Укрытие
    EMBRASURE: 4, // Амбразура
    GLASS: 5      // Стекло
};

function calculateMoveCost(startX, startY, endX, endY, grid) {
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    
    // Базовая стоимость по Пифагору
    let distance = Math.ceil(Math.sqrt(dx * dx + dy * dy));
    let extraCost = 0;

    // В реальном приложении здесь нужен алгоритм поиска пути (например, A*), 
    // чтобы просчитать маршрут по клеткам. 
    // Упрощенный пример проверки целевой клетки:
    const targetCell = grid[endY][endX];
    
    if (targetCell === CELL_TYPES.WALL || targetCell === CELL_TYPES.GLASS) {
        return Infinity; // Непроходимо
    }
    if (targetCell === CELL_TYPES.COVER || targetCell === CELL_TYPES.EMBRASURE) {
        extraCost = 5; // Штраф за перелезание
    }

    return distance + extraCost;
}