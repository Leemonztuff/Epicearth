# Análisis de Arquitectura: Epicearth → MMORPG-Ready

**Fecha**: 2026-05-29
**Objetivo**: Refactorizar hacia MMORPG-ready SIN rehacer el proyecto
**Stack**: Next.js 15, React 19, Three.js, Zustand, TypeScript

---

## 1. Resumen Ejecutivo

### Estado Actual
El proyecto es un **single-player realtime sandbox** con arquitectura tipo "game loop monolítico". La mayoría de la lógica vive en `engine.ts` como orquestador central. Los sistemas están razonablemente separados pero comparten mutable state a través de referencias directas.

### Veredicto
**Factible refactorizar sin rehacer.** La base tiene buenos cimientos (spatial grid, command pattern, event system en `worldRuntime.ts`). El problema principal es **acoplamiento excesivo entre engine.ts y todos los demás sistemas**, plus la ausencia de boundaries claros cliente/servidor.

### Esfuerzo Estimado
- **Fase 1** (Boundaries): ~2-3 días
- **Fase 2** (Authority Model): ~3-4 días
- **Fase 3** (Networking Prep): ~4-5 días
- **Total**: ~9-12 días de refactor incremental

---

## 2. Problemas Críticos (Rank Severity)

### CRÍTICO: Acoplamiento Engine ↔ Store (Severity: 10/10)

**Archivo**: `engine.ts:134-178`

```typescript
// PROBLEMA: engine.ts accede directamente a Zustand en init
const store = useGameStore.getState();
this.playerEntity = EntitySpawner.createPlayer(store.jobClass);

// PROBLEMA: engine muta el store directamente
useGameStore.setState({
  currentHp: this.playerEntity.currentHp,
  currentSp: this.playerEntity.currentSp
});
```

**Impacto**: Imposible ejecutar el engine en un Web Worker o en el servidor. El store es un singleton global que cada sistema muta libremente.

**Solución**: Inyectar el store como dependencia, no importarlo como singleton.

---

### CRÍTICO: Doble Update Loop (Severity: 9/10)

**Archivo**: `engine.ts:251-257`

```typescript
// PROBLEMA: worldRuntime.update() se llama DOS veces por tick
this.worldRuntime.update(dt, now);          // línea 252
this.combatSystem.tickActiveCasting(dt);    // línea 255
this.combatSystem.tickAutoCombat(now, dt);  // línea 256
this.worldRuntime.update(dt, now);          // línea 257 ← DUPLICADO
```

**Impacto**: Doble procesamiento de projectiles, buffs, y regeneración. Bugs sutiles de timing.

**Solución**: Un solo game loop con orden de ejecución claro.

---

### ALTO: Entity Ownership Ambiguo (Severity: 8/10)

**Archivo**: `engine.ts:40-43`, `combat.ts:6-8`, `worldRuntime.ts:208-212`

```
engine.ts:       private monsters: Entity[]
combat.ts:       private monsters: Entity[]
worldRuntime.ts: private monsters: Entity[]
input.ts:        private monsters: Entity[]
npc.ts:          private npcs: Entity[]
```

**Problema**: Cada sistema tiene su propia copia de referencia a las mismas entidades. Si un sistema muerta una entidad, los otros no lo saben hasta el próximo frame.

**Impacto**: Race conditions, stale references, bugs de rendering.

---

### ALTO: InputHandler accede a private members via `as any` (Severity: 8/10)

**Archivo**: `input.ts:177-190`

```typescript
const camera = (this.renderer as any).__camera as THREE.PerspectiveCamera;
const spriteArray = Object.keys((this.renderer as any).__entityMeshes || {})
```

**Problema**: InputHandler viola el encapsulamiento de GameRenderer usando `as any`. Esto crea un acoplamiento invisible que rompe si renderer cambia internamente.

---

### ALTO: CombatSystem muta Entity directamente (Severity: 7/10)

