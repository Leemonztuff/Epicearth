import { EquipmentSystem } from '../shared/EquipmentSystem';
import { ItemDefinition } from '../types';

// ============================================================================
// TESTS - EquipmentSystem
// ============================================================================

const mockItems: ItemDefinition[] = [
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
    weaponType: 'sword',
    requiredLevel: 1,
    requiredJob: ['Lord Knight'],
    statBonuses: { atk: 25 }
  },
  {
    id: 'helmet_1',
    name: 'Cap',
    type: 'equipment',
    description: 'Un casco básico',
    weight: 30,
    sellPrice: 30,
    buyPrice: 60,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'head',
    armorType: 'helmet',
    requiredLevel: 1,
    statBonuses: { def: 3 }
  },
  {
    id: 'high_level_sword',
    name: 'Master Sword',
    type: 'equipment',
    description: 'Una espada poderosa',
    weight: 80,
    sellPrice: 500,
    buyPrice: 1000,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'weapon',
    weaponType: 'sword',
    requiredLevel: 50,
    requiredJob: ['Lord Knight'],
    statBonuses: { atk: 100 }
  }
];

describe('EquipmentSystem', () => {
  let equipment: EquipmentSystem;

  beforeEach(() => {
    equipment = new EquipmentSystem({ itemDefinitions: new Map(mockItems.map(i => [i.id, i])) });
  });

  test('should equip items', () => {
    const equipped = equipment.equip('sword_1', 10, 'Lord Knight');
    expect(equipped).toBe(true);
    expect(equipment.isSlotOccupied('weapon')).toBe(true);
    expect(equipment.getItemAtSlot('weapon')?.name).toBe('Sword');
  });

  test('should reject items below level requirement', () => {
    const equipped = equipment.equip('high_level_sword', 10, 'Lord Knight');
    expect(equipped).toBe(false);
    expect(equipment.isSlotOccupied('weapon')).toBe(false);
  });

  test('should accept items at level requirement', () => {
    const equipped = equipment.equip('high_level_sword', 50, 'Lord Knight');
    expect(equipped).toBe(true);
    expect(equipment.getItemAtSlot('weapon')?.name).toBe('Master Sword');
  });

  test('should unequip items', () => {
    equipment.equip('sword_1', 10, 'Lord Knight');
    const unequipped = equipment.unequip('weapon');

    expect(unequipped).toBe(true);
    expect(equipment.isSlotOccupied('weapon')).toBe(false);
  });

  test('should replace equipped items', () => {
    equipment.equip('sword_1', 10, 'Lord Knight');
    equipment.equip('high_level_sword', 50, 'Lord Knight');

    expect(equipment.getItemAtSlot('weapon')?.name).toBe('Master Sword');
    expect(equipment.getEquippedCount()).toBe(1);
  });

  test('should calculate stat bonuses', () => {
    equipment.equip('sword_1', 10, 'Lord Knight'); // +25 atk
    equipment.equip('helmet_1', 10, 'Lord Knight'); // +3 def

    const bonuses = equipment.calculateStatBonuses();
    expect(bonuses.bonusAtk).toBe(25);
    expect(bonuses.bonusDef).toBe(3);
  });

  test('should count equipped items', () => {
    equipment.equip('sword_1', 10, 'Lord Knight');
    equipment.equip('helmet_1', 10, 'Lord Knight');

    expect(equipment.getEquippedCount()).toBe(2);
  });

  test('should get equipped item at slot', () => {
    equipment.equip('sword_1', 10, 'Lord Knight');

    const item = equipment.getEquippedItem('weapon');
    expect(item.itemDefId).toBe('sword_1');
    expect(item.refinement).toBe(0);
  });
});
