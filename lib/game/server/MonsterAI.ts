import { Entity } from '../types';
import { gameEventBus } from '../core/EventBus';
import { GameContext } from '../core/GameContext';
import { CombatRuntime, DamageCalculation } from './CombatRuntime';

// ============================================================================
// MONSTER AI - Sistema de inteligencia artificial para monstruos
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: persecución, ataque, wandering, y comportamiento agresivo.
// Ahora delega cálculo de daño al CombatRuntime (determinístico).
// ============================================================================

export interface MonsterAIConfig {
  playerEntity: Entity;
  monsters: Entity[];
  context: GameContext;
  combatRuntime: CombatRuntime;
}

export class MonsterAI {
  private playerEntity: Entity;
  private monsters: Entity[];
  private context: GameContext;
  private runtime: CombatRuntime;

  constructor(config: MonsterAIConfig) {
    this.playerEntity = config.playerEntity;
    this.monsters = config.monsters;
    this.context = config.context;
    this.runtime = config.combatRuntime;
  }

  // --- MAIN AI TICK ---

  tickMonsterAI(now: number, dt: number): void {
    if (this.playerEntity.state === 'death') {
      this.monsters.forEach(m => { m.state = 'idle'; m.targetEntityId = null; });
      return;
    }

    const tickScale = dt * 60.0;

    this.monsters.forEach(mob => {
      if (mob.currentHp <= 0) return;

      const dist = Math.sqrt(
        (this.playerEntity.x - mob.x) ** 2 + (this.playerEntity.z - mob.z) ** 2
      );

      const visionLimit = mob.type === 'boss_mvp' ? 16.0 : 6.0;
      const isAggressive = mob.type === 'boss_mvp' || mob.mobType === 'pecopeco';

      if (dist <= visionLimit && (isAggressive || mob.targetEntityId)) {
        mob.targetEntityId = 'player_main';
        const combatReach = mob.type === 'boss_mvp' ? 2.8 : 1.8;

        if (dist <= combatReach) {
          this.monsterAttack(mob, now);
        } else {
          this.monsterChase(mob, dist, tickScale);
        }
      } else {
        this.monsterWander(mob, tickScale);
      }
    });
  }

  // --- MONSTER ATTACK ---

  private monsterAttack(mob: Entity, now: number): void {
    mob.state = 'attack';
    const isBoss = mob.type === 'boss_mvp';
    const rechargeCooldown = isBoss ? 450 : 1200;

    if (mob.animationTimer > rechargeCooldown * 0.001) {
      mob.animationTimer = 0;
      const store = this.context.store;
      const stats = store.getStats();

      const dmgCalc: DamageCalculation = {
        attackerAtk: isBoss ? 280 : (mob.mobType === 'pecopeco' ? 45 : 18),
        attackerStats: { hit: 150 + (isBoss ? 120 : 15), luk: 0 },
        targetDef: stats.def || 0,
        targetStats: stats,
        skillMultiplier: 1.0,
      };
      const result = this.runtime.calculateDamage(dmgCalc, stats);

      if (!result.isHit) {
        gameEventBus.emit('entity:damaged', { entityId: this.playerEntity.id, damage: 0, isCrit: false });
        gameEventBus.emit('combat:miss', { attackerId: mob.id, targetId: this.playerEntity.id, reason: 'flee' });
        store.addCombatLog(`[${mob.name}] te ataca y evades su golpe (FLEE).`, 'system');
      } else {
        const finalDmg = result.damage;

        this.runtime.applyDamageToEntity(this.playerEntity, finalDmg, mob.id, now);
        this.playerEntity.hitRecoveryEndTime = now + 240;

        gameEventBus.emit('entity:damaged', { entityId: this.playerEntity.id, damage: finalDmg, isCrit: false });
        store.addCombatLog(`¡[${mob.name}] te propina un golpe brutal! Pierdes ${finalDmg} HP.`, 'player_hit');
        store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
      }
    }
  }

  // --- MONSTER CHASE ---

  private monsterChase(mob: Entity, dist: number, tickScale: number): void {
    if (mob.state !== 'attack' && mob.hitRecoveryEndTime < performance.now()) {
      mob.state = 'move';
    }
    const mSpeed = (mob.type === 'boss_mvp' ? 0.075 : 0.032) * tickScale;
    mob.facing = this.playerEntity.x > mob.x ? 'right' : 'left';

    const dx = this.playerEntity.x - mob.x;
    const dz = this.playerEntity.z - mob.z;
    mob.x += (dx / dist) * mSpeed;
    mob.z += (dz / dist) * mSpeed;
    mob.y = 0;

    gameEventBus.emit('entity:moved', { entityId: mob.id, x: mob.x, z: mob.z });
  }

  // --- MONSTER WANDER ---

  private monsterWander(mob: Entity, tickScale: number): void {
    if (mob.hitRecoveryEndTime < performance.now()) {
      if (Math.random() < 0.01 * tickScale) {
        mob.state = 'move';
        mob.targetX = mob.x + (Math.random() - 0.5) * 15;
        mob.targetZ = mob.z + (Math.random() - 0.5) * 15;
      }

      if (mob.state === 'move' && mob.targetX !== undefined && mob.targetZ !== undefined) {
        const mdx = mob.targetX - mob.x;
        const mdz = mob.targetZ - mob.z;
        const mdist = Math.sqrt(mdx * mdx + mdz * mdz);

        if (mdist > 0.4) {
          mob.facing = mdx > 0 ? 'right' : 'left';
          mob.x += (mdx / mdist) * 0.015 * tickScale;
          mob.z += (mdz / mdist) * 0.015 * tickScale;
          mob.y = 0;
        } else {
          mob.state = 'idle';
          mob.targetX = undefined;
          mob.targetZ = undefined;
        }
      }
    }
  }
}
