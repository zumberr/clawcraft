<div align="center">

<img src="https://raw.githubusercontent.com/zumberr/clawcraft/main/assets/banner.png" alt="ClawCraft Banner" width="100%">

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

[![Version](https://img.shields.io/badge/version-0.2.0-00d4aa?style=for-the-badge&labelColor=0d1117)](https://github.com/zumberr/clawcraft)
[![Runtime](https://img.shields.io/badge/runtime-Bun-fbf0df?style=for-the-badge&logo=bun&logoColor=000&labelColor=0d1117)](https://bun.sh)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.20%2B-62b447?style=for-the-badge&logo=minecraft&logoColor=white&labelColor=0d1117)](https://minecraft.net)
[![License](https://img.shields.io/badge/license-MIT-7c3aed?style=for-the-badge&labelColor=0d1117)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Bridge-5865F2?style=for-the-badge&logo=discord&logoColor=white&labelColor=0d1117)](https://discord.js.org)

<br>

> **90% código puro. 10% LLM.**  
> ClawCraft actúa, piensa y siente — sin gastar tokens para cada respiro.

</div>

---

## ✦ ¿Qué es ClawCraft?

ClawCraft es un **agente autónomo de Minecraft** construido sobre `mineflayer`, inspirado en **Touhou Little Maid**. No es un simple bot de comandos — es una entidad con personalidad, memoria, emociones y lealtad que se forja con cada interacción.

El principio fundamental: **código donde se pueda, LLM donde se deba.**

Mientras duermes, ClawCraft patrulla, mina, cosecha, pesca y se defiende. Cuando regresas, te recuerda. Cuando te ayuda, crece. Cuando te lastima —  lo recuerda también.

---

## ⚡ Stack Tecnológico

| Componente | Tecnología |
|---|---|
| **Runtime** | [Bun](https://bun.sh) — rápido, nativo, sin Node |
| **Bot Core** | [mineflayer](https://github.com/PrismarineJS/mineflayer) v4.14 |
| **Pathfinding** | mineflayer-pathfinder |
| **Combate** | mineflayer-pvp |
| **Base de Datos** | SQLite via `bun:sqlite` (nativa) |
| **Discord** | discord.js v14 |
| **LLM** | Anthropic Claude / OpenAI / Ollama (configurable) |

---

## 🧠 Arquitectura Cognitiva

ClawCraft opera en **9 capas interconectadas** a través de un Event Bus central con sistema de prioridades (CRITICAL → HIGH → NORMAL → LOW):

```
  ┌─────────────────────────────────────────────────────┐
  │                   Minecraft World                   │
  └──────────────────────┬──────────────────────────────┘
                         │
  ┌──────────────────────▼──────────────────────────────┐
  │  PERCEPTION   │  sensors · world-model · classifier  │
  ├───────────────┼─────────────────────────────────────┤
  │  INSTINCT     │  survival · combat · self-preservation│
  ├───────────────┼─────────────────────────────────────┤
  │  MEMORY       │  working · episodic · spatial · social│  ◄── SQLite
  ├───────────────┼─────────────────────────────────────┤
  │  AUTONOMY     │  decision-trees · problem-solver      │
  ├───────────────┼─────────────────────────────────────┤
  │  PLANNING     │  goals · decomposer · queue · executor│
  ├───────────────┼─────────────────────────────────────┤
  │  CONSCIOUSNESS│  llm-interface · thinker · reflection │  ◄── LLM aquí
  ├───────────────┼─────────────────────────────────────┤
  │  SOUL         │  personality · emotions · favorability│
  ├───────────────┼─────────────────────────────────────┤
  │  COMMUNICATION│  mc-chat · discord · narrator · alerts│
  ├───────────────┼─────────────────────────────────────┤
  │  ACTIONS      │  movement · mining · building · ...   │
  └─────────────────────────────────────────────────────┘
```

**45 módulos** distribuidos en 12 directorios. Cero clases — todo Factory Functions + closures.

---

## 💾 Sistema de Memoria

ClawCraft no olvida. Tiene 5 tipos de memoria independientes:

| Tipo | Backend | Descripción |
|---|---|---|
| `working-memory` | RAM (Map) | Estado volátil del momento |
| `episodic-memory` | SQLite | Todo lo que vivió |
| `semantic-memory` | SQLite | Hechos y conocimiento del mundo |
| `spatial-memory` | SQLite | Ubicaciones 3D: camas, hogares, puntos de interés |
| `social-memory` | SQLite | Historial de relaciones con cada jugador |

El `memory-manager` consolida automáticamente cada 30 segundos, moviendo lo significativo de RAM a disco.

---

## ❤️ Sistema de Favorabilidad

Inspirado en Touhou Little Maid. Cada jugador tiene un **puntaje de afecto (0–100)** que determina cómo ClawCraft te trata:

| Tier | Rango | Comportamiento |
|---|---|---|
| 🩶 **DISTANT** | 0 – 19 | Respuestas mínimas. No obedece comandos. |
| 💙 **COOPERATIVE** | 20 – 49 | Obedece comandos básicos. Comunicación funcional. |
| 💚 **FRIENDLY** | 50 – 79 | Inicia conversación. Comparte info. Ayuda proactiva. |
| ❤️ **LOYAL** | 80 – 100 | Se sacrifica por ti. Máxima lealtad. Todo habilitado. |

```
 Dar comida       → +3     │    Ignorar pedido → -3
 Dar herramientas → +5     │    Destruir build  → -8
 Salvar su vida   → +10    │    Golpearlo       → -10
 Completar tarea  → +5     │    Ausencia diaria → -0.5
```

---

## 🎓 Sistema de Proficiencia

Las habilidades mejoran con la práctica real — sin trampas:

| Skill | XP viene de... | Nivel máx | Beneficio |
|---|---|---|---|
| ⚔️ **COMBAT** | Matar hostiles, sobrevivir noches | 10 | -40% tiempo de combate |
| ⛏️ **MINING** | Minar bloques y ores | 10 | -40% tiempo de minado |
| 🏗️ **BUILDING** | Colocar bloques, completar estructuras | 10 | -40% tiempo de construcción |
| 🌾 **FARMING** | Cosechar, plantar, criar | 10 | +45% éxito en cultivos |
| 🔨 **CRAFTING** | Fabricar items y herramientas | 10 | +45% éxito en crafteo |
| 🧭 **EXPLORATION** | Descubrir lugares, distancia viajada | 10 | -40% tiempo de viaje |
| 💬 **SOCIAL** | Completar misiones, conversar | 10 | +45% comprensión de comandos |

---

## 🎭 El Alma de ClawCraft

### Personalidad — Big Five Model
Definida en `data/identity.json`. Configurable: traits, estilo de habla, catchphrases.

### Emociones — 8 Dimensiones
`joy · fear · anger · sadness · curiosity · pride · loneliness · determination`  
Cada emoción decae de forma natural con el tiempo.

### Motivaciones — 7 Necesidades
`SURVIVAL · SECURITY · SOCIAL · COMPETENCE · EXPLORATION · CREATION · PURPOSE`  
Guían el comportamiento autónomo cuando no hay órdenes activas.

---

## 🤖 Pipeline Cognitivo (Ejemplo: !guard)

```
 PASO 1  Percepción     sensors.scan() → classifier → "command:received" HIGH
         └── LLM: 0 llamadas

 PASO 2  Consciencia    thinker.planMission() → interpreta "guard area"
         └── LLM: 1 llamada (~1500 tokens)

 PASO 3  Planificación  behaviorManager → guardVillageFactory → 8 waypoints
         └── LLM: 0 llamadas

 PASO 4  Ejecución      Patrulla · escanea hostiles · combate autónomo
         └── LLM: 0 llamadas  ← durante HORAS

 PASO 5  Reporte        reporter.sendRoutine() → MC chat + Discord embed
         └── LLM: 0 llamadas

 PASO 6  Evento         Jugador desconocido → handleUnexpectedEvent()
         └── LLM: 0-1 llamadas (solo si código no puede resolverlo)

 PASO 7  Memoria        memoryManager.consolidate() → reflection.reflect()
         └── LLM: 0-1 llamadas
```

**Total para 1 hora de guardia: ~3-6 llamadas LLM** — no ~3600.

---

## 💰 Costo Estimado de LLM

| Escenario | Llamadas/hora | Tokens aprox | Costo/mes (Claude Haiku) |
|---|---|---|---|
| 🛡️ Guardando | 3–6 | ~5k–8k | ~$0.50–1.00/día |
| 💭 Idle activo | 8–20 | ~8k–15k | ~$1.00–2.00/día |
| 🔧 Ollama local | ilimitado | — | **$0** |

---

## 🚀 Instalación

### Prerrequisitos
- [Bun](https://bun.sh) instalado (`curl -fsSL https://bun.sh/install | bash`)
- Servidor de Minecraft 1.20+
- API Key de Anthropic / OpenAI **o** Ollama corriendo localmente

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/zumberr/clawcraft.git
cd clawcraft

# 2. Instalar dependencias
bun install

# 3. Configurar entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Lanzar
bun run index.js
```

---

## ⚙️ Configuración

Copia `.env.example` a `.env` y configura:

```env
# Minecraft
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=ClawCraft
MINECRAFT_VERSION=1.20.1

# LLM — elige uno
LLM_PROVIDER=anthropic        # anthropic | openai | ollama
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OLLAMA_HOST=http://localhost:11434
LLM_MODEL=claude-haiku-4-5

# Discord (opcional)
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=

# Bot
BOT_OWNER=TuNombreEnMinecraft
```

---

## 📁 Estructura del Proyecto

```
clawcraft/
├── index.js              # Entry point + ASCII art
├── config.js             # Configuración centralizada
├── data/
│   ├── identity.json     # Personalidad Big Five
│   └── config.json       # Overrides de runtime
├── core/                 # Orquestador, Event Bus, Scheduler
├── perception/           # Sensores, modelo del mundo
├── instinct/             # Supervivencia y combate autónomo
├── memory/               # 5 tipos: working→SQLite
├── autonomy/             # Árboles de decisión (3 niveles)
├── planning/             # Goals, decomposición, cola, ejecución
├── consciousness/        # Interfaz LLM, Thinker, Reflection
├── soul/                 # Personalidad, emociones, favorabilidad
├── communication/        # Chat MC, Discord, Narrador
├── behaviors/            # Comportamientos complejos (guard-village)
├── actions/              # 9 módulos: movement, mining, building...
└── utils/                # Logger, SQLite wrapper, helpers
```

---

## 🧩 Patrones de Diseño

- **Factory Functions** — Cero clases. Todo retorna `Object.freeze({...})`
- **Event-Driven** — Las capas no se importan entre sí, solo hablan por el bus
- **Dependency Injection** — `agent.js` inyecta todo. Módulos reciben deps como parámetros
- **Inmutabilidad** — Estado interno via spread operator, nunca mutación directa
- **Tick Groups** — `EVERY_TICK(50ms)` para instintos, `VERY_SLOW(30s)` para reflexión

---

## 🗺️ Roadmap

- [x] Arquitectura de 9 capas completa
- [x] Sistema de favorabilidad (Touhou Little Maid inspired)
- [x] Puente Discord bidireccional
- [x] Guard Village behavior
- [x] 5 tipos de memoria persistente (SQLite)
- [ ] Más behaviors: `follow`, `farm-loop`, `base-builder`
- [ ] GUI web de monitoreo en tiempo real
- [ ] Sistema de quests complejas
- [ ] Soporte multi-bot (squad)
- [ ] Tests automatizados

---

## 📜 Licencia

MIT — libre de usar, modificar y distribuir.

---

<div align="center">

**Hecho con 🐾 y demasiadas horas de Minecraft**

*ClawCraft no es solo un bot — es tu compañero.*

[![GitHub](https://img.shields.io/badge/GitHub-zumberr-181717?style=flat-square&logo=github)](https://github.com/zumberr)

</div>
