import { Entity, Projectile, GroundItem, JobClass, Skill } from './types';
import { useGameStore } from './state';
import { gameAudio } from './audio';

// Command pattern definitions for modularity and multiplayer networking preparedness
export interface WorldCommand {
  type: 'player_move' | 'use_skill' | 'use_item' | 'npc_interact' | 'respawn';
  payload: any;
}

/**
 * 1. HIGH-PERFORMANCE UNIFORM GRID STATIC/DYNAMIC SPATIAL PARTITIONING
 * Divides the (x, z) coordinate plane into 8x8 meter bucketing sectors.
 * Greatly reduces expensive broad-phase search complexity from O(N^2) to near O(1) inside active areas,
 * directly targeting mobile browser processor budget savings.
 */
export class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, Set<Entity>>;

  constructor(cellSize: number = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  private getCellKey(x: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cz}`;
  }

  // Clear all cell registers
  public clear() {
    this.cells.clear();
  }

  // Register an active entity into the grid indexes
  public insert(entity: Entity) {
    const key = this.getCellKey(entity.x, entity.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(entity);
  }

  // Desynchronize an entity's position from the grid
  public remove(entity: Entity): boolean {
    const key = this.getCellKey(entity.x, entity.z);
    const cell = this.cells.get(key);
    if (cell) {
      const deleted = cell.delete(entity);
      if (cell.size === 0) {
        this.cells.delete(key);
      }
      return deleted;
    }
    return false;
  }

  // Highly optimal cell traversal when coordinates change
  public updateEntityPosition(entity: Entity, oldX: number, oldZ: number) {
    const oldKey = this.getCellKey(oldX, oldZ);
    const newKey = this.getCellKey(entity.x, entity.z);

    if (oldKey !== newKey) {
      const oldCell = this.cells.get(oldKey);
      if (oldCell) {
        oldCell.delete(entity);
        if (oldCell.size === 0) this.cells.delete(oldKey);
      }
      if (!this.cells.has(newKey)) {
        this.cells.set(newKey, new Set());
      }
      this.cells.get(newKey)!.add(entity);
    }
  }

  // Queries all entities situated within a query radius
  public queryRadius(centerX: number, centerZ: number, radius: number): Entity[] {
    const result: Entity[] = [];
    const minCellX = Math.floor((centerX - radius) / this.cellSize);
    const maxCellX = Math.floor((centerX + radius) / this.cellSize);
    const minCellZ = Math.floor((centerZ - radius) / this.cellSize);
    const maxCellZ = Math.floor((centerZ + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = `${cx},${cz}`;
        const cell = this.cells.get(key);
        if (cell) {
          cell.forEach(entity => {
            const dx = entity.x - centerX;
            const dz = entity.z - centerZ;
            const distSq = dx * dx + dz * dz;
            if (distSq <= radius * radius) {
              result.push(entity);
            }
          });
        }
      }
    }
    return result;
  }
}

/**
 * 2. MODULAR WORLD RUNTIME ENGINE SIMULATION CLASS
 * Orchestrates complete physics, path tracking, AI behaviors, entity lifecycles, and combat.
 * Completely detached from Three.js graphics to maintain architectural integrity and networking flexibility.
 */
export class WorldRuntime {
  public entities: Map<string, Entity> = new Map();
  public projectiles: Projectile[] = [];
  public groundItems: GroundItem[] = [];
  
  // High performance spatial broadcaster
  public grid: SpatialGrid = new SpatialGrid(6);

  // Command buffer queue (Multiplayer/Command execution framework)
  private commandQueue: WorldCommand[] = [];

  // Callbacks for hooks out to the renderer (decoupled visualization)
  private onEntitySpawn: ((entity: Entity) => void) | null = null;
  private onEntityDespawn: ((entityId: string) => void) | null = null;
  private onCombatHit: ((attacker: Entity, target: Entity, dmg: number, isCrit: boolean, skillName?: string) => void) | null = null;
  private onLootDrop: ((item: GroundItem) => void) | null = null;
  private onAudioTrigger: ((action: string) => void) | null = null;

  constructor() {}

  // Set visual callback hooks
  public setCallbacks(hooks: {
    onEntitySpawn?: (entity: Entity) => void;
    onEntityDespawn?: (entityId: string) => void;
    onCombatHit?: (attacker: Entity, target: Entity, dmg: number, isCrit: boolean, skillName?: string) => void;
    onLootDrop?: (item: GroundItem) => void;
    onAudioTrigger?: (action: string) => void;
  }) {
    if (hooks.onEntitySpawn) this.onEntitySpawn = hooks.onEntitySpawn;
    if (hooks.onEntityDespawn) this.onEntityDespawn = hooks.onEntityDespawn;
    if (hooks.onCombatHit) this.onCombatHit = hooks.onCombatHit;
    if (hooks.onLootDrop) this.onLootDrop = hooks.onLootDrop;
    if (hooks.onAudioTrigger) this.onAudioTrigger = hooks.onAudioTrigger;
  }

  // --- ENTITY LIFECYCLE MANAGEMENT ---
  
  public getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  public getPlayer(): Entity | undefined {
    return this.getEntity('player_main');
  }

  public registerEntity(entity: Entity) {
    this.entities.set(entity.id, entity);
    this.grid.insert(entity);
    if (this.onEntitySpawn) {
      this.onEntitySpawn(entity);
    }
  }

  public deregisterEntity(id: string) {
    const entity = this.entities.get(id);
    if (entity) {
      this.grid.remove(entity);
      this.entities.delete(id);
      if (this.onEntityDespawn) {
        this.onEntityDespawn(id);
      }
    }
  }

  public clearAll() {
    this.entities.clear();
    this.projectiles = [];
    this.groundItems = [];
    this.grid.clear();
  }

  // --- ENQUEUE COMMANDS ---
  public enqueueCommand(cmd: WorldCommand) {
    this.commandQueue.push(cmd);
  }

  // --- MAIN LOOP UPDATE SIMULATION ---
  public update(dt: number, now: number) {
    // 1. Flush and execute commands sent to the runtime
    this.processCommandQueue(now);

    // 2. Clear out completely dissolved/decayed remnants
    this.reapDecayedEntities(now);

    // 3. Update spatial references of active bodies
    this.synchronizeGrid();

    // 4. Circular Collision Pushback (Resolving model crowd overlapping)
    this.resolvePhysicalOverlaps(dt);

    // 5. Run AI Decision trees (Sensors -> Behavior Trees for roamers)
    this.tickAI(now, dt);

    // 6. Projectiles Flight physics simulation and impact triggers
    this.tickProjectiles(dt);

    // 7. Ground items bouncing and loot pickups
    this.tickGroundItems(dt);
  }

  // --- PROCESS INCOMING ACTION PACKETS ---
  private processCommandQueue(now: number) {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;
      switch (cmd.type) {
        case 'player_move': {
          const player = this.getPlayer();
          if (player && player.state !== 'death') {
            player.targetX = cmd.payload.x;
            player.targetZ = cmd.payload.z;
            player.state = 'move';
          }
          break;
        }
        case 'respawn': {
          const player = this.getPlayer();
          if (player) {
            player.state = 'idle';
            player.x = 0;
            player.z = 0;
            player.currentHp = player.maxHp;
            player.currentSp = player.maxSp;
            player.targetEntityId = null;
            player.targetX = undefined;
            player.targetZ = undefined;
          }
          break;
        }
        // Easy expansion for multiplayer action validation goes here...
      }
    }
  }

  // --- COMPACT SPATIAL GRID ALIGNMENT ---
  private synchronizeGrid() {
    Array.from(this.entities.values()).forEach(entity => {
      if (entity.state === 'death') return;
      
      const lastX = (entity as any)._lastGridX ?? entity.x;
      const lastZ = (entity as any)._lastGridZ ?? entity.z;

      if (lastX !== entity.x || lastZ !== entity.z) {
        this.grid.updateEntityPosition(entity, lastX, lastZ);
        (entity as any)._lastGridX = entity.x;
        (entity as any)._lastGridZ = entity.z;
      }
    });
  }

  /**
   * 3. REALTIME CIRCULAR PENETRATION RESOLVER
   * Resolves physical collision intersections between roamers and local bodies.
   * Creates a highly organic crowding feedback where monsters bounce off and slide next to one another.
   */
  private resolvePhysicalOverlaps(dt: number) {
    const list = Array.from(this.entities.values()).filter(e => e.state !== 'death');
    const radius = 0.65; // physical envelope threshold
    const pushForce = 0.55 * (dt * 60.0);

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        
        // NPC entities are physically locked solid static anchors
        if (a.type === 'npc' && b.type === 'npc') continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;
        const minDist = a.type === 'boss_mvp' || b.type === 'boss_mvp' ? 1.85 : (radius * 2);

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;

          // Unit vectors
          const ux = dx / dist;
          const uz = dz / dist;

          // Push them apart gently
          const pushDistance = overlap * pushForce * 0.45;
          
          if (a.type !== 'npc') {
            a.x -= ux * pushDistance;
            a.z -= uz * pushDistance;
          }
          if (b.type !== 'npc') {
            b.x += ux * pushDistance;
            b.z += uz * pushDistance;
          }
        }
      }
    }
  }

  /**
   * 4. DECUPLED MODULAR AI STATE MACHINERY
   * Sensors scan radial grids around monsters. Players are locked on and pursued if close,
   * otherwise roamers slide into an idle-walk randomized pacing state.
   */
  private tickAI(now: number, dt: number) {
    const player = this.getPlayer();
    const tickScale = dt * 60.0;

    Array.from(this.entities.values()).forEach(mob => {
      if (mob.type !== 'monster' && mob.type !== 'boss_mvp') return;
      if (mob.state === 'death') return;

      const isStunned = mob.hitRecoveryEndTime > now;
      if (isStunned) return; // Hit recovery interrupt

      // AI Scanner: detect nearby targeted players (Alert range: MVP 15m, minions 8m)
      const alertRange = mob.type === 'boss_mvp' ? 15 : 8;
      
      if (player && player.state !== 'death') {
        const dx = player.x - mob.x;
        const dz = player.z - mob.z;
        const pDist = Math.sqrt(dx * dx + dz * dz);

        // Retaliation check or direct aggression within scanning sweep
        const isAggro = mob.targetEntityId === player.id || pDist <= alertRange;

        if (isAggro) {
          mob.targetEntityId = player.id;
          
          const attackReach = mob.type === 'boss_mvp' ? 2.5 : 1.35;
          if (pDist <= attackReach) {
            // Within striking parameters: activate real-time combat tick
            mob.state = 'attack';
            mob.targetX = undefined;
            mob.targetZ = undefined;
            mob.facing = dx > 0 ? 'right' : 'left';
          } else {
            // Out of range: Pathfind direct approach coordinates
            mob.state = 'move';
            mob.targetX = player.x;
            mob.targetZ = player.z;

            // Step translation
            mob.facing = dx > 0 ? 'right' : 'left';
            const mSpeed = (mob.type === 'boss_mvp' ? 0.055 : 0.034) * tickScale;
            mob.x += (dx / pDist) * mSpeed;
            mob.z += (dz / pDist) * mSpeed;
          }
          return; // Bypasses default lazy roaming routines
        }
      }

      // Lazy Roaming: Monster slides into a classic slow periodic wander if unprovoked
      const randVal = Math.random();
      const wanderTrigger = 0.008 * tickScale;

      if (randVal < wanderTrigger) {
        mob.state = 'move';
        mob.targetX = mob.x + (Math.random() - 0.5) * 12;
        mob.targetZ = mob.targetZ = mob.z + (Math.random() - 0.5) * 12;
      }

      // Walk toward wander target
      if (mob.state === 'move' && mob.targetX !== undefined && mob.targetZ !== undefined) {
        const mdx = mob.targetX - mob.x;
        const mdz = mob.targetZ - mob.z;
        const mdist = Math.sqrt(mdx * mdx + mdz * mdz);

        if (mdist > 0.4) {
          mob.facing = mdx > 0 ? 'right' : 'left';
          const walkSpeed = 0.015 * tickScale;
          mob.x += (mdx / mdist) * walkSpeed;
          mob.z += (mdz / mdist) * walkSpeed;
        } else {
          mob.state = 'idle';
          mob.targetX = undefined;
          mob.targetZ = undefined;
        }
      }
    });
  }

  // --- PROJECTILES TICK ENGINE ---
  private tickProjectiles(dt: number) {
    const tickScale = dt * 60.0;
    
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const target = this.entities.get(proj.targetEntityId);
      const speedScale = proj.speed * tickScale;

      if (!target || target.currentHp <= 0 || target.state === 'death') {
        proj.y -= 0.16 * speedScale;
        if (proj.y <= 0) {
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      const reachOffset = target.type === 'boss_mvp' ? 1.6 : 0.85;
      const tY = target.y + reachOffset;
      const pdx = target.x - proj.x;
      const pdy = tY - proj.y;
      const pdz = target.z - proj.z;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

      if (pdist < speedScale * 1.35) {
        // Projectile hit resolves
        this.projectiles.splice(i, 1);
        this.applyTerminalDmg(proj, target);
      } else {
        proj.x += (pdx / pdist) * speedScale;
        proj.y += (pdy / pdist) * speedScale;
        proj.z += (pdz / pdist) * speedScale;
      }
    }
  }

  // Apply terminal projectile calculations
  private applyTerminalDmg(proj: Projectile, target: Entity) {
    const attacker = this.entities.get(proj.ownerEntityId);
    if (!attacker) return;

    target.currentHp = Math.max(0, target.currentHp - proj.damage);
    target.state = 'hit';
    target.hitRecoveryEndTime = performance.now() + 250;

    if (this.onCombatHit) {
      this.onCombatHit(attacker, target, proj.damage, proj.isCrit);
    }
  }

  // --- LOOT BOUNCES AND PICKUPS ---
  private tickGroundItems(dt: number) {
    const player = this.getPlayer();
    const tickScale = dt * 60.0;

    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const item = this.groundItems[i];

      // Physical bouncing trajectory maths
      if (item.velY !== undefined && item.velX !== undefined && item.velZ !== undefined) {
        const gravity = -0.38;
        item.velY += gravity * tickScale;

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
            if (this.onAudioTrigger) this.onAudioTrigger('item_bounce');
          } else {
            item.velY = 0;
            item.velX = 0;
            item.velZ = 0;
          }
        }
      }

      // Auto looting pickup radius detect
      if (player && player.state !== 'death') {
        const dist = Math.sqrt((item.x - player.x) ** 2 + (item.z - player.z) ** 2);
        if (dist < 1.35) {
          this.groundItems.splice(i, 1);
          if (this.onLootDrop) {
            this.onLootDrop(item);
          }
        }
      }
    }
  }

  // --- DISMISS DEAD MONSTERS AFTER DISSOLVING LAPSES ---
  private reapDecayedEntities(now: number) {
    Array.from(this.entities.values()).forEach(entity => {
      if (entity.type === 'player' || entity.type === 'npc') return;
      
      if (entity.state === 'death') {
        if (!(entity as any)._deathTimeStamp) {
          (entity as any)._deathTimeStamp = now;
        }

        const elapsedSinceDeath = now - (entity as any)._deathTimeStamp;
        if (elapsedSinceDeath > 1800) { // 1.8 seconds decay and register wipeout
          this.deregisterEntity(entity.id);
        }
      }
    });
  }
}
