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
  CodexAccountsController: () => CodexAccountsController,
  NS: () => NS,
  ProviderPanel: () => ProviderPanel,
  accentFor: () => accentFor,
  activeGroup: () => activeGroup,
  apply: () => apply,
  decodeQuota: () => decodeQuota,
  effortIndex: () => effortIndex,
  inject: () => inject,
  isCodexProvider: () => isCodexProvider,
  isCurrentModel: () => isCurrentModel,
  maskedEmail: () => maskedEmail,
  restingEffort: () => restingEffort,
  selectionForRow: () => selectionForRow
});
module.exports = __toCommonJS(index_exports);

// src/client/ProviderPanel.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

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
var LOADING = Object.freeze({ status: "loading" });
function createStore(initial) {
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
function decodeAccount(value) {
  const candidate = record(value);
  if (candidate === void 0) return void 0;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return void 0;
  if (typeof candidate.label !== "string" || candidate.label.length === 0) return void 0;
  if (typeof candidate.active !== "boolean") return void 0;
  return Object.freeze({
    id: candidate.id,
    label: candidate.label,
    active: candidate.active,
    ...typeof candidate.email === "string" && candidate.email.length > 0 ? { email: candidate.email } : {}
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
    if (Math.abs(seconds - SHORT_WINDOW_SECONDS) < 60 && shortPercent === void 0) shortPercent = Math.round(percent);
  }
  return Object.freeze({
    ...weeklyPercent === void 0 ? {} : { weeklyPercent },
    ...weeklyResetsAt === void 0 ? {} : { weeklyResetsAt },
    ...shortPercent === void 0 ? {} : { shortPercent }
  });
}
async function call(rpc, endpoint, payload) {
  const response = await rpc.call("/api", `codex-subscription/${endpoint}`, payload);
  if (response?.ok !== true) {
    const message = response?.error?.message;
    throw new Error(typeof message === "string" && message.length > 0 ? message : "Codex subscription service is unavailable");
  }
  return response.value;
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
  store = createStore(initialState);
  generation = 0;
  disposed = false;
  /** Load the roster, then read the active account's quota. */
  async load() {
    if (this.store.getSnapshot().switchingId !== void 0) return;
    const generation = ++this.generation;
    const previous = this.store.getSnapshot();
    this.store.set(Object.freeze({ ...previous, status: "loading", error: null, restoreFailed: false }));
    try {
      const accounts = await readRoster(this.rpc, "status", {});
      if (this.disposed || generation !== this.generation) return;
      const latest = this.store.getSnapshot();
      this.store.set(Object.freeze({ ...latest, status: "ready", accounts, error: null }));
      void this.loadUsage(generation);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      const latest = this.store.getSnapshot();
      this.store.set(Object.freeze({ ...latest, status: "error", error: failureMessage(error) }));
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
      if (!this.disposed && generation === this.generation) {
        const latest = this.store.getSnapshot();
        this.store.set(Object.freeze({ ...latest, switchingId: void 0, restoreFailed: !restored }));
      }
    }
    if (failure !== void 0) throw failure;
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
    this.store.set(Object.freeze({ ...latest, usage: { ...latest.usage, [id]: value } }));
  }
};

// src/client/selection.ts
var FAMILY_ACCENTS = [
  ["sol", "#E3A552"],
  ["terra", "#CBD3E0"],
  ["luna", "#8F7BF2"]
];
var PALETTE = ["#E3A552", "#CBD3E0", "#8F7BF2", "#6FB3C8", "#D98C8C", "#7FC8A9"];
function accentFor(modelId, index) {
  const key = modelId.toLowerCase();
  for (const [family, accent] of FAMILY_ACCENTS) if (key.includes(family)) return accent;
  return PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? "currentColor";
}
function effortIndex(model, effortId) {
  if (effortId === void 0) return -1;
  return model.reasoning?.efforts.findIndex((effort) => effort.id === effortId) ?? -1;
}
function restingEffort(model) {
  const effort = model.reasoning?.defaultEffort;
  return effortIndex(model, effort) >= 0 ? effort : void 0;
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

// dsh-provider-extension-css:ProviderPanel.module.css
var cssText = ".dpe_root_5deusq{flex:0 auto;align-items:center;gap:2px;min-width:0;display:flex;position:relative}.dpe_trigger_5deusq{width:max-content;max-width:100%;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:14px;outline:none;flex:none;align-items:center;gap:6px;padding:0 5px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}.dpe_trigger_5deusq:hover:not(:disabled),.dpe_trigger_5deusq[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_trigger_5deusq:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dpe_trigger_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_dot_5deusq{border-radius:50%;flex:none;width:7px;height:7px}.dpe_providerTrigger_5deusq{max-width:150px}.dpe_modelTrigger_5deusq{max-width:220px}.dpe_providerLabel_5deusq,.dpe_triggerLabel_5deusq{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;overflow:hidden}.dpe_providerLabel_5deusq{color:var(--dsw-alias-label-primary)}.dpe_triggerEffort_5deusq{color:var(--dsw-alias-label-primary);white-space:nowrap;flex:none;font-weight:600}.dpe_chevron_5deusq{color:var(--dsw-alias-label-caption);flex:none}.dpe_menu_5deusq{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:min(392px,100vw - 32px);max-height:min(560px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);border-radius:16px;flex-direction:column;padding:12px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow-y:auto}.dpe_providerMenu_5deusq{width:min(280px,100vw - 32px)}.dpe_providerList_5deusq{flex-direction:column;gap:2px;margin-top:4px;display:flex}.dpe_providerOption_5deusq{width:100%;min-height:34px;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:9px;outline:none;justify-content:space-between;align-items:center;gap:12px;padding:6px 9px;font-size:13px;line-height:20px;display:flex}.dpe_providerOption_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_providerCurrent_5deusq{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}.dpe_providerCount_5deusq{min-width:20px;color:var(--dsw-alias-label-caption);text-align:right;flex:none;font-size:12px}.dpe_providerFamily_5deusq{padding:4px 0 2px}.dpe_providerFamilyHead_5deusq{min-height:28px;color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;gap:12px;padding:2px 9px;font-size:12px;line-height:18px;display:flex}.dpe_accountOption_5deusq{width:100%;min-height:42px;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:9px;outline:none;justify-content:space-between;align-items:center;gap:12px;padding:5px 9px 5px 18px;display:flex}.dpe_accountOption_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_accountOption_5deusq:disabled{cursor:default}.dpe_accountIdentity_5deusq{flex-direction:column;min-width:0;display:flex}.dpe_accountLabel_5deusq,.dpe_accountEmail_5deusq{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dpe_accountLabel_5deusq{color:inherit;font-size:13px;font-weight:600;line-height:18px}.dpe_accountEmail_5deusq{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}.dpe_accountState_5deusq{color:var(--dsw-alias-label-caption);flex:none;font-size:11px}.dpe_accountNote_5deusq,.dpe_accountError_5deusq{margin:2px 9px 5px;font-size:11px;line-height:16px}.dpe_accountNote_5deusq{color:var(--dsw-alias-label-caption)}.dpe_accountError_5deusq{color:var(--dsw-alias-state-error-primary)}.dpe_accountRow_5deusq{align-items:center;gap:4px;display:flex}.dpe_accountRow_5deusq .dpe_accountOption_5deusq{flex:auto;width:auto;min-width:0}.dpe_accountMeta_5deusq{flex-direction:column;flex:none;align-items:flex-end;gap:1px;display:flex}.dpe_accountQuota_5deusq{color:var(--dsw-alias-label-caption);white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px;line-height:16px}.dpe_accountRead_5deusq{color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:7px;outline:none;flex:none;padding:3px 8px;font-size:11px;line-height:16px}.dpe_accountRead_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_accountRead_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_head_5deusq{justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;display:flex}.dpe_headTitle_5deusq{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dpe_reload_5deusq{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:7px;outline:none;flex:none;padding:2px 6px;font-size:12px;line-height:18px}.dpe_reload_5deusq:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dpe_reload_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_pills_5deusq{background:var(--dsw-alias-interactive-bg-hover);border-radius:12px;gap:3px;padding:3px;display:flex}.dpe_pill_5deusq{min-width:0;height:26px;color:var(--dsw-alias-label-secondary);cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:none;border-radius:9px;outline:none;flex:1 1 0;padding:0 6px;font-size:12px;line-height:26px;overflow:hidden}.dpe_pill_5deusq:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dpe_pill_5deusq[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}.dpe_pill_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_rows_5deusq{flex-direction:column;gap:4px;margin-top:10px;display:flex}.dpe_row_5deusq{border:1px solid #0000;border-radius:12px;padding:4px 10px 2px;position:relative}.dpe_rowCurrent_5deusq{border-color:var(--dpe-accent-edge,var(--dsw-alias-border-l3));background:var(--dpe-accent-soft,var(--dsw-alias-interactive-bg-hover))}.dpe_rowHead_5deusq{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;gap:8px;font-size:12px;line-height:18px;display:flex}.dpe_rowCurrent_5deusq .dpe_rowHead_5deusq{color:var(--dsw-alias-label-primary)}.dpe_rowName_5deusq{color:inherit;font:inherit;text-align:left;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:0;padding:2px 0;font-weight:600;overflow:hidden}.dpe_rowValue_5deusq{flex:none}.dpe_track_5deusq{align-items:center;height:40px;display:flex;position:relative}.dpe_rail_5deusq{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;height:8px;position:absolute;left:10px;right:10px}.dpe_fill_5deusq{background:var(--dpe-accent,var(--dsw-alias-label-secondary));clip-path:inset(0 round 999px);opacity:0;border-radius:999px;height:8px;position:absolute;left:10px}.dpe_rowCurrent_5deusq .dpe_fill_5deusq{opacity:.95}.dpe_stop_5deusq{background:var(--dsw-alias-label-dimmed);border-radius:50%;width:4px;height:4px;position:absolute;top:50%;transform:translate(-50%,-50%)}.dpe_thumb_5deusq{background:var(--dsw-alias-label-tertiary);width:20px;height:20px;box-shadow:var(--dsw-shadow-lv3);border-radius:50%;transition:left .25s cubic-bezier(.22,1,.36,1),background .2s;position:absolute;top:50%;transform:translate(-50%,-50%)}.dpe_rowCurrent_5deusq .dpe_thumb_5deusq{background:var(--dpe-accent,var(--dsw-alias-label-primary))}.dpe_input_5deusq{opacity:0;-webkit-appearance:none;appearance:none;cursor:pointer;background:0 0;width:100%;height:100%;margin:0;padding:0;position:absolute;inset:0}.dpe_input_5deusq:disabled{cursor:default}.dpe_foot_5deusq{border-top:1px solid var(--dsw-alias-border-l3);justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding-top:10px;display:flex}.dpe_footLabel_5deusq{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.dpe_tiers_5deusq{background:var(--dsw-alias-interactive-bg-hover);border-radius:11px;gap:3px;padding:3px;display:flex}.dpe_tier_5deusq{min-width:52px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;padding:0 8px;font-size:12px;line-height:24px}.dpe_tier_5deusq:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dpe_tier_5deusq[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}.dpe_tier_5deusq:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dpe_note_5deusq{color:var(--dsw-alias-label-tertiary);margin:8px 0 0;font-size:12px;line-height:18px}.dpe_error_5deusq{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;margin:0 0 8px;padding:7px 8px;font-size:12px;line-height:18px}";
var ProviderPanel_default = { "accountEmail": "dpe_accountEmail_5deusq", "accountError": "dpe_accountError_5deusq", "accountIdentity": "dpe_accountIdentity_5deusq", "accountLabel": "dpe_accountLabel_5deusq", "accountMeta": "dpe_accountMeta_5deusq", "accountNote": "dpe_accountNote_5deusq", "accountOption": "dpe_accountOption_5deusq", "accountQuota": "dpe_accountQuota_5deusq", "accountRead": "dpe_accountRead_5deusq", "accountRow": "dpe_accountRow_5deusq", "accountState": "dpe_accountState_5deusq", "chevron": "dpe_chevron_5deusq", "dot": "dpe_dot_5deusq", "error": "dpe_error_5deusq", "fill": "dpe_fill_5deusq", "foot": "dpe_foot_5deusq", "footLabel": "dpe_footLabel_5deusq", "head": "dpe_head_5deusq", "headTitle": "dpe_headTitle_5deusq", "input": "dpe_input_5deusq", "menu": "dpe_menu_5deusq", "modelTrigger": "dpe_modelTrigger_5deusq", "note": "dpe_note_5deusq", "pill": "dpe_pill_5deusq", "pills": "dpe_pills_5deusq", "providerCount": "dpe_providerCount_5deusq", "providerCurrent": "dpe_providerCurrent_5deusq", "providerFamily": "dpe_providerFamily_5deusq", "providerFamilyHead": "dpe_providerFamilyHead_5deusq", "providerLabel": "dpe_providerLabel_5deusq", "providerList": "dpe_providerList_5deusq", "providerMenu": "dpe_providerMenu_5deusq", "providerOption": "dpe_providerOption_5deusq", "providerTrigger": "dpe_providerTrigger_5deusq", "rail": "dpe_rail_5deusq", "reload": "dpe_reload_5deusq", "root": "dpe_root_5deusq", "row": "dpe_row_5deusq", "rowCurrent": "dpe_rowCurrent_5deusq", "rowHead": "dpe_rowHead_5deusq", "rowName": "dpe_rowName_5deusq", "rowValue": "dpe_rowValue_5deusq", "rows": "dpe_rows_5deusq", "stop": "dpe_stop_5deusq", "thumb": "dpe_thumb_5deusq", "tier": "dpe_tier_5deusq", "tiers": "dpe_tiers_5deusq", "track": "dpe_track_5deusq", "trigger": "dpe_trigger_5deusq", "triggerEffort": "dpe_triggerEffort_5deusq", "triggerLabel": "dpe_triggerLabel_5deusq" };

// src/client/ProviderPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ProviderPanel({
  locked,
  available,
  useDirectory,
  useAccounts,
  loadDirectory,
  loadAccounts,
  selectAccount,
  readQuota,
  select,
  t
}) {
  const directory = useDirectory((snapshot) => snapshot);
  const accounts = useAccounts((snapshot) => snapshot);
  const [open, setOpen] = (0, import_react.useState)(null);
  const [providerDraft, setProviderDraft] = (0, import_react.useState)();
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [accountError, setAccountError] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const [dragging, setDragging] = (0, import_react.useState)(null);
  const root = (0, import_react.useRef)(null);
  const providerTrigger = (0, import_react.useRef)(null);
  const modelTrigger = (0, import_react.useRef)(null);
  const generation = (0, import_react.useRef)(0);
  const mounted = (0, import_react.useRef)(false);
  const selecting = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    mounted.current = true;
    generation.current++;
    selecting.current = false;
    setOpen(null);
    setProviderDraft(void 0);
    setBusy(false);
    setLoading(false);
    setAccountError(null);
    setError(null);
    setDragging(null);
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [useDirectory, useAccounts, loadDirectory, loadAccounts, selectAccount, readQuota, select]);
  (0, import_react.useEffect)(() => {
    if (directory.current?.provider !== void 0) setProviderDraft(directory.current.provider);
  }, [directory.current?.provider]);
  const authoritativeGroup = activeGroup(directory);
  const group = directory.groups.find((candidate) => candidate.id === providerDraft) ?? authoritativeGroup;
  const models = group?.models ?? [];
  const currentModel = group === void 0 || group.id !== directory.current?.provider ? void 0 : models.find((model) => isCurrentModel(directory.current, group.id, model));
  const efforts = currentModel?.reasoning?.efforts ?? [];
  const currentEffort = currentModel === void 0 ? void 0 : directory.current?.reasoningEffort;
  const currentEffortName = efforts.find((effort) => effort.id === currentEffort)?.name;
  const pending = locked || busy || accounts.switchingId !== void 0 || directory.status === "selecting";
  const fetching = loading || directory.status === "loading";
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
  const run = (kind, operation) => {
    const request = ++generation.current;
    const isSelection = kind === "selectFailed";
    selecting.current = isSelection;
    setBusy(isSelection);
    setLoading(!isSelection);
    setError(null);
    void Promise.resolve().then(operation).catch((cause) => {
      if (!mounted.current || request !== generation.current) return;
      setError({ kind, message: cause instanceof Error ? cause.message : String(cause) });
    }).finally(() => {
      if (!mounted.current || request !== generation.current) return;
      selecting.current = false;
      setBusy(false);
      setLoading(false);
      setDragging(null);
    });
  };
  const reload = () => {
    if (selecting.current || pending) return;
    run("loadFailed", loadDirectory);
  };
  const toggle = (pane) => {
    if (pending) return;
    const next = open === pane ? null : pane;
    setOpen(next);
    if (next !== null) reload();
    if (next === "provider" && directory.groups.some((candidate) => isCodexProvider(candidate.id))) {
      void loadAccounts();
    }
  };
  const submit = (model, effortId) => {
    if (group === void 0 || model === void 0 || selecting.current || pending) return;
    run("selectFailed", () => select(selectionForRow(model, group.id, effortId)));
  };
  const renderRow = (model, index) => {
    const ladder = model.reasoning?.efforts ?? [];
    const count = ladder.length;
    const provider = group.id;
    const isCurrent = isCurrentModel(directory.current, provider, model);
    const restingId = isCurrent ? currentEffort : restingEffort(model);
    const resting = effortIndex(model, restingId);
    const position = dragging?.model === model && dragging.provider === provider ? dragging.index : resting;
    const ratio = count > 1 && position >= 0 ? position / (count - 1) : 0;
    const effortName = ladder[position]?.name ?? (restingId === void 0 ? t("defaultEffort") : t("unknownEffort", { effort: restingId }));
    const accent = accentFor(model.id, index);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: isCurrent ? `${ProviderPanel_default.row} ${ProviderPanel_default.rowCurrent}` : ProviderPanel_default.row,
        "data-model-accent": model.id,
        "data-current": isCurrent,
        style: {
          "--dpe-accent": accent,
          "--dpe-accent-soft": `${accent}1f`,
          "--dpe-accent-edge": `${accent}66`
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.rowHead, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: ProviderPanel_default.rowName,
                "aria-label": t("selectModel", { model: model.name }),
                "aria-pressed": isCurrent,
                disabled: pending,
                onClick: () => {
                  submit(model, restingId);
                },
                children: model.name
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.rowValue, children: count === 0 ? t("noEffortShort") : effortName })
          ] }),
          count === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.track, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.rail, "aria-hidden": "true" }),
            ladder.map((effort, stop) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "span",
              {
                className: ProviderPanel_default.stop,
                "aria-hidden": "true",
                style: { left: `calc(10px + (100% - 20px) * ${count > 1 ? stop / (count - 1) : 0})` }
              },
              effort.id
            )),
            position < 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.fill, "aria-hidden": "true", style: { width: `calc((100% - 20px) * ${ratio})` } }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.thumb, "aria-hidden": "true", style: { left: `calc(10px + (100% - 20px) * ${ratio})` } })
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
                disabled: pending,
                "aria-label": t("adjustEffort", { model: model.name }),
                "aria-valuetext": effortName,
                onChange: (event) => {
                  if (selecting.current || pending) return;
                  const next = Number(event.target.value);
                  const effort = ladder[next];
                  if (effort === void 0) return;
                  setDragging({ model, provider, index: next });
                  submit(model, effort.id);
                },
                onPointerUp: () => {
                  setDragging(null);
                },
                onKeyUp: () => {
                  setDragging(null);
                },
                onBlur: () => {
                  setDragging(null);
                }
              }
            )
          ] })
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
  const baseProviderLabel = group?.name ?? directory.current?.provider ?? t("providerTrigger");
  const providerLabel = isCodexProvider(group?.id) && activeAccount !== void 0 ? `${baseProviderLabel} · ${activeAccount.label}` : baseProviderLabel;
  const modelLabel = currentModel?.name ?? (group?.id === directory.current?.provider ? directory.current?.model ?? t("trigger") : t("trigger"));
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
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: ProviderPanel_default.chevron }) })
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
            disabled: pending,
            title: currentEffortName === void 0 ? modelLabel : `${modelLabel} · ${currentEffortName}`,
            onClick: () => {
              toggle("model");
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.dot, "aria-hidden": "true", style: { background: accentFor(currentModel?.id ?? modelLabel, 0) } }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.triggerLabel, children: modelLabel }),
              currentEffortName === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.triggerEffort, children: currentEffortName }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: ProviderPanel_default.chevron }) })
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.providerList, role: "listbox", "aria-label": t("providerTitle"), children: directory.groups.map((candidate) => {
            const selected = candidate.id === group?.id;
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
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: candidate.name }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.providerCount, children: candidate.models.length })
                    ]
                  }
                ),
                isCodexProvider(candidate.id) && accounts.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.accountNote, children: t("accountLoadFailed", { message: accounts.error ?? t("accountUnavailable") }) }) : isCodexProvider(candidate.id) && (accounts.status === "idle" || accounts.status === "loading") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.accountNote, children: t("accountsLoading") }) : null
              ] }, candidate.id);
            }
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.providerFamily, role: "group", "aria-label": candidate.name, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.providerFamilyHead, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: candidate.name }),
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
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.accountState, children: accounts.switchingId === account.id ? t("accountSwitching") : account.active ? t("accountActive") : t("accountUse") }),
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
          }) })
        ] }),
        open === "model" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.menu, role: "dialog", "aria-label": t("title"), "aria-busy": pending || fetching, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.head, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.headTitle, children: group?.name ?? t("title") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: ProviderPanel_default.reload, disabled: pending || fetching, onClick: reload, children: t("reload") })
          ] }),
          error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: t(error.kind, { message: error.message }) }) : directory.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: directory.error }),
          directory.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.error, role: "alert", children: t("providerFailed", { provider: failure.name, message: failure.message }) }, failure.id)),
          fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, role: "status", children: t("loading") }) : null,
          directory.current !== null && group?.id === directory.current.provider && currentModel === void 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("missing", { provider: directory.current.provider, model: directory.current.model }) }) : null,
          models.length === 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("empty") }) : null,
          models.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            currentModel === void 0 ? null : efforts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ProviderPanel_default.note, children: t("noEffort") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.pills, role: "group", "aria-label": t("effort"), children: efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: ProviderPanel_default.pill,
                "aria-pressed": effort.id === currentEffort,
                disabled: pending,
                onClick: () => {
                  submit(currentModel, effort.id);
                },
                children: effort.name
              },
              effort.id
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ProviderPanel_default.rows, children: models.map(renderRow) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ProviderPanel_default.foot, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.footLabel, children: t("contextWindow") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ProviderPanel_default.note, children: t("contextUnsupported") })
          ] })
        ] })
      ]
    }
  );
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
  accountUse: "Use",
  weeklyQuota: "wk {value}%",
  quotaNoWeekly: "no weekly quota",
  readQuota: "Read quota",
  quotaReading: "Reading…",
  quotaFailedShort: "Quota read failed",
  quotaRestoreFailed: "Could not restore the previous account; the active account may have changed.",
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
  accountUse: "使用",
  weeklyQuota: "周 {value}%",
  quotaNoWeekly: "无周额度",
  readQuota: "读取额度",
  quotaReading: "读取中…",
  quotaFailedShort: "额度读取失败",
  quotaRestoreFailed: "未能切回原账号，当前活动账号可能已变更。",
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

