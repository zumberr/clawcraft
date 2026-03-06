// ClawCraft - Custom Skill Template
// =================================
// Place this file in the tools/ folder and rename it.
// Files starting with '_' are ignored by the plugin loader.
//
// A skill is a MULTI-STEP COMPOSITION of tools.
// It executes several tools in sequence to accomplish a complex goal.
// The LLM treats it like a single tool but internally it runs multiple steps.
//
// Dependencies available in `deps`:
//   deps.actions     - All action modules
//   deps.sensors     - Perception
//   deps.worldModel  - World state
//   deps.memoryManager - Memory
//   deps.bus         - Event bus
//   deps.execute(toolName, params) - Call any registered tool by name (built-in or custom)

export default {
  // Unique name
  name: 'my_skill',

  // Must be 'skill' so the loader knows this is a multi-step composition
  type: 'skill',

  // Description shown to the LLM
  description: 'Describe what this skill accomplishes as a whole.',

  // Parameters the LLM can pass
  parameters: {
    material: 'what material to use (e.g. "oak")',
    count: 'how many to produce (default 1)',
  },

  // The multi-step execution. Use deps.execute() to call other tools.
  // Each deps.execute() call returns { success: boolean, data?: any, error?: string }.
  async steps(params, deps) {
    const results = [];

    // Example: gather wood and craft planks
    // Step 1: Mine logs
    // const mineResult = await deps.execute('mine', { block: `${params.material}_log`, count: params.count ?? 1 });
    // results.push(mineResult);
    // if (!mineResult.success) return { results, error: mineResult.error };

    // Step 2: Craft planks
    // const craftResult = await deps.execute('craft', { item: `${params.material}_planks`, count: (params.count ?? 1) * 4 });
    // results.push(craftResult);

    return { results, message: 'Skill completed' };
  },

  // Format the final result for the LLM
  formatResult(data) {
    if (data.error) return `Skill failed: ${data.error}`;
    return `Skill completed: ${data.message}`;
  },
};
