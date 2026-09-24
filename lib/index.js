// source-hash 4f8cb8c2bef0


// src/config.ts
import z from "@deepseek-ai/schemastery";
var NAMESPACE = "prompt-polish";
var DEFAULT_CONFIG = {
  enabled: true,
  strength: "balanced",
  temperature: 0.3,
  // 激进档允许写到约 1500 字符；若会话选择带 reasoningEffort，推理也要从同一份额度里出，
  // 所以留出余量。被截断时插件拒绝写回并报错，不会把半截提示词塞进输入框。
  maxOutputTokens: 2048,
  maxInputChars: 12e3,
  timeoutMs: 6e4,
  systemPrompt: "",
  strategyMode: "replace-default",
  undoWindowMs: 6e4
};
var Config = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled).description("\u603B\u5F00\u5173\uFF1A\u5173\u95ED\u540E\u9690\u85CF\u8F93\u5165\u6846\u65C1\u7684\u5C0F\u661F\u661F\u6309\u94AE\u3002").volatile(),
  // 注意：z.union(STRENGTHS) 会把类型退化成 string，导致 schema 与 Config 不匹配，
  // 所以逐项用 z.const 组成联合，保持字面量类型。
  strength: z.union([
    z.const("conservative"),
    z.const("balanced"),
    z.const("aggressive")
  ]).default(DEFAULT_CONFIG.strength).description("\u4F18\u5316\u529B\u5EA6\uFF1A\u4FDD\u5B88=\u53EA\u7EA0\u9519\u4E0E\u7ED3\u6784\u5316\uFF1B\u5747\u8861=\u8865\u5168\u9690\u542B\u6761\u4EF6\uFF1B\u6FC0\u8FDB=\u91CD\u5199\u6210\u5B8C\u6574\u4EFB\u52A1\u63CF\u8FF0\uFF08\u957F\u5EA6\u4E0A\u9650\u653E\u5BBD\u5230\u7EA6 1500 \u5B57\u7B26\uFF09\u3002").volatile(),
  temperature: z.number().min(0).max(1).step(0.05).default(DEFAULT_CONFIG.temperature).description("\u91C7\u6837\u6E29\u5EA6\uFF1A\u8D8A\u4F4E\u8D8A\u5FE0\u5B9E\u539F\u6587\u3002").volatile(),
  maxOutputTokens: z.number().step(1).min(128).max(16384).default(DEFAULT_CONFIG.maxOutputTokens).description("\u5355\u6B21\u4F18\u5316\u7684\u8F93\u51FA token \u4E0A\u9650\u3002\u6FC0\u8FDB\u6863 + \u4F1A\u8BDD\u5F00\u542F\u63A8\u7406\u65F6\u9700\u8981\u66F4\u5927\u989D\u5EA6\uFF1B\u88AB\u622A\u65AD\u65F6\u63D2\u4EF6\u62D2\u7EDD\u5199\u56DE\u5E76\u62A5\u9519\u3002").volatile(),
  maxInputChars: z.number().step(1).min(100).max(2e5).default(DEFAULT_CONFIG.maxInputChars).description("\u8F93\u5165\u5B57\u6570\u4E0A\u9650\uFF1A\u8D85\u9650\u62D2\u7EDD\u800C\u4E0D\u662F\u622A\u65AD\uFF08\u622A\u65AD\u4F1A\u6539\u53D8\u539F\u610F\uFF09\u3002").volatile(),
  timeoutMs: z.number().step(1).min(5e3).max(6e5).default(DEFAULT_CONFIG.timeoutMs).description("\u5355\u6B21\u4F18\u5316\u7684\u8D85\u65F6\u65F6\u95F4\uFF08\u6BEB\u79D2\uFF09\u3002").volatile(),
  systemPrompt: z.string().role("textarea").default(DEFAULT_CONFIG.systemPrompt).description("\u81EA\u5B9A\u4E49\u7CFB\u7EDF\u63D0\u793A\u8BCD\uFF1A\u7559\u7A7A\u4F7F\u7528\u5185\u7F6E\u4F18\u5316\u7B56\u7565\u3002").volatile(),
  strategyMode: z.union(["replace-default", "extend-default"]).default(DEFAULT_CONFIG.strategyMode).description("\u81EA\u5B9A\u4E49\u63D0\u793A\u8BCD\u7684\u7EC4\u5408\u65B9\u5F0F\uFF1A\u6574\u4F53\u66FF\u6362\u5185\u7F6E\u7B56\u7565\uFF0C\u6216\u8FFD\u52A0\u5728\u5185\u7F6E\u7B56\u7565\u4E4B\u540E\uFF08\u5185\u7F6E\u7684\u786C\u6027\u7EA6\u675F\u7EE7\u7EED\u751F\u6548\uFF09\u3002").volatile(),
  undoWindowMs: z.number().step(1).min(0).max(6e5).default(DEFAULT_CONFIG.undoWindowMs).description("\u201C\u64A4\u56DE\u4F18\u5316\u201D\u5165\u53E3\u7684\u4FDD\u7559\u65F6\u957F\uFF08\u6BEB\u79D2\uFF09\u3002").volatile()
});
function resolveConfig(value) {
  if (value === null || typeof value !== "object") throw new Error("prompt-polish: \u914D\u7F6E\u7F3A\u5931");
  if (!Number.isFinite(value.timeoutMs) || value.timeoutMs <= 0) throw new Error("prompt-polish: timeoutMs \u5FC5\u987B\u662F\u6B63\u6570");
  if (!Number.isFinite(value.maxInputChars) || value.maxInputChars <= 0) throw new Error("prompt-polish: maxInputChars \u5FC5\u987B\u662F\u6B63\u6570");
  return value;
}
function checkInputText(text, max) {
  const count = Array.from(text).length;
  if (text.trim() === "") return { ok: false, code: "empty", count, max };
  if (count > max) return { ok: false, code: "too-long", count, max };
  return { ok: true, count };
}

