import { Entity } from '../types';
import { useGameStore } from '../state';

// ============================================================================
// REGEN SYSTEM - Regeneración de HP/SP
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: regeneración passiva de HP y SP basada en stats.
// ============================================================================

export interface RegenSystemConfig {
  playerEntity: Entity;
}

export class RegenSystem {
  private playerEntity: Entity;

  constructor(config: RegenSystemConfig) {
    this.playerEntity = config.playerEntity;
  }

  // --- HP/SP REGENERATION ---

  tickRegeneration(dt: number): void {
    if (this.playerEntity.state === 'death') return;
    const store = useGameStore.getState();
    const tickScale = dt * 60.0;

    // HP regen basado en VIT
    const hpRegenRate = (0.04 + store.stats.vit * 0.011) * tickScale;
    this.playerEntity.currentHp = Math.min(
      this.playerEntity.maxHp,
      this.playerEntity.currentHp + hpRegenRate
    );

    // SP regen basado en INT
    const spRegenRate = (0.018 + store.stats.int * 0.006) * tickScale;
    this.playerEntity.currentSp = Math.min(
      this.playerEntity.maxSp,
      this.playerEntity.currentSp + spRegenRate
    );

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
  }

  // --- GETTERS ---

  getHpRegenRate(): number {
    const store = useGameStore.getState();
    return 0.04 + store.stats.vit * 0.011;
  }

  getSpRegenRate(): number {
    const store = useGameStore.getState();
    return 0.018 + store.stats.int * 0.006;
  }
}
