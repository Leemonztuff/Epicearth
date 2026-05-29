import { Entity } from '../types';
import { useGameStore } from '../state';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// MONSTER AI - Sistema de inteligencia artificial para monstruos
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: persecución, ataque, wandering, y comportamiento agresivo.
// ============================================================================

export interface MonsterAIConfig {
  playerEntity: Entity;
  monsters: Entity[];
}

export class MonsterAI {
  private playerEntity: Entity;
  private monsters: Entity[];

  constructor(config: MonsterAIConfig) {
    this.playerEntity = config.playerEntity;
    this.monsters = config.monsters;
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
      const store = useGameStore.getState();
      const hitScore = 150 + (isBoss ? 120 : 15);
      const fleeScore = store.stats.flee;
      const dodgePercent = Math.min(0.95, Math.max(0.05, (fleeScore - hitScore + 100) / 100));
      const playerEvaded = Math.random() < dodgePercent;

      if (playerEvaded) {
        gameEventBus.emit('entity:damaged', { entityId: this.playerEntity.id, damage: 0, isCrit: false });
        store.addCombatLog(`[${mob.name}] te ataca y evades su golpe (FLEE).`, 'system');
      } else {
        const strikeAtk = isBoss ? 280 : (mob.mobType === 'pecopeco' ? 45 : 18);
        const randVariation = Math.floor((Math.random() - 0.5) * strikeAtk * 0.1);
        let rawDmg = strikeAtk + randVariation - (store.stats.def * 0.15);
        let finalDmg = Math.floor(Math.max(1, rawDmg));

        this.playerEntity.currentHp = Math.max(0, this.playerEntity.currentHp - finalDmg);
        this.playerEntity.state = 'hit';
        this.playerEntity.hitRecoveryEndTime = now + 240;

        gameEventBus.emit('entity:damaged', { entityId: this.playerEntity.id, damage: finalDmg, isCrit: false });
        store.addCombatLog(`¡[${mob.name}] te propina un golpe brutal! Pierdes ${finalDmg} HP.`, 'player_hit');
        store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

        if (this.playerEntity.currentHp <= 0) {
          gameEventBus.emit('entity:died', { entityId: this.playerEntity.id, killerId: mob.id });
        }
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
