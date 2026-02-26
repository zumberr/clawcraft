# ClawCraft v0.2.0 - Documento de Arquitectura

## Vision

ClawCraft es un agente autonomo de Minecraft construido sobre mineflayer, inspirado en
Touhou Little Maid. Funciona como sirviente, companero leal y guardian.
El 90% de sus acciones se ejecutan en codigo puro. Solo consulta al LLM
cuando necesita interpretar instrucciones complejas o manejar situaciones
verdaderamente inesperadas.

**Principio clave**: codigo donde se pueda, LLM donde se deba.

---

## Indice

1. Diagrama general
2. Capas de la arquitectura
3. Pipeline cognitivo (7 PASOS)
4. Sistema de favorabilidad
5. Sistema de proficiencia
6. Estructura de archivos
7. Patrones de diseno
8. Costos estimados de LLM

---

## 1. Diagrama General

```
  Minecraft World
       |
  [Perception]  sensors, world-model, event-classifier
       |
  [Instinct]    survival, combat, self-preservation
       |
  [Memory]      working(RAM), episodic, semantic, spatial, social
       |
  [Autonomy]    decision-trees, problem-solver
       |
  [Planning]    goal-manager, task-decomposer, task-queue, plan-executor
       |
  [Consciousness] llm-interface, thinker, prompt-builder, reflection
       |
  [Soul]        personality, emotions, motivations, favorability, proficiency, schedule
       |
  [Communication] minecraft-chat, discord-bridge, narrator, proactive alerts
       |
  [Actions]     movement, mining, building, crafting, farming, fishing, smelting, inventory, interaction
```

Cada capa se comunica a traves del **Event Bus** central con prioridades.
El **Scheduler** orquesta la frecuencia de ejecucion de cada capa.

---

## 2. Capas de la Arquitectura

### 2.1 Foundation (core/)

| Archivo | Descripcion |
|---------|-------------|
| `event-bus.js` | Bus de eventos con prioridad (CRITICAL/HIGH/NORMAL/LOW) y categorias (WORLD, ENTITY, COMBAT, CHAT, etc.) |
| `scheduler.js` | Loop principal. TickGroups: EVERY_TICK(50ms), FAST(200ms), MEDIUM(1s), SLOW(5s), VERY_SLOW(30s) |
| `agent.js` | Orquestador. Crea todas las capas, conecta eventos, maneja el ciclo de vida |
| `behavior-manager.js` | Sistema de misiones. Estados: IDLE -> PLANNING -> ACTIVE -> REACTING -> COMPLETED/FAILED |

### 2.2 Perception (perception/)

| Archivo | Funcion | Frecuencia |
|---------|---------|------------|
| `sensors.js` | Escanea salud, entidades, ambiente, inventario | EVERY_TICK |
| `world-model.js` | Mapa mental persistente. POIs, camas, contenedores | FAST |
| `event-classifier.js` | Clasifica eventos por urgencia. Re-emite criticos/altos | Reactivo |

**Sin LLM.** Todo es lectura directa del bot API.

### 2.3 Instinct (instinct/)

| Archivo | Funcion |
|---------|---------|
| `survival.js` | Auto-comer (tabla de prioridad de comida), huir a salud critica, refugio nocturno |
| `combat.js` | Seleccion de arma por prioridad, engage/disengage, evasion de creepers, escudo vs rango |
| `self-preservation.js` | MLG con cubeta, deteccion de ahogamiento, escape de fuego/lava, deteccion de void |

**Sin LLM.** Reacciones inmediatas con logica condicional.

### 2.4 Memory (memory/)

| Archivo | Tipo | Backend | TTL |
|---------|------|---------|-----|
| `working-memory.js` | RAM volatil | Map (JS) | Segundos-minutos |
| `episodic-memory.js` | Eventos vividos | SQLite | Permanente |
| `semantic-memory.js` | Hechos y conocimiento | SQLite | Permanente |
| `spatial-memory.js` | Ubicaciones 3D | SQLite | Permanente |
| `social-memory.js` | Relaciones con jugadores | SQLite | Permanente |
| `memory-manager.js` | Fachada unificada | - | - |

