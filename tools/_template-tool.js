// ClawCraft - Custom Tool Template
// ================================
// Place this file in the tools/ folder and rename it.
// Files starting with '_' are ignored by the plugin loader.
//
// A tool is a SINGLE ACTION that the agentic loop can call.
// The LLM sees your description and parameters to decide when to use it.
//
// Dependencies available in `deps`:
//   deps.actions     - All action modules (movement, mining, crafting, building, farming, inventory, interaction, fishing, smelting)
//   deps.sensors     - Perception: scanEntities(), scanEnvironment(), scanInventory(), getNearbyEntities()
//   deps.worldModel  - World state: getSnapshot(), findBlocks(name), getBlockAt(pos), getNearestPOI()
//   deps.memoryManager - Memory: episodic, semantic, spatial, social, working
//   deps.bus         - Event bus: emit(event, data, category)

export default {
  // Unique name - this is how the LLM references the tool
  name: 'my_tool',

  // Description shown to the LLM so it knows when to use this tool
  description: 'Describe what this tool does in one sentence.',

  // Parameter documentation - keys are param names, values are descriptions for the LLM
  parameters: {
    exampleParam: 'what this parameter does (e.g. "block name like oak_log")',
  },

  // Execute the tool action. Must return a data object (any shape).
  // Errors are caught automatically - just throw if something fails.
  async execute(params, deps) {
    const { actions } = deps;

    // Example: mine a block
    // const mined = await actions.mining.mineBlock(params.block, params.count ?? 1);
    // return { block: params.block, mined };

    return { message: 'Tool executed' };
  },

  // Format the result data into a human-readable string for the LLM.
  // This is what appears as OBSERVATION in the agentic loop.
  formatResult(data) {
    return `Result: ${data.message}`;
  },
};
