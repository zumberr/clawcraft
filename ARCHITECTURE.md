# ClawCraft v0.3.0 - Architecture Document

## Vision

ClawCraft is an autonomous Minecraft agent built on mineflayer, inspired by
Touhou Little Maid. It functions as a servant, loyal companion, and guardian.
90% of its actions run in pure code. It only consults the LLM when it needs
to interpret complex instructions or handle truly unexpected situations.

**Key principle**: code where possible, LLM where necessary.

---

## Table of Contents

1. General diagram
2. Architecture layers
3. Agentic Loop (ReAct)
4. Plugin system (Tools & Skills)
5. Cognitive pipeline (7 STEPS)
6. Favorability system
7. Proficiency system
8. File structure
9. Design patterns
10. Estimated LLM costs

---

## 1. General Diagram

```
  Minecraft World
       |
  [Perception]    sensors, world-model, event-classifier
       |
  [Instinct]      survival, combat, self-preservation
       |
  [Memory]        working(RAM), episodic, semantic, spatial, social
       |
  [Autonomy]      decision-trees, problem-solver
       |
  [Planning]      goal-manager, task-decomposer, task-queue, plan-executor
       |
  [Consciousness] llm-interface, thinker, prompt-builder, reflection,
                   agentic-loop, tool-registry
       |
  [Soul]          personality, emotions, motivations, favorability, proficiency, schedule
       |
  [Communication] minecraft-chat, discord-bridge, narrator, proactive alerts
       |
  [Actions]       movement, mining, building, crafting, farming, fishing,
                   smelting, inventory, interaction
       |
  [Tools]         user-defined plugins (tools/ directory)
```

Every layer communicates through the central **Event Bus** with priorities.
The **Scheduler** orchestrates the execution frequency of each layer.

---

## 2. Architecture Layers

### 2.1 Foundation (core/)

| File | Description |
|------|-------------|
| `event-bus.js` | Event bus with priority (CRITICAL/HIGH/NORMAL/LOW) and categories (WORLD, ENTITY, COMBAT, CHAT, etc.) |
| `scheduler.js` | Main loop. TickGroups: EVERY_TICK(50ms), FAST(200ms), MEDIUM(1s), SLOW(5s), VERY_SLOW(30s) |
| `agent.js` | Orchestrator. Creates all layers, connects events, manages lifecycle |
| `behavior-manager.js` | Mission system. States: IDLE -> PLANNING -> ACTIVE -> REACTING -> COMPLETED/FAILED |

### 2.2 Perception (perception/)

| File | Function | Frequency |
|------|----------|-----------|
| `sensors.js` | Scans health, entities, environment, inventory | EVERY_TICK |
| `world-model.js` | Persistent mental map. POIs, beds, containers | FAST |
| `event-classifier.js` | Classifies events by urgency. Re-emits critical/high | Reactive |

**No LLM.** Everything is direct reading from the bot API.

### 2.3 Instinct (instinct/)

| File | Function |
|------|----------|
| `survival.js` | Auto-eat (food priority table), flee at critical health, night shelter |
| `combat.js` | Weapon selection by priority, engage/disengage, creeper evasion, shield vs ranged |
| `self-preservation.js` | MLG water bucket, drowning detection, fire/lava escape, void detection |

**No LLM.** Immediate reactions with conditional logic.

### 2.4 Memory (memory/)

| File | Type | Backend | TTL |
|------|------|---------|-----|
| `working-memory.js` | Volatile RAM | Map (JS) | Seconds-minutes |
| `episodic-memory.js` | Lived events | SQLite | Permanent |
| `semantic-memory.js` | Facts and knowledge | SQLite | Permanent |
| `spatial-memory.js` | 3D locations | SQLite | Permanent |
| `social-memory.js` | Player relationships | SQLite | Permanent |
| `memory-manager.js` | Unified facade | - | - |

**Consolidation**: `memory-manager.consolidate()` moves significant items from working to episodic.
Runs on TickGroup.SLOW.

**LLM context**: `buildContext()` filters relevant memories by position, topic, and players.
Produces ~800-1500 tokens of context.

### 2.5 Autonomy (autonomy/)

| File | Function |
|------|----------|
| `decision-trees.js` | Conditional logic for common situations |
| `problem-solver.js` | Failed task resolution without LLM |

**Autonomy levels:**
- **Level 1 (SILENT)**: Resolves alone, no reporting (eat, flee)
- **Level 2 (INFORM)**: Resolves alone, reports to player (go home, drop items)
- **Level 3 (ASK)**: Asks the player for instructions (ambiguous situations)

**Decision trees** cover: low health, full inventory, nighttime, unknown player,
broken tool, hunger.

