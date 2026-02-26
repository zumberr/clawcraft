// ClawCraft - LLM Interface
// Abstraction over any LLM provider (Anthropic, OpenAI, local)

import { createLogger } from '../utils/logger.js';

const log = createLogger('LLM');

export function createLLMInterface(llmConfig) {
  const { provider, model, apiKey, baseUrl, maxTokens, temperature } = llmConfig;

  let totalTokensUsed = 0;
  let callCount = 0;

  /**
   * Send a prompt to the LLM and get a response
   */
  async function ask(messages, options = {}) {
    const {
      systemPrompt = null,
      maxResponseTokens = maxTokens,
      temp = temperature,
      jsonMode = false,
    } = options;

    callCount++;
    const startTime = performance.now();

    try {
      let response;

      switch (provider) {
        case 'anthropic':
          response = await callAnthropic(messages, { systemPrompt, maxResponseTokens, temp });
          break;
        case 'openai':
          response = await callOpenAI(messages, { systemPrompt, maxResponseTokens, temp, jsonMode });
          break;
        case 'local':
          response = await callLocal(messages, { systemPrompt, maxResponseTokens, temp });
          break;
        default:
          throw new Error(`Unknown LLM provider: ${provider}`);
      }

      const elapsed = Math.round(performance.now() - startTime);
      totalTokensUsed += response.tokensUsed ?? 0;

      log.debug(`LLM response (${elapsed}ms, ~${response.tokensUsed ?? '?'} tokens)`);

      return response;
    } catch (err) {
      log.error(`LLM call failed: ${err.message}`);
      throw err;
    }
  }

  async function callAnthropic(messages, opts) {
    const url = baseUrl || 'https://api.anthropic.com/v1/messages';

    const body = {
      model,
      max_tokens: opts.maxResponseTokens,
      temperature: opts.temp,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (opts.systemPrompt) {
      body.system = opts.systemPrompt;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${error}`);
    }

    const data = await res.json();

    return {
      content: data.content[0]?.text ?? '',
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      stopReason: data.stop_reason,
    };
  }

  async function callOpenAI(messages, opts) {
    const url = baseUrl || 'https://api.openai.com/v1/chat/completions';

    const formattedMessages = [];
    if (opts.systemPrompt) {
      formattedMessages.push({ role: 'system', content: opts.systemPrompt });
    }
    formattedMessages.push(...messages);

    const body = {
      model,
      messages: formattedMessages,
      max_tokens: opts.maxResponseTokens,
      temperature: opts.temp,
    };

    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${error}`);
    }

    const data = await res.json();

    return {
      content: data.choices[0]?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      stopReason: data.choices[0]?.finish_reason,
    };
  }

  async function callLocal(messages, opts) {
    const url = baseUrl || 'http://localhost:11434/api/chat';

    const formattedMessages = [];
    if (opts.systemPrompt) {
      formattedMessages.push({ role: 'system', content: opts.systemPrompt });
    }
    formattedMessages.push(...messages);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: false,
        options: {
          temperature: opts.temp,
          num_predict: opts.maxResponseTokens,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Local LLM error (${res.status})`);
    }

    const data = await res.json();

    return {
      content: data.message?.content ?? '',
      tokensUsed: (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0),
      stopReason: 'stop',
    };
  }

  function getStats() {
    return Object.freeze({
      provider,
      model,
      callCount,
      totalTokensUsed,
    });
  }

  return Object.freeze({
    ask,
    getStats,
  });
}

export default createLLMInterface;
