import * as THREE from 'three';
import { Entity, Projectile, HeadgearId } from '../types';
import { GameRenderer } from '../renderer';
import { EffectsSystem } from '../effects';

// ============================================================================
// RENDERER BRIDGE - Conexión entre lógica del juego y rendering
// ============================================================================
// Separa la lógica del juego del rendering Three.js.
// Solo OBSERVA el state, nunca lo muta.
// En el futuro, este bridge se convertirá en el NetworkStateReceiver.
// ============================================================================

export interface RendererBridgeConfig {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export class RendererBridge {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private gameRenderer: GameRenderer;
  private effectsSystem: EffectsSystem;

  // Visual state (solo para rendering, no para lógica)
  private entityMeshes: Record<string, THREE.Sprite> = {};
  private groundItemMeshes: Record<string, THREE.Mesh> = {};
  private projectileMeshes: Record<string, THREE.Object3D> = {};

  constructor(config: RendererBridgeConfig) {
    this.scene = config.scene;
    this.camera = config.camera;
    this.renderer = config.renderer;
    this.gameRenderer = new GameRenderer(this.scene);
    this.effectsSystem = new EffectsSystem(this.scene);
  }

  // --- INITIALIZATION ---

  initGroundMap(): void {
    this.gameRenderer.createGroundMap();
  }

  setEffectsMeshSpawners(): void {
    this.effectsSystem.setMeshSpawners({
      spawnEffectMesh: (type, x, z, scale) => this.gameRenderer.createSkillVisualMesh(type, x, z, scale),
      spawnTouchMesh: (data) => this.gameRenderer.spawnTouchIndicator(data)
    });
  }

  // --- ENTITY BILLBOARD RENDERING ---

  updateEntityBillboard(entity: Entity, headgear: HeadgearId): void {
    let sprite = this.entityMeshes[entity.id];

    if (!sprite) {
      const tex = this.gameRenderer.createEntityTexture(entity, headgear);
      if (!tex) return;

      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, shadowSide: THREE.DoubleSide });
      sprite = new THREE.Sprite(mat);

      const isBoss = entity.type === 'boss_mvp';
      const scaleFactor = isBoss ? 4.9 : (entity.mobType === 'pecopeco' ? 2.5 : (entity.mobType ? 1.8 : 2.5));
      sprite.scale.set(scaleFactor, scaleFactor, 1);

      this.scene.add(sprite);
      this.entityMeshes[entity.id] = sprite;
    } else {
      const tex = this.gameRenderer.createEntityTexture(entity, headgear);
      if (tex) {
        sprite.material.map?.dispose();
        sprite.material.map = tex;
        sprite.material.needsUpdate = true;
      }
    }

    sprite.position.set(entity.x, entity.y + (entity.type === 'boss_mvp' ? 2.0 : 0.9), entity.z);
  }

  // --- GROUND ITEM RENDERING ---

  updateGroundItem(item: { id: string; x: number; y: number; z: number; velY?: number }): void {
    const mesh = this.groundItemMeshes[item.id];
    if (mesh) {
      if (item.velY !== undefined) {
        mesh.position.set(item.x, item.y, item.z);
      } else {
        mesh.position.set(item.x, 0.22 + Math.abs(Math.sin(performance.now() * 0.005)) * 0.18, item.z);
      }
      mesh.rotation.y += 0.015;
    }
  }

  // --- PROJECTILE RENDERING ---

  updateProjectile(proj: Projectile): void {
    let mesh = this.projectileMeshes[proj.id];
    if (!mesh) {
      mesh = (this.gameRenderer as any).spawnProjectileMesh(proj.type, proj.x, proj.y, proj.z);
      this.projectileMeshes[proj.id] = mesh;
    }
    mesh.position.set(proj.x, proj.y, proj.z);
  }

  cleanupProjectileMeshes(activeProjectileIds: Set<string>): void {
    Object.keys(this.projectileMeshes).forEach(key => {
      if (!activeProjectileIds.has(key)) {
        const mesh = this.projectileMeshes[key];
        if (mesh) {
          this.scene.remove(mesh);
          mesh.traverse((node: any) => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) node.material.forEach((m: any) => m.dispose());
              else node.material.dispose();
            }
          });
        }
        delete this.projectileMeshes[key];
      }
    });
  }

  // --- EFFECTS ---

  spawnFloatingText(text: string, color: string, scale: number, x: number, y: number, z: number): void {
    this.effectsSystem.spawnFloatingText(text, color, scale, x, y, z);
  }

  spawnEffect(type: string, x: number, z: number): void {
    this.effectsSystem.spawnEffect(type, x, z);
  }

  spawnTouchIndicator(x: number, z: number, type: 'move' | 'target' | 'skill'): void {
    this.effectsSystem.spawnTouchIndicator(x, z, type);
  }

  updateEffects(delta: number, targetEntityId: string | null, getEntityPos: (id: string) => { x: number; z: number } | null): void {
    this.effectsSystem.update(delta, targetEntityId, getEntityPos);
  }

  // --- CAMERA ---

  updateCamera(playerEntity: Entity, screenShakeIntensity: number): void {
    const shakeX = (Math.random() - 0.5) * screenShakeIntensity * 3.5;
    const shakeY = (Math.random() - 0.5) * screenShakeIntensity * 3.5;
    this.camera.position.set(
      playerEntity.x + shakeX,
      playerEntity.y + 16 + shakeY,
      playerEntity.z + 22
    );
    this.camera.lookAt(playerEntity.x, playerEntity.y + 0.8, playerEntity.z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // --- GETTERS ---

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getEntitySprite(entityId: string): THREE.Sprite | undefined {
    return this.entityMeshes[entityId];
  }

  getSpriteEntityId(sprite: THREE.Sprite): string | undefined {
    for (const [id, s] of Object.entries(this.entityMeshes)) {
      if (s === sprite) return id;
    }
    return undefined;
  }

  getEffectsSystem(): EffectsSystem {
    return this.effectsSystem;
  }

  // --- CLEANUP ---

  destroy(): void {
    this.effectsSystem.destroy();
    Object.values(this.entityMeshes).forEach(sprite => {
      this.scene.remove(sprite);
      sprite.material.dispose();
    });
    this.entityMeshes = {};
    this.groundItemMeshes = {};
    this.projectileMeshes = {};
  }
}
