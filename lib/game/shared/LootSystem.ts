import { Entity, GroundItem } from '../types';
import { useGameStore } from '../state';
import { gameEventBus } from '../core/EventBus';
import { gameAudio } from '../audio';

// ============================================================================
// LOOT SYSTEM - Gestión de items en el suelo y recogida
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: física de loot, pickup automático, y generación de drops.
// ============================================================================

export interface LootSystemConfig {
  playerEntity: Entity;
  groundItems: GroundItem[];
}

export class LootSystem {
  private playerEntity: Entity;
  private groundItems: GroundItem[];

  constructor(config: LootSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.groundItems = config.groundItems;
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

  // --- LOOT PICKUP ---

  tickLootPickup(): void {
    const store = useGameStore.getState();

    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const item = this.groundItems[i];
      const dist = Math.sqrt(
        (item.x - this.playerEntity.x) ** 2 + (item.z - this.playerEntity.z) ** 2
      );

      if (dist < 1.35) {
        store.addCombatLog(`¡Has recogido [${item.name}] x${item.quantity}!`, 'loot');
        gameEventBus.emit('loot:picked', { entityId: this.playerEntity.id, itemId: item.itemId });
        this.groundItems.splice(i, 1);
      }
    }
  }

  // --- ADD GROUND ITEM ---

  addGroundItem(item: GroundItem): void {
    this.groundItems.push(item);
    gameEventBus.emit('loot:dropped', { itemId: item.itemId, x: item.x, z: item.z });
  }

  // --- GETTERS ---

  getGroundItems(): GroundItem[] {
    return this.groundItems;
  }

  getGroundItemCount(): number {
    return this.groundItems.length;
  }
}