**Archivo**: `combat.ts:92-93, 119-120, 177-179, 228-229`

```typescript
this.playerEntity.currentSp -= skill.spCost;  // muta directamente
targetMob.currentHp = Math.max(0, targetMob.currentHp - damage);  // muta directamente
targetMob.state = 'hit';  // muta directamente
```

**Problema**: En un modelo cliente/servidor, el cliente NO debe mutar HP/SP de entidades. Solo debe enviar comandos y recibir snapshots.

---

### MEDIO: WorldRuntime tiene demasiadas responsabilidades (Severity: 6/10)

**Archivo**: `worldRuntime.ts` (658 líneas)

Responsabilidades actuales:
1. Spatial grid management
2. Entity lifecycle
3. Command queue
4. Event system
5. Monster AI (chase, attack, wander)
6. HP/SP regeneration
7. Buff decay
8. Projectile physics
9. Loot physics
10. Loot pickup
11. Cooldown management

**Problema**: 11 responsabilidades en una clase. Difícil de testear, de reutilizar, y de separar cliente/servidor.

---

### MEDIO: IDs hardcodeados (Severity: 5/10)

**Archivo**: `worldRuntime.ts:349`

```typescript
mob.targetEntityId = 'player_main';  // hardcodeado
```

**Problema**: En MMO hay múltiples jugadores. Este hardcode hace imposible soportar otros jugadores.

---

### BAJO: Duplicated projectile logic (Severity: 4/10)

**Archivo**: `combat.ts:359-395`, `worldRuntime.ts:495-533`

Ambos archivos tienen `tickProjectiles()` casi idéntico. El de combat.ts parece ser legacy no utilizado.

---

## 3. Mapa de Acoplamiento

