import { Entity, Projectile, GroundItem, JobClass, Skill } from './types';
import { gameAudio } from './audio';
import { MonsterAI } from './server/MonsterAI';
import { RegenSystem } from './shared/RegenSystem';
import { ProjectileSystem } from './shared/ProjectileSystem';
import { CooldownSystem } from './shared/CooldownSystem';
import { BuffSystem } from './shared/BuffSystem';
import { LootSystem } from './shared/LootSystem';
import { gameEventBus } from './core/EventBus';
import { GameContext } from './core/GameContext';

// ============================================================================
// WORLD RUNTIME - MOTOR DE SIMULACIÓN REALTIME
// ============================================================================
// Arquitectura de motor de videojuego, NO de aplicación web.
// Responsabilidades: registrar entidades, update loop, collision,
// AI, combat, spatial partitioning, entity lifecycle.
//
// Sistemas delegados:
// - MonsterAI: IA de monstruos
// - RegenSystem: Regeneración HP/SP
// - ProjectileSystem: Física de proyectiles
// - CooldownSystem: Battle mode, animation timers
// - BuffSystem: Gestión de buffs
// - LootSystem: Física y pickup de loot
// ============================================================================

// --- COMMAND PATTERN (preparado para networking/multiplayer) ---
export interface WorldCommand {
  type: 'player_move' | 'use_skill' | 'use_item' | 'npc_interact' | 'respawn' | 'spawn_entity' | 'despawn_entity';
  payload: any;
  timestamp: number;
  sourceId?: string; // para networking: quién ejecutó
}

// --- EVENT SYSTEM (desacoplado, observer pattern) ---
export type WorldEvent =
  | { type: 'entity_spawned'; entityId: string }
  | { type: 'entity_despawned'; entityId: string }
  | { type: 'entity_damaged'; entityId: string; damage: number; isCrit: boolean }
  | { type: 'entity_healed'; entityId: string; amount: number }
  | { type: 'entity_died'; entityId: string; killerId?: string }
  | { type: 'entity_moved'; entityId: string; x: number; z: number }
  | { type: 'combat_start'; entityId: string; targetId: string }
  | { type: 'combat_end'; entityId: string }
  | { type: 'loot_dropped'; itemId: string; x: number; z: number }
  | { type: 'level_up'; entityId: string; newLevel: number }
  | { type: 'buff_applied'; entityId: string; buffId: string }
  | { type: 'buff_expired'; entityId: string; buffId: string };

export type WorldEventHandler = (event: WorldEvent) => void;

// --- SPATIAL GRID (partición espacial uniforme, O(1) lookup) ---
export class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, Set<Entity>>;

  constructor(cellSize: number = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() { this.cells.clear(); }

  insert(entity: Entity) {
    const key = this.getKey(entity.x, entity.z);
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key)!.add(entity);
  }

  remove(entity: Entity): boolean {
    const key = this.getKey(entity.x, entity.z);
    const cell = this.cells.get(key);
    if (cell) {
      const deleted = cell.delete(entity);
      if (cell.size === 0) this.cells.delete(key);
      return deleted;
    }
    return false;
  }

  updateEntity(entity: Entity, oldX: number, oldZ: number) {
    const oldKey = this.getKey(oldX, oldZ);
    const newKey = this.getKey(entity.x, entity.z);
    if (oldKey !== newKey) {
      const oldCell = this.cells.get(oldKey);
      if (oldCell) {
        oldCell.delete(entity);
        if (oldCell.size === 0) this.cells.delete(oldKey);
      }
      if (!this.cells.has(newKey)) this.cells.set(newKey, new Set());
      this.cells.get(newKey)!.add(entity);
    }
  }

  queryRadius(cx: number, cz: number, radius: number): Entity[] {
    const result: Entity[] = [];
    const minCX = Math.floor((cx - radius) / this.cellSize);
    const maxCX = Math.floor((cx + radius) / this.cellSize);
    const minCZ = Math.floor((cz - radius) / this.cellSize);
    const maxCZ = Math.floor((cz + radius) / this.cellSize);
    const r2 = radius * radius;

    for (let ix = minCX; ix <= maxCX; ix++) {
      for (let iz = minCZ; iz <= maxCZ; iz++) {
        const cell = this.cells.get(`${ix},${iz}`);
        if (!cell) continue;
        const entities = Array.from(cell);
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          const dx = e.x - cx;
          const dz = e.z - cz;
          if (dx * dx + dz * dz <= r2) result.push(e);
        }
      }
    }
    return result;
  }

  queryRect(x1: number, z1: number, x2: number, z2: number): Entity[] {
    const result: Entity[] = [];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    const minCX = Math.floor(minX / this.cellSize);
    const maxCX = Math.floor(maxX / this.cellSize);
    const minCZ = Math.floor(minZ / this.cellSize);
    const maxCZ = Math.floor(maxZ / this.cellSize);

    for (let ix = minCX; ix <= maxCX; ix++) {
      for (let iz = minCZ; iz <= maxCZ; iz++) {
        const cell = this.cells.get(`${ix},${iz}`);
        if (!cell) continue;
        const entities = Array.from(cell);
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (e.x >= minX && e.x <= maxX && e.z >= minZ && e.z <= maxZ) {
            result.push(e);
          }
        }
      }
    }
    return result;
  }

  getNeighbors(entity: Entity, radius: number): Entity[] {
    return this.queryRadius(entity.x, entity.z, radius).filter(e => e.id !== entity.id);
  }

  private getKey(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }

  getStats() {
    let totalEntities = 0;
    this.cells.forEach(cell => { totalEntities += cell.size; });
    return { cells: this.cells.size, entities: totalEntities };
  }
}

