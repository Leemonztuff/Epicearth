import * as THREE from 'three';
import { gameAudio } from './audio';
import { WorldRuntime } from './worldRuntime';
import { InputHandler, EntityLookup } from './input';
import { CombatSystem } from './combat';
import { NpcSystem } from './npc';
import { EntitySpawner } from './spawner';
import { PlayerController } from './client/PlayerController';
import { RendererBridge } from './client/RendererBridge';
import { LocalStateProvider } from './client/LocalStateProvider';
import { Entity, GroundItem, Projectile } from './types';
import { GameContext, createGameContext } from './core/GameContext';
import { gameEventBus } from './core/EventBus';
import { CombatRuntime } from './server/CombatRuntime';

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
  private rendererBridge!: RendererBridge;
  private inputHandler!: InputHandler;
  private combatSystem!: CombatSystem;
  private npcSystem!: NpcSystem;
  private playerController!: PlayerController;

  // State Provider (for future networking swap)
  private stateProvider: LocalStateProvider;

  // Game Context
  private context: GameContext;

  // Entities
  private playerEntity!: Entity;
  private monsters: Entity[] = [];
  private npcs: Entity[] = [];
  private groundItems: GroundItem[] = [];

  // Simulation
  private accumulator = 0;
  private readonly fixedTimeStep = 1 / 60;
  private screenShakeIntensity = 0;
  private interactingNpcId: string | null = null;

  // EntityLookup implementation (delegated to RendererBridge)
  getCamera(): THREE.PerspectiveCamera {
    return this.rendererBridge.getCamera();
  }

  getEntitySprite(entityId: string): THREE.Sprite | undefined {
    return this.rendererBridge.getEntitySprite(entityId);
  }

  getSpriteEntityId(sprite: THREE.Sprite): string | undefined {
    return this.rendererBridge.getSpriteEntityId(sprite);
  }

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.context = createGameContext();
    this.stateProvider = new LocalStateProvider();
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
    this.rendererBridge = new RendererBridge({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer
    });
    this.rendererBridge.setEffectsMeshSpawners();

    this.worldRuntime = new WorldRuntime(this.context);
    this.worldRuntime.setCallbacks({
      onAudioTrigger: (action) => {
        if (action === 'item_bounce') gameAudio.playItemPickup();
      }
    });

    gameEventBus.on('entity:damaged', (event) => {
      this.context.store.addCombatLog(`[Event] ${event.entityId} recibió ${event.damage} daño${event.isCrit ? ' (CRIT)' : ''}.`, 'system');
    });

    gameEventBus.on('entity:died', (event) => {
      this.context.store.addCombatLog(`[Event] ${event.entityId} ha sido eliminado por ${event.killerId || 'desconocido'}.`, 'system');
    });

    gameEventBus.on('combat:miss', (event) => {
      this.context.store.addCombatLog(`${event.attackerId} falló contra ${event.targetId}${event.reason ? ` (${event.reason})` : ''}.`, 'system');
      if (event.targetId === this.playerEntity.id) {
        this.rendererBridge.spawnFloatingText('EVADED', '#94a3b8', 1.2, this.playerEntity.x, 2.5, this.playerEntity.z);
      }
    });

    gameEventBus.on('combat:death', (event) => {
      this.context.store.addCombatLog(`[Combat Death] ${event.entityId} eliminado por ${event.killerId || 'desconocido'} en t=${event.timestamp}.`, 'system');
    });
  }

  // --- 3. WORLD SETUP ---
  private initWorld() {
    this.rendererBridge.initGroundMap();

    const store = this.context.store;
    this.playerEntity = EntitySpawner.createPlayer(store.getJobClass(), store.getStats());
    this.monsters = EntitySpawner.spawnRoamers(12);
    this.npcs = EntitySpawner.spawnNpcs();

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

    // Spawn boss after initial setup
    const boss = EntitySpawner.createBoss();
    this.monsters.push(boss);
    store.addCombatLog('★ ¡ALERTA! El Boss MVP Baphomet ha invocado su presencia en el mapa ★', 'mvp');

    // Create shared CombatRuntime (deterministic, MMO-ready)
    const combatRuntime = new CombatRuntime();

    // Init World Runtime
    this.worldRuntime.init(this.playerEntity, this.monsters, this.npcs, combatRuntime);

    // Init Combat System
    this.combatSystem = new CombatSystem({
      playerEntity: this.playerEntity,
      monsters: this.monsters,
      context: this.context,
      combatRuntime
    });
    this.combatSystem.setCallbacks({
      onFloatingText: (text, color, scale, x, y, z) => this.rendererBridge.spawnFloatingText(text, color, scale, x, y, z),
      onEffectSpawn: (type, x, z) => this.rendererBridge.spawnEffect(type, x, z),
      onProjectileSpawn: (type, owner, target, damage, isCrit) => this.worldRuntime.spawnProjectile(type, owner, target, damage, isCrit),
      onScreenShake: (intensity) => { this.screenShakeIntensity = intensity; }
    });
    // Wire projectile impact → CombatSystem for damage + effects
    this.worldRuntime.setCallbacks({
      onProjectileImpact: (proj, target) => this.combatSystem.impactProjectile(proj, target)
    });

    // Re-initialize loot system with actual player entity
    this.context.loot = new (this.context.loot.constructor as any)({
      playerEntity: this.playerEntity,
      groundItems: [],
      context: this.context
    });

    // Init Player Controller (extracted from engine)
    this.playerController = new PlayerController({
      playerEntity: this.playerEntity,
      monsters: this.monsters,
      npcs: this.npcs,
      combatSystem: this.combatSystem,
      effectsSystem: this.rendererBridge.getEffectsSystem(),
      context: this.context
    });
    this.playerController.setCallbacks({
      onNpcInteract: (npc) => this.handleNpcInteract(npc)
    });

    // Init NPC System
    this.npcSystem = new NpcSystem({
      playerEntity: this.playerEntity,
      npcs: this.npcs,
      context: this.context
    });
    this.npcSystem.setCallbacks({
      onEffectSpawn: (type, x, z) => this.rendererBridge.spawnEffect(type, x, z),
      onClassChange: (job) => this.rendererBridge.updateEntityBillboard(this.playerEntity, store.getHeadgear())
    });

    // Init Input Handler (pass engine as EntityLookup)
    this.inputHandler = new InputHandler({
      renderer: this.renderer,
      entityLookup: this,
      playerEntity: this.playerEntity,
      monsters: this.monsters,
      npcs: this.npcs,
      groundItems: this.groundItems,
      context: this.context
    });
    this.inputHandler.setCallbacks({
      onMove: (coords) => this.playerController.handleMove(coords),
      onTarget: (targetId) => this.playerController.handleTarget(targetId),
      onNpcInteract: (npc) => this.handleNpcInteract(npc)
    });

    this.stateProvider.init({
      getPlayerEntity: () => this.playerEntity,
      getMonsters: () => this.monsters,
      getNpcs: () => this.npcs,
      getProjectiles: () => this.worldRuntime.getProjectiles() as Projectile[],
      getGroundItems: () => this.groundItems,
      store: {
        getStats: () => store.getStats(),
        setPlayerHpSp: (hp, sp) => store.setPlayerHpSp(hp, sp),
        updateStats: (stats) => store.updateStats(stats)
      }
    });

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
    const store = this.context.store;
    const tickScale = dt * 60;

    // 1. Combat systems (casting, auto-attack, delayed actions, runtime)
    this.combatSystem.tickActiveCasting(dt);
    this.combatSystem.tickDelayedActions(now);
    this.combatSystem.tickAutoCombat(now, dt);
    this.combatSystem.tickRuntime(dt, now);

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
  }

  // --- 6. RENDER TICK ---
  private renderTick(delta: number, timeSec: number) {
    // Screen shake decay
    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity *= Math.pow(0.1, delta);
    }

    // Update effects
    this.rendererBridge.updateEffects(delta, this.playerEntity.targetEntityId, (id) => {
      const mob = this.monsters.find(m => m.id === id);
      return mob ? { x: mob.x, z: mob.z } : null;
    });

    // Update entity billboards
    const store = this.context.store;
    this.rendererBridge.updateEntityBillboard(this.playerEntity, store.getHeadgear());
    this.monsters.forEach(m => this.rendererBridge.updateEntityBillboard(m, 'none'));
    this.npcs.forEach(n => this.rendererBridge.updateEntityBillboard(n, 'none'));

    // Update ground items
    this.groundItems.forEach(item => {
      this.rendererBridge.updateGroundItem(item);
    });

    // Update projectiles
    const projectiles = this.worldRuntime.getProjectiles();
    projectiles.forEach(proj => this.rendererBridge.updateProjectile(proj));
    this.rendererBridge.cleanupProjectileMeshes(new Set(projectiles.map(p => p.id)));

    // Camera follow
    this.rendererBridge.updateCamera(this.playerEntity, this.screenShakeIntensity);
    this.rendererBridge.render();
  }

  // --- 8. NPC INTERACTION ---
  private handleNpcInteract(npc: Entity) {
    const store = this.context.store;
    const dialogue = this.npcSystem.openDialogue(npc);
    if (dialogue) {
      store.setNpcDialogue(dialogue);
      this.rendererBridge.spawnTouchIndicator(npc.x, npc.z, 'target');
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
    const inventory = this.context.inventory;
    const store = this.context.store;
    
    if (inventory.hasItem('red_potion')) {
      inventory.removeItem('red_potion', 1);
      const healAmount = 150;
      const newHp = Math.min(store.getStats().maxHp, store.getCurrentHp() + healAmount);
      this.playerEntity.currentHp = newHp;
      store.setPlayerHpSp(newHp, store.getCurrentSp());
      store.addCombatLog(`Usaste Red Potion: +${healAmount} HP`, 'heal');
      gameEventBus.emit('entity:healed', { entityId: this.playerEntity.id, amount: healAmount });
    } else {
      store.addCombatLog('¡No tienes Red Potions!', 'system');
    }
  }

  // --- 9. CLEANUP ---
  destroy() {
    this.isDestroyed = true;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer) this.renderer.dispose();
    this.worldRuntime.destroy();
    this.rendererBridge.destroy();
    this.inputHandler.destroy();
  }
}
