import { Entity, CharacterStats } from '../types';
import { CombatSystem } from '../combat';
import { EffectsSystem } from '../effects';
import { gameAudio } from '../audio';
import { gameEventBus } from '../core/EventBus';
import { GameContext } from '../core/GameContext';

// ============================================================================
// PLAYER CONTROLLER - Movimiento y input del jugador
// ============================================================================
// Extraído de engine.ts para separar responsabilidades.
// Maneja: movimiento (touch/joystick), targeting, y interacción con NPCs.
// ============================================================================

export interface MovementCallbacks {
  onNpcInteract?: (npc: Entity) => void;
}

export interface PlayerControllerConfig {
  playerEntity: Entity;
  monsters: Entity[];
  npcs: Entity[];
  combatSystem: CombatSystem;
  effectsSystem: EffectsSystem;
  context: GameContext;
}

export class PlayerController {
  private playerEntity: Entity;
  private monsters: Entity[];
  private npcs: Entity[];
  private combatSystem: CombatSystem;
  private effectsSystem: EffectsSystem;
  private context: GameContext;
  private callbacks: MovementCallbacks = {};

  constructor(config: PlayerControllerConfig) {
    this.playerEntity = config.playerEntity;
    this.monsters = config.monsters;
    this.npcs = config.npcs;
    this.combatSystem = config.combatSystem;
    this.effectsSystem = config.effectsSystem;
    this.context = config.context;
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
    const store = this.context.store;
    if (!store.isJoystickEnabled() || !store.getJoystickState().isActive) return false;
    if (this.playerEntity.state === 'death') return false;

    // Cancel active casting
    if (this.combatSystem.getActiveCast()) {
      this.combatSystem.cancelCast('movement');
    }

    this.playerEntity.targetX = undefined;
    this.playerEntity.targetZ = undefined;
    this.playerEntity.state = 'move';

    const joystick = store.getJoystickState();
    const stats = store.getStats();
    const angle = joystick.angle;
    const mag = joystick.distance / 60;
    const speed = (0.13 + stats.agi * 0.0018) * mag * tickScale;

    this.playerEntity.x += Math.cos(angle) * speed;
    this.playerEntity.z += Math.sin(angle) * speed;
    this.playerEntity.facing = Math.cos(angle) > 0 ? 'right' : 'left';
    this.playerEntity.y = 0;
    return true;
  }

  tickTouchMovement(dt: number, tickScale: number): void {
    if (this.playerEntity.state === 'death') return;
    const store = this.context.store;

    if (this.playerEntity.targetX !== undefined && this.playerEntity.targetZ !== undefined) {
      const dx = this.playerEntity.targetX - this.playerEntity.x;
      const dz = this.playerEntity.targetZ - this.playerEntity.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.3) {
        this.playerEntity.facing = dx > 0 ? 'right' : 'left';
        const stats = store.getStats();
        const walkSpeed = (0.13 + stats.agi * 0.0018) * tickScale;
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
    const store = this.context.store;
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
    const store = this.context.store;
    const stats = store.getStats();
    this.playerEntity.state = 'idle';
    this.playerEntity.x = 0;
    this.playerEntity.z = 0;
    this.playerEntity.y = 0;
    this.playerEntity.targetX = undefined;
    this.playerEntity.targetZ = undefined;
    this.playerEntity.targetEntityId = null;
    this.playerEntity.currentHp = stats.maxHp;
    this.playerEntity.currentSp = stats.maxSp;

    store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);
    store.setTarget(null);
    store.addCombatLog('✨ Has revivido en las coordenadas centrales de Prontera. ¡A batallar! ✨', 'system');
    gameAudio.playHeal();
  }
}