```
┌─────────────────────────────────────────────────────────────┐
│                        engine.ts                            │
│                    (Orquestador Central)                     │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Renderer │←→│  Input   │←→│ Combat   │←→│   NPC    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │         │
│       ▼              ▼              ▼              ▼         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              useGameStore (Zustand)                   │  │
│  │         ← ACCESO DIRECTO DESDE TODOS LOS SISTEMAS →  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ▲                                  │
│  ┌──────────┐  ┌────────┴─────┐  ┌──────────┐            │
│  │  Audio   │  │ WorldRuntime │  │  Spawner  │            │
│  └──────────┘  └──────────────┘  └──────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### Dependencias Peligrosas

| Desde | Hacia | Tipo | Riesgo |
|-------|-------|------|--------|
| engine.ts | useGameStore | import directo | No testeable, no server-ready |
| combat.ts | useGameStore | import directo | Muta state desde lógica de negocio |
| worldRuntime.ts | useGameStore | import directo | AI muta state del jugador |
| input.ts | renderer (as any) | violación encapsulamiento | Rompe si renderer cambia |
| npc.ts | useGameStore | import directo | NPCs mutan inventario |
| spawner.ts | useGameStore | import directo | Lee stats para crear entidades |

---

## 4. Responsabilidades Incorrectas

### Lo que está en el lugar equivocado

| Sistema | Responsabilidad Incorrecta | Debería estar en |
|---------|---------------------------|------------------|
| engine.ts | Movimiento del jugador (tickPlayerMovement) | PlayerController |
| engine.ts | Proximity check de NPCs | NpcSystem o SpatialQuery |
| combat.ts | Recompensas de monstruos (reapMonsterRewards) | RewardSystem / LootManager |
| combat.ts | Level up logic | ProgressionSystem |
| worldRuntime.ts | Monster AI completa | MonsterAI (sistema dedicado) |
| worldRuntime.ts | Loot pickup automático | InventorySystem |
| npc.ts | Aplicar buffs al jugador | BuffSystem |
| npc.ts | Cambiar clase del jugador | ClassSystem |

---

## 5. Problemas de Escalabilidad

### Si añades 100+ entidades:

1. **`updateBillboards()` en engine.ts** recrea texturas CADA FRAME para cada entidad. Con 100 entidades = 100 recreaciones de textura por frame = OOM crash.

2. **`this.monsters.find(m => m.id === ...)`** en combat.ts y worldRuntime.ts es O(n). Con 100 monstruos y 10 búsquedas por tick = 1000 operaciones por frame.

3. **`useGameStore.getState()`** se llama ~15 veces por tick. Cada llamada crea un nuevo snapshot. Con 100 entidades mutando state = stutter.

### Si añades networking:

1. **No hay separation entre simulación y rendering**. El engine mezcla `fixedTick` (lógica) con `renderTick` (visual) en la misma clase.

2. **No hay command pattern real**. `worldRuntime.ts` tiene `WorldCommand` definido pero engine.ts NO lo usa. Los comandos se ejecutan directamente.

3. **No hay serialización**. Las entidades son objetos mutables. No hay forma de hacer snapshot → delta → network send.

4. **No hay authority model**. Todo es client-authoritative. No hay forma de distinguir "el servidor me dijo que el monstruo tiene 50 HP" vs "yo calculo que debería tener 50 HP".

---

## 6. Nueva Arquitectura Propuesta

### Estructura de Directorios

```
lib/
├── game/
│   ├── core/                    # Framework agnóstico (funciona en client y server)
│   │   ├── GameLoop.ts          # Fixed timestep, order de ejecución
│   │   ├── EventBus.ts          # Event system tipado
│   │   ├── CommandQueue.ts      # Command pattern para input
│   │   └── EntityManager.ts     # Entity lifecycle (ya existe en worldRuntime)
│   │
│   ├── shared/                  # Shared entre client y server
│   │   ├── types.ts             # Tipos de entidades, skills, items
│   │   ├── SpatialGrid.ts       # Partición espacial (ya existe)
│   │   ├── DamageCalculator.ts  # Fórmulas de daño (extraído de combat.ts)
│   │   ├── SkillDefinitions.ts  # Data-driven skill configs
│   │   └── BuffSystem.ts        # Buff lifecycle management
│   │
│   ├── server/                  # Solo ejecuta en servidor (futuro)
│   │   ├── ServerState.ts       # Authoritative state
│   │   ├── MonsterAI.ts         # AI de monstruos
│   │   ├── CombatResolver.ts    # Resolución de combate
│   │   ├── LootDropper.ts       # Loot generation
│   │   └── ProgressionSystem.ts # Level up, job change
│   │
│   ├── client/                  # Solo ejecuta en cliente
│   │   ├── ClientState.ts       # Client-side prediction state
│   │   ├── InputHandler.ts      # Touch/joystick input
│   │   ├── RendererBridge.ts    # Conexión engine ↔ renderer
│   │   ├── AudioBridge.ts       # Conexión engine ↔ audio
│   │   └── EffectsBridge.ts     # Conexión engine ↔ effects
│   │
│   ├── rendering/               # Three.js rendering (cliente only)
│   │   ├── GameRenderer.ts      # Billboard system
│   │   ├── CameraController.ts  # Follow cam + shake
│   │   ├── EffectsSystem.ts     # Floating text, particles
│   │   └── ProjectileRenderer.ts
│   │
│   └── RagnarokEngine.ts        # Orquestador delgado (solo wiring)
```

### Nuevos Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        CORE (Shared)                            │
│  GameLoop ← EventBus ← CommandQueue ← EntityManager           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SHARED LOGIC                          │   │
│  │  DamageCalculator │ BuffSystem │ SpatialGrid            │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
    ┌───────────▼───────────┐     ┌─────────────▼──────────────┐
    │      SERVER ONLY      │     │       CLIENT ONLY          │
    │                       │     │                            │
    │  ServerState          │     │  ClientState               │
    │  MonsterAI            │     │  InputHandler              │
    │  CombatResolver       │────▶│  RendererBridge            │
    │  LootDropper          │ Net │  EffectsBridge             │
    │  ProgressionSystem    │     │  AudioBridge               │
    │                       │     │                            │
    │                       │     │  GameRenderer              │
    │                       │     │  CameraController          │
    │                       │     │  EffectsSystem             │
    └───────────────────────┘     └────────────────────────────┘
```

