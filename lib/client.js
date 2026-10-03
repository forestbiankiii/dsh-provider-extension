window.__ModuleLoader__.load({id:"dsh-provider-extension",factory:(require)=>{var module={exports:{}};var exports=module.exports;
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

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  AntigravityController: () => AntigravityController,
  CodexAccountsController: () => CodexAccountsController,
  NS: () => NS,
  OpencodeController: () => OpencodeController,
  ProviderPanel: () => ProviderPanel,
  ProviderSettings: () => ProviderSettings,
  accentFor: () => accentFor,
  activeGroup: () => activeGroup,
  apply: () => apply,
  decodeModels: () => decodeModels,
  decodeQuota: () => decodeQuota,
  decodeStatus: () => decodeStatus2,
  effortIndex: () => effortIndex,
  inject: () => inject,
  isAntigravityProvider: () => isAntigravityProvider,
  isCodexProvider: () => isCodexProvider,
  isCurrentModel: () => isCurrentModel,
  isOpencodeProvider: () => isOpencodeProvider,
  maskedEmail: () => maskedEmail,
  restingEffort: () => restingEffort,
  selectionForRow: () => selectionForRow
});
module.exports = __toCommonJS(index_exports);

// src/client/ProviderPanel.tsx
var import_react = require("react");

// src/client/store.ts
function createLocalStore(initial) {
  let value = initial;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (mutator) => {
      const draft = { ...value };
      mutator(draft);
      value = draft;
      for (const listener of [...listeners]) listener();
    },
    set: (next) => {
      value = next;
      for (const listener of [...listeners]) listener();
    }
  };
}
function failureMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  return value;
}

// src/client/selection.ts
var FAMILY_ACCENTS = [
  ["astra", "color-mix(in srgb, var(--dsw-alias-label-primary) 72%, var(--dsw-alias-label-secondary))"],
  ["sol", "var(--dsw-alias-state-error-primary)"],
  ["terra", "var(--dsw-alias-state-warn-primary)"],
  ["luna", "var(--dsw-alias-state-business-primary)"]
];
var PALETTE = [
  "var(--dsw-alias-brand-primary)",
  "var(--dsw-alias-label-secondary)",
  "var(--dsw-alias-state-success-primary)",
  "var(--dsw-alias-state-warn-primary)"
];
function accentFor(modelId, index) {
  const key = modelId.toLowerCase();
  for (const [family, accent] of FAMILY_ACCENTS) if (key.includes(family)) return accent;
  return PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? "currentColor";
}
function assertSelectionSucceeded(result) {
  if (typeof result !== "object" || result === null || !("ok" in result) || result.ok !== false) return;
  const error = "error" in result ? result.error : void 0;
  if (typeof error === "object" && error !== null && "message" in error) {
    const code = "code" in error ? `${String(error.code)}: ` : "";
    throw new Error(`${code}${String(error.message)}`);
  }
  throw new Error("Model selection was rejected");
}
function sameSelection(a, b) {
  return a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
}
function effortIndex(model, effortId) {
  if (effortId === void 0) return -1;
  return model.reasoning?.efforts.findIndex((effort) => effort.id === effortId) ?? -1;
}
function restingEffort(model) {
  const effort = model.reasoning?.defaultEffort;
  return effortIndex(model, effort) >= 0 ? effort : void 0;
}
function resolveModelEffort(model, rememberedEffort) {
  if (rememberedEffort !== void 0 && effortIndex(model, rememberedEffort) >= 0) {
    return rememberedEffort;
  }
  return restingEffort(model);
}
function isCurrentModel(current, provider, model) {
  return current?.provider === provider && current.model === model.id;
}
function selectionForRow(model, provider, effortId) {
  const supportedEffort = effortIndex(model, effortId) >= 0 ? effortId : void 0;
  return {
    provider,
    model: model.id,
    ...supportedEffort === void 0 ? {} : { reasoningEffort: supportedEffort }
  };
}
function activeGroup(state) {
  return state.groups.find((group) => group.id === state.current?.provider) ?? state.groups[0];
}
var DISABLED_MODELS_STORAGE_KEY = "dsh-provider-extension:disabled-models";
var ACCOUNT_DISABLED_MODELS_STORAGE_KEY = "dsh-provider-extension:account-disabled-models";
var CUSTOM_ACCOUNT_LABELS_STORAGE_KEY = "dsh-provider-extension:custom-account-labels";
var MODELS_VISIBILITY_EVENT = "dsh-provider-extension:models-visibility-changed";
function loadCustomAccountLabels() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(CUSTOM_ACCOUNT_LABELS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
function saveCustomAccountLabel(id, email, label) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const map = loadCustomAccountLabels();
      map[id] = label;
      if (email) map[email] = label;
      window.localStorage.setItem(CUSTOM_ACCOUNT_LABELS_STORAGE_KEY, JSON.stringify(map));
      window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT));
    }
  } catch {
  }
}
function getCustomAccountLabel(id, email) {
  const map = loadCustomAccountLabels();
  return map[id] ?? (email ? map[email] : void 0);
}
function loadAccountDisabledModels() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(ACCOUNT_DISABLED_MODELS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
function saveAccountDisabledModels(map) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ACCOUNT_DISABLED_MODELS_STORAGE_KEY, JSON.stringify(map));
      window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT));
    }
  } catch {
  }
}
function getDisabledModelsForAccount(accountId, email) {
  const map = loadAccountDisabledModels();
  if (accountId && Array.isArray(map[accountId])) {
    return new Set(map[accountId]);
  }
  if (email && Array.isArray(map[email])) {
    return new Set(map[email]);
  }
  return loadDisabledModels();
}
function loadDisabledModels() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(DISABLED_MODELS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    }
  } catch {
  }
  return /* @__PURE__ */ new Set();
}
function saveDisabledModels(disabled) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(DISABLED_MODELS_STORAGE_KEY, JSON.stringify([...disabled]));
      window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT));
    }
  } catch {
  }
}

// src/client/providers/codex.ts
var WEEK_SECONDS = 604800;
var SHORT_WINDOW_SECONDS = 18e3;
var initialState = Object.freeze({
  status: "idle",
  accounts: [],
  error: null,
  usage: {},
  restoreFailed: false
});
var CODEX_CACHE_KEY = "dsh-provider-extension:codex-accounts-cache";
function loadCachedCodexState() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(CODEX_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.accounts) && parsed.accounts.length > 0) {
          return Object.freeze({
            status: "ready",
            accounts: parsed.accounts,
            error: null,
            usage: parsed.usage && typeof parsed.usage === "object" ? parsed.usage : {},
            restoreFailed: false
          });
        }
      }
    }
  } catch {
  }
  return initialState;
}
function saveCachedCodexState(state) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (state.status === "ready" && state.accounts.length > 0) {
        window.localStorage.setItem(CODEX_CACHE_KEY, JSON.stringify({
          accounts: state.accounts,
          usage: state.usage
        }));
      }
    }
  } catch {
  }
}
var LOADING = Object.freeze({ status: "loading" });
function decodeAccount(value) {
  const candidate = record(value);
  if (candidate === void 0) return void 0;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return void 0;
  if (typeof candidate.label !== "string" || candidate.label.length === 0) return void 0;
  if (typeof candidate.active !== "boolean") return void 0;
  const email = typeof candidate.email === "string" && candidate.email.length > 0 ? candidate.email : void 0;
  const customLabel = getCustomAccountLabel(candidate.id, email);
  const label = customLabel || candidate.label;
  return Object.freeze({
    id: candidate.id,
    label,
    active: candidate.active,
    ...email !== void 0 ? { email } : {},
    ...typeof candidate.expiresAt === "number" ? { expiresAt: candidate.expiresAt } : {},
    ...typeof candidate.planType === "string" ? { planType: candidate.planType } : { planType: "PLUS" },
    ...typeof candidate.accountId === "string" ? { accountId: candidate.accountId } : {},
    ...typeof candidate.userId === "string" ? { userId: candidate.userId } : {},
    ...typeof candidate.subscriptionUntil === "string" ? { subscriptionUntil: candidate.subscriptionUntil } : {}
  });
}
function decodeStatus(value) {
  const root = record(value);
  if (root === void 0) throw new Error("Invalid Codex account status");
  const raw = root.accounts;
  if (raw === void 0) return [];
  if (!Array.isArray(raw)) throw new Error("Invalid Codex account roster");
  const accounts = raw.map(decodeAccount);
  if (accounts.some((account) => account === void 0)) throw new Error("Invalid Codex account entry");
  return Object.freeze(accounts);
}
function decodeQuota(value) {
  const root = record(value);
  const limits = Array.isArray(root?.rateLimits) ? root.rateLimits : [];
  const described = limits.map(record).filter((limit) => limit !== void 0);
  const withWindows = described.filter((limit) => Array.isArray(limit.windows));
  const codex = withWindows.find((limit) => limit.id === "codex") ?? withWindows[0];
  const windows = Array.isArray(codex?.windows) ? codex.windows : [];
  let weeklyPercent;
  let weeklyResetsAt;
  let shortPercent;
  let shortResetsAt;
  for (const raw of windows) {
    const window2 = record(raw);
    if (window2 === void 0) continue;
    const seconds = Number(window2.windowSeconds);
    const percent = Number(window2.remainingPercent);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue;
    if (Math.abs(seconds - WEEK_SECONDS) < 60 && weeklyPercent === void 0) {
      weeklyPercent = Math.round(percent);
      if (Number.isSafeInteger(window2.resetsAt)) weeklyResetsAt = window2.resetsAt;
      continue;
    }
    if (Math.abs(seconds - SHORT_WINDOW_SECONDS) < 60 && shortPercent === void 0) {
      shortPercent = Math.round(percent);
      if (Number.isSafeInteger(window2.resetsAt)) shortResetsAt = window2.resetsAt;
    }
  }
  const resetCreditsCount = Number(record(root?.resetCredits)?.availableCount);
  const resetCredits = Number.isSafeInteger(resetCreditsCount) ? resetCreditsCount : void 0;
  return Object.freeze({
    ...weeklyPercent === void 0 ? {} : { weeklyPercent },
    ...weeklyResetsAt === void 0 ? {} : { weeklyResetsAt },
    ...shortPercent === void 0 ? {} : { shortPercent },
    ...shortResetsAt === void 0 ? {} : { shortResetsAt },
    ...resetCredits === void 0 ? {} : { resetCredits }
  });
}
async function call(rpc, endpoint, payload, timeoutMs = 1e4) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("请求超时，请检查网络或稍后重试")), timeoutMs);
  });
  try {
    const response = await Promise.race([
      rpc.call("/api", `codex-subscription/${endpoint}`, payload),
      timeoutPromise
    ]);
    if (response?.ok !== true) {
      const message = response?.error?.message;
      throw new Error(typeof message === "string" && message.length > 0 ? message : "Codex subscription service is unavailable");
    }
    return response.value;
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function readRoster(rpc, endpoint, payload) {
  return decodeStatus(await call(rpc, endpoint, payload));
}
function isCodexProvider(provider) {
  return provider !== void 0 && (provider === "openai-codex" || provider.startsWith("openai-codex-"));
}
function maskedEmail(email) {
  if (email === void 0) return void 0;
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return void 0;
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***@${email.slice(at + 1)}`;
}
var CodexAccountsController = class {
  constructor(rpc) {
    this.rpc = rpc;
  }
  rpc;
  store = createLocalStore(loadCachedCodexState());
  generation = 0;
  disposed = false;
  /** Load the roster, then read the active account's quota. */
  async load() {
    if (this.store.getSnapshot().switchingId !== void 0) return;
    const generation = ++this.generation;
    const previous = this.store.getSnapshot();
    this.store.set(Object.freeze({
      ...previous,
      status: previous.accounts.length > 0 ? "ready" : "loading",
      error: null,
      restoreFailed: false
    }));
    try {
      const accounts = await readRoster(this.rpc, "status", {});
      if (this.disposed || generation !== this.generation) return;
      const latest = this.store.getSnapshot();
      const nextState = Object.freeze({ ...latest, status: "ready", accounts, error: null });
      this.store.set(nextState);
      saveCachedCodexState(nextState);
      void this.loadUsage(generation);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      const latest = this.store.getSnapshot();
      this.store.set(Object.freeze({
        ...latest,
        status: latest.accounts.length > 0 ? "ready" : "error",
        error: failureMessage(error)
      }));
    }
  }
  /**
   * Read the active account's quota. Never changes which account is active.
   * @param generation - operation allowed to publish the result.
   */
  async loadUsage(generation = this.generation) {
    const active = this.store.getSnapshot().accounts.find((account) => account.active);
    if (active === void 0) return;
    this.setUsage(active.id, LOADING);
    try {
      const value = decodeQuota(await call(this.rpc, "usage", { force: false }));
      if (this.disposed || generation !== this.generation) return;
      this.setUsage(active.id, { status: "ready", value });
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.setUsage(active.id, { status: "error", message: failureMessage(error) });
    }
  }
  /** Wait for the Host's online catalog before a surface reads its directory. */
  async refreshModels() {
    await call(this.rpc, "preferences/models", {}, 15e3);
  }
  /** Permanently switch the active account and read its quota. */
  async select(id) {
    const current = this.store.getSnapshot();
    if (current.switchingId !== void 0) throw new Error("Another account operation is still running");
    if (!current.accounts.some((account) => account.id === id)) throw new Error("Unknown Codex account");
    if (current.accounts.find((account) => account.id === id)?.active === true) return;
    const generation = ++this.generation;
    this.store.set(Object.freeze({
      ...current,
      error: null,
      switchingId: id,
      usage: { ...current.usage, [id]: LOADING }
    }));
    try {
      await this.switchTo(id, generation);
      if (this.disposed || generation !== this.generation) return;
      const latest = this.store.getSnapshot();
      this.store.set(Object.freeze({ ...latest, status: "ready", error: null, switchingId: void 0 }));
      void this.loadUsage(generation);
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        const latest = this.store.getSnapshot();
        this.store.set(Object.freeze({ ...latest, status: "error", switchingId: void 0, error: failureMessage(error) }));
      }
      throw error;
    }
  }
  /**
   * Read one account's quota, switching to it first and restoring the previous
   * account immediately afterwards. The active account is left unchanged unless
   * the restore itself fails, which the state then reports.
   * @param id - DSH-local account identity to measure.
   */
  async readQuota(id) {
    const current = this.store.getSnapshot();
    if (current.switchingId !== void 0) throw new Error("Another account operation is still running");
    const target = current.accounts.find((account) => account.id === id);
    if (target === void 0) throw new Error("Unknown Codex account");
    if (target.active) {
      await this.loadUsage();
      return;
    }
    const origin = current.accounts.find((account) => account.active)?.id;
    const generation = ++this.generation;
    this.store.set(Object.freeze({
      ...current,
      error: null,
      restoreFailed: false,
      switchingId: id,
      usage: { ...current.usage, [id]: LOADING }
    }));
    let failure;
    try {
      await this.switchTo(id, generation);
      const value = decodeQuota(await call(this.rpc, "usage", { force: false }));
      if (!this.disposed && generation === this.generation) this.setUsage(id, { status: "ready", value });
    } catch (error) {
      failure = error;
      if (!this.disposed && generation === this.generation) {
        this.setUsage(id, { status: "error", message: failureMessage(error) });
      }
    } finally {
      let restored = origin === void 0;
      if (origin !== void 0) {
        try {
          await this.switchTo(origin, generation);
          restored = true;
        } catch {
          restored = false;
        }
      }
      if (!this.disposed) {
        const latest = this.store.getSnapshot();
        this.store.set(Object.freeze({ ...latest, switchingId: void 0, restoreFailed: !restored }));
      }
    }
    if (failure !== void 0) throw failure;
  }
  /** Start interactive ChatGPT OAuth login and wait for completion. */
  async login() {
    const current = this.store.getSnapshot();
    if (current.loginPending) return;
    this.store.set(Object.freeze({ ...current, loginPending: true, error: null }));
    try {
      const nextIndex = current.accounts.length + 1;
      const startResult = await call(this.rpc, "login/start", {
        method: "browser",
        openExternal: true,
        label: `Account ${nextIndex}`
      });
      const flowId = startResult?.id;
      if (typeof flowId !== "string") throw new Error("Could not start ChatGPT login");
      if (typeof startResult.authUrl === "string" && startResult.externalOpened !== true) {
        try {
          window.open(startResult.authUrl, "_blank");
        } catch {
        }
      }
      const latest = this.store.getSnapshot();
      this.store.set(Object.freeze({ ...latest, loginPending: true, loginUrl: startResult.authUrl }));
      const poll = async () => {
        if (this.disposed) return;
        try {
          const status = await call(this.rpc, "login/status", { id: flowId });
          if (status?.authenticated === true) {
            window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
            await this.load();
            const s = this.store.getSnapshot();
            this.store.set(Object.freeze({ ...s, loginPending: false, loginUrl: void 0 }));
            return;
          }
          if (status?.phase === "cancelled" || status?.phase === "failed" || status?.phase === "expired") {
            const s = this.store.getSnapshot();
            this.store.set(Object.freeze({
              ...s,
              loginPending: false,
              loginUrl: void 0,
              error: status.error ?? status.phase
            }));
            return;
          }
        } catch {
        }
        setTimeout(poll, 1500);
      };
      setTimeout(poll, 1500);
    } catch (error) {
      const latest = this.store.getSnapshot();
      this.store.set(Object.freeze({ ...latest, loginPending: false, loginUrl: void 0, error: failureMessage(error) }));
    }
  }
  /** Rename one saved ChatGPT account. */
  async renameAccount(id, label) {
    const current = this.store.getSnapshot();
    const target = current.accounts.find((acc) => acc.id === id);
    saveCustomAccountLabel(id, target?.email, label);
    const nextAccounts = current.accounts.map((acc) => acc.id === id ? { ...acc, label } : acc);
    const nextState = Object.freeze({ ...current, accounts: nextAccounts });
    this.store.set(nextState);
    saveCachedCodexState(nextState);
    try {
      const accounts = await readRoster(this.rpc, "account/rename", { id, label });
      if (!this.disposed) {
        this.store.set(Object.freeze({ ...this.store.getSnapshot(), accounts }));
      }
    } catch {
    }
  }
  /** Consume one quota reset credit for an account. */
  async consumeResetCredit(id) {
    try {
      const prepare = await call(this.rpc, "reset-credit/prepare", {});
      if (prepare?.challengeId) {
        await call(this.rpc, "reset-credit/consume", {
          challengeId: prepare.challengeId,
          acknowledged: true
        });
        await this.readQuota(id);
      }
    } catch (error) {
      this.setUsage(id, { status: "error", message: failureMessage(error) });
      throw error;
    }
  }
  /** Remove one saved ChatGPT account. */
  async removeAccount(id) {
    const current = this.store.getSnapshot();
    const nextAccounts = current.accounts.filter((account) => account.id !== id);
    const nextUsage = { ...current.usage };
    delete nextUsage[id];
    const nextState = Object.freeze({
      ...current,
      switchingId: void 0,
      accounts: nextAccounts,
      usage: nextUsage,
      error: null
    });
    this.store.set(nextState);
    saveCachedCodexState(nextState);
    try {
      await call(this.rpc, "account/remove", { id });
      window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
      const accounts = await readRoster(this.rpc, "status", {});
      if (!this.disposed) {
        const latest = this.store.getSnapshot();
        const updated = Object.freeze({ ...latest, accounts });
        this.store.set(updated);
        saveCachedCodexState(updated);
      }
    } catch (error) {
      if (!this.disposed) {
        this.store.set(Object.freeze({ ...current, switchingId: void 0, error: failureMessage(error) }));
      }
      throw error;
    }
  }
  /** Reload the roster only when a surface already asked for it. */
  invalidate() {
    if (this.store.getSnapshot().status === "idle") return;
    void this.load();
  }
  dispose() {
    this.disposed = true;
    ++this.generation;
  }
  async switchTo(id, generation) {
    const accounts = await readRoster(this.rpc, "account/select", { id });
    if (this.disposed || generation !== this.generation) return;
    const latest = this.store.getSnapshot();
    this.store.set(Object.freeze({ ...latest, accounts }));
  }
  setUsage(id, value) {
    const latest = this.store.getSnapshot();
    const nextState = Object.freeze({ ...latest, usage: { ...latest.usage, [id]: value } });
    this.store.set(nextState);
    saveCachedCodexState(nextState);
  }
};

// src/client/providers/antigravity.ts
var ANTIGRAVITY_PROVIDER = "google-antigravity";
var ANTIGRAVITY_PACKAGE = "dsh-antigravity-auth";
var ANTIGRAVITY_LOGIN_PHASES = [
  "idle",
  "pending",
  "success",
  "cancelled",
  "expired",
  "port-conflict",
  "failed"
];
var initialState2 = Object.freeze({
  status: "idle",
  accounts: [],
  usage: {}
});
var ANTIGRAVITY_CACHE_KEY = "dsh-provider-extension:antigravity-state-cache";
function loadCachedAntigravityState() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(ANTIGRAVITY_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.view?.login?.configured) {
          return Object.freeze({
            status: "ready",
            view: parsed.view,
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            models: parsed.models,
            usage: parsed.usage && typeof parsed.usage === "object" ? parsed.usage : {}
          });
        }
      }
    }
  } catch {
  }
  return initialState2;
}
function saveCachedAntigravityState(state) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (state.status === "ready" && state.view?.login?.configured) {
        window.localStorage.setItem(ANTIGRAVITY_CACHE_KEY, JSON.stringify({
          view: state.view,
          accounts: state.accounts,
          models: state.models,
          usage: state.usage
        }));
      } else if (state.view?.login?.configured !== true) {
        window.localStorage.removeItem(ANTIGRAVITY_CACHE_KEY);
      }
    }
  } catch {
  }
}
function isAntigravityProvider(provider) {
  return provider !== void 0 && (provider === ANTIGRAVITY_PROVIDER || provider.startsWith(`${ANTIGRAVITY_PROVIDER}-`));
}
function decodePhase(value) {
  return typeof value === "string" && ANTIGRAVITY_LOGIN_PHASES.includes(value) ? value : void 0;
}
function decodeLoginStatus(value) {
  const candidate = record(value);
  if (candidate === void 0) return void 0;
  const phase = decodePhase(candidate.phase);
  if (phase === void 0) return void 0;
  if (typeof candidate.configured !== "boolean" || typeof candidate.projectAvailable !== "boolean") return void 0;
  return Object.freeze({
    phase,
    configured: candidate.configured,
    projectAvailable: candidate.projectAvailable,
    ...typeof candidate.authorizationUrl === "string" ? { authorizationUrl: candidate.authorizationUrl } : {},
    ...typeof candidate.expiresAt === "string" ? { expiresAt: candidate.expiresAt } : {},
    ...typeof candidate.maskedEmail === "string" ? { maskedEmail: candidate.maskedEmail } : {},
    ...typeof candidate.errorCode === "string" ? { errorCode: candidate.errorCode } : {}
  });
}
function decodeStatus2(value) {
  const root = record(value);
  const status = record(root?.status);
  if (status === void 0) return void 0;
  if (status.pluginId !== ANTIGRAVITY_PACKAGE && status.pluginId !== "dsh-provider-extension") return void 0;
  const login = decodeLoginStatus(status.login);
  if (login === void 0) return void 0;
  return Object.freeze({ riskAcknowledged: status.riskAcknowledged === true, login });
}
function decodeAccounts(value) {
  const root = record(value);
  if (!root || !Array.isArray(root.accounts)) return [];
  const accounts = [];
  for (const raw of root.accounts) {
    const acc = record(raw);
    if (!acc || typeof acc.id !== "string") continue;
    const email = typeof acc.email === "string" ? acc.email : void 0;
    const customLabel = getCustomAccountLabel(acc.id, email);
    const baseLabel = typeof acc.label === "string" ? acc.label : email || "Google Account";
    accounts.push(Object.freeze({
      id: acc.id,
      label: customLabel || baseLabel,
      ...email !== void 0 ? { email } : {},
      ...typeof acc.tier === "string" && acc.tier.length > 0 ? { tier: acc.tier } : {},
      active: Boolean(acc.active)
    }));
  }
  return Object.freeze(accounts);
}
function decodeAntigravityQuota(value) {
  const root = record(value);
  if (!root || typeof root.state !== "string") return void 0;
  const groups = [];
  if (Array.isArray(root.groups)) {
    for (const g of root.groups) {
      const groupRec = record(g);
      if (!groupRec) continue;
      const groupName = groupRec.group === "gemini" || groupRec.group === "non-gemini" ? groupRec.group : void 0;
      if (!groupName) continue;
      const windows = [];
      if (Array.isArray(groupRec.windows)) {
        for (const w of groupRec.windows) {
          const wRec = record(w);
          if (!wRec) continue;
          const winName = wRec.window === "5h" || wRec.window === "weekly" ? wRec.window : void 0;
          const fraction = typeof wRec.remainingFraction === "number" ? wRec.remainingFraction : void 0;
          if (!winName || fraction === void 0) continue;
          windows.push(Object.freeze({
            window: winName,
            remainingFraction: fraction,
            resetTime: String(wRec.resetTime || "")
          }));
        }
      }
      groups.push(Object.freeze({
        group: groupName,
        modelCount: Number(groupRec.modelCount) || 0,
        windows: Object.freeze(windows)
      }));
    }
  }
  return Object.freeze({
    state: root.state,
    ...typeof root.checkedAt === "string" ? { checkedAt: root.checkedAt } : {},
    groups: Object.freeze(groups)
  });
}
function decodeModels(value) {
  const root = record(value);
  if (root === void 0) return void 0;
  const states = ["snapshot", "live-available", "refresh-failed", "protocol-drift"];
  const state = typeof root.state === "string" && states.includes(root.state) ? root.state : void 0;
  if (state === void 0 || !Array.isArray(root.models)) return void 0;
  const models = [];
  for (const raw of root.models) {
    const model = record(raw);
    if (model === void 0) continue;
    if (typeof model.id !== "string" || model.id.length === 0) continue;
    if (typeof model.name !== "string" || model.name.length === 0) continue;
    const availability = model.state === "snapshot" || model.state === "live-available" || model.state === "unavailable" ? model.state : void 0;
    if (availability === void 0) continue;
    models.push(Object.freeze({ id: model.id, name: model.name, state: availability }));
  }
  return Object.freeze({
    state,
    models: Object.freeze(models),
    ...typeof root.checkedAt === "string" ? { checkedAt: root.checkedAt } : {}
  });
}
var AntigravityController = class {
  constructor(rpc) {
    this.rpc = rpc;
  }
  rpc;
  store = createLocalStore(loadCachedAntigravityState());
  generation = 0;
  disposed = false;
  /** Read status, accounts, models, and quota. */
  async load() {
    const generation = ++this.generation;
    const current = this.store.getSnapshot();
    this.patch({
      status: current.view?.login?.configured ? "ready" : "checking",
      error: void 0,
      modelsRefreshing: false
    });
    try {
      const rawStatus = await this.callRaw("status", {});
      const status = decodeStatus2(rawStatus);
      const accounts = decodeAccounts(rawStatus);
      if (this.disposed || generation !== this.generation) return;
      if (status === void 0) throw new Error("Status envelope failed validation");
      const models = status.login.configured ? await this.readModels().catch(() => void 0) : void 0;
      if (this.disposed || generation !== this.generation) return;
      const nextState = Object.freeze({
        status: "ready",
        view: status,
        accounts: accounts.length > 0 ? accounts : status.login.configured ? [{
          id: status.login.maskedEmail || "default",
          label: status.login.maskedEmail || "Google Account",
          email: status.login.maskedEmail,
          active: true
        }] : [],
        error: void 0,
        loginPending: status.login.phase === "pending",
        ...models === void 0 ? {} : { models },
        ...current.usage === void 0 ? {} : { usage: current.usage }
      });
      this.store.set(nextState);
      saveCachedAntigravityState(nextState);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.patch({
        status: current.view?.login?.configured ? "ready" : isAbsent(error) ? "absent" : "error",
        error: failureMessage(error)
      });
    }
  }
  /** Force-refresh the companion's live model availability catalog. */
  async refreshModels() {
    const current = this.store.getSnapshot();
    if (current.modelsRefreshing || current.view?.login.configured !== true) return;
    const generation = this.generation;
    this.patch({ modelsRefreshing: true, error: void 0 });
    try {
      const models = await this.readModels(true);
      if (this.disposed || generation !== this.generation) return;
      this.patch({ models, modelsRefreshing: false, error: void 0 });
      saveCachedAntigravityState(this.store.getSnapshot());
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.patch({ modelsRefreshing: false, error: failureMessage(error) });
      throw error;
    }
  }
  /** Switch active Google account by id. */
  async selectAccount(id) {
    this.patch({ switchingId: id, error: void 0 });
    try {
      const raw = await this.callRaw("account/select", { id });
      const accounts = decodeAccounts(raw);
      this.patch({ accounts, switchingId: void 0 });
      await this.load();
    } catch (error) {
      this.patch({ switchingId: void 0, error: failureMessage(error) });
      throw error;
    }
  }
  /** Remove one saved Google account. */
  async removeAccount(id) {
    this.patch({ switchingId: id, error: void 0 });
    try {
      const raw = await this.callRaw("account/remove", { id });
      const accounts = decodeAccounts(raw);
      this.patch({ accounts, switchingId: void 0 });
      await this.load();
    } catch (error) {
      this.patch({ switchingId: void 0, error: failureMessage(error) });
      throw error;
    }
  }
  /** Update label or tier of one saved Google account. */
  async updateAccount(id, patch) {
    try {
      const raw = await this.callRaw("account/update", { id, ...patch });
      const accounts = decodeAccounts(raw);
      this.patch({ accounts });
      saveCachedAntigravityState(this.store.getSnapshot());
    } catch (error) {
      this.patch({ error: failureMessage(error) });
      throw error;
    }
  }
  /** Rename one saved Google account. */
  async renameAccount(id, label) {
    const current = this.store.getSnapshot();
    const target = current.accounts.find((a) => a.id === id);
    saveCustomAccountLabel(id, target?.email, label);
    try {
      const raw = await this.callRaw("account/rename", { id, label });
      const accounts = decodeAccounts(raw);
      this.patch({ accounts });
      saveCachedAntigravityState(this.store.getSnapshot());
    } catch {
      const nextAccounts = current.accounts.map((a) => a.id === id ? { ...a, label } : a);
      this.patch({ accounts: nextAccounts });
      saveCachedAntigravityState(this.store.getSnapshot());
    }
  }
  /** Read active or specified account quota/balance. */
  async readQuota(id) {
    const current = this.store.getSnapshot();
    const active = current.accounts.find((a) => a.active) ?? current.accounts[0];
    const targetId = id ?? active?.id ?? "default";
    const isDifferent = active !== void 0 && active.id !== targetId;
    try {
      if (isDifferent) {
        await this.callRaw("account/select", { id: targetId });
      }
      const raw = await this.callRaw("usage", { force: true });
      const decoded = decodeAntigravityQuota(raw);
      if (decoded) {
        const latest = this.store.getSnapshot();
        const updatedUsage = Object.freeze({ ...latest.usage, [targetId]: decoded });
        this.patch({ usage: updatedUsage });
        saveCachedAntigravityState(this.store.getSnapshot());
      }
    } catch {
    } finally {
      if (isDifferent && active) {
        await this.callRaw("account/select", { id: active.id }).catch(() => {
        });
      }
    }
  }
  /** Acknowledge the upstream risk notice and start the Google OAuth flow. */
  async login() {
    const generation = ++this.generation;
    this.patch({ busy: true, error: void 0, modelsRefreshing: false });
    try {
      if (this.store.getSnapshot().view?.riskAcknowledged !== true) await this.callRaw("acknowledge-risk", { acknowledge: true });
      await this.callRaw("login", {});
      if (this.disposed || generation !== this.generation) return;
      this.patch({ busy: false });
      await this.load();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.patch({ busy: false, error: failureMessage(error) });
      throw error;
    }
  }
  /** Drop the stored Antigravity credential. */
  async logout() {
    const generation = ++this.generation;
    this.patch({ busy: true, error: void 0, modelsRefreshing: false });
    try {
      await this.callRaw("logout", {});
      if (this.disposed || generation !== this.generation) return;
      this.patch({ busy: false, models: void 0, loginPending: false, accounts: [], usage: {} });
      saveCachedAntigravityState(initialState2);
      await this.load();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.patch({ busy: false, error: failureMessage(error) });
      throw error;
    }
  }
  invalidate() {
    if (this.store.getSnapshot().status === "idle") return;
    void this.load();
  }
  dispose() {
    this.disposed = true;
    ++this.generation;
  }
  async readStatus() {
    const envelope = await this.callRaw("status", {});
    const decoded = decodeStatus2(envelope);
    if (decoded === void 0) throw new Error("Status envelope failed validation");
    return decoded;
  }
  async readModels(force = false) {
    const envelope = await this.callRaw("models", force ? { force: true } : {});
    const decoded = decodeModels(envelope);
    if (decoded === void 0) throw new Error("Model catalog envelope failed validation");
    return decoded;
  }
  patch(slice) {
    const latest = this.store.getSnapshot();
    this.store.set(Object.freeze({ ...latest, ...slice }));
  }
  async callRaw(endpoint, payload) {
    const response = await this.rpc.call("/api", `antigravity-auth/${endpoint}`, payload);
    if (response?.ok !== true) {
      const message = response?.error?.message;
      throw new Error(typeof message === "string" && message.length > 0 ? message : "Antigravity service error");
    }
    return response.value;
  }
};
function isAbsent(error) {
  if (error instanceof Error) {
    return error.message.includes("404") || error.message.includes("not found") || error.message.includes("unregistered") || error.message.includes("unavailable") || error.message.includes("unknown endpoint");
  }
  return false;
}

// src/client/providers/opencode.ts
var DEFAULT_OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
var OPENCODE_API_KEY_STORAGE_KEY = "dsh-provider-extension:opencode-api-key";
var OPENCODE_BASE_URL_STORAGE_KEY = "dsh-provider-extension:opencode-base-url";
var DEFAULT_OPENCODE_MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
  { id: "deepseek-v4.1-coder", name: "DeepSeek V4.1 Coder" },
  { id: "deepseek-r1", name: "DeepSeek R1" },
  { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "o1", name: "o1" },
  { id: "o3-mini", name: "o3-mini" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }
];
function isOpencodeProvider(provider) {
  return provider !== void 0 && (provider === "opencode-go" || provider === "opencode" || provider.startsWith("opencode"));
}
var OpencodeController = class {
  store = createLocalStore({
    apiKey: "",
    baseURL: DEFAULT_OPENCODE_BASE_URL,
    configured: false,
    usageStatus: "idle",
    models: DEFAULT_OPENCODE_MODELS,
    modelsStatus: "idle"
  });
  disposed = false;
  rpc;
  constructor() {
    this.initFromStorage();
  }
  setRpc(rpc) {
    this.rpc = rpc;
    void this.fetchConfigFromHost();
  }
  async fetchConfigFromHost() {
    if (!this.rpc) return;
    try {
      const res = await this.rpc.call("/api", "opencode/config/get", {});
      if (res?.ok && res?.value) {
        const hostKey = res.value.apiKey || "";
        const hostURL = res.value.baseURL || DEFAULT_OPENCODE_BASE_URL;
        const currentKey = this.store.getSnapshot().apiKey;
        const effectiveKey = hostKey || currentKey;
        const isConfigured = Boolean(res.value.configured || effectiveKey.trim().length > 0);
        if (effectiveKey && typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(OPENCODE_API_KEY_STORAGE_KEY, effectiveKey);
          window.localStorage.setItem(OPENCODE_BASE_URL_STORAGE_KEY, hostURL);
        }
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          apiKey: effectiveKey,
          baseURL: hostURL,
          configured: isConfigured
        }));
        if (!hostKey && currentKey) {
          void this.syncToHost(currentKey, hostURL);
        }
        if (isConfigured) {
          void this.readUsage();
          void this.refreshModels();
        }
      }
    } catch {
    }
  }
  async syncToHost(apiKey, baseURL = DEFAULT_OPENCODE_BASE_URL) {
    if (!this.rpc) return;
    try {
      await this.rpc.call("/api", "opencode/config/save", { apiKey, baseURL });
    } catch {
    }
  }
  dispose() {
    this.disposed = true;
  }
  initFromStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const apiKey = window.localStorage.getItem(OPENCODE_API_KEY_STORAGE_KEY) || "";
        const baseURL = window.localStorage.getItem(OPENCODE_BASE_URL_STORAGE_KEY) || DEFAULT_OPENCODE_BASE_URL;
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          apiKey,
          baseURL,
          configured: apiKey.trim().length > 0
        }));
        if (apiKey.trim().length > 0) {
          void this.syncToHost(apiKey.trim(), baseURL);
        }
      }
    } catch {
    }
  }
  saveConfig(apiKey, baseURL = DEFAULT_OPENCODE_BASE_URL) {
    const trimmedKey = apiKey.trim();
    const trimmedURL = (baseURL.trim() || DEFAULT_OPENCODE_BASE_URL).replace(/\/+$/, "");
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(OPENCODE_API_KEY_STORAGE_KEY, trimmedKey);
        window.localStorage.setItem(OPENCODE_BASE_URL_STORAGE_KEY, trimmedURL);
      }
    } catch {
    }
    this.store.set(Object.freeze({
      ...this.store.getSnapshot(),
      apiKey: trimmedKey,
      baseURL: trimmedURL,
      configured: trimmedKey.length > 0
    }));
    void this.syncToHost(trimmedKey, trimmedURL);
    if (trimmedKey.length > 0) {
      void this.readUsage();
      void this.refreshModels();
    }
  }
  async readUsage() {
    const current = this.store.getSnapshot();
    if (!current.apiKey) return;
    this.store.set(Object.freeze({ ...current, usageStatus: "loading", usageError: void 0 }));
    try {
      const endpoint = `${current.baseURL}/usage`;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${current.apiKey}`,
          Accept: "application/json"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const usage = data && typeof data === "object" ? data.usage ?? data : void 0;
      if (!this.disposed) {
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          usage,
          usageStatus: "ready",
          usageError: void 0
        }));
      }
    } catch (err) {
      if (!this.disposed) {
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          usageStatus: "error",
          usageError: failureMessage(err)
        }));
      }
    }
  }
  async refreshModels() {
    const current = this.store.getSnapshot();
    this.store.set(Object.freeze({ ...current, modelsStatus: "loading" }));
    try {
      const endpoint = `${current.baseURL}/models`;
      const headers = { Accept: "application/json" };
      if (current.apiKey) headers["Authorization"] = `Bearer ${current.apiKey}`;
      const res = await fetch(endpoint, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        const fetched = json.data.map((item) => ({
          id: item.id || item.name,
          name: item.name || item.id,
          contextWindow: item.context_length ?? item.context_window,
          maxOutput: item.max_output ?? item.max_tokens
        }));
        if (!this.disposed) {
          this.store.set(Object.freeze({
            ...this.store.getSnapshot(),
            models: fetched,
            modelsStatus: "ready"
          }));
          return;
        }
      }
    } catch {
    }
    if (!this.disposed) {
      this.store.set(Object.freeze({
        ...this.store.getSnapshot(),
        modelsStatus: "ready"
      }));
    }
  }
};

