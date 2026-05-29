import { Entity, Skill, CharacterStats } from '../types';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// COMBAT RUNTIME - Motor de combate determinístico
// ============================================================================
// Desacoplado del render, store, audio.
// Pure logic: recibe datos de entidad, produce resultados de combate.
// Multiplayer-ready: comandas entradas, emite eventos, sin side effects.
// ============================================================================

// --- PIPELINE TYPES ---

export interface AttackRequest {
  attackerId: string;
  targetId: string;
  skillId?: string;
  timestamp: number;
}

export interface AttackValidation {
  valid: boolean;
  reason?: string;
}

export interface DamageCalculation {
  attackerAtk: number;
  attackerStats: Partial<CharacterStats>;
  targetDef: number;
  targetStats: Partial<CharacterStats>;
  skillMultiplier: number;
  isCrit: boolean;
  element?: string;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  isHit: boolean;
}

export interface CombatStatus {
  id: string;
  name: string;
  duration: number;
  tickInterval: number;
  tickTimer: number;
}

export interface AggroEntry {
  entityId: string;
  threat: number;
  lastActivity: number;
}

// --- STATUS EFFECT DEFINITIONS ---

const STATUS_REGISTRY: Record<string, Omit<CombatStatus, 'tickTimer'>> = {
  stun: { id: 'stun', name: 'Stun', duration: 1500, tickInterval: 0 },
  freeze: { id: 'freeze', name: 'Freeze', duration: 2000, tickInterval: 0 },
  poison: { id: 'poison', name: 'Poison', duration: 10000, tickInterval: 2000 },
  blind: { id: 'blind', name: 'Blind', duration: 5000, tickInterval: 0 },
  silence: { id: 'silence', name: 'Silence', duration: 4000, tickInterval: 0 },
};

// --- SKILL MULTIPLIERS (data-driven) ---

export const SKILL_MULTIPLIERS: Record<string, number> = {
  bash: 4.0,
  double_strafe: 3.5,
  sonic_blow: 6.0,
  grimtooth: 3.0,
  holy_light: 2.8,
  falcon_strike: 4.5,
};

// ============================================================================
// AGGRO TABLE
// ============================================================================

export class AggroTable {
  private entries = new Map<string, AggroEntry>();
  private decayRate = 0.05;

  addThreat(sourceId: string, targetId: string, amount: number, now: number): number {
    const key = `${sourceId}:${targetId}`;
    const existing = this.entries.get(key);
    const newThreat = (existing?.threat || 0) + amount;
    this.entries.set(key, { entityId: sourceId, threat: newThreat, lastActivity: now });
    return newThreat;
  }

  getTopThreat(sourceId: string): { targetId: string; threat: number } | null {
    let top: { targetId: string; threat: number } | null = null;
    for (const [key, entry] of this.entries) {
      if (!entry.entityId.startsWith(sourceId)) continue;
      const targetId = key.split(':')[1];
      if (!targetId) continue;
      if (!top || entry.threat > top.threat) {
        top = { targetId, threat: entry.threat };
      }
    }
    return top;
  }

  getThreat(sourceId: string, targetId: string): number {
    return this.entries.get(`${sourceId}:${targetId}`)?.threat || 0;
  }