**Problem Solver** tries strategies in order: RETRY -> ALTERNATIVE -> FALLBACK -> SKIP -> ESCALATE.
Only escalates to LLM when everything fails.

### 2.6 Planning (planning/)

| File | Function |
|------|----------|
| `goal-manager.js` | Goals with state and source (COMMAND/AUTONOMOUS/INSTINCT/SCHEDULE) |
| `task-decomposer.js` | Templates for common tasks (get_wood, build_shelter, etc.) |
| `task-queue.js` | FIFO queue with priority, retry (max 3), history |
| `plan-executor.js` | Dispatches tasks to action handlers. 14 task types |

**Task Stack**: Tasks can be interrupted and resumed.
Example: combat interrupts mining; when combat ends, mining resumes.

### 2.7 Consciousness (consciousness/)

| File | Function | Uses LLM |
|------|----------|----------|
| `llm-interface.js` | Multi-provider abstraction (Anthropic, OpenAI, Ollama) | Yes |
| `prompt-builder.js` | Builds prompts with filtered context + agentic loop prompts | No |
| `thinker.js` | Decides WHEN to think. Rate-limited (10s cooldown) | Yes |
| `reflection.js` | Periodic self-reflection. Generates insights and learns | Yes |
| `tool-registry.js` | Registers 14+ tools for the agentic loop + loads plugins from tools/ | No |
| `agentic-loop.js` | ReAct loop: reason -> act -> observe -> repeat (for generic behaviors) | Yes |

**Thinker.planMission()**: 1 LLM call to interpret instruction + generate plan.
**Thinker.handleMissionEvent()**: 1 LLM call to handle unexpected event during mission.
**Thinker.think()**: Autonomous idle thinking / chat questions.
**AgenticLoop.run()**: Multi-step LLM loop for complex tasks without specialized handlers.

### 2.8 Soul (soul/)

| File | Function |
|------|----------|
| `personality.js` | Big Five model from identity.json. Traits, speech style, catchphrases |
| `emotions.js` | 8 dimensions (joy, fear, anger, sadness, curiosity, pride, loneliness, determination). Natural decay |
| `motivations.js` | 7 needs (SURVIVAL, SECURITY, SOCIAL, COMPETENCE, EXPLORATION, CREATION, PURPOSE) |
| `favorability.js` | Per-player affection system (0-100). 4 tiers. Inspired by Touhou Little Maid |
| `proficiency.js` | Skills that improve with practice. 7 skills, levels 1-10 |
| `schedule.js` | Adaptive schedules based on game time and personality |

### 2.9 Communication (communication/)

| File | Function |
|------|----------|
| `minecraft-chat.js` | Chat/whisper. 256 char limit, auto-split |
| `discord-bridge.js` | Discord.js v14. MC <-> Discord bridge |
| `message-formatter.js` | Personality-aware formatting |
| `command-parser.js` | `!` prefix + natural language. 20+ commands |
| `reporter.js` | ROUTINE/WARNING/EMERGENCY reports. No LLM |
| `narrator/event-accumulator.js` | Accumulates events in 30s windows |
| `narrator/pattern-detector.js` | Detects streaks, milestones, anomalies, escalations |
| `narrator/template-narrator.js` | Converts events + patterns into natural narration. No LLM |
| `proactive/welcome-back.js` | Contextual greeting when a player returns |
| `proactive/alert-triggers.js` | Proactive alerts with anti-spam cooldown |

### 2.10 Actions (actions/)

| File | Function |
|------|----------|
| `movement.js` | Pathfinding: goTo, follow, lookAt, jump, collectDrops |
| `mining.js` | Mining with tool-per-block table |
| `building.js` | placeBlock, buildStructure (box/wall/tower/floor) |
| `crafting.js` | Inventory and crafting table crafting |
| `farming.js` | Crops, harvest, replant, breeding |
| `fishing.js` | Autonomous fishing: detect water, cast, wait for bite, collect |
| `smelting.js` | Dedicated smelting: furnaces, blast furnaces, smokers |
| `inventory.js` | Full inventory management |
| `interaction.js` | Block and entity interaction |

### 2.11 Behaviors (behaviors/)

| File | Function |
|------|----------|
| `guard-village.js` | Circular patrol, combat, structure scanning, repair, reports |

Each behavior is a factory that returns `{ tick, handleEvent, getSummary, cleanup }`.
The BehaviorManager automatically identifies the behavior type from the LLM plan.
When no specialized handler matches, the **agentic loop** takes over.

### 2.12 Tools (tools/)

User-extensible plugin directory. The tool registry auto-loads `.js` files from here at startup.

