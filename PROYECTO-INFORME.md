# INFORME DEL PROYECTO: Epicearth (Ragnarok Engine)

## Descripción General
Un sandbox en tiempo real de **Ragnarok Online** hecho con **Next.js 15 + Three.js + React 19**. Motor de juego mobile/touch con combate, NPCs, habilidades, sistema de inventario/equipo y arquitectura modular preparada para networking.

---

## Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|------------|---------|
| Framework | Next.js (App Router) | 15.1 |
| Rendering 3D | Three.js | 0.160 |
| UI | React | 19.0 |
| Estado | Zustand | 4.5 |
| Animaciones | Framer Motion (motion) | 11.15 |
| Estilos | Tailwind CSS | 4.1 |
| Iconos | Lucide React | 1.17.0 |
| TypeScript | TypeScript | 5.3 |

---

## Estructura de Archivos

```
/
├── app/
│   ├── layout.tsx          # Layout raíz (fonts: Inter, Space Grotesk, JetBrains Mono)
│   ├── page.tsx            # Página principal del juego (~665 líneas)
│   ├── globals.css         # Estilos globales
│   └── not-found.tsx       # Página 404
├── lib/
│   └── game/
│       ├── core/                    # Framework agnóstico
│       │   ├── GameCommand.ts       # Command pattern para networking
│       │   ├── EventBus.ts          # Event system tipado
│       │   ├── StateProvider.ts     # Abstracción de state
│       │   ├── GameContext.ts       # Dependency injection
│       │   └── index.ts
│       ├── shared/                  # Shared entre client/server
│       │   ├── BuffSystem.ts        # Gestión de buffs
│       │   ├── LootSystem.ts        # Física y pickup de loot
│       │   ├── RegenSystem.ts       # Regeneración HP/SP
│       │   ├── ProjectileSystem.ts  # Física de proyectiles
│       │   ├── CooldownSystem.ts    # Battle mode, timers
│       │   ├── InventorySystem.ts   # Sistema de inventario
│       │   ├── EquipmentSystem.ts   # Sistema de equipo
│       │   └── ItemDatabase.ts      # Base de datos de items
│       ├── server/
│       │   └── MonsterAI.ts         # AI de monstruos
│       ├── client/
│       │   ├── PlayerController.ts  # Movimiento/input
│       │   ├── RendererBridge.ts    # Separación rendering↔lógica
│       │   └── LocalStateProvider.ts # Implementación local
│       ├── engine.ts                # Orquestador principal
│       ├── worldRuntime.ts          # Delega a 6 sistemas
│       ├── combat.ts                # Sistema de combate
│       ├── input.ts                 # Touch/joystick input
│       ├── npc.ts                   # Sistema de NPCs
│       ├── renderer.ts              # Three.js rendering
│       ├── effects.ts               # Efectos visuales
│       ├── audio.ts                 # Sistema de audio
│       ├── spawner.ts               # Spawner de entidades
│       └── types.ts                 # Tipos TypeScript
├── docs/
│   └── architecture/
│       └── ARCHITECTURE-ANALYSIS.md # Análisis de arquitectura
├── production/
│   └── session-logs/
│       └── session-log.md           # Logs de sesión
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
├── vercel.json                      # Configuración Vercel
├── .gitignore
├── PROYECTO-INFORME.md              # Este archivo
└── PROYECTO-CONTEXTO.md             # Contexto y estado
```

---

## Sistemas Implementados

### 1. Motor 3D (`engine.ts`)
- Orquestador principal que inicializa Three.js
- Loop de juego con fixed timestep (60 FPS logic)
- Cámara con seguimiento y screen shake
- Renderizado por billboards (sprites 2D en 3D)
- Dependency injection via GameContext

### 2. Combate (`combat.ts`)
- Auto-combate con targeting
- Sistema de cast con tiempo de canalización
- Habilidades con cooldowns y costos SP
- Proyectiles y efectos de daño
- Modo batalla con indicadores visuales

### 3. Input (`input.ts`)
- Touch-to-move (toque en terreno)
- Virtual joystick opcional
- Multitouch para combate simultáneo
- Sistema de buffer de input (1200ms expiration)
- EntityLookup interface (sin `as any`)

### 4. Estado (`state.ts`)
- Store centralizado con Zustand
- 4 clases de personaje: Lord Knight, High Priest, Assassin Cross, Sniper
- Stats, EXP, skills, inventario, buffs
- Diálogos NPC y sistema de log de combate
- CharacterStats con bonuses de equipo

### 5. Rendering (`renderer.ts`)
- Terreno con grid neón
- Entidades como sprites billboard
- Headgears cosméticos (4 tipos)
- Indicadores de toque y efectos

### 6. Audio (`audio.ts`)
- Efectos de sonido para combate
- Audio ambiental

### 7. Sistema de Inventario (`InventorySystem.ts`)
- 30 slots máximo
- Peso máximo: 2000 unidades (200kg)
- Items stackables y no stackables
- Zeny sincronizado reactivamente vía Zustand
- Método público `getItemDefinitionsMap()` (sin acceso privado)
- Sort por tipo
- ✅ Sincronizado bidireccionalmente con equipo