  decayThreat(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastActivity > 5000) {
        entry.threat = Math.max(0, entry.threat - this.decayRate * (now - entry.lastActivity));
        if (entry.threat <= 0) {
          this.entries.delete(key);
        }
      }
    }
  }

  removeEntity(entityId: string): void {
    for (const [key] of this.entries) {
      if (key.startsWith(entityId) || key.endsWith(`:${entityId}`)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}

// ============================================================================
// COMBAT PIPELINES
// ============================================================================

export class CombatRuntime {
  private aggroTable = new AggroTable();
  private rngSeed = 0;
  private rngState = 0;
  private statusMap = new Map<string, CombatStatus[]>();

  constructor(seed?: number) {
    this.rngSeed = seed ?? Date.now();
    this.rngState = this.rngSeed;
  }

  // --- SEEDED RNG (deterministic) ---

  private nextRandom(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  setSeed(seed: number): void {
    this.rngSeed = seed;
    this.rngState = seed;
  }

  getSeed(): number { return this.rngSeed; }

  // --- 1. ATTACK VALIDATION PIPELINE ---

  validateAttack(
    attacker: Entity,
    target: Entity,
    skill: Skill | undefined,
    now: number
  ): AttackValidation {
    if (attacker.state === 'death' || attacker.currentHp <= 0) {
      return { valid: false, reason: 'attacker_dead' };
    }
    if (target.state === 'death' || target.currentHp <= 0) {
      return { valid: false, reason: 'target_dead' };
    }

    if (skill) {
      if (attacker.currentSp < skill.spCost) {
        return { valid: false, reason: 'insufficient_sp' };
      }
      const timeSinceCast = now - (skill.lastCastTime || 0);
      if (timeSinceCast < skill.cooldown) {
        return { valid: false, reason: 'cooldown' };
      }
      const dist = Math.sqrt(
        (target.x - attacker.x) ** 2 + (target.z - attacker.z) ** 2
      );
      if (dist > (skill.range || 2.0)) {
        return { valid: false, reason: 'out_of_range' };
      }
    }

    return { valid: true };
  }

  // --- 2. DAMAGE CALCULATION PIPELINE ---

  calculateDamage(
    calc: DamageCalculation,
    attackerStats: Partial<CharacterStats>
  ): DamageResult {
    const {
      attackerAtk, targetDef,
      skillMultiplier = 1.0,
      isCrit: forceCrit = false
    } = calc;

    const luk = attackerStats.luk || 0;
    const critChance = Math.min(0.5, 0.05 + luk * 0.005);
    const isCrit = forceCrit || this.nextRandom() < critChance;

    const hitChance = Math.min(1.0, Math.max(0.05, ((calc.attackerStats.hit || 80) - (targetDef * 0.1)) / 100));
    const isHit = this.nextRandom() < hitChance;

    if (!isHit) {
      return { damage: 0, isCrit: false, isHit: false };
    }

    const rawDmg = Math.floor(attackerAtk * skillMultiplier);
    const randOffset = Math.floor((this.nextRandom() - 0.5) * rawDmg * 0.15);
    let damage = Math.max(1, rawDmg + randOffset - Math.floor(targetDef * 0.15));
    if (isCrit) damage = Math.floor(damage * 1.5);

    return { damage, isCrit, isHit: true };
  }

  // --- 3. SKILL EXECUTION PIPELINE ---

  executeSkill(
    attacker: Entity,
    target: Entity | null,
    skill: Skill,
    now: number,
    getStats: () => CharacterStats
  ): { damageResult?: DamageResult; healAmount?: number; projectile?: boolean } {
    const stats = getStats();

    if (skill.id === 'heal' && target === null) {
      const healAmt = Math.floor(attacker.maxHp * 0.35 + (stats.int || 0) * 14);
      return { healAmount: healAmt };
    }

    if (!target) return {};

    const multiplier = SKILL_MULTIPLIERS[skill.id] || 2.0;
    const str = stats.str || 0;
    const dex = stats.dex || 0;
    const intStat = stats.int || 0;

    let finalMultiplier = multiplier;
    if (skill.id === 'bash') finalMultiplier = 4.0 + str * 0.02;
    if (skill.id === 'double_strafe') finalMultiplier = 3.5 + dex * 0.035;
    if (skill.id === 'sonic_blow') finalMultiplier = 6.0 + str * 0.03;
    if (skill.id === 'holy_light') finalMultiplier = 2.8 + intStat * 0.03;

    const isArrowSkill = skill.id === 'double_strafe';
    const isProjectileSkill = skill.id === 'holy_light' || isArrowSkill;

    const dmgCalc: DamageCalculation = {
      attackerAtk: stats.atk || 0,
      attackerStats: stats,
      targetDef: target.maxHp || 0,
      targetStats: {},
      skillMultiplier: finalMultiplier,
      isCrit: false,
    };

    const result = this.calculateDamage(dmgCalc, stats);

    if (!result.isHit) {
      return { damageResult: { damage: 0, isCrit: false, isHit: false } };
    }

    const damage = Math.max(1, result.damage - (skill.id === 'falcon_strike' ? 0 : Math.floor(target.maxHp * 0.05)));

    return {
      damageResult: { damage, isCrit: result.isCrit, isHit: true },
      projectile: isProjectileSkill,
    };
  }

  // --- 4. STATUS EFFECT PIPELINE ---

  applyStatus(entityId: string, statusId: string, now: number): boolean {
    const def = STATUS_REGISTRY[statusId];
    if (!def) return false;

    const existing = this.statusMap.get(entityId) || [];
    if (existing.some(s => s.id === statusId)) return false;

    const resistRoll = this.nextRandom();
    if (resistRoll < 0.3) {
      gameEventBus.emit('combat:status_resisted', { entityId, statusId });
      return false;
    }

    const newStatus: CombatStatus = { ...def, tickTimer: 0 };
    existing.push(newStatus);
    this.statusMap.set(entityId, existing);

    gameEventBus.emit('combat:status_applied', { entityId, statusId, duration: def.duration });
    return true;
  }

  removeStatus(entityId: string, statusId: string): void {
    const existing = this.statusMap.get(entityId);
    if (!existing) return;
    const filtered = existing.filter(s => s.id !== statusId);
    if (filtered.length !== existing.length) {
      this.statusMap.set(entityId, filtered);
      gameEventBus.emit('combat:status_expired', { entityId, statusId });
    }
  }

  tickStatuses(dt: number, now: number): void {
    for (const [entityId, statuses] of this.statusMap) {
      for (let i = statuses.length - 1; i >= 0; i--) {
        const s = statuses[i];
        s.duration -= dt * 1000;
        if (s.duration <= 0) {
          statuses.splice(i, 1);
          gameEventBus.emit('combat:status_expired', { entityId, statusId: s.id });
        }
      }
      if (statuses.length === 0) {
        this.statusMap.delete(entityId);
      }
    }
  }

  hasStatus(entityId: string, statusId: string): boolean {
    return this.statusMap.get(entityId)?.some(s => s.id === statusId) ?? false;
  }

  getStatuses(entityId: string): readonly CombatStatus[] {
    return this.statusMap.get(entityId) || [];
  }

  // --- 5. AGGRO PIPELINE ---

  getAggroTable(): AggroTable { return this.aggroTable; }

  registerDamage(sourceId: string, targetId: string, damage: number, now: number): void {
    const total = this.aggroTable.addThreat(sourceId, targetId, damage, now);
    gameEventBus.emit('combat:aggro', { entityId: sourceId, targetId, threat: damage, totalThreat: total });
  }

  registerHeal(sourceId: string, targetId: string, amount: number, now: number): void {
    const total = this.aggroTable.addThreat(sourceId, targetId, amount * 0.5, now);
    gameEventBus.emit('combat:aggro', { entityId: sourceId, targetId, threat: amount * 0.5, totalThreat: total });
  }

  tickAggroDecay(now: number): void {
    this.aggroTable.decayThreat(now);
  }

  clearAggroFor(sourceId: string): void {
    this.aggroTable.removeEntity(sourceId);
    gameEventBus.emit('combat:aggro_lost', { entityId: sourceId, targetId: '' });
  }

  // --- COMBAT HELPERS (entity-agnostic, data-in/data-out) ---

  applyDamageToEntity(target: Entity, damage: number, sourceId: string, now: number): void {
    target.currentHp = Math.max(0, target.currentHp - damage);
    target.state = 'hit';
    target.hitRecoveryEndTime = now + 180;

    this.registerDamage(sourceId, target.id, damage, now);

    if (target.currentHp <= 0) {
      target.state = 'death';
      gameEventBus.emit('entity:died', { entityId: target.id, killerId: sourceId });
      gameEventBus.emit('combat:death', { entityId: target.id, killerId: sourceId, timestamp: now });
    }
  }

  applyHealToEntity(target: Entity, amount: number, sourceId: string, now: number): void {
    target.currentHp = Math.min(target.maxHp, target.currentHp + amount);
    gameEventBus.emit('entity:healed', { entityId: target.id, amount });
  }

  // --- CLEANUP ---

  clear(): void {
    this.aggroTable.clear();
    this.statusMap.clear();
  }
}
