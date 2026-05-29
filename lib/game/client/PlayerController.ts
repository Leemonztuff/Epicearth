import { Entity, CharacterStats } from '../types';
import { useGameStore } from '../state';
import { CombatSystem } from '../combat';
import { EffectsSystem } from '../effects';
import { gameAudio } from '../audio';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// PLAYER CONTROLLER - Movimiento y input del jugador
// ============================================================================
// Extraído de engine.ts para separar responsabilidades.
// Maneja: movimiento (touch/joystick), targeting, y interacción con NPCs.
// ============================================================================

export interface MovementCallbacks {
  onNpcInteract?: (npc: Entity) => void;
}

export class PlayerController {
  private playerEntity: Entity;
  private monsters: Entity[];
  private npcs: Entity[];
  private combatSystem: CombatSystem;
  private effectsSystem: EffectsSystem;
  private callbacks: MovementCallbacks = {};

  constructor(
    playerEntity: Entity,
    monsters: Entity[],
    npcs: Entity[],
    combatSystem: CombatSystem,
    effectsSystem: EffectsSystem
  ) {
    this.playerEntity = playerEntity;
    this.monsters = monsters;
    this.npcs = npcs;
    this.combatSystem = combatSystem;
    this.effectsSystem = effectsSystem;
  }

  setCallbacks(callbacks: MovementCallbacks): void {
    this.callbacks = callbacks;
  }

  // --- MOVEMENT ---

  handleMove(coords: { x: number; z: number }): void {
    if (this.playerEntity.state === 'death') return;

    // Cancel active casting via proper method
    if (this.combatSystem.getActiveCast()) {
      this.combatSystem.cancelCast('movement');
    }

    this.playerEntity.targetX = coords.x;
    this.playerEntity.targetZ = coords.z;
    this.playerEntity.state = 'move';

    this.effectsSystem.spawnTouchIndicator(coords.x, coords.z, 'move');
  }

  tickJoystickMovement(dt: number, tickScale: number): boolean {
    const store = useGameStore.getState();
    if (!store.isJoystickEnabled || !store.joystick.isActive) return false;
    if (this.playerEntity.state === 'death') return false;

    // Cancel active casting
    if (this.combatSystem.getActiveCast()) {
      this.combatSystem.cancelCast('movement');
    }

    this.playerEntity.targetX = undefined;
    this.playerEntity.targetZ = undefined;
    this.playerEntity.state = 'move';

    const angle = store.joystick.angle;
    const mag = store.joystick.distance / 60;
    const speed = (0.13 + store.stats.agi * 0.0018) * mag * tickScale;

    this.playerEntity.x += Math.cos(angle) * speed;
    this.playerEntity.z += Math.sin(angle) * speed;
    this.playerEntity.facing = Math.cos(angle) > 0 ? 'right' : 'left';
    this.playerEntity.y = 0;
    return true;
  }

  tickTouchMovement(dt: number, tickScale: number): void {
    if (this.playerEntity.state === 'death') return;
    const store = useGameStore.getState();

    if (this.playerEntity.targetX !== undefined && this.playerEntity.targetZ !== undefined) {
      const dx = this.playerEntity.targetX - this.playerEntity.x;
      const dz = this.playerEntity.targetZ - this.playerEntity.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.3) {
        this.playerEntity.facing = dx > 0 ? 'right' : 'left';
        const walkSpeed = (0.13 + store.stats.agi * 0.0018) * tickScale;
        this.playerEntity.x += (dx / dist) * walkSpeed;
        this.playerEntity.z += (dz / dist) * walkSpeed;
        this.playerEntity.y = 0;
      } else {
        this.playerEntity.state = 'idle';
        this.playerEntity.targetX = undefined;
        this.playerEntity.targetZ = undefined;
      }
    }
  }

  // --- TARGETING ---

  handleTarget(targetId: string): void {
    const store = useGameStore.getState();
    const mob = this.monsters.find(m => m.id === targetId);
    if (mob && mob.currentHp > 0) {
      this.playerEntity.targetEntityId = mob.id;
      this.playerEntity.facing = mob.x < this.playerEntity.x ? 'left' : 'right';
      store.setTarget(mob.id, mob.name, mob.currentHp, mob.maxHp);
      store.addCombatLog(`Target lock: enfocando en [${mob.name}] LV: 45.`, 'system');
      this.effectsSystem.spawnTouchIndicator(mob.x, mob.z, 'target');
    }
  }

  // --- NPC INTERACTION ---

  handleNpcInteract(npc: Entity): void {
    this.callbacks.onNpcInteract?.(npc);
  }

  tickNpcProximity(interactingNpcId: string | null): void {
    if (!interactingNpcId) return;

    const npc = this.npcs.find(n => n.id === interactingNpcId);
    if (!npc) return;

    const dist = Math.sqrt(
      (npc.x - this.playerEntity.x) ** 2 + (npc.z - this.playerEntity.z) ** 2
    );

    if (dist < 1.95) {
      this.playerEntity.state = 'idle';
      this.playerEntity.targetX = undefined;
      this.playerEntity.targetZ = undefined;
      this.playerEntity.facing = npc.x > this.playerEntity.x ? 'right' : 'left';

      this.callbacks.onNpcInteract?.(npc);
    }
  }

  // --- REVIVE ---

  revivePlayer(): void {
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
}