### 8. Sistema de Equipo (`EquipmentSystem.ts`)
- 8 slots: head, body, weapon, shield, shoes, garment, accessory1, accessory2
- Restricciones de nivel y clase
- Bonuses de stats por equipo + cálculo combinado en vivo
- Bonuses por refinamiento (+1 a +10)
- Slots para cartas (preparado para futuro)
- `calculateStatBonuses()` público para UI
- ✅ Sincronizado bidireccionalmente con inventario

### 9. Base de Datos de Items (`ItemDatabase.ts`)
- 30+ items definidos
- 6 pociones (Red, Orange, Yellow, White, Blue, Green)
- 5 armas (Sword, Blade, Katar, Bow, Mace)
- 5 armaduras (Cap, Cotton Shirt, Shield, Sandals, Muffler)
- 4 accesorios (Ring, Necklace)
- 4 headgears (Bunny Band, Ragnarok Crown, Magician Hat, Goggles)
- 4 materiales (Jellopy, Sticky Mucus, Empty Bottle, MVP Coin)
- 2 tipos de flechas (Arrow, Silver Arrow)
- 3 items misc (Scell, Zealotus Mark)

### 10. Sistemas Extraídos

| Sistema | Archivo | Responsabilidad |
|---------|---------|-----------------|
| MonsterAI | `server/MonsterAI.ts` | AI de monstruos |
| CombatRuntime | `server/CombatRuntime.ts` | Motor determinístico con aggro, daño, status effects |
| RegenSystem | `shared/RegenSystem.ts` | Regeneración HP/SP |
| ProjectileSystem | `shared/ProjectileSystem.ts` | Física de proyectiles |
| CooldownSystem | `shared/CooldownSystem.ts` | Battle mode, timers |
| BuffSystem | `shared/BuffSystem.ts` | Gestión de buffs |
| LootSystem | `shared/LootSystem.ts` | Física y pickup de loot |
| PlayerController | `client/PlayerController.ts` | Movimiento/input del jugador |

---

## Clases de Personaje

| Clase | HP | SP | ATK | DEF | FLEE | Habilidades |
|-------|-----|-----|-----|-----|------|-------------|
| Lord Knight | 18400 | 420 | 340 | 180 | 195 | Bash, Bowling Bash |
| High Priest | 11200 | 1980 | 145 | 150 | 175 | Heal, Holy Light |
| Assassin Cross | 14200 | 510 | 395 | 95 | 285 | Sonic Blow, Grimtooth |
| Sniper | 12500 | 720 | 360 | 110 | 260 | Double Strafe, Blitz Beat |

---

## Monstruos

- 12 roamers (Poring, Poporing, PecoPeco)
- 1 Boss MVP: **Baphomet** (aparece con alerta)

## NPCs

- Kafra (servicios: buff, heal, pociones)
- Crusader Instructor (cambio de clase)

---

## UI/HUD

- Panel de stats (HP/SP/Level)
- Barras de EXP (Base + Job)
- Hotbar de habilidades con cooldown visual circular
- Botón de pociones con contador real
- Indicador de amenaza (🔥 Aggro) en barra de target del enemigo
- Panel de configuración (joystick toggle, clase, headgear)
- Log de combate en tiempo real
- Modal de resurrección al morir
- Diálogos NPC estilo Ragnarok

### Panel de Inventario y Equipo
- Slide-in lateral con tabs (Inventario / Equipo)
- Tecla `I` para abrir/cerrar
- Stats: slots usados, peso, zeny reactivo
- Barra de peso animada con advertencia al >80%
- Grid 5-col de items con colores por tipo
- Detalle de item al seleccionar (peso, precio, stats para equipo)
- Botón USAR para consumibles / EQUIPAR para equipo
- Bonos combinados del equipo visibles en pestaña Equipo
- Confirmación al remover equipo (evita clacs accidentales)

---

## Arquitectura

### Dependency Injection
- GameContext con GameStoreAPI (interfaz)
- createZustandGameStoreAPI() (implementación lazy)
- Todos los sistemas reciben GameContext via constructor
- Eliminado acoplamiento directo con useGameStore

### Preparación para Networking
- CommandQueue (command pattern)
- EventBus (sistema de eventos desacoplado)
- StateProvider (abstracción de state)
- EntityLookup interface (para input handler)

---

## Estado de Git

| Campo | Valor |
|-------|-------|
| Branch | `main` |
| Último commit | Ver `git log` |
| Estado | Sincronizado con origin |

---

## Configuración de Despliegue

- **Plataforma**: Vercel
- **Config**: `vercel.json`
- **Build**: `next build`
- **Output**: `.next/`
- **Variable de entorno**: `GEMINI_API_KEY` (según README)

---

## Notas para el Agente de Código

1. El proyecto ya está funcional y desplegable
2. Usa App Router de Next.js (carpeta `app/`, no `pages/`)
3. Three.js se inicializa solo en cliente (`useEffect` + `mounted` check)
4. Usa GameContext para dependency injection (no importar useGameStore directamente)
5. No hay tests implementados aún
6. No hay `.env.local` - necesita `GEMINI_API_KEY` según README
7. Tailwind CSS v4 (usa `@tailwindcss/postcss` en lugar de config tradicional)
8. lucide-react v1.17.0 (iconos actualizados para React 19)

---

*Informe generado el 2026-05-29 - Actualizado con sincronización inventario↔equipo, aggro UI, zeny reactivo*
