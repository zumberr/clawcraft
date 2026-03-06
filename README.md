<div align="center">


```
   ██████╗██╗      █████╗ ██╗    ██╗ ██████╗██████╗  █████╗ ███████╗████████╗
  ██╔════╝██║     ██╔══██╗██║    ██║██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
  ██║     ██║     ███████║██║ █╗ ██║██║     ██████╔╝███████║█████╗     ██║
  ██║     ██║     ██╔══██║██║███╗██║██║     ██╔══██╗██╔══██║██╔══╝     ██║
  ╚██████╗███████╗██║  ██║╚███╔███╔╝╚██████╗██║  ██║██║  ██║██║        ██║
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝
```

### *Companion. Guardian. Loyal to the bone.*

<br>

[![Version](https://img.shields.io/badge/version-0.3.0-00d4aa?style=for-the-badge&labelColor=0d1117)](https://github.com/zumberr/clawcraft)
[![Runtime](https://img.shields.io/badge/runtime-Bun-fbf0df?style=for-the-badge&logo=bun&logoColor=000&labelColor=0d1117)](https://bun.sh)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.20%2B-62b447?style=for-the-badge&logo=minecraft&logoColor=white&labelColor=0d1117)](https://minecraft.net)
[![License](https://img.shields.io/badge/license-MIT-7c3aed?style=for-the-badge&labelColor=0d1117)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Bridge-5865F2?style=for-the-badge&logo=discord&logoColor=white&labelColor=0d1117)](https://discord.js.org)

<br>

> **90% pure code. 10% LLM.**
> ClawCraft acts, thinks, and feels -- without burning tokens on every breath.

</div>

---

## What is ClawCraft?

ClawCraft is an **autonomous Minecraft agent** built on `mineflayer`, inspired by **Touhou Little Maid**. It is not a simple command bot -- it is an entity with personality, memory, emotions, and loyalty forged through every interaction.

The fundamental principle: **code where possible, LLM where necessary.**

While you sleep, ClawCraft patrols, mines, harvests, fishes, and defends itself. When you return, it remembers you. When it helps you, it grows. When you hurt it -- it remembers that too.

---

## Tech Stack

| Component | Technology |
|---|---|
| **Runtime** | [Bun](https://bun.sh) -- fast, native, no Node |
| **Bot Core** | [mineflayer](https://github.com/PrismarineJS/mineflayer) v4.14 |
| **Pathfinding** | mineflayer-pathfinder |
| **Combat** | mineflayer-pvp |
| **Database** | SQLite via `bun:sqlite` (native) |
| **Discord** | discord.js v14 |
| **LLM** | Anthropic Claude / OpenAI / Ollama (configurable) |

---

## Cognitive Architecture

ClawCraft operates across **9 interconnected layers** through a central Event Bus with priority system (CRITICAL > HIGH > NORMAL > LOW):

```
  +---------------------------------------------------------+
  |                    Minecraft World                       |
  +----------------------------+----------------------------+
                               |
  +----------------------------v----------------------------+
  |  PERCEPTION   |  sensors - world-model - classifier     |
  +---------------+-----------------------------------------+
  |  INSTINCT     |  survival - combat - self-preservation  |
  +---------------+-----------------------------------------+
  |  MEMORY       |  working - episodic - spatial - social  |  <-- SQLite
  +---------------+-----------------------------------------+
  |  AUTONOMY     |  decision-trees - problem-solver        |
  +---------------+-----------------------------------------+
  |  PLANNING     |  goals - decomposer - queue - executor  |
  +---------------+-----------------------------------------+
  |  CONSCIOUSNESS|  llm - thinker - agentic-loop - tools   |  <-- LLM here
  +---------------+-----------------------------------------+
  |  SOUL         |  personality - emotions - favorability   |
  +---------------+-----------------------------------------+
  |  COMMUNICATION|  mc-chat - discord - narrator - alerts   |
  +---------------+-----------------------------------------+
  |  ACTIONS      |  movement - mining - building - ...      |
  +---------------------------------------------------------+
```

**48+ modules** across 13 directories. Zero classes -- all Factory Functions + closures.

---

## Agentic Loop (ReAct Pattern)

When ClawCraft receives a task that doesn't match any specialized behavior, it activates an **agentic loop** based on the ReAct pattern:

```
Instruction -> [LLM call] -> Action 1 -> Observation 1 -> [LLM call] -> Action 2 -> ... -> Done
```

The LLM reasons step by step, choosing one tool per turn from 14+ registered tools (mine, craft, build, move, farm, fish, smelt, etc.), observes the result, and decides the next action. Instincts can interrupt the loop at any time for survival.

**Safeguards**: max 10 steps, 120s timeout, 1s cooldown between steps, JSON retry on parse failure.

---

## Plugin System (Custom Tools & Skills)

Drop `.js` files into the `tools/` directory to extend ClawCraft with custom tools and skills:

**Tool** -- a single action:
```javascript
export default {
  name: 'dig_down',
  description: 'Dig straight down N blocks.',
  parameters: { depth: 'how deep to dig (default 3)' },
  async execute(params, deps) {
    await deps.actions.mining.digDown(params.depth ?? 3);
    return { depth: params.depth ?? 3 };
  },
  formatResult: (data) => `Dug down ${data.depth} blocks.`,
};
```

**Skill** -- a multi-tool composition:
```javascript
export default {
  name: 'gather_wood',
  type: 'skill',
  description: 'Mine logs and craft them into planks.',
  parameters: { count: 'logs to mine (default 4)' },
  async steps(params, deps) {
    const r1 = await deps.execute('mine', { block: 'oak_log', count: params.count ?? 4 });
    const r2 = await deps.execute('craft', { item: 'oak_planks', count: (params.count ?? 4) * 4 });
    return { results: [r1, r2] };
  },
  formatResult: (data) => 'Gathered wood and crafted planks.',
};
```

Templates available at `tools/_template-tool.js` and `tools/_template-skill.js`. Files starting with `_` are ignored by the loader.

---

## Memory System

ClawCraft never forgets. It has 5 independent memory types:

| Type | Backend | Description |
|---|---|---|
| `working-memory` | RAM (Map) | Volatile state of the moment |
| `episodic-memory` | SQLite | Everything it experienced |
| `semantic-memory` | SQLite | Facts and world knowledge |
| `spatial-memory` | SQLite | 3D locations: beds, homes, points of interest |
| `social-memory` | SQLite | Relationship history with each player |

The `memory-manager` automatically consolidates every 30 seconds, moving significant items from RAM to disk.

---

## Favorability System

Inspired by Touhou Little Maid. Each player has an **affection score (0-100)** that determines how ClawCraft treats them:

| Tier | Range | Behavior |
|---|---|---|
| **DISTANT** | 0-19 | Minimal responses. Won't obey commands. |
| **COOPERATIVE** | 20-49 | Obeys basic commands. Functional communication. |
| **FRIENDLY** | 50-79 | Initiates conversation. Shares info. Proactive help. |
| **LOYAL** | 80-100 | Will sacrifice itself for you. Maximum loyalty. Everything enabled. |

```
 Give food        -> +3     |    Ignore request  -> -3
 Give tools       -> +5     |    Destroy build   -> -8
 Save its life    -> +10    |    Hit it           -> -10
 Complete task    -> +5     |    Daily absence    -> -0.5
```

---

## Proficiency System

Skills improve through real practice -- no shortcuts:

| Skill | XP from... | Max Level | Benefit |
|---|---|---|---|
| **COMBAT** | Killing hostiles, surviving nights | 10 | -40% combat time |
| **MINING** | Mining blocks and ores | 10 | -40% mining time |
| **BUILDING** | Placing blocks, completing structures | 10 | -40% build time |
| **FARMING** | Harvesting, planting, breeding | 10 | +45% crop success |
| **CRAFTING** | Crafting items and tools | 10 | +45% craft success |
| **EXPLORATION** | Discovering places, distance traveled | 10 | -40% travel time |
| **SOCIAL** | Completing missions, chatting | 10 | +45% command comprehension |

---

## The Soul of ClawCraft

### Personality -- Big Five Model
Defined in `data/identity.json`. Configurable: traits, speech style, catchphrases.

### Emotions -- 8 Dimensions
`joy - fear - anger - sadness - curiosity - pride - loneliness - determination`
Each emotion decays naturally over time.

### Motivations -- 7 Needs
`SURVIVAL - SECURITY - SOCIAL - COMPETENCE - EXPLORATION - CREATION - PURPOSE`
Guide autonomous behavior when no active orders exist.

---

## Cognitive Pipeline (Example: !guard)

```
 STEP 1  Perception     sensors.scan() -> classifier -> "command:received" HIGH
          -- LLM: 0 calls

 STEP 2  Consciousness  thinker.planMission() -> interprets "guard area"
          -- LLM: 1 call (~1500 tokens)

 STEP 3  Planning       behaviorManager -> guardVillageFactory -> 8 waypoints
          -- LLM: 0 calls

 STEP 4  Execution      Patrol - scan hostiles - autonomous combat
          -- LLM: 0 calls  <-- runs for HOURS

 STEP 5  Reporting      reporter.sendRoutine() -> MC chat + Discord embed
          -- LLM: 0 calls

 STEP 6  Event          Unknown player -> handleUnexpectedEvent()
          -- LLM: 0-1 calls (only if code can't resolve it)

 STEP 7  Memory         memoryManager.consolidate() -> reflection.reflect()
          -- LLM: 0-1 calls
```

**Total for 1 hour of guarding: ~3-6 LLM calls** -- not ~3600.

---

## Estimated LLM Cost

| Scenario | Calls/hour | Approx tokens | Cost/month (Claude Haiku) |
|---|---|---|---|
| Guarding | 3-6 | ~5k-8k | ~$0.50-1.00/day |
| Active idle | 8-20 | ~8k-15k | ~$1.00-2.00/day |
| Agentic loop (10 steps) | 10 per task | ~25k | ~$0.006/task |
| Ollama local | unlimited | -- | **$0** |

---

## Installation

### Prerequisites
- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- Minecraft server 1.20+
- Anthropic / OpenAI API key **or** Ollama running locally

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/zumberr/clawcraft.git
cd clawcraft

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 4. Launch
bun run index.js
```

---

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Minecraft
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=ClawCraft
MINECRAFT_VERSION=1.20.1

# LLM -- choose one
LLM_PROVIDER=anthropic        # anthropic | openai | ollama
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OLLAMA_HOST=http://localhost:11434
LLM_MODEL=claude-haiku-4-5

# Discord (optional)
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=

# Bot
BOT_OWNER=YourMinecraftName

# Agentic Loop (optional)
AGENTIC_MAX_STEPS=10
AGENTIC_STEP_DELAY=1000
AGENTIC_TIMEOUT=120000
```

---

## Project Structure

```
clawcraft/
+-- index.js              # Entry point + ASCII art
+-- config.js             # Centralized configuration
+-- data/
|   +-- identity.json     # Big Five personality
|   +-- config.json       # Runtime overrides
+-- core/                 # Orchestrator, Event Bus, Scheduler
+-- perception/           # Sensors, world model
+-- instinct/             # Survival and autonomous combat
+-- memory/               # 5 types: working -> SQLite
+-- autonomy/             # Decision trees (3 levels)
+-- planning/             # Goals, decomposition, queue, execution
+-- consciousness/        # LLM interface, Thinker, Agentic Loop, Tool Registry
+-- soul/                 # Personality, emotions, favorability
+-- communication/        # MC chat, Discord, Narrator
+-- behaviors/            # Complex behaviors (guard-village)
+-- actions/              # 9 modules: movement, mining, building...
+-- tools/                # Custom tools & skills (plugin system)
|   +-- _template-tool.js # Template for creating tools
|   +-- _template-skill.js# Template for creating skills
+-- utils/                # Logger, SQLite wrapper, helpers, plugin-loader
```

---

## Design Patterns

- **Factory Functions** -- Zero classes. Everything returns `Object.freeze({...})`
- **Event-Driven** -- Layers don't import each other, they communicate through the bus
- **Dependency Injection** -- `agent.js` injects everything. Modules receive deps as parameters
- **Immutability** -- Internal state via spread operator, never direct mutation
- **Tick Groups** -- `EVERY_TICK(50ms)` for instincts, `VERY_SLOW(30s)` for reflection
- **Plugin Architecture** -- Drop-in tools and skills via `tools/` directory

---

## Roadmap

- [x] 9-layer cognitive architecture
- [x] Favorability system (Touhou Little Maid inspired)
- [x] Bidirectional Discord bridge
- [x] Guard Village behavior
- [x] 5 persistent memory types (SQLite)
- [x] Agentic Loop (ReAct pattern) for generic tasks
- [x] Plugin system (custom tools & skills)
- [ ] More behaviors: `follow`, `farm-loop`, `base-builder`
- [ ] Real-time web monitoring GUI
- [ ] Complex quest system
- [ ] Multi-bot support (squad)
- [ ] Automated tests

---

## License

MIT -- free to use, modify, and distribute.

---

<div align="center">

**Made with care and too many hours of Minecraft**

*ClawCraft is not just a bot -- it's your companion.*

[![GitHub](https://img.shields.io/badge/GitHub-zumberr-181717?style=flat-square&logo=github)](https://github.com/zumberr)

</div>

---

<details>
<summary><strong>README en Espanol</strong></summary>

## Que es ClawCraft?

ClawCraft es un **agente autonomo de Minecraft** construido sobre `mineflayer`, inspirado en **Touhou Little Maid**. No es un simple bot de comandos -- es una entidad con personalidad, memoria, emociones y lealtad que se forja con cada interaccion.

El principio fundamental: **codigo donde se pueda, LLM donde se deba.**

Mientras duermes, ClawCraft patrulla, mina, cosecha, pesca y se defiende. Cuando regresas, te recuerda. Cuando te ayuda, crece. Cuando lo lastimas -- lo recuerda tambien.

## Loop Agentico (Patron ReAct)

Cuando ClawCraft recibe una tarea que no coincide con ningun behavior especializado, activa un **loop agentico** basado en el patron ReAct:

```
Instruccion -> [LLM call] -> Accion 1 -> Observacion 1 -> [LLM call] -> Accion 2 -> ... -> Listo
```

El LLM razona paso a paso, eligiendo una herramienta por turno de las 14+ registradas (mine, craft, build, move, farm, fish, smelt, etc.), observa el resultado, y decide la siguiente accion. Los instintos pueden interrumpir el loop en cualquier momento por supervivencia.

## Sistema de Plugins (Tools y Skills custom)

Coloca archivos `.js` en el directorio `tools/` para extender ClawCraft con herramientas y habilidades custom. Las plantillas estan en `tools/_template-tool.js` y `tools/_template-skill.js`.

- **Tool**: una accion individual (ej: cavar hacia abajo)
- **Skill**: una composicion multi-tool (ej: recolectar madera = minar + craftear)

Los plugins reciben acceso completo a: `actions`, `sensors`, `worldModel`, `memoryManager`, `bus`, y `execute()` para encadenar otras tools.

## Instalacion

```bash
git clone https://github.com/zumberr/clawcraft.git
cd clawcraft
bun install
cp .env.example .env
# Editar .env con tus credenciales
bun run index.js
```

Prerequisitos: [Bun](https://bun.sh), servidor Minecraft 1.20+, API key de Anthropic/OpenAI o Ollama local.

</details>
