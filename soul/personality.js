// ClawCraft - Personality
// Emergent personality from identity.json, modified by experiences

import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/helpers.js';

const log = createLogger('Soul:Personality');

const IDENTITY_PATH = join(import.meta.dir, '..', 'data', 'identity.json');

export function createPersonality() {
  let identity = JSON.parse(readFileSync(IDENTITY_PATH, 'utf-8'));

  // Big Five personality model (0-1 scale)
  let traits = { ...identity.personality_traits };
  let speechStyle = { ...identity.speech_style };
  let catchphrases = [...identity.catchphrases];

  function getPersona() {
    return Object.freeze({
      name: identity.name,
      title: identity.title,
      origin: identity.origin,
      language: speechStyle.language,
      traits: describeTraits(),
      fears: [...identity.fears],
      aspirations: [...identity.aspirations],
    });
  }

  function describeTraits() {
    const descriptions = [];

    if (traits.openness > 0.6) descriptions.push('curious and creative');
    else descriptions.push('practical and focused');

    if (traits.conscientiousness > 0.6) descriptions.push('diligent and organized');
    else descriptions.push('flexible and adaptable');

    if (traits.extraversion > 0.6) descriptions.push('talkative and energetic');
    else descriptions.push('quiet and observant');

    if (traits.agreeableness > 0.6) descriptions.push('helpful and cooperative');
    else descriptions.push('independent and assertive');

    if (traits.neuroticism > 0.5) descriptions.push('sensitive and cautious');
    else descriptions.push('calm and steady');

    return descriptions;
  }

  function getTrait(name) {
    return traits[name] ?? 0.5;
  }

  function adjustTrait(name, delta) {
    if (!(name in traits)) return;
    traits = { ...traits, [name]: clamp(traits[name] + delta, 0, 1) };
    log.debug(`Trait ${name} adjusted to ${traits[name].toFixed(2)}`);
  }

  function getSpeechStyle() {
    return Object.freeze({ ...speechStyle });
  }

  function getRandomCatchphrase() {
    if (catchphrases.length === 0) return '';
    return catchphrases[Math.floor(Math.random() * catchphrases.length)];
  }

  function addMemoryThatMatters(memory) {
    identity = {
      ...identity,
      memories_that_matter: [...identity.memories_that_matter, memory],
    };
  }

  function addBond(name, type) {
    identity = {
      ...identity,
      bonds: { ...identity.bonds, [name]: type },
    };
  }

  function getBonds() {
    return { ...identity.bonds };
  }

  function getFullIdentity() {
    return Object.freeze({ ...identity, personality_traits: { ...traits } });
  }

  return Object.freeze({
    getPersona,
    getTrait,
    adjustTrait,
    getSpeechStyle,
    getRandomCatchphrase,
    addMemoryThatMatters,
    addBond,
    getBonds,
    getFullIdentity,
    describeTraits,
  });
}

export default createPersonality;
