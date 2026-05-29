import { Entity } from '../types';
import { useGameStore } from '../state';

// ============================================================================
// COOLDOWN SYSTEM - Gestión de cooldowns y timers
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: battle mode decay, animation timers, cooldowns generales.
// ============================================================================

export interface CooldownSystemConfig {
  playerEntity: Entity;
  entities: Entity[];
}

export class CooldownSystem {
  private playerEntity: Entity;
  private entities: Entity[];
  private battleModeEndTime = 0;

  constructor(config: CooldownSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.entities = config.entities;
  }

  // --- COOLDOWN TICK ---

  tickCooldowns(dt: number): void {
    const store = useGameStore.getState();

    // Battle mode decay
    if (store.battleMode && performance.now() > this.battleModeEndTime) {
      useGameStore.setState({ battleMode: false });
    }

    // Animation timers
    this.entities.forEach(e => {
      e.animationTimer += dt;
    });
  }

  // --- BATTLE MODE ---

  triggerBattleMode(now: number, durationMs: number = 5000): void {
    this.battleModeEndTime = now + durationMs;
    useGameStore.setState({ battleMode: true });
  }

  setBattleModeEndTime(endTime: number): void {
    this.battleModeEndTime = endTime;
  }

  getBattleModeEndTime(): number {
    return this.battleModeEndTime;
  }

  isBattleModeActive(): boolean {
    const store = useGameStore.getState();
    return store.battleMode && performance.now() <= this.battleModeEndTime;
  }
}
