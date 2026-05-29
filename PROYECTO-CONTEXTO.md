# Proyecto Epicearth - Contexto y Estado

## Stack
- Next.js 15, React 19, Three.js, Zustand, TypeScript, Tailwind CSS v4
- lucide-react 1.17.0 (iconos)
- motion 11.18.0 (animaciones)

## Estado Actual (2026-05-29)
- Sandbox realtime de Ragnarok Online con combate, NPCs, habilidades, inventario y equipo
- Deployed en Vercel: https://epicearth.vercel.app
- Repo: https://github.com/Leemonztuff/Epicearth

## Arquitectura Refactorizada (Fase 1-5 completada)

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
│   └── CombatRuntime.ts     # Motor de combate determinístico
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
└── types.ts                 # Tipos TypeScript (247 líneas)

app/
├── components/
│   └── InventoryPanel.tsx   # UI de inventario y equipo (~350 líneas)
├── page.tsx                 # Página principal (~760 líneas)
├── layout.tsx               # Layout raíz
└── globals.css              # Estilos
```

### Sistemas Implementados

| Sistema | Archivo | Estado |
|---------|---------|--------|
| MonsterAI | `server/MonsterAI.ts` | ✅ Integrado |
| CombatRuntime | `server/CombatRuntime.ts` | ✅ Integrado (aggro, pipelines) |
| RegenSystem | `shared/RegenSystem.ts` | ✅ Integrado |
| ProjectileSystem | `shared/ProjectileSystem.ts` | ✅ Integrado |
| CooldownSystem | `shared/CooldownSystem.ts` | ✅ Integrado |
| BuffSystem | `shared/BuffSystem.ts` | ✅ Integrado |
| LootSystem | `shared/LootSystem.ts` | ✅ Integrado |
| PlayerController | `client/PlayerController.ts` | ✅ Integrado |
| InventorySystem | `shared/InventorySystem.ts` | ✅ Sincronizado con equipo |
| EquipmentSystem | `shared/EquipmentSystem.ts` | ✅ Sincronizado con inventario |
| ItemDatabase | `shared/ItemDatabase.ts` | ✅ 30+ items |

### Inversión de Dependencias
- GameContext con GameStoreAPI (interfaz)
- createGameContext() (factory function)
- Todos los sistemas reciben GameContext via constructor
- Sin acoplamiento directo a useGameStore

### UI Implementada
- Botón de inventario en HUD (Package icon) + tecla `I`
- Panel de inventario slide-in con tabs (Inventario / Equipo)
- Botón de pociones conectado al inventario
- Contador real de pociones en HUD
- Drops de monstruos van al inventario (loot en suelo + pickup)
- Barra de peso con advertencia al >80%
- Bonos combinados del equipo visibles en pestaña Equipo
- Confirmación al remover equipo (evita clacs accidentales)
- Stats de equipo visibles al seleccionar item en inventario
- Indicador de amenaza (aggro) en la barra de target del enemigo

### Sistema de Inventario (RO Style)
- 30 slots máximo
- Peso máximo: 2000 unidades (200kg)
- Items stackables y no stackables
- Zeny reactivo vía Zustand (sincronizado automáticamente)
- 30+ items definidos en ItemDatabase

### Sistema de Equipo
- 8 slots: head, body, weapon, shield, shoes, garment, accessory1, accessory2
- Restricciones de nivel y clase
- Bonuses de stats por item + refinamiento (+1 a +10)
- Bonos combinados calculados en vivo
- Sincronizado bidireccionalmente con inventario (equipar ↔ desequipar)

### Aggro / Threat
- Sistema de tabla de aggro en CombatRuntime
- Eventos `combat:aggro` y `combat:aggro_lost` via EventBus
- Indicador visual en la UI del target (🔥 Aggro: TÚ / nombre)
- Monstruos cambian de target basado en threat

## Pendiente
- Tests unitarios para sistemas (setup necesario)
- Serialization layer para networking
- Event-driven mutations (reemplazar mutaciones directas)
- Client prediction para networking
- Más items, equipo, y monstruos
- Mapa más grande con zonas
