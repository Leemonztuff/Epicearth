import { Entity, Projectile, Skill } from './types';
import { gameAudio } from './audio';
import { gameEventBus } from './core/EventBus';
import { GameContext } from './core/GameContext';
import { CombatRuntime, DamageCalculation } from './server/CombatRuntime';

// ============================================================================
// COMBAT SYSTEM - Sistema de combate
// ============================================================================
// Orchestrator: combina CombatRuntime (pure logic) con callbacks de render.
// Maneja: auto-combate, skills, proyectiles, drops de monstruos.
// ============================================================================

export interface CombatSystemConfig {
  playerEntity: Entity;
  monsters: Entity[];
  context: GameContext;
  combatRuntime?: CombatRuntime;
}

export class CombatSystem {
  private runtime: CombatRuntime;
  private playerEntity: Entity;
  private monsters: Entity[];
  private context: GameContext;
  private delayedActions: { fn: () => void; triggerTime: number }[] = [];
  private activeCast: {
    skillId: string;
    skillName: string;
    durationMs: number;
    elapsedMs: number;
    targetEntityId: string | null;
    color: string;
  } | null = null;
  private onFloatingText: (text: string, color: string, scale: number, x: number, y: number, z: number) => void = () => {};
  private onEffectSpawn: (type: string, x: number, z: number) => void = () => {};
  private onProjectileSpawn: (type: Projectile['type'], owner: Entity, target: Entity, damage: number, isCrit: boolean) => void = () => {};
  private onScreenShake: (intensity: number) => void = () => {};

  constructor(config: CombatSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.monsters = config.monsters;
    this.context = config.context;
    this.runtime = config.combatRuntime || new CombatRuntime();
  }

  getRuntime(): CombatRuntime { return this.runtime; }

  setCallbacks(callbacks: {
    onFloatingText?: (text: string, color: string, scale: number, x: number, y: number, z: number) => void;
    onEffectSpawn?: (type: string, x: number, z: number) => void;
    onProjectileSpawn?: (type: Projectile['type'], owner: Entity, target: Entity, damage: number, isCrit: boolean) => void;
    onScreenShake?: (intensity: number) => void;
  }) {
    if (callbacks.onFloatingText) this.onFloatingText = callbacks.onFloatingText;
    if (callbacks.onEffectSpawn) this.onEffectSpawn = callbacks.onEffectSpawn;
    if (callbacks.onProjectileSpawn) this.onProjectileSpawn = callbacks.onProjectileSpawn;
    if (callbacks.onScreenShake) this.onScreenShake = callbacks.onScreenShake;
  }

  getActiveCast() { return this.activeCast; }

  tickRuntime(dt: number, now: number): void {
    this.runtime.tickStatuses(dt, now);
    this.runtime.tickAggroDecay(now);
  }

  tickDelayedActions(now: number) {
    for (let i = this.delayedActions.length - 1; i >= 0; i--) {
      if (now >= this.delayedActions[i].triggerTime) {
        this.delayedActions[i].fn();
        this.delayedActions.splice(i, 1);
      }
    }
  }

  cancelCast(reason: 'movement' | 'damage' | 'manual' = 'manual'): void {
    if (!this.activeCast) return;
    const skillName = this.activeCast.skillName;
    this.activeCast = null;
    gameEventBus.emit('effect:float_text', {
      text: 'CANCELLED',
      color: '#94a3b8',
      x: this.playerEntity.x,
      y: 2.5,
      z: this.playerEntity.z
    });
    this.context.store.addCombatLog(`¡[${skillName}] cancelado por ${reason === 'movement' ? 'movimiento' : reason}!`, 'system');
    gameAudio.playFail();
  }

