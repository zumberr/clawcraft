// ClawCraft - Plugin Loader
// Scans a directory for tool/skill plugins, validates their interface,
// and returns them ready for registration in the tool registry.

import { readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { pathToFileURL } from 'url';
import { createLogger } from './logger.js';

const log = createLogger('PluginLoader');

/**
 * Load all valid tool/skill plugins from a directory.
 * Ignores files starting with '_' (templates).
 * @param {string} dir - Absolute path to the tools/ directory
 * @returns {Promise<Array<object>>} - Array of validated plugin definitions
 */
export async function loadPlugins(dir) {
  const plugins = [];

  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    log.warn(`Plugin directory not found or unreadable: ${dir}`);
    return plugins;
  }

  const jsFiles = entries.filter(f =>
    f.endsWith('.js') && !f.startsWith('_') && statSync(join(dir, f)).isFile()
  );

  for (const file of jsFiles) {
    const filePath = join(dir, file);
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const mod = await import(fileUrl);
      const plugin = mod.default ?? mod;

      const errors = validatePlugin(plugin, file);
      if (errors.length > 0) {
        log.warn(`Plugin "${file}" skipped: ${errors.join(', ')}`);
        continue;
      }

      plugins.push(plugin);
      log.info(`Plugin loaded: "${plugin.name}" (${plugin.type === 'skill' ? 'skill' : 'tool'}) from ${file}`);
    } catch (err) {
      log.error(`Failed to load plugin "${file}": ${err.message}`);
    }
  }

  log.info(`Loaded ${plugins.length} plugin(s) from ${dir}`);
  return plugins;
}

/**
 * Validate that a plugin object has the required interface.
 * @returns {string[]} - Array of error messages (empty if valid)
 */
function validatePlugin(plugin, filename) {
  const errors = [];

  if (!plugin || typeof plugin !== 'object') {
    return [`${filename} does not export an object`];
  }

  if (!plugin.name || typeof plugin.name !== 'string') {
    errors.push('missing or invalid "name" (string)');
  }

  if (!plugin.description || typeof plugin.description !== 'string') {
    errors.push('missing or invalid "description" (string)');
  }

  if (!plugin.formatResult || typeof plugin.formatResult !== 'function') {
    errors.push('missing "formatResult" function');
  }

  const isSkill = plugin.type === 'skill';

  if (isSkill) {
    if (!plugin.steps || typeof plugin.steps !== 'function') {
      errors.push('skill must have a "steps" function');
    }
  } else {
    if (!plugin.execute || typeof plugin.execute !== 'function') {
      errors.push('tool must have an "execute" function');
    }
  }

  return errors;
}

export default loadPlugins;
