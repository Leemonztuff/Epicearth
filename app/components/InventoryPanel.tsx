'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, Shield, Sword, X, ChevronDown, ChevronUp,
  Weight, Coins, Shirt, Headphones, Footprints, HandMetal
} from 'lucide-react';
import { useGameStore } from '../../lib/game/state';
import { InventorySlot, EquipmentSlot, EquipmentSlotState, ItemDefinition, CharacterStats } from '../../lib/game/types';

// ============================================================================
// INVENTORY & EQUIPMENT PANEL - PULIDO
// ============================================================================

interface InventoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  inventorySlots: readonly (InventorySlot | null)[];
  equipmentState: Record<EquipmentSlot, EquipmentSlotState>;
  itemDefinitions: Map<string, ItemDefinition>;
  equipmentBonuses: Partial<CharacterStats>;
  zeny: number;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (itemId: string) => void;
  onUnequipItem: (slot: EquipmentSlot) => void;
}

const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, { label: string; icon: React.ReactNode }> = {
  head: { label: 'Cabeza', icon: <Headphones className="w-4 h-4" /> },
  body: { label: 'Cuerpo', icon: <Shirt className="w-4 h-4" /> },
  weapon: { label: 'Arma', icon: <Sword className="w-4 h-4" /> },
  shield: { label: 'Escudo', icon: <Shield className="w-4 h-4" /> },
  shoes: { label: 'Zapatos', icon: <Footprints className="w-4 h-4" /> },
  garment: { label: 'Capa', icon: <HandMetal className="w-4 h-4" /> },
  accessory1: { label: 'Accesorio 1', icon: <span className="text-xs">💍</span> },
  accessory2: { label: 'Accesorio 2', icon: <span className="text-xs">📿</span> }
};

const STAT_BONUS_LABELS: Record<string, { label: string; color: string }> = {
  bonusAtk: { label: 'ATK', color: 'text-red-400' },
  bonusDef: { label: 'DEF', color: 'text-blue-400' },
  bonusHit: { label: 'HIT', color: 'text-green-400' },
  bonusFlee: { label: 'FLEE', color: 'text-yellow-400' },
  bonusAspd: { label: 'ASPD', color: 'text-cyan-400' },
  bonusMaxHp: { label: 'MaxHP', color: 'text-rose-400' },
  bonusMaxSp: { label: 'MaxSP', color: 'text-purple-400' },
  bonusCrit: { label: 'CRIT', color: 'text-orange-400' },
};

