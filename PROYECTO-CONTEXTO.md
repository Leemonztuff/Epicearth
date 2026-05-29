# Proyecto Epicearth - Contexto y Estado

## Stack
- Next.js 15, React 19, Three.js, Zustand, TypeScript, Tailwind CSS v4
- lucide-react 1.17.0 (iconos)
- motion 11.15.0 (animaciones)

## Estado Actual (2026-05-29)
- Sandbox realtime de Ragnarok Online con combate, NPCs, habilidades
- Deployed en Vercel: https://epicearth.vercel.app
- Repo: https://github.com/Leemonztuff/Epicearth

## Arquitectura Refactorizada (Fase 1-4 completada)

### Estructura
```
lib/game/
├── core/                    # Framework agnóstico
│   ├── GameCommand.ts       # Command pattern para networking
│   ├── EventBus.ts          # Event system tipado
│   ├── StateProvider.ts     # Abstracción de state
│   ├── GameContext.ts       # Dependency injection
│   └── index.ts
├── shared/                  # Shared entre client/server
│   ├── BuffSystem.ts        # Gestión de buffs
│   ├── LootSystem.ts        # Física y pickup de loot
│   ├── RegenSystem.ts       # Regeneración HP/SP
│   ├── ProjectileSystem.ts  # Física de proyectiles
│   ├── CooldownSystem.ts    # Battle mode, timers
│   ├── InventorySystem.ts   # Sistema de inventario
│   ├── EquipmentSystem.ts   # Sistema de equipo
│   └── ItemDatabase.ts      # Base de datos de items
├── server/
│   └── MonsterAI.ts         # AI de monstruos
├── client/
│   ├── PlayerController.ts  # Movimiento/input
│   ├── RendererBridge.ts    # Separación rendering↔lógica
│   └── LocalStateProvider.ts # Implementación local
├── engine.ts                # Orquestador principal
├── worldRuntime.ts          # Delega a 6 sistemas
├── combat.ts                # Sistema de combate
├── input.ts                 # Touch/joystick input
├── npc.ts                   # Sistema de NPCs
├── renderer.ts              # Three.js rendering
├── effects.ts               # Efectos visuales
├── audio.ts                 # Sistema de audio
├── spawner.ts               # Spawner de entidades
└── types.ts                 # Tipos TypeScript

app/
├── components/
│   └── InventoryPanel.tsx   # UI de inventario y equipo
├── page.tsx                 # Página principal
├── layout.tsx               # Layout raíz
└── globals.css              # Estilos
```

### Sistemas Implementados

| Sistema | Archivo | Estado |
|---------|---------|--------|
| MonsterAI | `server/MonsterAI.ts` | ✅ Integrado |
| RegenSystem | `shared/RegenSystem.ts` | ✅ Integrado |
| ProjectileSystem | `shared/ProjectileSystem.ts` | ✅ Integrado |
| CooldownSystem | `shared/CooldownSystem.ts` | ✅ Integrado |
| BuffSystem | `shared/BuffSystem.ts` | ✅ Integrado |
| LootSystem | `shared/LootSystem.ts` | ✅ Integrado |
| PlayerController | `client/PlayerController.ts` | ✅ Integrado |
| InventorySystem | `shared/InventorySystem.ts` | ✅ Integrado con UI |
| EquipmentSystem | `shared/EquipmentSystem.ts` | ✅ Integrado con UI |
| ItemDatabase | `shared/ItemDatabase.ts` | ✅ 30+ items |

### Dependency Injection
- GameContext con GameStoreAPI (interfaz)
- createGameContext() (factory function)
- Todos los sistemas reciben GameContext via constructor
- Eliminado acoplamiento directo con useGameStore

### UI Implementada
- Botón de inventario en HUD (Package icon)
- Panel de inventario slide-in con tabs
- Botón de pociones conectado al inventario
- Contador real de pociones
- Drops de monstruos van al inventario

### Sistema de Inventario (RO Style)
- 30 slots máximo
- Peso máximo: 2000 unidades (200kg)
- Items stackables y no stackables
- Sistema de Zeny (moneda)
- 30+ items definidos

### Sistema de Equipo
- 8 slots: head, body, weapon, shield, shoes, garment, accessory1, accessory2
- Restricciones de nivel y clase
- Bonuses de stats por equipo
- Bonuses por refinamiento (+1 a +10)

## Pendiente
- Tests unitarios para sistemas
- Serialization layer para networking
- Event-driven mutations (reemplazar mutaciones directas)
- Client prediction para networking
- Más items y equipo
- UI de equipo mejorada
