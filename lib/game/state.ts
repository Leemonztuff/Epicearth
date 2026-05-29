import { create } from 'zustand';
import { 
  JobClass, CharacterStats, InventoryItem, CombatLog, 
  Skill, TouchIndicator, InputBufferItem, JoystickState, HeadgearId 
} from './types';

export interface ActiveBuff {
  id: string;
  name: string;
  durationMs: number;
  maxDurationMs: number;
  icon: string;
  description: string;
}

export interface ActiveCastState {
  skillId: string;
  skillName: string;
  durationMs: number;
  elapsedMs: number;
  color: string;
}

interface GameStoreState {
  // Player Stats & Status
  jobClass: JobClass;
  stats: CharacterStats;
  currentHp: number;
  currentSp: number;
  playerBaseExp: number;
  playerBaseMaxExp: number;
  playerJobExp: number;
  playerJobMaxExp: number;
  potCount: number;
  headgear: HeadgearId;
  activeCast: ActiveCastState | null;
  battleMode: boolean;

  // Inventory & Targets
  inventory: InventoryItem[];
  targetEntityId: string | null;
  targetHp: number;
  targetMaxHp: number;
  targetName: string;

  // NPC Interactions & Buffs
  npcDialogue: {
    npcId: string;
    npcName: string;
    npcType: 'kafra' | 'crusader_instructor';
    text: string;
    options: { label: string; actionParam: string }[];
  } | null;
  activeBuffs: ActiveBuff[];

  // System Lists & UI
  combatLogs: CombatLog[];
  skills: Skill[];
  bufferingQueue: InputBufferItem[];
  joystick: JoystickState;
  
  // Settings & Controls
  isJoystickEnabled: boolean;
  isMultitouchSupported: boolean;
  activeInputMode: 'touch_target' | 'joystick_aim';
  showConfigPanel: boolean;

  // Actions / Reducers
  setJobClass: (job: JobClass) => void;
  updateStats: (stats: Partial<CharacterStats>) => void;
  setPlayerHpSp: (hp: number, sp: number) => void;
  addExp: (base: number, job: number) => void;
  drinkPotion: () => void;
  setPotCount: (count: number) => void;
  setHeadgear: (id: HeadgearId) => void;
  setTarget: (id: string | null, name?: string, hp?: number, maxHp?: number) => void;
  updateTargetHp: (hp: number) => void;
  addCombatLog: (text: string, type: CombatLog['type']) => void;
  clearCombatLogs: () => void;
  addToInputBuffer: (item: Omit<InputBufferItem, 'id' | 'timestamp' | 'expiresAt'>) => void;
  removeFromInputBuffer: (id: string) => void;
  clearInputBuffer: () => void;
  updateJoystick: (joystick: Partial<JoystickState>) => void;
  setJoystickEnabled: (enabled: boolean) => void;
  setInputMode: (mode: 'touch_target' | 'joystick_aim') => void;
  toggleConfigPanel: () => void;
  castSkill: (skillId: string) => void;

  setNpcDialogue: (dialogue: GameStoreState['npcDialogue']) => void;
  addBuff: (buff: ActiveBuff) => void;
  removeBuff: (id: string) => void;
}