// src/client/codex-visibility.ts
var CODEX_ENABLED_MODELS_KEY = "dsh-provider-extension:codex-enabled-models";
var LEGACY_MODELS = [
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-reserve",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "codex-auto-review"
];
function loadEnabledMap() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CODEX_ENABLED_MODELS_KEY) ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter((entry) => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string")));
    }
  } catch {
  }
  return {};
}
function codexEnabledModels(accountId, email) {
  const map = loadEnabledMap();
  const selected = (accountId ? map[accountId] : void 0) ?? (email ? map[email] : void 0);
  if (selected !== void 0) return new Set(selected);
  const legacy = loadAccountDisabledModels();
  const disabled = (accountId ? legacy[accountId] : void 0) ?? (email ? legacy[email] : void 0);
  if (!Array.isArray(disabled) || !disabled.some((id) => LEGACY_MODELS.includes(id))) return void 0;
  return new Set(LEGACY_MODELS.filter((id) => !disabled.includes(id)));
}
function saveCodexEnabledModels(accountId, email, models) {
  const map = loadEnabledMap();
  map[accountId] = [...models];
  if (email) map[email] = [...models];
  window.localStorage.setItem(CODEX_ENABLED_MODELS_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT));
}

// dsh-provider-extension-css:src/client/ProviderPanel.module.css
var cssText = '.dpe_root_5deusq{--dpe-motion-fast:.14s;--dpe-ease:cubic-bezier(.22, 1, .36, 1);--dpe-spring:cubic-bezier(.34, 1.36, .64, 1);flex:0 auto;align-items:center;gap:4px;min-width:0;display:flex;position:relative}.dpe_quotaWrapper_5deusq{flex:none;align-items:center;display:inline-flex;position:relative}.dpe_quotaTrigger_5deusq{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);height:24px;color:var(--dsw-alias-label-secondary);letter-spacing:.02em;cursor:pointer;white-space:nowrap;border-radius:12px;outline:none;flex:none;justify-content:center;align-items:center;padding:0 7px;font-size:11px;font-weight:600;line-height:22px;transition:background-color .14s,color .14s,border-color .14s,transform .14s;display:inline-flex}.dpe_quotaTrigger_5deusq:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}.dpe_quotaTrigger_5deusq:active{transform:scale(.97)}.dpe_quotaTooltip_5deusq{background:var(--dsw-alias-bg-layer-3,#1f1f1f);border:1px solid var(--dsw-alias-border-l3,#ffffff26);white-space:nowrap;pointer-events:none;z-index:200;border-radius:8px;flex-direction:column;gap:5px;min-width:170px;padding:8px 10px;animation:.12s dpe_quotaFadeIn_5deusq;display:none;position:absolute;bottom:calc(100% + 6px);left:0;box-shadow:0 4px 14px #00000073}.dpe_quotaWrapper_5deusq:hover .dpe_quotaTooltip_5deusq{display:flex}@keyframes dpe_quotaFadeIn_5deusq{0%{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}.dpe_quotaTooltipRow_5deusq{justify-content:space-between;align-items:center;gap:12px;font-size:11px;line-height:16px;display:flex}.dpe_quotaTooltipName_5deusq{color:var(--dsw-alias-label-secondary);font-weight:500}.dpe_quotaTooltipValue_5deusq{color:var(--dsw-alias-label-primary);font-weight:600}.dpe_quotaTooltipReset_5deusq{color:var(--dsw-alias-label-secondary);font-size:10px}.dpe_trigger_5deusq{width:max-content;max-width:100%;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:14px;outline:none;flex:none;align-items:center;gap:6px;padding:0 5px 0 8px;font-size:13px;font-weight:500;line-height:20px;transition:background-color .14s,color .14s,transform .14s;display:flex}.dpe_trigger_5deusq:hover:not(:disabled),.dpe_trigger_5deusq[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_trigger_5deusq:active:not(:disabled){transform:scale(.98)}.dpe_trigger_5deusq:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dpe_trigger_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_dot_5deusq{corner-shape:round;width:7px;height:7px;color:var(--dpe-accent);box-shadow:0 0 0 3px color-mix(in srgb, currentColor 10%, transparent);background:currentColor;border-radius:50%;flex:none;transition:transform .16s cubic-bezier(.22,1,.36,1)}.dpe_trigger_5deusq:hover:not(:disabled) .dpe_dot_5deusq{transform:scale(1.15)}.dpe_providerTrigger_5deusq{max-width:150px}.dpe_modelTrigger_5deusq{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);max-width:240px;color:var(--dsw-alias-label-primary);padding-inline:10px 7px}.dpe_providerLabel_5deusq,.dpe_triggerLabel_5deusq{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;overflow:hidden}.dpe_providerLabel_5deusq{color:var(--dsw-alias-label-primary)}.dpe_triggerEffort_5deusq{color:var(--dsw-alias-label-primary);white-space:nowrap;flex:none;font-weight:600}.dpe_chevron_5deusq{color:var(--dsw-alias-label-secondary);flex:none;transition:transform .16s cubic-bezier(.22,1,.36,1)}.dpe_trigger_5deusq[aria-expanded=true] .dpe_chevron_5deusq{transform:rotate(180deg)}@keyframes dpe_dpe-menu-in_5deusq{0%{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.dpe_menu_5deusq{z-index:1000;box-sizing:border-box;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:min(368px,100vw - 32px);max-height:min(560px,100vh - 96px);box-shadow:0 16px 48px color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent), inset 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);transform-origin:100% 100%;animation:dpe_dpe-menu-in_5deusq var(--dpe-motion-fast) var(--dpe-ease);scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent;border-radius:18px;flex-direction:column;padding:12px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden auto}.dpe_menu_5deusq::-webkit-scrollbar{width:8px}.dpe_menu_5deusq::-webkit-scrollbar-track{background:0 0}.dpe_menu_5deusq::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:999px}.dpe_menu_5deusq::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-dimmed)}.dpe_providerMenu_5deusq{width:min(288px,100vw - 32px)}.dpe_head_5deusq{justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;display:flex}.dpe_heading_5deusq{flex-direction:column;gap:3px;min-width:0;display:flex}.dpe_headTitle_5deusq{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}.dpe_accountCaption_5deusq{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.dpe_reload_5deusq{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;flex:none;padding:3px 8px;font-size:12px;line-height:18px;transition:background-color .14s,color .14s}.dpe_reload_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_reload_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_providerList_5deusq{flex-direction:column;gap:2px;margin-top:4px;display:flex}.dpe_providerOption_5deusq{width:100%;min-height:34px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:1px solid #0000;border-radius:10px;outline:none;justify-content:space-between;align-items:center;gap:12px;padding:6px 10px;font-size:13px;font-weight:600;line-height:20px;transition:background-color .14s,color .14s,border-color .14s;display:flex;position:relative}.dpe_providerOption_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_providerOption_5deusq:focus-visible{border-color:var(--dsw-alias-border-l3)}.dpe_providerCurrent_5deusq{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.dpe_providerOption_5deusq.dpe_providerCurrent_5deusq{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}.dpe_providerCount_5deusq{min-width:20px;color:var(--dsw-alias-label-secondary);text-align:right;font-variant-numeric:tabular-nums;flex:none;font-size:11px;font-weight:400}.dpe_providerFamily_5deusq{padding:6px 0 2px}.dpe_providerFamily_5deusq+.dpe_providerFamily_5deusq{border-top:1px solid var(--dsw-alias-border-l1);margin-top:4px;padding-top:6px}.dpe_providerFamilyHead_5deusq{min-height:28px;color:var(--dsw-alias-label-primary);justify-content:space-between;align-items:center;gap:12px;padding:4px 10px 2px;font-size:13px;font-weight:600;line-height:18px;display:flex}.dpe_accountRow_5deusq{align-items:center;gap:4px;display:flex}.dpe_accountRow_5deusq .dpe_accountOption_5deusq{flex:auto;width:auto;min-width:0}.dpe_accountOption_5deusq{width:100%;min-height:44px;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:0 0;border:1px solid #0000;border-radius:10px;outline:none;justify-content:space-between;align-items:center;gap:12px;padding:6px 10px 6px 18px;transition:background-color .14s,color .14s,border-color .14s;display:flex}.dpe_accountOption_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_accountOption_5deusq:focus-visible{border-color:var(--dsw-alias-border-l3)}.dpe_accountOption_5deusq:disabled{cursor:default}.dpe_accountIdentity_5deusq{flex-direction:column;min-width:0;display:flex}.dpe_accountLabel_5deusq,.dpe_accountEmail_5deusq{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dpe_accountLabel_5deusq{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:400;line-height:18px}.dpe_accountEmail_5deusq{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:400;line-height:16px}.dpe_accountMeta_5deusq{flex-direction:column;flex:none;align-items:flex-end;gap:1px;display:flex}.dpe_accountState_5deusq{color:var(--dsw-alias-label-secondary);flex:none;font-size:11px;font-weight:400;line-height:16px}.dpe_accountState_5deusq[data-active=true]{color:var(--dsw-alias-state-success-primary);font-weight:500}.dpe_accountQuota_5deusq{color:var(--dsw-alias-state-business-primary);white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px;font-weight:500;line-height:16px}.dpe_accountRead_5deusq{color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;flex:none;padding:4px 9px;font-size:11px;line-height:16px;transition:background-color .14s,color .14s}.dpe_accountRead_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_accountRead_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_accountNote_5deusq,.dpe_accountError_5deusq{margin:2px 10px 6px;font-size:11px;line-height:16px}.dpe_accountNote_5deusq{color:var(--dsw-alias-label-secondary)}.dpe_accountError_5deusq{color:var(--dsw-alias-state-error-primary)}.dpe_rows_5deusq{flex-direction:column;gap:5px;margin-top:10px;display:flex}.dpe_row_5deusq{--dpe-accent-edge:color-mix(in srgb, var(--dpe-accent) 28%, var(--dsw-alias-border-l1));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:border-color var(--dpe-motion-fast) ease, background-color var(--dpe-motion-fast) ease;border-radius:11px;padding:9px 10px 3px;position:relative}.dpe_row_5deusq:hover:not(.dpe_rowCurrent_5deusq){border-color:var(--dpe-accent-edge);background:color-mix(in srgb, var(--dpe-accent) 3%, var(--dsw-alias-bg-layer-1))}.dpe_rowCurrent_5deusq{border-color:var(--dpe-accent-edge);background:linear-gradient(115deg, color-mix(in srgb, var(--dpe-accent) 7%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-layer-1) 75%);box-shadow:inset 2px 0 var(--dpe-accent), inset 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}.dpe_rowHead_5deusq{color:var(--dsw-alias-label-primary);justify-content:space-between;align-items:center;gap:8px;font-size:12px;line-height:18px;display:flex}.dpe_rowName_5deusq:before{content:"";background:var(--dpe-accent);vertical-align:1px;border-radius:50%;width:6px;height:6px;margin-inline:1px 8px;display:inline-block}.dpe_rowName_5deusq{color:inherit;font:inherit;text-align:left;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:0;border-radius:6px;padding:2px 0;font-weight:600;transition:color .14s;overflow:hidden}.dpe_rowName_5deusq:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dpe_rowName_5deusq:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dpe_track_5deusq{cursor:pointer;touch-action:none;user-select:none;align-items:flex-start;height:47px;display:flex;position:relative}.dpe_rail_5deusq{z-index:0;background:var(--dsw-alias-border-l1);border-radius:999px;height:4px;position:absolute;top:18px;left:10px;right:10px;transform:translateY(-50%)}.dpe_fill_5deusq{z-index:1;background:var(--dpe-accent);transform-origin:0;height:4px;transition:transform .1s var(--dpe-ease);border-radius:999px;position:absolute;top:16px;left:10px;right:10px}.dpe_thumbPosition_5deusq{z-index:4;pointer-events:none;height:0;transition:transform .2s var(--dpe-spring);position:absolute;top:18px;left:10px;right:10px}.dpe_row_5deusq[data-drag-target=true] .dpe_fill_5deusq,.dpe_row_5deusq[data-drag-target=true] .dpe_thumbPosition_5deusq{transition-duration:.12s}.dpe_stop_5deusq{z-index:3;pointer-events:none;width:0;height:0;position:absolute;top:18px}.dpe_stop_5deusq:before{content:"";background:var(--dsw-alias-border-l1);border-radius:50%;width:6px;height:6px;position:absolute;transform:translate(-50%,-50%)}.dpe_stop_5deusq[data-filled=true]:before{background:var(--dpe-accent)}.dpe_stopLabel_5deusq{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:10px;font-weight:500;line-height:14px;transition:color .1s ease-out;position:absolute;top:12px;left:50%;transform:translate(-50%)}.dpe_stop_5deusq[data-active=true] .dpe_stopLabel_5deusq{color:var(--dpe-accent,var(--dsw-alias-label-primary));font-weight:700}.dpe_stop_5deusq[data-edge=start] .dpe_stopLabel_5deusq{left:0;transform:none}.dpe_stop_5deusq[data-edge=end] .dpe_stopLabel_5deusq{left:0;transform:translate(-100%)}.dpe_thumb_5deusq{box-sizing:border-box;border:2px solid var(--dsw-alias-bg-layer-1);corner-shape:round;background:var(--dpe-accent);width:14px;height:14px;box-shadow:0 0 0 1px color-mix(in srgb, var(--dpe-accent) 60%, transparent);transition:transform .2s var(--dpe-spring), box-shadow .14s var(--dpe-ease);border-radius:50%;display:block;position:absolute;top:0;left:0;transform:translate(-50%,-50%)}@media (hover:hover){.dpe_track_5deusq:hover:not(:has(.dpe_input_5deusq:disabled)) .dpe_thumb_5deusq{box-shadow:0 0 0 4px color-mix(in srgb, var(--dpe-accent) 18%, transparent);transform:translate(-50%,-50%)scale(1.18)}}.dpe_row_5deusq[data-drag-target=true] .dpe_thumb_5deusq{box-shadow:0 0 0 5px color-mix(in srgb, var(--dpe-accent) 20%, transparent);transform:translate(-50%,-50%)scale(1.3)}.dpe_track_5deusq:has(.dpe_input_5deusq:focus-visible) .dpe_thumb_5deusq{outline:2px solid var(--dpe-accent);outline-offset:3px}.dpe_input_5deusq{z-index:5;opacity:0;pointer-events:none;-webkit-appearance:none;appearance:none;background:0 0;width:100%;height:100%;margin:0;padding:0;position:absolute;inset:0}.dpe_input_5deusq:disabled{cursor:default}.dpe_note_5deusq{color:var(--dsw-alias-label-secondary);margin:8px 0 0;font-size:12px;line-height:18px}.dpe_error_5deusq{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border:1px solid #0000;border-radius:10px;margin:0 0 8px;padding:8px 10px;font-size:12px;line-height:18px}.dpe_foot_5deusq{border-top:1px solid var(--dsw-alias-border-l1);margin-top:10px;padding:9px 2px 0}.dpe_footLabel_5deusq{color:var(--dsw-alias-label-secondary);cursor:pointer;justify-content:space-between;align-items:center;font-size:11px;line-height:18px;list-style:none;display:flex}.dpe_footLabel_5deusq::-webkit-details-marker{display:none}.dpe_foot_5deusq[open] .dpe_footLabel_5deusq svg{transform:rotate(180deg)}.dpe_foot_5deusq .dpe_note_5deusq{margin-top:4px;font-size:11px}@media (prefers-reduced-motion:reduce){.dpe_menu_5deusq,.dpe_quotaTooltip_5deusq,.dpe_row_5deusq{animation:none}.dpe_quotaTrigger_5deusq,.dpe_thumbPosition_5deusq,.dpe_trigger_5deusq,.dpe_trigger_5deusq .dpe_dot_5deusq,.dpe_chevron_5deusq,.dpe_providerOption_5deusq,.dpe_accountOption_5deusq,.dpe_reload_5deusq,.dpe_accountRead_5deusq,.dpe_row_5deusq,.dpe_rail_5deusq,.dpe_fill_5deusq,.dpe_stop_5deusq,.dpe_stopLabel_5deusq,.dpe_thumb_5deusq{transition:none}.dpe_trigger_5deusq:active:not(:disabled){transform:none}.dpe_row_5deusq[data-drag-target=true] .dpe_fill_5deusq,.dpe_row_5deusq[data-drag-target=true] .dpe_thumbPosition_5deusq{transition:none}.dpe_track_5deusq:hover:not(:has(.dpe_input_5deusq:disabled)) .dpe_thumb_5deusq,.dpe_row_5deusq[data-drag-target=true] .dpe_thumb_5deusq{transform:translate(-50%,-50%)}}';
var ProviderPanel_default = { "accountCaption": "dpe_accountCaption_5deusq", "accountEmail": "dpe_accountEmail_5deusq", "accountError": "dpe_accountError_5deusq", "accountIdentity": "dpe_accountIdentity_5deusq", "accountLabel": "dpe_accountLabel_5deusq", "accountMeta": "dpe_accountMeta_5deusq", "accountNote": "dpe_accountNote_5deusq", "accountOption": "dpe_accountOption_5deusq", "accountQuota": "dpe_accountQuota_5deusq", "accountRead": "dpe_accountRead_5deusq", "accountRow": "dpe_accountRow_5deusq", "accountState": "dpe_accountState_5deusq", "chevron": "dpe_chevron_5deusq", "dot": "dpe_dot_5deusq", "dpe-menu-in": "dpe_dpe-menu-in_5deusq", "error": "dpe_error_5deusq", "fill": "dpe_fill_5deusq", "foot": "dpe_foot_5deusq", "footLabel": "dpe_footLabel_5deusq", "head": "dpe_head_5deusq", "headTitle": "dpe_headTitle_5deusq", "heading": "dpe_heading_5deusq", "input": "dpe_input_5deusq", "menu": "dpe_menu_5deusq", "modelTrigger": "dpe_modelTrigger_5deusq", "note": "dpe_note_5deusq", "providerCount": "dpe_providerCount_5deusq", "providerCurrent": "dpe_providerCurrent_5deusq", "providerFamily": "dpe_providerFamily_5deusq", "providerFamilyHead": "dpe_providerFamilyHead_5deusq", "providerLabel": "dpe_providerLabel_5deusq", "providerList": "dpe_providerList_5deusq", "providerMenu": "dpe_providerMenu_5deusq", "providerOption": "dpe_providerOption_5deusq", "providerTrigger": "dpe_providerTrigger_5deusq", "quotaFadeIn": "dpe_quotaFadeIn_5deusq", "quotaTooltip": "dpe_quotaTooltip_5deusq", "quotaTooltipName": "dpe_quotaTooltipName_5deusq", "quotaTooltipReset": "dpe_quotaTooltipReset_5deusq", "quotaTooltipRow": "dpe_quotaTooltipRow_5deusq", "quotaTooltipValue": "dpe_quotaTooltipValue_5deusq", "quotaTrigger": "dpe_quotaTrigger_5deusq", "quotaWrapper": "dpe_quotaWrapper_5deusq", "rail": "dpe_rail_5deusq", "reload": "dpe_reload_5deusq", "root": "dpe_root_5deusq", "row": "dpe_row_5deusq", "rowCurrent": "dpe_rowCurrent_5deusq", "rowHead": "dpe_rowHead_5deusq", "rowName": "dpe_rowName_5deusq", "rows": "dpe_rows_5deusq", "stop": "dpe_stop_5deusq", "stopLabel": "dpe_stopLabel_5deusq", "thumb": "dpe_thumb_5deusq", "thumbPosition": "dpe_thumbPosition_5deusq", "track": "dpe_track_5deusq", "trigger": "dpe_trigger_5deusq", "triggerEffort": "dpe_triggerEffort_5deusq", "triggerLabel": "dpe_triggerLabel_5deusq" };

