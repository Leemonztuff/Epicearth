import { Entity, Projectile, GroundItem, JobClass, Skill } from './types';
import { useGameStore } from './state';
import { gameAudio } from './audio';

// ============================================================================
// WORLD RUNTIME - MOTOR DE SIMULACIÓN REALTIME
// ============================================================================
// Arquitectura de motor de videojuego, NO de aplicación web.
// Responsabilidades: registrar entidades, update loop, collision,
// AI, combat, spatial partitioning, entity lifecycle.
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
  private projectiles: Projectile[] = [];

  // Callbacks para efectos de audio/visual
  private onAudioTrigger?: (action: string) => void;

  constructor() {}

  // --- INICIALIZACIÓN ---
  init(playerEntity: Entity, monsters: Entity[], npcs: Entity[]) {
    this.playerEntity = playerEntity;
    this.monsters = monsters;
    this.npcs = npcs;

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

    // 4. Tick AI de monstruos
    this.tickMonsterAI(now, dt);

    // 5. Tick regeneración de HP/SP
    this.tickRegeneration(dt);

    // 6. Tick decay de buffs
    this.tickBuffDecay(dt);

    // 7. Tick proyectiles
    this.tickProjectiles(dt);

    // 8. Tick loot physics
    this.tickLootPhysics(dt);

    // 9. Auto-pickup de items
    this.tickLootPickup();

    // 10. Tick cooldowns generales
    this.tickCooldowns(dt);
  }

  // --- SPATIAL GRID REBUILD ---
  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    this.entityManager.getAll().forEach(e => {
      if (e.state !== 'death') this.spatialGrid.insert(e);
    });
  }

  // --- MONSTER AI ---
  private tickMonsterAI(now: number, dt: number) {
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
          // Atacar jugador
          this.monsterAttack(mob, now);
        } else {
          // Acercarse al jugador
          this.monsterChase(mob, dist, tickScale);
        }
      } else {
        // Wandering idle
        this.monsterWander(mob, tickScale);
      }
    });
  }

  private monsterAttack(mob: Entity, now: number) {
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
        this.emit({ type: 'entity_damaged', entityId: this.playerEntity.id, damage: 0, isCrit: false });
        store.addCombatLog(`[${mob.name}] te ataca y evades su golpe (FLEE).`, 'system');
      } else {
        const strikeAtk = isBoss ? 280 : (mob.mobType === 'pecopeco' ? 45 : 18);
        const randVariation = Math.floor((Math.random() - 0.5) * strikeAtk * 0.1);
        let rawDmg = strikeAtk + randVariation - (store.stats.def * 0.15);
        let finalDmg = Math.floor(Math.max(1, rawDmg));

        this.playerEntity.currentHp = Math.max(0, this.playerEntity.currentHp - finalDmg);
        this.playerEntity.state = 'hit';
        this.playerEntity.hitRecoveryEndTime = now + 240;

        this.emit({ type: 'entity_damaged', entityId: this.playerEntity.id, damage: finalDmg, isCrit: false });
        store.addCombatLog(`¡[${mob.name}] te propina un golpe brutal! Pierdes ${finalDmg} HP.`, 'player_hit');
        store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

        if (this.playerEntity.currentHp <= 0) {
          this.emit({ type: 'entity_died', entityId: this.playerEntity.id, killerId: mob.id });
        }
      }
    }
  }

  private monsterChase(mob: Entity, dist: number, tickScale: number) {
    if (mob.state !== 'attack' && mob.hitRecoveryEndTime < performance.now()) {
      mob.state = 'move';
    }
    const mSpeed = (mob.type === 'boss_mvp' ? 0.075 : 0.032) * tickScale;
    mob.facing = this.playerEntity.x > mob.x ? 'right' : 'left';

    const dx = this.playerEntity.x - mob.x;
    const dz = this.playerEntity.z - mob.z;
    mob.x += (dx / dist) * mSpeed;
    mob.z += (dz / dist) * mSpeed;
    mob.y = 0; // flat ground

    this.emit({ type: 'entity_moved', entityId: mob.id, x: mob.x, z: mob.z });
  }

  private monsterWander(mob: Entity, tickScale: number) {
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

  // --- REGENERACIÓN ---
  private tickRegeneration(dt: number) {
    if (this.playerEntity.state === 'death') return;
    const store = useGameStore.getState();
    const tickScale = dt * 60.0;

    const hpRegenRate = (0.04 + store.stats.vit * 0.011) * tickScale;
    this.playerEntity.currentHp = Math.min(this.playerEntity.maxHp, this.playerEntity.currentHp + hpRegenRate);

    const spRegenRate = (0.018 + store.stats.int * 0.006) * tickScale;
    this.playerEntity.currentSp = Math.min(this.playerEntity.maxSp, this.playerEntity.currentSp + spRegenRate);

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
  }

  // --- BUFF DECAY ---
  private tickBuffDecay(dt: number) {
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
        this.emit({ type: 'buff_expired', entityId: this.playerEntity.id, buffId: e.id });
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

  // --- PROYECTILES ---
  private tickProjectiles(dt: number) {
    const tickScale = dt * 60.0;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      let target: Entity | undefined;

      if (this.playerEntity.id === proj.targetEntityId) {
        target = this.playerEntity;
      } else {
        target = this.monsters.find(m => m.id === proj.targetEntityId);
      }

      const speedScale = proj.speed * tickScale;

      if (!target || target.currentHp <= 0 || target.state === 'death') {
        proj.y -= 0.15 * speedScale;
        if (proj.y <= 0) this.projectiles.splice(i, 1);
        continue;
      }

      const targetHeightOffset = target.type === 'boss_mvp' ? 1.6 : 0.85;
      const tY = target.y + targetHeightOffset;
      const pdx = target.x - proj.x;
      const pdy = tY - proj.y;
      const pdz = target.z - proj.z;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

      if (pdist < speedScale * 1.25) {
        // Impacto - emitir evento para que el combat system resuelva
        this.emit({ type: 'entity_damaged', entityId: target.id, damage: proj.damage, isCrit: proj.isCrit });
        this.projectiles.splice(i, 1);
      } else {
        proj.x += (pdx / pdist) * speedScale;
        proj.y += (pdy / pdist) * speedScale;
        proj.z += (pdz / pdist) * speedScale;
      }
    }
  }

  // --- LOOT PHYSICS ---
  private tickLootPhysics(dt: number) {
    const tickScale = dt * 60.0;

    this.groundItems.forEach(item => {
      if (item.velY !== undefined && item.velX !== undefined && item.velZ !== undefined) {
        const gravityAcc = -0.38;
        item.velY += gravityAcc * tickScale;
        item.x += item.velX * dt;
        item.y += item.velY * dt;
        item.z += item.velZ * dt;

        if (item.y <= 0.05) {
          item.y = 0.05;
          if (item.bounceCount !== undefined && item.bounceCount < 2) {
            item.velY = -item.velY * 0.45;
            item.velX *= 0.5;
            item.velZ *= 0.5;
            item.bounceCount++;
            this.onAudioTrigger?.('item_bounce');
          } else {
            item.velY = 0;
            item.velX = 0;
            item.velZ = 0;
          }
        }
      }
    });
  }

  // --- LOOT PICKUP ---
  private tickLootPickup() {
    const store = useGameStore.getState();

    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const item = this.groundItems[i];
      const dist = Math.sqrt(
        (item.x - this.playerEntity.x) ** 2 + (item.z - this.playerEntity.z) ** 2
      );

      if (dist < 1.35) {
        store.addCombatLog(`¡Has recogido [${item.name}] x${item.quantity}!`, 'loot');
        this.groundItems.splice(i, 1);
      }
    }
  }

  // --- COOLDOWNS ---
  private tickCooldowns(dt: number) {
    const store = useGameStore.getState();

    // Battle mode decay
    if (store.battleMode && performance.now() > (this as any).battleModeEndTime) {
      useGameStore.setState({ battleMode: false });
    }

    // Animation timers
    this.entityManager.getAll().forEach(e => {
      e.animationTimer += dt;
    });
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
  spawnProjectile(type: Projectile['type'], owner: Entity, target: Entity, damage: number, isCrit: boolean) {
    const proj: Projectile = {
      id: `proj_${Math.random()}_${Date.now()}`,
      type, x: owner.x, y: owner.y + 1.1, z: owner.z,
      speed: type === 'arrow' ? 0.38 : 0.28,
      targetEntityId: target.id, ownerEntityId: owner.id,
      damage, isCrit, spawnTime: Date.now(), height: 1.1
    };
    this.projectiles.push(proj);
  }

  addGroundItem(item: GroundItem) {
    this.groundItems.push(item);
    this.emit({ type: 'loot_dropped', itemId: item.itemId, x: item.x, z: item.z });
  }

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
      projectiles: this.projectiles.length,
      groundItems: this.groundItems.length,
      commandQueue: this.commandQueue.length
    };
  }
}
