import { InventorySystem } from '../shared/InventorySystem';
import { ItemDefinition } from '../types';

// ============================================================================
// TESTS - InventorySystem
// ============================================================================

const mockItems: ItemDefinition[] = [
  {
    id: 'red_potion',
    name: 'Red Potion',
    type: 'consumable',
    description: 'Restaura 150 HP',
    weight: 7,
    sellPrice: 25,
    buyPrice: 50,
    stackable: true,
    maxStack: 50,
    healAmount: 150,
    healType: 'hp'
  },
  {
    id: 'sword_1',
    name: 'Sword',
    type: 'equipment',
    description: 'Una espada básica',
    weight: 50,
    sellPrice: 50,
    buyPrice: 100,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'weapon',
    statBonuses: { atk: 25 }
  }
];

describe('InventorySystem', () => {
  let inventory: InventorySystem;

  beforeEach(() => {
    inventory = new InventorySystem({ maxSlots: 10, maxWeight: 1000, initialZeny: 1000 });
    inventory.registerItemDefinitions(mockItems);
  });

  test('should add stackable items', () => {
    const added = inventory.addItem('red_potion', 5);
    expect(added).toBe(true);
    expect(inventory.getItemCount('red_potion')).toBe(5);
  });

  test('should stack items up to max', () => {
    inventory.addItem('red_potion', 45);
    inventory.addItem('red_potion', 10); // Should only add 5 to reach max 50

    expect(inventory.getItemCount('red_potion')).toBe(50);
  });

  test('should add non-stackable items to separate slots', () => {
    inventory.addItem('sword_1', 1);
    inventory.addItem('sword_1', 1);

    expect(inventory.getItemCount('sword_1')).toBe(2);
    expect(inventory.getOccupiedSlots()).toBe(2);
  });

  test('should remove items', () => {
    inventory.addItem('red_potion', 10);
    const removed = inventory.removeItem('red_potion', 5);

    expect(removed).toBe(true);
    expect(inventory.getItemCount('red_potion')).toBe(5);
  });

  test('should check weight limit', () => {
    // Each red_potion weighs 7, max weight is 1000
    // 1000 / 7 = ~142 potions
    const added = inventory.addItem('red_potion', 200);
    expect(added).toBe(false);
    expect(inventory.getItemCount('red_potion')).toBe(0);
  });

  test('should track weight correctly', () => {
    inventory.addItem('red_potion', 10); // 10 * 7 = 70 weight
    expect(inventory.getState().currentWeight).toBe(70);
  });

  test('should check if has item', () => {
    inventory.addItem('red_potion', 5);
    expect(inventory.hasItem('red_potion')).toBe(true);
    expect(inventory.hasItem('red_potion', 6)).toBe(false);
  });

  test('should count occupied and free slots', () => {
    inventory.addItem('red_potion', 1);
    inventory.addItem('sword_1', 1);

    expect(inventory.getOccupiedSlots()).toBe(2);
    expect(inventory.getFreeSlots()).toBe(8);
  });

  test('should manage zeny', () => {
    inventory.addZeny(500);
    expect(inventory.getState().zeny).toBe(1500);

    const removed = inventory.removeZeny(200);
    expect(removed).toBe(true);
    expect(inventory.getState().zeny).toBe(1300);
  });

  test('should reject zeny removal if insufficient', () => {
    const removed = inventory.removeZeny(2000);
    expect(removed).toBe(false);
    expect(inventory.getState().zeny).toBe(1000);
  });

  test('should sort items by type', () => {
    inventory.addItem('sword_1', 1);
    inventory.addItem('red_potion', 5);
    inventory.addItem('red_potion', 3);

    inventory.sortByType();

    const slots = inventory.getSlots();
    const firstItem = slots[0];
    expect(firstItem?.itemDefId).toBe('sword_1');
  });
});