// --- ENTITY LIFECYCLE MANAGER ---
export class EntityManager {
  private entities = new Map<string, Entity>();
  private pendingAdd: Entity[] = [];
  private pendingRemove: string[] = [];

  add(entity: Entity) {
    this.pendingAdd.push(entity);
  }

  remove(entityId: string) {
    this.pendingRemove.push(entityId);
  }

  get(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  getAll(): Entity[] {
    return Array.from(this.entities.values());
  }

  getByType(type: Entity['type']): Entity[] {
    return this.getAll().filter(e => e.type === type);
  }

  getAlive(): Entity[] {
    return this.getAll().filter(e => e.currentHp > 0 && e.state !== 'death');
  }

  /** Aplica cambios pendientes al inicio del frame */
  flush() {
    for (const entity of this.pendingAdd) {
      this.entities.set(entity.id, entity);
    }
    for (const id of this.pendingRemove) {
      this.entities.delete(id);
    }
    this.pendingAdd = [];
    this.pendingRemove = [];
  }

  clear() { this.entities.clear(); this.pendingAdd = []; this.pendingRemove = []; }
  get count() { return this.entities.size; }
}

// --- WORLD RUNTIME (núcleo del motor) ---
export class WorldRuntime {
  // Core systems
  private spatialGrid = new SpatialGrid(8);
  private entityManager = new EntityManager();
  private commandQueue: WorldCommand[] = [];
  private eventHandlers: WorldEventHandler[] = [];

  // Sub-systems (delegated)
  private monsterAI: MonsterAI | null = null;
  private regenSystem: RegenSystem | null = null;
  private projectileSystem: ProjectileSystem | null = null;
  private cooldownSystem: CooldownSystem | null = null;
  private buffSystem: BuffSystem | null = null;
  private lootSystem: LootSystem | null = null;

  // Simulation state
  private isRunning = false;
  private tickCount = 0;
  private accumulator = 0;
  private readonly fixedTimeStep = 1 / 60; // 60Hz simulation

  // References to game systems (inyectados desde engine)
  private playerEntity!: Entity;
  private monsters: Entity[] = [];
  private npcs: Entity[] = [];
  private groundItems: GroundItem[] = [];

  // Game context for dependency injection
  private context: GameContext;

  // Callbacks para efectos de audio/visual
  private onAudioTrigger?: (action: string) => void;

  constructor(context: GameContext) {
    this.context = context;
  }

  // --- INICIALIZACIÓN ---
  init(playerEntity: Entity, monsters: Entity[], npcs: Entity[]) {
    this.playerEntity = playerEntity;
    this.monsters = monsters;
    this.npcs = npcs;

    // Initialize sub-systems with context
    this.monsterAI = new MonsterAI({ playerEntity, monsters, context: this.context });
    this.regenSystem = new RegenSystem({ playerEntity, context: this.context });
    this.projectileSystem = new ProjectileSystem({ playerEntity, monsters });
    this.cooldownSystem = new CooldownSystem({
      playerEntity,
      entities: [playerEntity, ...monsters, ...npcs],
      context: this.context
    });
    this.buffSystem = new BuffSystem({ playerEntity, context: this.context });
    this.lootSystem = new LootSystem({ playerEntity, groundItems: this.groundItems, context: this.context });

    // Registrar todas las entidades iniciales
    this.entityManager.add(playerEntity);
    monsters.forEach(m => this.entityManager.add(m));
    npcs.forEach(n => this.entityManager.add(n));

    this.rebuildSpatialGrid();
    this.isRunning = true;
  }

  setCallbacks(callbacks: { onAudioTrigger?: (action: string) => void }) {
    this.onAudioTrigger = callbacks.onAudioTrigger;
  }

  // --- EVENT SYSTEM ---
  onEvent(handler: WorldEventHandler) {
    this.eventHandlers.push(handler);
  }

  private emit(event: WorldEvent) {
    this.eventHandlers.forEach(h => h(event));
  }

  // --- COMMAND QUEUE (preparado para multiplayer) ---
  enqueueCommand(cmd: Omit<WorldCommand, 'timestamp'>) {
    this.commandQueue.push({ ...cmd, timestamp: performance.now() });
  }

  private processCommands() {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;
      this.executeCommand(cmd);
    }
  }