  triggerSkillCast(skillId: string) {
    const store = this.context.store;
    const skill = store.getSkills().find(s => s.id === skillId);
    if (!skill) return;

    if (this.playerEntity.currentSp < skill.spCost) {
      store.addCombatLog(`¡Sin SP para lanzar ${skill.name}! Requiere ${skill.spCost} SP.`, 'system');
      gameAudio.playFail();
      return;
    }

    const now = performance.now();
    const lastCast = skill.lastCastTime || 0;
    if (now - lastCast < skill.cooldown) {
      const remaining = Math.ceil((skill.cooldown - (now - lastCast)) / 100) / 10;
      store.addCombatLog(`¡[${skill.name}] está recargando! Restan ${remaining}s.`, 'system');
      return;
    }

    let targetMob: Entity | undefined;
    if (this.playerEntity.targetEntityId) {
      targetMob = this.monsters.find(m => m.id === this.playerEntity.targetEntityId);
    }

    let tx = this.playerEntity.x;
    let tz = this.playerEntity.z;
    if (targetMob && targetMob.currentHp > 0) {
      tx = targetMob.x;
      tz = targetMob.z;
    }

    const distToTarget = Math.sqrt((tx - this.playerEntity.x) ** 2 + (tz - this.playerEntity.z) ** 2);
    if (targetMob && distToTarget > skill.range) {
      this.playerEntity.targetX = tx;
      this.playerEntity.targetZ = tz;
      this.playerEntity.state = 'move';
      store.addCombatLog(`[${skill.name}] fuera de rango. Acercándose...`, 'system');
      return;
    }

    const castTime = skill.castTime || 0;
    if (castTime > 0) {
      if (this.activeCast) {
        store.addCombatLog(`¡Ya estás chanteando un hechizo!`, 'system');
        return;
      }

      this.playerEntity.currentSp -= skill.spCost;
      skill.lastCastTime = now;

      if (targetMob) {
        this.playerEntity.facing = targetMob.x < this.playerEntity.x ? 'left' : 'right';
      }

      this.playerEntity.targetX = undefined;
      this.playerEntity.targetZ = undefined;
      this.playerEntity.state = 'cast';

      this.activeCast = {
        skillId, skillName: skill.name,
        durationMs: castTime, elapsedMs: 0,
        targetEntityId: targetMob ? targetMob.id : null,
        color: skill.color
      };

      store.addCombatLog(`Chanteando [${skill.name}]... ¡Tiempo de casteo: ${(castTime / 1000).toFixed(1)}s!`, 'skill');
      return;
    }

    this.playerEntity.currentSp -= skill.spCost;
    skill.lastCastTime = now;
    this.completeSkillExecution(skillId, targetMob ? targetMob.id : null);
  }

  tickActiveCasting(dt: number) {
    if (!this.activeCast) return;

    this.activeCast.elapsedMs += dt * 1000;

    if (this.activeCast.elapsedMs >= this.activeCast.durationMs) {
      const skillId = this.activeCast.skillId;
      const targetId = this.activeCast.targetEntityId;
      this.activeCast = null;
      this.completeSkillExecution(skillId, targetId);
    }
  }

  tickAutoCombat(now: number, dt: number) {
    if (this.playerEntity.state === 'death' || !this.playerEntity.targetEntityId) return;

    const targetMob = this.monsters.find(m => m.id === this.playerEntity.targetEntityId);
    if (!targetMob || targetMob.currentHp <= 0) {
      this.playerEntity.targetEntityId = null;
      return;
    }

    const dist = Math.sqrt((targetMob.x - this.playerEntity.x) ** 2 + (targetMob.z - this.playerEntity.z) ** 2);
    const store = this.context.store;
    const stats = store.getStats();
    const isSniper = store.getJobClass() === 'Sniper';
    const physicalReach = isSniper ? 9.0 : 2.2;

    if (dist <= physicalReach) {
      const attackTimerCooldown = Math.max(250, 1000 * (2.2 - (stats.aspd * 0.01)));

      if (this.playerEntity.animationTimer > attackTimerCooldown * 0.001) {
        this.playerEntity.state = 'attack';
        this.playerEntity.animationTimer = 0;
        this.playerEntity.hitRecoveryEndTime = now + 300;

        const dmgCalc: DamageCalculation = {
          attackerAtk: stats.atk,
          attackerStats: stats,
          targetDef: targetMob.maxHp,
          targetStats: {},
          skillMultiplier: 1.0,
        };
        const result = this.runtime.calculateDamage(dmgCalc, stats);

        if (result.isHit) {
          const { damage, isCrit } = result;

          if (isSniper) {
            this.onProjectileSpawn('arrow', this.playerEntity, targetMob, damage, isCrit);
            store.addCombatLog(`Disparas flecha: ${damage} daño en camino a [${targetMob.name}].`, 'monster_hit');
          } else {
            this.runtime.applyDamageToEntity(targetMob, damage, this.playerEntity.id, now);
            targetMob.hitRecoveryEndTime = now + 400;

            gameEventBus.emit('entity:damaged', { entityId: targetMob.id, damage, isCrit, sourceId: this.playerEntity.id });

            this.onFloatingText(
              isCrit ? `★ ${damage} ★` : `${damage}`,
              isCrit ? '#f59e0b' : '#ef4444',
              isCrit ? 1.6 : 1.25,
              targetMob.x, 2.0, targetMob.z
            );

            gameAudio.playHit();
            this.onScreenShake(isCrit ? 0.22 : 0.08);
            store.addCombatLog(`Atacas físicamente: ${damage} daño infligido a [${targetMob.name}].`, 'monster_hit');
            store.updateTargetHp(targetMob.currentHp);

            if (targetMob.currentHp <= 0) {
              this.reapMonsterRewards(targetMob);
            }
          }
        } else {
          this.onFloatingText('MISS', '#94a3b8', 1.0, targetMob.x, 2.0, targetMob.z);
          store.addCombatLog(`Atacas y fallas: golpe esquivado por [${targetMob.name}].`, 'system');
        }
      }
    } else {
      this.playerEntity.targetX = targetMob.x;
      this.playerEntity.targetZ = targetMob.z;
      this.playerEntity.state = 'move';
    }
  }