// src/client/ProviderPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ChevronDown({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m3.5 5.25 3.5 3.5 3.5-3.5", stroke: "currentColor", strokeWidth: "1.25", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
var EFFORT_STORAGE_KEY = "dsh-provider-extension:model-efforts";
function loadEffortMemory() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(EFFORT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch {
  }
  return {};
}
function saveEffortMemory(memory) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(EFFORT_STORAGE_KEY, JSON.stringify(memory));
    }
  } catch {
  }
}
function sliderIndexFromPoint(clientX, rect, count, previous) {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const usable = Math.max(1, rect.width - 20);
  const ratio = Math.min(1, Math.max(0, (clientX - (rect.left + 10)) / usable));
  const position = ratio * (count - 1);
  const margin = Math.min(0.12, 5 * (count - 1) / usable);
  if (previous !== void 0 && previous >= 0 && previous < count && Math.abs(position - previous) <= 0.5 + margin) return previous;
  return Math.round(position);
}
function formatRemaining(isoTime, pct) {
  if (!isoTime) {
    if (pct === 100) return "满额可用";
    return "计算中…";
  }
  try {
    const diffMs = new Date(isoTime).getTime() - Date.now();
    if (diffMs <= 0) return "即将重置";
    const totalMinutes = Math.floor(diffMs / 6e4);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor(totalMinutes % (24 * 60) / 60);
    const mins = totalMinutes % 60;
    if (days > 0) return `${days}天${hours > 0 ? ` ${hours}小时` : ""}后重置`;
    if (hours > 0) return `${hours}小时${mins > 0 ? ` ${mins}分` : ""}后重置`;
    return `${Math.max(1, mins)}分钟后重置`;
  } catch {
    return "";
  }
}
function ProviderPanel({
  locked,
  available,
  useDirectory,
  useAccounts,
  useAntigravity,
  loadDirectory,
  loadAccounts,
  selectAccount,
  readQuota,
  select,
  loadAntigravity,
  selectAntigravityAccount,
  readAntigravityQuota,
  useOpencode,
  readOpencodeUsage,
  t
}) {
  const directory = useDirectory((snapshot) => snapshot);
  const accounts = useAccounts((snapshot) => snapshot);
  const fallbackAgState = { status: "idle", accounts: [], usage: {} };
  const antigravity = useAntigravity ? useAntigravity((snapshot) => snapshot) : fallbackAgState;
  const opencode = useOpencode ? useOpencode((snapshot) => snapshot) : void 0;
  const [open, setOpen] = (0, import_react.useState)(null);
  const [providerDraft, setProviderDraft] = (0, import_react.useState)();
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [optimistic, setOptimistic] = (0, import_react.useState)(null);
  const queuedSelection = (0, import_react.useRef)(null);
  const confirmedSelection = (0, import_react.useRef)(directory.current);
  const current = optimistic ?? directory.current;
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [accountError, setAccountError] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const [dragging, setDragging] = (0, import_react.useState)(null);
  const [effortMemory, setEffortMemory] = (0, import_react.useState)(() => loadEffortMemory());
  const [disabledModels, setDisabledModels] = (0, import_react.useState)(() => loadDisabledModels());
  (0, import_react.useEffect)(() => {
    const handleVisibilityChange = () => {
      setDisabledModels(loadDisabledModels());
    };
    window.addEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange);
    return () => {
      window.removeEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange);
    };
  }, []);
  const dragRef = (0, import_react.useRef)(null);
  const root = (0, import_react.useRef)(null);
  const providerTrigger = (0, import_react.useRef)(null);
  const modelTrigger = (0, import_react.useRef)(null);
  const generation = (0, import_react.useRef)(0);
  const mounted = (0, import_react.useRef)(false);
  const selecting = (0, import_react.useRef)(false);
  const lastDirectoryLoad = (0, import_react.useRef)(0);
  const setDrag = (next) => {
    dragRef.current = next;
    setDragging(next);
  };
  (0, import_react.useEffect)(() => {
    mounted.current = true;
    generation.current++;
    selecting.current = false;
    queuedSelection.current = null;
    confirmedSelection.current = directory.current;
    setOptimistic(null);
    lastDirectoryLoad.current = 0;
    setOpen(null);
    setProviderDraft(void 0);
    setBusy(false);
    setLoading(false);
    setAccountError(null);
    setError(null);
    setDrag(null);
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [useDirectory, useAccounts, loadDirectory, loadAccounts, selectAccount, readQuota, select]);
  (0, import_react.useEffect)(() => {
    if (directory.current?.provider !== void 0) setProviderDraft(directory.current.provider);
  }, [directory.current?.provider]);
  (0, import_react.useEffect)(() => {
    const cur = directory.current;
    const effort = cur?.reasoningEffort;
    if (cur?.provider && cur.model && effort !== void 0) {
      const key = `${cur.provider}/${cur.model}`;
      setEffortMemory((prev) => {
        if (prev[key] === effort) return prev;
        const next = { ...prev, [key]: effort };
        saveEffortMemory(next);
        return next;
      });
    }
  }, [directory.current?.provider, directory.current?.model, directory.current?.reasoningEffort]);
  (0, import_react.useEffect)(() => {
    if (!busy && optimistic !== null && sameSelection(optimistic, directory.current)) setOptimistic(null);
    if (!busy && optimistic === null) confirmedSelection.current = directory.current;
  }, [busy, optimistic, directory.current]);
  const authoritativeGroup = activeGroup({ ...directory, current });
  const group = directory.groups.find((candidate) => candidate.id === providerDraft) ?? authoritativeGroup;
  const activeAgAccount = antigravity.accounts.find((account) => account.active) ?? antigravity.accounts[0];
  const activeCodexAccount = accounts.accounts.find((account) => account.active);
  const disabledForCurrent = (0, import_react.useMemo)(
    () => group?.id === "deepseek-official" || group?.id === "deepseek-account" ? /* @__PURE__ */ new Set() : isAntigravityProvider(group?.id) ? getDisabledModelsForAccount(activeAgAccount?.id, activeAgAccount?.email) : isCodexProvider(group?.id) ? getDisabledModelsForAccount(activeCodexAccount?.id, activeCodexAccount?.email) : disabledModels,
    [group?.id, activeAgAccount?.id, activeAgAccount?.email, activeCodexAccount?.id, activeCodexAccount?.email, disabledModels]
  );
  const allModels = group?.models ?? [];
  const codexEnabled = (0, import_react.useMemo)(
    () => isCodexProvider(group?.id) ? codexEnabledModels(activeCodexAccount?.id, activeCodexAccount?.email) : void 0,
    [group?.id, activeCodexAccount?.id, activeCodexAccount?.email, disabledModels]
  );
  (0, import_react.useEffect)(() => {
    lastDirectoryLoad.current = 0;
  }, [activeAgAccount?.id, activeCodexAccount?.id]);
  const models = allModels.filter((model) => codexEnabled !== void 0 ? codexEnabled.has(model.id) : !disabledForCurrent.has(model.id));
  const currentModel = group === void 0 || group.id !== current?.provider ? void 0 : models.find((model) => isCurrentModel(current, group.id, model));
  const efforts = currentModel?.reasoning?.efforts ?? [];
  const currentEffort = currentModel === void 0 ? void 0 : current?.reasoningEffort;
  const currentEffortName = efforts.find((effort) => effort.id === currentEffort)?.name;
  const previewModel = dragging !== null && group !== void 0 && dragging.provider === group.id ? dragging.model : currentModel;
  const pending = locked || busy || accounts.switchingId !== void 0 || directory.status === "selecting";
  const modelLocked = locked || accounts.switchingId !== void 0 || !available;
  const fetching = loading || directory.status === "loading" && models.length === 0;
  (0, import_react.useEffect)(() => {
    if (open === null) return;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(null);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const focus = open === "provider" ? providerTrigger.current : modelTrigger.current;
      setOpen(null);
      focus?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const reload = (force = true) => {
    if (selecting.current || pending || fetching) return;
    const request = generation.current;
    setLoading(force || models.length === 0);
    setError(null);
    void loadDirectory(force).then(() => {
      if (mounted.current && request === generation.current) lastDirectoryLoad.current = Date.now();
    }).catch((cause) => {
      if (mounted.current && request === generation.current && !selecting.current) {
        setError({ kind: "loadFailed", message: cause instanceof Error ? cause.message : String(cause) });
      }
    }).finally(() => {
      if (mounted.current && request === generation.current) setLoading(false);
    });
  };
  const toggle = (pane) => {
    if (modelLocked || pane === "provider" && pending) return;
    const next = open === pane ? null : pane;
    setOpen(next);
    if (next !== null && (lastDirectoryLoad.current === 0 || Date.now() - lastDirectoryLoad.current >= 3e4)) reload(false);
    if (next !== null) {
      if ((next === "provider" || isCodexProvider(group?.id)) && directory.groups.some((candidate) => isCodexProvider(candidate.id))) {
        void loadAccounts();
      }
      if ((next === "provider" || isAntigravityProvider(group?.id)) && directory.groups.some((candidate) => isAntigravityProvider(candidate.id))) {
        void loadAntigravity?.();
      }
    }
  };
  const submit = (model, effortId) => {
    if (group === void 0 || model === void 0 || modelLocked) return;
    const next = selectionForRow(model, group.id, effortId);
    if (sameSelection(next, current)) return;
    queuedSelection.current = next;
    setOptimistic(next);
    setDrag(null);
    setError(null);
    if (selecting.current) return;
    selecting.current = true;
    setBusy(true);
    const request = generation.current;
    void (async () => {
      try {
        while (queuedSelection.current !== null && mounted.current && request === generation.current) {
          const selection = queuedSelection.current;
          queuedSelection.current = null;
          try {
            await select(selection);
            if (!mounted.current || request !== generation.current) return;
            confirmedSelection.current = selection;
            if (selection.reasoningEffort !== void 0) {
              const key = selection.provider + "/" + selection.model;
              setEffortMemory((prev) => {
                const nextMemory = { ...prev, [key]: selection.reasoningEffort };
                saveEffortMemory(nextMemory);
                return nextMemory;
              });
            }
          } catch (cause) {
            if (!mounted.current || request !== generation.current) return;
            if (queuedSelection.current === null) {
              setOptimistic(confirmedSelection.current ?? null);
              setError({ kind: "selectFailed", message: cause instanceof Error ? cause.message : String(cause) });
            }
          }
        }
      } finally {
        if (mounted.current && request === generation.current) {
          selecting.current = false;
          setBusy(false);
        }
      }
    })();
  };
  const commitDrag = (drag) => {
    if (drag === null || group === void 0 || drag.provider !== group.id || modelLocked) return false;
    const ladder = drag.model.reasoning?.efforts ?? [];
    const effortId = drag.index < 0 ? void 0 : ladder[drag.index]?.id;
    if (current?.provider === drag.provider && current.model === drag.model.id && current.reasoningEffort === effortId) return false;
    submit(drag.model, effortId);
    return true;
  };
  const dragAtPointer = (event, fallback, previous) => {
    const locate = document.elementFromPoint;
    const element = typeof locate === "function" ? locate.call(document, event.clientX, event.clientY) : null;
    const originTrack = event.currentTarget;
    const row = element?.closest("[data-provider-panel-model]");
    const candidateTrack = row?.querySelector("[data-provider-panel-track]") ?? null;
    const band = candidateTrack?.getBoundingClientRect() ?? row?.getBoundingClientRect();
    const insideBand = band !== void 0 && event.clientY >= band.top - 16 && event.clientY <= band.bottom + 16;
    const candidate = row !== null && row !== void 0 && insideBand ? models.find((entry) => entry.id === row.dataset.providerPanelModel) : void 0;
    const target = candidate ?? fallback;
    let track = candidate === void 0 ? null : candidateTrack;
    if (track === null) {
      const fallbackRow = Array.from(root.current?.querySelectorAll("[data-provider-panel-model]") ?? []).find((entry) => entry.dataset.providerPanelModel === target.id);
      track = fallbackRow?.querySelector("[data-provider-panel-track]") ?? originTrack;
    }
    const count = target.reasoning?.efforts.length ?? 0;
    const previousIndex = previous?.model.id === target.id && previous.provider === group.id ? previous.index : void 0;
    return {
      model: target,
      provider: group.id,
      index: sliderIndexFromPoint(event.clientX, track === candidateTrack && band !== void 0 ? band : track.getBoundingClientRect(), count, previousIndex),
      source: "pointer",
      pointerId: event.pointerId
    };
  };
  const startPointerDrag = (event, model) => {
    if (modelLocked || event.button !== void 0 && event.button !== 0) return;
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.currentTarget.querySelector("input")?.focus();
    setDrag(dragAtPointer(event, model));
  };
  const movePointerDrag = (event) => {
    const drag = dragRef.current;
    if (modelLocked || drag?.source !== "pointer" || drag.pointerId !== void 0 && event.pointerId !== void 0 && drag.pointerId !== event.pointerId) return;
    const next = dragAtPointer(event, drag.model, drag);
    if (next.model.id !== drag.model.id || next.index !== drag.index) setDrag(next);
  };
  const finishPointerDrag = (event, shouldCommit) => {
    const drag = dragRef.current;
    if (drag?.source !== "pointer" || drag.pointerId !== void 0 && event.pointerId !== void 0 && drag.pointerId !== event.pointerId) return;
    if (typeof event.currentTarget.hasPointerCapture === "function" && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!shouldCommit || !commitDrag(drag)) setDrag(null);
  };
  const finishKeyboardDrag = () => {
    const drag = dragRef.current;
    if (modelLocked || drag?.source !== "keyboard") return;
    if (!commitDrag(drag)) setDrag(null);
  };
  const renderRow = (model, index) => {
    const ladder = model.reasoning?.efforts ?? [];
    const count = ladder.length;
    const provider = group.id;
    const isCurrent = isCurrentModel(current, provider, model);
    const isDragTarget = dragging !== null && dragging.model.id === model.id && dragging.provider === provider;
    const isRowActive = dragging !== null ? isDragTarget : isCurrent;
    const key = `${provider}/${model.id}`;
    const remembered = effortMemory[key] ?? effortMemory[model.id];
    const effectiveEffortId = isCurrent ? currentEffort ?? resolveModelEffort(model, remembered) : resolveModelEffort(model, remembered);
    const resting = effortIndex(model, effectiveEffortId);
    const position = isDragTarget ? dragging.index : resting;
    const ratio = count > 1 && position >= 0 ? position / (count - 1) : 0;
    const effortName = ladder[position]?.name ?? (effectiveEffortId === void 0 ? t("defaultEffort") : t("unknownEffort", { effort: effectiveEffortId }));
    const accent = accentFor(model.id, index);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: isRowActive ? `${ProviderPanel_default.row} ${ProviderPanel_default.rowCurrent}` : ProviderPanel_default.row,
        "data-model-accent": model.id,
        "data-current": isRowActive,
        "data-drag-target": isDragTarget,
        "data-provider-panel-model": model.id,
        style: {
          "--dpe-accent": accent
        },
        onClick: (event) => {
          if (event.target.closest("[data-provider-panel-track]")) return;
          submit(model, effectiveEffortId);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.rowHead, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: ProviderPanel_default.rowName,
              "aria-label": t("selectModel", { model: model.name }),
              "aria-pressed": isRowActive,
              disabled: modelLocked,
              onClick: (event) => {
                event.stopPropagation();
                submit(model, effectiveEffortId);
              },
              children: model.name
            }
          ) }),
          count === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              className: ProviderPanel_default.track,
              "data-provider-panel-track": true,
              onPointerDown: (event) => {
                startPointerDrag(event, model);
              },
              onPointerMove: movePointerDrag,
              onPointerUp: (event) => {
                finishPointerDrag(event, true);
              },
              onPointerCancel: (event) => {
                finishPointerDrag(event, false);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.rail, "aria-hidden": "true" }),
                ladder.map((effort, stop) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "span",
                  {
                    className: ProviderPanel_default.stop,
                    "aria-hidden": "true",
                    "data-active": isRowActive && stop === position,
                    "data-filled": isRowActive && stop <= position,
                    "data-edge": stop === 0 ? "start" : stop === count - 1 ? "end" : "middle",
                    style: { left: `calc(10px + (100% - 20px) * ${count > 1 ? stop / (count - 1) : 0})` },
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.stopLabel, children: effort.name })
                  },
                  effort.id
                )),
                !isRowActive || position < 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.fill, "aria-hidden": "true", style: { transform: `scaleX(${ratio})` } }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.thumbPosition, "aria-hidden": "true", style: { transform: `translateX(${ratio * 100}%)` }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.thumb }) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: ProviderPanel_default.input,
                    type: "range",
                    min: resting < 0 ? -1 : 0,
                    max: count - 1,
                    step: 1,
                    value: position,
                    disabled: modelLocked,
                    "aria-label": t("adjustEffort", { model: model.name }),
                    "aria-valuetext": effortName,
                    onChange: (event) => {
                      if (modelLocked || dragRef.current?.source === "pointer") return;
                      setDrag({ model, provider, index: Number(event.target.value), source: "keyboard" });
                    },
                    onKeyUp: (event) => {
                      if (["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(event.key)) {
                        finishKeyboardDrag();
                      }
                    },
                    onBlur: finishKeyboardDrag
                  }
                )
              ]
            }
          )
        ]
      },
      `${provider}/${model.id}`
    );
  };
  const chooseAccount = (provider, id, active) => {
    if (pending) return;
    setProviderDraft(provider);
    setAccountError(null);
    if (active) {
      setOpen(null);
      queueMicrotask(() => {
        providerTrigger.current?.focus();
      });
      return;
    }
    void selectAccount(id).then(() => {
      if (!mounted.current) return;
      setOpen(null);
      queueMicrotask(() => {
        providerTrigger.current?.focus();
      });
    }).catch((cause) => {
      if (!mounted.current) return;
      setAccountError(cause instanceof Error ? cause.message : String(cause));
    });
  };
  const requestQuota = (id) => {
    if (pending) return;
    setAccountError(null);
    void readQuota(id).catch((cause) => {
      if (!mounted.current) return;
      setAccountError(cause instanceof Error ? cause.message : String(cause));
    });
  };
  if (!available) return null;
  const activeAccount = accounts.accounts.find((account) => account.active);
  const cleanGroupName = (id, name) => {
    if (id === "deepseek-official") return t("providerDeepseekApi");
    if (id === "deepseek-account") return t("providerDeepseekAccount");
    if (isCodexProvider(id)) return t("providerCodex");
    if (isAntigravityProvider(id)) return t("providerAntigravity");
    if (isOpencodeProvider(id)) return t("providerOpenCode");
    return name ?? t("providerTrigger");
  };
  const baseProviderLabel = cleanGroupName(group?.id, group?.name ?? directory.current?.provider);
  const providerLabel = isCodexProvider(group?.id) && activeAccount !== void 0 ? `${baseProviderLabel} · ${activeAccount.label}` : isAntigravityProvider(group?.id) && activeAgAccount !== void 0 ? `${baseProviderLabel} · ${activeAgAccount.label}` : baseProviderLabel;
  const modelLabel = currentModel?.name ?? (group?.id === current?.provider ? current?.model ?? t("trigger") : t("trigger"));
  const isAg = isAntigravityProvider(group?.id);
  const isCodex = isCodexProvider(group?.id);
  const agUsage = antigravity?.usage ?? {};
  const quotaData = activeAgAccount ? agUsage[activeAgAccount.id] ?? agUsage["default"] : void 0;
  const primaryGroup = quotaData?.groups?.find((g) => g.group === "gemini") ?? quotaData?.groups?.[0];
  const fiveHourWin = primaryGroup?.windows?.find((w) => w.window === "5h");
  const weeklyWin = primaryGroup?.windows?.find((w) => w.window === "weekly");
  (0, import_react.useEffect)(() => {
    if (isAntigravityProvider(group?.id)) {
      void loadAntigravity?.().catch(() => {
      });
      if (activeAgAccount) {
        void readAntigravityQuota?.(activeAgAccount.id).catch(() => {
        });
      }
    }
  }, [group?.id, activeAgAccount?.id, loadAntigravity, readAntigravityQuota]);
  (0, import_react.useEffect)(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (isAntigravityProvider(group?.id) && activeAgAccount) {
        void readAntigravityQuota?.(activeAgAccount.id).catch(() => {
        });
      } else if (isCodexProvider(group?.id) && activeAccount) {
        void readQuota?.(activeAccount.id).catch(() => {
        });
      } else if (isOpencodeProvider(group?.id)) {
        void readOpencodeUsage?.().catch(() => {
        });
      }
    }, 6e4);
    return () => clearInterval(timer);
  }, [group?.id, activeAgAccount?.id, activeAccount?.id, readAntigravityQuota, readQuota, readOpencodeUsage]);
  const fiveHourPct = fiveHourWin !== void 0 ? Math.round(fiveHourWin.remainingFraction * 100) : void 0;
  const weeklyPct = weeklyWin !== void 0 ? Math.round(weeklyWin.remainingFraction * 100) : void 0;
  const fiveHourReset = formatRemaining(fiveHourWin?.resetTime, fiveHourPct);
  const weeklyReset = formatRemaining(weeklyWin?.resetTime, weeklyPct);
  const codexUsage = activeAccount ? accounts.usage[activeAccount.id] : void 0;
  const codexUsageVal = codexUsage?.status === "ready" ? codexUsage.value : void 0;
  const codex5h = codexUsageVal?.shortPercent;
  const codexWeekly = codexUsageVal?.weeklyPercent;
  const codex5hReset = codexUsageVal?.shortResetsAt ? formatRemaining(new Date(codexUsageVal.shortResetsAt * 1e3).toISOString(), codex5h) : void 0;
  const codexWeeklyReset = codexUsageVal?.weeklyResetsAt ? formatRemaining(new Date(codexUsageVal.weeklyResetsAt * 1e3).toISOString(), codexWeekly) : void 0;
  const codexPlanType = (activeAccount?.planType ?? "").toUpperCase();
  const isCodexPro = codexPlanType === "PRO" || codexPlanType.includes("PRO");
  const codexPillText = isCodexPro ? codexWeekly !== void 0 ? t("weeklyQuota", { value: codexWeekly }) : codex5h !== void 0 ? t("fiveHourQuota", { value: codex5h }) : "周 100%" : codex5h !== void 0 ? t("fiveHourQuota", { value: codex5h }) : codexWeekly !== void 0 ? t("weeklyQuota", { value: codexWeekly }) : "5h 100%";
  const isOpencode = isOpencodeProvider(group?.id);
  const quotaBadge = isAg ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaWrapper, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: ProviderPanel_default.quotaTrigger,
        onClick: () => {
          if (activeAgAccount) void readAntigravityQuota?.(activeAgAccount.id).catch(() => {
          });
        },
        children: fiveHourPct !== void 0 ? t("fiveHourQuota", { value: fiveHourPct }) : "5h 100%"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltip, role: "tooltip", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltipRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipName, children: "5小时额度:" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipValue, children: fiveHourPct !== void 0 ? `${fiveHourPct}%` : "100%" }),
          fiveHourReset ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipReset, children: [
            "(",
            fiveHourReset,
            ")"
          ] }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltipRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipName, children: "周额度:" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipValue, children: weeklyPct !== void 0 ? `${weeklyPct}%` : "100%" }),
          weeklyReset ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipReset, children: [
            "(",
            weeklyReset,
            ")"
          ] }) : null
        ] })
      ] })
    ] })
  ] }) : isCodex && (codexWeekly !== void 0 || codex5h !== void 0) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaWrapper, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: ProviderPanel_default.quotaTrigger,
        onClick: () => {
          if (activeAccount) void readQuota?.(activeAccount.id).catch(() => {
          });
        },
        children: codexPillText
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltip, role: "tooltip", children: [
      !isCodexPro ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltipRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipName, children: "5小时额度:" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipValue, children: codex5h !== void 0 ? `${codex5h}%` : "100%" }),
          codex5hReset ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipReset, children: [
            "(",
            codex5hReset,
            ")"
          ] }) : null
        ] })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltipRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipName, children: "周额度:" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipValue, children: codexWeekly !== void 0 ? `${codexWeekly}%` : "100%" }),
          codexWeeklyReset ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipReset, children: [
            "(",
            codexWeeklyReset,
            ")"
          ] }) : null
        ] })
      ] })
    ] })
  ] }) : isOpencode && (opencode?.usage?.weekly || opencode?.usage?.rolling) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaWrapper, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: ProviderPanel_default.quotaTrigger,
        onClick: () => {
          void readOpencodeUsage?.().catch(() => {
          });
        },
        children: opencode.usage.weekly ? t("weeklyQuota", { value: opencode.usage.weekly.percent }) : `${opencode.usage.rolling?.percent ?? 100}%`
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltip, role: "tooltip", children: [
      opencode.usage.rolling && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltipRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipName, children: "5小时额度:" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipValue, children: [
            opencode.usage.rolling.percent,
            "%"
          ] }),
          opencode.usage.rolling.resetsAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipReset, children: [
            "(",
            formatRemaining(opencode.usage.rolling.resetsAt, opencode.usage.rolling.percent),
            ")"
          ] }) : null
        ] })
      ] }),
      opencode.usage.weekly && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.quotaTooltipRow, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.quotaTooltipName, children: "周额度:" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipValue, children: [
            opencode.usage.weekly.percent,
            "%"
          ] }),
          opencode.usage.weekly.resetsAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.quotaTooltipReset, children: [
            "(",
            formatRemaining(opencode.usage.weekly.resetsAt, opencode.usage.weekly.percent),
            ")"
          ] }) : null
        ] })
      ] })
    ] })
  ] }) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: ProviderPanel_default.root,
      "data-testid": "dsh-provider-extension",
      onKeyDown: (event) => {
        if (event.key !== "Escape" || open === null) return;
        event.preventDefault();
        const focus = open === "provider" ? providerTrigger.current : modelTrigger.current;
        setOpen(null);
        focus?.focus();
      },
      ref: root,
      children: [
        quotaBadge,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            ref: providerTrigger,
            type: "button",
            className: `${ProviderPanel_default.trigger} ${ProviderPanel_default.providerTrigger}`,
            "aria-label": t("providerTitle"),
            "aria-haspopup": "dialog",
            "aria-expanded": open === "provider",
            disabled: pending,
            title: providerLabel,
            onClick: () => {
              toggle("provider");
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.providerLabel, children: providerLabel }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: ProviderPanel_default.chevron }) })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            ref: modelTrigger,
            type: "button",
            className: `${ProviderPanel_default.trigger} ${ProviderPanel_default.modelTrigger}`,
            "aria-label": t("title"),
            "aria-haspopup": "dialog",
            "aria-expanded": open === "model",
            disabled: modelLocked,
            title: currentEffortName === void 0 ? modelLabel : `${modelLabel} · ${currentEffortName}`,
            style: { "--dpe-accent": accentFor(currentModel?.id ?? modelLabel, 0) },
            onClick: () => {
              toggle("model");
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.dot, "aria-hidden": "true" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.triggerLabel, children: modelLabel }),
              currentEffortName === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.triggerEffort, children: currentEffortName }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: ProviderPanel_default.chevron }) })
            ]
          }
        ),
        open === "provider" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ProviderPanel_default.menu} ${ProviderPanel_default.providerMenu}`, role: "dialog", "aria-label": t("providerTitle"), "aria-busy": fetching, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.head, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.headTitle, children: t("providerTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: ProviderPanel_default.reload, disabled: pending || fetching, onClick: () => {
              reload();
              void loadAccounts();
            }, children: t("reload") })
          ] }),
          error?.kind === "loadFailed" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: t("loadFailed", { message: error.message }) }) : null,
          fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, role: "status", children: t("loading") }) : null,
          directory.groups.length === 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("providerEmpty") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.providerList, role: "listbox", "aria-label": t("providerTitle"), children: (() => {
            const opencodeGroup = directory.groups.find((g) => isOpencodeProvider(g.id));
            const opencodeModels = opencode?.models?.map((m) => ({
              id: m.id,
              name: m.name,
              provider: "opencode-go",
              inputModalities: ["text", "image"]
            })) ?? DEFAULT_OPENCODE_MODELS.map((m) => ({
              id: m.id,
              name: m.name,
              provider: "opencode-go",
              inputModalities: ["text", "image"]
            }));
            const effectiveGroups = opencodeGroup !== void 0 ? directory.groups : [
              ...directory.groups,
              {
                id: "opencode-go",
                name: t("providerOpenCode"),
                models: opencodeModels
              }
            ];
            return effectiveGroups.map((candidate) => {
              const selected = candidate.id === group?.id;
              const displayName = cleanGroupName(candidate.id, candidate.name);
              if (isAntigravityProvider(candidate.id) && antigravity.accounts.length > 0) {
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.providerFamily, role: "group", "aria-label": displayName, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.providerFamilyHead, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: displayName }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.providerCount, children: t("accountCount", { count: antigravity.accounts.length }) })
                  ] }),
                  antigravity.accounts.map((account) => {
                    const email = maskedEmail(account.email);
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.accountRow, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "button",
                      {
                        type: "button",
                        role: "option",
                        "aria-selected": selected && account.active,
                        className: selected && account.active ? `${ProviderPanel_default.accountOption} ${ProviderPanel_default.providerCurrent}` : ProviderPanel_default.accountOption,
                        disabled: pending,
                        onClick: () => {
                          setProviderDraft(candidate.id);
                          if (!account.active && selectAntigravityAccount) {
                            void selectAntigravityAccount(account.id);
                          }
                          setOpen(null);
                          queueMicrotask(() => {
                            providerTrigger.current?.focus();
                          });
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.accountIdentity, children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountLabel, children: account.label }),
                            email === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountEmail, children: email })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountMeta, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountState, "data-active": account.active, children: antigravity.switchingId === account.id ? t("accountSwitching") : account.active ? t("accountActive") : t("accountUse") }) })
                        ]
                      }
                    ) }, account.id);
                  })
                ] }, candidate.id);
              }
              if (!isCodexProvider(candidate.id) || accounts.status === "error" || accounts.accounts.length === 0) {
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "button",
                    {
                      type: "button",
                      role: "option",
                      "aria-selected": selected,
                      className: selected ? `${ProviderPanel_default.providerOption} ${ProviderPanel_default.providerCurrent}` : ProviderPanel_default.providerOption,
                      disabled: pending,
                      onClick: () => {
                        setProviderDraft(candidate.id);
                        setOpen(null);
                        queueMicrotask(() => {
                          providerTrigger.current?.focus();
                        });
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: displayName }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.providerCount, children: candidate.models.length })
                      ]
                    }
                  ),
                  isCodexProvider(candidate.id) && accounts.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.accountNote, children: t("accountLoadFailed", { message: accounts.error ?? t("accountUnavailable") }) }) : isCodexProvider(candidate.id) && (accounts.status === "idle" || accounts.status === "loading") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.accountNote, children: t("accountsLoading") }) : null
                ] }, candidate.id);
              }
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.providerFamily, role: "group", "aria-label": displayName, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.providerFamilyHead, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: displayName }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.providerCount, children: t("accountCount", { count: accounts.accounts.length }) })
                ] }),
                accountError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.accountError, role: "alert", children: t("accountSwitchFailed", { message: accountError }) }),
                accounts.restoreFailed === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.accountError, role: "alert", children: t("quotaRestoreFailed") }) : null,
                accounts.accounts.map((account) => {
                  const email = maskedEmail(account.email);
                  const usage = accounts.usage[account.id];
                  const weekly = usage?.status === "ready" ? usage.value.weeklyPercent : void 0;
                  const quotaText = usage?.status === "loading" ? t("quotaReading") : usage?.status === "error" ? t("quotaFailedShort") : usage?.status === "ready" ? weekly === void 0 ? t("quotaNoWeekly") : t("weeklyQuota", { value: weekly }) : void 0;
                  const canRead = !account.active && (usage === void 0 || usage.status === "error");
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.accountRow, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "button",
                      {
                        type: "button",
                        role: "option",
                        "aria-selected": selected && account.active,
                        className: selected && account.active ? `${ProviderPanel_default.accountOption} ${ProviderPanel_default.providerCurrent}` : ProviderPanel_default.accountOption,
                        disabled: pending,
                        onClick: () => {
                          chooseAccount(candidate.id, account.id, account.active);
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.accountIdentity, children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountLabel, children: account.label }),
                            email === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountEmail, children: email })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.accountMeta, children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountState, "data-active": account.active, children: accounts.switchingId === account.id ? t("accountSwitching") : account.active ? t("accountActive") : t("accountUse") }),
                            quotaText === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountQuota, children: quotaText })
                          ] })
                        ]
                      }
                    ),
                    canRead ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        className: ProviderPanel_default.accountRead,
                        disabled: pending,
                        onClick: () => {
                          requestQuota(account.id);
                        },
                        children: t("readQuota")
                      }
                    ) : null
                  ] }, account.id);
                })
              ] }, candidate.id);
            });
          })() })
        ] }),
        open === "model" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            className: ProviderPanel_default.menu,
            role: "dialog",
            "aria-label": t("title"),
            "aria-busy": pending || fetching,
            style: { "--dpe-accent": accentFor(previewModel?.id ?? "", 0) },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.head, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.heading, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.headTitle, children: group === void 0 ? t("title") : cleanGroupName(group.id, group.name) }),
                  isCodexProvider(group?.id) && activeCodexAccount ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: ProviderPanel_default.accountCaption, children: [
                    t("accountCurrent"),
                    ": ",
                    activeCodexAccount.label
                  ] }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: ProviderPanel_default.reload, disabled: pending || fetching, onClick: () => {
                  reload();
                }, children: fetching ? t("loading") : t("reload") })
              ] }),
              !fetching && codexEnabled !== void 0 && [...codexEnabled].some((id) => !allModels.some((model) => model.id === id)) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("codexModelsMissing", {
                models: [...codexEnabled].filter((id) => !allModels.some((model) => model.id === id)).join(", ")
              }) }) : null,
              error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: t(error.kind, { message: error.message }) }) : directory.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: directory.error }),
              directory.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: t("providerFailed", { provider: cleanGroupName(failure.id, failure.name), message: failure.message }) }, failure.id)),
              fetching && models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, role: "status", children: t("loading") }) : null,
              directory.current !== null && group?.id === directory.current.provider && currentModel === void 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("missing", { provider: directory.current.provider, model: directory.current.model }) }) : null,
              group?.id === "deepseek-official" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("deepseekApiHint") }) : group?.id === "deepseek-account" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("deepseekAccountHint") }) : models.length === 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("empty") }) : null,
              models.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.rows, children: models.map(renderRow) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: ProviderPanel_default.foot, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { className: ProviderPanel_default.footLabel, children: [
                  t("contextWindow"),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {})
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("contextUnsupported") })
              ] })
            ]
          }
        )
      ]
    }
  );
}

// src/client/ProviderSettings.tsx
var import_react2 = require("react");

// dsh-provider-extension-css:src/client/ProviderSettings.module.css
var cssText2 = '.dpe_page_j5ekMa{flex-direction:column;gap:16px;padding:4px 2px 24px;display:flex}.dpe_head_j5ekMa{flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.dpe_title_j5ekMa{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:600;line-height:24px}.dpe_intro_j5ekMa{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:18px}.dpe_headActions_j5ekMa,.dpe_actions_j5ekMa{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.dpe_navBack_j5ekMa{align-items:center;gap:12px;margin-bottom:2px;display:flex}.dpe_backButton_j5ekMa{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:14px;outline:none;align-items:center;gap:6px;padding:0 10px 0 8px;font-size:12px;font-weight:500;line-height:20px;transition:background-color .14s,color .14s,border-color .14s;display:inline-flex}.dpe_backButton_j5ekMa:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}.dpe_breadcrumb_j5ekMa{color:var(--dsw-alias-label-caption);align-items:center;gap:6px;font-size:12px;display:flex}.dpe_breadcrumbCurrent_j5ekMa{color:var(--dsw-alias-label-primary);font-weight:600}.dpe_action_j5ekMa{border:1px solid var(--dsw-alias-border-l2);height:28px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;background:0 0;border-radius:14px;outline:none;align-items:center;padding:0 12px;font-size:12px;line-height:20px;text-decoration:none;transition:background-color .14s,color .14s,border-color .14s;display:inline-flex}.dpe_action_j5ekMa:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_action_j5ekMa:focus-visible,.dpe_backButton_j5ekMa:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dpe_action_j5ekMa:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_primary_j5ekMa{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-color:#0000;font-weight:600}.dpe_primary_j5ekMa:hover:not(:disabled){background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);filter:brightness(1.06)}.dpe_providerList_j5ekMa{flex-direction:column;gap:10px;display:flex}.dpe_providerCard_j5ekMa{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:16px;flex-direction:column;transition:border-color .16s,box-shadow .16s;display:flex;overflow:hidden}.dpe_providerCard_j5ekMa:hover{border-color:var(--dsw-alias-border-l3)}.dpe_providerCardHead_j5ekMa{cursor:pointer;user-select:none;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;transition:background-color .14s;display:flex}.dpe_providerCardHead_j5ekMa:hover{background:var(--dsw-alias-interactive-bg-hover)}.dpe_providerMain_j5ekMa{cursor:pointer;flex:auto;align-items:center;gap:12px;min-width:0;display:flex}.dpe_providerIcon_j5ekMa{background:var(--dsw-alias-interactive-bg-hover);width:36px;height:36px;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex:none;justify-content:center;align-items:center;font-size:14px;font-weight:700;display:flex}.dpe_providerIcon_j5ekMa[data-provider=codex]{color:#10a37f;background:#10a37f1a;border-color:#10a37f40}.dpe_providerIcon_j5ekMa[data-provider=antigravity]{color:#4285f4;background:#4285f41a;border-color:#4285f440}.dpe_providerIcon_j5ekMa[data-provider=claude]{color:#d97706;background:#d977061a;border-color:#d9770640}.dpe_providerIcon_j5ekMa[data-provider=gemini]{color:#8b5cf6;background:#8b5cf61a;border-color:#8b5cf640}.dpe_providerIcon_j5ekMa[data-provider=openai]{color:#06b6d4;background:#06b6d41a;border-color:#06b6d440}.dpe_providerIcon_j5ekMa[data-provider=opencode]{color:#ec4899;background:#ec48991a;border-color:#ec489940}.dpe_providerTitles_j5ekMa{flex-direction:column;gap:2px;min-width:0;display:flex}.dpe_providerTitle_j5ekMa{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}.dpe_providerSubtitle_j5ekMa{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.dpe_providerRight_j5ekMa{flex:none;align-items:center;gap:8px;display:flex}.dpe_providerBadge_j5ekMa{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-caption);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:500;line-height:16px}.dpe_providerBadge_j5ekMa[data-status=ready]{color:var(--dsw-alias-state-success-primary);background:#10a37f1f}.dpe_providerBadge_j5ekMa[data-status=idle]{color:var(--dsw-alias-label-tertiary)}.dpe_providerBadge_j5ekMa[data-status=roadmap]{color:var(--dsw-alias-label-caption);border:1px dashed var(--dsw-alias-border-l2);background:0 0}.dpe_quickView_j5ekMa{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex-direction:column;gap:10px;padding:10px 14px 14px;animation:.14s cubic-bezier(.22,1,.36,1) dpe_pset-in_j5ekMa;display:flex}.dpe_quickViewHead_j5ekMa{justify-content:space-between;align-items:center;gap:8px;display:flex}.dpe_quickViewTitle_j5ekMa{color:var(--dsw-alias-label-caption);text-transform:uppercase;letter-spacing:.03em;font-size:11px;font-weight:600;line-height:16px}.dpe_quickAccounts_j5ekMa{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.dpe_quickAccountItem_j5ekMa{background:var(--dsw-alias-bg-layer-1);border-radius:8px;justify-content:space-between;align-items:center;gap:10px;padding:4px 10px;display:flex}.dpe_quickAccountIdentity_j5ekMa{align-items:center;gap:8px;min-width:0;display:flex}.dpe_quickAccountLabel_j5ekMa{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;line-height:18px}.dpe_quickAccountEmail_j5ekMa{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}.dpe_quickAccountMeta_j5ekMa{flex:none;align-items:center;gap:8px;display:flex}.dpe_quickAccountQuota_j5ekMa{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:11px;font-weight:600}.dpe_card_j5ekMa{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:16px;flex-direction:column;gap:12px;padding:16px;animation:.16s cubic-bezier(.22,1,.36,1) dpe_pset-in_j5ekMa;display:flex}.dpe_cardHead_j5ekMa{justify-content:space-between;align-items:center;gap:12px;display:flex}.dpe_cardTitleRow_j5ekMa{align-items:center;gap:12px;display:flex}.dpe_cardTitles_j5ekMa{flex-direction:column;gap:4px;display:flex}.dpe_cardTitle_j5ekMa{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:20px}.dpe_cardSubtitle_j5ekMa{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:16px}.dpe_badge_j5ekMa{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;padding:2px 9px;font-size:11px;line-height:16px}.dpe_badge_j5ekMa[data-state=ready]{color:var(--dsw-alias-state-success-primary)}.dpe_badge_j5ekMa[data-state=error],.dpe_badge_j5ekMa[data-state=absent]{color:var(--dsw-alias-state-warn-primary)}.dpe_note_j5ekMa{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:16px}.dpe_command_j5ekMa{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,ui-monospace, SFMono-Regular, Menlo, monospace);white-space:pre;border-radius:10px;padding:8px 10px;font-size:11px;line-height:18px;display:block;overflow-x:auto}.dpe_facts_j5ekMa{flex-wrap:wrap;gap:8px 24px;margin:0;display:flex}.dpe_facts_j5ekMa>div{flex-direction:column;gap:1px;min-width:120px;display:flex}.dpe_facts_j5ekMa dt{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}.dpe_facts_j5ekMa dd{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:18px}.dpe_error_j5ekMa{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:10px;margin:0;padding:8px 10px;font-size:12px;line-height:18px}.dpe_block_j5ekMa{flex-direction:column;gap:6px;display:flex}.dpe_blockTitle_j5ekMa{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}.dpe_blockHeadRow_j5ekMa{justify-content:space-between;align-items:center;gap:8px;display:flex}.dpe_quotaCards_j5ekMa{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;display:grid}.dpe_quotaCard_j5ekMa{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;flex-direction:column;gap:8px;padding:10px 12px;display:flex}.dpe_quotaGroupTitle_j5ekMa{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;line-height:18px}.dpe_quotaWindows_j5ekMa{flex-direction:column;gap:6px;display:flex}.dpe_quotaWindowItem_j5ekMa{flex-direction:column;gap:4px;display:flex}.dpe_quotaWindowHead_j5ekMa{justify-content:space-between;align-items:center;gap:6px;font-size:11px;display:flex}.dpe_quotaWindowLabel_j5ekMa{color:var(--dsw-alias-label-secondary);font-weight:500}.dpe_quotaResetTime_j5ekMa{color:var(--dsw-alias-label-caption);font-size:10px}.dpe_quotaBar_j5ekMa{background:var(--dsw-alias-interactive-bg-hover);border:none;border-radius:3px;width:100%;height:6px;overflow:hidden}.dpe_quotaBar_j5ekMa::-webkit-progress-bar{background:var(--dsw-alias-interactive-bg-hover);border-radius:3px}.dpe_quotaBar_j5ekMa::-webkit-progress-value{background:var(--dsw-alias-brand-primary);border-radius:3px}.dpe_modelToggleRow_j5ekMa{align-items:center;gap:10px;display:flex}.dpe_switch_j5ekMa{box-sizing:border-box;cursor:pointer;user-select:none;flex:none;width:36px;height:20px;display:inline-block;position:relative}.dpe_switch_j5ekMa input{opacity:0;width:0;height:0;position:absolute}.dpe_switchSlider_j5ekMa{box-sizing:border-box;cursor:pointer;corner-shape:round;background-color:var(--dsw-alias-border-l3,#7d7d7d4d);border:0;border-radius:999px;transition:background-color .14s;position:absolute;inset:0}.dpe_switchSlider_j5ekMa:before{box-sizing:border-box;content:"";background-color:var(--dsw-alias-label-primary-foreground,#fff);corner-shape:round;border-radius:50%;width:16px;height:16px;transition:transform .14s cubic-bezier(.22,1,.36,1);position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #00000040}.dpe_switch_j5ekMa:focus-visible .dpe_switchSlider_j5ekMa{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.dpe_switch_j5ekMa input:checked+.dpe_switchSlider_j5ekMa{background-color:var(--dsw-alias-brand-primary,#0f0f11)}.dpe_switch_j5ekMa input:checked+.dpe_switchSlider_j5ekMa:before{background-color:var(--dsw-alias-label-primary-foreground,#fff);transform:translate(16px)}.dpe_accountCardButton_j5ekMa{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);box-sizing:border-box;text-align:left;cursor:pointer;border-radius:14px;outline:none;flex-direction:column;gap:8px;width:100%;padding:10px 12px;transition:background-color .16s,border-color .16s;display:flex}.dpe_accountCardButton_j5ekMa:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}.dpe_accountCardButton_j5ekMa:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dpe_accountCardTop_j5ekMa{justify-content:space-between;align-items:center;gap:12px;width:100%;display:flex}.dpe_accountIdentityCol_j5ekMa{flex-direction:column;flex:auto;gap:2px;min-width:0;display:flex}.dpe_accountTitleRow_j5ekMa{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.dpe_accountName_j5ekMa{color:var(--dsw-alias-label-primary);cursor:pointer;border:1px solid #0000;border-radius:6px;align-items:center;gap:4px;margin:-3px -8px;padding:2px 7px;font-size:13px;font-weight:600;line-height:20px;transition:background-color .14s,border-color .14s,color .14s;display:inline-flex}.dpe_accountName_j5ekMa:hover{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}.dpe_accountName_j5ekMa:hover:after{content:"✎";color:var(--dsw-alias-label-caption);opacity:.8;font-size:11px}.dpe_accountSubRow_j5ekMa{color:var(--dsw-alias-label-tertiary);align-items:center;gap:8px;font-size:11px;display:flex}.dpe_accountTierBadge_j5ekMa{letter-spacing:.02em;border-radius:5px;align-items:center;padding:1px 7px;font-size:10px;font-weight:600;line-height:15px;display:inline-flex}.dpe_accountTierBadge_j5ekMa[data-tier=Ultra]{color:#a78bfa;background:#8b5cf626;border:1px solid #8b5cf64d}.dpe_accountTierBadge_j5ekMa[data-tier=Pro]{color:#60a5fa;background:#3b82f626;border:1px solid #3b82f64d}.dpe_accountTierBadge_j5ekMa[data-tier=Free]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-caption);border:1px solid var(--dsw-alias-border-l2)}.dpe_renameInput_j5ekMa{border:1px solid var(--dsw-alias-brand-primary,#3b82f6);background:var(--dsw-alias-bg-base);height:24px;color:var(--dsw-alias-label-primary);border-radius:6px;outline:none;margin:-3px -8px;padding:0 7px;font-size:13px;font-weight:600;line-height:22px;box-shadow:0 0 0 2px #3b82f633}.dpe_deleteConfirmRow_j5ekMa{align-items:center;gap:6px;display:flex}.dpe_deleteConfirmPrompt_j5ekMa{color:var(--dsw-alias-state-warn-primary,#ef4444);font-size:11px;font-weight:500}.dpe_danger_j5ekMa{color:#fff!important;background:#ef4444!important;border-color:#ef4444!important}.dpe_danger_j5ekMa:hover{background:#dc2626!important;border-color:#dc2626!important}.dpe_accountChevron_j5ekMa{color:var(--dsw-alias-label-caption);justify-content:center;align-items:center;font-size:12px;transition:transform .18s cubic-bezier(.22,1,.36,1);display:inline-flex}.dpe_accountChevron_j5ekMa[data-open=true]{transform:rotate(180deg)}.dpe_accountExpandQuota_j5ekMa{background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2);cursor:default;border-radius:10px;flex-direction:column;gap:8px;margin-top:4px;padding:10px 12px;display:flex}.dpe_accountModelsBlock_j5ekMa{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;margin-top:8px;padding-top:8px;display:flex}.dpe_models_j5ekMa,.dpe_accounts_j5ekMa{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.dpe_models_j5ekMa>li,.dpe_account_j5ekMa{background:var(--dsw-alias-bg-layer-2);border-radius:10px;justify-content:space-between;align-items:center;gap:12px;min-height:30px;padding:6px 10px;display:flex}.dpe_account_j5ekMa{min-height:42px}.dpe_accountIdentity_j5ekMa,.dpe_accountMeta_j5ekMa{flex-direction:column;gap:1px;min-width:0;display:flex}.dpe_accountMeta_j5ekMa{flex:none;align-items:flex-end}.dpe_modelName_j5ekMa{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}.dpe_modelState_j5ekMa{color:var(--dsw-alias-label-caption);flex:none;font-size:11px;line-height:16px}.dpe_modelState_j5ekMa[data-state=live-available]{color:var(--dsw-alias-state-success-primary)}.dpe_modelState_j5ekMa[data-state=unavailable]{color:var(--dsw-alias-state-warn-primary)}.dpe_catalog_j5ekMa{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:14px;flex-direction:column;gap:10px;padding:12px 14px;animation:.16s cubic-bezier(.22,1,.36,1) dpe_pset-in_j5ekMa;display:flex}.dpe_catalogRow_j5ekMa{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;display:flex}.dpe_catalogCopy_j5ekMa{flex-direction:column;gap:2px;min-width:0;display:flex}@keyframes dpe_pset-in_j5ekMa{0%{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.dpe_catalog_j5ekMa,.dpe_quickView_j5ekMa,.dpe_card_j5ekMa{animation:none}.dpe_action_j5ekMa,.dpe_backButton_j5ekMa,.dpe_providerCard_j5ekMa{transition:none}}.dshDesktopNativeActions[data-placement=settings]{align-items:center;gap:6px;display:flex}.dshDesktopSettingsHeaderButton{border:1px solid var(--dsw-alias-border-l2);height:28px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;box-sizing:border-box;background:0 0;border-radius:14px;justify-content:center;align-items:center;padding:0 10px;font-size:12px;line-height:18px;transition:background-color .14s,color .14s,border-color .14s;display:inline-flex}.dshDesktopSettingsHeaderButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}.dshDesktopSettingsHeaderButton svg{width:14px;height:14px;margin-left:5px}.dpe_cockpitCurrentBadge_j5ekMa{color:var(--dsw-alias-state-success-primary);background:#10b98126;border:1px solid #10b98159;border-radius:999px;align-items:center;padding:1px 7px;font-size:11px;font-weight:600;line-height:16px;display:inline-flex}.dpe_cockpitPanel_j5ekMa{border-top:1px solid var(--dsw-alias-border-l1);flex-direction:column;gap:12px;margin-top:12px;padding-top:12px;display:flex}.dpe_cockpitSubRow_j5ekMa{justify-content:space-between;align-items:center;gap:8px;font-size:12px;display:flex}.dpe_cockpitTeam_j5ekMa{align-items:center;gap:6px;display:flex}.dpe_cockpitMuted_j5ekMa{color:var(--dsw-alias-label-tertiary)}.dpe_cockpitText_j5ekMa{color:var(--dsw-alias-label-primary);font-weight:500}.dpe_cockpitResetBtn_j5ekMa{color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:999px;align-items:center;gap:4px;padding:3px 10px;font-size:11px;font-weight:600;transition:all .14s;display:inline-flex}.dpe_cockpitResetBtn_j5ekMa:hover{background:#3b82f61f;border-color:#3b82f659}.dpe_cockpitResetBtn_j5ekMa:disabled{opacity:.5;cursor:not-allowed}.dpe_cockpitUserRow_j5ekMa{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;align-items:center;gap:8px;font-size:11px;display:flex;overflow:hidden}.dpe_cockpitDivider_j5ekMa{color:var(--dsw-alias-border-l2)}.dpe_cockpitQuotaSection_j5ekMa{flex-direction:column;gap:4px;display:flex}.dpe_cockpitQuotaHeader_j5ekMa{justify-content:space-between;align-items:center;display:flex}.dpe_cockpitQuotaTitle_j5ekMa{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:700}.dpe_cockpitQuotaVal5h_j5ekMa{color:var(--dwh-alias-label-primary,var(--dsw-alias-label-primary));font-size:13px;font-weight:700}.dpe_cockpitQuotaValWeekly_j5ekMa{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:700}.dpe_cockpitTrack_j5ekMa{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;height:6px;overflow:hidden}.dpe_cockpitFill5h_j5ekMa,.dpe_cockpitFillWeekly_j5ekMa{background:var(--dsw-alias-label-primary);border-radius:999px;height:100%;transition:width .24s}.dpe_cockpitTimeSub_j5ekMa{color:var(--dsw-alias-label-tertiary);margin-top:1px;font-size:11px}.dpe_cockpitSubBanner_j5ekMa{background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;font-size:12px;display:flex}.dpe_cockpitSubLeft_j5ekMa{color:var(--dsw-alias-label-primary);align-items:center;gap:6px;font-weight:600;display:flex}.dpe_cockpitSubRight_j5ekMa{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.dpe_opencodeConfigSection_j5ekMa{border-bottom:1px solid var(--dsw-alias-border-l1);flex-direction:column;gap:12px;padding:12px 0;display:flex}.dpe_fieldGroup_j5ekMa{flex-direction:column;gap:6px;display:flex}.dpe_fieldLabel_j5ekMa{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}.dpe_inputWithAction_j5ekMa{align-items:center;gap:8px;display:flex}.dpe_inputWithAction_j5ekMa .dpe_input_j5ekMa{flex:1}.dpe_saveActionRow_j5ekMa{align-items:center;gap:12px;margin-top:4px;display:flex}.dpe_saveSuccessMsg_j5ekMa{color:var(--dsw-alias-state-success-primary);font-size:12px}';
var ProviderSettings_default = { "account": "dpe_account_j5ekMa", "accountCardButton": "dpe_accountCardButton_j5ekMa", "accountCardTop": "dpe_accountCardTop_j5ekMa", "accountChevron": "dpe_accountChevron_j5ekMa", "accountExpandQuota": "dpe_accountExpandQuota_j5ekMa", "accountIdentity": "dpe_accountIdentity_j5ekMa", "accountIdentityCol": "dpe_accountIdentityCol_j5ekMa", "accountMeta": "dpe_accountMeta_j5ekMa", "accountModelsBlock": "dpe_accountModelsBlock_j5ekMa", "accountName": "dpe_accountName_j5ekMa", "accountSubRow": "dpe_accountSubRow_j5ekMa", "accountTierBadge": "dpe_accountTierBadge_j5ekMa", "accountTitleRow": "dpe_accountTitleRow_j5ekMa", "accounts": "dpe_accounts_j5ekMa", "action": "dpe_action_j5ekMa", "actions": "dpe_actions_j5ekMa", "backButton": "dpe_backButton_j5ekMa", "badge": "dpe_badge_j5ekMa", "block": "dpe_block_j5ekMa", "blockHeadRow": "dpe_blockHeadRow_j5ekMa", "blockTitle": "dpe_blockTitle_j5ekMa", "breadcrumb": "dpe_breadcrumb_j5ekMa", "breadcrumbCurrent": "dpe_breadcrumbCurrent_j5ekMa", "card": "dpe_card_j5ekMa", "cardHead": "dpe_cardHead_j5ekMa", "cardSubtitle": "dpe_cardSubtitle_j5ekMa", "cardTitle": "dpe_cardTitle_j5ekMa", "cardTitleRow": "dpe_cardTitleRow_j5ekMa", "cardTitles": "dpe_cardTitles_j5ekMa", "catalog": "dpe_catalog_j5ekMa", "catalogCopy": "dpe_catalogCopy_j5ekMa", "catalogRow": "dpe_catalogRow_j5ekMa", "cockpitCurrentBadge": "dpe_cockpitCurrentBadge_j5ekMa", "cockpitDivider": "dpe_cockpitDivider_j5ekMa", "cockpitFill5h": "dpe_cockpitFill5h_j5ekMa", "cockpitFillWeekly": "dpe_cockpitFillWeekly_j5ekMa", "cockpitMuted": "dpe_cockpitMuted_j5ekMa", "cockpitPanel": "dpe_cockpitPanel_j5ekMa", "cockpitQuotaHeader": "dpe_cockpitQuotaHeader_j5ekMa", "cockpitQuotaSection": "dpe_cockpitQuotaSection_j5ekMa", "cockpitQuotaTitle": "dpe_cockpitQuotaTitle_j5ekMa", "cockpitQuotaVal5h": "dpe_cockpitQuotaVal5h_j5ekMa", "cockpitQuotaValWeekly": "dpe_cockpitQuotaValWeekly_j5ekMa", "cockpitResetBtn": "dpe_cockpitResetBtn_j5ekMa", "cockpitSubBanner": "dpe_cockpitSubBanner_j5ekMa", "cockpitSubLeft": "dpe_cockpitSubLeft_j5ekMa", "cockpitSubRight": "dpe_cockpitSubRight_j5ekMa", "cockpitSubRow": "dpe_cockpitSubRow_j5ekMa", "cockpitTeam": "dpe_cockpitTeam_j5ekMa", "cockpitText": "dpe_cockpitText_j5ekMa", "cockpitTimeSub": "dpe_cockpitTimeSub_j5ekMa", "cockpitTrack": "dpe_cockpitTrack_j5ekMa", "cockpitUserRow": "dpe_cockpitUserRow_j5ekMa", "command": "dpe_command_j5ekMa", "danger": "dpe_danger_j5ekMa", "deleteConfirmPrompt": "dpe_deleteConfirmPrompt_j5ekMa", "deleteConfirmRow": "dpe_deleteConfirmRow_j5ekMa", "error": "dpe_error_j5ekMa", "facts": "dpe_facts_j5ekMa", "fieldGroup": "dpe_fieldGroup_j5ekMa", "fieldLabel": "dpe_fieldLabel_j5ekMa", "head": "dpe_head_j5ekMa", "headActions": "dpe_headActions_j5ekMa", "input": "dpe_input_j5ekMa", "inputWithAction": "dpe_inputWithAction_j5ekMa", "intro": "dpe_intro_j5ekMa", "modelName": "dpe_modelName_j5ekMa", "modelState": "dpe_modelState_j5ekMa", "modelToggleRow": "dpe_modelToggleRow_j5ekMa", "models": "dpe_models_j5ekMa", "navBack": "dpe_navBack_j5ekMa", "note": "dpe_note_j5ekMa", "opencodeConfigSection": "dpe_opencodeConfigSection_j5ekMa", "page": "dpe_page_j5ekMa", "primary": "dpe_primary_j5ekMa", "providerBadge": "dpe_providerBadge_j5ekMa", "providerCard": "dpe_providerCard_j5ekMa", "providerCardHead": "dpe_providerCardHead_j5ekMa", "providerIcon": "dpe_providerIcon_j5ekMa", "providerList": "dpe_providerList_j5ekMa", "providerMain": "dpe_providerMain_j5ekMa", "providerRight": "dpe_providerRight_j5ekMa", "providerSubtitle": "dpe_providerSubtitle_j5ekMa", "providerTitle": "dpe_providerTitle_j5ekMa", "providerTitles": "dpe_providerTitles_j5ekMa", "pset-in": "dpe_pset-in_j5ekMa", "quickAccountEmail": "dpe_quickAccountEmail_j5ekMa", "quickAccountIdentity": "dpe_quickAccountIdentity_j5ekMa", "quickAccountItem": "dpe_quickAccountItem_j5ekMa", "quickAccountLabel": "dpe_quickAccountLabel_j5ekMa", "quickAccountMeta": "dpe_quickAccountMeta_j5ekMa", "quickAccountQuota": "dpe_quickAccountQuota_j5ekMa", "quickAccounts": "dpe_quickAccounts_j5ekMa", "quickView": "dpe_quickView_j5ekMa", "quickViewHead": "dpe_quickViewHead_j5ekMa", "quickViewTitle": "dpe_quickViewTitle_j5ekMa", "quotaBar": "dpe_quotaBar_j5ekMa", "quotaCard": "dpe_quotaCard_j5ekMa", "quotaCards": "dpe_quotaCards_j5ekMa", "quotaGroupTitle": "dpe_quotaGroupTitle_j5ekMa", "quotaResetTime": "dpe_quotaResetTime_j5ekMa", "quotaWindowHead": "dpe_quotaWindowHead_j5ekMa", "quotaWindowItem": "dpe_quotaWindowItem_j5ekMa", "quotaWindowLabel": "dpe_quotaWindowLabel_j5ekMa", "quotaWindows": "dpe_quotaWindows_j5ekMa", "renameInput": "dpe_renameInput_j5ekMa", "saveActionRow": "dpe_saveActionRow_j5ekMa", "saveSuccessMsg": "dpe_saveSuccessMsg_j5ekMa", "switch": "dpe_switch_j5ekMa", "switchSlider": "dpe_switchSlider_j5ekMa", "title": "dpe_title_j5ekMa" };

// src/client/ProviderSettings.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function phaseKey(phase) {
  switch (phase) {
    case "pending":
      return "antigravityPending";
    case "success":
      return "antigravitySuccess";
    case "cancelled":
      return "antigravityCancelled";
    case "expired":
      return "antigravityExpired";
    case "port-conflict":
      return "antigravityPortConflict";
    case "failed":
      return "antigravityFailed";
    default:
      return "antigravityIdle";
  }
}
function formatResetTime(iso) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const now = Date.now();
    const diffMs = d.getTime() - now;
    if (diffMs > 0 && diffMs < 864e5) {
      const hours = Math.floor(diffMs / 36e5);
      const mins = Math.floor(diffMs % 36e5 / 6e4);
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
function resolveAccountTier(account) {
  if (account.tier === "Ultra") return "Ultra";
  if (account.tier === "Free") return "Free";
  if (account.tier === "Pro") return "Pro";
  return "Pro";
}
function formatCockpitTime(epochSeconds) {
  if (!epochSeconds) return "满额可用";
  try {
    const target = new Date(epochSeconds * 1e3);
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return "即将重置";
    const totalMins = Math.floor(diffMs / 6e4);
    const days = Math.floor(totalMins / (24 * 60));
    const hours = Math.floor(totalMins % (24 * 60) / 60);
    const mins = totalMins % 60;
    let countdown = "";
    if (days > 0) countdown = `${days}d ${hours}h ${mins}m`;
    else if (hours > 0) countdown = `${hours}h ${mins}m`;
    else countdown = `${Math.max(1, mins)}m`;
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    const hh = String(target.getHours()).padStart(2, "0");
    const min = String(target.getMinutes()).padStart(2, "0");
    return `${countdown} (${mm}/${dd} ${hh}:${min})`;
  } catch {
    return "";
  }
}
function calcDaysRemaining(epochMs) {
  if (!epochMs) return "";
  const diffMs = epochMs - Date.now();
  if (diffMs <= 0) return "已过期";
  const days = Math.ceil(diffMs / (24 * 3600 * 1e3));
  return `${days}天`;
}
function formatDateTime(epochMs) {
  if (!epochMs) return "";
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
function ProviderSettings({
  useAccounts,
  useAntigravity,
  loadAccounts,
  loadCodexModels,
  readQuota,
  loginCodex,
  selectCodexAccount,
  renameCodexAccount,
  removeCodexAccount,
  resetCodexQuota,
  loadAntigravity,
  refreshAntigravityModels,
  loginAntigravity,
  logoutAntigravity,
  selectAntigravityAccount,
  updateAntigravityAccount,
  renameAntigravityAccount,
  removeAntigravityAccount,
  readAntigravityQuota,
  useOpencode,
  saveOpencodeConfig,
  readOpencodeUsage,
  refreshOpencodeModels,
  t
}) {
  const accounts = useAccounts((snapshot) => snapshot);
  const antigravity = useAntigravity((snapshot) => snapshot);
  const opencodeState = useOpencode ? useOpencode((s) => s) : {
    apiKey: "",
    baseURL: DEFAULT_OPENCODE_BASE_URL,
    configured: false,
    usageStatus: "idle",
    models: DEFAULT_OPENCODE_MODELS,
    modelsStatus: "idle"
  };
  const [stagedOpencodeKey, setStagedOpencodeKey] = (0, import_react2.useState)(() => {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(OPENCODE_API_KEY_STORAGE_KEY) || "" : "";
    } catch {
      return "";
    }
  });
  const [stagedOpencodeURL, setStagedOpencodeURL] = (0, import_react2.useState)(() => {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(OPENCODE_BASE_URL_STORAGE_KEY) || DEFAULT_OPENCODE_BASE_URL : DEFAULT_OPENCODE_BASE_URL;
    } catch {
      return DEFAULT_OPENCODE_BASE_URL;
    }
  });
  const [showOpencodeKey, setShowOpencodeKey] = (0, import_react2.useState)(false);
  const [opencodeSaveMsg, setOpencodeSaveMsg] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    if (opencodeState.apiKey && (!stagedOpencodeKey || stagedOpencodeKey !== opencodeState.apiKey)) {
      setStagedOpencodeKey(opencodeState.apiKey);
    }
    if (opencodeState.baseURL && stagedOpencodeURL === DEFAULT_OPENCODE_BASE_URL && opencodeState.baseURL !== DEFAULT_OPENCODE_BASE_URL) {
      setStagedOpencodeURL(opencodeState.baseURL);
    }
  }, [opencodeState.apiKey, opencodeState.baseURL]);
  const isOpencodeConfigured = Boolean(opencodeState.configured || stagedOpencodeKey.trim().length > 0);
  const handleSaveOpencode = () => {
    if (saveOpencodeConfig) {
      saveOpencodeConfig(stagedOpencodeKey, stagedOpencodeURL);
    } else {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(OPENCODE_API_KEY_STORAGE_KEY, stagedOpencodeKey.trim());
          window.localStorage.setItem(OPENCODE_BASE_URL_STORAGE_KEY, stagedOpencodeURL.trim());
        }
      } catch {
      }
    }
    setOpencodeSaveMsg(t("opencodeSaved"));
    setTimeout(() => setOpencodeSaveMsg(null), 3e3);
  };
  const [selectedProvider, setSelectedProvider] = (0, import_react2.useState)(null);
  const [expanded, setExpanded] = (0, import_react2.useState)({});
  const [disabledModels, setDisabledModels] = (0, import_react2.useState)(() => loadDisabledModels());
  const [accountDisabledMap, setAccountDisabledMap] = (0, import_react2.useState)(() => loadAccountDisabledModels());
  const [editingAccountId, setEditingAccountId] = (0, import_react2.useState)(null);
  const [editingAccountLabel, setEditingAccountLabel] = (0, import_react2.useState)("");
  const [editingCodexAccountId, setEditingCodexAccountId] = (0, import_react2.useState)(null);
  const [editingCodexAccountLabel, setEditingCodexAccountLabel] = (0, import_react2.useState)("");
  const [confirmingDeleteId, setConfirmingDeleteId] = (0, import_react2.useState)(null);
  const [expandedQuotaAccounts, setExpandedQuotaAccounts] = (0, import_react2.useState)({});
  const [expandedCodexQuotaAccounts, setExpandedCodexQuotaAccounts] = (0, import_react2.useState)({});
  const toggleCodexAccountQuota = (id) => {
    setExpandedCodexQuotaAccounts((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id] && (!accounts.usage[id] || accounts.usage[id]?.status === "error")) {
        void readQuota(id).catch(() => {
        });
      }
      return next;
    });
  };
  const startRenameCodex = (id, currentLabel) => {
    setEditingCodexAccountId(id);
    setEditingCodexAccountLabel(currentLabel);
  };
  const saveRenameCodex = async (id) => {
    if (editingCodexAccountLabel.trim() && renameCodexAccount) {
      await renameCodexAccount(id, editingCodexAccountLabel.trim());
    }
    setEditingCodexAccountId(null);
  };
  (0, import_react2.useEffect)(() => {
    const handleVisibilityChange = () => {
      setDisabledModels(loadDisabledModels());
      setAccountDisabledMap(loadAccountDisabledModels());
    };
    window.addEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange);
    return () => {
      window.removeEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange);
    };
  }, []);
  const [catalogRefresh, setCatalogRefresh] = (0, import_react2.useState)(0);
  const [codexCatalog, setCodexCatalog] = (0, import_react2.useState)({ models: [] });
  const activeCodexId = accounts.accounts.find((account) => account.active)?.id;
  const codexOpen = selectedProvider === "codex" || expanded.codex === true;
  (0, import_react2.useEffect)(() => {
    if (!codexOpen || !activeCodexId || accounts.switchingId !== void 0 || !loadCodexModels) return;
    let cancelled = false;
    setCodexCatalog({ models: [] });
    void loadCodexModels().then((models) => {
      if (!cancelled) setCodexCatalog({ accountId: activeCodexId, models });
    }).catch((error) => {
      if (!cancelled) setCodexCatalog({ accountId: activeCodexId, models: [], error: String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [codexOpen, activeCodexId, accounts.switchingId, loadCodexModels, catalogRefresh]);
  const refreshCodexModels = () => setCatalogRefresh((value) => value + 1);
  const refreshCodex = () => {
    void loadAccounts();
    refreshCodexModels();
  };
  const renderCodexModels = (account) => {
    if (!account.active) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("codexModelsInactive") });
    if (accounts.switchingId !== void 0 || codexCatalog.accountId !== account.id) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("providerChecking") });
    }
    if (codexCatalog.error) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.error, role: "alert", children: codexCatalog.error });
    const enabled = codexEnabledModels(account.id, account.email);
    const disabled = getDisabledModelsForAccount(account.id, account.email);
    const missing = [...enabled ?? []].filter((id) => !codexCatalog.models.some((model) => model.id === id));
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("codexModelsScope") }),
      missing.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("codexModelsMissing", { models: missing.join(", ") }) }) : null,
      codexCatalog.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("empty") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ProviderSettings_default.models, children: codexCatalog.models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.modelName, children: model.name }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.modelToggleRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: ProviderSettings_default.switch, title: t("modelToggle"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              type: "checkbox",
              "aria-label": model.name,
              checked: enabled ? enabled.has(model.id) : !disabled.has(model.id),
              onChange: () => {
                const next = enabled ?? new Set(codexCatalog.models.filter((entry) => !disabled.has(entry.id)).map((entry) => entry.id));
                if (next.has(model.id)) next.delete(model.id);
                else next.add(model.id);
                saveCodexEnabledModels(account.id, account.email, next);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.switchSlider })
        ] }) })
      ] }, model.id)) })
    ] });
  };
  const toggleAccountModel = (accountId, modelId, email) => {
    setAccountDisabledMap((prev) => {
      const currentList = prev[accountId] ?? (email ? prev[email] : void 0) ?? [];
      const nextList = currentList.includes(modelId) ? currentList.filter((id) => id !== modelId) : [...currentList, modelId];
      const nextMap = { ...prev, [accountId]: nextList };
      if (email) nextMap[email] = nextList;
      saveAccountDisabledModels(nextMap);
      return nextMap;
    });
  };
  const toggleModel = (id) => {
    const next = new Set(disabledModels);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDisabledModels(next);
    saveDisabledModels(next);
  };
  const toggleAccountQuota = (id) => {
    setExpandedQuotaAccounts((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id] && !agUsage[id]) {
        void readAntigravityQuota?.(id);
      }
      return next;
    });
  };
  const startRename = (id, currentLabel) => {
    setEditingAccountId(id);
    setEditingAccountLabel(currentLabel);
  };
  const saveRename = async (id) => {
    if (editingAccountLabel.trim() && renameAntigravityAccount) {
      await renameAntigravityAccount(id, editingAccountLabel.trim());
    }
    setEditingAccountId(null);
  };
  const login = antigravity?.view?.login;
  const agAccounts = antigravity?.accounts ?? [];
  const agUsage = antigravity?.usage ?? {};
  const antigravityConnected = login?.configured === true;
  const codexConnected = accounts.accounts.length > 0;
  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const refreshAll = () => {
    void loadAccounts();
    void loadAntigravity();
  };
  (0, import_react2.useEffect)(() => {
    void loadAccounts();
    void loadAntigravity();
  }, [loadAccounts, loadAntigravity]);
  if (selectedProvider !== null) {
    const providerTitles = {
      codex: t("providerCodex"),
      antigravity: t("providerAntigravity"),
      claude: t("providerClaude"),
      opencode: t("providerOpenCode")
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: ProviderSettings_default.page, "data-testid": "provider-settings-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.navBack, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            className: ProviderSettings_default.backButton,
            onClick: () => setSelectedProvider(null),
            children: [
              "← ",
              t("backToProviders")
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.breadcrumb, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("settingsNav") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "/" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.breadcrumbCurrent, children: providerTitles[selectedProvider] })
        ] })
      ] }),
      selectedProvider === "codex" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cardHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cardTitle, children: t("providerCodex") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.badge, "data-state": codexConnected ? "ready" : "idle", children: accounts.status === "error" ? t("providerError") : t("accountCount", { count: accounts.accounts.length }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
              disabled: accounts.loginPending === true,
              onClick: () => {
                void loginCodex().catch(() => {
                });
              },
              children: accounts.loginPending === true ? t("providerWorking") : t("addAccount")
            }
          ),
          typeof accounts.loginUrl === "string" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { className: ProviderSettings_default.action, href: accounts.loginUrl, target: "_blank", rel: "noreferrer", children: t("codexOpenLink") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: ProviderSettings_default.action, onClick: refreshCodex, children: t("providerRefresh") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: ProviderSettings_default.action,
              disabled: !codexConnected || accounts.switchingId !== void 0 || codexCatalog.accountId !== activeCodexId,
              onClick: refreshCodexModels,
              children: codexConnected && codexCatalog.accountId !== activeCodexId ? t("codexModelsRefreshing") : t("codexFetchModels")
            }
          )
        ] }),
        accounts.accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("codexNoAccounts") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.accounts, children: accounts.accounts.map((account) => {
          const usage = accounts.usage[account.id];
          const usageVal = usage?.status === "ready" ? usage.value : void 0;
          const weekly = usageVal?.weeklyPercent;
          const email = maskedEmail(account.email);
          const isEditing = editingCodexAccountId === account.id;
          const isQuotaOpen = expandedCodexQuotaAccounts[account.id] === true;
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "div",
            {
              className: ProviderSettings_default.accountCardButton,
              role: "button",
              "aria-label": isQuotaOpen ? t("quotaHide") : t("quotaView"),
              tabIndex: 0,
              onClick: () => toggleCodexAccountQuota(account.id),
              onKeyDown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCodexAccountQuota(account.id);
                }
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountCardTop, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountIdentityCol, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountTitleRow, children: [
                      isEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "input",
                        {
                          className: ProviderSettings_default.renameInput,
                          value: editingCodexAccountLabel,
                          onChange: (e) => setEditingCodexAccountLabel(e.target.value),
                          onClick: (e) => e.stopPropagation(),
                          onBlur: () => {
                            void saveRenameCodex(account.id);
                          },
                          onKeyDown: (e) => {
                            if (e.key === "Enter") void saveRenameCodex(account.id);
                            if (e.key === "Escape") setEditingCodexAccountId(null);
                          },
                          autoFocus: true
                        }
                      ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "span",
                        {
                          className: ProviderSettings_default.accountName,
                          onClick: (e) => {
                            e.stopPropagation();
                            startRenameCodex(account.id, account.label);
                          },
                          title: "点击直接重命名",
                          children: account.label
                        }
                      ),
                      account.active ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitCurrentBadge, children: t("accountCurrent") }) : null,
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountTierBadge, "data-tier": "Pro", children: account.planType ?? "PLUS" }),
                      weekly !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountTierBadge, "data-tier": "Pro", children: t("weeklyQuota", { value: weekly }) }) : null
                    ] }),
                    email === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.note, children: email })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, onClick: (e) => e.stopPropagation(), children: [
                    confirmingDeleteId === account.id ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.deleteConfirmRow, onClick: (e) => e.stopPropagation(), children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.deleteConfirmPrompt, children: t("confirmDelete") }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "button",
                        {
                          type: "button",
                          className: `${ProviderSettings_default.action} ${ProviderSettings_default.danger}`,
                          onClick: (e) => {
                            e.stopPropagation();
                            setConfirmingDeleteId(null);
                            void removeCodexAccount(account.id).catch(() => {
                            });
                          },
                          children: t("confirmYes")
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "button",
                        {
                          type: "button",
                          className: ProviderSettings_default.action,
                          onClick: (e) => {
                            e.stopPropagation();
                            setConfirmingDeleteId(null);
                          },
                          children: t("confirmNo")
                        }
                      )
                    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "button",
                      {
                        type: "button",
                        className: ProviderSettings_default.action,
                        disabled: accounts.switchingId !== void 0,
                        onClick: (e) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(account.id);
                        },
                        children: t("accountRemove")
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountChevron, "data-open": isQuotaOpen, children: "▼" })
                  ] })
                ] }),
                isQuotaOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitPanel, onClick: (e) => e.stopPropagation(), children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitSubRow, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitTeam, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitMuted, children: "Team Name:" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitText, children: "个人账户" })
                    ] }),
                    usage?.status === "ready" && usage.value.resetCredits !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                      "button",
                      {
                        type: "button",
                        className: ProviderSettings_default.cockpitResetBtn,
                        onClick: (e) => {
                          e.stopPropagation();
                          if (resetCodexQuota) void resetCodexQuota(account.id);
                        },
                        title: "消耗重置额度重置 5h 额度",
                        children: [
                          "⟳ 重置 ",
                          usage.value.resetCredits
                        ]
                      }
                    ) : null
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitUserRow, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "使用 Google / Password 登录" }),
                    account.accountId ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitDivider, children: "|" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { title: account.accountId, children: [
                        "用户 ID: ",
                        account.accountId.slice(0, 18),
                        "..."
                      ] })
                    ] }) : null
                  ] }),
                  (!account.planType || account.planType.toUpperCase() !== "PRO") && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaSection, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaHeader, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitQuotaTitle, children: "5h" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: ProviderSettings_default.cockpitQuotaVal5h, children: [
                        usageVal?.shortPercent ?? 100,
                        "%"
                      ] })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "div",
                      {
                        className: ProviderSettings_default.cockpitFill5h,
                        style: { width: `${Math.min(100, Math.max(0, usageVal?.shortPercent ?? 100))}%` }
                      }
                    ) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTimeSub, children: formatCockpitTime(usageVal?.shortResetsAt) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaSection, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaHeader, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitQuotaTitle, children: "Weekly" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: ProviderSettings_default.cockpitQuotaValWeekly, children: [
                        usageVal?.weeklyPercent ?? 100,
                        "%"
                      ] })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "div",
                      {
                        className: ProviderSettings_default.cockpitFillWeekly,
                        style: { width: `${Math.min(100, Math.max(0, usageVal?.weeklyPercent ?? 100))}%` }
                      }
                    ) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTimeSub, children: formatCockpitTime(usageVal?.weeklyResetsAt) })
                  ] }),
                  account.subscriptionUntil ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitSubBanner, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitSubLeft, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                      "订阅有效期 ",
                      calcDaysRemaining(new Date(account.subscriptionUntil).getTime())
                    ] }) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitSubRight, children: formatDateTime(new Date(account.subscriptionUntil).getTime()) })
                  ] }) : null,
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountModelsBlock, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.blockHeadRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("codexModels") }) }),
                    renderCodexModels(account)
                  ] }),
                  usage?.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaErrorRow, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.note, children: t("quotaFailedShort") }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "button",
                      {
                        type: "button",
                        className: ProviderSettings_default.action,
                        onClick: () => {
                          void readQuota(account.id).catch(() => {
                          });
                        },
                        children: t("readQuota")
                      }
                    )
                  ] })
                ] })
              ]
            },
            account.id
          );
        }) })
      ] }),
      selectedProvider === "antigravity" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cardHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cardTitle, children: t("providerAntigravity") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.badge, "data-state": antigravityConnected ? "ready" : "idle", children: antigravity.status === "error" ? t("providerError") : antigravity.status === "checking" ? t("providerChecking") : antigravityConnected ? t("providerStatusConnected") : t("providerStatusIdle") })
        ] }),
        antigravity.status === "absent" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("antigravityInstallHint") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                disabled: antigravity.busy === true || login?.phase === "pending",
                onClick: () => {
                  void loginAntigravity().catch(() => {
                  });
                },
                children: antigravity.busy === true ? t("providerWorking") : t("addAccount")
              }
            ),
            typeof login?.authorizationUrl === "string" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { className: ProviderSettings_default.action, href: login.authorizationUrl, target: "_blank", rel: "noreferrer", children: t("antigravityOpenLink") }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: ProviderSettings_default.action, onClick: () => {
              void loadAntigravity();
            }, children: t("providerRefresh") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: ProviderSettings_default.action,
                disabled: !antigravityConnected || antigravity.modelsRefreshing === true || antigravity.switchingId !== void 0,
                onClick: () => {
                  void refreshAntigravityModels().catch(() => {
                  });
                },
                children: antigravity.modelsRefreshing === true ? t("antigravityModelsRefreshing") : t("antigravityFetchModels")
              }
            )
          ] }),
          antigravity.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.error, role: "alert", children: antigravity.error }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.block, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.blockHeadRow, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.blockTitle, children: t("antigravityAccounts") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.badge, children: t("accountCount", { count: agAccounts.length }) })
            ] }),
            agAccounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("antigravityNoAccounts") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.accounts, children: agAccounts.map((account) => {
              const email = account.email ? maskedEmail(account.email) : account.active && login?.maskedEmail ? login.maskedEmail : "Google 账号已绑定";
              const tier = resolveAccountTier(account);
              const isEditing = editingAccountId === account.id;
              const isQuotaOpen = expandedQuotaAccounts[account.id] === true;
              const quota = agUsage[account.id] ?? (account.active ? agUsage["default"] : void 0);
              return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  className: ProviderSettings_default.accountCardButton,
                  role: "button",
                  "aria-label": isQuotaOpen ? t("quotaHide") : t("quotaView"),
                  tabIndex: 0,
                  onClick: () => toggleAccountQuota(account.id),
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleAccountQuota(account.id);
                    }
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountCardTop, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountIdentityCol, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountTitleRow, children: [
                          isEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                            "input",
                            {
                              className: ProviderSettings_default.renameInput,
                              value: editingAccountLabel,
                              onChange: (e) => setEditingAccountLabel(e.target.value),
                              onClick: (e) => e.stopPropagation(),
                              onKeyDown: (e) => {
                                if (e.key === "Enter") void saveRename(account.id);
                                if (e.key === "Escape") setEditingAccountId(null);
                              },
                              autoFocus: true
                            }
                          ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                            "span",
                            {
                              className: ProviderSettings_default.accountName,
                              onClick: (e) => {
                                e.stopPropagation();
                                startRename(account.id, account.label);
                              },
                              title: "点击直接重命名",
                              children: account.label
                            }
                          ),
                          account.active ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitCurrentBadge, children: t("accountCurrent") }) : null,
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountTierBadge, "data-tier": tier, children: tier })
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.note, children: email })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, onClick: (e) => e.stopPropagation(), children: [
                        isEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: ProviderSettings_default.action, onClick: () => {
                            void saveRename(account.id);
                          }, children: t("renameSave") }),
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: ProviderSettings_default.action, onClick: () => setEditingAccountId(null), children: t("renameCancel") })
                        ] }) : null,
                        removeAntigravityAccount ? confirmingDeleteId === account.id ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.deleteConfirmRow, onClick: (e) => e.stopPropagation(), children: [
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.deleteConfirmPrompt, children: t("confirmDelete") }),
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                            "button",
                            {
                              type: "button",
                              className: `${ProviderSettings_default.action} ${ProviderSettings_default.danger}`,
                              onClick: () => {
                                setConfirmingDeleteId(null);
                                void removeAntigravityAccount(account.id);
                              },
                              children: t("confirmYes")
                            }
                          ),
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                            "button",
                            {
                              type: "button",
                              className: ProviderSettings_default.action,
                              onClick: () => setConfirmingDeleteId(null),
                              children: t("confirmNo")
                            }
                          )
                        ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "button",
                          {
                            type: "button",
                            className: ProviderSettings_default.action,
                            disabled: antigravity.switchingId !== void 0,
                            onClick: (e) => {
                              e.stopPropagation();
                              setConfirmingDeleteId(account.id);
                            },
                            children: t("accountRemove")
                          }
                        ) : null,
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountChevron, "data-open": isQuotaOpen, children: "▼" })
                      ] })
                    ] }),
                    isQuotaOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountExpandQuota, onClick: (e) => e.stopPropagation(), children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.blockHeadRow, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("quotaBalance") }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "button",
                          {
                            type: "button",
                            className: ProviderSettings_default.action,
                            onClick: () => {
                              void readAntigravityQuota?.(account.id);
                            },
                            children: t("readQuota")
                          }
                        )
                      ] }),
                      quota?.groups && quota.groups.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quotaCards, children: quota.groups.map((group) => {
                        const groupTitle = group.group === "gemini" ? t("quotaGemini") : t("quotaClaude");
                        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaCard, children: [
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: groupTitle }),
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quotaWindows, children: group.windows.map((win) => {
                            const pct = Math.round(win.remainingFraction * 100);
                            const label = win.window === "5h" ? t("quota5h", { value: pct }) : t("quotaWeeklyFraction", { value: pct });
                            const resetText = win.resetTime ? formatResetTime(win.resetTime) : "";
                            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaWindowItem, children: [
                              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaWindowHead, children: [
                                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaWindowLabel, children: label }),
                                resetText ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaResetTime, children: t("quotaResetAt", { time: resetText }) }) : null
                              ] }),
                              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("progress", { className: ProviderSettings_default.quotaBar, max: 100, value: pct })
                            ] }, win.window);
                          }) })
                        ] }, group.group);
                      }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("quotaNoData") }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountModelsBlock, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.blockHeadRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("antigravityModels") }) }),
                        antigravity.models === void 0 || antigravity.models.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("antigravityNoModels") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ProviderSettings_default.models, children: antigravity.models.models.map((model) => {
                          const isModelDisabled = (accountDisabledMap[account.id]?.includes(model.id) || (account.email ? accountDisabledMap[account.email]?.includes(model.id) : false)) === true;
                          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
                            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.modelName, children: model.name }),
                            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.modelToggleRow, children: [
                              model.state === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.modelState, "data-state": "unavailable", children: t("antigravityModelUnavailable") }) : null,
                              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: ProviderSettings_default.switch, title: t("modelToggle"), children: [
                                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                                  "input",
                                  {
                                    type: "checkbox",
                                    checked: !isModelDisabled,
                                    onChange: () => toggleAccountModel(account.id, model.id, account.email)
                                  }
                                ),
                                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.switchSlider })
                              ] })
                            ] })
                          ] }, model.id);
                        }) })
                      ] })
                    ] }) : null
                  ]
                },
                account.id
              );
            }) })
          ] })
        ] })
      ] }),
      selectedProvider === "opencode" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cardHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cardTitleRow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.providerIcon, "data-provider": "opencode", children: "OC" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cardTitles, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cardTitle, children: t("providerOpenCode") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cardSubtitle, children: t("providerOpenCodeDesc") })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerBadge, "data-status": isOpencodeConfigured ? "ready" : "idle", children: isOpencodeConfigured ? t("opencodeConfigured") : t("opencodeNotConfigured") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.opencodeConfigSection, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.fieldGroup, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: ProviderSettings_default.fieldLabel, children: t("opencodeApiKey") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.inputWithAction, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: showOpencodeKey ? "text" : "password",
                  className: ProviderSettings_default.input,
                  placeholder: t("opencodeApiKeyPlaceholder"),
                  value: stagedOpencodeKey,
                  onChange: (e) => setStagedOpencodeKey(e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: ProviderSettings_default.action,
                  onClick: () => setShowOpencodeKey(!showOpencodeKey),
                  children: showOpencodeKey ? "隐藏" : "显示"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.fieldGroup, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: ProviderSettings_default.fieldLabel, children: t("opencodeBaseUrl") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.inputWithAction, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: "text",
                  className: ProviderSettings_default.input,
                  value: stagedOpencodeURL,
                  onChange: (e) => setStagedOpencodeURL(e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: ProviderSettings_default.action,
                  onClick: () => setStagedOpencodeURL(DEFAULT_OPENCODE_BASE_URL),
                  children: t("opencodeResetDefault")
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.saveActionRow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                onClick: handleSaveOpencode,
                children: t("opencodeSave")
              }
            ),
            opencodeSaveMsg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.saveSuccessMsg, children: opencodeSaveMsg })
          ] })
        ] }),
        opencodeState.usage && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitPanel, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.blockHeadRow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("opencodeUsage") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: ProviderSettings_default.action,
                onClick: () => {
                  void readOpencodeUsage?.();
                },
                children: t("providerRefresh")
              }
            )
          ] }),
          opencodeState.usage.rolling && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaHeader, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitQuotaTitle, children: "5h" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: ProviderSettings_default.cockpitQuotaVal5h, children: [
                opencodeState.usage.rolling.percent,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "div",
              {
                className: ProviderSettings_default.cockpitFill5h,
                style: { width: `${Math.min(100, Math.max(0, opencodeState.usage.rolling.percent))}%` }
              }
            ) })
          ] }),
          opencodeState.usage.weekly && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaHeader, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitQuotaTitle, children: "Weekly" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: ProviderSettings_default.cockpitQuotaValWeekly, children: [
                opencodeState.usage.weekly.percent,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "div",
              {
                className: ProviderSettings_default.cockpitFillWeekly,
                style: { width: `${Math.min(100, Math.max(0, opencodeState.usage.weekly.percent))}%` }
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountModelsBlock, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.blockHeadRow, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("opencodeModels") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: ProviderSettings_default.action,
                onClick: () => {
                  void refreshOpencodeModels?.();
                },
                children: t("providerRefresh")
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ProviderSettings_default.models, children: opencodeState.models.map((model) => {
            const isModelDisabled = disabledModels.has(model.id);
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.modelName, children: model.name }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.modelToggleRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: ProviderSettings_default.switch, title: t("modelToggle"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: !isModelDisabled,
                    onChange: () => toggleModel(model.id)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.switchSlider })
              ] }) })
            ] }, model.id);
          }) })
        ] })
      ] }),
      selectedProvider !== "codex" && selectedProvider !== "antigravity" && selectedProvider !== "opencode" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cardHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cardTitle, children: providerTitles[selectedProvider] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.badge, "data-state": "roadmap", children: t("providerStatusRoadmap") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("roadmapNotice") })
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: ProviderSettings_default.page, "data-testid": "provider-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("header", { className: ProviderSettings_default.head, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: ProviderSettings_default.title, children: t("settingsNav") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.intro, children: t("providersIntro") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerList, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.providerCard, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: ProviderSettings_default.providerCardHead,
            onClick: () => toggleExpand("antigravity"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerMain, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.providerIcon, "data-provider": "antigravity", children: "AG" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerTitles, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerTitle, children: t("providerAntigravity") }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerSubtitle, children: login?.configured ? `${t("antigravitySuccess")} · ${t("antigravityProject")}: ${login.projectAvailable ? t("antigravityProjectReady") : t("antigravityProjectUnavailable")}` : t(phaseKey(login?.phase)) })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerRight, onClick: (e) => e.stopPropagation(), children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerBadge, "data-status": antigravityConnected ? "ready" : "idle", children: antigravityConnected ? t("providerStatusConnected") : t("providerStatusIdle") }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                    onClick: () => setSelectedProvider("antigravity"),
                    children: [
                      t("providerManage"),
                      " →"
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    className: ProviderSettings_default.accountChevron,
                    "data-open": expanded.antigravity,
                    onClick: () => toggleExpand("antigravity"),
                    children: "▼"
                  }
                )
              ] })
            ]
          }
        ),
        expanded.antigravity && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quickView, children: antigravity.status === "absent" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("antigravityInstallHint") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                disabled: antigravity.busy === true || login?.phase === "pending",
                onClick: () => {
                  void loginAntigravity().catch(() => {
                  });
                },
                children: antigravity.busy === true ? t("providerWorking") : t("addAccount")
              }
            ),
            typeof login?.authorizationUrl === "string" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { className: ProviderSettings_default.action, href: login.authorizationUrl, target: "_blank", rel: "noreferrer", children: t("antigravityOpenLink") }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: ProviderSettings_default.action, onClick: () => {
              void loadAntigravity();
            }, children: t("providerRefresh") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: ProviderSettings_default.action,
                disabled: !antigravityConnected || antigravity.modelsRefreshing === true || antigravity.switchingId !== void 0,
                onClick: () => {
                  void refreshAntigravityModels().catch(() => {
                  });
                },
                children: antigravity.modelsRefreshing === true ? t("antigravityModelsRefreshing") : t("antigravityFetchModels")
              }
            )
          ] }),
          agAccounts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.block, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.blockTitle, children: t("antigravityAccounts") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.accounts, children: agAccounts.map((account) => {
              const email = account.email ? maskedEmail(account.email) : account.active && login?.maskedEmail ? login.maskedEmail : "Google 账号已绑定";
              const tier = resolveAccountTier(account);
              const isQuotaOpen = expandedQuotaAccounts[account.id] === true;
              const quota = agUsage[account.id] ?? (account.active ? agUsage["default"] : void 0);
              return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  className: ProviderSettings_default.accountCardButton,
                  role: "button",
                  "aria-label": isQuotaOpen ? t("quotaHide") : t("quotaView"),
                  tabIndex: 0,
                  onClick: () => toggleAccountQuota(account.id),
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleAccountQuota(account.id);
                    }
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountCardTop, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountIdentityCol, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountTitleRow, children: [
                          editingAccountId === account.id ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                            "input",
                            {
                              className: ProviderSettings_default.renameInput,
                              value: editingAccountLabel,
                              onChange: (e) => setEditingAccountLabel(e.target.value),
                              onClick: (e) => e.stopPropagation(),
                              onBlur: () => {
                                void saveRename(account.id);
                              },
                              onKeyDown: (e) => {
                                if (e.key === "Enter") void saveRename(account.id);
                                if (e.key === "Escape") setEditingAccountId(null);
                              },
                              autoFocus: true
                            }
                          ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                            "span",
                            {
                              className: ProviderSettings_default.accountName,
                              onClick: (e) => {
                                e.stopPropagation();
                                startRename(account.id, account.label);
                              },
                              title: "点击直接重命名",
                              children: account.label
                            }
                          ),
                          account.active ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitCurrentBadge, children: t("accountCurrent") }) : null,
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountTierBadge, "data-tier": tier, children: tier })
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.note, children: email })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.actions, onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountChevron, "data-open": isQuotaOpen, children: "▼" }) })
                    ] }),
                    isQuotaOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountExpandQuota, onClick: (e) => e.stopPropagation(), children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.blockHeadRow, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("quotaBalance") }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "button",
                          {
                            type: "button",
                            className: ProviderSettings_default.action,
                            onClick: () => {
                              void readAntigravityQuota?.(account.id);
                            },
                            children: t("readQuota")
                          }
                        )
                      ] }),
                      quota?.groups && quota.groups.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quotaCards, children: quota.groups.map((group) => {
                        const groupTitle = group.group === "gemini" ? t("quotaGemini") : t("quotaClaude");
                        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaCard, children: [
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: groupTitle }),
                          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quotaWindows, children: group.windows.map((win) => {
                            const pct = Math.round(win.remainingFraction * 100);
                            const label = win.window === "5h" ? t("quota5h", { value: pct }) : t("quotaWeeklyFraction", { value: pct });
                            const resetText = win.resetTime ? formatResetTime(win.resetTime) : "";
                            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaWindowItem, children: [
                              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaWindowHead, children: [
                                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaWindowLabel, children: label }),
                                resetText ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaResetTime, children: t("quotaResetAt", { time: resetText }) }) : null
                              ] }),
                              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("progress", { className: ProviderSettings_default.quotaBar, max: 100, value: pct })
                            ] }, win.window);
                          }) })
                        ] }, group.group);
                      }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("quotaNoData") }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountModelsBlock, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.blockHeadRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("antigravityModels") }) }),
                        antigravity.models === void 0 || antigravity.models.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("antigravityNoModels") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ProviderSettings_default.models, children: antigravity.models.models.map((model) => {
                          const isModelDisabled = (accountDisabledMap[account.id]?.includes(model.id) || (account.email ? accountDisabledMap[account.email]?.includes(model.id) : false)) === true;
                          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
                            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.modelName, children: model.name }),
                            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.modelToggleRow, children: [
                              model.state === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.modelState, "data-state": "unavailable", children: t("antigravityModelUnavailable") }) : null,
                              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: ProviderSettings_default.switch, title: t("modelToggle"), children: [
                                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                                  "input",
                                  {
                                    type: "checkbox",
                                    checked: !isModelDisabled,
                                    onChange: () => toggleAccountModel(account.id, model.id, account.email)
                                  }
                                ),
                                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.switchSlider })
                              ] })
                            ] })
                          ] }, model.id);
                        }) })
                      ] })
                    ] }) : null
                  ]
                },
                account.id
              );
            }) })
          ] }) : null
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.providerCard, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: ProviderSettings_default.providerCardHead,
            onClick: () => toggleExpand("codex"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerMain, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.providerIcon, "data-provider": "codex", children: "GPT" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerTitles, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerTitle, children: t("providerCodex") }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerSubtitle, children: codexConnected ? t("accountCount", { count: accounts.accounts.length }) : t("codexNoAccounts") })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerRight, onClick: (e) => e.stopPropagation(), children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerBadge, "data-status": codexConnected ? "ready" : "idle", children: codexConnected ? t("providerStatusConnected") : t("providerStatusIdle") }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                    onClick: () => setSelectedProvider("codex"),
                    children: [
                      t("providerManage"),
                      " →"
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    className: ProviderSettings_default.accountChevron,
                    "data-open": expanded.codex,
                    onClick: () => toggleExpand("codex"),
                    children: "▼"
                  }
                )
              ] })
            ]
          }
        ),
        expanded.codex && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quickView, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                disabled: accounts.loginPending === true,
                onClick: () => {
                  void loginCodex().catch(() => {
                  });
                },
                children: accounts.loginPending === true ? t("providerWorking") : t("addAccount")
              }
            ),
            typeof accounts.loginUrl === "string" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { className: ProviderSettings_default.action, href: accounts.loginUrl, target: "_blank", rel: "noreferrer", children: t("codexOpenLink") }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: ProviderSettings_default.action, onClick: refreshCodex, children: t("providerRefresh") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: ProviderSettings_default.action,
                disabled: !codexConnected || accounts.switchingId !== void 0 || codexCatalog.accountId !== activeCodexId,
                onClick: refreshCodexModels,
                children: codexConnected && codexCatalog.accountId !== activeCodexId ? t("codexModelsRefreshing") : t("codexFetchModels")
              }
            )
          ] }),
          accounts.accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("codexNoAccounts") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.accounts, children: accounts.accounts.map((account) => {
            const usage = accounts.usage[account.id];
            const usageVal = usage?.status === "ready" ? usage.value : void 0;
            const weekly = usageVal?.weeklyPercent;
            const email = maskedEmail(account.email);
            const isEditing = editingCodexAccountId === account.id;
            const isQuotaOpen = expandedCodexQuotaAccounts[account.id] === true;
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "div",
              {
                className: ProviderSettings_default.accountCardButton,
                role: "button",
                "aria-label": isQuotaOpen ? t("quotaHide") : t("quotaView"),
                tabIndex: 0,
                onClick: () => toggleCodexAccountQuota(account.id),
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCodexAccountQuota(account.id);
                  }
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountCardTop, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountIdentityCol, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountTitleRow, children: [
                        isEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "input",
                          {
                            className: ProviderSettings_default.renameInput,
                            value: editingCodexAccountLabel,
                            onChange: (e) => setEditingCodexAccountLabel(e.target.value),
                            onClick: (e) => e.stopPropagation(),
                            onBlur: () => {
                              void saveRenameCodex(account.id);
                            },
                            onKeyDown: (e) => {
                              if (e.key === "Enter") void saveRenameCodex(account.id);
                              if (e.key === "Escape") setEditingCodexAccountId(null);
                            },
                            autoFocus: true
                          }
                        ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "span",
                          {
                            className: ProviderSettings_default.accountName,
                            onClick: (e) => {
                              e.stopPropagation();
                              startRenameCodex(account.id, account.label);
                            },
                            title: "点击直接重命名",
                            children: account.label
                          }
                        ),
                        account.active ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitCurrentBadge, children: t("accountCurrent") }) : null,
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountTierBadge, "data-tier": "Pro", children: account.planType ?? "PLUS" }),
                        weekly !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountTierBadge, "data-tier": "Pro", children: t("weeklyQuota", { value: weekly }) }) : null
                      ] }),
                      email === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.note, children: email })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.actions, onClick: (e) => e.stopPropagation(), children: [
                      confirmingDeleteId === account.id ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.deleteConfirmRow, onClick: (e) => e.stopPropagation(), children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.deleteConfirmPrompt, children: t("confirmDelete") }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "button",
                          {
                            type: "button",
                            className: `${ProviderSettings_default.action} ${ProviderSettings_default.danger}`,
                            onClick: (e) => {
                              e.stopPropagation();
                              setConfirmingDeleteId(null);
                              void removeCodexAccount(account.id).catch(() => {
                              });
                            },
                            children: t("confirmYes")
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "button",
                          {
                            type: "button",
                            className: ProviderSettings_default.action,
                            onClick: (e) => {
                              e.stopPropagation();
                              setConfirmingDeleteId(null);
                            },
                            children: t("confirmNo")
                          }
                        )
                      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "button",
                        {
                          type: "button",
                          className: ProviderSettings_default.action,
                          disabled: accounts.switchingId !== void 0,
                          onClick: (e) => {
                            e.stopPropagation();
                            setConfirmingDeleteId(account.id);
                          },
                          children: t("accountRemove")
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.accountChevron, "data-open": isQuotaOpen, children: "▼" })
                    ] })
                  ] }),
                  isQuotaOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitPanel, onClick: (e) => e.stopPropagation(), children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitSubRow, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitTeam, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitMuted, children: "Team Name:" }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitText, children: "个人账户" })
                      ] }),
                      usage?.status === "ready" && usage.value.resetCredits !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                        "button",
                        {
                          type: "button",
                          className: ProviderSettings_default.cockpitResetBtn,
                          onClick: (e) => {
                            e.stopPropagation();
                            if (resetCodexQuota) void resetCodexQuota(account.id);
                          },
                          title: "消耗重置额度重置 5h 额度",
                          children: [
                            "⟳ 重置 ",
                            usage.value.resetCredits
                          ]
                        }
                      ) : null
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitUserRow, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "使用 Google / Password 登录" }),
                      account.accountId ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitDivider, children: "|" }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { title: account.accountId, children: [
                          "用户 ID: ",
                          account.accountId.slice(0, 18),
                          "..."
                        ] })
                      ] }) : null
                    ] }),
                    (!account.planType || account.planType.toUpperCase() !== "PRO") && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaSection, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaHeader, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitQuotaTitle, children: "5h" }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: ProviderSettings_default.cockpitQuotaVal5h, children: [
                          usageVal?.shortPercent ?? 100,
                          "%"
                        ] })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "div",
                        {
                          className: ProviderSettings_default.cockpitFill5h,
                          style: { width: `${Math.min(100, Math.max(0, usageVal?.shortPercent ?? 100))}%` }
                        }
                      ) }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTimeSub, children: formatCockpitTime(usageVal?.shortResetsAt) })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaSection, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitQuotaHeader, children: [
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.cockpitQuotaTitle, children: "Weekly" }),
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: ProviderSettings_default.cockpitQuotaValWeekly, children: [
                          usageVal?.weeklyPercent ?? 100,
                          "%"
                        ] })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTrack, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "div",
                        {
                          className: ProviderSettings_default.cockpitFillWeekly,
                          style: { width: `${Math.min(100, Math.max(0, usageVal?.weeklyPercent ?? 100))}%` }
                        }
                      ) }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitTimeSub, children: formatCockpitTime(usageVal?.weeklyResetsAt) })
                    ] }),
                    account.subscriptionUntil ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.cockpitSubBanner, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitSubLeft, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                        "订阅有效期 ",
                        calcDaysRemaining(new Date(account.subscriptionUntil).getTime())
                      ] }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.cockpitSubRight, children: formatDateTime(new Date(account.subscriptionUntil).getTime()) })
                    ] }) : null,
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.accountModelsBlock, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.blockHeadRow, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.quotaGroupTitle, children: t("codexModels") }) }),
                      renderCodexModels(account)
                    ] }),
                    usage?.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.quotaErrorRow, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.note, children: t("quotaFailedShort") }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "button",
                        {
                          type: "button",
                          className: ProviderSettings_default.action,
                          onClick: () => {
                            void readQuota(account.id).catch(() => {
                            });
                          },
                          children: t("readQuota")
                        }
                      )
                    ] })
                  ] })
                ]
              },
              account.id
            );
          }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.providerCard, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: ProviderSettings_default.providerCardHead,
            onClick: () => toggleExpand("claude"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerMain, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.providerIcon, "data-provider": "claude", children: "CL" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerTitles, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerTitle, children: t("providerClaude") }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerSubtitle, children: t("providerClaudeDesc") })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerRight, onClick: (e) => e.stopPropagation(), children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerBadge, "data-status": "roadmap", children: t("providerStatusRoadmap") }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                    onClick: () => setSelectedProvider("claude"),
                    children: [
                      t("providerManage"),
                      " →"
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    className: ProviderSettings_default.accountChevron,
                    "data-open": expanded.claude,
                    onClick: () => toggleExpand("claude"),
                    children: "▼"
                  }
                )
              ] })
            ]
          }
        ),
        expanded.claude && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quickView, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ProviderSettings_default.note, children: t("roadmapNotice") }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: ProviderSettings_default.providerCard, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: ProviderSettings_default.providerCardHead,
            onClick: () => toggleExpand("opencode"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerMain, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.providerIcon, "data-provider": "opencode", children: "OC" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerTitles, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerTitle, children: t("providerOpenCode") }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerSubtitle, children: isOpencodeConfigured ? opencodeState.models.length > 0 ? `${t("opencodeConfigured")} · ${opencodeState.models.length} 个模型` : t("opencodeConfigured") : t("providerOpenCodeDesc") })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.providerRight, onClick: (e) => e.stopPropagation(), children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.providerBadge, "data-status": isOpencodeConfigured ? "ready" : "idle", children: isOpencodeConfigured ? t("opencodeConfigured") : t("opencodeNotConfigured") }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                    onClick: () => setSelectedProvider("opencode"),
                    children: [
                      t("providerManage"),
                      " →"
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    className: ProviderSettings_default.accountChevron,
                    "data-open": expanded.opencode,
                    onClick: () => toggleExpand("opencode"),
                    children: "▼"
                  }
                )
              ] })
            ]
          }
        ),
        expanded.opencode && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: ProviderSettings_default.quickView, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.opencodeConfigSection, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.fieldGroup, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: ProviderSettings_default.fieldLabel, children: t("opencodeApiKey") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ProviderSettings_default.inputWithAction, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: showOpencodeKey ? "text" : "password",
                  className: ProviderSettings_default.input,
                  placeholder: t("opencodeApiKeyPlaceholder"),
                  value: stagedOpencodeKey,
                  onChange: (e) => setStagedOpencodeKey(e.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: ProviderSettings_default.action,
                  onClick: () => setShowOpencodeKey(!showOpencodeKey),
                  children: showOpencodeKey ? "隐藏" : "显示"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: `${ProviderSettings_default.action} ${ProviderSettings_default.primary}`,
                  onClick: handleSaveOpencode,
                  children: t("opencodeSave")
                }
              )
            ] })
          ] }),
          opencodeSaveMsg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ProviderSettings_default.saveSuccessMsg, children: opencodeSaveMsg })
        ] }) })
      ] })
    ] })
  ] });
}

// src/client/locales.ts
var en = {
  title: "Model and reasoning effort",
  trigger: "Select model",
  effort: "Reasoning effort",
  providerTitle: "Select provider",
  providerTrigger: "Provider",
  providerEmpty: "No provider is available.",
  accountsLoading: "Loading subscription accounts…",
  accountUnavailable: "Account switching is unavailable.",
  accountLoadFailed: "Accounts unavailable: {message}",
  accountSwitchFailed: "Account switch failed: {message}",
  accountCount: "{count} accounts",
  accountSwitching: "Switching…",
  accountActive: "Active",
  accountCurrent: "Current",
  accountUse: "Use",
  weeklyQuota: "wk {value}%",
  quotaNoWeekly: "no weekly quota",
  readQuota: "Read quota",
  quotaReading: "Reading…",
  quotaFailedShort: "Quota read failed",
  quotaRestoreFailed: "Could not restore the previous account; the active account may have changed.",
  settingsNav: "Providers",
  providersIntro: "Create and manage the model providers this plugin integrates.",
  createProvider: "Create provider",
  providerCloseCatalog: "Close",
  providerAntigravity: "Google Antigravity",
  providerCodex: "OpenAI Codex",
  providerDeepseekApi: "DeepSeek API",
  providerDeepseekAccount: "DeepSeek Account",
  deepseekApiHint: "API key access. Configure a DeepSeek API key in Settings → Models; signing in to DSH does not configure this route.",
  deepseekAccountHint: "Account access. Sign in to your DeepSeek account in Settings → Account, then reload the model list. This route does not use your API key.",
  providerInstalled: "Installed",
  providerNotInstalled: "Not installed",
  providerError: "Unavailable",
  providerChecking: "Checking…",
  providerWorking: "Working…",
  providerRefresh: "Refresh",
  providerConnect: "Connect",
  antigravityCatalogHint: "Sign in with a Google account to use Antigravity models and tools.",
  codexCatalogHint: "Sign in with an OpenAI account to use Codex models through your ChatGPT subscription.",
  antigravityInstallHint: "Antigravity service is starting or unavailable.",
  antigravityLoginState: "Sign-in",
  antigravityProject: "Project",
  antigravityProjectReady: "Available",
  antigravityProjectUnavailable: "Unavailable",
  antigravityRiskState: "Risk notice",
  antigravityRiskAccepted: "Acknowledged",
  antigravityRiskPending: "Not acknowledged",
  antigravityRisk: "Antigravity is an unofficial private channel. Signing in acknowledges that notice; tokens never reach this page.",
  antigravitySignIn: "Sign in with Google",
  antigravityOpenLink: "Open Google sign-in page",
  antigravitySignOut: "Sign out",
  antigravityModels: "Models reported for this account",
  antigravityNoModels: "No model catalog yet. Sign in first.",
  antigravityFetchModels: "Reload model list",
  antigravityModelsRefreshing: "Fetching models…",
  codexFetchModels: "Reload model list",
  codexModelsRefreshing: "Fetching models…",
  codexModels: "Models in the current Host catalog",
  codexModelsInactive: "Switch to this account in the provider picker to load and configure its models. Other accounts’ switches do not apply here.",
  codexModelsScope: "These switches only control this account’s picker. They do not grant model access.",
  codexModelsMissing: "Saved selections not in the current catalog (preferences retained): {models}",
  antigravityAccounts: "Google accounts",
  antigravityNoAccounts: "No Google account connected yet. Sign in to add an account.",
  antigravityAddAccount: "Add Google account",
  addAccount: "Add account",
  renameAccount: "Rename",
  renameSave: "Save",
  renameCancel: "Cancel",
  accountTier: "Tier: {tier}",
  tierStandard: "Standard",
  quotaView: "Quota",
  quotaHide: "Hide",
  modelToggle: "Enable in chat",
  quotaBalance: "Quota & balance monitoring",
  quotaGemini: "Gemini models",
  quotaClaude: "Claude models (Non-Gemini)",
  quota5h: "5h remaining {value}%",
  quotaWeeklyFraction: "Weekly remaining {value}%",
  quotaResetAt: "resets {time}",
  quotaNoData: "No quota reported yet",
  antigravityModelLive: "live",
  antigravityModelSnapshot: "snapshot",
  antigravityModelUnavailable: "unavailable",
  antigravityIdle: "Not signed in",
  antigravityPending: "Waiting for the browser",
  antigravitySuccess: "Signed in",
  antigravityCancelled: "Cancelled",
  antigravityExpired: "Expired",
  antigravityPortConflict: "Local port busy",
  antigravityFailed: "Failed",
  codexNoAccounts: "No ChatGPT account is connected yet. Sign in to add an account.",
  codexAddHint: "Sign in with OpenAI to use your ChatGPT subscription quota and models.",
  codexSignIn: "Sign in to ChatGPT",
  codexOpenLink: "Open ChatGPT sign-in page",
  accountRemove: "Remove",
  confirmDelete: "Confirm delete?",
  confirmYes: "Delete",
  confirmNo: "Cancel",
  weeklyQuotaTooltip: "Weekly remaining {value}%",
  fiveHourQuota: "5h {value}%",
  backToProviders: "Back to all providers",
  providerManage: "Manage",
  providerQuickView: "Quick accounts",
  providerHideQuickView: "Collapse",
  providerStatusConnected: "Connected",
  providerStatusIdle: "Not signed in",
  providerStatusRoadmap: "Planned",
  providerClaude: "Anthropic Claude",
  providerClaudeDesc: "Official Anthropic Claude API & subscription integration, coming soon.",
  providerGemini: "Google Gemini API",
  providerGeminiDesc: "Google AI Studio / Gemini API direct access, coming soon.",
  providerOpenAi: "OpenAI API",
  providerOpenAiDesc: "Direct OpenAI API key and custom proxy endpoints, coming soon.",
  providerOpenCode: "OpenCode",
  providerOpenCodeDesc: "OpenCode Go subscription and gateway models integration.",
  opencodeApiKey: "API Key",
  opencodeApiKeyPlaceholder: "Enter OpenCode Go API Key (opencode.ai)",
  opencodeBaseUrl: "Gateway URL",
  opencodeConfigured: "Configured",
  opencodeNotConfigured: "Not configured",
  opencodeSave: "Save Configuration",
  opencodeResetDefault: "Reset Default",
  opencodeModels: "Available Models",
  opencodeUsage: "Quota & Usage Monitoring",
  opencodeSaved: "Configuration saved",
  roadmapNotice: "This provider is on the roadmap and will be supported in an upcoming release.",
  contextWindow: "Context window",
  reload: "Reload",
  loading: "Loading models…",
  empty: "No model is available.",
  noEffort: "This model offers no reasoning effort.",
  noEffortShort: "No effort control",
  defaultEffort: "Provider default",
  unknownEffort: "Unknown: {effort}",
  selectModel: "Select {model}",
  missing: "No catalog entry for {provider} / {model}.",
  adjustEffort: "Adjust the reasoning effort of {model}",
  selectFailed: "Model selection failed: {message}",
  loadFailed: "Model loading failed: {message}",
  providerFailed: "{provider}: {message}",
  contextUnsupported: "Context-window selection is not supported by this runtime."
};
var zh = {
  title: "模型与推理等级",
  trigger: "选择模型",
  effort: "推理等级",
  providerTitle: "选择提供方",
  providerTrigger: "提供方",
  providerEmpty: "没有可用的提供方。",
  accountsLoading: "正在加载订阅账号…",
  accountUnavailable: "账号切换不可用。",
  accountLoadFailed: "无法读取账号：{message}",
  accountSwitchFailed: "账号切换失败：{message}",
  accountCount: "{count} 个账号",
  accountSwitching: "正在切换…",
  accountActive: "使用中",
  accountCurrent: "当前",
  accountUse: "使用",
  weeklyQuota: "周 {value}%",
  quotaNoWeekly: "无周额度",
  readQuota: "读取额度",
  quotaReading: "读取中…",
  quotaFailedShort: "额度读取失败",
  quotaRestoreFailed: "未能切回原账号，当前活动账号可能已变更。",
  settingsNav: "提供商",
  providersIntro: "创建并管理本插件接入的模型提供方。",
  createProvider: "创建提供商",
  providerCloseCatalog: "收起",
  providerAntigravity: "Google Antigravity",
  providerCodex: "OpenAI Codex",
  providerDeepseekApi: "DeepSeek API",
  providerDeepseekAccount: "DeepSeek 账号",
  deepseekApiHint: "API 密钥通道：请在「设置 → 模型」中配置 DeepSeek API Key。登录 DSH 账号不会配置此通道。",
  deepseekAccountHint: "账号通道：请在「设置 → 账户」登录 DeepSeek 账号，再重新加载模型列表。此通道不使用 API Key。",
  providerInstalled: "已安装",
  providerNotInstalled: "未安装",
  providerError: "不可用",
  providerChecking: "正在检查…",
  providerWorking: "处理中…",
  providerRefresh: "刷新",
  providerConnect: "接入",
  antigravityCatalogHint: "使用 Google 账号登录 Antigravity，即可使用全部模型与工具能力。",
  codexCatalogHint: "使用 OpenAI 账号登录，通过 ChatGPT 订阅访问 Codex 模型。",
  antigravityInstallHint: "Antigravity 服务正在启动或不可用。",
  antigravityLoginState: "登录状态",
  antigravityProject: "项目",
  antigravityProjectReady: "可用",
  antigravityProjectUnavailable: "不可用",
  antigravityRiskState: "风险提示",
  antigravityRiskAccepted: "已确认",
  antigravityRiskPending: "未确认",
  antigravityRisk: "Antigravity 是非官方私有通道。登录即表示确认该提示；令牌不会到达本页面。",
  antigravitySignIn: "登录 Google 账号",
  antigravityOpenLink: "打开 Google 登录页",
  antigravitySignOut: "退出登录",
  antigravityModels: "该账号上报的模型",
  antigravityNoModels: "暂无模型目录，请先登录。",
  antigravityFetchModels: "重新获取模型列表",
  antigravityModelsRefreshing: "正在获取模型…",
  codexFetchModels: "重新获取模型列表",
  codexModelsRefreshing: "正在获取模型…",
  codexModels: "当前宿主目录中的模型",
  codexModelsInactive: "请先在提供方选择器切换到该账号，再读取并设置模型。其他账号的开关不会应用到此账号。",
  codexModelsScope: "开关只控制此账号的选择器显示，不代表获得模型使用权限。",
  codexModelsMissing: "已保存的以下选择不在当前目录中（偏好仍保留）：{models}",
  antigravityAccounts: "Google 账号列表",
  antigravityNoAccounts: "尚未连接任何 Google 账号，请登录以添加账号。",
  antigravityAddAccount: "添加 Google 账号",
  addAccount: "新增账户",
  renameAccount: "重命名",
  renameSave: "保存",
  renameCancel: "取消",
  accountTier: "订阅等级：{tier}",
  tierStandard: "标准套餐",
  quotaView: "查看余额",
  quotaHide: "收起余额",
  modelToggle: "在对话中启用",
  quotaBalance: "配额与额度监控",
  quotaGemini: "Gemini 模型组",
  quotaClaude: "Claude 模型组 (Non-Gemini)",
  quota5h: "5小时剩余 {value}%",
  quotaWeeklyFraction: "周额度剩余 {value}%",
  quotaResetAt: "{time} 重置",
  quotaNoData: "暂无配额上报数据",
  antigravityModelLive: "实时",
  antigravityModelSnapshot: "快照",
  antigravityModelUnavailable: "不可用",
  antigravityIdle: "未登录",
  antigravityPending: "等待浏览器完成",
  antigravitySuccess: "已登录",
  antigravityCancelled: "已取消",
  antigravityExpired: "已过期",
  antigravityPortConflict: "本地端口被占用",
  antigravityFailed: "失败",
  codexNoAccounts: "尚未连接任何 ChatGPT 账号，请登录以添加账号。",
  codexAddHint: "登录 OpenAI 账号后，即可直接使用 ChatGPT 订阅额度与模型。",
  codexSignIn: "登录 ChatGPT 账号",
  codexOpenLink: "打开 ChatGPT 登录页",
  accountRemove: "删除",
  confirmDelete: "确认删除？",
  confirmYes: "删除",
  confirmNo: "取消",
  weeklyQuotaTooltip: "周额度剩余 {value}%",
  fiveHourQuota: "5h {value}%",
  backToProviders: "返回全部提供商",
  providerManage: "管理配置",
  providerQuickView: "预览账号",
  providerHideQuickView: "收起",
  providerStatusConnected: "已连接",
  providerStatusIdle: "未登录",
  providerStatusRoadmap: "计划中",
  providerClaude: "Anthropic Claude",
  providerClaudeDesc: "Anthropic Claude 官方 API 及订阅模型接入，即将推出。",
  providerGemini: "Google Gemini API",
  providerGeminiDesc: "Google AI Studio / Gemini API 原生接入，即将推出。",
  providerOpenAi: "OpenAI API",
  providerOpenAiDesc: "OpenAI 官方 API Key 直连与自定义代理端点，即将推出。",
  providerOpenCode: "OpenCode",
  providerOpenCodeDesc: "OpenCode Go 订阅模型与多模型网关接入。",
  opencodeApiKey: "API Key 密钥",
  opencodeApiKeyPlaceholder: "请输入 OpenCode Go API 密钥（来自 opencode.ai）",
  opencodeBaseUrl: "网关地址",
  opencodeConfigured: "已配置",
  opencodeNotConfigured: "未配置",
  opencodeSave: "保存配置",
  opencodeResetDefault: "恢复默认",
  opencodeModels: "可用模型列表",
  opencodeUsage: "配额与额度监控",
  opencodeSaved: "配置已保存",
  roadmapNotice: "该提供商已列入后续接入计划，将在后续版本中支持直连与配置。",
  contextWindow: "上下文窗口",
  reload: "重新加载",
  loading: "正在加载模型…",
  empty: "没有可用的模型。",
  noEffort: "当前模型未提供推理等级。",
  noEffortShort: "无推理档位",
  defaultEffort: "提供方默认",
  unknownEffort: "未知：{effort}",
  selectModel: "选择 {model}",
  missing: "未在目录中找到 {provider} / {model}。",
  adjustEffort: "调整 {model} 的推理等级",
  selectFailed: "模型选择失败：{message}",
  loadFailed: "模型加载失败：{message}",
  providerFailed: "{provider}：{message}",
  contextUnsupported: "此运行时不支持选择上下文窗口。"
};

// src/client/account-rpc.ts
var endpointPattern = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
var accountRpcFallback = {
  async call(channel, endpoint, payload, signal) {
    if (channel !== "/api" || !endpointPattern.test(endpoint)) {
      throw new Error("Invalid account RPC target");
    }
    const rpcId = crypto.randomUUID();
    const response = await fetch(new URL(`${channel}/${endpoint}`, location.origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method: endpoint, payload }),
      ...signal === void 0 ? {} : { signal }
    });
    if (!response.ok) throw new Error(`Account RPC transport failed: HTTP ${response.status}`);
    const envelope = await response.json();
    if (!isRecord(envelope) || envelope.type !== "server-response" || envelope.rpcId !== rpcId) {
      throw new Error("Invalid account RPC response");
    }
    const result = envelope.result;
    if (!isRecord(result)) throw new Error("Invalid account RPC result");
    if (result.ok === true) return { ok: true, value: result.value };
    if (result.ok === false && isRecord(result.error) && typeof result.error.code === "string" && typeof result.error.message === "string" && isRecord(result.error.details)) {
      return { ok: false, error: {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details
      } };
    }
    throw new Error("Invalid account RPC result");
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/client/catalog-refresh.ts
function forceCatalogReload(resolver) {
  const catalog = resolver?.catalog;
  if (typeof catalog?.refresh === "function") catalog.refresh.call(catalog);
}

// src/client/index.ts
var NS = "providerExtension";
var inject = ["slots", "locale", "modelDirectories", "sessions", "remote", "remote.session"];
var DIRECTORY_LOAD_TIMEOUT_MS = 2e4;
function withTimeout(promise, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(DIRECTORY_LOAD_TIMEOUT_MS / 1e3)}s; reload to retry`)),
      DIRECTORY_LOAD_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    );
  });
}
async function loadDirectoryBounded(directory) {
  try {
    return await withTimeout(directory.load(), "Model directory load");
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes("timed out") || directory.catalog === void 0) throw cause;
    directory.catalog.invalidate();
    return withTimeout(directory.load(), "Model directory load");
  }
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-provider-extension: dictionaries");
  let connectionRpc;
  ctx.inject(["connection"], (scope) => {
    connectionRpc = scope.get("connection").rpc;
    return () => {
      connectionRpc = void 0;
    };
  });
  const rpc = {
    call: (...args) => {
      const activeRpc = connectionRpc ?? accountRpcFallback;
      return activeRpc.call(...args);
    }
  };
  const codexAccounts = new CodexAccountsController(rpc);
  const antigravity = new AntigravityController(rpc);
  const opencode = new OpencodeController();
  opencode.setRpc(rpc);
  ctx.effect(() => () => {
    codexAccounts.dispose();
  }, "dsh-provider-extension: Codex account controller");
  ctx.effect(() => () => {
    antigravity.dispose();
  }, "dsh-provider-extension: Antigravity controller");
  ctx.effect(() => () => {
    opencode.dispose();
  }, "dsh-provider-extension: OpenCode controller");
  ctx.effect(() => ctx.on("connection/reset", () => {
    codexAccounts.invalidate();
    antigravity.invalidate();
  }), "dsh-provider-extension: account resets");
  ctx.effect(() => {
    void codexAccounts.load().catch(() => {
    });
    void antigravity.load().catch(() => {
    });
    return () => {
    };
  }, "dsh-provider-extension: startup self-check");
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-provider-extension";
    tag.textContent = `${cssText}
${cssText2}`;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "dsh-provider-extension: styles");
  const readCodexQuota = async (id) => {
    await codexAccounts.readQuota(id);
    window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
  };
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "provider-extension",
    order: 16,
    label: () => ctx.locale.bind(NS)("settingsNav"),
    locale: NS,
    inject: () => ({
      hooks: { accounts: codexAccounts.store, antigravity: antigravity.store },
      loadAccounts: async () => {
        await codexAccounts.load();
      },
      loadCodexModels: async () => {
        await codexAccounts.refreshModels();
        forceCatalogReload(ctx.modelDirectories);
        const result = await ctx.remote.session.modelCatalog();
        if (!result.ok) throw new Error(result.error.message);
        const failure = result.value.failures.find((entry) => entry.id === "openai-codex");
        if (failure) throw new Error(failure.message);
        return result.value.groups.find((group) => group.id === "openai-codex")?.models ?? [];
      },
      readQuota: readCodexQuota,
      loginCodex: async () => {
        await codexAccounts.login();
      },
      selectCodexAccount: async (id) => {
        await codexAccounts.select(id);
      },
      renameCodexAccount: async (id, label) => {
        await codexAccounts.renameAccount(id, label);
      },
      removeCodexAccount: async (id) => {
        await codexAccounts.removeAccount(id);
      },
      resetCodexQuota: async (id) => {
        await codexAccounts.consumeResetCredit(id);
      },
      loadAntigravity: async () => {
        await antigravity.load();
      },
      refreshAntigravityModels: async () => {
        await antigravity.refreshModels();
        forceCatalogReload(ctx.modelDirectories);
      },
      loginAntigravity: async () => {
        await antigravity.login();
      },
      logoutAntigravity: async () => {
        await antigravity.logout();
      },
      selectAntigravityAccount: async (id) => {
        await antigravity.selectAccount(id);
      },
      updateAntigravityAccount: async (id, patch) => {
        await antigravity.updateAccount(id, patch);
      },
      renameAntigravityAccount: async (id, label) => {
        await antigravity.renameAccount(id, label);
      },
      removeAntigravityAccount: async (id) => {
        await antigravity.removeAccount(id);
      },
      readAntigravityQuota: async (id) => {
        await antigravity.readQuota(id);
      },
      useOpencode: (selector) => selector(opencode.store.getSnapshot()),
      saveOpencodeConfig: (apiKey, baseURL) => {
        opencode.saveConfig(apiKey, baseURL);
      },
      readOpencodeUsage: async () => {
        await opencode.readUsage();
      },
      refreshOpencodeModels: async () => {
        await opencode.refreshModels();
      }
    })
  }, ProviderSettings));
  ctx.slots.inject("conversation.input.model", () => ctx.slots.register({
    name: "conversation.input.model",
    priority: -20,
    locale: NS,
    inject: (sessionId) => {
      const directory = ctx.modelDirectories.directoryFor(sessionId);
      return {
        available: ctx.sessions.subagentAddress?.(sessionId) === void 0,
        hooks: { directory: directory.store, accounts: codexAccounts.store, antigravity: antigravity.store },
        loadDirectory: async (force = false) => {
          if (force) {
            if (isCodexProvider(directory.store.getSnapshot().current?.provider)) await codexAccounts.refreshModels();
            forceCatalogReload(ctx.modelDirectories);
          }
          await loadDirectoryBounded(directory);
        },
        loadAccounts: async () => {
          await codexAccounts.load();
        },
        loadAntigravity: async () => {
          await antigravity.load();
        },
        selectAccount: async (id) => {
          await codexAccounts.select(id);
          window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
          await codexAccounts.refreshModels();
          forceCatalogReload(ctx.modelDirectories);
          await loadDirectoryBounded(directory);
        },
        selectAntigravityAccount: async (id) => {
          await antigravity.selectAccount(id);
          forceCatalogReload(ctx.modelDirectories);
          await loadDirectoryBounded(directory);
        },
        readQuota: async (id) => {
          await codexAccounts.readQuota(id);
          window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
        },
        readAntigravityQuota: async (id) => {
          await antigravity.readQuota(id);
        },
        useOpencode: (selector) => selector(opencode.store.getSnapshot()),
        readOpencodeUsage: async () => {
          await opencode.readUsage();
        },
        select: async (selection) => {
          assertSelectionSucceeded(await directory.select(selection));
        }
      };
    }
  }, ProviderPanel));
}
;return module.exports;}});
//# sourceMappingURL=client.js.map
