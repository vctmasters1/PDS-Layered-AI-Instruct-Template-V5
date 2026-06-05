// See server/AI-INSTRUCT.md — all LLM calls must go through this service
import { env } from '../config/env.js';
import { getLlmConfig } from './llm-settings.js';

export const llm = {
  async complete(systemPrompt, userPrompt) {
    return this._call([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ], env.llmTimeoutMs);
  },

  // No-timeout variants for background job-queue work — the worker has no
  // HTTP connection to keep alive so there is no reason to abort mid-generation.
  // baseUrl/modelId override defaults (used for multi-GPU slot routing).
  async completeQueue(systemPrompt, userPrompt, baseUrl = null, modelId = null) {
    return this._call([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ], 0, baseUrl, modelId);
  },

  // messages: array of { role: 'user'|'assistant', content: string }
  async chat(systemPrompt, messages) {
    return this._call([
      { role: 'system', content: systemPrompt },
      ...messages,
    ], env.llmTimeoutMs);
  },

  // Extract text from an image using vision capabilities
  async vision(base64, mimeType) {
    return this._call([{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract all the text from this image. Return only the extracted text content, preserving the original structure and layout as faithfully as possible. Do not add commentary, descriptions, or analysis.',
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
      ],
    }], env.llmTimeoutMs);
  },

  // timeoutMs = 0 means no timeout (used by background queue jobs)
  async _call(messages, timeoutMs = env.llmTimeoutMs, baseUrl = null, modelId = null) {
    const config = await getLlmConfig();
    const url = `${baseUrl ?? config.apiUrl}/v1/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    let controller, timer;
    if (timeoutMs > 0) {
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId ?? config.model,
          messages,
          temperature: 0.3,
          stream: false,
        }),
        signal: controller?.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${timeoutMs}ms`);
      }
      throw new Error(`LLM unreachable: ${err.message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error('LLM returned an empty response.');
    // Strip <think>...</think> blocks (Qwen3 and other reasoning models)
    const content = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!content) throw new Error('LLM returned an empty response after stripping thinking tokens.');
    return content;
  },
};
