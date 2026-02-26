// ClawCraft - General Utilities

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate 3D distance between two points
 */
export function distance3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate horizontal (XZ) distance between two points
 */
export function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Create an immutable copy with updated fields
 */
export function evolve(obj, updates) {
  return Object.freeze({ ...obj, ...updates });
}

/**
 * Debounce a function
 */
export function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle(fn, limit) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn(...args);
    }
  };
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Format a position as readable string
 */
export function formatPos(pos) {
  if (!pos) return 'unknown';
  return `(${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})`;
}

/**
 * Get a random element from an array
 */
export function randomChoice(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a unique ID
 */
export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Truncate a string with ellipsis
 */
export function truncate(str, maxLen = 100) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Calculate block position from entity position
 */
export function blockPos(pos) {
  return {
    x: Math.floor(pos.x),
    y: Math.floor(pos.y),
    z: Math.floor(pos.z),
  };
}

/**
 * Check if a position is within a radius of another
 */
export function isWithinRadius(posA, posB, radius) {
  return distance3D(posA, posB) <= radius;
}
