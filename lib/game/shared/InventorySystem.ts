import { InventorySlot, InventoryState, ItemDefinition } from '../types';
import { gameEventBus } from '../core/EventBus';

// ============================================================================
// INVENTORY SYSTEM - Gestión de inventario del jugador
// ============================================================================
// Maneja: agregar/remover items, peso, zeny, stack, uso de consumibles.
// Estilo Ragnarok Online: slots limitados, peso limitado.
// ============================================================================

export interface InventorySystemConfig {
  maxSlots?: number;
  maxWeight?: number;
  initialZeny?: number;
}

export class InventorySystem {
  private state: InventoryState;
  private itemDefinitions: Map<string, ItemDefinition> = new Map();

  constructor(config: InventorySystemConfig = {}) {
    this.state = {
      slots: new Array(config.maxSlots || 30).fill(null),
      maxSlots: config.maxSlots || 30,
      currentWeight: 0,
      maxWeight: config.maxWeight || 2000, // 200kg in RO units
      zeny: config.initialZeny || 0
    };
  }

  // --- ITEM DEFINITIONS ---

  registerItemDefinition(itemDef: ItemDefinition): void {
    this.itemDefinitions.set(itemDef.id, itemDef);
  }

  registerItemDefinitions(itemDefs: ItemDefinition[]): void {
    itemDefs.forEach(def => this.itemDefinitions.set(def.id, def));
  }

  getItemDefinition(itemId: string): ItemDefinition | undefined {
    return this.itemDefinitions.get(itemId);
  }

  // --- ADD ITEM ---

  addItem(itemId: string, quantity: number = 1): boolean {
    const itemDef = this.itemDefinitions.get(itemId);
    if (!itemDef) return false;

    const totalWeight = itemDef.weight * quantity;
    if (this.state.currentWeight + totalWeight > this.state.maxWeight) {
      gameEventBus.emit('system:log', {
        text: `¡Inventario lleno! No puedes cargar más peso.`,
        type: 'system'
      });
      return false;
    }

    // If stackable, try to add to existing stack
    if (itemDef.stackable) {
      for (let i = 0; i < this.state.slots.length; i++) {
        const slot = this.state.slots[i];
        if (slot && slot.itemDefId === itemId && slot.quantity < itemDef.maxStack) {
          const canAdd = Math.min(quantity, itemDef.maxStack - slot.quantity);
          slot.quantity += canAdd;
          quantity -= canAdd;
          this.state.currentWeight += itemDef.weight * canAdd;

          if (quantity <= 0) {
            gameEventBus.emit('system:log', {
              text: `Obtuviste ${itemDef.name} x${quantity}.`,
              type: 'loot'
            });
            return true;
          }
        }
      }
    }

    // Find empty slot for remaining quantity
    while (quantity > 0) {
      const emptySlotIndex = this.state.slots.findIndex(slot => slot === null);
      if (emptySlotIndex === -1) {
        gameEventBus.emit('system:log', {
          text: `¡Inventario lleno! No hay espacio para más items.`,
          type: 'system'
        });
        return false;
      }

      const addQuantity = itemDef.stackable ? Math.min(quantity, itemDef.maxStack) : 1;
      this.state.slots[emptySlotIndex] = {
        itemDefId: itemId,
        quantity: addQuantity
      };
      this.state.currentWeight += itemDef.weight * addQuantity;
      quantity -= addQuantity;
    }

    gameEventBus.emit('system:log', {
      text: `Obtuviste ${itemDef.name} x${quantity}.`,
      type: 'loot'
    });
    return true;
  }

  // --- REMOVE ITEM ---

  removeItem(itemId: string, quantity: number = 1): boolean {
    let remaining = quantity;

    for (let i = 0; i < this.state.slots.length; i++) {
      const slot = this.state.slots[i];
      if (slot && slot.itemDefId === itemId) {
        const removeQuantity = Math.min(remaining, slot.quantity);
        slot.quantity -= removeQuantity;
        remaining -= removeQuantity;

        const itemDef = this.itemDefinitions.get(itemId);
        if (itemDef) {
          this.state.currentWeight -= itemDef.weight * removeQuantity;
        }

        if (slot.quantity <= 0) {
          this.state.slots[i] = null;
        }

        if (remaining <= 0) {
          return true;
        }
      }
    }

    return remaining <= 0;
  }

  // --- USE ITEM ---

  useItem(slotIndex: number): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot) return false;

    const itemDef = this.itemDefinitions.get(slot.itemDefId);
    if (!itemDef) return false;

    if (itemDef.type === 'consumable') {
      // Emit event for the game to handle the consumption
      gameEventBus.emit('system:log', {
        text: `Usaste ${itemDef.name}.`,
        type: 'system'
      });

      this.removeItem(slot.itemDefId, 1);
      return true;
    }

    return false;
  }

  // --- QUERY METHODS ---

  getItemCount(itemId: string): number {
    let count = 0;
    for (const slot of this.state.slots) {
      if (slot && slot.itemDefId === itemId) {
        count += slot.quantity;
      }
    }
    return count;
  }

  hasItem(itemId: string, quantity: number = 1): boolean {
    return this.getItemCount(itemId) >= quantity;
  }

  getOccupiedSlots(): number {
    return this.state.slots.filter(slot => slot !== null).length;
  }

  getFreeSlots(): number {
    return this.state.slots.filter(slot => slot === null).length;
  }

  // --- ZENY ---

  addZeny(amount: number): void {
    this.state.zeny += amount;
    gameEventBus.emit('system:log', {
      text: `Obtuviste ${amount} Zeny.`,
      type: 'loot'
    });
  }

  removeZeny(amount: number): boolean {
    if (this.state.zeny < amount) {
      gameEventBus.emit('system:log', {
        text: `¡No tienes suficiente Zeny!`,
        type: 'system'
      });
      return false;
    }
    this.state.zeny -= amount;
    return true;
  }

  // --- STATE ACCESS ---

  getState(): Readonly<InventoryState> {
    return this.state;
  }

  getSlots(): readonly (InventorySlot | null)[] {
    return this.state.slots;
  }

  // --- SORT ---

  sortByType(): void {
    const filledSlots = this.state.slots.filter((s): s is InventorySlot => s !== null);
    const emptySlots = this.state.slots.length - filledSlots.length;

    filledSlots.sort((a, b) => {
      const defA = this.itemDefinitions.get(a.itemDefId);
      const defB = this.itemDefinitions.get(b.itemDefId);
      if (!defA || !defB) return 0;
      return defA.type.localeCompare(defB.type) || defA.name.localeCompare(defB.name);
    });

    this.state.slots = [...filledSlots, ...new Array(emptySlots).fill(null)];
  }

  // --- CLEAR ---

  clear(): void {
    this.state.slots = new Array(this.state.maxSlots).fill(null);
    this.state.currentWeight = 0;
  }
}
