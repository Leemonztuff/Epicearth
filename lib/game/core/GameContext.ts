import { CharacterStats, HeadgearId, JobClass, Skill, CombatLog } from '../types';
import { ActiveBuff } from '../state';

// ============================================================================
// GAME CONTEXT - Inyección de dependencias para sistemas de juego
// ============================================================================
// Provee acceso al state del juego SIN importar useGameStore directamente.
// Permite: testing, networking, y swap de implementaciones.
// ============================================================================

export interface GameStoreAPI {
  // Player state
  getJobClass(): JobClass;
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

  // Inventory
  updateInventory(updater: (inventory: { id: string; name: string; quantity: number }[]) => { id: string; name: string; quantity: number }[]): void;

  // NPC
  setNpcDialogue(dialogue: { npcId: string; npcName: string; npcType: 'kafra' | 'crusader_instructor'; text: string; options: { label: string; actionParam: string }[] } | null): void;

  // Settings
  isJoystickEnabled(): boolean;
  getJoystickState(): { isActive: boolean; angle: number; distance: number };

  // EXP
  addExp(base: number, job: number): void;
  getPlayerBaseExp(): number;
  getPlayerBaseMaxExp(): number;
  getPlayerJobExp(): number;
  getPlayerJobMaxExp(): number;
}

export interface GameContext {
  store: GameStoreAPI;
}

// ============================================================================
// ZUSTAND GAME STORE API - Adaptador para useGameStore
// ============================================================================

export function createZustandGameStoreAPI(): GameStoreAPI {
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

  return {
    // Player state
    getJobClass: () => getStore().jobClass,
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

    // Inventory
    updateInventory: (updater) => {
      const store = getStore();
      getUseGameStore().setState({ inventory: updater(store.inventory) });
    },

    // NPC
    setNpcDialogue: (dialogue) => getStore().setNpcDialogue(dialogue),

    // Settings
    isJoystickEnabled: () => getStore().isJoystickEnabled,
    getJoystickState: () => getStore().joystick,

    // EXP
    addExp: (base, job) => getStore().addExp(base, job),
    getPlayerBaseExp: () => getStore().playerBaseExp,
    getPlayerBaseMaxExp: () => getStore().playerBaseMaxExp,
    getPlayerJobExp: () => getStore().playerJobExp,
    getPlayerJobMaxExp: () => getStore().playerJobMaxExp
  };
}