// src/client/index.ts
var NS = "providerExtension";
var inject = ["slots", "locale", "connection", "modelDirectories", "sessions", "remote", "remote.session"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-provider-extension: dictionaries");
  const connection = ctx.get("connection");
  const codexAccounts = new CodexAccountsController(connection.rpc);
  ctx.effect(() => () => {
    codexAccounts.dispose();
  }, "dsh-provider-extension: Codex account controller");
  ctx.effect(() => ctx.on("connection/reset", () => {
    codexAccounts.invalidate();
  }), "dsh-provider-extension: Codex account reset");
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-provider-extension";
    tag.textContent = cssText;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "dsh-provider-extension: styles");
  ctx.slots.inject("conversation.input.model", () => ctx.slots.register({
    name: "conversation.input.model",
    priority: -20,
    locale: NS,
    inject: (sessionId) => {
      const directory = ctx.modelDirectories.directoryFor(sessionId);
      return {
        available: ctx.sessions.subagentAddress(sessionId) === void 0,
        hooks: { directory: directory.store, accounts: codexAccounts.store },
        loadDirectory: async () => {
          await directory.load();
        },
        loadAccounts: async () => {
          await codexAccounts.load();
        },
        selectAccount: async (id) => {
          await codexAccounts.select(id);
          window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
          await directory.load();
        },
        readQuota: async (id) => {
          await codexAccounts.readQuota(id);
          window.dispatchEvent(new Event("dsh-codex-subscription:refresh-quick-quota"));
        },
        select: async (selection) => {
          await directory.select(selection);
        }
      };
    }
  }, ProviderPanel));
}
;return module.exports;}});
//# sourceMappingURL=client.js.map
