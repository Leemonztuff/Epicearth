import { Entity, Projectile, CharacterStats, HeadgearId, JobClass } from '../types';

// ============================================================================
// SERIALIZATION LAYER - Serialización de entidades para networking
// ============================================================================
// Convierte entidades a formato compacto para transport por red.
// Soporta: full snapshots, delta compression, y interpolación.
// ============================================================================

// --- FULL ENTITY SNAPSHOT (para sync inicial) ---

export interface EntitySnapshot {
  id: string;
  name: string;
  type: Entity['type'];
  job?: JobClass;
  mobType?: Entity['mobType'];
  npcType?: Entity['npcType'];
  x: number;
  y: number;
  z: number;
  facing: 'left' | 'right';
  state: Entity['state'];
  currentHp: number;
  currentSp: number;
  maxHp: number;
  maxSp: number;
  targetEntityId: string | null;
}

// --- DELTA SNAPSHOT (para updates incrementales) ---

export interface EntityDelta {
  id: string;
  x?: number;
  y?: number;
  z?: number;
  facing?: 'left' | 'right';
  state?: Entity['state'];
  currentHp?: number;
  currentSp?: number;
  targetEntityId?: string | null;
}

// --- WORLD SNAPSHOT (estado completo del mundo) ---

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  player: EntitySnapshot;
  monsters: EntitySnapshot[];
  npcs: EntitySnapshot[];
  projectiles: ProjectileSnapshot[];
}

// --- DELTA WORLD SNAPSHOT (cambios incrementales) ---

export interface WorldDelta {
  tick: number;
  timestamp: number;
  player?: EntityDelta;
  monsters?: EntityDelta[];
  npcs?: EntityDelta[];
  projectiles?: ProjectileSnapshot[];
  events?: WorldEvent[];
}

// --- PROJECTILE SNAPSHOT ---

export interface ProjectileSnapshot {
  id: string;
  type: Projectile['type'];
  x: number;
  y: number;
  z: number;
  targetEntityId: string;
  damage: number;
  isCrit: boolean;
}

// --- WORLD EVENT (para networking) ---

export type WorldEvent =
  | { type: 'entity_damaged'; entityId: string; damage: number; isCrit: boolean }
  | { type: 'entity_died'; entityId: string; killerId?: string }
  | { type: 'entity_spawned'; entityId: string }
  | { type: 'entity_despawned'; entityId: string }
  | { type: 'loot_dropped'; itemId: string; x: number; z: number; quantity: number }
  | { type: 'skill_cast'; skillId: string; casterId: string; targetId?: string }
  | { type: 'buff_applied'; entityId: string; buffId: string; durationMs: number }
  | { type: 'buff_expired'; entityId: string; buffId: string };

// ============================================================================
// SERIALIZER - Convierte entidades a snapshots
// ============================================================================

export class Serializer {
  // --- ENTITY SERIALIZATION ---