**Consolidacion**: `memory-manager.consolidate()` mueve items significativos de working a episodic.
Ejecuta en TickGroup.SLOW.

**Contexto para LLM**: `buildContext()` filtra memorias relevantes por posicion, topic y jugadores.
Produce ~800-1500 tokens de contexto.

### 2.5 Autonomy (autonomy/)

| Archivo | Funcion |
|---------|---------|
| `decision-trees.js` | Logica condicional para situaciones comunes |
| `problem-solver.js` | Resolucion de tareas fallidas sin LLM |

**Niveles de autonomia:**
- **Nivel 1 (SILENT)**: Resuelve solo, sin informar (comer, huir)
- **Nivel 2 (INFORM)**: Resuelve solo, informa al jugador (ir a casa, dropear items)
- **Nivel 3 (ASK)**: Pide instrucciones al jugador (situaciones ambiguas)

**Arboles de decision** cubren: salud baja, inventario lleno, noche, jugador desconocido,
herramienta rota, hambre.

**Problem Solver** intenta estrategias en orden: RETRY -> ALTERNATIVE -> FALLBACK -> SKIP -> ESCALATE.
Solo escala al LLM cuando todo falla.

### 2.6 Planning (planning/)

| Archivo | Funcion |
|---------|---------|
| `goal-manager.js` | Metas con estado y fuente (COMMAND/AUTONOMOUS/INSTINCT/SCHEDULE) |
| `task-decomposer.js` | Templates para tareas comunes (get_wood, build_shelter, etc.) |
| `task-queue.js` | Cola FIFO con prioridad, retry (max 3), historial |
| `plan-executor.js` | Despacha tareas a action handlers. 14 tipos de tarea |

**Task Stack**: Las tareas se pueden interrumpir y reanudar.
Ejemplo: combate interrumpe mineria, al terminar el combate se reanuda la mineria.

### 2.7 Consciousness (consciousness/)

| Archivo | Funcion | Usa LLM |
|---------|---------|---------|
| `llm-interface.js` | Abstraccion multi-proveedor (Anthropic, OpenAI, Ollama) | Si |
| `prompt-builder.js` | Construye prompts con contexto filtrado | No |
| `thinker.js` | Decide CUANDO pensar. Rate-limited (10s cooldown) | Si |
| `reflection.js` | Auto-reflexion periodica. Genera insights y aprende | Si |

**Thinker.planMission()**: 1 llamada LLM para interpretar instruccion + generar plan.
**Thinker.handleMissionEvent()**: 1 llamada LLM para manejar evento inesperado durante mision.
**Thinker.think()**: Pensamiento autonomo idle/preguntas de chat.

### 2.8 Soul (soul/)

| Archivo | Funcion |
|---------|---------|
| `personality.js` | Modelo Big Five desde identity.json. Traits, estilo de habla, catchphrases |
| `emotions.js` | 8 dimensiones (joy, fear, anger, sadness, curiosity, pride, loneliness, determination). Decay natural |
| `motivations.js` | 7 necesidades (SURVIVAL, SECURITY, SOCIAL, COMPETENCE, EXPLORATION, CREATION, PURPOSE) |
| `favorability.js` | Sistema de afecto por jugador (0-100). 4 tiers. Inspriado en Touhou Little Maid |
| `proficiency.js` | Habilidades que mejoran con practica. 7 skills, niveles 1-10 |
| `schedule.js` | Horarios adaptativos basados en tiempo de juego y personalidad |

### 2.9 Communication (communication/)

