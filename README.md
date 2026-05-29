<div align="center">
  <img src="https://img.shields.io/badge/Next.js%2015-000000?logo=next.js&logoColor=white" alt="Next.js 15"/>
  <img src="https://img.shields.io/badge/Three.js-000000?logo=three.js&logoColor=white" alt="Three.js"/>
  <img src="https://img.shields.io/badge/React%2019-61DAFB?logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/Zustand-443e38?logo=react&logoColor=white" alt="Zustand"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4"/>
  <a href="https://epicearth.vercel.app" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-Vercel-000000?logo=vercel&logoColor=white" alt="Live Demo"/>
  </a>
</div>

<br/>

<div align="center">
  <h1>⚔️ Epicearth — Ragnarok Online Sandbox</h1>
  <p><strong>Real-time 3D MMORPG sandbox built with Next.js 15 + Three.js</strong></p>
  <p>
    <a href="https://epicearth.vercel.app"><strong>🌐 Play Live Demo</strong></a>
  </p>
</div>

---

## ✨ Features

### 🎮 Gameplay
- **4 playable classes**: Lord Knight, High Priest, Assassin Cross, Sniper — each with unique stats and skills
- **Real-time combat** with auto-attack, skill casting, projectiles, and floating damage numbers
- **Aggro/Threat system** — monsters dynamically switch targets based on threat table
- **12 roaming monsters** + **1 Boss MVP** (Baphomet) with special drops
- **NPC interactions**: Kafra (heal/buff services), Crusader Instructor (class change)

### 🎨 3D Rendering
- Three.js billboard-sprite entities with headgear cosmetics
- Isometric camera with smooth follow and screen shake on heavy hits
- Particle effects (level up, heals, explosions) and projectile physics
- Neon-grid terrain with fog, shadows, and ambient lighting

### 📦 Inventory & Equipment (RO-Style)
- **30-slot inventory** with weight limit (2,000 units)
- **8 equipment slots**: head, body, weapon, shield, shoes, garment, accessory×2
- Level and job class restrictions on equipment
- Stat bonuses from equipment + refinement bonuses (+1 to +10)
- Combined stat totals visible in equipment tab
- **Bidirectional sync**: equipping removes from inventory, unequipping returns it
- Zeny currency system with reactive UI updates

### 🖥️ UI/UX
- Touch-optimized: tap-to-move, tap-to-attack, optional virtual joystick
- Input buffer system for skill queueing (1.2s window)
- Cooldown wheel overlay on skill hotbar
- Target lock with HP bar + aggro indicator
- Combat log with real-time event feed
- Death/resurrection flow with item safety
- **Keyboard shortcut**: `I` to toggle inventory panel

---

## 🏗️ Architecture

```
lib/game/
├── core/                    # Framework-agnostic core
│   ├── EventBus.ts          # Typed event system
│   ├── GameCommand.ts       # Command pattern (network-ready)
│   ├── GameContext.ts        # Dependency injection container
│   └── StateProvider.ts     # State abstraction layer
├── shared/                  # Shared between client/server
│   ├── InventorySystem.ts   # 30-slot, weight, zeny
│   ├── EquipmentSystem.ts   # 8-slot, stat bonuses, refinement
│   ├── ItemDatabase.ts      # 30+ item definitions
│   ├── BuffSystem.ts        # Status effects & buffs
│   ├── LootSystem.ts        # Ground loot & pickup
│   ├── RegenSystem.ts       # HP/SP regeneration
│   ├── ProjectileSystem.ts  # Projectile physics
│   └── CooldownSystem.ts    # Battle mode & timers
├── server/
│   ├── CombatRuntime.ts     # Deterministic combat engine (aggro, damage, status)
│   └── MonsterAI.ts         # Monster behavior & targeting
├── client/
│   ├── PlayerController.ts  # Movement & input
│   ├── RendererBridge.ts    # Rendering ↔ logic separation
│   └── LocalStateProvider.ts # Local state implementation
├── engine.ts                # Main orchestrator
├── combat.ts                # Combat system wiring
└── worldRuntime.ts          # Delegates to 6 subsystems
```

### Design Principles
- **Dependency Injection** via `GameContext` — no direct coupling to Zustand
- **Deterministic Combat** via `CombatRuntime` — pure logic, no side effects, multiplayer-ready
- **Event-Driven** via `EventBus` — systems communicate through typed events
- **Command Pattern** via `GameCommand` — prepared for networking with rollback

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Leemonztuff/Epicearth.git
cd Epicearth

# Install
npm install

# Dev server
npm run dev
# → http://localhost:3000
```

### Build for Production

```bash
npm run build
npm start
```

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.5 |
| 3D Engine | Three.js | 0.160+ |
| UI | React | 19.0 |
| State | Zustand | 4.5 |
| Animations | Motion (Framer Motion) | 11.18 |
| Styling | Tailwind CSS | 4.1 |
| Icons | Lucide React | 1.17 |
| Language | TypeScript | 5.3 |
| Deployment | Vercel | — |

---

## 📸 Screenshots

> _Coming soon: in-game screenshots of the 3D world, inventory panel, combat, and class selection._

Meanwhile, try the live demo: [epicearth.vercel.app](https://epicearth.vercel.app)

---

## 🗺️ Roadmap

- [x] Core 3D world with movement and combat
- [x] 4 playable classes with unique skills
- [x] Inventory & equipment system (bidirectional sync)
- [x] Aggro/threat visualization
- [x] NPC interactions (Kafra, class change)
- [x] Monster AI with boss spawn
- [ ] Unit tests for all systems
- [ ] More maps, items, and monsters
- [ ] Networking / multiplayer support
- [ ] Save/load character progress
- [ ] Mobile-friendly UI polish

---

## 📄 License

MIT © 2026 Leemonztuff