| File | Purpose |
|------|---------|
| `_template-tool.js` | Template for creating single-action tools |
| `_template-skill.js` | Template for creating multi-tool skill compositions |

**Tool interface**: `{ name, description, parameters, execute(params, deps), formatResult(data) }`
**Skill interface**: `{ name, type: 'skill', description, parameters, steps(params, deps), formatResult(data) }`

Plugins receive full deps: `{ actions, sensors, worldModel, memoryManager, bus, execute }`.

---

## 3. Agentic Loop (ReAct Pattern)

When `identifyBehaviorType()` returns `'generic'` (no specialized handler), the behavior manager creates an agentic handler that runs a ReAct loop:

```
Goal -> [LLM: reason + pick tool] -> Execute tool -> Observation -> [LLM: reason again] -> ... -> Done
```

### How it works

1. `buildAgenticSystemPrompt(tools)` provides personality + all available tools + JSON response format
2. `buildAgenticGoalPrompt(goal, context)` provides the goal + world state + inventory + memory
3. LLM responds with `{"thought": "...", "tool": "mine", "params": {"block": "oak_log"}}`
4. Tool executes with try/catch, result formatted as observation
5. Observation appended to conversation, loop continues
6. LLM responds with `{"finished": true, "result": "..."}` when done

### Safeguards

| Safeguard | Default | Configurable |
|-----------|---------|--------------|
| Max steps per loop | 10 | AGENTIC_MAX_STEPS env |
| Max tokens per step | 512 | In options |
| Instinct interruption | Yes (instinct:flee, classified:critical) | Always active |
| Cooldown between steps | 1s | AGENTIC_STEP_DELAY env |
| Total timeout | 120s | AGENTIC_TIMEOUT env |
| JSON parse failure | Retry once with corrective prompt | - |
| No agentic loop available | Fallback to no-op handler | - |

### Registered Tools (14 built-in)

`move`, `mine`, `craft`, `build`, `farm`, `inventory`, `interact`, `fish`, `smelt`, `look_around`, `check_inventory`, `recall_memory`, `say`, `finish`

Plus any custom tools/skills loaded from `tools/`.

---

## 4. Plugin System (Tools & Skills)

### Loading

`utils/plugin-loader.js` scans the `tools/` directory at startup:
- Ignores files starting with `_` (templates)
- Dynamic imports each `.js` file
- Validates the interface (name, description, execute/steps, formatResult)
- Logs errors for invalid plugins and continues

### Registration

`consciousness/tool-registry.js` calls `registerExternal(plugin)`:
- Built-in tools have priority (name collisions are logged and skipped)
- Skills are wrapped: `steps()` becomes `execute()` internally
- All plugins receive the same `deps` object as built-in tools

### Creating a plugin

1. Copy `tools/_template-tool.js` or `tools/_template-skill.js`
2. Rename it (remove the `_` prefix)
3. Implement the interface
4. Restart the bot -- the plugin loads automatically

---

## 5. Cognitive Pipeline (7 STEPS)

Example: player says "!guard" (guard the village).

### STEP 1 - Perception
```
sensors.scan() -> detects entities, time, environment
worldModel.update() -> updates POIs
eventClassifier -> classifies "command:received" as HIGH
```
**LLM: 0 calls**

### STEP 2 - Consciousness (Interpretation)
```
thinker.planMission({
  instruction: "Guard and protect this area...",
  username: "Player1",
  position, nearbyLocations, currentState
})
-> 1 LLM call -> generates plan with subtasks
```
**LLM: 1 call (~1500 tokens)**

### STEP 3 - Planning
```
behaviorManager identifies type "guard-village"
-> creates instance of guardVillageFactory(plan, context)
-> generates patrol route (8 waypoints)
-> takes structure snapshot
```
**LLM: 0 calls**

### STEP 4 - Autonomous Execution
```
Every tick (1s):
  - Patrol waypoints (8s between points)
  - Scan hostiles (32 block radius)
  - If hostile: combatInstinct.engage() -> isFighting = true
  - Scan structures (every 5 min)
  - Repair damage (if blocks available)
```
**LLM: 0 calls**. Runs for hours.

### STEP 5 - Reporting
```
Every 10 min:
  reporter.sendRoutine(buildRoutineReport())
  -> "[OK] Guard report (10 min) | No threats | Position: (100, 64, 200)"
  -> MC chat (3 lines max) + Discord embed
```
**LLM: 0 calls**

