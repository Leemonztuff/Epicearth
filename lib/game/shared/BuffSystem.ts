import { Entity } from '../types';
import { useGameStore } from '../state';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// BUFF SYSTEM - Gestión de buffs y debuffs
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: aplicación, expiración, y efectos de buffs en stats.
// ============================================================================

export interface BuffSystemConfig {
  playerEntity: Entity;
}

export class BuffSystem {
  private playerEntity: Entity;

  constructor(config: BuffSystemConfig) {
    this.playerEntity = config.playerEntity;
  }

  // --- BUFF DECAY ---

  tickBuffDecay(dt: number): void {
    const store = useGameStore.getState();
    if (store.activeBuffs.length === 0) return;

    const dtMs = dt * 1000;
    let updatedBuffs = store.activeBuffs.map(b => ({ ...b, durationMs: b.durationMs - dtMs }));
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

      store.updateStats({
        agi: Math.max(1, store.stats.agi - agiSub),
        str: Math.max(1, store.stats.str - strSub),
        int: Math.max(1, store.stats.int - intSub),
        dex: Math.max(1, store.stats.dex - dexSub)
      });

      this.playerEntity.maxHp = store.stats.maxHp;
      this.playerEntity.maxSp = store.stats.maxSp;
    }

    useGameStore.setState({ activeBuffs: updatedBuffs });
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
    const store = useGameStore.getState();

    store.addBuff({
      id: buffId,
      name: buffName,
      durationMs,
      maxDurationMs: durationMs,
      icon,
      description
    });

    const currentStats = store.stats;
    store.updateStats({
      agi: currentStats.agi + (statModifiers.agi || 0),
      str: currentStats.str + (statModifiers.str || 0),
      int: currentStats.int + (statModifiers.int || 0),
      dex: currentStats.dex + (statModifiers.dex || 0)
    });

    this.playerEntity.maxHp = store.stats.maxHp;
    this.playerEntity.maxSp = store.stats.maxSp;

    gameEventBus.emit('buff:applied', { entityId: this.playerEntity.id, buffId });
  }

  // --- REMOVE BUFF ---

  removeBuff(buffId: string): void {
    const store = useGameStore.getState();
    const buff = store.activeBuffs.find(b => b.id === buffId);
    if (!buff) return;

    store.removeBuff(buffId);
    gameEventBus.emit('buff:expired', { entityId: this.playerEntity.id, buffId });
  }

  // --- HELPERS ---

  hasBuff(buffId: string): boolean {
    const store = useGameStore.getState();
    return store.activeBuffs.some(b => b.id === buffId);
  }

  getActiveBuffCount(): number {
    const store = useGameStore.getState();
    return store.activeBuffs.length;
  }
}