  completeSkillExecution(skillId: string, customTargetId: string | null) {
    const store = this.context.store;
    const skill = store.getSkills().find(s => s.id === skillId);
    if (!skill) return;

    let targetMob: Entity | undefined;
    const targetId = customTargetId || this.playerEntity.targetEntityId;
    if (targetId) {
      targetMob = this.monsters.find(m => m.id === targetId);
    }

    let tx = this.playerEntity.x;
    let tz = this.playerEntity.z;
    if (targetMob && targetMob.currentHp > 0) {
      tx = targetMob.x;
      tz = targetMob.z;
    }

    const now = performance.now();
    const stats = store.getStats();
    this.playerEntity.state = 'attack';
    this.playerEntity.hitRecoveryEndTime = now + 400;

    gameAudio.playSkillCast();
    this.onEffectSpawn(skillId, tx, tz);

    if (skillId === 'heal') {
      const healAmt = Math.floor(this.playerEntity.maxHp * 0.35 + stats.int * 14);
      this.runtime.applyHealToEntity(this.playerEntity, healAmt, this.playerEntity.id, now);
      this.onFloatingText(`+${healAmt}`, '#10b981', 1.8, this.playerEntity.x, 2.5, this.playerEntity.z);
      store.addCombatLog(`Lanzado Heal: +${healAmt} HP recuperados.`, 'heal');
      gameAudio.playHeal();
    } else if (targetMob && targetMob.currentHp > 0) {
      const result = this.runtime.executeSkill(this.playerEntity, targetMob, skill, now, () => store.getStats());

      if (result.damageResult && !result.damageResult.isHit) {
        this.onFloatingText('MISS', '#94a3b8', 1.0, targetMob.x, 2.2, targetMob.z);
        store.addCombatLog(`¡Lanzado ${skill.name} pero fallaste! [${targetMob.name}] esquivó.`, 'skill');
      } else if (result.damageResult) {
        const { damage, isCrit } = result.damageResult;
        const halfDmg = Math.floor(damage / 2);

        if (skillId === 'double_strafe') {
          this.onProjectileSpawn('arrow', this.playerEntity, targetMob, halfDmg, isCrit);
          this.delayedActions.push({
            fn: () => this.onProjectileSpawn('arrow', this.playerEntity, targetMob, halfDmg, isCrit),
            triggerTime: performance.now() + 180
          });
          store.addCombatLog(`¡Lanzado ${skill.name}! Disparando flechas de proyectil en ráfaga doble...`, 'skill');
        } else if (skillId === 'holy_light') {
          this.onProjectileSpawn('holy_light', this.playerEntity, targetMob, damage, isCrit);
          store.addCombatLog(`¡Lanzado ${skill.name}! Proyectil sagrado de luz divina en camino...`, 'skill');
        } else {
          this.runtime.applyDamageToEntity(targetMob, damage, this.playerEntity.id, now);
          targetMob.hitRecoveryEndTime = now + 350;

          gameEventBus.emit('entity:damaged', { entityId: targetMob.id, damage, isCrit, sourceId: this.playerEntity.id });

          this.onFloatingText(
            isCrit ? `★ CRIT ${damage} ★` : `${damage}`,
            isCrit ? '#f59e0b' : '#38bdf8',
            isCrit ? 1.8 : 1.35,
            targetMob.x, 2.2, targetMob.z
          );

          gameAudio.playHit();
          this.onScreenShake(isCrit ? 0.28 : 0.14);
          store.addCombatLog(`¡Lanzado ${skill.name}! Daño propinado: ${damage} HP a [${targetMob.name}].`, 'skill');
          store.updateTargetHp(targetMob.currentHp);

          if (targetMob.currentHp <= 0) {
            this.reapMonsterRewards(targetMob);
          }
        }
      }
    }

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
  }