| Archivo | Funcion |
|---------|---------|
| `minecraft-chat.js` | Chat/whisper. Limite 256 chars, split automatico |
| `discord-bridge.js` | Discord.js v14. Puente MC <-> Discord |
| `message-formatter.js` | Formato con personalidad. Templates en espanol |
| `command-parser.js` | Prefijo `!` + lenguaje natural. 20+ comandos |
| `reporter.js` | Reportes ROUTINE/WARNING/EMERGENCY. Sin LLM |
| `narrator/event-accumulator.js` | Acumula eventos en ventanas de 30s |
| `narrator/pattern-detector.js` | Detecta rachas, hitos, anomalias, escaladas |
| `narrator/template-narrator.js` | Convierte eventos + patrones en narracion natural. Sin LLM |
| `proactive/welcome-back.js` | Saludo contextual al regresar un jugador |
| `proactive/alert-triggers.js` | Alertas proactivas con cooldown anti-spam |

### 2.10 Actions (actions/)

| Archivo | Funcion |
|---------|---------|
| `movement.js` | Pathfinding: goTo, follow, lookAt, jump, collectDrops |
| `mining.js` | Minado con tabla de herramientas por bloque |
| `building.js` | placeBlock, buildStructure (box/wall/tower/floor) |
| `crafting.js` | Crafteo en inventario y con mesa |
| `farming.js` | Cultivos, cosecha, replantado, crianza |
| `fishing.js` | Pesca autonoma: detecta agua, lanza, espera mordida, recoge |
| `smelting.js` | Fundicion dedicada: hornos, altos hornos, ahumadores |
| `inventory.js` | Gestion completa de inventario |
| `interaction.js` | Interaccion con bloques y entidades |

### 2.11 Behaviors (behaviors/)

| Archivo | Funcion |
|---------|---------|
| `guard-village.js` | Patrulla circular, combate, escaneo de estructuras, reparacion, reportes |

Cada behavior es una factoria que retorna `{ tick, handleEvent, getSummary, cleanup }`.
El BehaviorManager identifica automaticamente el tipo de behavior del plan LLM.

---

## 3. Pipeline Cognitivo (7 PASOS)

Ejemplo: jugador dice "!guard" (custodia la aldea).

### PASO 1 - Percepcion
```
sensors.scan() -> detecta entidades, tiempo, ambiente
worldModel.update() -> actualiza POIs
eventClassifier -> clasifica "command:received" como HIGH
```
**LLM: 0 llamadas**

### PASO 2 - Consciencia (Interpretacion)
```
thinker.planMission({
  instruction: "Guard and protect this area...",
  username: "Player1",
  position, nearbyLocations, currentState
})
-> 1 llamada LLM -> genera plan con subtasks
```
**LLM: 1 llamada (~1500 tokens)**

### PASO 3 - Planificacion
```
behaviorManager identifica tipo "guard-village"
-> crea instancia de guardVillageFactory(plan, context)
-> genera ruta de patrulla (8 waypoints)
-> toma snapshot de estructuras
```
**LLM: 0 llamadas**

### PASO 4 - Ejecucion Autonoma
```
Cada tick (1s):
  - Patrulla waypoints (8s entre puntos)
  - Escanea hostiles (radio 32)
  - Si hostil: combatInstinct.engage() -> isFighting = true
  - Escanea estructuras (cada 5 min)
  - Repara danos (si tiene bloques)
```
**LLM: 0 llamadas**. Ejecuta por horas.

### PASO 5 - Reporte
```
Cada 10 min:
  reporter.sendRoutine(buildRoutineReport())
  -> "[OK] Reporte de guardia (10 min) | Sin amenazas | Posicion: (100, 64, 200)"
  -> MC chat (3 lineas max) + Discord embed
```
**LLM: 0 llamadas**

### PASO 6 - Evento Inesperado
```
entity:playerAppeared -> "Steve" (desconocido)
guardVillage.handleEvent() retorna false -> no puede resolver
behaviorManager.handleUnexpectedEvent()
-> thinker.handleMissionEvent(context)
-> 1 llamada LLM -> decide: saludar cautelosamente
```
**LLM: 0-1 llamadas** (solo si no puede resolver con codigo)

### PASO 7 - Consolidacion de Memoria
```
memoryManager.consolidate()
-> mueve eventos significativos a episodic
reflection.reflect() (cada 30s de pensamiento)
-> genera insights, aprende patrones
```
**LLM: 0-1 llamadas** (reflexion periodica)

