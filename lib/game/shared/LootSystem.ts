import { Entity, GroundItem } from '../types';
import { gameEventBus } from '../core/EventBus';
import { GameContext } from '../core/GameContext';

// ============================================================================
// LOOT SYSTEM - Gestión de items en el suelo y recogida
// ============================================================================
// Maneja: física de loot, pickup manual, y generación de drops.
// Estilo Ragnarok Online: items caen al suelo, jugador decide cuándo recoger.
// ============================================================================

export interface LootSystemConfig {
  playerEntity: Entity;
  groundItems: GroundItem[];
  context: GameContext;
}

export class LootSystem {
  private playerEntity: Entity;
  private groundItems: GroundItem[];
  private context: GameContext;

  constructor(config: LootSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.groundItems = config.groundItems;
    this.context = config.context;
  }

  // --- LOOT PHYSICS ---

  tickLootPhysics(dt: number): void {
    const tickScale = dt * 60.0;

    this.groundItems.forEach(item => {
      if (item.velY !== undefined && item.velX !== undefined && item.velZ !== undefined) {
        const gravityAcc = -0.38;
        item.velY += gravityAcc * tickScale;
        item.x += item.velX * dt;
        item.y += item.velY * dt;
        item.z += item.velZ * dt;

        if (item.y <= 0.05) {
          item.y = 0.05;
          if (item.bounceCount !== undefined && item.bounceCount < 2) {
            item.velY = -item.velY * 0.45;
            item.velX *= 0.5;
            item.velZ *= 0.5;
            item.bounceCount++;
            gameEventBus.emit('audio:play', { action: 'item_bounce' });
          } else {
            item.velY = 0;
            item.velX = 0;
            item.velZ = 0;
          }
        }
      }
    });
  }

  // --- LOOT PICKUP (manual - jugador camina sobre item) ---

  tickLootPickup(): void {
    const store = this.context.store;
    const inventory = this.context.inventory;

    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const item = this.groundItems[i];
      const dist = Math.sqrt(
        (item.x - this.playerEntity.x) ** 2 + (item.z - this.playerEntity.z) ** 2
      );

      // Auto-pickup cuando el jugador camina sobre el item (distancia muy cercana)
      if (dist < 0.8) {
        const added = inventory.addItem(item.itemId, item.quantity);
        
        if (added) {
          store.addCombatLog(`¡Has recogido [${item.name}] x${item.quantity}!`, 'loot');
          gameEventBus.emit('loot:picked', { entityId: this.playerEntity.id, itemId: item.itemId });
          this.groundItems.splice(i, 1);
        }
      }
    }
  }

  // --- ADD GROUND ITEM (cuando un monstruo muere) ---

  addGroundItem(item: GroundItem): void {
    this.groundItems.push(item);
    gameEventBus.emit('loot:dropped', { itemId: item.itemId, x: item.x, z: item.z, quantity: item.quantity });
  }

  // --- DROP ITEM FROM MOON ---

  dropItemFromMob(
    mob: Entity,
    itemId: string,
    itemName: string,
    quantity: number = 1
  ): void {
    // Calcular posición de drop (alrededor del monstruo)
    const angle = Math.random() * Math.PI * 2;
    const distance = 0.5 + Math.random() * 1.5;
    
    const item: GroundItem = {
      id: `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      itemId,
      name: itemName,
      quantity,
      x: mob.x + Math.cos(angle) * distance,
      y: 2.0, // Altura inicial (para animación de caída)
      z: mob.z + Math.sin(angle) * distance,
      velX: (Math.random() - 0.5) * 3,
      velY: 8 + Math.random() * 4,
      velZ: (Math.random() - 0.5) * 3,
      bounceCount: 0
    };

    this.addGroundItem(item);
  }

  // --- GETTERS ---

  getGroundItems(): readonly GroundItem[] {
    return this.groundItems;
  }

  getGroundItemCount(): number {
    return this.groundItems.length;
  }

  getGroundItemsNearPlayer(radius: number = 3): GroundItem[] {
    return this.groundItems.filter(item => {
      const dist = Math.sqrt(
        (item.x - this.playerEntity.x) ** 2 + (item.z - this.playerEntity.z) ** 2
      );
      return dist <= radius;
    });
  }
}
