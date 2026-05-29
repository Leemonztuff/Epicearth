import { Entity } from '../types';
import { GameContext } from '../core/GameContext';

// ============================================================================
// REGEN SYSTEM - Regeneración de HP/SP
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: regeneración passiva de HP y SP basada en stats.
// ============================================================================

export interface RegenSystemConfig {
  playerEntity: Entity;
  context: GameContext;
}

export class RegenSystem {
  private playerEntity: Entity;
  private context: GameContext;

  constructor(config: RegenSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.context = config.context;
  }

  // --- HP/SP REGENERATION ---

  tickRegeneration(dt: number): void {
    if (this.playerEntity.state === 'death') return;
    const store = this.context.store;
    const tickScale = dt * 60.0;

    const stats = store.getStats();

    // HP regen basado en VIT
    const hpRegenRate = (0.04 + stats.vit * 0.011) * tickScale;
    this.playerEntity.currentHp = Math.min(
      this.playerEntity.maxHp,
      this.playerEntity.currentHp + hpRegenRate
    );

    // SP regen basado en INT
    const spRegenRate = (0.018 + stats.int * 0.006) * tickScale;
    this.playerEntity.currentSp = Math.min(
      this.playerEntity.maxSp,
      this.playerEntity.currentSp + spRegenRate
    );

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
  }

  // --- GETTERS ---

  getHpRegenRate(): number {
    const stats = this.context.store.getStats();
    return 0.04 + stats.vit * 0.011;
  }

  getSpRegenRate(): number {
    const stats = this.context.store.getStats();
    return 0.018 + stats.int * 0.006;
  }
}