**Total para 1 hora de guardia**: ~2-4 llamadas LLM.

---

## 4. Sistema de Favorabilidad

Inspirado en el FavorabilityManager de Touhou Little Maid.

### Puntaje (0-100)

| Accion | Cambio |
|--------|--------|
| Jugador dio comida | +3 |
| Jugador dio herramientas | +5 |
| Jugador salvo la vida | +10 |
| Jugador saludo | +1 |
| Jugador hablo | +1 |
| Tarea completada juntos | +5 |
| Jugador ignoro pedido de ayuda | -3 |
| Jugador destruyo construccion | -8 |
| Jugador me golpeo | -10 |
| Jugador se fue sin despedirse | -1 |
| Decay diario por ausencia | -0.5 |

### Tiers de Comportamiento

| Tier | Rango | Comportamiento |
|------|-------|---------------|
| DISTANT | 0-19 | Respuestas minimas. No obedece comandos. |
| COOPERATIVE | 20-49 | Obedece comandos basicos. Comunicacion funcional. |
| FRIENDLY | 50-79 | Inicia conversacion. Comparte informacion. Ayuda proactiva. |
| LOYAL | 80-100 | Se sacrifica por el jugador. Maxima lealtad. Todas las funciones. |

### Gates de Comportamiento

```javascript
shouldObeyCommand(player)      // score >= 20
shouldInitiateConversation(player) // score >= 50
shouldSacrifice(player)        // score >= 80
```

---

## 5. Sistema de Proficiencia

### Habilidades

| Skill | Acciones que dan XP |
|-------|---------------------|
| COMBAT | Matar hostiles, recibir dano, sobrevivir noches |
| MINING | Minar bloques, ores, diamantes |
| BUILDING | Colocar bloques, completar estructuras |
| FARMING | Cosechar, plantar, criar animales |
| CRAFTING | Fabricar items, herramientas |
| EXPLORATION | Descubrir lugares, viajar distancia |
| SOCIAL | Completar comandos, conversaciones, misiones |

### Niveles y Tiers

| Tier | Niveles | Speed Mod | Success Bonus |
|------|---------|-----------|---------------|
| Novice | 1-2 | 1.0x | 0-5% |
| Apprentice | 3-4 | 0.9x | 10-15% |
| Journeyman | 5-6 | 0.8x | 20-25% |
| Expert | 7-8 | 0.7x | 30-35% |
| Master | 9-10 | 0.6x | 40-45% |

Los niveles altos reducen el tiempo de ejecucion (speedMod) y aumentan
la probabilidad de exito en tareas dificiles.

---

## 6. Estructura de Archivos