export function InventoryPanel({
  isOpen,
  onClose,
  inventorySlots,
  equipmentState,
  itemDefinitions,
  equipmentBonuses,
  zeny,
  onUseItem,
  onEquipItem,
  onUnequipItem
}: InventoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'equipment'>('inventory');
  const [selectedItem, setSelectedItem] = useState<{ slotIndex: number; item: InventorySlot } | null>(null);
  const [confirmUnequip, setConfirmUnequip] = useState<EquipmentSlot | null>(null);
  const store = useGameStore();

  const getOccupiedCount = () => inventorySlots.filter(s => s !== null).length;
  const getTotalWeight = () => {
    let weight = 0;
    inventorySlots.forEach(slot => {
      if (slot) {
        const def = itemDefinitions.get(slot.itemDefId);
        if (def) weight += def.weight * slot.quantity;
      }
    });
    return weight;
  };

  const maxWeight = 2000;
  const currentWeight = getTotalWeight();
  const weightPct = Math.min(100, (currentWeight / maxWeight) * 100);
  const isOverweight = weightPct > 80;

  const getItemDef = (itemId: string): ItemDefinition | undefined => {
    return itemDefinitions.get(itemId);
  };

  const getItemColor = (type: string): string => {
    switch (type) {
      case 'consumable': return 'from-green-500/20 to-emerald-600/20 border-green-500/30';
      case 'equipment': return 'from-blue-500/20 to-indigo-600/20 border-blue-500/30';
      case 'material': return 'from-amber-500/20 to-yellow-600/20 border-amber-500/30';
      case 'arrow': return 'from-purple-500/20 to-violet-600/20 border-purple-500/30';
      default: return 'from-slate-500/20 to-gray-600/20 border-slate-500/30';
    }
  };

  const getSlotColor = (equipped: boolean): string => {
    return equipped 
      ? 'bg-cyan-950/40 border-cyan-500/50' 
      : 'bg-slate-900/40 border-slate-700/30';
  };

  const hasStatBonuses = Object.entries(equipmentBonuses).some(([_, v]) => (v || 0) > 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className="absolute top-0 right-0 z-30 w-full max-w-md h-full bg-[#0a0f1a]/95 backdrop-blur-xl border-l border-slate-800/50 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800/50">
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">INVENTARIO & EQUIPO</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-800/50">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 py-3 text-xs font-bold tracking-wider transition-colors ${
                activeTab === 'inventory' 
                  ? 'text-cyan-400 border-b-2 border-cyan-400' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Package className="w-4 h-4 inline mr-1.5" />
              INVENTARIO
            </button>
            <button
              onClick={() => setActiveTab('equipment')}
              className={`flex-1 py-3 text-xs font-bold tracking-wider transition-colors ${
                activeTab === 'equipment' 
                  ? 'text-cyan-400 border-b-2 border-cyan-400' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-1.5" />
              EQUIPO
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'inventory' ? (
              <div className="space-y-4">
                {/* Stats Bar */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800/50">
                    <div className="text-[9px] text-slate-500 font-mono">SLOTS</div>
                    <div className="text-xs font-bold text-slate-200">{getOccupiedCount()}/30</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800/50">
                    <div className="text-[9px] text-slate-500 font-mono">PESO</div>
                    <div className="text-xs font-bold text-slate-200">{currentWeight}/{maxWeight}</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800/50">
                    <div className="text-[9px] text-slate-500 font-mono">ZENY</div>
                    <div className="text-xs font-bold text-amber-400">{zeny.toLocaleString()}</div>
                  </div>
                </div>

                {/* Weight Bar */}
                <div className="w-full h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${weightPct}%` }}
                    className={`h-full rounded-full transition-colors ${
                      isOverweight ? 'bg-red-500' : 'bg-cyan-500/60'
                    }`}
                  />
                </div>
                {isOverweight && (
                  <div className="text-[9px] font-mono text-red-400 text-center">
                    ⚠ Peso cerca del límite — no podrás recoger más items
                  </div>
                )}

                {/* Inventory Grid */}
                <div className="grid grid-cols-5 gap-1.5">
                  {inventorySlots.map((slot, index) => {
                    const itemDef = slot ? getItemDef(slot.itemDefId) : null;
                    return (
                      <button
                        key={index}
                        onClick={() => slot && setSelectedItem({ slotIndex: index, item: slot })}
                        className={`relative aspect-square rounded-lg border transition-all flex flex-col items-center justify-center ${
                          slot && itemDef
                            ? `${getItemColor(itemDef.type)} hover:scale-105`
                            : 'bg-slate-900/30 border-slate-800/30 hover:bg-slate-800/30'
                        }`}
                      >
                        {slot && itemDef ? (
                          <>
                            <span className="text-lg">{getItemEmoji(itemDef.type)}</span>
                            {slot.quantity > 1 && (
                              <span className="text-[8px] font-mono text-white/70 absolute bottom-0.5 right-0.5">
                                {slot.quantity}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-700 text-xs">·</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Item Details */}
                {selectedItem && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/30"
                  >
                    {(() => {
                      const itemDef = getItemDef(selectedItem.item.itemDefId);
                      if (!itemDef) return null;
                      return (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-slate-100">{itemDef.name}</span>
                            <span className="text-[9px] font-mono text-slate-500">x{selectedItem.item.quantity}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mb-2">{itemDef.description}</p>
                          <div className="flex items-center space-x-2 text-[9px] font-mono text-slate-500 mb-3">
                            <span>Peso: {itemDef.weight}</span>
                            <span>•</span>
                            <span>Venta: {itemDef.sellPrice}z</span>
                          </div>

                          {/* Show stat bonuses for equipment items */}
                          {itemDef.type === 'equipment' && itemDef.statBonuses && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {Object.entries(itemDef.statBonuses).map(([stat, value]) => (
                                <span key={stat} className="text-[8px] font-mono px-1.5 py-0.5 bg-slate-800/80 rounded text-cyan-400">
                                  {stat.toUpperCase()}: +{value}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex space-x-2">
                            {itemDef.type === 'consumable' && (
                              <button
                                onClick={() => {
                                  onUseItem(selectedItem.slotIndex);
                                  setSelectedItem(null);
                                }}
                                className="flex-1 py-1.5 text-[10px] font-bold bg-green-600/80 hover:bg-green-500/80 text-white rounded-lg transition-colors"
                              >
                                USAR
                              </button>
                            )}
                            {itemDef.type === 'equipment' && itemDef.equipmentSlot && (
                              <button
                                onClick={() => {
                                  onEquipItem(selectedItem.item.itemDefId);
                                  setSelectedItem(null);
                                }}
                                className="flex-1 py-1.5 text-[10px] font-bold bg-blue-600/80 hover:bg-blue-500/80 text-white rounded-lg transition-colors"
                              >
                                EQUIPAR
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedItem(null)}
                              className="px-3 py-1.5 text-[10px] font-bold bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors"
                            >
                              CERRAR
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Combined Stat Bonuses Banner */}
                {hasStatBonuses && (
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/30">
                    <div className="text-[9px] text-slate-500 font-mono mb-1.5 uppercase tracking-wider">Bonos Totales del Equipo</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(equipmentBonuses).map(([stat, value]) => {
                        if (!value || value <= 0) return null;
                        const info = STAT_BONUS_LABELS[stat];
                        return info ? (
                          <span key={stat} className={`text-[10px] font-mono px-2 py-0.5 bg-slate-800/70 rounded-full ${info.color}`}>
                            {info.label} +{value}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                {/* Equipment Grid */}
                {(Object.keys(EQUIPMENT_SLOT_LABELS) as EquipmentSlot[]).map((slot) => {
                  const equipped = equipmentState[slot];
                  const itemDef = equipped?.itemDefId ? getItemDef(equipped.itemDefId) : null;
                  const slotInfo = EQUIPMENT_SLOT_LABELS[slot];
                  const isConfirming = confirmUnequip === slot;

                  return (
                    <div
                      key={slot}
                      className={`rounded-xl p-3 border transition-all ${getSlotColor(!!itemDef)}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-500">{slotInfo.icon}</span>
                          <div>
                            <div className="text-[10px] text-slate-500 font-mono">{slotInfo.label}</div>
                            {itemDef ? (
                              <div className="text-xs font-bold text-slate-100">{itemDef.name}</div>
                            ) : (
                              <div className="text-[10px] text-slate-600 italic">Vacío</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {itemDef && equipped.refinement > 0 && (
                            <span className="text-[9px] font-mono text-cyan-400">+{equipped.refinement}</span>
                          )}
                          {itemDef && !isConfirming && (
                            <button
                              onClick={() => setConfirmUnequip(slot)}
                              className="px-2 py-1 text-[9px] font-bold bg-red-600/50 hover:bg-red-500/50 text-white rounded transition-colors"
                            >
                              REMOVER
                            </button>
                          )}
                          {itemDef && isConfirming && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => {
                                  onUnequipItem(slot);
                                  setConfirmUnequip(null);
                                }}
                                className="px-2 py-1 text-[9px] font-bold bg-red-500 text-white rounded transition-colors"
                              >
                                CONFIRMAR
                              </button>
                              <button
                                onClick={() => setConfirmUnequip(null)}
                                className="px-2 py-1 text-[9px] font-bold bg-slate-600/50 text-slate-300 rounded transition-colors"
                              >
                                CANCELAR
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {itemDef && itemDef.statBonuses && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(itemDef.statBonuses).map(([stat, value]) => (
                            <span key={stat} className="text-[8px] font-mono px-1.5 py-0.5 bg-slate-800/50 rounded text-cyan-400">
                              {stat.toUpperCase()}: +{value}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getItemEmoji(type: string): string {
  switch (type) {
    case 'consumable': return '🧪';
    case 'equipment': return '⚔️';
    case 'material': return '💎';
    case 'arrow': return '🏹';
    default: return '📦';
  }
}
