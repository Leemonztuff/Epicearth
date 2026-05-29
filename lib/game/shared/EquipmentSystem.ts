import { EquipmentSlot, EquipmentSlotState, EquipmentState, ItemDefinition, CharacterStats, JobClass } from '../types';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// EQUIPMENT SYSTEM - Gestión de equipamiento del jugador
// ============================================================================
// Maneja: equipar/desequipar items, calcular bonuses de stats, 
// restricciones de nivel/clase, refinamiento.
// Estilo Ragnarok Online.
// ============================================================================

export interface EquipmentSystemConfig {
  itemDefinitions: Map<string, ItemDefinition>;
}

export class EquipmentSystem {
  private state: EquipmentState;
  private itemDefinitions: Map<string, ItemDefinition>;

  constructor(config: EquipmentSystemConfig) {
    this.itemDefinitions = config.itemDefinitions;
    this.state = this.createEmptyState();
  }

  private createEmptyState(): EquipmentState {
    const emptySlot: EquipmentSlotState = { itemDefId: null, refinement: 0, cards: [] };
    return {
      head: { ...emptySlot },
      body: { ...emptySlot },
      weapon: { ...emptySlot },
      shield: { ...emptySlot },
      shoes: { ...emptySlot },
      garment: { ...emptySlot },
      accessory1: { ...emptySlot },
      accessory2: { ...emptySlot }
    };
  }

  // --- EQUIP ---

  equip(itemId: string, currentLevel: number, currentJob: JobClass): boolean {
    const itemDef = this.itemDefinitions.get(itemId);
    if (!itemDef || !itemDef.equipmentSlot) return false;

    // Check level requirement
    if (itemDef.requiredLevel && currentLevel < itemDef.requiredLevel) {
      gameEventBus.emit('system:log', {
        text: `Necesitas nivel ${itemDef.requiredLevel} para equipar ${itemDef.name}.`,
        type: 'system'
      });
      return false;
    }

    // Check job requirement
    if (itemDef.requiredJob && !itemDef.requiredJob.includes(currentJob)) {
      gameEventBus.emit('system:log', {
        text: `Tu clase no puede equipar ${itemDef.name}.`,
        type: 'system'
      });
      return false;
    }

    const slot = itemDef.equipmentSlot;
    const currentEquipped = this.state[slot];

    // If something is already equipped, unequip it first
    if (currentEquipped.itemDefId) {
      this.unequip(slot);
    }

    // Equip the new item
    this.state[slot] = {
      itemDefId: itemId,
      refinement: itemDef.refinement || 0,
      cards: []
    };

    gameEventBus.emit('system:log', {
      text: `Equipaste ${itemDef.name}.`,
      type: 'system'
    });

    return true;
  }

  // --- UNEQUIP ---

  unequip(slot: EquipmentSlot): boolean {
    const equipped = this.state[slot];
    if (!equipped.itemDefId) return false;

    const itemDef = this.itemDefinitions.get(equipped.itemDefId);
    this.state[slot] = { itemDefId: null, refinement: 0, cards: [] };

    if (itemDef) {
      gameEventBus.emit('system:log', {
        text: `Desequipaste ${itemDef.name}.`,
        type: 'system'
      });
    }

    return true;
  }

  // --- STAT CALCULATION ---

  calculateStatBonuses(): Partial<CharacterStats> {
    const bonuses: Partial<CharacterStats> = {
      bonusAtk: 0,
      bonusDef: 0,
      bonusHit: 0,
      bonusFlee: 0,
      bonusAspd: 0,
      bonusMaxHp: 0,
      bonusMaxSp: 0
    };

    const slots = Object.values(this.state) as EquipmentSlotState[];
    for (const slot of slots) {
      if (slot.itemDefId) {
        const itemDef = this.itemDefinitions.get(slot.itemDefId);
        if (itemDef && itemDef.statBonuses) {
          // Add base stat bonuses
          if (itemDef.statBonuses.str) bonuses.bonusAtk! += itemDef.statBonuses.str * 2;
          if (itemDef.statBonuses.agi) bonuses.bonusFlee! += itemDef.statBonuses.agi;
          if (itemDef.statBonuses.vit) bonuses.bonusMaxHp! += itemDef.statBonuses.vit * 100;
          if (itemDef.statBonuses.int) bonuses.bonusMaxSp! += itemDef.statBonuses.int * 10;
          if (itemDef.statBonuses.dex) bonuses.bonusHit! += itemDef.statBonuses.dex;
          if (itemDef.statBonuses.luk) bonuses.bonusCrit! += itemDef.statBonuses.luk;

          // Direct bonuses
          if (itemDef.statBonuses.atk) bonuses.bonusAtk! += itemDef.statBonuses.atk;
          if (itemDef.statBonuses.def) bonuses.bonusDef! += itemDef.statBonuses.def;
          if (itemDef.statBonuses.hit) bonuses.bonusHit! += itemDef.statBonuses.hit;
          if (itemDef.statBonuses.flee) bonuses.bonusFlee! += itemDef.statBonuses.flee;
          if (itemDef.statBonuses.aspd) bonuses.bonusAspd! += itemDef.statBonuses.aspd;
          if (itemDef.statBonuses.maxHp) bonuses.bonusMaxHp! += itemDef.statBonuses.maxHp;
          if (itemDef.statBonuses.maxSp) bonuses.bonusMaxSp! += itemDef.statBonuses.maxSp;
        }

        // Refinement bonus (ATK for weapons, DEF for armor)
        if (slot.refinement > 0 && itemDef) {
          if (itemDef.equipmentSlot === 'weapon') {
            bonuses.bonusAtk! += slot.refinement * 2;
          } else {
            bonuses.bonusDef! += slot.refinement;
          }
        }
      }
    }

    return bonuses;
  }

  // --- QUERY METHODS ---

  getEquippedItem(slot: EquipmentSlot): EquipmentSlotState {
    return this.state[slot];
  }

  getItemAtSlot(slot: EquipmentSlot): ItemDefinition | undefined {
    const equipped = this.state[slot];
    if (!equipped.itemDefId) return undefined;
    return this.itemDefinitions.get(equipped.itemDefId);
  }

  isSlotOccupied(slot: EquipmentSlot): boolean {
    return this.state[slot].itemDefId !== null;
  }

  getEquippedCount(): number {
    return Object.values(this.state).filter(slot => slot.itemDefId !== null).length;
  }

  // --- STATE ACCESS ---

  getState(): Readonly<EquipmentState> {
    return this.state;
  }

  // --- CLEAR ---

  clear(): void {
    this.state = this.createEmptyState();
  }
}