```
clawcraft/
  index.js                  # Entry point
  config.js                 # Configuracion centralizada
  package.json
  .env.example
  .gitignore

  data/
    identity.json           # Personalidad Big Five, estilo, catchphrases
    config.json             # Overrides de runtime

  core/
    event-bus.js            # Bus de eventos con prioridad
    scheduler.js            # Loop principal con TickGroups
    agent.js                # Orquestador central
    behavior-manager.js     # Sistema de misiones

  perception/
    sensors.js              # Escaneo de mundo
    world-model.js          # Mapa mental
    event-classifier.js     # Clasificador de urgencia

  instinct/
    survival.js             # Supervivencia basica
    combat.js               # Combate automatico
    self-preservation.js    # Auto-preservacion extrema

  memory/
    working-memory.js       # RAM volatil
    episodic-memory.js      # Eventos (SQLite)
    semantic-memory.js      # Conocimiento (SQLite)
    spatial-memory.js       # Ubicaciones (SQLite)
    social-memory.js        # Relaciones (SQLite)
    memory-manager.js       # Fachada unificada

  autonomy/
    decision-trees.js       # Arboles de decision (3 niveles)
    problem-solver.js       # Resolucion de problemas sin LLM

  planning/
    goal-manager.js         # Gestion de metas
    task-decomposer.js      # Templates de descomposicion
    task-queue.js           # Cola con prioridad y retry
    plan-executor.js        # Ejecucion de planes

  consciousness/
    llm-interface.js        # Multi-proveedor LLM
    prompt-builder.js       # Constructor de prompts
    thinker.js              # Pensamiento rate-limited
    reflection.js           # Auto-reflexion

  soul/
    personality.js           # Big Five + estilo
    emotions.js              # 8 dimensiones emocionales
    motivations.js           # 7 necesidades
    favorability.js          # Afecto por jugador (0-100)
    proficiency.js           # Habilidades con XP
    schedule.js              # Horarios adaptativos

  communication/
    minecraft-chat.js        # Chat MC
    discord-bridge.js        # Puente Discord
    message-formatter.js     # Formato con personalidad
    command-parser.js        # Parser de comandos
    reporter.js              # Reportes sin LLM
    narrator/
      event-accumulator.js   # Acumulador de eventos (30s windows)
      pattern-detector.js    # Detector de patrones
      template-narrator.js   # Narracion por templates
    proactive/
      welcome-back.js        # Saludos de bienvenida
      alert-triggers.js      # Alertas proactivas

  behaviors/
    guard-village.js         # Custodia de aldea autonoma

  actions/
    movement.js              # Pathfinding
    mining.js                # Minado
    building.js              # Construccion
    crafting.js              # Crafteo
    farming.js               # Agricultura
    fishing.js               # Pesca
    smelting.js              # Fundicion
    inventory.js             # Inventario
    interaction.js           # Interacciones

  utils/
    logger.js                # Logging con colores
    database.js              # SQLite wrapper
    helpers.js               # Utilidades generales
```

**Total: 45 modulos** en 12 directorios.

---

## 7. Patrones de Diseno

### Factory Functions
Todos los modulos exportan `createXxx()` que retornan `Object.freeze({...})`.
No hay clases. Encapsulacion via closures.

### Inmutabilidad
Estado interno se actualiza con spread operator, nunca mutacion directa.
```javascript
skills.set(name, { ...current, xp: newXp, level: newLevel });
```

### Event-Driven
Todas las capas se comunican a traves del bus de eventos.
Ningun modulo importa directamente a otro modulo de otra capa.

### Dependency Injection
`agent.js` inyecta dependencias en la creacion. Los modulos no hacen
import de otros modulos -- reciben sus dependencias como parametros.

### Scheduler Tick Groups
Las capas criticas (sensores, instintos) corren cada tick.
Las capas lentas (reflexion, decay) corren cada 30s.
Esto permite priorizar CPU donde importa.

### Behavior Factory
Los behaviors son factorias que retornan handlers con interfaz uniforme:
`{ tick, handleEvent, getSummary, cleanup }`.

---

## 8. Costos Estimados de LLM

### Escenario: 1 hora de guardia

| Accion | Llamadas LLM | Tokens aprox |
|--------|-------------|--------------|
| Interpretar mision | 1 | ~2000 |
| Evento inesperado (jugador desconocido) | 0-2 | ~1000 c/u |
| Reflexion periodica | 2-3 | ~800 c/u |
| **Total** | **3-6** | **~5000-8000** |

### Escenario: 1 hora idle (sin mision)

| Accion | Llamadas LLM | Tokens aprox |
|--------|-------------|--------------|
| Pensamiento autonomo | 6-12 | ~500 c/u |
| Chat con jugadores | 0-5 | ~800 c/u |
| Reflexion | 2-3 | ~800 c/u |
| **Total** | **8-20** | **~8000-15000** |

### Costo mensual estimado (24/7)

Con Anthropic Claude Haiku como modelo por defecto:
- Guardia: ~$0.50-1.00/dia
- Idle activo: ~$1.00-2.00/dia
- **Mensual**: ~$15-60

Con modelo local (Ollama):
- **$0/mes** (solo electricidad)

---

## Runtime

- **Bun** como runtime JavaScript (no Node.js)
- `bun:sqlite` para base de datos integrada
- Soporte para Minecraft 1.20+ via mineflayer
- Discord.js v14 para integracion con Discord
