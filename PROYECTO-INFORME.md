# INFORME DEL PROYECTO: Epicearth (Ragnarok Engine)

## Descripción General
Un sandbox en tiempo real de **Ragnarok Online** hecho con **Next.js 15 + Three.js + React 19**. Motor de juego mobile/touch con combate, NPCs, habilidades y sistema de input multitouch.

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
| Iconos | Lucide React | 0.395 |
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
│       ├── engine.ts       # Motor principal (RagnarokEngine) - 498 líneas
│       ├── state.ts        # Store Zustand (game state) - 419 líneas
│       ├── types.ts        # Tipos TypeScript - 150 líneas
│       ├── renderer.ts     # Renderizador Three.js - ~700 líneas
│       ├── combat.ts       # Sistema de combate - ~396 líneas
│       ├── input.ts        # Handler de input (touch/joystick)
│       ├── audio.ts        # Sistema de audio
│       ├── effects.ts      # Efectos visuales
│       ├── npc.ts          # Sistema de NPCs
│       ├── spawner.ts      # Spawner de entidades
│       ├── worldRuntime.ts # Runtime del mundo
│       └── animationStateMachine.ts # Máquina de animaciones
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
├── vercel.json             # Configuración Vercel
└── .gitignore              # Excluye .next/, node_modules/, etc.
```

---

## Sistemas Implementados

### 1. Motor 3D (`engine.ts`)
- Orquestador principal que inicializa Three.js
- Loop de juego con fixed timestep (60 FPS logic)
- Cámara con seguimiento y screen shake
- Renderizado por billboards (sprites 2D en 3D)

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

### 4. Estado (`state.ts`)
- Store centralizado con Zustand
- 4 clases de personaje: Lord Knight, High Priest, Assassin Cross, Sniper
- Stats, EXP, skills, inventario, buffs
- Diálogos NPC y sistema de log de combate

### 5. Rendering (`renderer.ts`)
- Terreno con grid neón
- Entidades como sprites billboard
- Headgears cosméticos (4 tipos)
- Indicadores de toque y efectos

### 6. Audio (`audio.ts`)
- Efectos de sonido para combate
- Audio ambiental

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

- Kafra (servicios)
- Crusader Instructor (cambio de clase)

---

## UI/HUD

- Panel de stats (HP/SP/Level)
- Barras de EXP (Base + Job)
- Hotbar de habilidades con cooldown visual circular
- Inventario de pociones
- Panel de configuración (joystick toggle, clase, headgear)
- Log de combate en tiempo real
- Modal de resurrección al morir
- Diálogos NPC estilo Ragnarok

---

## Estado de Git

| Campo | Valor |
|-------|-------|
| Branch | `main` |
| Commits | 3 |
| Último commit | `chore: add gitignore, vercel config, update session logs` |
| Pendiente | `git push origin main` |

---

## Configuración de Despliegue

- **Plataforma**: Vercel
- **Config**: `vercel.json` (básico)
- **Build**: `next build`
- **Output**: `.next/`
- **Variable de entorno**: `GEMINI_API_KEY` (según README)

---

## Notas para el Agente de Código

1. El proyecto ya está funcional y desplegable
2. Usa App Router de Next.js (carpeta `app/`, no `pages/`)
3. Three.js se inicializa solo en cliente (`useEffect` + `mounted` check)
4. El store de Zustand es global y se accede con `useGameStore.getState()`
5. No hay tests implementados aún
6. No hay `.env.local` - necesita `GEMINI_API_KEY` según README
7. Tailwind CSS v4 (usa `@tailwindcss/postcss` en lugar de config tradicional)

---

*Informe generado el 2026-05-29*
