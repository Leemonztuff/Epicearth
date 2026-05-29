import * as THREE from 'three';
import { useGameStore } from './state';
import { GameRenderer } from './renderer';
import { gameAudio } from './audio';
import { WorldRuntime } from './worldRuntime';
import { 
  Entity, GroundItem, TouchIndicator, 
  InputBufferItem, JoystickState, HeadgearId, Projectile
} from './types';

export class RagnarokEngine {
  // THREE.js Core
  private container: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private animationId: number | null = null;
  private isDestroyed = false;

  // World Runtime engine simulator
  private worldRuntime!: WorldRuntime;

  // Render wrapper and helper
  private gameRenderer!: GameRenderer;

  // Simulation Entities
  private playerEntity!: Entity;
  private monsters: Entity[] = [];
  private groundItems: GroundItem[] = [];
  private npcs: Entity[] = [];
  private projectiles: Projectile[] = [];
  private interactingNpcId: string | null = null;
  private activeCast: { skillId: string; skillName: string; durationMs: number; elapsedMs: number; targetEntityId: string | null; color: string } | null = null;
  private battleModeEndTime = 0;

  // Visual Lists
  private activeEffects: { id: string; type: string; mesh: THREE.Object3D; age: number; maxAge: number; x: number; z: number }[] = [];
  private floatingTexts: { id: string; text: string; color: string; size: number; x: number; y: number; z: number; velX: number; velY: number; velZ: number; age: number; maxAge: number }[] = [];
  private touchIndicators: { id: string; data: TouchIndicator; mesh: THREE.Mesh }[] = [];

  // Map of meshes representing entities on stage
  private entityMeshes: Record<string, THREE.Sprite> = {};
  private effectMeshes: Record<string, THREE.Object3D> = {};
  private groundItemMeshes: Record<string, THREE.Mesh> = {};
  private projectileMeshes: Record<string, THREE.Object3D> = {};

  // Timing Accumulator for Fixed Tick
  private accumulator = 0.0;
  private readonly fixedTimeStep = 1 / 60; // 60 FPS Fixed ticks simulation

  // Raycasting & Pointer variables
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Screen shake
  private screenShakeIntensity = 0.0;