---

## 7. Authority Model

### Principio: Server Authoritative, Client Predictive

| Aspecto | Authority | Ejemplo |
|---------|-----------|---------|
| HP/SP de entidades | **Server** | Server calcula daño, envía snapshot |
| Posición del jugador | **Client → Server** | Client predice, server valida |
| Posición de monstruos | **Server** | Server mueve, client interpola |
| Uso de skills | **Client → Server** | Client envía comando, server resuelve |
| Loot drops | **Server** | Server genera, client renderiza |
| Buffs/effects | **Server** | Server aplica, client muestra |
| NPCs/dialogue | **Server** | Server valida interacción |

### Entity Ownership

```typescript
interface EntityOwnership {
  entityId: string;
  owner: 'server' | 'client';
  authority: {
    position: 'server' | 'client';
    health: 'server';
    stats: 'server';
    inventory: 'server';
    combat: 'server';
  };
  prediction?: {
    lastServerUpdate: number;
    predictedPosition: { x: number; z: number };
    inputSequence: number;
  };
}
```

---

## 8. Serialization Strategy

### Entity Snapshot (para network transport)

```typescript
// Minimal snapshot - solo lo que cambia
interface EntitySnapshot {
  id: string;
  // Delta fields (solo si cambiaron)
  x?: number;
  z?: number;
  hp?: number;
  sp?: number;
  state?: EntityState;
  facing?: 'left' | 'right';
  targetEntityId?: string | null;
}

// Full snapshot (para sync inicial)
interface FullEntitySnapshot extends EntitySnapshot {
  name: string;
  type: EntityType;
  maxHp: number;
  maxSp: number;
  stats?: CharacterStats;
  buffs?: string[];
}
```

### Delta Compression

```typescript
interface WorldSnapshot {
  tick: number;
  entities: EntitySnapshot[];
  events: WorldEvent[];
  playerInputAck?: number;
}

// Diferencia entre snapshots
function computeDelta(prev: WorldSnapshot, next: WorldSnapshot): Partial<WorldSnapshot> {
  // Solo enviar campos que cambiaron
}
```

---

## 9. Networking Preparation - Abstractions Necesarias AHORA

### 1. Interfaz de Comando Unificada

```typescript
// Crear AHORA - reemplaza el uso directo de mutations
interface GameCommand {
  type: 'move' | 'attack' | 'skill' | 'use_item' | 'interact_npc';
  playerId: string;
  sequence: number;
  payload: Record<string, unknown>;
  timestamp: number;
}

// En engine.ts, reemplazar:
// this.playerEntity.targetX = coords.x;
// Por:
// commandQueue.enqueue({ type: 'move', payload: { x, z } });
```

### 2. State Provider Abstraction

```typescript
// Crear AHORA - permite swap entre local y network state
interface StateProvider {
  getEntity(id: string): Entity | undefined;
  getPlayerEntity(): Entity;
  getMonsters(): Entity[];
  getNpcs(): Entity[];
  updateEntity(id: string, delta: Partial<Entity>): void;
  onStateChange(handler: (event: StateChangeEvent) => void): void;
}

// Implementación actual (local):
class LocalStateProvider implements StateProvider { ... }

// Futura implementación (network):
class NetworkStateProvider implements StateProvider { ... }
```

### 3. Event Bus Tipado (ya existe parcialmente en worldRuntime)