const defaultStats: Record<JobClass, CharacterStats> = {
  'Lord Knight': {
    level: 99, jobLevel: 70, str: 85, agi: 65, vit: 80, int: 20, dex: 50, luk: 30,
    atk: 340, def: 180, hit: 240, flee: 195, aspd: 168, maxHp: 18400, maxSp: 420,
    bonusAtk: 0, bonusDef: 0, bonusHit: 0, bonusFlee: 0, bonusAspd: 0, bonusMaxHp: 0, bonusMaxSp: 0, bonusCrit: 0
  },
  'High Priest': {
    level: 99, jobLevel: 70, str: 20, agi: 40, vit: 75, int: 99, dex: 70, luk: 15,
    atk: 145, def: 150, hit: 210, flee: 175, aspd: 154, maxHp: 11200, maxSp: 1980,
    bonusAtk: 0, bonusDef: 0, bonusHit: 0, bonusFlee: 0, bonusAspd: 0, bonusMaxHp: 0, bonusMaxSp: 0, bonusCrit: 0
  },
  'Assassin Cross': {
    level: 99, jobLevel: 70, str: 90, agi: 95, vit: 45, int: 15, dex: 45, luk: 40,
    atk: 395, def: 95, hit: 235, flee: 285, aspd: 182, maxHp: 14200, maxSp: 510,
    bonusAtk: 0, bonusDef: 0, bonusHit: 0, bonusFlee: 0, bonusAspd: 0, bonusMaxHp: 0, bonusMaxSp: 0, bonusCrit: 0
  },
  'Sniper': {
    level: 99, jobLevel: 70, str: 30, agi: 90, vit: 40, int: 35, dex: 99, luk: 40,
    atk: 360, def: 110, hit: 299, flee: 260, aspd: 178, maxHp: 12500, maxSp: 720,
    bonusAtk: 0, bonusDef: 0, bonusHit: 0, bonusFlee: 0, bonusAspd: 0, bonusMaxHp: 0, bonusMaxSp: 0, bonusCrit: 0
  }
};

const defaultSkills: Record<JobClass, Skill[]> = {
  'Lord Knight': [
    { id: 'bash', name: 'Bash', key: 'Q', desc: 'Ataque fuerte que inflige 400% de daño físico y tiene probabilidad de aturdir.', spCost: 15, cooldown: 800, range: 2.2, lastCastTime: 0, color: '#f59e0b', castTime: 0 },
    { id: 'bowling_bash', name: 'Bowling Bash', key: 'W', desc: 'Ataca a un objetivo empujándolo contra los demás infligiendo daño masivo de área.', spCost: 28, cooldown: 1500, range: 2.5, lastCastTime: 0, color: '#dc2626', castTime: 650 },
  ],
  'High Priest': [
    { id: 'heal', name: 'Heal', key: 'Q', desc: 'Restaura una cantidad de HP basada en tu INT al objetivo o a ti mismo.', spCost: 20, cooldown: 500, range: 8.0, lastCastTime: 0, color: '#10b981', castTime: 400 },
    { id: 'holy_light', name: 'Holy Light', key: 'W', desc: 'Invoca poder sagrado directo para infligir 150% de daño mágico sagrado.', spCost: 12, cooldown: 900, range: 7.5, lastCastTime: 0, color: '#38bdf8', castTime: 1200 },
  ],
  'Assassin Cross': [
    { id: 'sonic_blow', name: 'Sonic Blow', key: 'Q', desc: 'Desata una tormenta de 8 golpes ultra rápidos con Katar de un solo golpe.', spCost: 34, cooldown: 1200, range: 2.0, lastCastTime: 0, color: '#8b5cf6', castTime: 0 },
    { id: 'grimtooth', name: 'Grimtooth', key: 'W', desc: 'Ataca subterráneamente desde las sombras infligiendo daño a distancia en área.', spCost: 18, cooldown: 1000, range: 6.0, lastCastTime: 0, color: '#ec4899', castTime: 0 },
  ],
  'Sniper': [
    { id: 'double_strafe', name: 'Double Strafe', key: 'Q', desc: 'Dispara rápidamente 2 flechas en simultáneo infligiendo daño de proyectil acumulativo.', spCost: 12, cooldown: 700, range: 9.0, lastCastTime: 0, color: '#14b8a6', castTime: 0 },
    { id: 'falcon_strike', name: 'Blitz Beat', key: 'W', desc: 'Envía tu Halcón entrenado a atacar ferozmente en ráfaga e ignora la defensa física.', spCost: 30, cooldown: 2000, range: 10.0, lastCastTime: 0, color: '#3b82f6', castTime: 1000 },
  ]
};