  static serializeEntity(entity: Entity): EntitySnapshot {
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      job: entity.job,
      mobType: entity.mobType,
      npcType: entity.npcType,
      x: entity.x,
      y: entity.y,
      z: entity.z,
      facing: entity.facing,
      state: entity.state,
      currentHp: entity.currentHp,
      currentSp: entity.currentSp,
      maxHp: entity.maxHp,
      maxSp: entity.maxSp,
      targetEntityId: entity.targetEntityId
    };
  }

  static deserializeEntity(snapshot: EntitySnapshot): Entity {
    return {
      ...snapshot,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };
  }

  // --- DELTA COMPUTATION ---

  static computeEntityDelta(prev: EntitySnapshot, next: EntitySnapshot): EntityDelta | null {
    const delta: EntityDelta = { id: next.id };
    let hasChanges = false;

    if (Math.abs(prev.x - next.x) > 0.001) { delta.x = next.x; hasChanges = true; }
    if (Math.abs(prev.y - next.y) > 0.001) { delta.y = next.y; hasChanges = true; }
    if (Math.abs(prev.z - next.z) > 0.001) { delta.z = next.z; hasChanges = true; }
    if (prev.facing !== next.facing) { delta.facing = next.facing; hasChanges = true; }
    if (prev.state !== next.state) { delta.state = next.state; hasChanges = true; }
    if (Math.abs(prev.currentHp - next.currentHp) > 0.1) { delta.currentHp = next.currentHp; hasChanges = true; }
    if (Math.abs(prev.currentSp - next.currentSp) > 0.1) { delta.currentSp = next.currentSp; hasChanges = true; }
    if (prev.targetEntityId !== next.targetEntityId) { delta.targetEntityId = next.targetEntityId; hasChanges = true; }

    return hasChanges ? delta : null;
  }

  static applyEntityDelta(entity: Entity, delta: EntityDelta): void {
    if (delta.x !== undefined) entity.x = delta.x;
    if (delta.y !== undefined) entity.y = delta.y;
    if (delta.z !== undefined) entity.z = delta.z;
    if (delta.facing !== undefined) entity.facing = delta.facing;
    if (delta.state !== undefined) entity.state = delta.state;
    if (delta.currentHp !== undefined) entity.currentHp = delta.currentHp;
    if (delta.currentSp !== undefined) entity.currentSp = delta.currentSp;
    if (delta.targetEntityId !== undefined) entity.targetEntityId = delta.targetEntityId;
  }

  // --- WORLD SNAPSHOT ---

  static serializeWorld(
    tick: number,
    player: Entity,
    monsters: Entity[],
    npcs: Entity[],
    projectiles: Projectile[]
  ): WorldSnapshot {
    return {
      tick,
      timestamp: Date.now(),
      player: this.serializeEntity(player),
      monsters: monsters.map(m => this.serializeEntity(m)),
      npcs: npcs.map(n => this.serializeEntity(n)),
      projectiles: projectiles.map(p => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        z: p.z,
        targetEntityId: p.targetEntityId,
        damage: p.damage,
        isCrit: p.isCrit
      }))
    };
  }

  static computeWorldDelta(prev: WorldSnapshot, next: WorldSnapshot): WorldDelta {
    const delta: WorldDelta = {
      tick: next.tick,
      timestamp: next.timestamp,
      events: []
    };

    // Player delta
    const playerDelta = this.computeEntityDelta(prev.player, next.player);
    if (playerDelta) delta.player = playerDelta;

    // Monster deltas
    const monsterDeltas: EntityDelta[] = [];
    for (const nextMonster of next.monsters) {
      const prevMonster = prev.monsters.find(m => m.id === nextMonster.id);
      if (prevMonster) {
        const monsterDelta = this.computeEntityDelta(prevMonster, nextMonster);
        if (monsterDelta) monsterDeltas.push(monsterDelta);
      } else {
        // New monster spawned
        delta.events?.push({ type: 'entity_spawned', entityId: nextMonster.id });
        monsterDeltas.push({ id: nextMonster.id, x: nextMonster.x, y: nextMonster.y, z: nextMonster.z });
      }
    }
    // Check for despawned monsters
    for (const prevMonster of prev.monsters) {
      if (!next.monsters.find(m => m.id === prevMonster.id)) {
        delta.events?.push({ type: 'entity_despawned', entityId: prevMonster.id });
      }
    }
    if (monsterDeltas.length > 0) delta.monsters = monsterDeltas;

    // Projectile changes
    if (prev.projectiles.length !== next.projectiles.length ||
        prev.projectiles.some((p, i) => !next.projectiles[i] || p.id !== next.projectiles[i].id)) {
      delta.projectiles = next.projectiles;
    }

    return delta;
  }

  // --- BINARY SERIALIZATION (para bandwidth mínimo) ---

  static encodeSnapshot(snapshot: WorldSnapshot): ArrayBuffer {
    const json = JSON.stringify(snapshot);
    return new TextEncoder().encode(json).buffer;
  }

  static decodeSnapshot(buffer: ArrayBuffer): WorldSnapshot {
    const json = new TextDecoder().decode(buffer);
    return JSON.parse(json);
  }

  static encodeDelta(delta: WorldDelta): ArrayBuffer {
    const json = JSON.stringify(delta);
    return new TextEncoder().encode(json).buffer;
  }

  static decodeDelta(buffer: ArrayBuffer): WorldDelta {
    const json = new TextDecoder().decode(buffer);
    return JSON.parse(json);
  }
}
