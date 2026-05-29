import { Entity, Projectile } from '../types';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// PROJECTILE SYSTEM - Física de proyectiles
// ============================================================================
// Extraído de worldRuntime.ts para separar responsabilidades.
// Maneja: movimiento de proyectiles, impacto, y limpieza.
// ============================================================================

export interface ProjectileSystemConfig {
  playerEntity: Entity;
  monsters: Entity[];
}

export class ProjectileSystem {
  private playerEntity: Entity;
  private monsters: Entity[];
  private projectiles: Projectile[] = [];

  constructor(config: ProjectileSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.monsters = config.monsters;
  }

  // --- PROJECTILE TICK ---

  tickProjectiles(dt: number): void {
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

      // Si el target ya no existe o está muerto, el proyectil cae
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
        gameEventBus.emit('entity:damaged', {
          entityId: target.id,
          damage: proj.damage,
          isCrit: proj.isCrit,
          sourceId: proj.ownerEntityId
        });
        this.projectiles.splice(i, 1);
      } else {
        // Mover proyectil hacia el target
        proj.x += (pdx / pdist) * speedScale;
        proj.y += (pdy / pdist) * speedScale;
        proj.z += (pdz / pdist) * speedScale;
      }
    }
  }

  // --- SPAWN PROJECTILE ---

  spawnProjectile(
    type: Projectile['type'],
    owner: Entity,
    target: Entity,
    damage: number,
    isCrit: boolean
  ): void {
    const proj: Projectile = {
      id: `proj_${Math.random()}_${Date.now()}`,
      type,
      x: owner.x,
      y: owner.y + 1.1,
      z: owner.z,
      speed: type === 'arrow' ? 0.38 : 0.28,
      targetEntityId: target.id,
      ownerEntityId: owner.id,
      damage,
      isCrit,
      spawnTime: Date.now(),
      height: 1.1
    };
    this.projectiles.push(proj);
  }

  // --- GETTERS ---

  getProjectiles(): Projectile[] {
    return this.projectiles;
  }

  getProjectileCount(): number {
    return this.projectiles.length;
  }

  // --- CLEANUP ---

  removeProjectile(id: string): void {
    const index = this.projectiles.findIndex(p => p.id === id);
    if (index !== -1) {
      this.projectiles.splice(index, 1);
    }
  }

  clear(): void {
    this.projectiles = [];
  }
}
