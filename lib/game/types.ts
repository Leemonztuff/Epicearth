export type JobClass = 'Lord Knight' | 'High Priest' | 'Assassin Cross' | 'Sniper';

export interface CharacterStats {
  level: number;
  jobLevel: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  atk: number;
  def: number;
  hit: number;
  flee: number;
  aspd: number;
  maxHp: number;
  maxSp: number;
}

export interface Buff {
  id: string;
  name: string;
  type: 'increase_agi' | 'blessing' | 'provoke';
  endTime: number;
  statModifier: Partial<CharacterStats>;
  color: string;
}

export interface Projectile {
  id: string;
  type: 'arrow' | 'holy_light' | 'poison_dart' | 'dark_energy';
  x: number;
  y: number;
  z: number;
  speed: number;
  targetEntityId: string;
  ownerEntityId: string;
  damage: number;
  isCrit: boolean;
  spawnTime: number;
  height: number;
}

export interface Entity {
  id: string;
  name: string;
  type: 'player' | 'monster' | 'boss_mvp' | 'npc';
  job?: JobClass;
  mobType?: 'poring' | 'baphomet' | 'pecopeco' | 'poporing';
  npcType?: 'kafra' | 'crusader_instructor';
  buffs?: string[]; // list of active buff IDs/types
  x: number;
  y: number;
  z: number;
  targetX?: number;
  targetZ?: number;
  facing: 'left' | 'right';
  state: 'idle' | 'move' | 'attack' | 'hit' | 'cast' | 'death';
  currentHp: number;
  currentSp: number;
  maxHp: number;
  maxSp: number;
  targetEntityId: string | null;
  hitRecoveryEndTime: number;
  animationTimer: number;
  animationFrame: number;
  animMachine?: any; // Lazy initialized animation state machine

}

export interface GroundItem {
  id: string;
  name: string;
  x: number;
  z: number;
  y: number;
  quantity: number;
  itemId: string;
  velX?: number;
  velY?: number;
  velZ?: number;
  bounceCount?: number;
}

export interface Skill {
  id: string;
  name: string;
  key: string;
  desc: string;
  spCost: number;
  cooldown: number; // in milliseconds
  range: number;
  lastCastTime: number;
  color: string;
  castTime?: number; // in milliseconds (0 or undefined means instant)
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
}

export interface CombatLog {
  id: string;
  text: string;
  type: 'system' | 'mvp' | 'loot' | 'player_hit' | 'monster_hit' | 'heal' | 'skill';
  timestamp: string;
}

export interface TouchIndicator {
  id: string;
  x: number;
  y: number;
  z: number;
  age: number; // 0 to maxAge (ticks or ms)
  maxAge: number;
  type: 'move' | 'target' | 'skill';
}

export interface InputBufferItem {
  id: string;
  type: 'skill' | 'potion' | 'move' | 'target';
  skillId?: string;
  targetId?: string;
  coords?: { x: number; z: number };
  timestamp: number; // when it was queued
  expiresAt: number; // buffer expiration (e.g., now + 1500ms)
}

export interface JoystickState {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  angle: number; // angle in radians
  distance: number; // distance from start
  normalizedX: number; // -1 to 1
  normalizedY: number; // -1 to 1
}

export type HeadgearId = 'none' | 'goggles' | 'magician_hat' | 'bunny_band' | 'ragnarok_crown';

export interface Headgear {
  id: HeadgearId;
  name: string;
  color: string;
}