  // Active Touches tracking for MULTITOUCH & JOYSTICK
  private activeTouchPoints: Map<number, { startX: number; startY: number; currentX: number; currentY: number; isJoystick: boolean }> = new Map();
  private joystickTouchId: number | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.initThree();
    this.initWorld();
    this.setupTouchListeners();
    this.animate();
  }

  // --- 1. CORE THREE JS INIT ---
  private initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020617); // Slate black deep void atmosphere
    this.scene.fog = new THREE.FogExp2(0x020617, 0.015);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    // Ragnarok signature high angle 3/4 isometric perspective
    this.camera.position.set(0, 16, 22);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Clear container and append
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.gameRenderer = new GameRenderer(this.scene);

    // Dynamic resizing
    window.addEventListener('resize', this.handleResize);

    // Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambientLight);

    // Cyber blue moon main casting spotlight
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
  }

  private handleResize = () => {
    if (!this.container || this.isDestroyed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // --- 2. GAME WORLD ENTITIES SPAWNER SETUP ---
  private initWorld() {
    // 1. Draw glowing grid grasslands
    this.gameRenderer.createGroundMap();

    // 2. Spawn local Player initial coordinates
    const curStore = useGameStore.getState();
    this.playerEntity = {
      id: 'player_main',
      name: 'Rookie Hero',
      type: 'player',
      job: curStore.jobClass,
      currentHp: curStore.stats.maxHp,
      currentSp: curStore.stats.maxSp,
      maxHp: curStore.stats.maxHp,
      maxSp: curStore.stats.maxSp,
      facing: 'right',
      x: 0,
      y: 0,
      z: 0,
      state: 'idle',
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };

    useGameStore.setState({
      currentHp: this.playerEntity.currentHp,
      currentSp: this.playerEntity.currentSp
    });

    // 3. Populate roaming Monsters
    this.spawnRoamers();

    // 4. Populate stable friendly NPCs
    this.spawnNPCs();

    // Instantiate and register active simulation bodies inside spatial buckets
    this.worldRuntime = new WorldRuntime();
    this.worldRuntime.registerEntity(this.playerEntity);
    this.npcs.forEach(n => this.worldRuntime.registerEntity(n));
    this.monsters.forEach(m => this.worldRuntime.registerEntity(m));

    // Set callback to sync audio from runtime updates
    this.worldRuntime.setCallbacks({
      onAudioTrigger: (action) => {
        if (action === 'item_bounce') {
          gameAudio.playItemPickup();
        }
      }
    });

    // Sync render billboards
    this.updateBillboards();
  }

  private spawnNPCs() {
    this.npcs = [
      {
        id: 'npc_kafra',
        name: 'Kafra Assistant ★ Clarice',
        type: 'npc',
        npcType: 'kafra',
        x: -5,
        y: 0,
        z: 5,
        facing: 'right',
        state: 'idle',
        currentHp: 100,
        currentSp: 100,
        maxHp: 100,
        maxSp: 100,
        targetEntityId: null,
        hitRecoveryEndTime: 0,
        animationTimer: 0,
        animationFrame: 0
      },
      {
        id: 'npc_crusader',
        name: 'Swordsman Instructor ★ Kurt',
        type: 'npc',
        npcType: 'crusader_instructor',
        x: 5,
        y: 0,
        z: -5,
        facing: 'left',
        state: 'idle',
        currentHp: 100,
        currentSp: 100,
        maxHp: 100,
        maxSp: 100,
        targetEntityId: null,
        hitRecoveryEndTime: 0,
        animationTimer: 0,
        animationFrame: 0
      }
    ];
  }

  private spawnRoamers() {
    const mobTypes: ('poring' | 'poporing' | 'pecopeco')[] = ['poring', 'poporing', 'pecopeco'];
    const mobConfigs = {
      poring: { name: 'Poring Pink', maxHp: 80, exp: 12, jobExp: 10, size: 1.0 },
      poporing: { name: 'Poporing Tox', maxHp: 190, exp: 35, jobExp: 28, size: 1.1 },
      pecopeco: { name: 'PecoPeco Runner', maxHp: 380, exp: 90, jobExp: 75, size: 1.3 }
    };

    // Spawn 12 roamer minions
    for (let i = 0; i < 12; i++) {
      const type = mobTypes[i % mobTypes.length];
      const conf = mobConfigs[type];
      const theta = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 38;

      const mob: Entity = {
        id: `mob_minion_${i}_${Date.now()}`,
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
      this.monsters.push(mob);
    }

    // Spawn BOSS MVP Baphomet!
    this.spawnBossMvp();
  }

  private spawnBossMvp() {
    const baphomet: Entity = {
      id: 'baphomet_mvp_boss',
      name: 'BAPHOMET ★ MVP',
      type: 'boss_mvp',
      x: 18,
      y: 0,
      z: -18,
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
    this.monsters.push(baphomet);

    useGameStore.getState().addCombatLog('★ ¡ALERTA! El Boss MVP Baphomet ha invocado su presencia en el mapa ★', 'mvp');
  }

  // --- 3. INPUT PORTER DELEGATOR & ADVANCED TOUCH CONTROLS ---
  private setupTouchListeners() {
    const el = this.renderer.domElement;

    // Prevent scrolling or zooming bounce behavior on mobile
    const preventDefault = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', preventDefault, { passive: false });
    el.addEventListener('touchmove', preventDefault, { passive: false });

    // TOUCH START EVENT (Handles joysticks initiation and raycast targeting)
    el.addEventListener('touchstart', (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const store = useGameStore.getState();

      const changedTouches = Array.from(e.changedTouches);
      changedTouches.forEach((t) => {
        const touchX = t.clientX - rect.left;
        const touchY = t.clientY - rect.top;

        // Determine if this touch is on the Left half (Joystick zone) and screen joystick helper is enabled
        const isLeftZone = touchX < rect.width * 0.45;
        const wantsJoystick = store.isJoystickEnabled && isLeftZone && this.joystickTouchId === null;

        if (wantsJoystick) {
          // Bind Joystick anchor center
          this.joystickTouchId = t.identifier;
          this.activeTouchPoints.set(t.identifier, {
            startX: touchX,
            startY: touchY,
            currentX: touchX,
            currentY: touchY,
            isJoystick: true
          });

          // Trigger state
          store.updateJoystick({
            isActive: true,
            startX: touchX,
            startY: touchY,
            currentX: touchX,
            currentY: touchY,
            distance: 0,
            angle: 0,
            normalizedX: 0,
            normalizedY: 0
          });
        } else {
          // This is a targeting / coordinate touch action (Right zone or standard screen clicks)
          this.activeTouchPoints.set(t.identifier, {
            startX: touchX,
            startY: touchY,
            currentX: touchX,
            currentY: touchY,
            isJoystick: false
          });

          // Translate standard touch coords to raycaster coordinates for Raycast clicks
          this.triggerScreenTouchRaycast(touchX, touchY, rect.width, rect.height, 'touch');
        }
      });
    }, { passive: false });

    // TOUCH MOVE DRAG EVENT
    el.addEventListener('touchmove', (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const store = useGameStore.getState();

      Array.from(e.touches).forEach((t) => {
        const touchX = t.clientX - rect.left;
        const touchY = t.clientY - rect.top;

        const info = this.activeTouchPoints.get(t.identifier);
        if (info) {
          info.currentX = touchX;
          info.currentY = touchY;

          if (info.isJoystick) {
            // Update Virtual Joystick Math vector!
            const dx = touchX - info.startX;
            const dy = touchY - info.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxRadius = 60; // drag boundary radius limit
            const clampedDist = Math.min(distance, maxRadius);

            const angle = Math.atan2(dy, dx);
            const normX = (clampedDist * Math.cos(angle)) / maxRadius;
            const normY = -(clampedDist * Math.sin(angle)) / maxRadius; // invert Y for standard game coordinates

            store.updateJoystick({
              currentX: info.startX + Math.cos(angle) * clampedDist,
              currentY: info.startY + Math.sin(angle) * clampedDist,
              distance: clampedDist,
              angle: angle,
              normalizedX: normX,
              normalizedY: normY
            });
          }
        }
      });
    }, { passive: false });

    // TOUCH END
    el.addEventListener('touchend', (e: TouchEvent) => {
      const store = useGameStore.getState();

      Array.from(e.changedTouches).forEach((t) => {
        if (t.identifier === this.joystickTouchId) {
          // Drop joystick anchors
          this.joystickTouchId = null;
          store.updateJoystick({
            isActive: false,
            normalizedX: 0,
            normalizedY: 0,
            distance: 0
          });
        }
        this.activeTouchPoints.delete(t.identifier);
      });
    }, { passive: false });

    // DESKTOP CURSOR CLICKS HANDLING AS FALLBACK
    el.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const store = useGameStore.getState();

      // If dragging visual joystick on desktop clicks (uncommon fallback)
      const touchX = e.clientX - rect.left;
      const touchY = e.clientY - rect.top;

      this.triggerScreenTouchRaycast(touchX, touchY, rect.width, rect.height, 'mouse');
    });
  }

  // Raycasts touch vectors from screen to Three.js environment coordinates
  private triggerScreenTouchRaycast(screenX: number, screenY: number, width: number, height: number, triggerSrc: 'touch' | 'mouse') {
    if (this.playerEntity.state === 'death') return;

    // Convert pixel to normalized device coordinates (NDC) -1 to 1
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -(screenY / height) * 2 + 1;

    this.mouse.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Check intersection with MOB SPRITES first for targeting/combat!
    const spriteArray = Object.keys(this.entityMeshes)
      .filter(id => id !== 'player_main')
      .map(id => this.entityMeshes[id]);

    const mobHits = this.raycaster.intersectObjects(spriteArray);
    if (mobHits.length > 0) {
      const selectedSprite = mobHits[0].object;
      // Reverse map sprite back to database entity id
      let matchedMob: Entity | undefined;
      let matchedNpc: Entity | undefined;
      for (const id in this.entityMeshes) {
        if (this.entityMeshes[id] === selectedSprite) {
          matchedMob = this.monsters.find(m => m.id === id);
          if (!matchedMob) {
            matchedNpc = this.npcs.find(n => n.id === id);
          }
          break;
        }
      }

      if (matchedMob && matchedMob.currentHp > 0) {
        // ENQUEUE COMBAT TARGET IN BUFFER INTERFACES
        this.bufferOrEnqueueAction({
          type: 'target',
          targetId: matchedMob.id
        });

        // Spawn visual double-ring lock on the targeted monster
        this.addTouchIndicatorInstance(matchedMob.x, matchedMob.z, 'target');
        return; // Targeted! bypass terrain clicks mapping
      }

      if (matchedNpc) {
        // WALK TO FRIENDLY NPC AND INITIATE CONVERSATION
        this.bufferOrEnqueueAction({
          type: 'move',
          coords: { x: matchedNpc.x, z: matchedNpc.z }
        });

        this.interactingNpcId = matchedNpc.id;

        // Spawn locked-on circle beneath the friendly NPC
        this.addTouchIndicatorInstance(matchedNpc.x, matchedNpc.z, 'target');
        useGameStore.getState().addCombatLog(`Caminando hacia ${matchedNpc.name}...`, 'system');
        return;
      }
    }

    // 2. Clicked terrain plane to initiate custom path movement / item looting
    const testPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(testPlane, worldPoint)) {
      
      // Let's check proximity to items on ground first
      let clickedItem: GroundItem | null = null;
      for (const item of this.groundItems) {
        const dist = Math.sqrt((item.x - worldPoint.x) ** 2 + (item.z - worldPoint.z) ** 2);
        if (dist < 1.8) {
          clickedItem = item;
          break;
        }
      }

      const store = useGameStore.getState();

      if (clickedItem) {
        // Walk towards loot drop box
        this.bufferOrEnqueueAction({
          type: 'move',
          coords: { x: clickedItem.x, z: clickedItem.z }
        });
        
        // Spawn loot visual indication
        this.addTouchIndicatorInstance(clickedItem.x, clickedItem.z, 'skill');
      } else {
        // Standard walk trigger point!
        this.bufferOrEnqueueAction({
          type: 'move',
          coords: { x: worldPoint.x, z: worldPoint.z }
        });

        // Spawn RO ripple click arrows indicators
        this.addTouchIndicatorInstance(worldPoint.x, worldPoint.z, 'move');
      }
    }
  }

  // --- 4. ADVANCED INPUT BUFFER ENGINE ---
  // Enqueues action in buffer or executes instantly, adhering to fixed simulation frames
  private bufferOrEnqueueAction(action: Omit<InputBufferItem, 'id' | 'timestamp' | 'expiresAt'>) {
    const store = useGameStore.getState();

    // Check if player is stunned, hitting animation recov, or busy
    const now = performance.now();
    const canDoInstantly = this.playerEntity.state !== 'hit' && this.playerEntity.hitRecoveryEndTime < now;

    if (canDoInstantly) {
      this.executeGameAction(action);
    } else {
      // Buffer action queue for smooth input buffering responsiveness
      store.addToInputBuffer(action);
    }
  }

  // Pure state modification delegator based on buffered item type
  private executeGameAction(item: Omit<InputBufferItem, 'id' | 'timestamp' | 'expiresAt'>) {
    const store = useGameStore.getState();

    if (item.type === 'move' && item.coords) {
      // Cancel active casting if we move manually!
      if (this.activeCast) {
        const spellName = this.activeCast.skillName;
        this.activeCast = null;
        useGameStore.setState({ activeCast: null });
        this.floatingTextSpawner('CANCELLED', '#94a3b8', 1.0, this.playerEntity.x, 2.5, this.playerEntity.z);
        store.addCombatLog(`¡[${spellName}] cancelado por movimiento!`, 'system');
        gameAudio.playFail();
      }

      // Begin custom route movement heading
      this.playerEntity.targetX = item.coords.x;
      this.playerEntity.targetZ = item.coords.z;
      this.playerEntity.state = 'move';
      
      // If we move, break existing auto target lock occasionally to feel reactive
      if (!this.playerEntity.targetEntityId) {
        store.setTarget(null);
      }
    } else if (item.type === 'target' && item.targetId) {
      const mob = this.monsters.find(m => m.id === item.targetId);
      if (mob && mob.currentHp > 0) {
        this.playerEntity.targetEntityId = mob.id;
        // Face mob
        this.playerEntity.facing = mob.x < this.playerEntity.x ? 'left' : 'right';

        store.setTarget(mob.id, mob.name, mob.currentHp, mob.maxHp);
        store.addCombatLog(`Target lock: enfocando en [${mob.name}] LV: 45.`, 'system');
      }
    } else if (item.type === 'skill' && item.skillId) {
      this.triggerSkillCastExecution(item.skillId);
    } else if (item.type === 'potion') {
      store.drinkPotion();
    }
  }

  // Process the queue buffer items
  private tickInputBuffer(now: number) {
    const store = useGameStore.getState();
    const queue = store.bufferingQueue;
    if (queue.length === 0) return;

    // Reject expired input items from buffer
    const activeValidItems = queue.filter(item => item.expiresAt > now);
    if (activeValidItems.length !== queue.length) {
      useGameStore.setState({ bufferingQueue: activeValidItems });
    }

    if (activeValidItems.length === 0) return;

    // Check if hero state allows consuming next action
    const isPlayerCapable = this.playerEntity.state !== 'hit' && this.playerEntity.hitRecoveryEndTime < now;
    if (isPlayerCapable) {
      // Extract oldest action queue item
      const nextAction = activeValidItems[0];
      this.executeGameAction(nextAction);
      
      // Remove consumed item
      store.removeFromInputBuffer(nextAction.id);
    }
  }

  // --- 5. CAST SKILLS INTERFACE CHASSIS ---
  private triggerSkillCastExecution(skillId: string) {
    const store = useGameStore.getState();
    const skill = store.skills.find(s => s.id === skillId);
    if (!skill) return;

    // Verify SP cost
    if (this.playerEntity.currentSp < skill.spCost) {
      store.addCombatLog(`¡Sin SP para lanzar ${skill.name}! Requiere ${skill.spCost} SP.`, 'system');
      gameAudio.playFail();
      return;
    }

    // Cooldown verification (additional backup check)
    const now = performance.now();
    const lastCast = skill.lastCastTime || 0;
    if (now - lastCast < skill.cooldown) {
      const remaining = Math.ceil((skill.cooldown - (now - lastCast)) / 100) / 10;
      store.addCombatLog(`¡[${skill.name}] está recargando! Restan ${remaining}s.`, 'system');
      return;
    }

    // Determine target coordinates or target lock
    let tx = this.playerEntity.x;
    let tz = this.playerEntity.z;
    let targetMob: Entity | undefined;

    if (this.playerEntity.targetEntityId) {
      targetMob = this.monsters.find(m => m.id === this.playerEntity.targetEntityId);
      if (targetMob && targetMob.currentHp > 0) {
        tx = targetMob.x;
        tz = targetMob.z;
      }
    }

    // Proportional range checking
    const distToTarget = Math.sqrt((tx - this.playerEntity.x) ** 2 + (tz - this.playerEntity.z) ** 2);
    if (targetMob && distToTarget > skill.range) {
      // Pathfind / walk closer to target automatically!
      this.playerEntity.targetX = tx;
      this.playerEntity.targetZ = tz;
      this.playerEntity.state = 'move';
      store.addCombatLog(`[${skill.name}] fuera de rango. Acercándose...`, 'system');
      return; // Stop casting trigger, try again next frame
    }

    // Check if the skill has a cast time configuration
    const castTime = skill.castTime || 0;
    if (castTime > 0) {
      if (this.activeCast) {
        store.addCombatLog(`¡Ya estás chanteando un hechizo!`, 'system');
        return; // Already casting!
      }

      // Spend SP at casting start
      this.playerEntity.currentSp -= skill.spCost;
      skill.lastCastTime = now;

      // Face target
      if (targetMob) {
        this.playerEntity.facing = targetMob.x < this.playerEntity.x ? 'left' : 'right';
      }

      // Interrupt any active move path
      this.playerEntity.targetX = undefined;
      this.playerEntity.targetZ = undefined;
      this.playerEntity.state = 'cast';

      // Record active cast details
      this.activeCast = {
        skillId,
        skillName: skill.name,
        durationMs: castTime,
        elapsedMs: 0,
        targetEntityId: targetMob ? targetMob.id : null,
        color: skill.color
      };

      // Set state in the Zustand store
      useGameStore.setState({
        activeCast: {
          skillId,
          skillName: skill.name,
          durationMs: castTime,
          elapsedMs: 0,
          color: skill.color
        },
        currentSp: this.playerEntity.currentSp
      });

      store.addCombatLog(`Chanteando [${skill.name}]... ¡Tiempo de casteo: ${(castTime / 1000).toFixed(1)}s!`, 'skill');
      return;
    }

    // Successfully initiating instant skill cast!
    this.playerEntity.currentSp -= skill.spCost;
    skill.lastCastTime = now;
    this.completeSkillExecution(skillId, targetMob ? targetMob.id : null);
  }

  // Handle active chanting increments
  private tickActiveCasting(dt: number) {
    if (!this.activeCast) return;

    this.activeCast.elapsedMs += dt * 1000;
    const progress = Math.min(1.0, this.activeCast.elapsedMs / this.activeCast.durationMs);

    useGameStore.setState({
      activeCast: {
        ...this.activeCast,
        elapsedMs: this.activeCast.elapsedMs
      }
    });

    if (this.activeCast.elapsedMs >= this.activeCast.durationMs) {
      const skillId = this.activeCast.skillId;
      const targetId = this.activeCast.targetEntityId;

      this.activeCast = null;
      useGameStore.setState({ activeCast: null });

      this.completeSkillExecution(skillId, targetId);
    }
  }

  // Trigger Combat State / Battle Mode lasting 5 seconds
  private triggerBattleMode(now: number) {
    this.battleModeEndTime = now + 5000;
    useGameStore.setState({ battleMode: true });
  }

  // Core impact execution when a skill succeeds instantly or finishes chanting
  private completeSkillExecution(skillId: string, customTargetId: string | null) {
    const store = useGameStore.getState();
    const skill = store.skills.find(s => s.id === skillId);
    if (!skill) return;

    // Locate target
    let targetMob: Entity | undefined;
    const targetId = customTargetId || this.playerEntity.targetEntityId;
    if (targetId) {
      targetMob = this.monsters.find(m => m.id === targetId);
    }

    let tx = this.playerEntity.x;
    let tz = this.playerEntity.z;
    if (targetMob && targetMob.currentHp > 0) {
      tx = targetMob.x;
      tz = targetMob.z;
    }

    const now = performance.now();

    // Set animation pose
    this.playerEntity.state = 'attack';
    this.playerEntity.hitRecoveryEndTime = now + 400; // Attack posture lock lasts 400ms

    // Enter battle mode (combat state)
    this.triggerBattleMode(now);

    // Trigger visual spell effects and audio synthesized notes
    gameAudio.playSkillCast();
    const fxMesh = this.gameRenderer.createSkillVisualMesh(skillId, tx, tz, 0.05);
    
    this.activeEffects.push({
      id: `fx_skill_${Math.random()}_${now}`,
      type: skillId,
      mesh: fxMesh,
      age: 0,
      maxAge: skillId === 'thunder_storm' ? 45 : 25,
      x: tx,
      z: tz
    });

    // Execute direct combat impacts
    if (skillId === 'heal') {
      // Heal player
      const healAmt = Math.floor(this.playerEntity.maxHp * 0.35 + store.stats.int * 14);
      this.playerEntity.currentHp = Math.min(this.playerEntity.maxHp, this.playerEntity.currentHp + healAmt);
      this.floatingTextSpawner(`+${healAmt}`, '#10b981', 1.8, this.playerEntity.x, 2.5, this.playerEntity.z);
      store.addCombatLog(`Lanzado Heal: +${healAmt} HP recuperados.`, 'heal');
      gameAudio.playHeal();
    } else if (targetMob && targetMob.currentHp > 0) {
      // Offensive skill impacts
      let multiplier = 2.0;
      let logColor: 'skill' | 'system' = 'skill';

      if (skillId === 'bash') multiplier = 4.0 + (store.stats.str * 0.02);
      if (skillId === 'double_strafe') multiplier = 3.5 + (store.stats.dex * 0.035);
      if (skillId === 'sonic_blow') multiplier = 6.0 + (store.stats.str * 0.03);
      if (skillId === 'grimtooth') multiplier = 3.0;
      if (skillId === 'holy_light') multiplier = 2.8 + (store.stats.int * 0.03);
      if (skillId === 'falcon_strike') multiplier = 4.5; // blitz beat ignores defense!

      const rawDmg = Math.floor(store.stats.atk * multiplier);
      const randOffset = Math.floor((Math.random() - 0.5) * rawDmg * 0.15);
      const isCrit = Math.random() < (store.stats.luk * 0.005 + 0.05);

      let damage = Math.max(1, rawDmg + randOffset - (skillId === 'falcon_strike' ? 0 : targetMob.maxHp * 0.05));
      if (isCrit) damage = Math.floor(damage * 1.5);
      damage = Math.floor(damage);

      if (skillId === 'double_strafe') {
        const halfDmg = Math.floor(damage / 2);
        this.spawnProjectile('arrow', this.playerEntity, targetMob, halfDmg, isCrit);
        setTimeout(() => {
          if (!this.isDestroyed && targetMob && targetMob.currentHp > 0) {
            this.spawnProjectile('arrow', this.playerEntity, targetMob, halfDmg, isCrit);
          }
        }, 180);
        store.addCombatLog(`¡Lanzado ${skill.name}! Disparando flechas de proyectil en ráfaga doble...`, logColor);
      } else if (skillId === 'holy_light') {
        this.spawnProjectile('holy_light', this.playerEntity, targetMob, damage, isCrit);
        store.addCombatLog(`¡Lanzado ${skill.name}! Proyectil sagrado de luz divina en camino...`, logColor);
      } else {
        // Melee / Area instant skills damage application
        targetMob.currentHp = Math.max(0, targetMob.currentHp - damage);
        targetMob.state = 'hit';
        targetMob.hitRecoveryEndTime = now + 350;

        // Float flying damage texts
        this.floatingTextSpawner(
          isCrit ? `★ CRIT ${damage} ★` : `${damage}`, 
          isCrit ? '#f59e0b' : '#38bdf8', 
          isCrit ? 1.8 : 1.35, 
          targetMob.x, 2.2, targetMob.z
        );

        // Play impact audio notes
        gameAudio.playHit();
        this.screenShakeIntensity = isCrit ? 0.28 : 0.14;

        store.addCombatLog(`¡Lanzado ${skill.name}! Daño propinado: ${damage} HP a [${targetMob.name}].`, logColor);

        // Target update inside state
        store.updateTargetHp(targetMob.currentHp);

        // If dead trigger rewards EXP and loot drops
        if (targetMob.currentHp <= 0) {
          this.reapMonsterRewards(targetMob);
        }
      }
    }

    // Reset store state HUD instantly
    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
  }

  // --- 6. TICK MONSTER LOGIC & COMBAT ---
  private tickAutoCombat(now: number, dt: number) {
    if (this.playerEntity.state === 'death' || !this.playerEntity.targetEntityId) return;

    const targetMob = this.monsters.find(m => m.id === this.playerEntity.targetEntityId);
    if (!targetMob || targetMob.currentHp <= 0) {
      useGameStore.setState({ targetEntityId: null });
      this.playerEntity.targetEntityId = null;
      return;
    }

    const dist = Math.sqrt((targetMob.x - this.playerEntity.x) ** 2 + (targetMob.z - this.playerEntity.z) ** 2);
    
    // Proportional standard physical reach range
    const store = useGameStore.getState();
    const isSniper = store.jobClass === 'Sniper';
    const physicalReach = isSniper ? 9.0 : 2.2;

    if (dist <= physicalReach) {
      // Check Attack Speed cooldown (ASPD).
      // RO formula ASPD interval: msCooldown = 1000 * (1.6 - (aspd * 0.008))
      const attackTimerCooldown = Math.max(250, 1000 * (2.2 - (store.stats.aspd * 0.01)));

      if (this.playerEntity.animationTimer > attackTimerCooldown * 0.001) {
        // Attack posture triggers!
        this.playerEntity.state = 'attack';
        this.playerEntity.animationTimer = 0;
        this.playerEntity.hitRecoveryEndTime = now + 300;

        // Enter Battle mode!
        this.triggerBattleMode(now);

        // Perform combat attack math calculations
        const hitChance = Math.min(1.0, Math.max(0.05, (store.stats.hit - (targetMob.maxHp * 0.1)) / 100));
        const isHitSucceeded = Math.random() < hitChance;

        if (isHitSucceeded) {
          const rawDmg = store.stats.atk;
          const randOffset = Math.floor((Math.random() - 0.5) * rawDmg * 0.15);
          const isCrit = Math.random() < (store.stats.luk * 0.005 + 0.05);

          let damage = Math.floor(rawDmg + randOffset);
          if (isCrit) damage = Math.floor(damage * 1.5);

          if (isSniper) {
            // Sniper fires real-time arrow projectile!
            this.spawnProjectile('arrow', this.playerEntity, targetMob, damage, isCrit);
            store.addCombatLog(`Disparas flecha: ${damage} daño en camino a [${targetMob.name}].`, 'monster_hit');
          } else {
            // Melee instant hit!
            targetMob.currentHp = Math.max(0, targetMob.currentHp - damage);
            targetMob.state = 'hit';
            targetMob.hitRecoveryEndTime = now + 400; // soft hit lock

            this.floatingTextSpawner(
              isCrit ? `★ ${damage} ★` : `${damage}`, 
              isCrit ? '#f59e0b' : '#ef4444', 
              isCrit ? 1.6 : 1.25, 
              targetMob.x, 2.0, targetMob.z
            );

            gameAudio.playHit();
            this.screenShakeIntensity = isCrit ? 0.22 : 0.08;

            store.addCombatLog(`Atacas físicamente: ${damage} daño infligido a [${targetMob.name}].`, 'monster_hit');
            store.updateTargetHp(targetMob.currentHp);

            if (targetMob.currentHp <= 0) {
              this.reapMonsterRewards(targetMob);
            }
          }
        } else {
          // Missed attack!
          this.floatingTextSpawner('MISS', '#94a3b8', 1.0, targetMob.x, 2.0, targetMob.z);
          store.addCombatLog(`Atacas y fallas: golpe esquivado por [${targetMob.name}].`, 'system');
        }
      }
    } else {
      // Target is far, auto-route walk closer to target
      this.playerEntity.targetX = targetMob.x;
      this.playerEntity.targetZ = targetMob.z;
      this.playerEntity.state = 'move';
    }
  }

  // Reap experience base, job levels, and physics loot drops on dead monsters
  private reapMonsterRewards(mob: Entity) {
    const store = useGameStore.getState();
    mob.state = 'death';
    this.playerEntity.targetEntityId = null;
    store.setTarget(null);

    // Give EXP reward points
    const expBase = mob.type === 'boss_mvp' ? 12000 : (mob.mobType === 'poring' ? 15 : mob.mobType === 'poporing' ? 45 : 120);
    const expJob = mob.type === 'boss_mvp' ? 9500 : (mob.mobType === 'poring' ? 12 : mob.mobType === 'poporing' ? 36 : 95);

    // Level up visual triggered internally
    const curLevel = store.stats.level;
    const curJobLvl = store.stats.jobLevel;

    store.addExp(expBase, expJob);

    // Grab updated stats reference from global Zustand instance after edit
    const updatedStore = useGameStore.getState();
    const isLeveledUpCombined = updatedStore.stats.level > curLevel || updatedStore.stats.jobLevel > curJobLvl;

    if (isLeveledUpCombined) {
      gameAudio.playLevelUp();
      store.addCombatLog(`✨ ¡PROGRESO NIVEL UP! Has alcanzado Base: ${updatedStore.stats.level} / Job: ${updatedStore.stats.jobLevel} ✨`, 'system');
      
      // Floating level up banner
      this.floatingTextSpawner('★ LEVEL UP ★', '#eab308', 2.2, this.playerEntity.x, 3.2, this.playerEntity.z);

      // Golden fireworks glow cylindrical columns
      const upMesh = this.gameRenderer.createSkillVisualMesh('level_up', this.playerEntity.x, this.playerEntity.z, 0.05);
      this.activeEffects.push({
        id: `fx_lvl_${Math.random()}`,
        type: 'level_up',
        mesh: upMesh,
        age: 0,
        maxAge: 40,
        x: this.playerEntity.x,
        z: this.playerEntity.z
      });

      // Recover player to pristine max stats
      this.playerEntity.currentHp = updatedStore.stats.maxHp;
      this.playerEntity.currentSp = updatedStore.stats.maxSp;
      updatedStore.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
    } else {
      store.addCombatLog(`Matas a [${mob.name}]. +${expBase} EXP base, +${expJob} EXP job.`, 'system');
    }

    // Spawn direct physical item loot box falling physics!
    this.spawnDropLootChance(mob);

    // Respawn roamer mob timer
    setTimeout(() => {
      this.respawnMonster(mob.id, mob.mobType);
    }, 6000 + Math.random() * 8000);
  }

  // Respawn a dead monster
  private respawnMonster(id: string, customMobType?: any) {
    if (this.isDestroyed) return;
    const index = this.monsters.findIndex(m => m.id === id);
    if (index === -1) return;

    const r = 10 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const type = customMobType || 'poring';

    const maxHps = { poring: 80, poporing: 190, pecopeco: 380, boss_mvp: 8500 };
    const h = maxHps[type as keyof typeof maxHps] || 100;

    this.monsters[index] = {
      id: id,
      name: type === 'boss_mvp' ? 'BAPHOMET ★ MVP' : (type === 'poring' ? 'Poring Pink' : type === 'poporing' ? 'Poporing Tox' : 'PecoPeco Runner'),
      type: type === 'boss_mvp' ? 'boss_mvp' : 'monster',
      mobType: type as any,
      x: Math.cos(theta) * r,
      y: 0,
      z: Math.sin(theta) * r,
      facing: Math.random() > 0.5 ? 'right' : 'left',
      state: 'idle',
      currentHp: h,
      currentSp: 10,
      maxHp: h,
      maxSp: 10,
      targetEntityId: null,
      hitRecoveryEndTime: 0,
      animationTimer: 0,
      animationFrame: 0
    };

    if (type === 'boss_mvp') {
      useGameStore.getState().addCombatLog('★ ¡ALERTA! El Boss MVP Baphomet ha respawneado en el mapa ★', 'mvp');
    }
  }

  private spawnDropLootChance(mob: Entity) {
    const isMvp = mob.type === 'boss_mvp';
    
    // Create Ground item structure fields with horizontal and vertical velocities
    const coinDrop: GroundItem = {
      id: `loot_${Math.random()}_${Date.now()}`,
      name: isMvp ? 'MVP Coin' : (Math.random() > 0.4 ? 'Jellopy' : 'Sticky Mucus'),
      itemId: isMvp ? 'mvp_coin' : (Math.random() > 0.4 ? 'jellopy' : 'sticky_mucus'),
      x: mob.x,
      z: mob.z,
      y: 0.2, // starts just above ground
      quantity: 1,
      velX: (Math.random() - 0.5) * 4.5,
      velY: 10 + Math.random() * 4.5, // explosive upward vault
      velZ: (Math.random() - 0.5) * 4.5,
      bounceCount: 0
    };

    this.groundItems.push(coinDrop);

    // Mesh representation mapping
    const mesh = this.gameRenderer.spawnDropItemMesh(coinDrop);
    this.groundItemMeshes[coinDrop.id] = mesh;

    useGameStore.getState().addCombatLog(`[Loot Drop] Cayó una caja de item [${coinDrop.name}] de [${mob.name}].`, 'loot');
  }

  // Spawns flying physics projectile
  spawnProjectile(type: Projectile['type'], owner: Entity, target: Entity, damage: number, isCrit: boolean) {
    const id = `proj_${Math.random()}_${Date.now()}`;
    const projectile: Projectile = {
      id,
      type,
      x: owner.x,
      y: owner.y + 1.1, // launch from center bow height
      z: owner.z,
      speed: type === 'arrow' ? 0.38 : 0.28,
      targetEntityId: target.id,
      ownerEntityId: owner.id,
      damage,
      isCrit,
      spawnTime: Date.now(),
      height: 1.1
    };
    this.projectiles.push(projectile);
  }

  private impactProjectile(proj: Projectile, target: Entity) {
    const store = useGameStore.getState();

    // Damage calculations
    target.currentHp = Math.max(0, target.currentHp - proj.damage);
    target.state = 'hit';
    target.hitRecoveryEndTime = Date.now() + 180;

    // Trigger visual popup numbers
    const isMvp = target.type === 'boss_mvp';
    const numColor = proj.isCrit ? '#fdeb3a' : (target.type === 'player' ? '#f43f5e' : '#38bdf8');
    const scaleFactor = proj.isCrit ? 1.5 : 1.0;
    
    this.floatingTextSpawner(
      `${proj.isCrit ? '⭐ ' : ''}${Math.round(proj.damage)}`,
      numColor,
      scaleFactor,
      target.x,
      target.y + (isMvp ? 2.0 : 1.25),
      target.z
    );

    // Screen shaking feedback
    this.screenShakeIntensity = proj.isCrit ? 0.32 : 0.08;

    gameAudio.playHit();

    // Redraw target animations texture
    this.gameRenderer.createEntityTexture(target, 'none');

    // Sync HUD stores
    if (store.targetEntityId === target.id) {
      store.updateTargetHp(target.currentHp);
    }

    if (target.currentHp <= 0) {
      // Award experience and roll loot chances
      if (target.type !== 'player') {
        this.reapMonsterRewards(target);
      } else {
        this.executePlayerDeathState();
      }
    }
  }

  private openNpcDialogue(npc: Entity) {
    const store = useGameStore.getState();
    
    if (npc.npcType === 'kafra') {
      store.setNpcDialogue({
        npcId: npc.id,
        npcName: npc.name,
        npcType: 'kafra',
        text: '¡Hola aventurero! Bienvenido a los servicios premium de la Corporación Kafra en Prontera. ¿Cómo te gustaría que te asista hoy?',
        options: [
          { label: 'Otorga bendiciones divinas (AGI & Blessing Speed buffs)', actionParam: 'buffs' },
          { label: 'Heal: Restaurar HP/SP y recargar Red Potions', actionParam: 'heal' },
          { label: 'Pedir un paquete de Red Potions gratis (+15 pociones)', actionParam: 'buy_potions' },
          { label: 'Cerrar conversación', actionParam: 'close' }
        ]
      });
    } else if (npc.npcType === 'crusader_instructor') {
      store.setNpcDialogue({
        npcId: npc.id,
        npcName: npc.name,
        npcType: 'crusader_instructor',
        text: '¡Firme soldado! Quien domina la espada domina el campo de batalla. ¿Te interesa cambiar de clase de trabajo para estudiar nuevas destrezas de combate o necesitas consejos?',
        options: [
          { label: 'Cambiar de Trabajo a Lord Knight (Caballero)', actionParam: 'class_lord_knight' },
          { label: 'Cambiar de Trabajo a High Priest (Sacerdote)', actionParam: 'class_high_priest' },
          { label: 'Cambiar de Trabajo a Assassin Cross (Asesino)', actionParam: 'class_assassin' },
          { label: 'Cambiar de Trabajo a Sniper (Cazador)', actionParam: 'class_sniper' },
          { label: 'Cerrar conversación', actionParam: 'close' }
        ]
      });
    }
    
    gameAudio.playItemPickup(); // dialogue chiming sound
  }

  handleNpcAction(npcId: string, actionParam: string) {
    const store = useGameStore.getState();
    
    // Always clear dialogue first
    store.setNpcDialogue(null);

    if (actionParam === 'close') {
      store.addCombatLog('Conversación finalizada.', 'system');
      return;
    }

    if (actionParam === 'buffs') {
      // Award divine buffs to the player: Aggi/Blessing
      gameAudio.playHeal();
      store.addCombatLog('✨ ¡La Kafra Clarice te ha bendecido con Increase AGI y Blessing! Muévete mucho más rápido.', 'system');
      
      // Spawns spell visual rise
      const fxMesh = this.gameRenderer.createSkillVisualMesh('heal', this.playerEntity.x, this.playerEntity.z, 0.05);
      this.activeEffects.push({
        id: `effect_kafrabuff_${Math.random()}`,
        type: 'heal',
        mesh: fxMesh,
        age: 0,
        maxAge: 45,
        x: this.playerEntity.x,
        z: this.playerEntity.z
      });

      // Add Buffs to Zustand Store
      store.addBuff({
        id: 'increase_agi',
        name: 'Increase AGI',
        durationMs: 40000,
        maxDurationMs: 40000,
        icon: '👟',
        description: '+20 AGI! Velocidad de movimiento y ASPD aumentados.'
      });

      store.addBuff({
        id: 'blessing',
        name: 'Blessing',
        durationMs: 40000,
        maxDurationMs: 40000,
        icon: '✝',
        description: '+20 STR/INT/DEX! ATK, curas y casteo acelerados.'
      });

      // Apply modifiers directly to character stats
      const baseStats = store.stats;
      store.updateStats({
        agi: baseStats.agi + 20,
        str: baseStats.str + 20,
        int: baseStats.int + 20,
        dex: baseStats.dex + 20
      });
      
      this.playerEntity.maxHp = store.stats.maxHp;
      this.playerEntity.maxSp = store.stats.maxSp;
    }

    if (actionParam === 'heal') {
      // Full repair HP/SP and award potions
      gameAudio.playHeal();
      store.addCombatLog('💖 ¡Kafra Clarice ha restaurado tu HP/SP por completo y te ha provisto de elixires de Prontera! 💖', 'system');
      
      this.playerEntity.currentHp = this.playerEntity.maxHp;
      this.playerEntity.currentSp = this.playerEntity.maxSp;
      store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

      const fxMesh = this.gameRenderer.createSkillVisualMesh('heal', this.playerEntity.x, this.playerEntity.z, 0.05);
      this.activeEffects.push({
        id: `effect_kafraheal_${Math.random()}`,
        type: 'heal',
        mesh: fxMesh,
        age: 0,
        maxAge: 45,
        x: this.playerEntity.x,
        z: this.playerEntity.z
      });

      // Max out Red potions to 15
      store.setPotCount(15);
      const updatedInventory = store.inventory.map(item => {
        if (item.id === 'red_potion') {
          return { ...item, quantity: 15 };
        }
        return item;
      });
      useGameStore.setState({ inventory: updatedInventory });
    }

    if (actionParam === 'buy_potions') {
      gameAudio.playItemPickup();
      store.setPotCount(store.potCount + 15);
      store.addCombatLog('🛒 Has reabastecido tu inventario con +15 Red Potions de la Kafra Clarice.', 'loot');
      
      const updatedInventory = store.inventory.map(item => {
        if (item.id === 'red_potion') {
          return { ...item, quantity: item.quantity + 15 };
        }
        return item;
      });
      useGameStore.setState({ inventory: updatedInventory });
    }

    // Change Class handlers
    if (actionParam.startsWith('class_')) {
      const targetClassMap: Record<string, 'Lord Knight' | 'High Priest' | 'Assassin Cross' | 'Sniper'> = {
        'class_lord_knight': 'Lord Knight',
        'class_high_priest': 'High Priest',
        'class_assassin': 'Assassin Cross',
        'class_sniper': 'Sniper'
      };

      const selectedClass = targetClassMap[actionParam];
      if (selectedClass) {
        store.setJobClass(selectedClass);
        this.playerEntity.job = selectedClass;
        
        // Update stats and HP/SP
        this.playerEntity.currentHp = store.stats.maxHp;
        this.playerEntity.currentSp = store.stats.maxSp;
        this.playerEntity.maxHp = store.stats.maxHp;
        this.playerEntity.maxSp = store.stats.maxSp;

        store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

        // Flash beautiful Level Up visual sparkles!
        const fxMesh = this.gameRenderer.createSkillVisualMesh('level_up', this.playerEntity.x, this.playerEntity.z, 0.05);
        this.activeEffects.push({
          id: `levelup_${Math.random()}`,
          type: 'level_up',
          mesh: fxMesh,
          age: 0,
          maxAge: 60,
          x: this.playerEntity.x,
          z: this.playerEntity.z
        });

        gameAudio.playHeal();
        store.addCombatLog(`⚔ ¡Has cambiado tu clase de trabajo a ${selectedClass}! Nuevas habilidades asignadas.`, 'system');
        
        // Change texture to reflect new job class colors
        this.gameRenderer.createEntityTexture(this.playerEntity, store.headgear);
      }
    }
  }

  // --- 7. RETALIATING MONSTER AI INTELLIGENCE ---
  private tickMonsterSystem(now: number, dt: number) {
    if (this.playerEntity.state === 'death') {
      // Clear all roar targets
      this.monsters.forEach(m => { m.state = 'idle'; m.targetEntityId = null; });
      return;
    }

    const tickScale = dt * 60.0;

    this.monsters.forEach((mob) => {
      if (mob.currentHp <= 0) return;

      const dist = Math.sqrt((this.playerEntity.x - mob.x) ** 2 + (this.playerEntity.z - mob.z) ** 2);
      
      // Target player if hit, or if Aggresive boss (Baphomet has massive vision sense!)
      const visionLimit = mob.type === 'boss_mvp' ? 16.0 : 6.0;
      const isAggressive = mob.type === 'boss_mvp' || mob.mobType === 'pecopeco';

      if (dist <= visionLimit && (isAggressive || mob.targetEntityId)) {
        mob.targetEntityId = 'player_main';
        
        // Attack range of monsters
        const combatReach = mob.type === 'boss_mvp' ? 2.8 : 1.8;

        if (dist <= combatReach) {
          // Attack player
          mob.state = 'attack';
          const isBoss = mob.type === 'boss_mvp';
          const rechargeCooldown = isBoss ? 450 : 1200;

          if (mob.animationTimer > rechargeCooldown * 0.001) {
            mob.animationTimer = 0;
            // Strike damage calculation
            const store = useGameStore.getState();
            const hitScore = 150 + (isBoss ? 120 : 15);
            const fleeScore = store.stats.flee;

            const dodgePercent = Math.min(0.95, Math.max(0.05, (fleeScore - hitScore + 100) / 100));
            const playerEvaded = Math.random() < dodgePercent;

            if (playerEvaded) {
              // Miss!
              this.floatingTextSpawner('FLEE', '#94a3b8', 1.0, this.playerEntity.x, 2.0, this.playerEntity.z);
              store.addCombatLog(`[${mob.name}] te ataca y evades su golpe (FLEE).`, 'system');
            } else {
              // Pierce impact damage
              const strikeAtk = isBoss ? 280 : (mob.mobType === 'pecopeco' ? 45 : 18);
              const randVariation = Math.floor((Math.random() - 0.5) * strikeAtk * 0.1);
              let rawDmg = strikeAtk + randVariation - (store.stats.def * 0.15);
              
              let finalDmg = Math.floor(Math.max(1, rawDmg));
              
              this.playerEntity.currentHp = Math.max(0, this.playerEntity.currentHp - finalDmg);
              this.playerEntity.state = 'hit';
              this.playerEntity.hitRecoveryEndTime = now + 240; // temporary hitlock stun stagger frame

              // Trigger combat state / battle mode timeout
              this.triggerBattleMode(now);

              // Check and resolve casting interrupt
              if (this.activeCast) {
                const castSpellName = this.activeCast.skillName;
                this.activeCast = null;
                useGameStore.setState({ activeCast: null });

                this.floatingTextSpawner('INTERRUPTED!', '#ef4444', 1.0, this.playerEntity.x, 2.5, this.playerEntity.z);
                store.addCombatLog(`¡[${castSpellName}] es interrumpido por el golpe de [${mob.name}]!`, 'system');
                gameAudio.playFail();
              }

              this.floatingTextSpawner(`${finalDmg}`, '#f43f5e', isBoss ? 1.55 : 1.15, this.playerEntity.x, 2.0, this.playerEntity.z);
              gameAudio.playHit();

              store.addCombatLog(`¡[${mob.name}] te propina un golpe brutal! Pierdes ${finalDmg} HP.`, 'player_hit');

              // Sync store state
              store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

              if (this.playerEntity.currentHp <= 0) {
                this.executePlayerDeathState();
              }
            }
          }
        } else {
          // Walk closer to player
          if (mob.state !== 'attack' && mob.hitRecoveryEndTime < now) {
            mob.state = 'move';
          }
          const mSpeed = (mob.type === 'boss_mvp' ? 0.075 : 0.032) * tickScale;
          mob.facing = this.playerEntity.x > mob.x ? 'right' : 'left';
          
          const dx = this.playerEntity.x - mob.x;
          const dz = this.playerEntity.z - mob.z;

          mob.x += (dx / dist) * mSpeed;
          mob.z += (dz / dist) * mSpeed;
          mob.y = this.getGroundHeight(mob.x, mob.z);
        }
      } else {
        // Wandering standard idle stroll
        if (mob.hitRecoveryEndTime < now) {
          const moveSeed = Math.random();
          const wanderChance = 0.01 * tickScale;
          if (moveSeed < wanderChance) {
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
              mob.y = this.getGroundHeight(mob.x, mob.z);
            } else {
              mob.state = 'idle';
              mob.targetX = undefined;
              mob.targetZ = undefined;
            }
          }
        }
      }
    }

    );
  }

  // Handle player death
  private executePlayerDeathState() {
    this.playerEntity.state = 'death';
    this.playerEntity.targetEntityId = null;
    this.playerEntity.targetX = undefined;
    this.playerEntity.targetZ = undefined;

    const store = useGameStore.getState();
    store.setTarget(null);
    store.addCombatLog('☠ ¡HAS CAÍDO EN COMBAT! Escribe "Vivir de nuevo" o haz click en Revivir instantáneamente ☠', 'player_hit');
    gameAudio.playFail();
  }

  // Respawn / resurrect player
  revivePlayer() {
    const store = useGameStore.getState();
    
    this.playerEntity.state = 'idle';
    this.playerEntity.x = 0;
    this.playerEntity.z = 0;
    this.playerEntity.y = 0;
    this.playerEntity.targetX = undefined;
    this.playerEntity.targetZ = undefined;
    this.playerEntity.targetEntityId = null;
    this.playerEntity.currentHp = store.stats.maxHp;
    this.playerEntity.currentSp = store.stats.maxSp;

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
    store.setTarget(null);
    store.addCombatLog('✨ Has revivido en las coordenadas centrales de Prontera. ¡A batallar! ✨', 'system');
    gameAudio.playHeal();
  }

  // --- 8. TICK GENERAL COORDINATES MANAGEMENT ---
  private tickCoordinates(dt: number) {
    if (this.playerEntity.state === 'death') return;

    const store = useGameStore.getState();
    const tickScale = dt * 60.0;

    // Recovers HP/SP smoothly scaling
    const hpRegenRate = (0.04 + store.stats.vit * 0.011) * tickScale;
    this.playerEntity.currentHp = Math.min(this.playerEntity.maxHp, this.playerEntity.currentHp + hpRegenRate);

    const spRegenRate = (0.018 + store.stats.int * 0.006) * tickScale;
    this.playerEntity.currentSp = Math.min(this.playerEntity.maxSp, this.playerEntity.currentSp + spRegenRate);

    // Sync state
    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

    // Buff decay intervals simulation
    if (store.activeBuffs.length > 0) {
      const dtMs = dt * 1000;
      let updatedBuffs = store.activeBuffs.map(b => {
        return { ...b, durationMs: b.durationMs - dtMs };
      });

      const expired = updatedBuffs.filter(b => b.durationMs <= 0);
      updatedBuffs = updatedBuffs.filter(b => b.durationMs > 0);

      if (expired.length > 0) {
        expired.forEach(e => {
          store.addCombatLog(`⏳ El buff [${e.name}] ha expirado.`, 'system');
        });

        let agiSub = 0, strSub = 0, intSub = 0, dexSub = 0;
        expired.forEach(e => {
          if (e.id === 'increase_agi') agiSub += 20;
          if (e.id === 'blessing') {
            strSub += 20;
            intSub += 20;
            dexSub += 20;
          }
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

    // Simulate physics-governed Projectiles movement
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
        if (proj.y <= 0) {
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      const targetHeightOffset = target.type === 'boss_mvp' ? 1.6 : 0.85;
      const tY = target.y + targetHeightOffset;
      const pdx = target.x - proj.x;
      const pdy = tY - proj.y;
      const pdz = target.z - proj.z;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

      if (pdist < speedScale * 1.25) {
        this.impactProjectile(proj, target);
        this.projectiles.splice(i, 1);
      } else {
        proj.x += (pdx / pdist) * speedScale;
        proj.y += (pdy / pdist) * speedScale;
        proj.z += (pdz / pdist) * speedScale;
      }
    }

    // LOOT GRABBING: Auto pickups items when player coordinates step over them
    this.groundItems.forEach((item, index) => {
      // Simulate physical drop bouncy leaps with gravity acceleration
      if (item.velY !== undefined && item.velX !== undefined && item.velZ !== undefined) {
        const gravityAcc = -0.38;
        item.velY += gravityAcc * tickScale;

        item.x += item.velX * dt;
        item.y += item.velY * dt;
        item.z += item.velZ * dt;

        // Ground collision bounce boundary
        if (item.y <= 0.05) {
          item.y = 0.05;
          if (item.bounceCount !== undefined && item.bounceCount < 2) {
            item.velY = -item.velY * 0.45; // reverse leap velocity with loss multiplier
            item.velX *= 0.5;
            item.velZ *= 0.5;
            item.bounceCount++;
            gameAudio.playItemPickup(); // pleasant drop collision sound
          } else {
            item.velY = 0;
            item.velX = 0;
            item.velZ = 0;
          }
        }
      }

      const dist = Math.sqrt((item.x - this.playerEntity.x) ** 2 + (item.z - this.playerEntity.z) ** 2);
      if (dist < 1.35) {
        // Grab!
        store.addCombatLog(`¡Has recogido [${item.name}] x${item.quantity}!`, 'loot');

        // Sync collection items inside inventory store
        const inventory = store.inventory.map(inv => {
          if (inv.id === (item.itemId === 'mvp_coin' ? 'mvp_coin' : 'red_potion')) {
            return { ...inv, quantity: inv.quantity + item.quantity };
          }
          return inv;
        });

        if (item.itemId === 'red_potion') {
          store.setPotCount(store.potCount + item.quantity);
        }

        useGameStore.setState({ inventory });

        // Wipe mesh representation from stage
        const mesh = this.groundItemMeshes[item.id];
        if (mesh) {
          this.scene.remove(mesh);
          delete this.groundItemMeshes[item.id];
        }

        this.groundItems.splice(index, 1);
        gameAudio.playItemPickup();
      }
    });

    // --- CASE A: SIMULATION HANDLED BY MOBILE VIRTUAL JOYSTICK ---
    if (store.isJoystickEnabled && store.joystick.isActive) {
      // Cancel active casting if we move manually!
      if (this.activeCast) {
        const spellName = this.activeCast.skillName;
        this.activeCast = null;
        useGameStore.setState({ activeCast: null });
        this.floatingTextSpawner('CANCELLED', '#94a3b8', 1.0, this.playerEntity.x, 2.5, this.playerEntity.z);
        store.addCombatLog(`¡[${spellName}] cancelado por movimiento!`, 'system');
        gameAudio.playFail();
      }

      // Clear target route walking
      this.playerEntity.targetX = undefined;
      this.playerEntity.targetZ = undefined;
      this.interactingNpcId = null; // abort dialogues
      
      this.playerEntity.state = 'move';
      
      const angle = store.joystick.angle;
      const mag = store.joystick.distance / 60; // normalized magnitude fraction

      // Walk Speed calculated scaling with AGI
      const speed = (0.13 + store.stats.agi * 0.0018) * mag * tickScale;
      
      // Convert joystick flat angle directly to world movement displacement axis vectors!
      const displacementX = Math.cos(angle) * speed;
      const displacementZ = Math.sin(angle) * speed;

      this.playerEntity.x += displacementX;
      this.playerEntity.z += displacementZ;
      this.playerEntity.facing = displacementX > 0 ? 'right' : 'left';
      this.playerEntity.y = this.getGroundHeight(this.playerEntity.x, this.playerEntity.z);

      return; // Bystep coordinate target walking
    }

    // --- CASE B: SIMULATION HANDLED BY SCREEN TOUCH CLICKS PATH ROUTING ---
    if (this.playerEntity.targetX !== undefined && this.playerEntity.targetZ !== undefined) {
      const dx = this.playerEntity.targetX - this.playerEntity.x;
      const dz = this.playerEntity.targetZ - this.playerEntity.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Check proximity interaction trigger limit for locking-on friendly NPC
      if (this.interactingNpcId) {
        const npc = this.npcs.find(n => n.id === this.interactingNpcId);
        if (npc) {
          const distanceToNpc = Math.sqrt((npc.x - this.playerEntity.x) ** 2 + (npc.z - this.playerEntity.z) ** 2);
          if (distanceToNpc < 1.95) {
            // Arrived near NPC, halt movement coordinates ticking
            this.playerEntity.state = 'idle';
            this.playerEntity.targetX = undefined;
            this.playerEntity.targetZ = undefined;
            this.playerEntity.facing = (npc.x > this.playerEntity.x) ? 'right' : 'left';

            this.interactingNpcId = null;

            // Instantly summon conversation dialog elements!
            this.openNpcDialogue(npc);
            return;
          }
        }
      }

      if (dist > 0.3) {
        this.playerEntity.facing = dx > 0 ? 'right' : 'left';
        
        const walkSpeed = (0.13 + store.stats.agi * 0.0018) * tickScale;
        this.playerEntity.x += (dx / dist) * walkSpeed;
        this.playerEntity.z += (dz / dist) * walkSpeed;
        this.playerEntity.y = this.getGroundHeight(this.playerEntity.x, this.playerEntity.z);
      } else {
        // Arrived at coordinates target destination
        this.playerEntity.state = 'idle';
        this.playerEntity.targetX = undefined;
        this.playerEntity.targetZ = undefined;
        this.interactingNpcId = null;
      }
    }
  }

  private getGroundHeight(x: number, z: number): number {
    return 0; // flat grassland
  }

  // Spawns damage numeric popups floating up
  private floatingTextSpawner(text: string, color: string, scaleSize: number, x: number, y: number, z: number) {
    const id = `dmg_${Math.random()}_${Date.now()}`;
    const txtInstance = {
      id,
      text,
      color,
      size: scaleSize,
      x, y, z,
      velX: (Math.random() - 0.5) * 0.065,
      velY: 0.16 + Math.random() * 0.08,
      velZ: (Math.random() - 0.5) * 0.065,
      age: 0,
      maxAge: 38
    };

    this.floatingTexts.push(txtInstance);
  }

  private addTouchIndicatorInstance(x: number, z: number, type: TouchIndicator['type']) {
    const id = `indic_${Math.random()}`;
    const data: TouchIndicator = {
      id,
      x,
      y: 0.05,
      z,
      age: 0,
      maxAge: type === 'target' ? 120 : 22, // target stays longer while focused on mobs
      type
    };

    // Instantiate mesh representation mapping
    const mesh = this.gameRenderer.spawnTouchIndicator(data);
    this.touchIndicators.push({ id, data, mesh });
  }

  // --- 9. SYNCHRONIZE THREE.JS VISUAL BILLBOARDS ---
  private updateBillboards() {
    const store = useGameStore.getState();

    // 1. Sync player billboard
    this.updateSingleEntityBillboard(this.playerEntity, store.headgear);

    // 2. Sync roaming monsters billboards
    this.monsters.forEach((mob) => {
      this.updateSingleEntityBillboard(mob, 'none');
    });

    // 2.5. Sync NPCs billboards
    this.npcs.forEach((npc) => {
      this.updateSingleEntityBillboard(npc, 'none');
    });

    // 3. Update ground physical falling items
    this.groundItems.forEach((item) => {
      const mesh = this.groundItemMeshes[item.id];
      if (mesh) {
        // If has physics coordinates handling, use item.y directly, else bob gently
        if (item.velY !== undefined) {
          mesh.position.set(item.x, item.y, item.z);
        } else {
          mesh.position.set(item.x, 0.22 + Math.abs(Math.sin(performance.now() * 0.005)) * 0.18, item.z);
        }
        mesh.rotation.y += 0.015;
      }
    });

    // 4. Update projectile meshes
    this.projectiles.forEach((proj) => {
      let mesh = this.projectileMeshes[proj.id];
      if (!mesh) {
        mesh = (this.gameRenderer as any).spawnProjectileMesh(proj.type, proj.x, proj.y, proj.z);
        this.projectileMeshes[proj.id] = mesh;
      }
      mesh.position.set(proj.x, proj.y, proj.z);
    });

    // Wipe any redundant projectile meshes that represent destroyed projectiles
    Object.keys(this.projectileMeshes).forEach((key) => {
      if (!this.projectiles.some(p => p.id === key)) {
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
      // Lazy construct sprite mesh mapping
      const tex = this.gameRenderer.createEntityTexture(entity, headgear);
      if (!tex) return;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        shadowSide: THREE.DoubleSide
      });
      sprite = new THREE.Sprite(mat);
      
      // Proportional visual scales mapping
      const isBoss = entity.type === 'boss_mvp';
      const scaleFactor = isBoss ? 4.9 : (entity.mobType === 'pecopeco' ? 2.5 : (entity.mobType ? 1.8 : 2.5));

      sprite.scale.set(scaleFactor, scaleFactor, 1);

      this.scene.add(sprite);
      this.entityMeshes[entity.id] = sprite;
    } else {
      // Refresh texture if state changed to keep animation visuals crisp!
      const tex = this.gameRenderer.createEntityTexture(entity, headgear);
      if (tex) {
        sprite.material.map?.dispose();
        sprite.material.map = tex;
        sprite.material.needsUpdate = true;
      }
    }

    // Set sprite coordinate details
    sprite.position.set(entity.x, entity.y + (entity.type === 'boss_mvp' ? 2.0 : 0.9), entity.z);
  }

  // --- 10. DYNAMIC TICK RUNTIMES AND CLEAN UPS SYSTEMS ---
  private fixedTick(now: number, dt: number) {
    // 1. Queue Input Buffer consumption ticker
    this.tickInputBuffer(now);

    // 2. Coordinates walking translation
    this.tickCoordinates(dt);

    // 2.5 Active casting ticking and completion resolver
    this.tickActiveCasting(dt);

    // 2.7 Battle mode combat state decay
    if (useGameStore.getState().battleMode && now > this.battleModeEndTime) {
      useGameStore.setState({ battleMode: false });
    }

    // 2.9 Run World Runtime simulation for real-time spatial organization & physical crowd pushing
    if (this.worldRuntime) {
      this.worldRuntime.update(dt, now);
    }

    // 3. Auto physical combat ticker
    this.tickAutoCombat(now, dt);

    // 4. Roaming monster behaviors and retaliating AI loop
    this.tickMonsterSystem(now, dt);
  }

  private renderTick(delta: number, timeSec: number) {
    // Decay camera shake smoothly
    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity *= Math.pow(0.1, delta);
    }

    // 1. Process custom touch arrows indicators
    this.touchIndicators.forEach((indObj, index) => {
      const data = indObj.data;
      const mesh = indObj.mesh;

      data.age += delta * 60; // progress frame ticker

      if (data.type === 'move') {
        const progress = data.age / data.maxAge;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 1.0 - progress;
        // Expand ring outward
        mesh.scale.set(1 + progress * 2.8, 1 + progress * 2.8, 1);
      } else if (data.type === 'target') {
        // Red revolving crosshair around targeted mob!
        mesh.rotation.z += 0.03;
        
        // Ping-pong expand circle scale pulsating
        const scaleFreq = 1.0 + Math.sin(performance.now() * 0.01) * 0.15;
        mesh.scale.set(scaleFreq * 1.5, scaleFreq * 1.5, 1);

        // Keep revolving track locked coordinates under mobile monster
        const focusedMob = this.monsters.find(m => m.id === this.playerEntity.targetEntityId);
        if (focusedMob && focusedMob.currentHp > 0) {
          mesh.position.set(focusedMob.x, 0.05, focusedMob.z);
        } else {
          // Monster dead, expire indicator instantly
          data.age = data.maxAge;
        }
      }

      if (data.age >= data.maxAge) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.touchIndicators.splice(index, 1);
      }
    });

    // 2. Proportional physics tickers on Floating numeric damage text popups
    this.floatingTexts.forEach((txt, index) => {
      txt.age += delta * 60; // age ticking
      const frameScale = delta * 60;

      // Parabolic velocity dragging vectors
      txt.x += txt.velX * frameScale;
      txt.y += txt.velY * frameScale;
      txt.z += txt.velZ * frameScale;

      txt.velY -= 0.0125 * frameScale; // pulls down gravitationally

      let sprite = this.effectMeshes[txt.id] as any;
      if (!sprite) {
        // Dynamically create floating text sprite texture
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 160, 48);
          ctx.font = `bold ${Math.floor(26 * txt.size)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = txt.color;
          // Outline for extreme readability
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 4;
          ctx.strokeText(txt.text, 80, 32);
          ctx.fillText(txt.text, 80, 32);
        }

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 1, 1);
        this.scene.add(sprite);
        this.effectMeshes[txt.id] = sprite;
      }

      sprite.position.set(txt.x, txt.y, txt.z);

      if (txt.age >= txt.maxAge) {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        delete this.effectMeshes[txt.id];
        this.floatingTexts.splice(index, 1);
      }
    });

    // 3. Process active spell structures meshes AGE
    this.activeEffects.forEach((fx, index) => {
      fx.age += delta * 60;
      const progress = fx.age / fx.maxAge;

      const mesh = fx.mesh;

      if (fx.type === 'heal') {
        const ring = mesh.children[0] as THREE.Mesh;
        if (ring) {
          (ring.material as THREE.Material).opacity = (1 - progress) * 0.7;
          ring.scale.set(1 + progress * 2.1, 1 + progress * 2.1, 1);
        }
        // Rising sparkle lines
        mesh.children.slice(1).forEach((lineObj) => {
          lineObj.position.y += 0.035 * (delta * 60);
          (lineObj as any).material.opacity = (1 - progress) * 0.65;
        });
      } else if (fx.type === 'bash' || fx.type === 'sonic_blow') {
        const slash = mesh.children[0] as THREE.Mesh;
        if (slash) {
          (slash.material as THREE.Material).opacity = (1 - progress) * 0.85;
          slash.rotation.z += 0.12 * (delta * 60);
          slash.scale.set(1 + progress, 1 + progress, 1);
        }
      } else if (fx.type === 'thunder_storm') {
        mesh.rotation.y += 0.05 * (delta * 60);
        const cyl = mesh.children[0] as THREE.Mesh;
        if (cyl) {
          (cyl.material as THREE.Material).opacity = (1 - progress) * 0.5;
          cyl.scale.set(1 + progress * 0.4, 1, 1 + progress * 0.4);
        }
      } else if (fx.type === 'level_up') {
        const points = mesh.children[0] as THREE.Points;
        if (points) {
          (points.material as THREE.Material).opacity = 1 - progress;
          points.position.y += 0.065 * (delta * 60);
        }
      }

      if (fx.age >= fx.maxAge) {
        this.scene.remove(mesh);
        // Deep clean nested geometries
        mesh.traverse((node: any) => {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            if (Array.isArray(node.material)) node.material.forEach((m: any) => m.dispose());
            else node.material.dispose();
          }
        });
        this.activeEffects.splice(index, 1);
      }
    });

    // 4. Render Billboards updates
    this.updateBillboards();

    // 5. Dynamic Camera follows character position with fixed offset + screen shake!
    const shakeOffsetX = (Math.random() - 0.5) * this.screenShakeIntensity * 3.5;
    const shakeOffsetY = (Math.random() - 0.5) * this.screenShakeIntensity * 3.5;

    this.camera.position.set(
      this.playerEntity.x + shakeOffsetX, 
      this.playerEntity.y + 16 + shakeOffsetY, 
      this.playerEntity.z + 22
    );

    this.camera.lookAt(this.playerEntity.x, this.playerEntity.y + 0.8, this.playerEntity.z);

    // Standard high-render tick pipeline draws Three.js frames
    this.renderer.render(this.scene, this.camera);
  }

  // CORE TICK FRAME CONTROLLER
  private animate() {
    if (this.isDestroyed) return;
    this.animationId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    // Cap maximum threshold frame jump (ignores sudden freeze lags)
    const delta = Math.min(this.clock.getDelta(), 0.15);
    const secs = now * 0.001;

    this.accumulator += delta;

    // --- GAME ENGINE DETECTS FIXED TICKS FOR SIMULATION ---
    while (this.accumulator >= this.fixedTimeStep) {
      this.fixedTick(now, this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
    }

    // --- RENDER TICK CYCLE (HIGH REFRESH SMOOTH RENDER AT FULL SPEED) ---
    this.renderTick(delta, secs);
  }

  // Deep memory clean up
  destroy() {
    this.isDestroyed = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    window.removeEventListener('resize', this.handleResize);
    
    // Dispose Three.js render targets and resources
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