  private executeCommand(cmd: WorldCommand) {
    switch (cmd.type) {
      case 'respawn':
        this.emit({ type: 'entity_spawned', entityId: cmd.payload.entityId });
        break;
      case 'spawn_entity':
        if (cmd.payload.entity) this.entityManager.add(cmd.payload.entity);
        break;
      case 'despawn_entity':
        this.entityManager.remove(cmd.payload.entityId);
        break;
    }
  }

  // --- UPDATE LOOP (motor central) ---
  update(dt: number, now: number) {
    if (!this.isRunning) return;

    this.accumulator += dt;

    while (this.accumulator >= this.fixedTimeStep) {
      this.fixedTick(now, this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
    }

    this.tickCount++;
  }

  private fixedTick(now: number, dt: number) {
    // 1. Flush entity lifecycle changes
    this.entityManager.flush();

    // 2. Process command queue
    this.processCommands();

    // 3. Rebuild spatial grid cada N frames para performance
    if (this.tickCount % 3 === 0) {
      this.rebuildSpatialGrid();
    }

    // 4. Tick AI de monstruos (delegated to MonsterAI)
    if (this.monsterAI) {
      this.monsterAI.tickMonsterAI(now, dt);
    }

    // 5. Tick regeneración de HP/SP (delegated to RegenSystem)
    if (this.regenSystem) {
      this.regenSystem.tickRegeneration(dt);
    }

    // 6. Tick proyectiles (delegated to ProjectileSystem)
    if (this.projectileSystem) {
      this.projectileSystem.tickProjectiles(dt);
    }

    // 7. Tick cooldowns (delegated to CooldownSystem)
    if (this.cooldownSystem) {
      this.cooldownSystem.tickCooldowns(dt);
    }

    // 8. Tick buff decay (delegated to BuffSystem)
    if (this.buffSystem) {
      this.buffSystem.tickBuffDecay(dt);
    }

    // 9. Tick loot physics (delegated to LootSystem)
    if (this.lootSystem) {
      this.lootSystem.tickLootPhysics(dt);
      this.lootSystem.tickLootPickup();
    }
  }

  // --- SPATIAL GRID REBUILD ---
  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    this.entityManager.getAll().forEach(e => {
      if (e.state !== 'death') this.spatialGrid.insert(e);
    });
  }

  // --- PUBLIC SETTERS ---
  setBattleModeEndTime(endTime: number) {
    this.cooldownSystem?.setBattleModeEndTime(endTime);
  }

  // --- PROJECTILE DELEGATION ---
  spawnProjectile(type: Projectile['type'], owner: Entity, target: Entity, damage: number, isCrit: boolean) {
    this.projectileSystem?.spawnProjectile(type, owner, target, damage, isCrit);
  }

  getProjectiles(): Projectile[] {
    return this.projectileSystem?.getProjectiles() || [];
  }

  // --- BUFF DELEGATION ---
  applyBuff(
    buffId: string,
    buffName: string,
    durationMs: number,
    icon: string,
    description: string,
    statModifiers: Partial<{ agi: number; str: number; int: number; dex: number }>
  ) {
    this.buffSystem?.applyBuff(buffId, buffName, durationMs, icon, description, statModifiers);
  }

  removeBuff(buffId: string) {
    this.buffSystem?.removeBuff(buffId);
  }

  hasBuff(buffId: string): boolean {
    return this.buffSystem?.hasBuff(buffId) || false;
  }

  // --- LOOT DELEGATION ---
  addGroundItem(item: GroundItem) {
    this.lootSystem?.addGroundItem(item);
  }

  getGroundItems(): GroundItem[] {
    return this.lootSystem?.getGroundItems() || [];
  }

  // --- QUERIES PÚBLICOS ---
  getEntitiesInRange(x: number, z: number, radius: number): Entity[] {
    return this.spatialGrid.queryRadius(x, z, radius);
  }

  getEntitiesInRect(x1: number, z1: number, x2: number, z2: number): Entity[] {
    return this.spatialGrid.queryRect(x1, z1, x2, z2);
  }

  getNearbyEnemies(x: number, z: number, radius: number): Entity[] {
    return this.getEntitiesInRange(x, z, radius).filter(
      e => e.type === 'monster' || e.type === 'boss_mvp'
    );
  }

  getNearbyAllies(x: number, z: number, radius: number): Entity[] {
    return this.getEntitiesInRange(x, z, radius).filter(
      e => e.type === 'npc' || e.type === 'player'
    );
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entityManager.get(entityId);
  }

  // --- LIFECYCLE ---

  destroy() {
    this.isRunning = false;
    this.entityManager.clear();
    this.spatialGrid.clear();
    this.commandQueue = [];
    this.eventHandlers = [];
  }

  // --- DEBUG ---
  getDebugInfo() {
    return {
      tickCount: this.tickCount,
      entities: this.entityManager.count,
      spatialGrid: this.spatialGrid.getStats(),
      projectiles: this.projectileSystem?.getProjectileCount() || 0,
      groundItems: this.groundItems.length,
      commandQueue: this.commandQueue.length
    };
  }
}
