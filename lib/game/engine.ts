import * as THREE from 'three';
import { useGameStore } from './state';
import { GameRenderer } from './renderer';
import { gameAudio } from './audio';
import { WorldRuntime } from './worldRuntime';
import { InputHandler, EntityLookup } from './input';
import { CombatSystem } from './combat';
import { NpcSystem } from './npc';
import { EntitySpawner } from './spawner';
import { EffectsSystem } from './effects';
import { PlayerController } from './client/PlayerController';
import { Entity, GroundItem, HeadgearId, Projectile } from './types';

// ============================================================================
// RAGNAROK ENGINE - ORQUESTADOR PRINCIPAL
// ============================================================================
// Motor realtime para RPG browser/mobile inspirado en Ragnarok Online.
// Arquitectura modular: cada sistema es independiente y se comunica
// a través de eventos y callbacks.
// ============================================================================

export class RagnarokEngine implements EntityLookup {
  // Three.js Core
  private container: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private animationId: number | null = null;
  private isDestroyed = false;

  // Core Systems
  private worldRuntime!: WorldRuntime;
  private gameRenderer!: GameRenderer;
  private inputHandler!: InputHandler;
  private combatSystem!: CombatSystem;
  private npcSystem!: NpcSystem;
  private effectsSystem!: EffectsSystem;
  private playerController!: PlayerController;

  // Entities
  private playerEntity!: Entity;
  private monsters: Entity[] = [];
  private npcs: Entity[] = [];
  private groundItems: GroundItem[] = [];

  // Visual Mapping
  private entityMeshes: Record<string, THREE.Sprite> = {};
  private groundItemMeshes: Record<string, THREE.Mesh> = {};
  private projectileMeshes: Record<string, THREE.Object3D> = {};

  // Simulation
  private accumulator = 0;
  private readonly fixedTimeStep = 1 / 60;
  private screenShakeIntensity = 0;
  private interactingNpcId: string | null = null;