export const useGameStore = create<GameStoreState>((set, get) => ({
  jobClass: 'Lord Knight',
  stats: defaultStats['Lord Knight'],
  currentHp: defaultStats['Lord Knight'].maxHp,
  currentSp: defaultStats['Lord Knight'].maxSp,
  playerBaseExp: 63500,
  playerBaseMaxExp: 100000,
  playerJobExp: 28900,
  playerJobMaxExp: 80000,
  potCount: 15,
  headgear: 'bunny_band',

  inventory: [
    { id: 'red_potion', name: 'Red Potion', quantity: 15 },
    { id: 'jellopy', name: 'Jellopy', quantity: 42 },
    { id: 'sticky_mucus', name: 'Sticky Mucus', quantity: 9 },
    { id: 'mvp_coin', name: 'MVP Coin', quantity: 1 }
  ],

  activeCast: null,
  battleMode: false,

  targetEntityId: null,
  targetHp: 0,
  targetMaxHp: 0,
  targetName: 'Ninguno',

  npcDialogue: null,
  activeBuffs: [],

  combatLogs: [
    { id: '1', text: '¡Bienvenido a Ragnarok Mobile Input Engine!', type: 'system', timestamp: '00:28' },
    { id: '2', text: 'Usa TAPS en pantalla para moverte y atacar monstruos, o activa JOYSTICK.', type: 'system', timestamp: '00:28' },
    { id: '3', text: 'El búfer de entrada (Input Buffer) encolará tus comandos para una respuesta en tiempo real.', type: 'system', timestamp: '00:28' },
  ],

  skills: defaultSkills['Lord Knight'],
  bufferingQueue: [],
  
  joystick: {
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    angle: 0,
    distance: 0,
    normalizedX: 0,
    normalizedY: 0
  },

  isJoystickEnabled: false,
  isMultitouchSupported: true,
  activeInputMode: 'touch_target',
  showConfigPanel: false,

  setJobClass: (job) => {
    const selectedStats = defaultStats[job];
    const selectedSkills = defaultSkills[job];
    set({
      jobClass: job,
      stats: selectedStats,
      currentHp: selectedStats.maxHp,
      currentSp: selectedStats.maxSp,
      skills: selectedSkills,
      targetEntityId: null,
      bufferingQueue: [],
      activeCast: null,
      battleMode: false
    });
    get().addCombatLog(`Cambiado de clase a: ${job}. ¡Nuevas habilidades asignadas!`, 'system');
  },

  updateStats: (statChanges) => {
    set((state) => ({
      stats: { ...state.stats, ...statChanges }
    }));
  },

  setPlayerHpSp: (hp, sp) => {
    set({ currentHp: hp, currentSp: sp });
  },

  addExp: (base, job) => {
    set((state) => {
      let bExp = state.playerBaseExp + base;
      let bMax = state.playerBaseMaxExp;
      let lvl = state.stats.level;
      let leveledUp = false;

      if (bExp >= bMax) {
        bExp -= bMax;
        bMax = Math.floor(bMax * 1.35);
        lvl = Math.min(99, lvl + 1);
        leveledUp = true;
      }

      let jExp = state.playerJobExp + job;
      let jMax = state.playerJobMaxExp;
      let jLvl = state.stats.jobLevel;

      if (jExp >= jMax) {
        jExp -= jMax;
        jMax = Math.floor(jMax * 1.25);
        jLvl = Math.min(70, jLvl + 1);
        leveledUp = true;
      }

      const updatedStats = { ...state.stats, level: lvl, jobLevel: jLvl };

      return {
        playerBaseExp: bExp,
        playerBaseMaxExp: bMax,
        playerJobExp: jExp,
        playerJobMaxExp: jMax,
        stats: updatedStats,
        currentHp: leveledUp ? updatedStats.maxHp : state.currentHp,
        currentSp: leveledUp ? updatedStats.maxSp : state.currentSp
      };
    });
  },

  drinkPotion: () => {
    const state = get();
    if (state.potCount <= 0) {
      state.addCombatLog('¡No te quedan Red Potions!', 'system');
      return;
    }
    if (state.currentHp >= state.stats.maxHp) {
      state.addCombatLog('Tu vida ya está al máximo.', 'system');
      return;
    }

    const healAmount = Math.floor(state.stats.maxHp * 0.25 + state.stats.vit * 10);
    const newHp = Math.min(state.stats.maxHp, state.currentHp + healAmount);
    
    set({
      potCount: state.potCount - 1,
      currentHp: newHp,
      inventory: state.inventory.map(item => 
        item.id === 'red_potion' ? { ...item, quantity: item.quantity - 1 } : item
      )
    });

    state.addCombatLog(`Usas Red Potion: +${healAmount} HP sanados!`, 'heal');
  },

  setPotCount: (count) => {
    set({ potCount: count });
  },

  setHeadgear: (id) => {
    set({ headgear: id });
  },

  setTarget: (id, name = 'Ninguno', hp = 0, maxHp = 0) => {
    set({
      targetEntityId: id,
      targetName: name,
      targetHp: hp,
      targetMaxHp: maxHp
    });
  },

  updateTargetHp: (hp) => {
    set({ targetHp: hp });
  },

  addCombatLog: (text, type) => {
    const time = new Date();
    const timestamp = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;
    const newLog: CombatLog = {
      id: Math.random().toString(),
      text,
      type,
      timestamp
    };
    set((state) => ({
      combatLogs: [newLog, ...state.combatLogs].slice(0, 50) // Cap to 50 logs for memory performance
    }));
  },

  clearCombatLogs: () => {
    set({ combatLogs: [] });
  },

  addToInputBuffer: (action) => {
    const now = performance.now();
    const expiresAt = now + 1200; // Buffered actions live for 1.2s max, perfect RO latency feel!
    const newItem: InputBufferItem = {
      id: Math.random().toString(),
      ...action,
      timestamp: now,
      expiresAt
    };
    set((state) => ({
      bufferingQueue: [...state.bufferingQueue, newItem].slice(0, 5) // Cap queue to 5 commands
    }));
  },

  removeFromInputBuffer: (id) => {
    set((state) => ({
      bufferingQueue: state.bufferingQueue.filter(item => item.id !== id)
    }));
  },

  clearInputBuffer: () => {
    set({ bufferingQueue: [] });
  },

  updateJoystick: (changes) => {
    set((state) => ({
      joystick: { ...state.joystick, ...changes }
    }));
  },

  setJoystickEnabled: (enabled) => {
    set({ 
      isJoystickEnabled: enabled,
      activeInputMode: enabled ? 'joystick_aim' : 'touch_target'
    });
    get().addCombatLog(
      enabled 
        ? 'Joystick virtual activado (Lateral izquierdo). Movimiento libre 360°' 
        : 'Joystick virtual desactivado. Toque de pantalla (Touch navigation) activado', 
      'system'
    );
  },

  setInputMode: (mode) => {
    set({ activeInputMode: mode });
  },

  toggleConfigPanel: () => {
    set((state) => ({ showConfigPanel: !state.showConfigPanel }));
  },

  castSkill: (skillId) => {
    // Action helper to queue and buffer a skill cast trigger
    const state = get();
    const skill = state.skills.find(s => s.id === skillId);
    if (!skill) return;

    // Cooldown verification checks
    const now = performance.now();
    const lastCast = skill.lastCastTime || 0;
    if (now - lastCast < skill.cooldown) {
      const remaining = Math.ceil((skill.cooldown - (now - lastCast)) / 100) / 10;
      state.addCombatLog(`¡[${skill.name}] está recargando! Reutilización en ${remaining}s.`, 'system');
      return;
    }

    if (state.currentSp < skill.spCost) {
      state.addCombatLog(`¡Falta SP para lanzar ${skill.name}! Requiere ${skill.spCost} SP.`, 'system');
      return;
    }

    // Queue in input buffer system!
    state.addToInputBuffer({
      type: 'skill',
      skillId: skillId,
      targetId: state.targetEntityId || undefined
    });
  },

  setNpcDialogue: (dialogue) => {
    set({ npcDialogue: dialogue });
  },

  addBuff: (buff) => {
    set((state) => {
      const index = state.activeBuffs.findIndex(b => b.id === buff.id);
      const updated = [...state.activeBuffs];
      if (index > -1) {
        updated[index] = buff;
      } else {
        updated.push(buff);
      }
      return { activeBuffs: updated };
    });
  },

  removeBuff: (id) => {
    set((state) => ({
      activeBuffs: state.activeBuffs.filter(b => b.id !== id)
    }));
  }
}));
