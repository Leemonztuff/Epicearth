import * as THREE from 'three';
import { Entity, InputBufferItem, TouchIndicator } from './types';
import { useGameStore } from './state';

interface ActiveTouch {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isJoystick: boolean;
}

// ============================================================================
// ENTITY LOOKUP INTERFACE
// ============================================================================
// Permite a InputHandler encontrar entidades por sprite sin violar
// encapsulamiento del renderer. Renderer expone esta interfaz.
// ============================================================================
export interface EntityLookup {
  getCamera(): THREE.PerspectiveCamera;
  getEntitySprite(entityId: string): THREE.Sprite | undefined;
  getSpriteEntityId(sprite: THREE.Sprite): string | undefined;
}

export class InputHandler {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private activeTouchPoints = new Map<number, ActiveTouch>();
  private joystickTouchId: number | null = null;

  private renderer: THREE.WebGLRenderer;
  private entityLookup: EntityLookup;
  private playerEntity: Entity;
  private monsters: Entity[];
  private npcs: Entity[];
  private groundItems: { x: number; z: number; id: string }[];
  private interactingNpcId: string | null = null;

  private onMove: (coords: { x: number; z: number }) => void = () => {};
  private onTarget: (targetId: string) => void = () => {};
  private onNpcInteract: (npc: Entity) => void = () => {};
  private onItemLoot: (item: { x: number; z: number }) => void = () => {};

  constructor(
    renderer: THREE.WebGLRenderer,
    entityLookup: EntityLookup,
    playerEntity: Entity,
    monsters: Entity[],
    npcs: Entity[],
    groundItems: { x: number; z: number; id: string }[]
  ) {
    this.renderer = renderer;
    this.entityLookup = entityLookup;
    this.playerEntity = playerEntity;
    this.monsters = monsters;
    this.npcs = npcs;
    this.groundItems = groundItems;
    this.setupListeners();
  }

  setCallbacks(callbacks: {
    onMove?: (coords: { x: number; z: number }) => void;
    onTarget?: (targetId: string) => void;
    onNpcInteract?: (npc: Entity) => void;
    onItemLoot?: (item: { x: number; z: number }) => void;
  }) {
    if (callbacks.onMove) this.onMove = callbacks.onMove;
    if (callbacks.onTarget) this.onTarget = callbacks.onTarget;
    if (callbacks.onNpcInteract) this.onNpcInteract = callbacks.onNpcInteract;
    if (callbacks.onItemLoot) this.onItemLoot = callbacks.onItemLoot;
  }

  getInteractingNpcId(): string | null {
    return this.interactingNpcId;
  }

  setInteractingNpcId(id: string | null) {
    this.interactingNpcId = id;
  }

  private setupListeners() {
    const el = this.renderer.domElement;

    const preventDefault = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', preventDefault, { passive: false });
    el.addEventListener('touchmove', preventDefault, { passive: false });

    el.addEventListener('touchstart', (e: TouchEvent) => this.handleTouchStart(e), { passive: false });
    el.addEventListener('touchmove', (e: TouchEvent) => this.handleTouchMove(e), { passive: false });
    el.addEventListener('touchend', (e: TouchEvent) => this.handleTouchEnd(e), { passive: false });
    el.addEventListener('mousedown', (e: MouseEvent) => this.handleMouseDown(e));
  }

  private handleTouchStart(e: TouchEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const store = useGameStore.getState();

    Array.from(e.changedTouches).forEach((t) => {
      const touchX = t.clientX - rect.left;
      const touchY = t.clientY - rect.top;

      const isLeftZone = touchX < rect.width * 0.45;
      const wantsJoystick = store.isJoystickEnabled && isLeftZone && this.joystickTouchId === null;

      if (wantsJoystick) {
        this.joystickTouchId = t.identifier;
        this.activeTouchPoints.set(t.identifier, {
          startX: touchX, startY: touchY,
          currentX: touchX, currentY: touchY,
          isJoystick: true
        });
        store.updateJoystick({
          isActive: true, startX: touchX, startY: touchY,
          currentX: touchX, currentY: touchY,
          distance: 0, angle: 0, normalizedX: 0, normalizedY: 0
        });
      } else {
        this.activeTouchPoints.set(t.identifier, {
          startX: touchX, startY: touchY,
          currentX: touchX, currentY: touchY,
          isJoystick: false
        });
        this.triggerRaycast(touchX, touchY, rect.width, rect.height, 'touch');
      }
    });
  }

