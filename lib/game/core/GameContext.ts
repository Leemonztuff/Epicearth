import { CharacterStats, HeadgearId, JobClass, Skill, CombatLog, InventorySlot, EquipmentSlot, EquipmentSlotState } from '../types';
import { ActiveBuff } from '../state';
import { InventorySystem } from '../shared/InventorySystem';
import { EquipmentSystem } from '../shared/EquipmentSystem';
import { LootSystem } from '../shared/LootSystem';

// ============================================================================
// GAME CONTEXT - Inyección de dependencias para sistemas de juego
// ============================================================================
// Provee acceso al state del juego SIN importar useGameStore directamente.
// Permite: testing, networking, y swap de implementaciones.
// ============================================================================

export interface GameStoreAPI {
  // Player state
  getJobClass(): JobClass;
  setJobClass(job: JobClass): void;
  getStats(): CharacterStats;
  getHeadgear(): HeadgearId;
  getCurrentHp(): number;
  getCurrentSp(): number;
  getPotCount(): number;
  getSkills(): Skill[];
  getActiveBuffs(): ActiveBuff[];
  isBattleMode(): boolean;

  // Player mutations
  setPlayerHpSp(hp: number, sp: number): void;
  updateStats(stats: Partial<CharacterStats>): void;
  setPotCount(count: number): void;
  addCombatLog(text: string, type: CombatLog['type']): void;

  // Buff management
  addBuff(buff: ActiveBuff): void;
  removeBuff(id: string): void;

  // Target management
  setTarget(id: string | null, name?: string, hp?: number, maxHp?: number): void;
  updateTargetHp(hp: number): void;

  // Legacy Inventory (for backward compatibility)
  updateInventory(updater: (inventory: { id: string; name: string; quantity: number }[]) => { id: string; name: string; quantity: number }[]): void;

  // NPC
  setNpcDialogue(dialogue: { npcId: string; npcName: string; npcType: 'kafra' | 'crusader_instructor'; text: string; options: { label: string; actionParam: string }[] } | null): void;

  // Settings
  isJoystickEnabled(): boolean;
  getJoystickState(): { isActive: boolean; angle: number; distance: number; startX: number; startY: number; currentX: number; currentY: number; normalizedX: number; normalizedY: number };
  updateJoystick(joystick: { isActive?: boolean; startX?: number; startY?: number; currentX?: number; currentY?: number; distance?: number; angle?: number; normalizedX?: number; normalizedY?: number }): void;

  // EXP
  addExp(base: number, job: number): void;
  getPlayerBaseExp(): number;
  getPlayerBaseMaxExp(): number;
  getPlayerJobExp(): number;
  getPlayerJobMaxExp(): number;
}

export interface GameContext {
  store: GameStoreAPI;
  inventory: InventorySystem;
  equipment: EquipmentSystem;
  loot: LootSystem;
}

// ============================================================================
// ZUSTAND GAME STORE API - Adaptador para useGameStore
// ============================================================================

export function createGameContext(): GameContext {
  // Lazy import para evitar circular dependencies
  const getStore = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../state');
    return useGameStore.getState();
  };

  const getUseGameStore = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../state');
    return useGameStore;
  };

  // Create item database and systems
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createItemDatabase } = require('../shared/ItemDatabase');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InventorySystem } = require('../shared/InventorySystem');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EquipmentSystem } = require('../shared/EquipmentSystem');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LootSystem } = require('../shared/LootSystem');

  const itemDb = createItemDatabase();
  const inventory = new InventorySystem({ maxSlots: 30, maxWeight: 2000, initialZeny: 5000 });
  inventory.registerItemDefinitions(Array.from(itemDb.values()));

  const equipment = new EquipmentSystem({ itemDefinitions: itemDb });

  // Loot system will be initialized with player entity later
  const groundItems: any[] = [];
  const loot = new LootSystem({ playerEntity: { id: 'temp', x: 0, y: 0, z: 0 } as any, groundItems, context: { store: {} as any, inventory, equipment } as any });

  const store: GameStoreAPI = {
    // Player state
    getJobClass: () => getStore().jobClass,
    setJobClass: (job) => getStore().setJobClass(job),
    getStats: () => getStore().stats,
    getHeadgear: () => getStore().headgear,
    getCurrentHp: () => getStore().currentHp,
    getCurrentSp: () => getStore().currentSp,
    getPotCount: () => getStore().potCount,
    getSkills: () => getStore().skills,
    getActiveBuffs: () => getStore().activeBuffs,
    isBattleMode: () => getStore().battleMode,

    // Player mutations
    setPlayerHpSp: (hp, sp) => getStore().setPlayerHpSp(hp, sp),
    updateStats: (stats) => getStore().updateStats(stats),
    setPotCount: (count) => getStore().setPotCount(count),
    addCombatLog: (text, type) => getStore().addCombatLog(text, type),

    // Buff management
    addBuff: (buff) => getStore().addBuff(buff),
    removeBuff: (id) => getStore().removeBuff(id),

    // Target management
    setTarget: (id, name, hp, maxHp) => getStore().setTarget(id, name, hp, maxHp),
    updateTargetHp: (hp) => getStore().updateTargetHp(hp),

    // Legacy Inventory (for backward compatibility)
    updateInventory: (updater) => {
      const store = getStore();
      getUseGameStore().setState({ inventory: updater(store.inventory) });
    },

    // NPC
    setNpcDialogue: (dialogue) => getStore().setNpcDialogue(dialogue),

    // Settings
    isJoystickEnabled: () => getStore().isJoystickEnabled,
    getJoystickState: () => getStore().joystick,
    updateJoystick: (joystick) => getStore().updateJoystick(joystick),

    // EXP
    addExp: (base, job) => getStore().addExp(base, job),
    getPlayerBaseExp: () => getStore().playerBaseExp,
    getPlayerBaseMaxExp: () => getStore().playerBaseMaxExp,
    getPlayerJobExp: () => getStore().playerJobExp,
    getPlayerJobMaxExp: () => getStore().playerJobMaxExp
  };

  return { store, inventory, equipment, loot };
}

// Legacy export for backward compatibility
export function createZustandGameStoreAPI(): GameStoreAPI {
  return createGameContext().store;
}
