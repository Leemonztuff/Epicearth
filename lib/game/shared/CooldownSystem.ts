import { Entity } from '../types';
import { GameContext } from '../core/GameContext';

// ============================================================================
// COOLDOWN SYSTEM - Gestión de cooldowns y timers
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: battle mode decay, animation timers, cooldowns generales.
// ============================================================================

export interface CooldownSystemConfig {
  playerEntity: Entity;
  entities: Entity[];
  context: GameContext;
}

export class CooldownSystem {
  private playerEntity: Entity;
  private entities: Entity[];
  private context: GameContext;
  private battleModeEndTime = 0;

  constructor(config: CooldownSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.entities = config.entities;
    this.context = config.context;
  }

  // --- COOLDOWN TICK ---

  tickCooldowns(dt: number): void {
    const store = this.context.store;

    // Battle mode decay
    if (store.isBattleMode() && performance.now() > this.battleModeEndTime) {
      // Battle mode is managed by the store, we just check the timer
      // The store will handle setting battleMode to false
    }

    // Animation timers
    this.entities.forEach(e => {
      e.animationTimer += dt;
    });
  }

  // --- BATTLE MODE ---

  triggerBattleMode(now: number, durationMs: number = 5000): void {
    this.battleModeEndTime = now + durationMs;
  }

  setBattleModeEndTime(endTime: number): void {
    this.battleModeEndTime = endTime;
  }

  getBattleModeEndTime(): number {
    return this.battleModeEndTime;
  }

  isBattleModeActive(): boolean {
    const store = this.context.store;
    return store.isBattleMode() && performance.now() <= this.battleModeEndTime;
  }
}