// src/enhancer.ts
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";

// src/prompts.ts
var DEFAULT_SYSTEM_PROMPT = `You are a Prompt Engineering Expert specializing in improving user prompts for a development code assistant. When given a prompt, analyze and enhance it to create a more effective version while maintaining its core purpose. The requests are being made to an AI assistant that specializes in writing code.

TASK: When given a prompt, analyze and enhance it to create a more effective version while maintaining its core purpose. The requests are being made to an AI assistant that specializes in writing code.

ANALYSIS PROCESS:
Evaluate the original prompt:
Identify the main objective
Note any ambiguities or gaps
Assess the clarity of instructions
Check for missing context
Apply these prompt engineering principles:
Write clear, specific instructions
Include necessary context
Set explicit parameters and constraints
Structure the output format
Add relevant examples
Match tone and complexity to the use case
Remove redundant information
Create the enhanced version:
Maintain the original goal
Incorporate identified improvements
Ensure clarity and completeness
Be realistic in the features to add
Do NOT request guides/how-tos unless the user asks
Do NOT ask for code snippets
Do NOT suggest specific technologies unless mentioned in the user's prompt
Do NOT explain HOW to do things, focus on WHAT
Do NOT answer questions - expand/rewrite them to be more detailed
IMPORTANT CONSTRAINTS:
1. Language matching is the highest priority - You MUST strictly respond in the exact same language as the user's input. If the user writes in Chinese, respond in Chinese; if the user writes in English, respond in English; if the user uses another language, respond in that same language. Do not mix languages unless the user's input itself mixes languages.
2. Keep the enhanced prompt concise - maximum length should be around 800 characters
FORMAT: Provide only the enhanced prompt with no additional commentary.

Example:
"A website for my dog"

Enhanced prompt:
"Design a personalized Next.js website dedicated to showcasing my dog. Include sections such as a photo gallery, a biography detailing the dog's breed, age, and personality traits, and a blog for sharing stories or updates about your dog's adventures. Add a contact form for visitors to reach out with questions or comments. Ensure the website is visually appealing and easy to navigate, with a responsive design that works well on both desktop and mobile devices."

Example:
"Convert this to a friendly tone, maintain technical details but reduce bullets in favor of narrative. Remove any jargon like 'genie router'. Use canvas"

Enhanced prompt:
"Transform the provided content into a friendly narrative format while preserving all technical details. Minimize bullet points in favor of flowing prose. Eliminate any technical jargon such as 'genie router'. Incorporate the concept of using canvas elements naturally within the narrative structure to enhance the technical explanation."`;
var USER_PROMPT_TEMPLATE = `You are a prompt enhancement assistant. Improve the user prompt while preserving its intent and language.

USER INPUT:
{input}

TASK:
Rewrite the user input into a clearer, more specific prompt for the target AI assistant.

CRITICAL PRIORITY - LANGUAGE CONSISTENCY:
1. You MUST detect the language of the user input above and write the enhanced prompt in that same language.
2. If the user writes in Chinese, the enhanced prompt MUST be entirely in Chinese.
3. If the user writes in English, the enhanced prompt MUST be entirely in English.
4. If the user writes in any other language, the enhanced prompt MUST use that exact same language.
5. If the user mixes languages, keep a natural matching mix. Do not translate the user's intent into a single language.
6. These language rules are behavior instructions only; never include language analysis or language labels in the output.

ENHANCEMENT REQUIREMENTS:
1. Return only the enhanced prompt text; do not add explanations, prefaces, markdown fences, labels, or analysis.
2. Do not include language labels or meta notes such as "User input is in Chinese" or "Response must be in Chinese".
3. Preserve the user's original intent, topic, constraints, and target output type. Do not answer the request.
4. Always make a substantive enhancement when possible: clarify the task, scope, constraints, and expected output.
5. If the original prompt is already clear, lightly polish it instead of returning it unchanged.
6. Keep the enhanced prompt complete and concise. Do not end with an unfinished list, dangling conjunction, or trailing colon.
7. Do not add unrelated requirements, unsupported facts, or unnecessary sections.

EXAMPLES:
User input (Chinese): "\u8BF7\u5E2E\u6211\u89E3\u91CA\u8FD9\u6BB5\u4EE3\u7801\u7684\u529F\u80FD"
Enhanced prompt: "\u8BF7\u89E3\u91CA\u8FD9\u6BB5\u4EE3\u7801\u7684\u4E3B\u8981\u529F\u80FD\u3001\u6267\u884C\u6D41\u7A0B\u548C\u5173\u952E\u903B\u8F91\uFF0C\u5E76\u6307\u51FA\u53EF\u80FD\u9700\u8981\u6CE8\u610F\u7684\u8FB9\u754C\u60C5\u51B5\u3002"

User input (English): "Please explain what this code does"
Enhanced prompt: "Explain what this code does, including its main purpose, key control flow, and any important edge cases."

User input (Mixed): "\u8FD9\u6BB5\u4EE3\u7801\u6709 bug\uFF0Ccan you help me fix it?"
Enhanced prompt: "\u8BF7\u5206\u6790\u8FD9\u6BB5\u4EE3\u7801\u4E2D\u7684 bug\uFF0Cexplain the root cause, and provide a minimal fix with necessary verification steps."

BAD OUTPUT EXAMPLE:
User input is in Chinese \u2192 Response must be in Chinese.
\u8BF7\u89E3\u91CA\u8FD9\u6BB5\u4EE3\u7801\u7684\u4E3B\u8981\u529F\u80FD

GOOD OUTPUT EXAMPLE:
\u8BF7\u89E3\u91CA\u8FD9\u6BB5\u4EE3\u7801\u7684\u4E3B\u8981\u529F\u80FD\u3001\u6267\u884C\u6D41\u7A0B\u548C\u5173\u952E\u903B\u8F91\uFF0C\u5E76\u6307\u51FA\u53EF\u80FD\u9700\u8981\u6CE8\u610F\u7684\u8FB9\u754C\u60C5\u51B5\u3002`;
function renderUserPrompt(text) {
  return USER_PROMPT_TEMPLATE.replace("{input}", () => text);
}
var STRENGTH_HINTS = {
  conservative: [
    "\u672C\u6B21\u529B\u5EA6\uFF1A\u4FDD\u5B88\u3002",
    "\u53EA\u505A\uFF1A\u7EA0\u9519\u3001\u7406\u987A\u8BED\u5E8F\u3001\u628A\u53E3\u8BED\u5316\u8868\u8FBE\u6539\u6210\u660E\u786E\u6307\u4EE4\u3001\u4FDD\u7559\u539F\u6709\u6BB5\u843D\u7ED3\u6784\u3002",
    "\u4E0D\u8981\u8865\u5145\u539F\u6587\u6CA1\u6709\u5199\u51FA\u7684\u6761\u4EF6\uFF0C\u4E0D\u8981\u65B0\u589E\u7AE0\u8282\uFF0C\u957F\u5EA6\u4E0D\u8D85\u8FC7\u539F\u6587\u7684\u7EA6 1.2 \u500D\u3002"
  ].join("\n"),
  balanced: [
    "\u672C\u6B21\u529B\u5EA6\uFF1A\u5747\u8861\u3002",
    "\u5728\u4FDD\u5B88\u7684\u57FA\u7840\u4E0A\uFF1A\u8865\u5168\u5B8C\u6210\u4EFB\u52A1\u6240\u5FC5\u9700\u7684\u9690\u542B\u6761\u4EF6\uFF08\u4F8B\u5982\u76EE\u6807\u6587\u4EF6\u3001\u671F\u671B\u884C\u4E3A\u3001\u9A8C\u6536\u6807\u51C6\uFF09\uFF0C",
    "\u5E76\u628A\u6A21\u7CCA\u6307\u4EE3\u66FF\u6362\u6210\u5177\u4F53\u5BF9\u8C61\uFF1B\u4ECD\u4E0D\u5F97\u5F15\u5165\u539F\u6587\u672A\u63D0\u53CA\u7684\u529F\u80FD\u3002\u957F\u5EA6\u4E0A\u9650\u6CBF\u7528\u4E0A\u6587\u7EA6 800 \u5B57\u7B26\u3002"
  ].join("\n"),
  aggressive: [
    "\u672C\u6B21\u529B\u5EA6\uFF1A\u6FC0\u8FDB\u3002",
    "\u628A\u8349\u7A3F\u91CD\u5199\u6210\u4E00\u4EFD\u5B8C\u6574\u7684\u4EFB\u52A1\u8BF4\u660E\uFF1A\u80CC\u666F\u4E0E\u76EE\u6807\u3001\u5177\u4F53\u8981\u6C42\u3001\u7EA6\u675F\u4E0E\u8FB9\u754C\u3001\u9A8C\u6536\u6807\u51C6\u3002",
    "\u5141\u8BB8\u5927\u5E45\u91CD\u7EC4\u7ED3\u6784\u4E0E\u8865\u5145\u7EC6\u8282\uFF0C\u4F46\u4ECD\u7136\u53EA\u80FD\u57FA\u4E8E\u539F\u6587\u5DF2\u6709\u4FE1\u606F\u63A8\u6F14\uFF0C\u4E0D\u5F97\u865A\u6784\u4E8B\u5B9E\u6216\u65B0\u589E\u9700\u6C42\u3002",
    "\u957F\u5EA6\u4E0A\u9650\u653E\u5BBD\u5230\u7EA6 1500 \u5B57\u7B26\uFF08\u4E0A\u6587\u300C\u7EA6 800 \u5B57\u7B26\u300D\u7684\u9650\u5236\u5728\u672C\u6B21\u4E0D\u9002\u7528\uFF0C\u5176\u4F59\u7EA6\u675F\u7167\u65E7\uFF09\u3002"
  ].join("\n")
};
function effectiveSystemPrompt(config) {
  const hint = STRENGTH_HINTS[config.strength];
  const custom = config.systemPrompt.trim();
  if (custom === "") return DEFAULT_SYSTEM_PROMPT + "\n\n" + hint;
  if (config.strategyMode === "extend-default") {
    return DEFAULT_SYSTEM_PROMPT + "\n\n" + hint + "\n\n\u9644\u52A0\u8981\u6C42\uFF1A\n" + custom;
  }
  return custom + "\n\n" + hint;
}
var ZWSP = "\u200B";
function normalizeEnhanceText(text) {
  return String(text ?? "").split(ZWSP).join("").trim();
}
function normalizeOutput(raw) {
  let text = raw.trim();
  const fenced = /^\s*```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  if (fenced !== null && fenced[1] !== void 0) text = fenced[1].trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first === '"' && last === '"' || first === "\u201C" && last === "\u201D" || first === "'" && last === "'") {
      const inner = text.slice(1, -1);
      if (inner.trim() !== "") text = inner.trim();
    }
  }
  return text;
}

// src/enhancer.ts
var OptimizeFailure = class extends Error {
  detail;
  constructor(detail) {
    super(detail.message ?? detail.code);
    this.name = "OptimizeFailure";
    this.detail = detail;
  }
};
function toOptimizeError(error) {
  if (error instanceof OptimizeFailure) return error.detail;
  const message = error instanceof Error ? error.message : String(error);
  return { code: "upstream", message };
}
async function optimizeText(llm, call) {
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, call.config.timeoutMs);
  const onCallerAbort = () => {
    if (!timedOut) callerAborted = true;
    controller.abort();
  };
  if (call.signal?.aborted === true) {
    callerAborted = true;
    controller.abort();
  } else {
    call.signal?.addEventListener("abort", onCallerAbort, { once: true });
  }
  const signal = controller.signal;
  const fail = (detail) => {
    throw new OptimizeFailure(detail);
  };
  try {
    if (signal.aborted) {
      if (timedOut) fail({ code: "timeout", message: `\u4F18\u5316\u8D85\u8FC7 ${call.config.timeoutMs} \u6BEB\u79D2\u672A\u5B8C\u6210` });
      fail({ code: "aborted" });
    }
    const messages = [
      createUserMessage({
        content: [{ type: "text", text: renderUserPrompt(call.text) }],
        source: { kind: "user" }
      })
    ];
    const options = {
      provider: call.route.provider,
      model: call.route.model,
      system: effectiveSystemPrompt(call.config),
      messages,
      temperature: call.config.temperature,
      maxTokens: call.config.maxOutputTokens,
      signal,
      ...call.route.reasoningEffort === void 0 ? {} : { reasoningEffort: call.route.reasoningEffort },
      ...call.sessionId === void 0 ? {} : { sessionId: call.sessionId }
    };
    const assembler = new BlockAssembler();
    const iterator = llm.stream(options)[Symbol.asyncIterator]();
    const abortError = () => {
      const error = new Error("dsh-prompt-polish: aborted");
      error.name = "AbortError";
      return error;
    };
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      while (true) {
        if (signal.aborted) throw abortError();
        const next = await Promise.race([iterator.next(), aborted]);
        if (next.done === true) break;
        assembler.push(next.value);
        if (next.value.type === "text-delta" && call.onDelta !== void 0) {
          try {
            call.onDelta(next.value.text);
          } catch {
          }
        }
      }
    } catch (error) {
      if (timedOut) fail({ code: "timeout", message: `\u4F18\u5316\u8D85\u8FC7 ${call.config.timeoutMs} \u6BEB\u79D2\u672A\u5B8C\u6210` });
      if (callerAborted) fail({ code: "aborted" });
      throw error;
    } finally {
      if (onAbort !== void 0 && !signal.aborted) signal.removeEventListener("abort", onAbort);
      if (signal.aborted) void iterator.return?.(void 0).catch(() => {
      });
    }
    const finish = assembler.finish;
    if (finish.kind === "error" || finish.kind === "aborted") {
      if (timedOut) fail({ code: "timeout", message: `\u4F18\u5316\u8D85\u8FC7 ${call.config.timeoutMs} \u6BEB\u79D2\u672A\u5B8C\u6210` });
      if (callerAborted) fail({ code: "aborted" });
      return fail({ code: "upstream", message: finish.failure.message });
    }
    if (finish.kind === "max-tokens") {
      return fail({ code: "upstream", message: "\u4F18\u5316\u7ED3\u679C\u5728 token \u4E0A\u9650\u5904\u88AB\u622A\u65AD\uFF0C\u8BF7\u8C03\u5927 maxOutputTokens \u6216\u7F29\u77ED\u539F\u6587" });
    }
    const raw = assembler.blocks().filter((block) => block.type === "text").map((block) => block.type === "text" ? block.text : "").join("");
    const text = normalizeOutput(raw);
    if (text.trim() === "") return fail({ code: "upstream", message: "\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u4EFB\u4F55\u6587\u672C" });
    return {
      text,
      provider: call.route.provider,
      model: call.route.model,
      elapsedMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
    call.signal?.removeEventListener("abort", onCallerAbort);
  }
}

// src/http.ts
async function readBoundedJson(req, cap) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > cap) {
      req.destroy();
      throw new Error("body too large");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? void 0 : JSON.parse(text);
}
function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

// src/protocol.ts
var OPTIMIZE_ENDPOINT = "/api/prompt-polish/optimize";

// src/index.ts
var name = "dsh-prompt-polish";
var inject = ["llm", "webServer"];
var bodyCapOf = (maxInputChars) => maxInputChars * 6 + 4096;
function routeOf(value) {
  if (value === null || value === void 0) return void 0;
  const provider = typeof value.provider === "string" ? value.provider.trim() : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (provider === "" || model === "") return void 0;
  const effort = typeof value.reasoningEffort === "string" && value.reasoningEffort !== "" ? value.reasoningEffort : void 0;
  return effort === void 0 ? { provider, model } : { provider, model, reasoningEffort: effort };
}
function sessionRouteOf(ctx, sessionId) {
  if (sessionId === void 0 || sessionId === "") return void 0;
  try {
    const session = ctx.get("sessions")?.get(sessionId);
    if (session === void 0) return void 0;
    const header = session.requestHeader;
    const epoch = typeof header === "function" ? header.call(session) : header;
    return routeOf(epoch?.config);
  } catch {
    return void 0;
  }
}
function defaultRouteOf(ctx) {
  try {
    const descriptors = ctx.get("settings")?.describe?.();
    const entry = descriptors?.find((row) => row.ns === "agent-default-model");
    return routeOf(entry?.value);
  } catch {
    return void 0;
  }
}
function readConfig(ctx, configRefs) {
  const field = (key) => {
    const raw = configRefs[key];
    if (raw !== null && typeof raw === "object" && typeof raw.get === "function") {
      return raw.get();
    }
    return raw;
  };
  const value = {
    enabled: field("enabled") ?? DEFAULT_CONFIG.enabled,
    strength: field("strength") ?? DEFAULT_CONFIG.strength,
    temperature: field("temperature") ?? DEFAULT_CONFIG.temperature,
    maxOutputTokens: field("maxOutputTokens") ?? DEFAULT_CONFIG.maxOutputTokens,
    maxInputChars: field("maxInputChars") ?? DEFAULT_CONFIG.maxInputChars,
    timeoutMs: field("timeoutMs") ?? DEFAULT_CONFIG.timeoutMs,
    systemPrompt: field("systemPrompt") ?? DEFAULT_CONFIG.systemPrompt,
    strategyMode: field("strategyMode") ?? DEFAULT_CONFIG.strategyMode,
    undoWindowMs: field("undoWindowMs") ?? DEFAULT_CONFIG.undoWindowMs
  };
  try {
    return resolveConfig(value);
  } catch (error) {
    ctx?.logger.warn("prompt-polish: \u914D\u7F6E\u89E3\u6790\u5931\u8D25\uFF0C\u672C\u6B21\u4F7F\u7528\u9ED8\u8BA4\u503C");
    ctx?.logger.warn(error);
    return { ...DEFAULT_CONFIG };
  }
}
function apply(ctx, configRefs = Config(DEFAULT_CONFIG)) {
  const readPluginConfig = () => readConfig(ctx, configRefs);
  const webServer = ctx.get("webServer");
  if (webServer === void 0) {
    ctx.logger.warn("prompt-polish: \u7EC4\u5408\u91CC\u6CA1\u6709 webServer \u670D\u52A1\uFF0C\u65E0\u6CD5\u6CE8\u518C %s\uFF08\u8BF7\u786E\u8BA4 inject \u542B webServer\uFF09", OPTIMIZE_ENDPOINT);
    return;
  }
  ctx.effect(() => webServer.register({
    kind: "exact",
    path: OPTIMIZE_ENDPOINT,
    handler: (req, res) => {
      void serve(ctx, readPluginConfig, req, res);
    }
  }), "dsh-prompt-polish: optimize route");
  ctx.logger.info("prompt-polish: \u5DF2\u6302\u8F7D %s\uFF08\u8BBE\u7F6E\u6761\u76EE %s\uFF09", OPTIMIZE_ENDPOINT, NAMESPACE);
}
async function serve(ctx, readConfig2, req, res) {
  const respond = (status, body2) => writeJson(res, status, body2);
  if (req.method !== "POST") {
    respond(405, { ok: false, error: { code: "rejected", message: "\u53EA\u63A5\u53D7 POST" } });
    return;
  }
  let pluginConfig;
  try {
    pluginConfig = readConfig2();
  } catch (error) {
    respond(500, { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } });
    return;
  }
  if (!pluginConfig.enabled) {
    respond(403, { ok: false, error: { code: "rejected", message: "\u63D0\u793A\u8BCD\u4F18\u5316\u5DF2\u5728\u8BBE\u7F6E\u4E2D\u5173\u95ED" } });
    return;
  }
  const cap = bodyCapOf(pluginConfig.maxInputChars);
  let body;
  try {
    body = await readBoundedJson(req, cap);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "body too large";
    respond(tooLarge ? 413 : 422, { ok: false, error: { code: "rejected", message: tooLarge ? "\u8BF7\u6C42\u4F53\u8FC7\u5927" : "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON" } });
    return;
  }
  const record = body;
  if (record === null || typeof record !== "object" || typeof record.text !== "string") {
    respond(422, { ok: false, error: { code: "rejected", message: "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F { text, sessionId?, selection? }" } });
    return;
  }
  const text = normalizeEnhanceText(record.text);
  const check = checkInputText(text, pluginConfig.maxInputChars);
  if (!check.ok) {
    respond(422, {
      ok: false,
      error: check.code === "empty" ? { code: "rejected", message: "\u8BF7\u5148\u8F93\u5165\u5185\u5BB9" } : { code: "rejected", message: `\u8F93\u5165\u8FC7\u957F\uFF08${check.count}/${check.max}\uFF09\uFF0C\u8BF7\u5148\u7CBE\u7B80` }
    });
    return;
  }
  const sessionId = typeof record.sessionId === "string" && record.sessionId !== "" ? record.sessionId : void 0;
  const selection = routeOf(record.selection);
  const route = selection ?? sessionRouteOf(ctx, sessionId) ?? defaultRouteOf(ctx);
  if (route === void 0) {
    respond(409, { ok: false, error: { code: "unconfigured", message: "\u65E0\u6CD5\u786E\u5B9A\u4F7F\u7528\u54EA\u4E2A\u6A21\u578B\uFF1A\u8BF7\u5148\u5728\u4F1A\u8BDD\u91CC\u9009\u62E9\u6A21\u578B" } });
    return;
  }
  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on("aborted", onClose);
  res.once("close", onClose);
  try {
    const llm = ctx.get("llm");
    if (llm === void 0) {
      respond(503, { ok: false, error: { code: "unconfigured", message: "\u5F53\u524D\u7EC4\u5408\u6CA1\u6709 llm \u670D\u52A1" } });
      return;
    }
    const value = await optimizeText(llm, {
      config: pluginConfig,
      route,
      text,
      signal: controller.signal,
      ...sessionId === void 0 ? {} : { sessionId }
    });
    respond(200, { ok: true, value });
  } catch (error) {
    const detail = toOptimizeError(error);
    const status = detail.code === "timeout" ? 504 : detail.code === "aborted" ? 499 : detail.code === "unconfigured" ? 409 : detail.code === "rejected" ? 422 : 502;
    if (detail.code === "aborted") return;
    const message = error instanceof OptimizeFailure ? detail.message : detail.message;
    respond(status, { ok: false, error: { code: detail.code, ...message === void 0 ? {} : { message } } });
  }
}
export {
  Config,
  apply,
  inject,
  name
};
