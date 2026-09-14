window.__ModuleLoader__.load({id:"dsh-model-panel",factory:(require)=>{var module={exports:{}};var exports=module.exports;
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
  ModelPanel: () => ModelPanel,
  NS: () => NS,
  accentFor: () => accentFor,
  activeGroup: () => activeGroup,
  apply: () => apply,
  effortIndex: () => effortIndex,
  inject: () => inject,
  isCurrentModel: () => isCurrentModel,
  restingEffort: () => restingEffort,
  selectionForRow: () => selectionForRow
});
module.exports = __toCommonJS(index_exports);

// src/client/ModelPanel.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

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

// dsh-model-panel-css:ModelPanel.module.css
var cssText = ".dmp_root_rqbjeW{flex:none;position:relative}.dmp_trigger_rqbjeW{width:max-content;max-width:100%;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:14px;outline:none;flex:none;align-items:center;gap:6px;padding:0 5px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}.dmp_trigger_rqbjeW:hover:not(:disabled),.dmp_trigger_rqbjeW[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dmp_trigger_rqbjeW:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dmp_trigger_rqbjeW:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dmp_dot_rqbjeW{border-radius:50%;flex:none;width:7px;height:7px}.dmp_triggerLabel_rqbjeW{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;overflow:hidden}.dmp_triggerEffort_rqbjeW{color:var(--dsw-alias-label-primary);white-space:nowrap;flex:none;font-weight:600}.dmp_chevron_rqbjeW{color:var(--dsw-alias-label-caption);flex:none}.dmp_menu_rqbjeW{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:min(392px,100vw - 32px);max-height:min(560px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);border-radius:16px;flex-direction:column;padding:12px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow-y:auto}.dmp_head_rqbjeW{justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;display:flex}.dmp_headTitle_rqbjeW{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dmp_reload_rqbjeW{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:7px;outline:none;flex:none;padding:2px 6px;font-size:12px;line-height:18px}.dmp_reload_rqbjeW:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dmp_reload_rqbjeW:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dmp_pills_rqbjeW{background:var(--dsw-alias-interactive-bg-hover);border-radius:12px;gap:3px;padding:3px;display:flex}.dmp_pill_rqbjeW{min-width:0;height:26px;color:var(--dsw-alias-label-secondary);cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:none;border-radius:9px;outline:none;flex:1 1 0;padding:0 6px;font-size:12px;line-height:26px;overflow:hidden}.dmp_pill_rqbjeW:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dmp_pill_rqbjeW[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}.dmp_pill_rqbjeW:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dmp_rows_rqbjeW{flex-direction:column;gap:4px;margin-top:10px;display:flex}.dmp_row_rqbjeW{border:1px solid #0000;border-radius:12px;padding:4px 10px 2px;position:relative}.dmp_rowCurrent_rqbjeW{border-color:var(--dshx-accent-edge,var(--dsw-alias-border-l3));background:var(--dshx-accent-soft,var(--dsw-alias-interactive-bg-hover))}.dmp_rowHead_rqbjeW{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;gap:8px;font-size:12px;line-height:18px;display:flex}.dmp_rowCurrent_rqbjeW .dmp_rowHead_rqbjeW{color:var(--dsw-alias-label-primary)}.dmp_rowName_rqbjeW{color:inherit;font:inherit;text-align:left;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:0;padding:2px 0;font-weight:600;overflow:hidden}.dmp_rowValue_rqbjeW{flex:none}.dmp_track_rqbjeW{align-items:center;height:40px;display:flex;position:relative}.dmp_rail_rqbjeW{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;height:8px;position:absolute;left:10px;right:10px}.dmp_fill_rqbjeW{background:var(--dshx-accent,var(--dsw-alias-label-secondary));clip-path:inset(0 round 999px);opacity:0;border-radius:999px;height:8px;position:absolute;left:10px}.dmp_rowCurrent_rqbjeW .dmp_fill_rqbjeW{opacity:.95}.dmp_stop_rqbjeW{background:var(--dsw-alias-label-dimmed);border-radius:50%;width:4px;height:4px;position:absolute;top:50%;transform:translate(-50%,-50%)}.dmp_thumb_rqbjeW{background:var(--dsw-alias-label-tertiary);width:20px;height:20px;box-shadow:var(--dsw-shadow-lv3);border-radius:50%;transition:left .25s cubic-bezier(.22,1,.36,1),background .2s;position:absolute;top:50%;transform:translate(-50%,-50%)}.dmp_rowCurrent_rqbjeW .dmp_thumb_rqbjeW{background:var(--dshx-accent,var(--dsw-alias-label-primary))}.dmp_input_rqbjeW{opacity:0;-webkit-appearance:none;appearance:none;cursor:pointer;background:0 0;width:100%;height:100%;margin:0;padding:0;position:absolute;inset:0}.dmp_input_rqbjeW:disabled{cursor:default}.dmp_foot_rqbjeW{border-top:1px solid var(--dsw-alias-border-l3);justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding-top:10px;display:flex}.dmp_footLabel_rqbjeW{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.dmp_tiers_rqbjeW{background:var(--dsw-alias-interactive-bg-hover);border-radius:11px;gap:3px;padding:3px;display:flex}.dmp_tier_rqbjeW{min-width:52px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;padding:0 8px;font-size:12px;line-height:24px}.dmp_tier_rqbjeW:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dmp_tier_rqbjeW[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}.dmp_tier_rqbjeW:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dmp_note_rqbjeW{color:var(--dsw-alias-label-tertiary);margin:8px 0 0;font-size:12px;line-height:18px}.dmp_error_rqbjeW{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;margin:0 0 8px;padding:7px 8px;font-size:12px;line-height:18px}";
var ModelPanel_default = { "trigger": "dmp_trigger_rqbjeW", "footLabel": "dmp_footLabel_rqbjeW", "dot": "dmp_dot_rqbjeW", "track": "dmp_track_rqbjeW", "rowHead": "dmp_rowHead_rqbjeW", "rowName": "dmp_rowName_rqbjeW", "rowValue": "dmp_rowValue_rqbjeW", "tiers": "dmp_tiers_rqbjeW", "row": "dmp_row_rqbjeW", "head": "dmp_head_rqbjeW", "fill": "dmp_fill_rqbjeW", "tier": "dmp_tier_rqbjeW", "triggerEffort": "dmp_triggerEffort_rqbjeW", "chevron": "dmp_chevron_rqbjeW", "headTitle": "dmp_headTitle_rqbjeW", "rows": "dmp_rows_rqbjeW", "foot": "dmp_foot_rqbjeW", "reload": "dmp_reload_rqbjeW", "error": "dmp_error_rqbjeW", "stop": "dmp_stop_rqbjeW", "rail": "dmp_rail_rqbjeW", "pills": "dmp_pills_rqbjeW", "rowCurrent": "dmp_rowCurrent_rqbjeW", "input": "dmp_input_rqbjeW", "pill": "dmp_pill_rqbjeW", "root": "dmp_root_rqbjeW", "menu": "dmp_menu_rqbjeW", "note": "dmp_note_rqbjeW", "triggerLabel": "dmp_triggerLabel_rqbjeW", "thumb": "dmp_thumb_rqbjeW" };

// src/client/ModelPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ModelPanel({ useDirectory, loadDirectory, select, t }) {
  const directory = useDirectory((snapshot) => snapshot);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [dragging, setDragging] = (0, import_react.useState)(null);
  const root = (0, import_react.useRef)(null);
  const trigger = (0, import_react.useRef)(null);
  const generation = (0, import_react.useRef)(0);
  const mounted = (0, import_react.useRef)(false);
  const selecting = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    mounted.current = true;
    generation.current++;
    selecting.current = false;
    setBusy(false);
    setLoading(false);
    setError(null);
    setDragging(null);
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [useDirectory, loadDirectory, select]);
  const group = activeGroup(directory);
  const models = group?.models ?? [];
  const currentModel = group === void 0 ? void 0 : models.find((model) => isCurrentModel(directory.current, group.id, model));
  const efforts = currentModel?.reasoning?.efforts ?? [];
  const currentEffort = directory.current?.reasoningEffort;
  const currentEffortName = efforts.find((effort) => effort.id === currentEffort)?.name;
  const pending = busy || directory.status === "selecting";
  const fetching = loading || directory.status === "loading";
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
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
        className: isCurrent ? `${ModelPanel_default.row} ${ModelPanel_default.rowCurrent}` : ModelPanel_default.row,
        "data-model-accent": model.id,
        "data-current": isCurrent,
        style: {
          "--dshx-accent": accent,
          "--dshx-accent-soft": `${accent}1f`,
          "--dshx-accent-edge": `${accent}66`
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ModelPanel_default.rowHead, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: ModelPanel_default.rowName,
                "aria-label": t("selectModel", { model: model.name }),
                "aria-pressed": isCurrent,
                disabled: pending,
                onClick: () => {
                  submit(model, restingId);
                },
                children: model.name
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.rowValue, children: count === 0 ? t("noEffortShort") : effortName })
          ] }),
          count === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ModelPanel_default.track, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.rail, "aria-hidden": "true" }),
            ladder.map((effort, stop) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "span",
              {
                className: ModelPanel_default.stop,
                "aria-hidden": "true",
                style: { left: `calc(10px + (100% - 20px) * ${count > 1 ? stop / (count - 1) : 0})` }
              },
              effort.id
            )),
            position < 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.fill, "aria-hidden": "true", style: { width: `calc((100% - 20px) * ${ratio})` } }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.thumb, "aria-hidden": "true", style: { left: `calc(10px + (100% - 20px) * ${ratio})` } })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: ModelPanel_default.input,
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
  const triggerLabel = currentModel?.name ?? directory.current?.model ?? t("trigger");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: ModelPanel_default.root,
      "data-testid": "dshx-model-panel",
      ref: root,
      onKeyDown: (event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            ref: trigger,
            type: "button",
            className: ModelPanel_default.trigger,
            "aria-label": t("title"),
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            onClick: () => {
              const next = !open;
              setOpen(next);
              if (next) reload();
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.dot, "aria-hidden": "true", style: { background: accentFor(currentModel?.id ?? "", 0) } }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.triggerLabel, children: triggerLabel }),
              currentEffortName === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.triggerEffort, children: currentEffortName }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: ModelPanel_default.chevron }) })
            ]
          }
        ),
        open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ModelPanel_default.menu, role: "dialog", "aria-label": t("title"), "aria-busy": pending || fetching, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ModelPanel_default.head, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.headTitle, children: group?.name ?? t("title") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: ModelPanel_default.reload, disabled: pending || fetching, onClick: reload, children: t("reload") })
          ] }),
          error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.error, role: "alert", children: t(error.kind, { message: error.message }) }) : directory.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.error, role: "alert", children: directory.error }),
          directory.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.error, role: "alert", children: t("providerFailed", { provider: failure.name, message: failure.message }) }, failure.id)),
          fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.note, role: "status", children: t("loading") }) : null,
          directory.current !== null && currentModel === void 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.note, children: t("missing", { provider: directory.current.provider, model: directory.current.model }) }) : null,
          models.length === 0 && !fetching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.note, children: t("empty") }) : null,
          models.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            currentModel === void 0 ? null : efforts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: ModelPanel_default.note, children: t("noEffort") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ModelPanel_default.pills, role: "group", "aria-label": t("effort"), children: efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: ModelPanel_default.pill,
                "aria-pressed": effort.id === currentEffort,
                disabled: pending,
                onClick: () => {
                  submit(currentModel, effort.id);
                },
                children: effort.name
              },
              effort.id
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ModelPanel_default.rows, children: models.map(renderRow) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: ModelPanel_default.foot, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.footLabel, children: t("contextWindow") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ModelPanel_default.note, children: t("contextUnsupported") })
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
var NS = "modelPanel";
var inject = ["slots", "locale", "modelDirectories", "sessions", "remote", "remote.session"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-model-panel: dictionaries");
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-model-panel";
    tag.textContent = cssText;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "dsh-model-panel: styles");
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "dsh-model-panel",
    order: 20,
    locale: NS,
    inject: (sessionId) => {
      const directory = ctx.modelDirectories.directoryFor(sessionId);
      return {
        hooks: { directory: directory.store },
        loadDirectory: async () => {
          await directory.load();
        },
        select: async (selection) => {
          await directory.select(selection);
        }
      };
    }
  }, ModelPanel));
}
;return module.exports;}});
//# sourceMappingURL=client.js.map
