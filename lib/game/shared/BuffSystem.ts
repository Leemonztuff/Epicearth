import { Entity } from '../types';
import { gameEventBus } from '../core/EventBus';
import { GameContext } from '../core/GameContext';

// ============================================================================
// BUFF SYSTEM - Gestión de buffs y debuffs
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: aplicación, expiración, y efectos de buffs en stats.
// ============================================================================

export interface BuffSystemConfig {
  playerEntity: Entity;
  context: GameContext;
}

export class BuffSystem {
  private playerEntity: Entity;
  private context: GameContext;

  constructor(config: BuffSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.context = config.context;
  }

  // --- BUFF DECAY ---

  tickBuffDecay(dt: number): void {
    const store = this.context.store;
    const activeBuffs = store.getActiveBuffs();
    if (activeBuffs.length === 0) return;

    const dtMs = dt * 1000;
    let updatedBuffs = activeBuffs.map(b => ({ ...b, durationMs: b.durationMs - dtMs }));
    const expired = updatedBuffs.filter(b => b.durationMs <= 0);
    updatedBuffs = updatedBuffs.filter(b => b.durationMs > 0);

    if (expired.length > 0) {
      let agiSub = 0, strSub = 0, intSub = 0, dexSub = 0;
      expired.forEach(e => {
        store.addCombatLog(`⏳ El buff [${e.name}] ha expirado.`, 'system');
        gameEventBus.emit('buff:expired', { entityId: this.playerEntity.id, buffId: e.id });
        if (e.id === 'increase_agi') agiSub += 20;
        if (e.id === 'blessing') { strSub += 20; intSub += 20; dexSub += 20; }
      });

      const currentStats = store.getStats();
      store.updateStats({
        agi: Math.max(1, currentStats.agi - agiSub),
        str: Math.max(1, currentStats.str - strSub),
        int: Math.max(1, currentStats.int - intSub),
        dex: Math.max(1, currentStats.dex - dexSub)
      });

      this.playerEntity.maxHp = store.getStats().maxHp;
      this.playerEntity.maxSp = store.getStats().maxSp;
    }

    // Note: Buff expiration is handled by the store via removeBuff
    // We need to update the store's activeBuffs
    // This will be handled by the store's removeBuff method
  }

  // --- APPLY BUFF ---

  applyBuff(
    buffId: string,
    buffName: string,
    durationMs: number,
    icon: string,
    description: string,
    statModifiers: Partial<{ agi: number; str: number; int: number; dex: number }>
  ): void {
    const store = this.context.store;

    store.addBuff({
      id: buffId,
      name: buffName,
      durationMs,
      maxDurationMs: durationMs,
      icon,
      description
    });

    const currentStats = store.getStats();
    store.updateStats({
      agi: currentStats.agi + (statModifiers.agi || 0),
      str: currentStats.str + (statModifiers.str || 0),
      int: currentStats.int + (statModifiers.int || 0),
      dex: currentStats.dex + (statModifiers.dex || 0)
    });

    this.playerEntity.maxHp = store.getStats().maxHp;
    this.playerEntity.maxSp = store.getStats().maxSp;

    gameEventBus.emit('buff:applied', { entityId: this.playerEntity.id, buffId });
  }

  // --- REMOVE BUFF ---

  removeBuff(buffId: string): void {
    const store = this.context.store;
    const buff = store.getActiveBuffs().find(b => b.id === buffId);
    if (!buff) return;

    store.removeBuff(buffId);
    gameEventBus.emit('buff:expired', { entityId: this.playerEntity.id, buffId });
  }

  // --- HELPERS ---

  hasBuff(buffId: string): boolean {
    const store = this.context.store;
    return store.getActiveBuffs().some(b => b.id === buffId);
  }

  getActiveBuffCount(): number {
    const store = this.context.store;
    return store.getActiveBuffs().length;
  }
}