```typescript
// Expandir el WorldEvent existente
type GameEvent =
  | WorldEvent
  | { type: 'player_input'; input: GameCommand }
  | { type: 'state_sync'; snapshot: WorldSnapshot }
  | { type: 'prediction_miss'; entityId: string; serverPos: { x: number; z: number }; clientPos: { x: number; z: number } };
```

---

## 10. Ruta de Migración (Incremental)

### Fase 1: Decouple Engine del Store (2-3 días)

**Paso 1.1**: Crear `GameCommand` interface y `CommandQueue` en `core/`
**Paso 1.2**: Crear `StateProvider` interface
**Paso 1.3**: Refactorizar `engine.ts` para inyectar StateProvider en vez de importar useGameStore
**Paso 1.4**: Mover `tickPlayerMovement` a `PlayerController` dedicado
**Paso 1.5**: Eliminar acceso directo a useGameStore desde combat.ts, worldRuntime.ts, npc.ts

### Fase 2: Separate Simulation from Rendering (3-4 días)

**Paso 2.1**: Crear `GameLoop` con orden de ejecución explícito
**Paso 2.2**: Extraer `MonsterAI` de worldRuntime.ts
**Paso 2.3**: Extraer `BuffSystem` de worldRuntime.ts
**Paso 2.4**: Extraer `LootSystem` de worldRuntime.ts
**Paso 2.5**: Crear `RendererBridge` que solo observe state, no lo muta

### Fase 3: Authority Boundaries (4-5 días)

**Paso 3.1**: Marcar entidades con `ownership` tag
**Paso 3.2**: Implementar `ServerState` mock (simula server authority)
**Paso 3.3**: Implementar `ClientState` con prediction hooks
**Paso 3.4**: Crear serialization para EntitySnapshot
**Paso 3.5**: Implementar delta computation
**Paso 3.6**: Crear network transport stub (WebSocket placeholder)

---

## 11. Recomendaciones por Archivo

### `engine.ts` → `RagnarokEngine.ts`
- **Extraer**: `tickPlayerMovement` → `PlayerController`
- **Extraer**: `tickNpcProximity` → `NpcSystem`
- **Extraer**: `updateBillboards` → `BillboardSystem`
- **Extraer**: `updateSingleEntityBillboard` → `BillboardSystem`
- **Eliminar**: Acceso directo a `useGameStore`
- **Resultado**: Clase delgada que solo wirtea sistemas

### `combat.ts` → `CombatResolver.ts`
- **Extraer**: `reapMonsterRewards` → `LootSystem` + `ProgressionSystem`
- **Extraer**: `tickProjectiles` → `ProjectileSystem` (eliminar duplicado)
- **Cambiar**: No mutar `entity.currentHp` directamente, emitir evento `DamageEvent`
- **Añadir**: Command pattern para `triggerSkillCast`

### `worldRuntime.ts` → Split en 4-5 archivos
- `EntityManager.ts` (ya existe como clase interna)
- `SpatialGrid.ts` (ya existe como clase interna)
- `MonsterAI.ts` (extraer `tickMonsterAI`, `monsterAttack`, `monsterChase`, `monsterWander`)
- `BuffSystem.ts` (extraer `tickBuffDecay`)
- `LootSystem.ts` (extraer `tickLootPhysics`, `tickLootPickup`)
- `RegenSystem.ts` (extraer `tickRegeneration`)

### `input.ts` → `InputHandler.ts`
- **Eliminar**: Acceso a `renderer.__camera` y `renderer.__entityMeshes` via `as any`
- **Inyectar**: Referencia a `CameraController` y `EntityLookup` interface
- **Añadir**: Emisión de `GameCommand` en vez de callbacks directos

### `npc.ts` → `NpcSystem.ts`
- **Extraer**: Aplicación de buffs → `BuffSystem`
- **Extraer**: Cambio de clase → `ClassSystem`
- **Cambiar**: No mutar `playerEntity` directamente, emitir eventos