### STEP 6 - Unexpected Event
```
entity:playerAppeared -> "Steve" (unknown)
guardVillage.handleEvent() returns false -> can't resolve
behaviorManager.handleUnexpectedEvent()
-> thinker.handleMissionEvent(context)
-> 1 LLM call -> decides: greet cautiously
```
**LLM: 0-1 calls** (only if code can't resolve it)

### STEP 7 - Memory Consolidation
```
memoryManager.consolidate()
-> moves significant events to episodic
reflection.reflect() (every 30s of thinking)
-> generates insights, learns patterns
```
**LLM: 0-1 calls** (periodic reflection)

**Total for 1 hour of guarding**: ~2-4 LLM calls.

---

## 6. Favorability System

Inspired by the FavorabilityManager from Touhou Little Maid.

### Score (0-100)

| Action | Change |
|--------|--------|
| Player gave food | +3 |
| Player gave tools | +5 |
| Player saved its life | +10 |
| Player greeted | +1 |
| Player chatted | +1 |
| Task completed together | +5 |
| Player ignored help request | -3 |
| Player destroyed construction | -8 |
| Player hit it | -10 |
| Player left without goodbye | -1 |
| Daily absence decay | -0.5 |

### Behavior Tiers

| Tier | Range | Behavior |
|------|-------|----------|
| DISTANT | 0-19 | Minimal responses. Won't obey commands. |
| COOPERATIVE | 20-49 | Obeys basic commands. Functional communication. |
| FRIENDLY | 50-79 | Initiates conversation. Shares information. Proactive help. |
| LOYAL | 80-100 | Sacrifices itself for the player. Maximum loyalty. All features. |

### Behavior Gates

```javascript
shouldObeyCommand(player)          // score >= 20
shouldInitiateConversation(player) // score >= 50
shouldSacrifice(player)            // score >= 80
```

---

## 7. Proficiency System

### Skills

| Skill | Actions that grant XP |
|-------|-----------------------|
| COMBAT | Killing hostiles, taking damage, surviving nights |
| MINING | Mining blocks, ores, diamonds |
| BUILDING | Placing blocks, completing structures |
| FARMING | Harvesting, planting, breeding animals |
| CRAFTING | Crafting items, tools |
| EXPLORATION | Discovering places, traveling distance |
| SOCIAL | Completing commands, conversations, missions |

### Levels and Tiers

| Tier | Levels | Speed Mod | Success Bonus |
|------|--------|-----------|---------------|
| Novice | 1-2 | 1.0x | 0-5% |
| Apprentice | 3-4 | 0.9x | 10-15% |
| Journeyman | 5-6 | 0.8x | 20-25% |
| Expert | 7-8 | 0.7x | 30-35% |
| Master | 9-10 | 0.6x | 40-45% |

Higher levels reduce execution time (speedMod) and increase
success probability on difficult tasks.

---

## 8. File Structure

```
clawcraft/
  index.js                  # Entry point
  config.js                 # Centralized configuration
  package.json
  .env.example
  .gitignore

  data/
    identity.json           # Big Five personality, style, catchphrases
    config.json             # Runtime overrides

  core/
    event-bus.js            # Event bus with priority
    scheduler.js            # Main loop with TickGroups
    agent.js                # Central orchestrator
    behavior-manager.js     # Mission system (agentic handler for generic tasks)

  perception/
    sensors.js              # World scanning
    world-model.js          # Mental map
    event-classifier.js     # Urgency classifier

  instinct/
    survival.js             # Basic survival
    combat.js               # Autonomous combat
    self-preservation.js    # Extreme self-preservation

  memory/
    working-memory.js       # Volatile RAM
    episodic-memory.js      # Events (SQLite)
    semantic-memory.js      # Knowledge (SQLite)
    spatial-memory.js       # Locations (SQLite)
    social-memory.js        # Relationships (SQLite)
    memory-manager.js       # Unified facade

  autonomy/
    decision-trees.js       # Decision trees (3 levels)
    problem-solver.js       # Problem resolution without LLM

  planning/
    goal-manager.js         # Goal management
    task-decomposer.js      # Decomposition templates
    task-queue.js           # Queue with priority and retry
    plan-executor.js        # Plan execution

  consciousness/
    llm-interface.js        # Multi-provider LLM
    prompt-builder.js       # Prompt constructor (includes agentic prompts)
    thinker.js              # Rate-limited thinking
    reflection.js           # Self-reflection
    tool-registry.js        # 14+ tools for agentic loop + plugin loading
    agentic-loop.js         # ReAct loop engine

  soul/
    personality.js           # Big Five + style
    emotions.js              # 8 emotional dimensions
    motivations.js           # 7 needs
    favorability.js          # Per-player affection (0-100)
    proficiency.js           # Skills with XP
    schedule.js              # Adaptive schedules

  communication/
    minecraft-chat.js        # MC chat
    discord-bridge.js        # Discord bridge
    message-formatter.js     # Personality-aware formatting
    command-parser.js        # Command parser
    reporter.js              # Reports without LLM
    narrator/
      event-accumulator.js   # Event accumulator (30s windows)
      pattern-detector.js    # Pattern detector
      template-narrator.js   # Template-based narration
    proactive/
      welcome-back.js        # Welcome greetings
      alert-triggers.js      # Proactive alerts

  behaviors/
    guard-village.js         # Autonomous village guarding

  actions/
    movement.js              # Pathfinding
    mining.js                # Mining
    building.js              # Building
    crafting.js              # Crafting
    farming.js               # Farming
    fishing.js               # Fishing
    smelting.js              # Smelting
    inventory.js             # Inventory
    interaction.js           # Interactions

  tools/
    _template-tool.js        # Tool plugin template
    _template-skill.js       # Skill plugin template

  utils/
    logger.js                # Colored logging
    database.js              # SQLite wrapper
    helpers.js               # General utilities
    plugin-loader.js         # Dynamic plugin loader
```

**Total: 48+ modules** across 13 directories.

---

## 9. Design Patterns

### Factory Functions
All modules export `createXxx()` that return `Object.freeze({...})`.
No classes. Encapsulation via closures.

### Immutability
Internal state is updated with spread operator, never direct mutation.
```javascript
skills.set(name, { ...current, xp: newXp, level: newLevel });
```

### Event-Driven
All layers communicate through the event bus.
No module directly imports another module from a different layer.

### Dependency Injection
`agent.js` injects dependencies at creation. Modules don't import
other modules -- they receive their dependencies as parameters.

### Scheduler Tick Groups
Critical layers (sensors, instincts) run every tick.
Slow layers (reflection, decay) run every 30s.
This prioritizes CPU where it matters.

### Behavior Factory
Behaviors are factories that return handlers with a uniform interface:
`{ tick, handleEvent, getSummary, cleanup }`.

### Plugin Architecture
The `tools/` directory supports drop-in plugins. Files are dynamically imported
at startup, validated, and registered in the tool registry. Skills (multi-tool
compositions) are wrapped as standard tools transparently.

---

## 10. Estimated LLM Costs

### Scenario: 1 hour of guarding

| Action | LLM calls | Approx tokens |
|--------|-----------|---------------|
| Interpret mission | 1 | ~2000 |
| Unexpected event (unknown player) | 0-2 | ~1000 each |
| Periodic reflection | 2-3 | ~800 each |
| **Total** | **3-6** | **~5000-8000** |

### Scenario: 1 hour idle (no mission)

| Action | LLM calls | Approx tokens |
|--------|-----------|---------------|
| Autonomous thinking | 6-12 | ~500 each |
| Chat with players | 0-5 | ~800 each |
| Reflection | 2-3 | ~800 each |
| **Total** | **8-20** | **~8000-15000** |

### Scenario: Agentic loop (generic task)

| Action | LLM calls | Approx tokens |
|--------|-----------|---------------|
| 10-step loop | 10 | ~25000 total |
| Per task cost (Haiku) | - | ~$0.006 |

### Estimated monthly cost (24/7)

With Anthropic Claude Haiku as default model:
- Guarding: ~$0.50-1.00/day
- Active idle: ~$1.00-2.00/day
- **Monthly**: ~$15-60

With local model (Ollama):
- **$0/month** (electricity only)

---

## Runtime

- **Bun** as JavaScript runtime (not Node.js)
- `bun:sqlite` for integrated database
- Minecraft 1.20+ support via mineflayer
- Discord.js v14 for Discord integration

---

<details>
<summary><strong>Documento de Arquitectura en Espanol</strong></summary>

Este documento esta disponible principalmente en ingles. Los conceptos clave:

- **9 capas cognitivas** conectadas por un Event Bus central
- **Loop agentico (ReAct)** para tareas genericas sin handler especializado: razonar -> actuar -> observar -> repetir
- **Sistema de plugins** en `tools/`: tools (acciones individuales) y skills (composiciones multi-tool)
- **14+ herramientas built-in**: move, mine, craft, build, farm, inventory, interact, fish, smelt, look_around, check_inventory, recall_memory, say, finish
- **Safeguards**: max 10 pasos, timeout 120s, cooldown 1s, retry de JSON, interrupcion por instintos
- **Factory Functions** en todo el codebase, cero clases, inmutabilidad via spread
- **48+ modulos** en 13 directorios
- Costo estimado: ~$0.006 por loop agentico con Haiku, $0 con Ollama local

</details>
