import { ItemDefinition } from '../types';

// ============================================================================
// ITEM DATABASE - Definiciones de items del juego
// ============================================================================
// Basado en Ragnarok Online: pociones, equipo, materiales, etc.
// ============================================================================

export const ITEM_DATABASE: ItemDefinition[] = [
  // ============================================================================
  // CONSUMABLES - Pociones
  // ============================================================================
  {
    id: 'red_potion',
    name: 'Red Potion',
    type: 'consumable',
    description: 'Una poción roja que restaura 150 HP.',
    weight: 7,
    sellPrice: 25,
    buyPrice: 50,
    stackable: true,
    maxStack: 50,
    healAmount: 150,
    healType: 'hp'
  },
  {
    id: 'orange_potion',
    name: 'Orange Potion',
    type: 'consumable',
    description: 'Una poción naranja que restaura 300 HP.',
    weight: 7,
    sellPrice: 125,
    buyPrice: 250,
    stackable: true,
    maxStack: 50,
    healAmount: 300,
    healType: 'hp'
  },
  {
    id: 'yellow_potion',
    name: 'Yellow Potion',
    type: 'consumable',
    description: 'Una poción amarilla que restaura 500 HP.',
    weight: 7,
    sellPrice: 325,
    buyPrice: 650,
    stackable: true,
    maxStack: 50,
    healAmount: 500,
    healType: 'hp'
  },
  {
    id: 'white_potion',
    name: 'White Potion',
    type: 'consumable',
    description: 'Una poción blanca que restaura 800 HP.',
    weight: 7,
    sellPrice: 575,
    buyPrice: 1150,
    stackable: true,
    maxStack: 50,
    healAmount: 800,
    healType: 'hp'
  },
  {
    id: 'blue_potion',
    name: 'Blue Potion',
    type: 'consumable',
    description: 'Una poción azul que restaura 100 SP.',
    weight: 7,
    sellPrice: 400,
    buyPrice: 800,
    stackable: true,
    maxStack: 50,
    healAmount: 100,
    healType: 'sp'
  },
  {
    id: 'green_potion',
    name: 'Green Potion',
    type: 'consumable',
    description: 'Una poción verde que cura veneno.',
    weight: 7,
    sellPrice: 200,
    buyPrice: 400,
    stackable: true,
    maxStack: 50,
    healAmount: 0,
    healType: 'hp'
  },

  // ============================================================================
  // EQUIPMENT - Armas
  // ============================================================================
  {
    id: 'sword_1',
    name: 'Sword [1]',
    type: 'equipment',
    description: 'Una espada básica de acero.',
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
    id: 'blade_1',
    name: 'Blade [1]',
    type: 'equipment',
    description: 'Una espada de doble filo más poderosa.',
    weight: 70,
    sellPrice: 500,
    buyPrice: 1000,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'weapon',
    weaponType: 'sword',
    requiredLevel: 20,
    requiredJob: ['Lord Knight'],
    statBonuses: { atk: 55 }
  },
  {
    id: 'katar_1',
    name: 'Katar [1]',
    type: 'equipment',
    description: 'Un katar de acero afilado.',
    weight: 40,
    sellPrice: 50,
    buyPrice: 100,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'weapon',
    weaponType: 'katar',
    requiredLevel: 1,
    requiredJob: ['Assassin Cross'],
    statBonuses: { atk: 30 }
  },
  {
    id: 'bow_1',
    name: 'Bow [1]',
    type: 'equipment',
    description: 'Un arco básico de madera.',
    weight: 30,
    sellPrice: 50,
    buyPrice: 100,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'weapon',
    weaponType: 'bow',
    requiredLevel: 1,
    requiredJob: ['Sniper'],
    statBonuses: { atk: 20 }
  },
  {
    id: 'mace_1',
    name: 'Mace [1]',
    type: 'equipment',
    description: 'Una maza de guerra pesada.',
    weight: 80,
    sellPrice: 50,
    buyPrice: 100,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'weapon',
    weaponType: 'mace',
    requiredLevel: 1,
    requiredJob: ['High Priest'],
    statBonuses: { atk: 15 }
  },

  // ============================================================================
  // EQUIPMENT - Armaduras
  // ============================================================================
  {
    id: 'helmet_1',
    name: 'Cap',
    type: 'equipment',
    description: 'Un casco básico de cuero.',
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
    id: 'armor_1',
    name: 'Cotton Shirt',
    type: 'equipment',
    description: 'Una camisa de algodón ligera.',
    weight: 20,
    sellPrice: 10,
    buyPrice: 20,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'body',
    armorType: 'armor',
    requiredLevel: 1,
    statBonuses: { def: 5 }
  },
  {
    id: 'shield_1',
    name: 'Shield [1]',
    type: 'equipment',
    description: 'Un escudo de madera.',
    weight: 50,
    sellPrice: 30,
    buyPrice: 60,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'shield',
    armorType: 'shield',
    requiredLevel: 1,
    statBonuses: { def: 10 }
  },
  {
    id: 'shoes_1',
    name: 'Sandals',
    type: 'equipment',
    description: 'Sandalias de cuero.',
    weight: 20,
    sellPrice: 15,
    buyPrice: 30,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'shoes',
    armorType: 'shoes',
    requiredLevel: 1,
    statBonuses: { flee: 5 }
  },
  {
    id: 'garment_1',
    name: 'Muffler',
    type: 'equipment',
    description: 'Un muffler de tela.',
    weight: 15,
    sellPrice: 20,
    buyPrice: 40,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'garment',
    armorType: 'garment',
    requiredLevel: 1,
    statBonuses: { flee: 3 }
  },

  // ============================================================================
  // EQUIPMENT - Accesorios
  // ============================================================================
  {
    id: 'ring_1',
    name: 'Ring',
    type: 'equipment',
    description: 'Un anillo de plata.',
    weight: 5,
    sellPrice: 100,
    buyPrice: 200,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'accessory1',
    armorType: 'accessory',
    requiredLevel: 1,
    statBonuses: { luk: 1 }
  },
  {
    id: 'necklace_1',
    name: 'Necklace',
    type: 'equipment',
    description: 'Un collar de jade.',
    weight: 5,
    sellPrice: 100,
    buyPrice: 200,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'accessory2',
    armorType: 'accessory',
    requiredLevel: 1,
    statBonuses: { int: 1 }
  },

  // ============================================================================
  // EQUIPMENT - Headgear (cosmético + stats)
  // ============================================================================
  {
    id: 'bunny_band',
    name: 'Bunny Band',
    type: 'equipment',
    description: 'Unas orejas de conejo adorables.',
    weight: 10,
    sellPrice: 1000,
    buyPrice: 2000,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'head',
    armorType: 'helmet',
    requiredLevel: 1,
    statBonuses: { luk: 3, def: 1 }
  },
  {
    id: 'ragnarok_crown',
    name: 'Ragnarok Crown',
    type: 'equipment',
    description: 'La corona sagrada de Ragnarok.',
    weight: 30,
    sellPrice: 10000,
    buyPrice: 20000,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'head',
    armorType: 'helmet',
    requiredLevel: 50,
    statBonuses: { str: 5, int: 5, def: 10 }
  },
  {
    id: 'magician_hat',
    name: 'Magician Hat',
    type: 'equipment',
    description: 'Un gorro de magio pintoresco.',
    weight: 10,
    sellPrice: 500,
    buyPrice: 1000,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'head',
    armorType: 'helmet',
    requiredLevel: 1,
    statBonuses: { int: 2, maxSp: 50 }
  },
  {
    id: 'goggles',
    name: 'Goggles',
    type: 'equipment',
    description: 'Antiparras de inventor.',
    weight: 10,
    sellPrice: 500,
    buyPrice: 1000,
    stackable: false,
    maxStack: 1,
    equipmentSlot: 'head',
    armorType: 'helmet',
    requiredLevel: 1,
    statBonuses: { dex: 2 }
  },

  // ============================================================================
  // MATERIALS
  // ============================================================================
  {
    id: 'jellopy',
    name: 'Jellopy',
    type: 'material',
    description: 'Un trozo de gelatina translúcida.',
    weight: 1,
    sellPrice: 1,
    buyPrice: 0,
    stackable: true,
    maxStack: 100
  },
  {
    id: 'sticky_mucus',
    name: 'Sticky Mucus',
    type: 'material',
    description: 'Moco pegajoso de un Poring.',
    weight: 1,
    sellPrice: 2,
    buyPrice: 0,
    stackable: true,
    maxStack: 100
  },
  {
    id: 'empty_bottle',
    name: 'Empty Bottle',
    type: 'material',
    description: 'Un frasco vacío.',
    weight: 2,
    sellPrice: 2,
    buyPrice: 0,
    stackable: true,
    maxStack: 100
  },
  {
    id: 'mvp_coin',
    name: 'MVP Coin',
    type: 'material',
    description: 'Una monada especial de MVP.',
    weight: 0,
    sellPrice: 0,
    buyPrice: 0,
    stackable: true,
    maxStack: 999
  },

  // ============================================================================
  // ARROWS (para Sniper)
  // ============================================================================
  {
    id: 'arrow',
    name: 'Arrow',
    type: 'arrow',
    description: 'Flechas básicas.',
    weight: 1,
    sellPrice: 1,
    buyPrice: 2,
    stackable: true,
    maxStack: 500
  },
  {
    id: 'silver_arrow',
    name: 'Silver Arrow',
    type: 'arrow',
    description: 'Flechas de plata que dañan a sombras.',
    weight: 1,
    sellPrice: 3,
    buyPrice: 6,
    stackable: true,
    maxStack: 500
  },

  // ============================================================================
  // ETC (misc items)
  // ============================================================================
  {
    id: 'scell',
    name: 'Scell',
    type: 'etc',
    description: 'La esencia de un Poring.',
    weight: 1,
    sellPrice: 6,
    buyPrice: 0,
    stackable: true,
    maxStack: 100
  },
  {
    id: 'zealotus_mark',
    name: 'Zealotus Mark',
    type: 'etc',
    description: 'Una marca misteriosa.',
    weight: 1,
    sellPrice: 100,
    buyPrice: 0,
    stackable: true,
    maxStack: 100
  }
];

// Helper to create a Map from the database
export function createItemDatabase(): Map<string, ItemDefinition> {
  const db = new Map<string, ItemDefinition>();
  ITEM_DATABASE.forEach(item => db.set(item.id, item));
  return db;
}