### `spawner.ts` → `EntitySpawner.ts`
- **Cambiar**: No importar `useGameStore` - recibir stats como parámetro
- **Añadir**: Entity template system (data-driven entity definitions)

### `state.ts` → Mantener pero limitar
- **Mantener**: Como client-side UI state
- **Mover**: Game logic state a `ClientState` o `ServerState`
- **Principio**: Zustand solo para UI, no para game simulation

---

## 12. Anti-Patterns a Eliminar

| Anti-Pattern | Ubicación | Solución |
|--------------|-----------|----------|
| `this.combatSystem['activeCast'] = null` | engine.ts:189 | Exponer `cancelCast()` público |
| `(this.renderer as any).__camera` | input.ts:177 | Inyectar camera reference |
| `(this.worldRuntime as any).battleModeEndTime` | worldRuntime.ts:587 | Exponer getter público |
| `useGameStore.getState()` × 15 por tick | Todos | State provider inyectado |
| `entity.state = 'hit'` mutación directa | combat.ts:178 | Event-driven state change |
| `setTimeout` en game loop | combat.ts:261-263 | Timer system con fixed update |

---

## 13. Métricas de Éxito

| Métrica | Actual | Target |
|---------|--------|--------|
| Accesos a useGameStore por tick | ~15 | 0 (inyectado) |
| Clases con >3 responsabilidades | 3 (engine, worldRuntime, combat) | 0 |
| Uso de `as any` | 4 | 0 |
| Mutaciones directas de Entity | ~20/tick | 0 (event-driven) |
| Archivos duplicados (projectile logic) | 1 | 0 |
| Test coverage | 0% | >60% (core logic) |

---

## 14. Código de Ejemplo: Antes vs Después

### Antes (engine.ts)

```typescript
private handleMove(coords: { x: number; z: number }) {
  if (this.playerEntity.state === 'death') return;
  const store = useGameStore.getState();

  const activeCast = this.combatSystem.getActiveCast();
  if (activeCast) {
    this.combatSystem['activeCast'] = null;  // ← violación encapsulamiento
    useGameStore.setState({ activeCast: null });
    // ...
  }

  this.playerEntity.targetX = coords.x;
  this.playerEntity.targetZ = coords.z;
  this.playerEntity.state = 'move';
  // ...
}
```

### Después (con boundaries)

```typescript
private handleMove(coords: { x: number; z: number }) {
  const command: GameCommand = {
    type: 'move',
    playerId: this.playerEntity.id,
    sequence: this.commandSequence++,
    payload: { x: coords.x, z: coords.z },
    timestamp: performance.now()
  };

  // 1. Emit to command queue (server will validate)
  this.commandQueue.enqueue(command);

  // 2. Client-side prediction (optimistic)
  this.clientState.predictMovement(this.playerEntity.id, coords);

  // 3. Visual feedback only
  this.effectsBridge.spawnTouchIndicator(coords.x, coords.z, 'move');
}
```

---

## 15. Prioridad de Cambios

### Hacer AHORA (sin cambiar comportamiento)
1. Eliminar `as any` en input.ts
2. Eliminar duplicado de `worldRuntime.update()` en engine.ts
3. Eliminar `this.combatSystem['activeCast']` acceso privado
4. Crear interfaces `StateProvider` y `GameCommand`

### Hacer ANTES de networking
1. Separar simulation de rendering en engine.ts
2. Extraer MonsterAI de worldRuntime.ts
3. Eliminar mutaciones directas de entity HP/SP
4. Implementar entity ownership tags

### Hacer PARA networking
1. Implementar serialization
2. Implementar delta compression
3. Crear network transport layer
4. Implementar client prediction + reconciliation

---

*Análisis generado el 2026-05-29*
*Archivos analizados: engine.ts, combat.ts, worldRuntime.ts, input.ts, npc.ts, spawner.ts, state.ts, types.ts, renderer.ts, page.tsx*