  // EntityLookup implementation
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

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.initThree();
    this.initSystems();
    this.initWorld();
    this.animate();
  }

  // --- 1. THREE.JS INITIALIZATION ---
  private initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020617);
    this.scene.fog = new THREE.FogExp2(0x020617, 0.015);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    this.camera.position.set(0, 16, 22);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dirLight = new THREE.DirectionalLight(0x7dd3fc, 0.95);
    dirLight.position.set(30, 40, -10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -40;
    this.scene.add(dirLight);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    if (!this.container || this.isDestroyed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // --- 2. SYSTEM INITIALIZATION ---
  private initSystems() {
    this.gameRenderer = new GameRenderer(this.scene);
    this.effectsSystem = new EffectsSystem(this.scene);

    this.effectsSystem.setMeshSpawners({
      spawnEffectMesh: (type, x, z, scale) => this.gameRenderer.createSkillVisualMesh(type, x, z, scale),
      spawnTouchMesh: (data) => this.gameRenderer.spawnTouchIndicator(data)
    });

    this.worldRuntime = new WorldRuntime();
    this.worldRuntime.setCallbacks({
      onAudioTrigger: (action) => {
        if (action === 'item_bounce') gameAudio.playItemPickup();
      }
    });
  }

  // --- 3. WORLD SETUP ---
  private initWorld() {
    this.gameRenderer.createGroundMap();

    const store = useGameStore.getState();
    this.playerEntity = EntitySpawner.createPlayer(store.jobClass);
    this.monsters = EntitySpawner.spawnRoamers(12);
    this.npcs = EntitySpawner.spawnNpcs();

    useGameStore.setState({
      currentHp: this.playerEntity.currentHp,
      currentSp: this.playerEntity.currentSp
    });

    // Spawn boss after initial setup
    const boss = EntitySpawner.createBoss();
    this.monsters.push(boss);
    store.addCombatLog('★ ¡ALERTA! El Boss MVP Baphomet ha invocado su presencia en el mapa ★', 'mvp');

    // Init World Runtime
    this.worldRuntime.init(this.playerEntity, this.monsters, this.npcs);

    // Init Combat System
    this.combatSystem = new CombatSystem(this.playerEntity, this.monsters);
    this.combatSystem.setCallbacks({
      onFloatingText: (text, color, scale, x, y, z) => this.effectsSystem.spawnFloatingText(text, color, scale, x, y, z),
      onEffectSpawn: (type, x, z) => this.effectsSystem.spawnEffect(type, x, z),
      onProjectileSpawn: (type, owner, target, damage, isCrit) => this.worldRuntime.spawnProjectile(type, owner, target, damage, isCrit),
      onScreenShake: (intensity) => { this.screenShakeIntensity = intensity; }
    });

    // Init Player Controller (extracted from engine)
    this.playerController = new PlayerController(
      this.playerEntity, this.monsters, this.npcs, this.combatSystem, this.effectsSystem
    );
    this.playerController.setCallbacks({
      onNpcInteract: (npc) => this.handleNpcInteract(npc)
    });

    // Init NPC System
    this.npcSystem = new NpcSystem(this.playerEntity, this.npcs);
    this.npcSystem.setCallbacks({
      onEffectSpawn: (type, x, z) => this.effectsSystem.spawnEffect(type, x, z),
      onClassChange: (job) => this.gameRenderer.createEntityTexture(this.playerEntity, store.headgear)
    });

    // Init Input Handler (pass engine as EntityLookup)
    this.inputHandler = new InputHandler(
      this.renderer, this, this.playerEntity, this.monsters, this.npcs, this.groundItems
    );
    this.inputHandler.setCallbacks({
      onMove: (coords) => this.playerController.handleMove(coords),
      onTarget: (targetId) => this.playerController.handleTarget(targetId),
      onNpcInteract: (npc) => this.handleNpcInteract(npc)
    });

    this.updateBillboards();
  }

  // --- 5. MAIN UPDATE LOOP ---
  private animate() {
    if (this.isDestroyed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min(this.clock.getDelta(), 0.15);
    const secs = now * 0.001;

    this.accumulator += delta;

    // Fixed timestep simulation
    while (this.accumulator >= this.fixedTimeStep) {
      this.fixedTick(now, this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
    }

    // Render at full framerate
    this.renderTick(delta, secs);
  }

  private fixedTick(now: number, dt: number) {
    const store = useGameStore.getState();
    const tickScale = dt * 60;

    // 1. Combat systems (casting, auto-attack)
    this.combatSystem.tickActiveCasting(dt);
    this.combatSystem.tickAutoCombat(now, dt);

    // 2. World Runtime update (AI, projectiles, buffs, regen, loot)
    this.worldRuntime.update(dt, now);

    // 3. Player movement (delegated to PlayerController)
    this.playerController.tickJoystickMovement(dt, tickScale);
    this.playerController.tickTouchMovement(dt, tickScale);

    // 4. NPC proximity check (delegated to PlayerController)
    this.playerController.tickNpcProximity(this.inputHandler.getInteractingNpcId());
    if (this.inputHandler.getInteractingNpcId()) {
      // Check if proximity check handled the interaction
      const npc = this.npcs.find(n => n.id === this.inputHandler.getInteractingNpcId());
      if (npc) {
        const dist = Math.sqrt(
          (npc.x - this.playerEntity.x) ** 2 + (npc.z - this.playerEntity.z) ** 2
        );
        if (dist < 1.95) {
          this.inputHandler.setInteractingNpcId(null);
        }
      }
    }

    // 5. Animation timers
    this.playerEntity.animationTimer += dt;
    this.monsters.forEach(m => { m.animationTimer += dt; });

    // 6. Sync store
    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
  }

  // --- 6. RENDER TICK ---
  private renderTick(delta: number, timeSec: number) {
    // Screen shake decay
    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity *= Math.pow(0.1, delta);
    }

    // Update effects
    this.effectsSystem.update(delta, this.playerEntity.targetEntityId, (id) => {
      const mob = this.monsters.find(m => m.id === id);
      return mob ? { x: mob.x, z: mob.z } : null;
    });

    // Update billboards
    this.updateBillboards();

    // Camera follow
    const shakeX = (Math.random() - 0.5) * this.screenShakeIntensity * 3.5;
    const shakeY = (Math.random() - 0.5) * this.screenShakeIntensity * 3.5;
    this.camera.position.set(
      this.playerEntity.x + shakeX,
      this.playerEntity.y + 16 + shakeY,
      this.playerEntity.z + 22
    );
    this.camera.lookAt(this.playerEntity.x, this.playerEntity.y + 0.8, this.playerEntity.z);

    this.renderer.render(this.scene, this.camera);
  }

  // --- 7. BILLBOARD RENDERING ---
  private updateBillboards() {
    const store = useGameStore.getState();
    this.updateSingleEntityBillboard(this.playerEntity, store.headgear);
    this.monsters.forEach(m => this.updateSingleEntityBillboard(m, 'none'));
    this.npcs.forEach(n => this.updateSingleEntityBillboard(n, 'none'));

    // Ground items
    this.groundItems.forEach(item => {
      const mesh = this.groundItemMeshes[item.id];
      if (mesh) {
        if (item.velY !== undefined) {
          mesh.position.set(item.x, item.y, item.z);
        } else {
          mesh.position.set(item.x, 0.22 + Math.abs(Math.sin(performance.now() * 0.005)) * 0.18, item.z);
        }
        mesh.rotation.y += 0.015;
      }
    });

    // Projectiles
    const projectiles = this.worldRuntime['projectiles'] || [];
    projectiles.forEach((proj: Projectile) => {
      let mesh = this.projectileMeshes[proj.id];
      if (!mesh) {
        mesh = (this.gameRenderer as any).spawnProjectileMesh(proj.type, proj.x, proj.y, proj.z);
        this.projectileMeshes[proj.id] = mesh;
      }
      mesh.position.set(proj.x, proj.y, proj.z);
    });

    // Cleanup projectile meshes
    Object.keys(this.projectileMeshes).forEach(key => {
      if (!projectiles.some((p: Projectile) => p.id === key)) {
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

  private updateSingleEntityBillboard(entity: Entity, headgear: HeadgearId) {
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

  // --- 8. NPC INTERACTION ---
  private handleNpcInteract(npc: Entity) {
    const store = useGameStore.getState();
    const dialogue = this.npcSystem.openDialogue(npc);
    if (dialogue) {
      store.setNpcDialogue(dialogue);
      this.effectsSystem.spawnTouchIndicator(npc.x, npc.z, 'target');
      store.addCombatLog(`Caminando hacia ${npc.name}...`, 'system');
    }
  }

  // --- 9. PUBLIC API ---
  handleNpcAction(npcId: string, actionParam: string) {
    this.npcSystem.handleAction(npcId, actionParam);
  }

  revivePlayer() {
    this.playerController.revivePlayer();
  }

  castSkill(skillId: string) {
    this.combatSystem.triggerSkillCast(skillId);
  }

  drinkPotion() {
    useGameStore.getState().drinkPotion();
  }

  // --- 9. CLEANUP ---
  destroy() {
    this.isDestroyed = true;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer) this.renderer.dispose();
    this.worldRuntime.destroy();
    this.effectsSystem.destroy();
    this.inputHandler.destroy();
  }
}
