// ClawCraft - Mining Actions
// Mine blocks, dig tunnels, strip mine

import { createLogger } from "../utils/logger.js";
import { formatPos } from "../utils/helpers.js";
import { EventCategory } from "../core/event-bus.js";

const log = createLogger("Action:Mining");

// Tool requirements for blocks
const TOOL_FOR_BLOCK = {
  stone: "pickaxe",
  cobblestone: "pickaxe",
  deepslate: "pickaxe",
  iron_ore: "pickaxe",
  gold_ore: "pickaxe",
  diamond_ore: "pickaxe",
  coal_ore: "pickaxe",
  copper_ore: "pickaxe",
  lapis_ore: "pickaxe",
  redstone_ore: "pickaxe",
  emerald_ore: "pickaxe",
  oak_log: "axe",
  birch_log: "axe",
  spruce_log: "axe",
  jungle_log: "axe",
  acacia_log: "axe",
  dark_oak_log: "axe",
  dirt: "shovel",
  sand: "shovel",
  gravel: "shovel",
  grass_block: "shovel",
  clay: "shovel",
};

export function createMining(bot, bus = null) {
  function emitMined(blockName, position, extra = {}) {
    if (!bus) return;

    bus.emit(
      "action:mined",
      {
        blockName,
        position: position
          ? { x: position.x, y: position.y, z: position.z }
          : null,
        count: 1,
        ...extra,
      },
      EventCategory.TASK,
    );
  }

  async function mineBlock(blockName, count = 1) {
    const mcData = require("minecraft-data")(bot.version);
    let mined = 0;

    for (let i = 0; i < count; i++) {
      const blockType = mcData.blocksByName[blockName];
      if (!blockType) throw new Error(`Unknown block: ${blockName}`);

      const blocks = bot.findBlocks({
        matching: blockType.id,
        maxDistance: 32,
        count: 1,
      });

      if (blocks.length === 0) {
        log.warn(`No more ${blockName} found (mined ${mined}/${count})`);
        break;
      }

      const targetPos = blocks[0];
      const block = bot.blockAt(targetPos);
      if (!block) continue;

      // Equip best tool
      await equipBestTool(blockName);

      // Move close enough to mine
      if (bot.entity.position.distanceTo(targetPos) > 4) {
        const { goals, Movements } = require("mineflayer-pathfinder");
        const movements = new Movements(bot, mcData);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(
          new goals.GoalGetToBlock(targetPos.x, targetPos.y, targetPos.z),
        );

        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Move timeout")),
            15000,
          );
          bot.once("goal_reached", () => {
            clearTimeout(timer);
            resolve();
          });
          bot.once("path_update", (r) => {
            if (r.status === "noPath") {
              clearTimeout(timer);
              reject(new Error("No path"));
            }
          });
        });
      }

      // Mine the block
      try {
        await bot.dig(block);
        mined++;
        emitMined(block.name ?? blockName, targetPos, {
          requestedBlock: blockName,
          minedCount: mined,
          totalRequested: count,
        });
        log.debug(
          `Mined ${blockName} at ${formatPos(targetPos)} (${mined}/${count})`,
        );
      } catch (err) {
        log.error(`Failed to mine ${blockName}: ${err.message}`);
      }
    }

    log.info(`Mining complete: ${mined}/${count} ${blockName}`);
    return mined;
  }

  async function mineAt(position) {
    const block = bot.blockAt(position);
    if (!block || block.name === "air") {
      throw new Error(`No block at ${formatPos(position)}`);
    }

    await equipBestTool(block.name);
    await bot.dig(block);
    emitMined(block.name, position);
    log.debug(`Mined ${block.name} at ${formatPos(position)}`);
    return block.name;
  }

  async function equipBestTool(blockName) {
    const toolType = TOOL_FOR_BLOCK[blockName];
    if (!toolType) return;

    const toolTiers = ["netherite", "diamond", "iron", "stone", "wooden"];
    const items = bot.inventory.items();

    for (const tier of toolTiers) {
      const tool = items.find((i) => i.name === `${tier}_${toolType}`);
      if (tool) {
        await bot.equip(tool, "hand");
        return;
      }
    }
  }

  async function digDown(depth = 3) {
    for (let i = 0; i < depth; i++) {
      const below = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (below && below.name !== "air" && below.name !== "bedrock") {
        await bot.dig(below);
        emitMined(below.name, below.position, { source: "digDown" });
      }
      // Wait for falling
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    log.info(`Dug down ${depth} blocks`);
  }

  return Object.freeze({
    mineBlock,
    mineAt,
    equipBestTool,
    digDown,
  });
}

export default createMining;
