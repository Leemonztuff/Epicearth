import { Entity, JobClass } from './types';
import { gameAudio } from './audio';
import { GameContext } from './core/GameContext';

// ============================================================================
// NPC SYSTEM - Interacciones y diálogos
// ============================================================================
// Usa GameContext para acceso al state (sin imports directos de Zustand).
// ============================================================================

export interface NpcDialogue {
  npcId: string;
  npcName: string;
  npcType: 'kafra' | 'crusader_instructor';
  text: string;
  options: { label: string; actionParam: string }[];
}

export interface NpcSystemConfig {
  playerEntity: Entity;
  npcs: Entity[];
  context: GameContext;
}

export class NpcSystem {
  private playerEntity: Entity;
  private npcs: Entity[];
  private context: GameContext;

  private onEffectSpawn: (type: string, x: number, z: number) => void = () => {};
  private onClassChange: (job: JobClass) => void = () => {};

  constructor(config: NpcSystemConfig) {
    this.playerEntity = config.playerEntity;
    this.npcs = config.npcs;
    this.context = config.context;
  }

  setCallbacks(callbacks: {
    onEffectSpawn?: (type: string, x: number, z: number) => void;
    onClassChange?: (job: JobClass) => void;
  }) {
    if (callbacks.onEffectSpawn) this.onEffectSpawn = callbacks.onEffectSpawn;
    if (callbacks.onClassChange) this.onClassChange = callbacks.onClassChange;
  }

  getNpcById(id: string): Entity | undefined {
    return this.npcs.find(n => n.id === id);
  }

  openDialogue(npc: Entity): NpcDialogue | null {
    if (npc.npcType === 'kafra') {
      gameAudio.playItemPickup();
      return {
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
      };
    }

    if (npc.npcType === 'crusader_instructor') {
      gameAudio.playItemPickup();
      return {
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
      };
    }

    return null;
  }

  handleAction(npcId: string, actionParam: string) {
    const store = this.context.store;
    const inventory = this.context.inventory;
    store.setNpcDialogue(null);

    if (actionParam === 'close') {
      store.addCombatLog('Conversación finalizada.', 'system');
      return;
    }

    if (actionParam === 'buffs') {
      gameAudio.playHeal();
      store.addCombatLog('✨ ¡La Kafra Clarice te ha bendecido con Increase AGI y Blessing! Muévete mucho más rápido.', 'system');

      this.onEffectSpawn('heal', this.playerEntity.x, this.playerEntity.z);

      store.addBuff({
        id: 'increase_agi', name: 'Increase AGI',
        durationMs: 40000, maxDurationMs: 40000,
        icon: '👟', description: '+20 AGI! Velocidad de movimiento y ASPD aumentados.'
      });

      store.addBuff({
        id: 'blessing', name: 'Blessing',
        durationMs: 40000, maxDurationMs: 40000,
        icon: '✝', description: '+20 STR/INT/DEX! ATK, curas y casteo acelerados.'
      });

      const baseStats = store.getStats();
      store.updateStats({
        agi: baseStats.agi + 20, str: baseStats.str + 20,
        int: baseStats.int + 20, dex: baseStats.dex + 20
      });

      this.playerEntity.maxHp = store.getStats().maxHp;
      this.playerEntity.maxSp = store.getStats().maxSp;
    }

    if (actionParam === 'heal') {
      gameAudio.playHeal();
      store.addCombatLog('💖 ¡Kafra Clarice ha restaurado tu HP/SP por completo y te ha provisto de elixires de Prontera! 💖', 'system');

      this.playerEntity.currentHp = this.playerEntity.maxHp;
      this.playerEntity.currentSp = this.playerEntity.maxSp;
      store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

      this.onEffectSpawn('heal', this.playerEntity.x, this.playerEntity.z);
      inventory.addItem('red_potion', 15);
    }

    if (actionParam === 'buy_potions') {
      gameAudio.playItemPickup();
      inventory.addItem('red_potion', 15);
      store.addCombatLog('🛒 Has reabastecido tu inventario con +15 Red Potions de la Kafra Clarice.', 'loot');
    }

    if (actionParam.startsWith('class_')) {
      const targetClassMap: Record<string, JobClass> = {
        'class_lord_knight': 'Lord Knight',
        'class_high_priest': 'High Priest',
        'class_assassin': 'Assassin Cross',
        'class_sniper': 'Sniper'
      };

      const selectedClass = targetClassMap[actionParam];
      if (selectedClass) {
        store.setJobClass(selectedClass);
        this.playerEntity.job = selectedClass;
        const stats = store.getStats();
        this.playerEntity.currentHp = stats.maxHp;
        this.playerEntity.currentSp = stats.maxSp;
        this.playerEntity.maxHp = stats.maxHp;
        this.playerEntity.maxSp = stats.maxSp;
        store.setPlayerHpSp(this.playerEntity.currentHp, this.playerEntity.currentSp);

        this.onEffectSpawn('level_up', this.playerEntity.x, this.playerEntity.z);
        gameAudio.playHeal();
        store.addCombatLog(`⚔ ¡Has cambiado tu clase de trabajo a ${selectedClass}! Nuevas habilidades asignadas.`, 'system');
        this.onClassChange(selectedClass);
      }
    }
  }
}
