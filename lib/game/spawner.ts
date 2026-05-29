import { Entity, GroundItem, HeadgearId, JobClass } from './types';
import { useGameStore } from './state';

// ============================================================================
// SPAWNER - Generación de entidades del mundo
// ============================================================================

export class EntitySpawner {
  private static idCounter = 0;

  static nextId(prefix: string): string {
    return `${prefix}_${++this.idCounter}_${Date.now()}`;
  }

  static createPlayer(jobClass: JobClass): Entity {
    const store = useGameStore.getState();
    return {
      id: 'player_main',
      name: 'Rookie Hero',
      type: 'player',
      job: jobClass,
      currentHp: store.stats.maxHp,
      currentSp: store.stats.maxSp,
      maxHp: store.stats.maxHp,
      maxSp: store.stats.maxSp,
      facing: 'right',
      x: 0, y: 0, z: 0,
      state: 'idle',
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };
  }

  static createMonster(
    type: 'poring' | 'poporing' | 'pecopeco',
    index: number
  ): Entity {
    const configs = {
      poring: { name: 'Poring Pink', maxHp: 80, exp: 12, jobExp: 10, size: 1.0 },
      poporing: { name: 'Poporing Tox', maxHp: 190, exp: 35, jobExp: 28, size: 1.1 },
      pecopeco: { name: 'PecoPeco Runner', maxHp: 380, exp: 90, jobExp: 75, size: 1.3 }
    };

    const conf = configs[type];
    const theta = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 38;

    return {
      id: this.nextId(`mob_${type}_${index}`),
      name: conf.name,
      type: 'monster',
      mobType: type,
      x: Math.cos(theta) * r,
      y: 0,
      z: Math.sin(theta) * r,
      facing: Math.random() > 0.5 ? 'right' : 'left',
      state: 'idle',
      currentHp: conf.maxHp,
      currentSp: 10,
      maxHp: conf.maxHp,
      maxSp: 10,
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };
  }

  static createBoss(): Entity {
    return {
      id: this.nextId('baphomet_mvp'),
      name: 'BAPHOMET ★ MVP',
      type: 'boss_mvp',
      x: 18, y: 0, z: -18,
      facing: 'left',
      state: 'idle',
      currentHp: 8500,
      currentSp: 500,
      maxHp: 8500,
      maxSp: 500,
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };
  }

  static createNpc(
    type: 'kafra' | 'crusader_instructor',
    name: string,
    x: number,
    z: number
  ): Entity {
    return {
      id: this.nextId(`npc_${type}`),
      name,
      type: 'npc',
      npcType: type,
      x, y: 0, z,
      facing: 'right',
      state: 'idle',
      currentHp: 100, currentSp: 100,
      maxHp: 100, maxSp: 100,
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };
  }

  static createLootDrop(
    mob: Entity,
    isMvp: boolean
  ): GroundItem {
    return {
      id: this.nextId('loot'),
      name: isMvp ? 'MVP Coin' : (Math.random() > 0.4 ? 'Jellopy' : 'Sticky Mucus'),
      itemId: isMvp ? 'mvp_coin' : (Math.random() > 0.4 ? 'jellopy' : 'sticky_mucus'),
      x: mob.x, z: mob.z, y: 0.2,
      quantity: 1,
      velX: (Math.random() - 0.5) * 4.5,
      velY: 10 + Math.random() * 4.5,
      velZ: (Math.random() - 0.5) * 4.5,
      bounceCount: 0
    };
  }

  static spawnRoamers(count: number = 12): Entity[] {
    const mobs: Entity[] = [];
    const types: ('poring' | 'poporing' | 'pecopeco')[] = ['poring', 'poporing', 'pecopeco'];

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      mobs.push(this.createMonster(type, i));
    }

    return mobs;
  }

  static spawnNpcs(): Entity[] {
    return [
      this.createNpc('kafra', 'Kafra Assistant ★ Clarice', -5, 5),
      this.createNpc('crusader_instructor', 'Swordsman Instructor ★ Kurt', 5, -5)
    ];
  }

  static respawnMonster(deadMob: Entity): Entity {
    const theta = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 40;
    const maxHps: Record<string, number> = {
      poring: 80, poporing: 190, pecopeco: 380, boss_mvp: 8500
    };

    const mobType = deadMob.mobType || 'poring';
    const h = maxHps[mobType] || 100;
    const isMvp = deadMob.type === 'boss_mvp';

    return {
      ...deadMob,
      name: isMvp ? 'BAPHOMET ★ MVP' :
            mobType === 'poring' ? 'Poring Pink' :
            mobType === 'poporing' ? 'Poporing Tox' : 'PecoPeco Runner',
      type: isMvp ? 'boss_mvp' : 'monster',
      x: Math.cos(theta) * r,
      z: Math.sin(theta) * r,
      y: 0,
      facing: Math.random() > 0.5 ? 'right' : 'left',
      state: 'idle',
      currentHp: h,
      currentSp: 10,
      maxHp: h,
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };
  }
}