  private handleTouchMove(e: TouchEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const store = useGameStore.getState();

    Array.from(e.touches).forEach((t) => {
      const touchX = t.clientX - rect.left;
      const touchY = t.clientY - rect.top;
      const info = this.activeTouchPoints.get(t.identifier);

      if (info) {
        info.currentX = touchX;
        info.currentY = touchY;

        if (info.isJoystick) {
          const dx = touchX - info.startX;
          const dy = touchY - info.startY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const maxRadius = 60;
          const clampedDist = Math.min(distance, maxRadius);
          const angle = Math.atan2(dy, dx);
          const normX = (clampedDist * Math.cos(angle)) / maxRadius;
          const normY = -(clampedDist * Math.sin(angle)) / maxRadius;

          store.updateJoystick({
            currentX: info.startX + Math.cos(angle) * clampedDist,
            currentY: info.startY + Math.sin(angle) * clampedDist,
            distance: clampedDist, angle,
            normalizedX: normX, normalizedY: normY
          });
        }
      }
    });
  }

  private handleTouchEnd(e: TouchEvent) {
    const store = useGameStore.getState();

    Array.from(e.changedTouches).forEach((t) => {
      if (t.identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        store.updateJoystick({
          isActive: false, normalizedX: 0, normalizedY: 0, distance: 0
        });
      }
      this.activeTouchPoints.delete(t.identifier);
    });
  }

  private handleMouseDown(e: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;
    this.triggerRaycast(touchX, touchY, rect.width, rect.height, 'mouse');
  }

  private triggerRaycast(screenX: number, screenY: number, width: number, height: number, source: 'touch' | 'mouse') {
    if (this.playerEntity.state === 'death') return;

    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -(screenY / height) * 2 + 1;
    this.mouse.set(ndcX, ndcY);

    const camera = this.entityLookup.getCamera();
    if (!camera) return;

    this.raycaster.setFromCamera(this.mouse, camera);

    // Build sprite array for raycasting (exclude player)
    const spriteArray: THREE.Sprite[] = [];
    const allEntities = [...this.monsters, ...this.npcs];
    for (const entity of allEntities) {
      const sprite = this.entityLookup.getEntitySprite(entity.id);
      if (sprite) spriteArray.push(sprite);
    }

    const mobHits = this.raycaster.intersectObjects(spriteArray);
    if (mobHits.length > 0) {
      const selectedSprite = mobHits[0].object as THREE.Sprite;
      const matchedEntityId = this.entityLookup.getSpriteEntityId(selectedSprite);

      if (matchedEntityId) {
        const matchedMob = this.monsters.find(m => m.id === matchedEntityId);
        const matchedNpc = !matchedMob ? this.npcs.find(n => n.id === matchedEntityId) : undefined;

        if (matchedMob && matchedMob.currentHp > 0) {
          this.onTarget(matchedMob.id);
          return;
        }
        if (matchedNpc) {
          this.onMove({ x: matchedNpc.x, z: matchedNpc.z });
          this.interactingNpcId = matchedNpc.id;
          this.onNpcInteract(matchedNpc);
          return;
        }
      }
    }

    const testPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(testPlane, worldPoint)) {
      let clickedItem = this.groundItems.find(item =>
        Math.sqrt((item.x - worldPoint.x) ** 2 + (item.z - worldPoint.z) ** 2) < 1.8
      );

      if (clickedItem) {
        this.onMove({ x: clickedItem.x, z: clickedItem.z });
      } else {
        this.onMove({ x: worldPoint.x, z: worldPoint.z });
      }
    }
  }

  destroy() {
    this.activeTouchPoints.clear();
  }
}
