// source-hash bf46754a8435
window.__ModuleLoader__.load({
	id: "dsh-prompt-polish",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// src/client/styles.ts
var STYLE_ID = "dsh-prompt-polish-styles";
var CSS = `
.dsh-pp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsh-text-secondary, #8a8f98);
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease, transform .15s ease;
}
.dsh-pp-btn:hover:not(:disabled) {
  color: var(--dsh-accent, #4d6bfe);
  background: var(--dsh-surface-hover, rgba(127, 127, 127, .12));
}
.dsh-pp-btn:disabled { cursor: default; opacity: .45; }
/* \u4F18\u5316\u4E2D\uFF1A\u70B9\u51FB = \u53D6\u6D88\uFF0C\u7528\u5371\u9669\u8272\u63D0\u793A */
.dsh-pp-btn.is-busy { color: var(--dsh-accent, #4d6bfe); }
.dsh-pp-btn.is-busy:hover:not(:disabled) {
  color: var(--dsh-danger, #e5484d);
  background: var(--dsh-surface-hover, rgba(127, 127, 127, .12));
}
.dsh-pp-btn.is-busy .dsh-pp-icon { animation: dsh-pp-spin 1.1s linear infinite; }
/* \u5DF2\u5B8C\u6210\uFF1A\u6309\u94AE\u53D8\u6210\u64A4\u56DE\u7BAD\u5934 */
.dsh-pp-btn.is-revert { color: var(--dsh-accent, #4d6bfe); }
.dsh-pp-btn.is-error { color: var(--dsh-danger, #e5484d); }
.dsh-pp-icon { display: block; }
@keyframes dsh-pp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

// src/protocol.ts
var OPTIMIZE_ENDPOINT = "/api/prompt-polish/optimize";

// src/prompts.ts
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
var ZWSP = "\u200B";
function normalizeEnhanceText(text) {
  return String(text ?? "").split(ZWSP).join("").trim();
}

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots"];
var diagnostics = { stage: "module-loaded", slotsInjected: false, registered: false, attempts: [], mounted: [], hookChanges: 0, errors: [] };
function publish() {
  if (typeof globalThis !== "undefined") {
    ;
    globalThis.__dshPromptPolish = diagnostics;
  }
}
function report(stage, error) {
  diagnostics.stage = stage;
  if (error !== void 0) {
    diagnostics.errors.push(error instanceof Error ? error.message : String(error));
  }
  publish();
  if (error !== void 0) console.error("[prompt-polish]", stage, error);
  else console.info("[prompt-polish]", stage);
}
report("module-loaded");
var REPO_URL = true ? "https://github.com/dsh-prompt-polish" : "";
var UNDO_KEY = /* @__PURE__ */ Symbol.for("dsh-prompt-polish.undo-window");
var UNDO_FALLBACK_MS = 6e4;
var SETTINGS_NAMESPACE = "prompt-polish";
var undoListeners = /* @__PURE__ */ new Set();
function undoStore() {
  const store = globalThis;
  store[UNDO_KEY] ?? (store[UNDO_KEY] = { ms: void 0 });
  return store[UNDO_KEY];
}
function undoWindowValue() {
  return undoStore().ms;
}
function subscribeUndoWindow(listener) {
  undoListeners.add(listener);
  return () => {
    undoListeners.delete(listener);
  };
}
function publishUndoWindow(ms) {
  const store = undoStore();
  if (store.ms === ms) return;
  store.ms = ms;
  for (const listener of undoListeners) listener();
}
function adoptUndoWindow(raw) {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return false;
  publishUndoWindow(raw);
  return true;
}
var ERROR_TEXT = {
  rejected: "\u65E0\u6CD5\u4F18\u5316\u8FD9\u6761\u8F93\u5165",
  timeout: "\u4F18\u5316\u8D85\u65F6",
  aborted: "\u5DF2\u53D6\u6D88\u4F18\u5316",
  unconfigured: "\u672A\u627E\u5230\u53EF\u7528\u6A21\u578B\uFF0C\u8BF7\u5148\u5728\u4F1A\u8BDD\u91CC\u9009\u62E9\u6A21\u578B",
  upstream: "\u6A21\u578B\u8C03\u7528\u5931\u8D25",
  internal: "\u63D2\u4EF6\u5185\u90E8\u9519\u8BEF"
};
async function requestOptimize(body, signal) {
  let response;
  try {
    response = await fetch(OPTIMIZE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (signal.aborted) return { ok: false, detail: { code: "aborted" } };
    return { ok: false, detail: { code: "internal", message: error instanceof Error ? error.message : String(error) } };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, detail: { code: "internal", message: "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94" } };
  }
  if (payload.ok) return { ok: true, text: payload.value.text };
  return { ok: false, detail: payload.error };
}
function PolishButton(props) {
  const { useInput, inputActions } = props;
  const draft = useInput((state) => state.draft);
  const phase = useInput((state) => state.phase);
  const occurrences = useInput((state) => state.occurrences.length);
  const undoWindowMs = (0, import_react.useSyncExternalStore)(subscribeUndoWindow, undoWindowValue, undoWindowValue) ?? UNDO_FALLBACK_MS;
  diagnostics.hookChanges += 1;
  if (diagnostics.stage !== "rendering") report("rendering");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [undo, setUndo] = (0, import_react.useState)(void 0);
  const requestRef = (0, import_react.useRef)(0);
  const abortRef = (0, import_react.useRef)(void 0);
  (0, import_react.useEffect)(() => () => {
    requestRef.current += 1;
    abortRef.current?.abort();
  }, []);
  const draftRef = (0, import_react.useRef)(draft);
  draftRef.current = draft;
  (0, import_react.useEffect)(() => {
    if (undo !== void 0 && draft !== undo.applied) setUndo(void 0);
  }, [draft, undo]);
  const run = (0, import_react.useCallback)(() => {
    if (busy) return;
    const cleaned = normalizeEnhanceText(draft);
    if (cleaned === "") {
      setError("\u8BF7\u5148\u8F93\u5165\u5185\u5BB9");
      return;
    }
    if (occurrences > 0) {
      setError("\u542B / \u547D\u4EE4\u6216 @ \u5F15\u7528\u7684\u8F93\u5165\u6682\u4E0D\u652F\u6301\u4F18\u5316");
      return;
    }
    if (phase !== "plain") {
      setError("\u5F53\u524D\u8F93\u5165\u72B6\u6001\u4E0D\u5141\u8BB8\u4F18\u5316");
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(void 0);
    setUndo(void 0);
    const snapshot = draft;
    void requestOptimize({ text: cleaned }, controller.signal).then((result) => {
      if (requestRef.current !== requestId) return;
      setBusy(false);
      abortRef.current = void 0;
      if (!result.ok) {
        if (result.detail.code === "aborted") return;
        setError(result.detail.message ?? ERROR_TEXT[result.detail.code] ?? "\u4F18\u5316\u5931\u8D25");
        return;
      }
      if (draftRef.current !== snapshot) {
        setError("\u4F18\u5316\u671F\u95F4\u8349\u7A3F\u5DF2\u6539\u52A8\uFF0C\u7ED3\u679C\u672A\u91C7\u7528");
        return;
      }
      inputActions.setDraft(result.text);
      setUndo({ original: snapshot, applied: result.text });
    });
  }, [busy, draft, inputActions, occurrences, phase]);
  const cancel = (0, import_react.useCallback)(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = void 0;
    setBusy(false);
    setError(void 0);
  }, []);
  const restore = (0, import_react.useCallback)(() => {
    if (undo === void 0) return;
    if (draftRef.current === undo.applied) inputActions.setDraft(undo.original);
    setUndo(void 0);
  }, [inputActions, undo]);
  (0, import_react.useEffect)(() => {
    if (undo === void 0) return;
    if (undoWindowMs === void 0 || undoWindowMs <= 0) return;
    const timer = setTimeout(() => setUndo(void 0), undoWindowMs);
    return () => clearTimeout(timer);
  }, [undo, undoWindowMs]);
  const canUndo = undo !== void 0;
  const empty = normalizeEnhanceText(draft) === "";
  const disabled = !busy && !canUndo && empty;
  const title = busy ? "\u53D6\u6D88\u4F18\u5316" : canUndo ? "\u64A4\u56DE\u4F18\u5316" : error === void 0 ? "\u4F18\u5316\u63D0\u793A\u8BCD" : `\u4F18\u5316\u5931\u8D25\uFF1A${error}\uFF08\u70B9\u51FB\u91CD\u8BD5\uFF09`;
  const onClick = busy ? cancel : canUndo ? restore : run;
  const className = [
    "dsh-pp-btn",
    busy ? "is-busy" : "",
    canUndo ? "is-revert" : "",
    error !== void 0 && !busy && !canUndo ? "is-error" : ""
  ].filter((part) => part !== "").join(" ");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className,
      title,
      "aria-label": title,
      "aria-busy": busy,
      disabled,
      onClick,
      children: busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SpinnerIcon, {}) : canUndo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RevertIcon, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkIcon, {})
    }
  );
}
function SparkIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className: "dsh-pp-icon", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M12 3.2l1.9 4.6a3 3 0 0 0 1.7 1.7l4.6 1.9-4.6 1.9a3 3 0 0 0-1.7 1.7L12 19.6l-1.9-4.6a3 3 0 0 0-1.7-1.7L3.8 11.4l4.6-1.9a3 3 0 0 0 1.7-1.7L12 3.2z",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18.5 3.5l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7z", fill: "currentColor" })
  ] });
}
function SpinnerIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className: "dsh-pp-icon", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "8", stroke: "currentColor", strokeWidth: "1.8", opacity: "0.25" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 12a8 8 0 0 0-8-8", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" })
  ] });
}
function RevertIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className: "dsh-pp-icon", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M4 9h9.5a5 5 0 0 1 0 10H8",
        stroke: "currentColor",
        strokeWidth: "1.7",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7.5 5.5L4 9l3.5 3.5", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });
}
function apply(ctx) {
  try {
    applyInner(ctx);
  } catch (error) {
    report("apply-threw", error);
  }
}
function applyInner(ctx) {
  try {
    ensureStyles();
    report("styles-ready");
  } catch (error) {
    report("styles-failed", error);
  }
  ctx.inject(["settingsScope"], (scopeCtx) => {
    try {
      const settings = scopeCtx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
      if (!adoptUndoWindow(settings.getSnapshot().value?.undoWindowMs)) publishUndoWindow(UNDO_FALLBACK_MS);
      const stop = settings.subscribe(() => {
        adoptUndoWindow(settings.getSnapshot().value?.undoWindowMs);
      });
      ctx.effect(() => stop, "dsh-prompt-polish: undo-window mirror");
    } catch (error) {
      report("settings-mirror-failed", error);
      publishUndoWindow(UNDO_FALLBACK_MS);
    }
  });
  ctx.inject(["slots"], (slotsCtx) => {
    try {
      diagnostics.slotsInjected = true;
      report("slots-injected");
      const scope = slotsCtx;
      diagnostics.services = Object.keys(scope);
      const readService = (name) => {
        try {
          const direct = scope[name];
          if (direct !== void 0 && direct !== null) return direct;
        } catch (error) {
          diagnostics.errors.push("read:" + name + ":" + (error instanceof Error ? error.message : String(error)));
        }
        try {
          const viaGet = typeof scope.get === "function" ? scope.get(name) : void 0;
          if (viaGet !== void 0 && viaGet !== null) {
            diagnostics.optionalVia = name;
            return viaGet;
          }
        } catch (error) {
          diagnostics.errors.push("get:" + name + ":" + (error instanceof Error ? error.message : String(error)));
        }
        return void 0;
      };
      const slots = readService("slots");
      if (slots === void 0) {
        report("slots-service-missing");
        return;
      }
      diagnostics.slotsShape = typeof slots.inject + "/" + typeof slots.register;
      if (typeof slots.inject !== "function" || typeof slots.register !== "function") {
        report("slots-service-unusable");
        return;
      }
      const models = readService("modelDirectories");
      const optionsOf = (slot, id) => ({
        name: slot,
        id,
        order: 10
      });
      if (REPO_URL === "") {
        console.info("[prompt-polish] dev build: repository URL was not stamped into the bundle");
      }
      const CANDIDATES = [
        ["conversation.input.right", "prompt-polish-right"],
        ["conversation.input.left", "prompt-polish-left"],
        ["conversation.input.plan", "prompt-polish-plan"],
        ["conversation.input.dock", "prompt-polish-dock"]
      ];
      report("candidates:" + CANDIDATES.map(([slot]) => slot).join(","));
      const cleanups = [];
      let cancelled = false;
      let index = 0;
      let timer;
      const arm = (slot, id) => {
        const attempt = () => {
          try {
            const disposer = slots.register(optionsOf(slot, id), PolishButton);
            diagnostics.mounted.push(slot);
            diagnostics.registered = true;
            if (diagnostics.slot === void 0) diagnostics.slot = slot;
            report("registered:" + slot);
            return typeof disposer === "function" ? disposer : () => {
            };
          } catch (error) {
            diagnostics.attempts.push(slot + ":fail:" + (error instanceof Error ? error.message : String(error)));
            report("registration-failed:" + slot, error);
            return () => {
            };
          }
        };
        try {
          const cleanup = slots.inject(slot, attempt);
          if (typeof cleanup === "function") cleanups.push(cleanup);
        } catch (error) {
          diagnostics.attempts.push(slot + ":inject-threw:" + (error instanceof Error ? error.message : String(error)));
          report("inject-failed:" + slot, error);
        }
      };
      const tryNext = () => {
        if (cancelled || diagnostics.registered) return;
        const candidate = CANDIDATES[index];
        index += 1;
        if (candidate === void 0) {
          report("no-slot-available");
          return;
        }
        arm(candidate[0], candidate[1]);
        timer = setTimeout(tryNext, 1500);
      };
      tryNext();
      return () => {
        cancelled = true;
        if (timer !== void 0) clearTimeout(timer);
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
          }
        }
      };
    } catch (error) {
      report("slots-callback-threw", error);
      return void 0;
    }
  });
}

		return module.exports;
	}
});