  impactProjectile(proj: Projectile, target: Entity) {
    const store = this.context.store;
    const now = performance.now();

    this.runtime.applyDamageToEntity(target, proj.damage, proj.ownerEntityId, now);
    target.hitRecoveryEndTime = now + 180;

    gameEventBus.emit('entity:damaged', { entityId: target.id, damage: proj.damage, isCrit: proj.isCrit, sourceId: proj.ownerEntityId });

    const isMvp = target.type === 'boss_mvp';
    const numColor = proj.isCrit ? '#fdeb3a' : (target.type === 'player' ? '#f43f5e' : '#38bdf8');
    const scaleFactor = proj.isCrit ? 1.5 : 1.0;

    this.onFloatingText(
      `${proj.isCrit ? '⭐ ' : ''}${Math.round(proj.damage)}`,
      numColor, scaleFactor,
      target.x, target.y + (isMvp ? 2.0 : 1.25), target.z
    );

    this.onScreenShake(proj.isCrit ? 0.32 : 0.08);
    gameAudio.playHit();

    store.updateTargetHp(target.currentHp);

    if (target.currentHp <= 0 && target.type !== 'player') {
      this.reapMonsterRewards(target);
    }
  }

  reapMonsterRewards(mob: Entity) {
    const store = this.context.store;
    const lootSystem = this.context.loot;
    mob.state = 'death';
    this.playerEntity.targetEntityId = null;
    store.setTarget(null);

    const expBase = mob.type === 'boss_mvp' ? 12000 : (mob.mobType === 'poring' ? 15 : mob.mobType === 'poporing' ? 45 : 120);
    const expJob = mob.type === 'boss_mvp' ? 9500 : (mob.mobType === 'poring' ? 12 : mob.mobType === 'poporing' ? 36 : 95);

    const curLevel = store.getStats().level;
    const curJobLvl = store.getStats().jobLevel;
    store.addExp(expBase, expJob);

    const updatedStats = store.getStats();
    const isLeveledUp = updatedStats.level > curLevel || updatedStats.jobLevel > curJobLvl;

    if (isLeveledUp) {
      gameAudio.playLevelUp();
      store.addCombatLog(`✨ ¡PROGRESO NIVEL UP! Has alcanzado Base: ${updatedStats.level} / Job: ${updatedStats.jobLevel} ✨`, 'system');
      this.onFloatingText('★ LEVEL UP ★', '#eab308', 2.2, this.playerEntity.x, 3.2, this.playerEntity.z);
      this.onEffectSpawn('level_up', this.playerEntity.x, this.playerEntity.z);

      this.playerEntity.currentHp = updatedStats.maxHp;
      this.playerEntity.currentSp = updatedStats.maxSp;
      gameEventBus.emit('entity:healed', { entityId: this.playerEntity.id, amount: updatedStats.maxHp });
      store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
    } else {
      store.addCombatLog(`Matas a [${mob.name}]. +${expBase} EXP base, +${expJob} EXP job.`, 'system');
    }

    // Drop items to ground
    const drops = this.getDropsForMob(mob);
    drops.forEach(drop => {
      lootSystem.dropItemFromMob(mob, drop.itemId, drop.name, drop.quantity);
      store.addCombatLog(`[Loot] ${drop.name} x${drop.quantity} cayó al suelo.`, 'loot');
    });

    const zenyDrop = mob.type === 'boss_mvp' ? 5000 : (mob.mobType === 'poring' ? 10 : mob.mobType === 'poporing' ? 25 : 100);
    store.addCombatLog(`[Zeny] +${zenyDrop}z`, 'loot');
  }

  private getDropsForMob(mob: Entity): { itemId: string; name: string; quantity: number }[] {
    const drops: { itemId: string; name: string; quantity: number }[] = [];
    
    if (mob.type === 'boss_mvp') {
      drops.push({ itemId: 'mvp_coin', name: 'MVP Coin', quantity: 1 });
      drops.push({ itemId: 'ragnarok_crown', name: 'Ragnarok Crown', quantity: 1 });
    } else if (mob.mobType === 'poring') {
      if (Math.random() < 0.5) drops.push({ itemId: 'jellopy', name: 'Jellopy', quantity: 1 });
      if (Math.random() < 0.3) drops.push({ itemId: 'red_potion', name: 'Red Potion', quantity: 1 });
    } else if (mob.mobType === 'poporing') {
      if (Math.random() < 0.4) drops.push({ itemId: 'jellopy', name: 'Jellopy', quantity: 1 });
      if (Math.random() < 0.3) drops.push({ itemId: 'sticky_mucus', name: 'Sticky Mucus', quantity: 1 });
      if (Math.random() < 0.2) drops.push({ itemId: 'red_potion', name: 'Red Potion', quantity: 1 });
    } else if (mob.mobType === 'pecopeco') {
      if (Math.random() < 0.3) drops.push({ itemId: 'empty_bottle', name: 'Empty Bottle', quantity: 1 });
      if (Math.random() < 0.2) drops.push({ itemId: 'orange_potion', name: 'Orange Potion', quantity: 1 });
    }

    return drops;
  }

}
