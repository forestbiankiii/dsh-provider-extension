var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// src/antigravity/safe-text.ts
function isBoundedSafeText(value, maxLength, minLength = 1) {
  if (typeof value !== "string" || !Number.isSafeInteger(maxLength) || !Number.isSafeInteger(minLength) || minLength < 0 || maxLength < minLength || value.length < minLength || value.length > maxLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint < 32 || codePoint === 127) return false;
  }
  return true;
}
var init_safe_text = __esm({
  "src/antigravity/safe-text.ts"() {
    "use strict";
  }
});

// src/antigravity/auth-store.ts
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, lstat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
function defaultAuthStorePath(env = process.env, home = env.HOME, platform = process.platform) {
  if (platform === "win32") {
    const windowsDataHome = env.LOCALAPPDATA ?? env.APPDATA;
    const base2 = typeof windowsDataHome === "string" && windowsDataHome.length > 0 ? windowsDataHome : env.USERPROFILE ?? home ?? "";
    return join(base2, "dsh-antigravity-auth", "auth.json");
  }
  const dataHome = env.XDG_DATA_HOME;
  const base = typeof dataHome === "string" && dataHome.length > 0 ? dataHome : join(home ?? "", ".local", "share");
  return join(base, "dsh-antigravity-auth", "auth.json");
}
function createAuthStore(path, options = {}) {
  const now = options.now ?? (() => Date.now());
  const platform = options.platform ?? process.platform;
  const enqueue = createMutationQueue();
  const readMulti = () => readMultiRecordForPlatform(path, platform);
  return {
    read: async () => {
      const multi = await readMulti();
      return activeFromMulti(multi);
    },
    readAccounts: async () => {
      const multi = await readMulti();
      return multi?.accounts ?? [];
    },
    selectAccount: (id) => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti();
      const updated = selectAccountRecord(multi, id);
      if (updated === void 0) return void 0;
      await writeMultiAuthRecord(path, updated);
      return activeFromMulti(updated);
    })),
    updateAccount: (id, patch) => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti();
      if (!multi) return [];
      const accounts = multi.accounts.map((acc) => {
        if (acc.id !== id) return acc;
        return {
          ...acc,
          ...patch.label !== void 0 ? { label: patch.label } : {},
          ...patch.tier !== void 0 ? { tier: patch.tier } : {}
        };
      });
      const updated = { ...multi, accounts, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeMultiAuthRecord(path, updated);
      return updated.accounts;
    })),
    renameAccount: (id, label) => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti();
      if (!multi) return [];
      const accounts = multi.accounts.map((acc) => acc.id === id ? { ...acc, label } : acc);
      const updated = { ...multi, accounts, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeMultiAuthRecord(path, updated);
      return updated.accounts;
    })),
    removeAccount: (id) => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti();
      const updated = removeAccountRecord(multi, id);
      if (updated === void 0) {
        try {
          await unlink(path);
        } catch (err) {
          if (!isNotFound(err)) throw storeIoError();
        }
        await syncDirectory(dirname(path));
        return [];
      }
      await writeMultiAuthRecord(path, updated);
      return updated.accounts;
    })),
    commit: (draft) => enqueue(() => withStoreLock(path, async () => {
      const current = await readMulti();
      const updated = commitAccount(current, draft, now());
      await writeMultiAuthRecord(path, updated);
      return activeFromMulti(updated);
    })),
    compareAndCommit: (expectedRevision, draft, expectedLineage) => enqueue(() => withStoreLock(path, async () => {
      const current = await readMulti();
      const active = activeFromMulti(current);
      if ((active?.revision ?? 0) !== expectedRevision) return void 0;
      const lineage = expectedLineage ?? draft.lineage;
      if (lineage === void 0 ? active?.lineage !== void 0 : active?.lineage !== lineage) return void 0;
      const updated = commitAccount(current, draft, now(), expectedRevision + 1);
      await writeMultiAuthRecord(path, updated);
      return activeFromMulti(updated);
    })),
    clearIfCurrent: (expectedRevision, expectedLineage) => enqueue(() => withStoreLock(path, async () => {
      const current = await readMulti();
      const active = activeFromMulti(current);
      if ((active?.revision ?? 0) !== expectedRevision) return false;
      if (expectedLineage === void 0 ? active?.lineage !== void 0 : active?.lineage !== expectedLineage) return false;
      try {
        await unlink(path);
      } catch (error) {
        if (!isNotFound(error)) throw storeIoError();
      }
      await syncDirectory(dirname(path));
      return true;
    })),
    clear: () => enqueue(() => withStoreLock(path, async () => {
      try {
        await unlink(path);
      } catch (error) {
        if (!isNotFound(error)) throw storeIoError();
      }
      await syncDirectory(dirname(path));
    }))
  };
}
function createMutationQueue() {
  let mutation = Promise.resolve();
  return function enqueue(operation) {
    const next = mutation.then(operation, operation);
    mutation = next.then(() => {
    }, () => {
    });
    return next;
  };
}
async function withStoreLock(path, operation) {
  const parent = dirname(path);
  await prepareParent(parent);
  const lockPath = join(parent, AUTH_STORE_LOCK_NAME);
  const deadline = Date.now() + AUTH_STORE_LOCK_TIMEOUT_MS;
  while (true) {
    try {
      const handle = await open(lockPath, "wx", 384);
      try {
        await handle.writeFile(`${process.pid}
`, "utf8");
        await handle.sync();
        return await operation();
      } finally {
        await handle.close().catch(() => {
        });
        await unlink(lockPath).catch(() => {
        });
      }
    } catch (error) {
      if (error instanceof AuthStoreError) throw error;
      if (!isAlreadyExists(error)) throw storeIoError();
      await removeStaleLock(lockPath);
      if (Date.now() >= deadline) throw conflictError();
      await new Promise((resolve3) => setTimeout(resolve3, AUTH_STORE_LOCK_RETRY_MS));
    }
  }
}
async function removeStaleLock(lockPath) {
  try {
    const stat3 = await lstat(lockPath);
    if (Date.now() - stat3.mtimeMs > AUTH_STORE_LOCK_STALE_MS) {
      await unlink(lockPath).catch(() => {
      });
    }
  } catch {
  }
}
async function prepareParent(parent) {
  await mkdir(parent, { recursive: true, mode: 448 });
  await chmod(parent, 448).catch(() => {
  });
}
async function syncDirectory(directory) {
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
  }
}
async function readMultiRecordForPlatform(path, platform) {
  let fileInfo;
  try {
    fileInfo = await lstat(path);
  } catch (error) {
    if (isNotFound(error)) return void 0;
    throw storeIoError();
  }
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw unsafePermissionsError();
  await assertOwnerOnly(path, platform);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw storeIoError();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw corruptError();
  }
  return parseMultiOrV1Record(parsed);
}
async function writeMultiAuthRecord(path, record2) {
  const parent = dirname(path);
  try {
    await prepareParent(parent);
    const temporary = join(parent, `.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 384);
      try {
        await handle.writeFile(`${JSON.stringify(record2, null, 2)}
`, "utf8");
        await handle.sync();
      } finally {
        await handle.close().catch(() => {
        });
      }
      await chmod(temporary, 384);
      await rename(temporary, path);
      await chmod(path, 384);
      await syncDirectory(parent);
    } catch {
      await unlink(temporary).catch(() => {
      });
      throw storeIoError();
    }
  } catch (error) {
    if (error instanceof AuthStoreError) throw error;
    throw storeIoError();
  }
}
function activeFromMulti(multi) {
  if (!multi || multi.accounts.length === 0) return void 0;
  const active = multi.accounts.find((a) => a.id === multi.activeId) ?? multi.accounts[0];
  if (!active) return void 0;
  return {
    version: AUTH_RECORD_VERSION,
    refreshToken: active.refreshToken,
    projectId: active.projectId,
    revision: multi.revision,
    updatedAt: active.updatedAt,
    ...active.email ? { email: active.email } : {},
    ...active.lineage ? { lineage: active.lineage } : {}
  };
}
function commitAccount(current, draft, now, forcedRevision) {
  const email = draft.email ? validateEmail(draft.email) : void 0;
  const id = email || draft.lineage || randomUUID();
  const label = draft.label || email || "Google Account";
  const tier = draft.tier || "Pro";
  const revision = forcedRevision ?? (current?.revision ?? 0) + 1;
  const updatedAt = new Date(now).toISOString();
  const lineage = draft.lineage ?? randomUUID();
  const existingAccounts = current?.accounts ?? [];
  const newAccount = {
    id,
    label,
    tier,
    ...email ? { email } : {},
    refreshToken: draft.refreshToken,
    projectId: draft.projectId,
    lineage,
    active: true,
    updatedAt
  };
  const otherAccounts = existingAccounts.filter((acc) => acc.id !== id && (!email || acc.email !== email)).map((acc) => ({ ...acc, active: false }));
  return {
    version: MULTI_AUTH_RECORD_VERSION,
    activeId: id,
    accounts: [newAccount, ...otherAccounts],
    revision,
    updatedAt
  };
}
function selectAccountRecord(multi, id) {
  if (!multi || multi.accounts.length === 0) return void 0;
  const target = multi.accounts.find((acc) => acc.id === id);
  if (!target) return void 0;
  const accounts = multi.accounts.map((acc) => ({ ...acc, active: acc.id === id }));
  return {
    ...multi,
    activeId: id,
    accounts,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function removeAccountRecord(multi, id) {
  if (!multi) return void 0;
  const remaining = multi.accounts.filter((acc) => acc.id !== id);
  if (remaining.length === 0) return void 0;
  let activeId = multi.activeId;
  if (activeId === id) {
    activeId = remaining[0].id;
  }
  const accounts = remaining.map((acc) => ({ ...acc, active: acc.id === activeId }));
  return {
    ...multi,
    activeId,
    accounts,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function parseMultiOrV1Record(value) {
  if (!isRecord(value)) throw corruptError();
  if (value.version === 1) {
    const v1 = value;
    const email = typeof v1.email === "string" ? validateEmail(v1.email) : void 0;
    const id = email || v1.lineage || "default";
    const account = {
      id,
      label: email || "Google Account",
      ...email ? { email } : {},
      refreshToken: String(v1.refreshToken),
      projectId: String(v1.projectId),
      lineage: typeof v1.lineage === "string" ? v1.lineage : void 0,
      active: true,
      updatedAt: typeof v1.updatedAt === "string" ? v1.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
    };
    return {
      version: MULTI_AUTH_RECORD_VERSION,
      activeId: id,
      accounts: [account],
      revision: Number(v1.revision) || 1,
      updatedAt: account.updatedAt
    };
  }
  if (value.version === 2) {
    const raw = value;
    if (!Array.isArray(raw.accounts) || typeof raw.activeId !== "string") throw corruptError();
    const accounts = raw.accounts.map((acc) => {
      if (!isRecord(acc) || typeof acc.id !== "string" || typeof acc.refreshToken !== "string" || typeof acc.projectId !== "string") {
        throw corruptError();
      }
      return {
        id: acc.id,
        label: typeof acc.label === "string" ? acc.label : typeof acc.email === "string" ? acc.email : "Google Account",
        ...typeof acc.email === "string" ? { email: acc.email } : {},
        refreshToken: acc.refreshToken,
        projectId: acc.projectId,
        lineage: typeof acc.lineage === "string" ? acc.lineage : void 0,
        active: Boolean(acc.active),
        updatedAt: typeof acc.updatedAt === "string" ? acc.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    return {
      version: MULTI_AUTH_RECORD_VERSION,
      activeId: raw.activeId,
      accounts,
      revision: Number(raw.revision) || 1,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  throw unsupportedVersionError();
}
async function assertOwnerOnly(path, platform) {
  try {
    const file = await lstat(path);
    const parent = await lstat(dirname(path));
    const unsafePosixMode = platform !== "win32" && ((file.mode & 63) !== 0 || (parent.mode & 63) !== 0);
    if (file.isSymbolicLink() || parent.isSymbolicLink() || !parent.isDirectory() || unsafePosixMode) {
      throw unsafePermissionsError();
    }
  } catch (error) {
    if (error instanceof AuthStoreError) throw error;
    throw storeIoError();
  }
}
function validateEmail(value) {
  if (!isBoundedSafeText(value, 4096) || !value.includes("@")) throw corruptError();
  return value;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNotFound(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function isAlreadyExists(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
function corruptError() {
  return new AuthStoreError("AUTH_STORE_CORRUPT", "The Antigravity auth store file is corrupt");
}
function unsupportedVersionError() {
  return new AuthStoreError("AUTH_STORE_UNSUPPORTED_VERSION", "Unsupported auth store version");
}
function unsafePermissionsError() {
  return new AuthStoreError("AUTH_STORE_UNSAFE_PERMISSIONS", "The Antigravity auth store has unsafe permissions");
}
function conflictError() {
  return new AuthStoreError("AUTH_STORE_CONFLICT", "Could not acquire lock for Antigravity auth store");
}
function storeIoError() {
  return new AuthStoreError("AUTH_STORE_IO", "Antigravity auth store I/O failed");
}
var AUTH_RECORD_VERSION, MULTI_AUTH_RECORD_VERSION, AUTH_STORE_LOCK_NAME, AUTH_STORE_LOCK_TIMEOUT_MS, AUTH_STORE_LOCK_STALE_MS, AUTH_STORE_LOCK_RETRY_MS, AuthStoreError;
var init_auth_store = __esm({
  "src/antigravity/auth-store.ts"() {
    "use strict";
    init_safe_text();
    AUTH_RECORD_VERSION = 1;
    MULTI_AUTH_RECORD_VERSION = 2;
    AUTH_STORE_LOCK_NAME = ".auth.lock";
    AUTH_STORE_LOCK_TIMEOUT_MS = 1e4;
    AUTH_STORE_LOCK_STALE_MS = 3e4;
    AUTH_STORE_LOCK_RETRY_MS = 10;
    AuthStoreError = class extends Error {
      code;
      constructor(code, message) {
        super(message);
        this.name = "AuthStoreError";
        this.code = code;
      }
    };
  }
});

// src/antigravity/credential-coordinator.ts
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "@cortexkit/antigravity-auth-core";
function createCredentialCoordinator(options) {
  const now = options.now ?? (() => Date.now());
  const refreshAccessToken = options.refreshToken ?? createGoogleRefreshTransport(options.fetchImpl, now);
  const revokeGrant = options.revokeGrant ?? createGoogleRevokeTransport(options.fetchImpl);
  const refreshLeadMs = Math.max(0, options.refreshLeadMs ?? DEFAULT_REFRESH_LEAD_MS);
  const operationTimeoutMs = Math.max(1, options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS);
  let cached;
  let observedRevision = 0;
  let observedLineage;
  let state = "logged-out";
  let errorCode2;
  let lastRefreshAt;
  let refreshFlight;
  let revokeFlight;
  let revokeStatus = { state: "idle" };
  let generation = 0;
  let disposed = false;
  const lifecycleAbort = new AbortController();
  const operations = /* @__PURE__ */ new Set();
  const coordinator = {
    credential: async (signal, credentialOptions) => {
      ensureNotDisposed();
      if (signal?.aborted === true) throw new CredentialOperationError("cancelled");
      const record2 = await options.store.read();
      if (record2 === void 0) {
        clearObservedCredential();
        return void 0;
      }
      observe(record2);
      if (state === "re-login-required") return void 0;
      if (credentialOptions?.forceRefresh !== true && cached !== void 0 && sameRecord(cached, record2) && isFresh(cached.value, now(), refreshLeadMs)) {
        state = "logged-in";
        errorCode2 = void 0;
        return await waitForCaller(Promise.resolve(cached.value), signal);
      }
      if (refreshFlight === void 0) {
        const flight = refreshCredential(generation);
        refreshFlight = flight;
        void flight.then(
          () => clearRefreshFlight(flight),
          () => clearRefreshFlight(flight)
        );
      }
      return await waitForCaller(refreshFlight, signal);
    },
    replaceFromLogin: (credential, record2) => {
      if (disposed) return;
      generation += 1;
      abortOperations();
      cached = { value: { ...credential }, revision: record2.revision, ...record2.lineage === void 0 ? {} : { lineage: record2.lineage } };
      observedRevision = record2.revision;
      observedLineage = record2.lineage;
      state = "logged-in";
      errorCode2 = void 0;
      lastRefreshAt = void 0;
      revokeStatus = { state: "idle" };
      refreshFlight = void 0;
      revokeFlight = void 0;
    },
    status: async () => {
      ensureNotDisposed();
      const record2 = await options.store.read();
      if (record2 === void 0) {
        clearObservedCredential();
      } else {
        observe(record2);
      }
      return makeCredentialStatus(record2);
    },
    revokeStatus: () => ({ ...revokeStatus }),
    logout: async () => {
      ensureNotDisposed();
      generation += 1;
      const logoutGeneration = generation;
      abortOperations();
      refreshFlight = void 0;
      revokeFlight = void 0;
      cached = void 0;
      observedRevision = 0;
      observedLineage = void 0;
      const record2 = await options.store.read();
      if (!isActive(logoutGeneration)) return { state: "logged-out" };
      let cleared = true;
      if (record2 !== void 0) {
        cleared = await options.store.clearIfCurrent(record2.revision, record2.lineage);
      }
      if (!isActive(logoutGeneration)) return { state: "logged-out" };
      if (!cleared) {
        const latest = await options.store.read();
        if (!isActive(logoutGeneration)) return { state: "logged-out" };
        if (latest === void 0) {
          clearObservedCredential();
          revokeStatus = { state: "logged-out" };
        } else {
          observe(latest);
        }
        return { state: "logged-out" };
      }
      state = "logged-out";
      errorCode2 = void 0;
      lastRefreshAt = void 0;
      revokeStatus = { state: "logged-out" };
      return { state: "logged-out" };
    },
    revoke: async (confirmed, signal) => {
      ensureNotDisposed();
      if (!confirmed) {
        revokeStatus = { state: "confirmation-required" };
        return { state: "confirmation-required" };
      }
      if (signal?.aborted === true) throw new CredentialOperationError("cancelled");
      if (revokeFlight !== void 0) return await waitForCaller(revokeFlight, signal);
      generation += 1;
      abortOperations();
      refreshFlight = void 0;
      const revokeGeneration = generation;
      const record2 = await options.store.read();
      if (!isActive(revokeGeneration)) return { state: "superseded" };
      if (record2 === void 0) {
        clearObservedCredential();
        revokeStatus = { state: "logged-out" };
        return { state: "logged-out" };
      }
      revokeStatus = { state: "pending" };
      const flight = revokeCredential(record2, revokeGeneration);
      revokeFlight = flight;
      void flight.then(
        () => clearRevokeFlight(flight),
        () => clearRevokeFlight(flight)
      );
      return await waitForCaller(flight, signal);
    },
    accounts: async () => {
      return await options.store.readAccounts();
    },
    selectAccount: async (id) => {
      ensureNotDisposed();
      generation += 1;
      abortOperations();
      refreshFlight = void 0;
      cached = void 0;
      const record2 = await options.store.selectAccount(id);
      if (record2) {
        observe(record2);
      } else {
        clearObservedCredential();
      }
    },
    updateAccount: async (id, patch) => {
      ensureNotDisposed();
      return await options.store.updateAccount(id, patch);
    },
    renameAccount: async (id, label) => {
      ensureNotDisposed();
      return await options.store.renameAccount(id, label);
    },
    removeAccount: async (id) => {
      ensureNotDisposed();
      generation += 1;
      abortOperations();
      refreshFlight = void 0;
      cached = void 0;
      const remaining = await options.store.removeAccount(id);
      const record2 = await options.store.read();
      if (record2) {
        observe(record2);
      } else {
        clearObservedCredential();
      }
      return remaining;
    },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      lifecycleAbort.abort(new CredentialOperationError("cancelled", "The Antigravity credential service was disposed"));
      abortOperations();
      refreshFlight = void 0;
      revokeFlight = void 0;
      cached = void 0;
      operations.clear();
    }
  };
  function ensureNotDisposed() {
    if (disposed) throw new CredentialOperationError("cancelled", "The Antigravity credential service is unavailable");
  }
  function beginOperation() {
    const controller = new AbortController();
    operations.add(controller);
    if (lifecycleAbort.signal.aborted) controller.abort(lifecycleAbort.signal.reason);
    return controller;
  }
  function endOperation(controller) {
    operations.delete(controller);
  }
  function abortOperations() {
    for (const controller of operations) controller.abort(new CredentialOperationError("cancelled"));
    operations.clear();
  }
  function clearRefreshFlight(flight) {
    if (refreshFlight === flight) refreshFlight = void 0;
  }
  function clearRevokeFlight(flight) {
    if (revokeFlight === flight) revokeFlight = void 0;
  }
  function clearObservedCredential() {
    cached = void 0;
    observedRevision = 0;
    observedLineage = void 0;
    if (!disposed) {
      state = "logged-out";
      errorCode2 = void 0;
      lastRefreshAt = void 0;
    }
  }
  function observe(record2) {
    const lineageChanged = observedRevision !== 0 && observedLineage !== record2.lineage;
    const recordChanged = observedRevision !== 0 && (observedRevision !== record2.revision || lineageChanged);
    if (recordChanged) {
      cached = void 0;
      state = "logged-in";
      errorCode2 = void 0;
      lastRefreshAt = void 0;
    }
    observedRevision = record2.revision;
    observedLineage = record2.lineage;
    if (state === "logged-out") state = "logged-in";
  }
  function isFresh(credential, timestamp, lead) {
    return Number.isFinite(credential.expiresAt) && credential.expiresAt - timestamp > lead;
  }
  function sameRecord(value, record2) {
    return value.revision === record2.revision && value.lineage === record2.lineage;
  }
  function makeCredentialStatus(record2) {
    const configured = record2 !== void 0;
    const expiresAt = cached === void 0 ? void 0 : new Date(cached.value.expiresAt).toISOString();
    return {
      state: configured ? state : "logged-out",
      configured,
      ...expiresAt === void 0 ? {} : { expiresAt },
      ...lastRefreshAt === void 0 ? {} : { lastRefreshAt: new Date(lastRefreshAt).toISOString() },
      ...errorCode2 === void 0 ? {} : { errorCode: errorCode2 }
    };
  }
  async function refreshCredential(startGeneration) {
    if (disposed || startGeneration !== generation) return void 0;
    let record2 = await options.store.read();
    if (!isActive(startGeneration)) return void 0;
    if (record2 === void 0) {
      clearObservedCredential();
      return void 0;
    }
    observe(record2);
    if (state === "re-login-required") return void 0;
    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
      if (!isActive(startGeneration)) return void 0;
      state = "refreshing";
      errorCode2 = void 0;
      const operation = beginOperation();
      let result2;
      try {
        result2 = await runBounded(
          (signal) => refreshAccessToken({ refreshToken: record2.refreshToken, signal }),
          operation,
          operationTimeoutMs
        );
        validateRefreshResult(result2);
      } catch (error) {
        endOperation(operation);
        if (!isActive(startGeneration) || isCancelled(error)) return void 0;
        setRefreshFailure(error);
        return void 0;
      }
      endOperation(operation);
      if (!isActive(startGeneration)) return void 0;
      const current = await options.store.read();
      if (!isActive(startGeneration)) return void 0;
      const responseRefreshToken = result2.refreshToken ?? record2.refreshToken;
      if (current === void 0) {
        clearObservedCredential();
        return void 0;
      }
      if (sameLineage(current, record2) && current.revision !== record2.revision) {
        if (current.refreshToken === responseRefreshToken) {
          return adoptRefreshedCredential(result2, current, startGeneration);
        }
        record2 = current;
        observe(record2);
        continue;
      }
      if (!sameLineage(current, record2)) {
        record2 = current;
        observe(record2);
        continue;
      }
      const committed = await options.store.compareAndCommit(
        record2.revision,
        {
          refreshToken: responseRefreshToken,
          projectId: record2.projectId,
          ...record2.email === void 0 ? {} : { email: record2.email },
          ...record2.lineage === void 0 ? {} : { lineage: record2.lineage }
        },
        record2.lineage
      );
      if (committed !== void 0) return adoptRefreshedCredential(result2, committed, startGeneration);
      const latest = await options.store.read();
      if (!isActive(startGeneration)) return void 0;
      if (latest === void 0) {
        clearObservedCredential();
        return void 0;
      }
      if (latest.refreshToken === responseRefreshToken && sameLineage(latest, record2)) {
        return adoptRefreshedCredential(result2, latest, startGeneration);
      }
      record2 = latest;
      observe(record2);
    }
    if (isActive(startGeneration)) {
      state = "refresh-failed";
      errorCode2 = "conflict";
    }
    return void 0;
  }
  async function adoptRefreshedCredential(result2, record2, startGeneration) {
    if (!isActive(startGeneration)) return void 0;
    const credential = {
      accessToken: result2.accessToken,
      refreshToken: result2.refreshToken ?? record2.refreshToken,
      expiresAt: result2.expiresAt,
      projectId: record2.projectId
    };
    cached = { value: credential, revision: record2.revision, ...record2.lineage === void 0 ? {} : { lineage: record2.lineage } };
    observedRevision = record2.revision;
    observedLineage = record2.lineage;
    state = "logged-in";
    errorCode2 = void 0;
    lastRefreshAt = now();
    return { ...credential };
  }
  async function revokeCredential(record2, revokeGeneration) {
    const operation = beginOperation();
    try {
      await runBounded(
        (signal) => revokeGrant({ token: record2.refreshToken, signal }),
        operation,
        operationTimeoutMs
      );
    } catch (error) {
      endOperation(operation);
      if (!isActive(revokeGeneration) || isCancelled(error)) return { state: "superseded" };
      const code = toRevokeErrorCode(error);
      revokeStatus = { state: "failed", errorCode: code };
      return { state: "failed", errorCode: code };
    }
    endOperation(operation);
    if (!isActive(revokeGeneration)) return { state: "superseded" };
    let cleared;
    try {
      cleared = await options.store.clearIfCurrent(record2.revision, record2.lineage);
    } catch {
      if (!isActive(revokeGeneration)) return { state: "superseded" };
      revokeStatus = { state: "failed", errorCode: "storage" };
      return { state: "failed", errorCode: "storage" };
    }
    if (!isActive(revokeGeneration)) return { state: "superseded" };
    if (!cleared) {
      revokeStatus = { state: "superseded" };
      return { state: "superseded" };
    }
    cached = void 0;
    observedRevision = 0;
    observedLineage = void 0;
    state = "logged-out";
    errorCode2 = void 0;
    lastRefreshAt = void 0;
    revokeStatus = { state: "revoked" };
    return { state: "revoked" };
  }
  function isActive(expectedGeneration) {
    return !disposed && expectedGeneration === generation;
  }
  function setRefreshFailure(error) {
    const code = error instanceof CredentialOperationError ? error.code : "network";
    state = code === "invalid-grant" ? "re-login-required" : "refresh-failed";
    errorCode2 = code;
    cached = void 0;
  }
  function sameLineage(left, right) {
    if (left.lineage !== void 0 || right.lineage !== void 0) return left.lineage === right.lineage;
    return left.revision === right.revision;
  }
  function toRevokeErrorCode(error) {
    const code = error instanceof CredentialOperationError ? error.code : "network";
    if (code === "invalid-grant" || code === "conflict" || code === "cancelled") return "http-error";
    return code;
  }
  return coordinator;
}
function createGoogleRefreshTransport(fetchImpl = globalThis.fetch, now = () => Date.now()) {
  return async ({ refreshToken, signal }) => {
    let response;
    try {
      response = await fetchImpl(ANTIGRAVITY_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: refreshToken
        }),
        signal
      });
    } catch (error) {
      if (isAbortError(error)) throw new CredentialOperationError("cancelled");
      throw new CredentialOperationError("network");
    }
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      throw responseError(response.status);
    }
    const body = await readJsonBody(response);
    if (!response.ok) throw responseError(response.status, body);
    if (!isRecord2(body) || typeof body.access_token !== "string" || !isBoundedSafeText(body.access_token, 4096)) {
      throw new CredentialOperationError("invalid-response");
    }
    const expiresIn = body.expires_in;
    if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_EXPIRES_IN_SECONDS) {
      throw new CredentialOperationError("invalid-response");
    }
    const nextRefreshToken = body.refresh_token;
    if (nextRefreshToken !== void 0 && (typeof nextRefreshToken !== "string" || !isBoundedSafeText(nextRefreshToken, 4096))) {
      throw new CredentialOperationError("invalid-response");
    }
    return {
      accessToken: body.access_token,
      expiresAt: now() + expiresIn * 1e3,
      ...nextRefreshToken === void 0 ? {} : { refreshToken: nextRefreshToken }
    };
  };
}
function createGoogleRevokeTransport(fetchImpl = globalThis.fetch) {
  return async ({ token, signal }) => {
    let response;
    try {
      response = await fetchImpl(ANTIGRAVITY_REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" },
        body: new URLSearchParams({ token }),
        signal
      });
    } catch (error) {
      if (isAbortError(error)) throw new CredentialOperationError("cancelled");
      throw new CredentialOperationError("network");
    }
    if (!response.ok) throw responseError(response.status);
  };
}
async function runBounded(operation, parent, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let removeParentAbort;
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  operationPromise.catch(() => {
  });
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new CredentialOperationError("timeout"));
      reject(new CredentialOperationError("timeout"));
    }, timeoutMs);
  });
  const abortPromise = new Promise((_, reject) => {
    const abort = () => {
      controller.abort(parent.signal.reason);
      reject(new CredentialOperationError("cancelled"));
    };
    removeParentAbort = () => parent.signal.removeEventListener("abort", abort);
    if (parent.signal.aborted) abort();
    else parent.signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operationPromise, timeoutPromise, abortPromise]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
    removeParentAbort?.();
    controller.abort();
  }
}
async function waitForCaller(promise, signal) {
  if (signal === void 0) return await promise;
  if (signal.aborted) throw new CredentialOperationError("cancelled");
  return await new Promise((resolve3, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(new CredentialOperationError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        resolve3(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}
async function readJsonBody(response) {
  const length = response.headers.get("content-length");
  if (length !== null && Number.isFinite(Number(length)) && Number(length) > MAX_RESPONSE_BYTES) {
    throw new CredentialOperationError("invalid-response");
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw new CredentialOperationError("invalid-response");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new CredentialOperationError("invalid-response");
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new CredentialOperationError("invalid-response");
  }
}
function responseError(status, body) {
  if (status === 400 && isRecord2(body) && body.error === "invalid_grant") return new CredentialOperationError("invalid-grant");
  if (status === 408 || status === 504) return new CredentialOperationError("timeout");
  if (status === 429) return new CredentialOperationError("rate-limited");
  if (status >= 500 && status <= 599) return new CredentialOperationError("server-error");
  return new CredentialOperationError("http-error");
}
function validateRefreshResult(value) {
  if (!isRecord2(value) || typeof value.accessToken !== "string" || !isBoundedSafeText(value.accessToken, 4096) || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) {
    throw new CredentialOperationError("invalid-response");
  }
  if (value.refreshToken !== void 0 && (typeof value.refreshToken !== "string" || !isBoundedSafeText(value.refreshToken, 4096))) {
    throw new CredentialOperationError("invalid-response");
  }
}
function isCancelled(error) {
  return error instanceof CredentialOperationError && error.code === "cancelled";
}
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
function credentialErrorMessage(code) {
  switch (code) {
    case "invalid-grant":
      return "The Antigravity grant requires login again";
    case "timeout":
      return "The Antigravity authentication request timed out";
    case "rate-limited":
      return "The Antigravity authentication service is rate-limited";
    case "server-error":
      return "The Antigravity authentication service is unavailable";
    case "network":
      return "The Antigravity authentication request failed";
    case "invalid-response":
      return "The Antigravity authentication response was invalid";
    case "conflict":
      return "The Antigravity credential changed while it was refreshing";
    case "storage":
      return "The Antigravity credential store failed";
    case "cancelled":
      return "The Antigravity authentication request was cancelled";
    case "http-error":
      return "The Antigravity authentication service rejected the request";
    default:
      return void 0;
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANTIGRAVITY_TOKEN_ENDPOINT, ANTIGRAVITY_REVOKE_ENDPOINT, DEFAULT_REFRESH_LEAD_MS, DEFAULT_OPERATION_TIMEOUT_MS, MAX_REFRESH_ATTEMPTS, MAX_RESPONSE_BYTES, MAX_EXPIRES_IN_SECONDS, CredentialOperationError;
var init_credential_coordinator = __esm({
  "src/antigravity/credential-coordinator.ts"() {
    "use strict";
    init_safe_text();
    ANTIGRAVITY_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    ANTIGRAVITY_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
    DEFAULT_REFRESH_LEAD_MS = 3e4;
    DEFAULT_OPERATION_TIMEOUT_MS = 1e4;
    MAX_REFRESH_ATTEMPTS = 2;
    MAX_RESPONSE_BYTES = 64 * 1024;
    MAX_EXPIRES_IN_SECONDS = 31536e3;
    CredentialOperationError = class extends Error {
      code;
      constructor(code, message = credentialErrorMessage(code) ?? "The Antigravity credential operation failed") {
        super(message);
        this.name = "CredentialOperationError";
        this.code = code;
      }
    };
  }
});

// src/antigravity/private-transport-error.ts
var PrivateTransportError;
var init_private_transport_error = __esm({
  "src/antigravity/private-transport-error.ts"() {
    "use strict";
    PrivateTransportError = class extends Error {
      code;
      status;
      /** Whether an upstream could have accepted the request before the failure. */
      accepted;
      constructor(code, message, options = {}) {
        super(message);
        this.name = "PrivateTransportError";
        this.code = code;
        this.accepted = options.accepted ?? true;
        if (options.status !== void 0) this.status = options.status;
      }
    };
  }
});

// src/antigravity/wire-identity.ts
import { Buffer as Buffer2 } from "node:buffer";
import {
  ANTIGRAVITY_ENDPOINT,
  ANTIGRAVITY_ENDPOINT_PROD,
  buildAgyCliHeaderPairs,
  buildAntigravityHarnessUserAgent
} from "@cortexkit/antigravity-auth-core";
import { attributionHeaders as dshAttributionHeaders } from "@deepseek-ai/dsh-llm";
function buildWireIdentityHeaders() {
  const attribution = readAttributionValue();
  assertSafeHeaderValue("User-Agent", AGY_PROVIDER_USER_AGENT, "WIRE_PROVIDER_HEADER_UNSAFE");
  return Object.freeze({
    "User-Agent": AGY_PROVIDER_USER_AGENT,
    [DSH_ATTRIBUTION_HEADER]: attribution
  });
}
function createWireIdentity() {
  const headers = buildWireIdentityHeaders();
  const headerPairs = (url, request2) => {
    assertHttpsEndpoint(url);
    assertClosedObject(request2, ["authorization", "body"], "WIRE_REQUEST_OVERRIDE");
    if (typeof request2.body !== "string" && !(request2.body instanceof Uint8Array)) {
      throw new WireIdentityError("WIRE_REQUEST_BODY_INVALID", "The private request body is not bounded bytes");
    }
    const authorization = validateAuthorization(request2.authorization);
    const basePairs = buildAgyCliHeaderPairs(url, {
      method: "POST",
      body: request2.body,
      headers: {
        "User-Agent": headers["User-Agent"],
        Authorization: authorization,
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip"
      }
    });
    const result2 = [];
    for (const pair of basePairs) {
      const immutablePair = Object.freeze([pair[0], pair[1]]);
      result2.push(immutablePair);
      if (pair[0] === "User-Agent") {
        result2.push(Object.freeze([DSH_ATTRIBUTION_HEADER, headers[DSH_ATTRIBUTION_HEADER]]));
      }
    }
    return Object.freeze(result2);
  };
  const serialize = (url, request2) => {
    const parsed = new URL(url);
    const pairs = headerPairs(url, request2);
    const body = typeof request2.body === "string" ? Buffer2.from(request2.body) : Buffer2.from(request2.body);
    const lines = pairs.map(([name2, value]) => `${name2}: ${value}`).join("\r\n");
    const head = Buffer2.from(`POST ${parsed.pathname}${parsed.search} HTTP/1.1\r
${lines}\r
\r
`);
    if (!pairs.some(([name2]) => name2 === "Transfer-Encoding")) return body.byteLength === 0 ? head : Buffer2.concat([head, body]);
    if (body.byteLength === 0) return Buffer2.concat([head, Buffer2.from("0\r\n\r\n")]);
    return Buffer2.concat([
      head,
      Buffer2.from(`${body.byteLength.toString(16)}\r
`),
      body,
      Buffer2.from("\r\n0\r\n\r\n")
    ]);
  };
  return Object.freeze({ headers: () => headers, headerPairs, serialize });
}
function assertWireIdentityInvariant(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity headers must be an object");
  }
  const headers = value;
  const expected = ["User-Agent", DSH_ATTRIBUTION_HEADER].sort();
  const keys = Object.keys(headers).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity headers contain an unexpected field");
  }
  if (headers["User-Agent"] !== AGY_PROVIDER_USER_AGENT) {
    throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity provider headers changed");
  }
  if (headers[DSH_ATTRIBUTION_HEADER] === AGY_PROVIDER_USER_AGENT) {
    throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity attribution was replaced by the provider");
  }
  for (const key of expected) {
    const header = headers[key];
    if (typeof header !== "string") {
      throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity contains a non-text field");
    }
    assertSafeHeaderValue(key, header, "WIRE_IDENTITY_INVARIANT");
  }
}
function readAttributionValue() {
  let value;
  try {
    value = dshAttributionHeaders();
  } catch {
    throw new WireIdentityError("WIRE_ATTRIBUTION_UNAVAILABLE", "DSH attribution could not be constructed");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WireIdentityError("WIRE_ATTRIBUTION_INVALID", "DSH attribution returned an invalid header set");
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new WireIdentityError("WIRE_ATTRIBUTION_MISSING", "DSH attribution did not contain a User-Agent");
  }
  for (const key of keys) {
    if (!ATTRIBUTION_KEYS.has(key)) {
      throw new WireIdentityError("WIRE_ATTRIBUTION_UNEXPECTED", "DSH attribution contained an unapproved header");
    }
  }
  const lower = value["user-agent"];
  const title = value["User-Agent"];
  if (lower !== void 0 && title !== void 0) {
    throw new WireIdentityError("WIRE_ATTRIBUTION_DUPLICATE", "DSH attribution contained duplicate User-Agent fields");
  }
  const attribution = lower ?? title;
  if (attribution === void 0) {
    throw new WireIdentityError("WIRE_ATTRIBUTION_MISSING", "DSH attribution did not contain a User-Agent");
  }
  if (attribution === AGY_PROVIDER_USER_AGENT) {
    throw new WireIdentityError(
      "WIRE_ATTRIBUTION_PROVIDER_OVERRIDE",
      "DSH attribution was replaced by the Antigravity provider identity"
    );
  }
  assertSafeHeaderValue(DSH_ATTRIBUTION_HEADER, attribution, "WIRE_ATTRIBUTION_UNSAFE");
  return attribution;
}
function validateAuthorization(value) {
  if (typeof value !== "string" || !/^Bearer\s+\S+$/u.test(value)) {
    throw new WireIdentityError("WIRE_REQUEST_UNSAFE_AUTHORIZATION", "The private request authorization value is invalid");
  }
  assertSafeHeaderValue("Authorization", value, "WIRE_REQUEST_UNSAFE_AUTHORIZATION");
  return value;
}
function assertSafeHeaderValue(name2, value, code) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_HEADER_VALUE_LENGTH) {
    throw new WireIdentityError(code, `${name2} is outside the safe header-value bounds`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint < 32 || codePoint === 127) {
      throw new WireIdentityError(code, `${name2} contains an unsafe header character`);
    }
  }
}
function assertHttpsEndpoint(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new WireIdentityError("WIRE_REQUEST_ENDPOINT_INVALID", "The private request endpoint is invalid");
  }
  if (parsed.protocol !== "https:" || !ANTIGRAVITY_WIRE_ORIGINS.some((origin) => origin === parsed.origin) || !ANTIGRAVITY_WIRE_PATHS.some((path) => path === parsed.pathname) || parsed.search.length > 0 && parsed.search !== "?alt=sse" || parsed.hash.length > 0) {
    throw new WireIdentityError("WIRE_REQUEST_ENDPOINT_INVALID", "The private request endpoint is not allowlisted");
  }
}
function assertClosedObject(value, allowedKeys, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WireIdentityError(code, "The wire identity input must be a closed object");
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new WireIdentityError(code, "The wire identity input contains an unapproved override");
  }
}
var DSH_ATTRIBUTION_HEADER, AGY_PROVIDER_USER_AGENT, ANTIGRAVITY_WIRE_ORIGIN, ANTIGRAVITY_WIRE_ORIGINS, ANTIGRAVITY_WIRE_PATHS, MAX_HEADER_VALUE_LENGTH, ATTRIBUTION_KEYS, WireIdentityError;
var init_wire_identity = __esm({
  "src/antigravity/wire-identity.ts"() {
    "use strict";
    DSH_ATTRIBUTION_HEADER = "X-DeepSeek-Harness-Attribution";
    AGY_PROVIDER_USER_AGENT = buildAntigravityHarnessUserAgent();
    ANTIGRAVITY_WIRE_ORIGIN = new URL(ANTIGRAVITY_ENDPOINT).origin;
    ANTIGRAVITY_WIRE_ORIGINS = Object.freeze([
      new URL(ANTIGRAVITY_ENDPOINT).origin,
      new URL(ANTIGRAVITY_ENDPOINT_PROD).origin
    ]);
    ANTIGRAVITY_WIRE_PATHS = Object.freeze([
      "/v1internal:loadCodeAssist",
      "/v1internal:streamGenerateContent",
      "/v1internal:generateContent",
      "/v1internal:retrieveUserQuotaSummary",
      "/v1internal:fetchAvailableModels"
    ]);
    MAX_HEADER_VALUE_LENGTH = 1024;
    ATTRIBUTION_KEYS = /* @__PURE__ */ new Set(["user-agent", "User-Agent"]);
    WireIdentityError = class extends Error {
      code;
      constructor(code, message) {
        super(message);
        this.name = "WireIdentityError";
        this.code = code;
      }
    };
  }
});

// src/antigravity/raw-http.ts
import { Buffer as Buffer3 } from "node:buffer";
import * as net from "node:net";
import { PassThrough, Transform } from "node:stream";
import * as tls from "node:tls";
import { createGunzip } from "node:zlib";
function createRawPrivateDispatcher() {
  const wire = createWireIdentity();
  return async (input) => {
    if (input.signal?.aborted === true) throw cancelled(false);
    const url = new URL(input.url);
    const request2 = wire.serialize(input.url, {
      authorization: `Bearer ${input.accessToken}`,
      body: input.body
    });
    const socket = await connectTls(url, input.responseHeaderTimeoutMs, input.signal);
    let dispatched = false;
    const abort = () => {
      socket.destroy(cancelled(dispatched));
    };
    try {
      if (isAborted(input.signal)) throw cancelled(false);
      input.signal?.addEventListener("abort", abort, { once: true });
      socket.write(request2);
      dispatched = true;
      const { head, leftover } = await waitForHead(socket, input.responseHeaderTimeoutMs, dispatched, input.signal);
      const parsed = parseResponseHead(head);
      const body = buildResponseBody(socket, leftover, parsed, input.signal);
      return new Response(body, {
        status: parsed.status,
        statusText: parsed.statusText,
        headers: parsed.headers
      });
    } catch (error) {
      socket.destroy();
      if (error instanceof PrivateTransportError) throw error;
      throw new PrivateTransportError("offline", "The private endpoint could not be reached", { accepted: dispatched });
    } finally {
      input.signal?.removeEventListener("abort", abort);
    }
  };
}
async function connectTls(url, timeoutMs, signal) {
  const proxy = httpsProxy(url);
  return proxy === void 0 ? connectDirect(url, timeoutMs, signal) : connectThroughProxy(proxy, url, timeoutMs, signal);
}
async function connectDirect(url, timeoutMs, signal) {
  const socket = tls.connect({
    host: url.hostname,
    port: Number(url.port || DEFAULT_HTTPS_PORT),
    servername: url.hostname
  });
  await waitForConnect(socket, "secureConnect", timeoutMs, signal);
  return socket;
}
async function connectThroughProxy(proxy, target, timeoutMs, signal) {
  const proxyAuthorization = proxyAuthorizationHeader(proxy);
  const proxySocket = net.connect({
    host: proxy.hostname,
    port: Number(proxy.port || DEFAULT_PROXY_PORT)
  });
  await waitForConnect(proxySocket, "connect", timeoutMs, signal);
  const targetPort = Number(target.port || DEFAULT_HTTPS_PORT);
  proxySocket.write(
    `CONNECT ${target.hostname}:${targetPort} HTTP/1.1\r
Host: ${target.hostname}:${targetPort}\r
` + proxyAuthorization + "\r\n"
  );
  const { head, leftover } = await waitForHead(proxySocket, timeoutMs, false, signal);
  if (!/^HTTP\/1\.[01]\s+2\d\d(?:\s|$)/u.test(head.split("\r\n", 1)[0] ?? "")) {
    proxySocket.destroy();
    throw new PrivateTransportError("offline", "The HTTPS proxy rejected the private connection", { accepted: false });
  }
  if (leftover.byteLength > 0) proxySocket.unshift(leftover);
  proxySocket.resume();
  const socket = tls.connect({ socket: proxySocket, servername: target.hostname });
  await waitForConnect(socket, "secureConnect", timeoutMs, signal);
  return socket;
}
async function waitForConnect(socket, event, timeoutMs, signal) {
  await new Promise((resolve3, reject) => {
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener(event, onConnect);
      socket.removeListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onConnect = () => finish(resolve3);
    const onError = () => finish(() => reject(new PrivateTransportError("offline", "The private endpoint could not be reached", { accepted: false })));
    const onAbort = () => finish(() => {
      socket.destroy();
      reject(cancelled(false));
    });
    const timer = setTimeout(() => finish(() => {
      socket.destroy();
      reject(new PrivateTransportError("timeout", "The private endpoint connection timed out", { accepted: false }));
    }), timeoutMs);
    socket.once(event, onConnect);
    socket.once("error", onError);
    if (signal?.aborted === true) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function waitForHead(socket, timeoutMs, accepted, signal) {
  return new Promise((resolve3, reject) => {
    let buffer = Buffer3.alloc(0);
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onError = (error) => finish(() => reject(
      error instanceof PrivateTransportError ? error : new PrivateTransportError("offline", "The private endpoint closed before response headers", { accepted })
    ));
    const onAbort = () => finish(() => {
      socket.destroy();
      reject(cancelled(accepted));
    });
    const onData = (chunk) => {
      buffer = Buffer3.concat([buffer, chunk]);
      const marker = buffer.indexOf("\r\n\r\n");
      if (marker < 0) {
        if (buffer.byteLength > MAX_RESPONSE_HEAD_BYTES) finish(() => reject(new PrivateTransportError("protocol-drift", "The private response headers exceeded the limit", { accepted })));
        return;
      }
      if (marker > MAX_RESPONSE_HEAD_BYTES) {
        finish(() => reject(new PrivateTransportError("protocol-drift", "The private response headers exceeded the limit", { accepted })));
        return;
      }
      socket.pause();
      const head = buffer.subarray(0, marker).toString("latin1");
      const leftover = buffer.subarray(marker + 4);
      finish(() => resolve3({ head, leftover }));
    };
    const timer = setTimeout(() => finish(() => {
      socket.destroy();
      reject(new PrivateTransportError("timeout", "The private request timed out before response headers", { accepted }));
    }), timeoutMs);
    socket.on("data", onData);
    socket.once("error", onError);
    if (signal?.aborted === true) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function parseResponseHead(value) {
  const lines = value.split("\r\n");
  const statusLine = lines.shift() ?? "";
  const match = /^HTTP\/1\.[01]\s+(\d{3})(?:\s+([^\r\n]*))?$/u.exec(statusLine);
  if (match === null) throw new PrivateTransportError("protocol-drift", "The private response status line was malformed");
  const status = Number(match[1]);
  if (status < 200 || status > 599 || hasInvalidHeaderValue(match[2] ?? "")) throw new PrivateTransportError("protocol-drift", "The private response status was unsupported");
  const headers = new Headers();
  let chunked = false;
  let gzip = false;
  let contentLength;
  for (const line of lines) {
    if (line.length === 0 || /^[ \t]/u.test(line)) throw new PrivateTransportError("protocol-drift", "The private response headers were malformed");
    const separator = line.indexOf(":");
    if (separator <= 0) throw new PrivateTransportError("protocol-drift", "The private response headers were malformed");
    const name2 = line.slice(0, separator);
    const raw = line.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name2) || hasInvalidHeaderValue(raw)) {
      throw new PrivateTransportError("protocol-drift", "The private response headers were malformed");
    }
    const lowerName = name2.toLowerCase();
    const lowerValue = raw.toLowerCase();
    if (lowerName === "transfer-encoding") {
      if (chunked || lowerValue !== "chunked") throw new PrivateTransportError("protocol-drift", "The private response framing was unsupported");
      chunked = true;
      continue;
    }
    if (lowerName === "content-encoding") {
      if (gzip || lowerValue !== "gzip") throw new PrivateTransportError("protocol-drift", "The private response encoding was unsupported");
      gzip = true;
      continue;
    }
    if (lowerName === "content-length") {
      if (contentLength !== void 0 || !/^\d+$/u.test(raw)) throw new PrivateTransportError("protocol-drift", "The private response length was ambiguous");
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new PrivateTransportError("protocol-drift", "The private response length was malformed");
      contentLength = parsed;
      continue;
    }
    headers.append(name2, raw);
  }
  if (chunked && contentLength !== void 0) throw new PrivateTransportError("protocol-drift", "The private response framing was ambiguous");
  if (!gzip && contentLength !== void 0) headers.set("content-length", String(contentLength));
  return {
    status,
    statusText: match[2] ?? "",
    headers,
    chunked,
    gzip,
    ...contentLength === void 0 ? {} : { contentLength }
  };
}
function buildResponseBody(socket, leftover, head, signal) {
  const source = new PassThrough();
  let current = source;
  if (head.chunked) current = pipeStage(current, new ChunkedDecoder());
  else if (head.contentLength !== void 0) current = pipeStage(current, new ContentLengthDecoder(head.contentLength));
  if (head.gzip) {
    const gunzip = createGunzip();
    current = pipeStage(current, gunzip);
    current = pipeStage(current, new PassThrough(), () => new PrivateTransportError("protocol-drift", "The private gzip response was malformed"));
  }
  const abort = () => {
    socket.destroy(cancelled(true));
  };
  const cleanup = () => {
    signal?.removeEventListener("abort", abort);
    socket.destroy();
  };
  socket.once("error", (error) => source.destroy(
    error instanceof PrivateTransportError ? error : new PrivateTransportError("offline", "The private response stream failed")
  ));
  if (leftover.byteLength > 0) source.write(leftover);
  socket.pipe(source);
  socket.resume();
  if (signal?.aborted === true) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  current.once("end", cleanup);
  current.once("error", cleanup);
  current.once("close", cleanup);
  return toWebBody(current);
}
function toWebBody(stream) {
  const iterable = {
    [Symbol.asyncIterator]: () => {
      const iterator = stream[Symbol.asyncIterator]();
      return {
        next: () => iterator.next(),
        return: async () => {
          stream.destroy();
          return iterator.return === void 0 ? { done: true, value: void 0 } : await iterator.return();
        }
      };
    }
  };
  return ReadableStream.from(iterable);
}
function pipeStage(source, target, mapError = (error) => error) {
  source.once("error", (error) => target.destroy(mapError(error)));
  return source.pipe(target);
}
function proxyAuthorizationHeader(proxy) {
  if (proxy.username.length === 0) return "";
  let username;
  let password;
  try {
    username = decodeURIComponent(proxy.username);
    password = decodeURIComponent(proxy.password);
  } catch {
    throw new PrivateTransportError("offline", "The configured HTTPS proxy credentials are invalid", { accepted: false });
  }
  if (username.length > 1024 || password.length > 1024 || username.includes(":") || hasInvalidHeaderValue(username) || hasInvalidHeaderValue(password)) {
    throw new PrivateTransportError("offline", "The configured HTTPS proxy credentials are invalid", { accepted: false });
  }
  return `Proxy-Authorization: Basic ${Buffer3.from(`${username}:${password}`).toString("base64")}\r
`;
}
function httpsProxy(url) {
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  if (matchesNoProxy(url.hostname, noProxy)) return void 0;
  const raw = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.ALL_PROXY ?? process.env.all_proxy;
  if (raw === void 0 || raw.length === 0) return void 0;
  try {
    const proxy = new URL(raw);
    if (proxy.protocol !== "http:") throw new PrivateTransportError("offline", "The configured HTTPS proxy protocol is unsupported", { accepted: false });
    return proxy;
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error;
    throw new PrivateTransportError("offline", "The configured HTTPS proxy URL is invalid", { accepted: false });
  }
}
function matchesNoProxy(hostname, value) {
  const host = hostname.toLowerCase();
  return value.split(",").map((item) => item.trim().toLowerCase()).some((item) => item === "*" || (item.startsWith(".") ? host.endsWith(item) : item.length > 0 && (host === item || host.endsWith(`.${item}`))));
}
function hasInvalidHeaderValue(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 && code !== 9 || code === 127) return true;
  }
  return false;
}
function isAborted(signal) {
  return signal?.aborted === true;
}
function cancelled(accepted) {
  return new PrivateTransportError("cancelled", "The private request was cancelled", { accepted });
}
var DEFAULT_HTTPS_PORT, DEFAULT_PROXY_PORT, MAX_RESPONSE_HEAD_BYTES, ContentLengthDecoder, ChunkedDecoder;
var init_raw_http = __esm({
  "src/antigravity/raw-http.ts"() {
    "use strict";
    init_private_transport_error();
    init_wire_identity();
    DEFAULT_HTTPS_PORT = 443;
    DEFAULT_PROXY_PORT = 8080;
    MAX_RESPONSE_HEAD_BYTES = 64 * 1024;
    ContentLengthDecoder = class extends Transform {
      remaining;
      constructor(contentLength) {
        super();
        this.remaining = contentLength;
        if (contentLength === 0) this.push(null);
      }
      _transform(chunk, _encoding, callback) {
        if (this.remaining <= 0 || chunk.byteLength > this.remaining) {
          callback(new PrivateTransportError("protocol-drift", "The private response exceeded its declared length"));
          return;
        }
        this.remaining -= chunk.byteLength;
        this.push(chunk);
        if (this.remaining === 0) this.push(null);
        callback();
      }
      _flush(callback) {
        callback(this.remaining === 0 ? void 0 : new PrivateTransportError("protocol-drift", "The private response ended before its declared length"));
      }
    };
    ChunkedDecoder = class extends Transform {
      buffer = Buffer3.alloc(0);
      finished = false;
      _transform(chunk, _encoding, callback) {
        if (this.finished && chunk.byteLength > 0) {
          callback(new PrivateTransportError("protocol-drift", "The private chunked response contained trailing bytes"));
          return;
        }
        this.buffer = Buffer3.concat([this.buffer, chunk]);
        try {
          this.flushChunks();
          callback();
        } catch (error) {
          callback(error instanceof Error ? error : new PrivateTransportError("protocol-drift", "The private chunked response was malformed"));
        }
      }
      _flush(callback) {
        try {
          this.flushChunks();
          callback(this.finished ? void 0 : new PrivateTransportError("protocol-drift", "The private chunked response ended early"));
        } catch (error) {
          callback(error instanceof Error ? error : new PrivateTransportError("protocol-drift", "The private chunked response was malformed"));
        }
      }
      flushChunks() {
        while (!this.finished) {
          const lineEnd = this.buffer.indexOf("\r\n");
          if (lineEnd < 0) return;
          const sizeText = this.buffer.subarray(0, lineEnd).toString("latin1").split(";", 1)[0]?.trim() ?? "";
          if (!/^[0-9A-Fa-f]+$/u.test(sizeText)) throw new PrivateTransportError("protocol-drift", "The private chunk size was malformed");
          const size = Number.parseInt(sizeText, 16);
          if (!Number.isSafeInteger(size) || size < 0) throw new PrivateTransportError("protocol-drift", "The private chunk size was malformed");
          const chunkStart = lineEnd + 2;
          const chunkEnd = chunkStart + size;
          const end = chunkEnd + 2;
          if (!Number.isSafeInteger(end)) throw new PrivateTransportError("protocol-drift", "The private chunk size was malformed");
          if (this.buffer.byteLength < end) return;
          if (this.buffer[chunkEnd] !== 13 || this.buffer[chunkEnd + 1] !== 10) throw new PrivateTransportError("protocol-drift", "The private chunk terminator was malformed");
          const payload = this.buffer.subarray(chunkStart, chunkEnd);
          this.buffer = this.buffer.subarray(end);
          if (size === 0) {
            if (this.buffer.byteLength > 0) throw new PrivateTransportError("protocol-drift", "The private chunked response contained trailing bytes");
            this.finished = true;
            this.push(null);
            return;
          }
          this.push(payload);
        }
      }
    };
  }
});

// src/antigravity/private-transport.ts
function createPrivateTransport(options = {}) {
  let dispatch;
  const headerTimeoutMs = boundedTimeout(options.responseHeaderTimeoutMs, DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS);
  const maxRequestBytes = boundedRequestBytes(options.maxRequestBytes);
  return {
    request: async (input) => {
      if (isAborted2(input.signal)) throw cancelledError(false);
      const requestBytes = typeof input.body === "string" ? new TextEncoder().encode(input.body).byteLength : input.body.byteLength;
      if (requestBytes > maxRequestBytes) throw new PrivateTransportError("request-too-large", "The private request exceeded the byte limit", { accepted: false });
      if (dispatch === void 0) {
        try {
          dispatch = createRawPrivateDispatcher();
        } catch {
          throw new PrivateTransportError("attribution-rejected", "The private request identity could not be constructed", { accepted: false });
        }
      }
      const response = await dispatch({
        url: input.url,
        accessToken: input.accessToken,
        body: input.body,
        ...input.signal === void 0 ? {} : { signal: input.signal },
        responseHeaderTimeoutMs: boundedTimeout(input.responseHeaderTimeoutMs, headerTimeoutMs)
      });
      if (!(response instanceof Response)) throw new PrivateTransportError("invalid-response", "The private endpoint returned no response");
      return response;
    }
  };
}
function privateStatusError(status) {
  if (status >= 200 && status < 300) return void 0;
  if (status === 401) return new PrivateTransportError("authentication", "The private endpoint requires authentication", { status });
  if (status === 403) return new PrivateTransportError("forbidden", "The private endpoint forbade this account", { status });
  if (status === 429) return new PrivateTransportError("rate-limited", "The private endpoint is rate-limited", { status });
  if (status >= 500) return new PrivateTransportError("upstream", "The private endpoint is unavailable", { status });
  return new PrivateTransportError("protocol-drift", "The private endpoint returned an unexpected status", { status });
}
async function readPrivateBytes(response, options = {}) {
  const maxBytes = boundedBytes(options.maxBytes, DEFAULT_PRIVATE_RESPONSE_BYTES);
  if (response.body === null) {
    try {
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength > maxBytes) throw new PrivateTransportError("response-too-large", "The private response exceeded the byte limit");
      return data;
    } catch (error) {
      if (error instanceof PrivateTransportError) throw error;
      if (isAborted2(options.signal)) throw cancelledError();
      throw new PrivateTransportError("offline", "The private response body could not be read");
    }
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  const startedAt = Date.now();
  try {
    for (; ; ) {
      const chunk = await readChunk(reader, options, startedAt);
      if (chunk.done) break;
      const value = chunk.value;
      total += value.byteLength;
      if (total > maxBytes) {
        await cancelReader(reader);
        throw new PrivateTransportError("response-too-large", "The private response exceeded the byte limit");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error;
    if (isAborted2(options.signal)) throw cancelledError();
    throw new PrivateTransportError("offline", "The private response body could not be read");
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
async function readPrivateText(response, options = {}) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readPrivateBytes(response, options));
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error;
    throw new PrivateTransportError("invalid-response", "The private response was not valid UTF-8");
  }
}
async function* iteratePrivateSse(response, options = {}) {
  const maxBytes = boundedBytes(options.maxBytes, DEFAULT_PRIVATE_RESPONSE_BYTES);
  const maxFrameBytes = boundedBytes(options.maxFrameBytes, DEFAULT_PRIVATE_FRAME_BYTES);
  if (response.body === null) {
    const text = await readPrivateText(response, options);
    if (text.trim().length > 0) yield { data: text.trim() };
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let eventName;
  let dataLines = [];
  let bytes = 0;
  let frameBytes = 0;
  let sawSseFrame = false;
  let plainText = "";
  const startedAt = Date.now();
  const flush = () => {
    if (dataLines.length === 0) {
      eventName = void 0;
      frameBytes = 0;
      return void 0;
    }
    const data = dataLines.join("\n");
    const event = eventName;
    dataLines = [];
    eventName = void 0;
    frameBytes = 0;
    sawSseFrame = true;
    return event === void 0 ? { data } : { data, event };
  };
  try {
    for (; ; ) {
      const chunk = await readChunk(reader, options, startedAt);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new PrivateTransportError("response-too-large", "The private response exceeded the byte limit");
      let decoded;
      try {
        decoded = decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new PrivateTransportError("invalid-response", "The private response was not valid UTF-8");
      }
      plainText += decoded;
      buffer += decoded;
      for (; ; ) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (utf8Bytes(line) > maxFrameBytes) throw new PrivateTransportError("frame-too-large", "The private response frame exceeded the byte limit");
        if (line.length === 0) {
          const event2 = flush();
          if (event2 !== void 0) yield event2;
          continue;
        }
        if (line.startsWith(":")) continue;
        frameBytes += utf8Bytes(line) + 1;
        if (frameBytes > maxFrameBytes) throw new PrivateTransportError("frame-too-large", "The private response frame exceeded the byte limit");
        if (line.startsWith("event:")) {
          eventName = line.slice("event:".length).trim() || void 0;
        } else if (line.startsWith("data:")) {
          const value = line.slice("data:".length).replace(/^ /u, "");
          dataLines.push(value);
        }
      }
    }
    let tail;
    try {
      tail = decoder.decode();
    } catch {
      throw new PrivateTransportError("invalid-response", "The private response was not valid UTF-8");
    }
    plainText += tail;
    buffer += tail;
    if (buffer.length > 0) {
      frameBytes += utf8Bytes(buffer);
      if (frameBytes > maxFrameBytes) throw new PrivateTransportError("frame-too-large", "The private response frame exceeded the byte limit");
      if (buffer.startsWith("data:")) dataLines.push(buffer.slice(5).replace(/^ /u, ""));
    }
    const event = flush();
    if (event !== void 0) yield event;
    if (!sawSseFrame && plainText.trim().length > 0) yield { data: plainText.trim() };
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error;
    if (isAborted2(options.signal)) throw cancelledError();
    throw new PrivateTransportError("offline", "The private response stream could not be read");
  } finally {
    await cancelReader(reader);
    reader.releaseLock();
  }
}
function assertPrivateEndpoint(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new PrivateTransportError("protocol-drift", "The private endpoint URL is invalid");
  }
  if (parsed.origin !== ANTIGRAVITY_WIRE_ORIGIN || parsed.protocol !== "https:" || parsed.search || parsed.hash) {
    throw new PrivateTransportError("protocol-drift", "The private endpoint URL is not allowlisted");
  }
}
async function readChunk(reader, options, startedAt) {
  if (isAborted2(options.signal)) {
    await cancelReader(reader);
    throw cancelledError();
  }
  const totalTimeout = boundedTimeout(options.totalTimeoutMs, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS);
  const elapsed = Date.now() - startedAt;
  if (elapsed >= totalTimeout) {
    await cancelReader(reader);
    throw new PrivateTransportError("timeout", "The private response exceeded the total timeout");
  }
  const idleTimeout = boundedTimeout(options.idleTimeoutMs, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS);
  let timer;
  let removeAbort;
  const abort = new Promise((_, reject) => {
    const onAbort = () => reject(cancelledError());
    removeAbort = () => options.signal?.removeEventListener("abort", onAbort);
    if (options.signal === void 0) return;
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
  });
  const idle = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PrivateTransportError("timeout", "The private response stream stalled")), idleTimeout);
  });
  let totalHandle;
  const remaining = totalTimeout - elapsed;
  const total = new Promise((_, reject) => {
    totalHandle = setTimeout(() => reject(new PrivateTransportError("timeout", "The private response exceeded the total timeout")), remaining);
  });
  try {
    return await Promise.race([reader.read(), abort, idle, total]);
  } catch (error) {
    await cancelReader(reader);
    throw error;
  } finally {
    if (timer !== void 0) clearTimeout(timer);
    if (totalHandle !== void 0) clearTimeout(totalHandle);
    removeAbort?.();
  }
}
function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}
function isAborted2(signal) {
  return signal !== void 0 && signal.aborted;
}
async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch {
  }
}
function cancelledError(accepted = true) {
  return new PrivateTransportError("cancelled", "The private request was cancelled", { accepted });
}
function boundedTimeout(value, fallback) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 10 * 60 * 1e3);
}
function boundedRequestBytes(value) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? DEFAULT_PRIVATE_REQUEST_BYTES : Math.min(Math.floor(value), MAX_PRIVATE_REQUEST_BYTES);
}
function boundedBytes(value, fallback) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), fallback);
}
var DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS, DEFAULT_PRIVATE_RESPONSE_BYTES, DEFAULT_PRIVATE_REQUEST_BYTES, MAX_PRIVATE_REQUEST_BYTES, DEFAULT_PRIVATE_FRAME_BYTES;
var init_private_transport = __esm({
  "src/antigravity/private-transport.ts"() {
    "use strict";
    init_raw_http();
    init_private_transport_error();
    init_wire_identity();
    init_private_transport_error();
    DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS = 18e4;
    DEFAULT_PRIVATE_IDLE_TIMEOUT_MS = 6e4;
    DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS = 3e5;
    DEFAULT_PRIVATE_RESPONSE_BYTES = 8 * 1024 * 1024;
    DEFAULT_PRIVATE_REQUEST_BYTES = 16 * 1024 * 1024;
    MAX_PRIVATE_REQUEST_BYTES = 64 * 1024 * 1024;
    DEFAULT_PRIVATE_FRAME_BYTES = 512 * 1024;
  }
});

// src/antigravity/private-failure.ts
function classifyPrivateFailure(error) {
  if (!(error instanceof PrivateTransportError)) return "failed";
  switch (error.code) {
    case "authentication":
      return "authentication";
    case "forbidden":
      return "forbidden";
    case "rate-limited":
      return "rate-limited";
    case "cancelled":
      return "cancelled";
    case "timeout":
      return "timeout";
    case "attribution-rejected":
      return "attribution-rejected";
    case "protocol-drift":
    case "invalid-response":
      return "protocol-drift";
    case "response-too-large":
    case "frame-too-large":
      return "response-limit";
    case "request-too-large":
      return "request-limit";
    case "upstream":
      return "upstream";
    case "offline":
      return "network";
  }
}
var init_private_failure = __esm({
  "src/antigravity/private-failure.ts"() {
    "use strict";
    init_private_transport_error();
  }
});

// src/antigravity/project-context.ts
import { buildAntigravityLoadCodeAssistMetadata } from "@cortexkit/antigravity-auth-core";
function createProjectDiscovery(options = {}) {
  const timeoutMs = boundedTimeout2(options.operationTimeoutMs);
  const transport = options.transport ?? createPrivateTransport({
    ...options.transportOptions?.responseHeaderTimeoutMs === void 0 ? {} : { responseHeaderTimeoutMs: options.transportOptions.responseHeaderTimeoutMs },
    ...options.transportOptions?.maxRequestBytes === void 0 ? {} : { maxRequestBytes: options.transportOptions.maxRequestBytes }
  });
  return {
    discover: async (accessToken, signal) => {
      if (signal?.aborted === true) throw new ProjectDiscoveryError("cancelled");
      const body = JSON.stringify({ metadata: buildAntigravityLoadCodeAssistMetadata() });
      let response;
      try {
        response = await transport.request({
          url: PROJECT_DISCOVERY_ENDPOINT,
          accessToken,
          body,
          ...signal === void 0 ? {} : { signal },
          responseHeaderTimeoutMs: timeoutMs
        });
      } catch (error) {
        throw mapTransportError(error);
      }
      const statusError = privateStatusError(response.status);
      if (statusError !== void 0) {
        await response.body?.cancel().catch(() => {
        });
        throw mapTransportError(statusError);
      }
      try {
        const text = await readPrivateText(response, {
          ...signal === void 0 ? {} : { signal },
          idleTimeoutMs: Math.min(timeoutMs, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS),
          totalTimeoutMs: Math.min(timeoutMs, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS),
          maxBytes: MAX_RESPONSE_BYTES2
        });
        let value;
        try {
          value = JSON.parse(text);
        } catch {
          throw new ProjectDiscoveryError("malformed");
        }
        return parseProjectResponse(value);
      } catch (error) {
        if (error instanceof ProjectDiscoveryError) throw error;
        throw mapTransportError(error);
      }
    }
  };
}
function normalizeProjectId(value) {
  if (typeof value !== "string") return void 0;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_PROJECT_ID_LENGTH) return void 0;
  return PROJECT_ID_PATTERN.test(normalized) ? normalized : void 0;
}
function parseProjectResponse(value) {
  if (!isRecord3(value)) throw new ProjectDiscoveryError("malformed");
  if (!Object.prototype.hasOwnProperty.call(value, "cloudaicompanionProject")) return void 0;
  const candidate = value.cloudaicompanionProject;
  if (candidate === null || candidate === void 0) return void 0;
  if (typeof candidate === "string") {
    if (candidate.trim().length === 0) return void 0;
    return projectFromValue(candidate);
  }
  if (!isRecord3(candidate)) throw new ProjectDiscoveryError("protocol-drift");
  if (!Object.prototype.hasOwnProperty.call(candidate, "id")) return void 0;
  if (candidate.id === null || candidate.id === void 0) throw new ProjectDiscoveryError("protocol-drift");
  return projectFromValue(candidate.id);
}
function projectFromValue(value) {
  const projectId = normalizeProjectId(value);
  if (projectId === void 0) throw new ProjectDiscoveryError("protocol-drift");
  return { projectId };
}
function boundedTimeout2(value) {
  if (value === void 0 || !Number.isFinite(value) || value <= 0) return DEFAULT_OPERATION_TIMEOUT_MS2;
  return Math.min(Math.floor(value), MAX_OPERATION_TIMEOUT_MS);
}
function mapTransportError(error) {
  if (error instanceof ProjectDiscoveryError) return error;
  if (error instanceof PrivateTransportError) return new ProjectDiscoveryError(PROJECT_FAILURE_CODES[classifyPrivateFailure(error)]);
  return new ProjectDiscoveryError("offline");
}
function projectDiscoveryErrorMessage(code) {
  if (code === "authentication") return "The Antigravity project probe requires authentication";
  if (code === "forbidden") return "The Antigravity project probe was forbidden";
  if (code === "rate-limited") return "The Antigravity project probe is rate-limited";
  if (code === "offline") return "The Antigravity project probe is offline";
  if (code === "malformed") return "The Antigravity project response was malformed";
  if (code === "protocol-drift") return "The Antigravity project protocol changed";
  return "The Antigravity project probe was cancelled";
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var PROJECT_DISCOVERY_PATH, PROJECT_DISCOVERY_ENDPOINT, MAX_RESPONSE_BYTES2, DEFAULT_OPERATION_TIMEOUT_MS2, MAX_OPERATION_TIMEOUT_MS, MAX_PROJECT_ID_LENGTH, PROJECT_ID_PATTERN, ProjectDiscoveryError, createProjectContext, PROJECT_FAILURE_CODES;
var init_project_context = __esm({
  "src/antigravity/project-context.ts"() {
    "use strict";
    init_private_transport();
    init_wire_identity();
    init_private_failure();
    PROJECT_DISCOVERY_PATH = "/v1internal:loadCodeAssist";
    PROJECT_DISCOVERY_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}${PROJECT_DISCOVERY_PATH}`;
    MAX_RESPONSE_BYTES2 = Math.min(DEFAULT_PRIVATE_RESPONSE_BYTES, 64 * 1024);
    DEFAULT_OPERATION_TIMEOUT_MS2 = 1e4;
    MAX_OPERATION_TIMEOUT_MS = 10 * 60 * 1e3;
    MAX_PROJECT_ID_LENGTH = 128;
    PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{2,127}$/u;
    ProjectDiscoveryError = class extends Error {
      code;
      constructor(code, message = projectDiscoveryErrorMessage(code)) {
        super(message);
        this.name = "ProjectDiscoveryError";
        this.code = code;
      }
    };
    createProjectContext = createProjectDiscovery;
    PROJECT_FAILURE_CODES = {
      authentication: "authentication",
      forbidden: "forbidden",
      "rate-limited": "rate-limited",
      cancelled: "cancelled",
      timeout: "offline",
      "attribution-rejected": "protocol-drift",
      "protocol-drift": "protocol-drift",
      "response-limit": "protocol-drift",
      "request-limit": "protocol-drift",
      upstream: "offline",
      network: "offline",
      failed: "offline"
    };
  }
});

// src/antigravity/oauth-flow.ts
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  ANTIGRAVITY_CLIENT_ID as ANTIGRAVITY_CLIENT_ID2,
  ANTIGRAVITY_CLIENT_SECRET as ANTIGRAVITY_CLIENT_SECRET2,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_SCOPES
} from "@cortexkit/antigravity-auth-core";
function createOAuthFlow(options = {}) {
  const clock = options.clock ?? systemClock();
  const random = options.randomBytes ?? ((size) => nodeRandomBytes(size));
  const listenerFactory = options.listenerFactory ?? createNodeLoopbackListenerFactory();
  const exchangeCode = options.exchangeCode ?? createGoogleTokenExchanger(options.fetchImpl ?? fetch, clock);
  const validateProject = options.validateProject ?? (async () => void 0);
  const commit = options.commit ?? (async () => {
  });
  const ttlMs = options.ttlMs ?? OAUTH_FLOW_TTL_MS;
  let pending;
  let processing;
  let generation = 0;
  let committingGeneration;
  let currentStatus = { phase: "idle" };
  let disposed = false;
  let listenerClosing = Promise.resolve();
  const closeListener = (candidate) => {
    const listener = candidate.listener;
    candidate.listener = void 0;
    if (listener === void 0) return listenerClosing;
    listenerClosing = listenerClosing.then(
      () => Promise.resolve(listener.close()).catch(() => {
      }),
      () => Promise.resolve(listener.close()).catch(() => {
      })
    );
    return listenerClosing;
  };
  const flow = {
    generation: () => committingGeneration ?? generation,
    start: async () => {
      if (disposed) throw new OAuthFlowError("internal", "The OAuth flow is unavailable");
      if (pending !== void 0) await cancelPending(pending, "cancelled");
      if (processing !== void 0) {
        if (!processing.commitStarted) {
          processing.controller.abort(new OAuthFlowError("cancelled", "The OAuth login was cancelled"));
        }
        processing = void 0;
      }
      const verifier = encodeBase64Url(randomBytes(random, 32));
      const state = encodeBase64Url(randomBytes(random, 32));
      const authorizationUrl = buildAuthorizationUrl(state, verifier);
      const expiresAt = clock.now() + ttlMs;
      const controller = new AbortController();
      const candidateGeneration = generation + 1;
      generation = candidateGeneration;
      const candidate = {
        authorizationUrl,
        expiresAt,
        state,
        verifier,
        controller,
        generation: candidateGeneration,
        timeout: clock.setTimeout(() => {
          void expire(candidate);
        }, ttlMs),
        active: true,
        commitStarted: false
      };
      pending = candidate;
      currentStatus = {
        phase: "pending",
        authorizationUrl,
        expiresAt: new Date(expiresAt).toISOString()
      };
      try {
        await listenerClosing;
        if (!candidate.active || pending !== candidate) {
          throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        }
        candidate.listener = await listenerFactory.listen((request2) => handleLoopbackRequest(request2));
        if (!candidate.active || pending !== candidate) {
          await closeListener(candidate);
          throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        }
      } catch (error) {
        clock.clearTimeout(candidate.timeout);
        if (pending === candidate) pending = void 0;
        candidate.active = false;
        const safe = asListenerError(error);
        updateStatus(candidate, {
          phase: safe.code === "port-conflict" ? "port-conflict" : "failed",
          errorCode: safe.code
        });
        throw safe;
      }
      return { started: true, phase: "pending", authorizationUrl, expiresAt: new Date(expiresAt).toISOString() };
    },
    status: () => currentStatus,
    completeCallbackUrl: async (callbackUrl) => {
      if (typeof callbackUrl !== "string" || callbackUrl.length === 0 || callbackUrl.length > MAX_CALLBACK_VALUE_LENGTH) {
        throw new OAuthFlowError("invalid-callback-url", "The callback URL is invalid");
      }
      let parsed;
      try {
        parsed = new URL(callbackUrl);
      } catch {
        throw new OAuthFlowError("invalid-callback-url", "The callback URL is invalid");
      }
      if (parsed.protocol !== "http:" || parsed.username.length > 0 || parsed.password.length > 0 || parsed.hash.length > 0) {
        throw new OAuthFlowError("invalid-callback-url", "The callback URL is invalid");
      }
      return completeCallback({
        method: "GET",
        host: parsed.host,
        url: `${parsed.pathname}${parsed.search}`
      });
    },
    cancel: async () => {
      if (pending !== void 0) await cancelPending(pending, "cancelled");
      if (processing !== void 0) {
        const active = processing;
        if (active.commitStarted) return currentStatus;
        active.controller.abort(new OAuthFlowError("cancelled", "The OAuth login was cancelled"));
        updateStatus(active, { phase: "cancelled", errorCode: "cancelled" });
        return currentStatus;
      }
      return currentStatus;
    },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      if (pending !== void 0) await cancelPending(pending, "cancelled");
      if (processing !== void 0) {
        if (!processing.commitStarted) processing.controller.abort(new OAuthFlowError("cancelled", "The OAuth login was cancelled"));
        processing = void 0;
      }
      await listenerClosing;
    }
  };
  async function completeCallback(request2) {
    if (disposed) throw new OAuthFlowError("internal", "The OAuth flow is unavailable");
    const candidate = pending;
    if (candidate === void 0 || !candidate.active) throw noPendingError(currentStatus);
    assertCallbackRequest(request2);
    const callback = parseCallback(request2.url);
    if (callback.state !== candidate.state) {
      throw new OAuthFlowError("state-mismatch", "The OAuth callback state was not accepted");
    }
    candidate.active = false;
    pending = void 0;
    processing = candidate;
    clock.clearTimeout(candidate.timeout);
    void closeListener(candidate);
    if (callback.error !== void 0) {
      processing = void 0;
      candidate.controller.abort(new OAuthFlowError("oauth-error", "The OAuth provider rejected authorization"));
      updateStatus(candidate, { phase: "failed", errorCode: "oauth-error" });
      return { completed: false, phase: "failed", errorCode: "oauth-error" };
    }
    if (callback.code === void 0) {
      processing = void 0;
      updateStatus(candidate, { phase: "failed", errorCode: "missing-code" });
      return { completed: false, phase: "failed", errorCode: "missing-code" };
    }
    const operation = combineSignals(candidate.controller.signal);
    try {
      const token = await exchangeCode({ code: callback.code, verifier: candidate.verifier, signal: operation.signal });
      if (operation.signal.aborted) throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
      assertToken(token);
      let project;
      try {
        project = await validateProject(token.accessToken, operation.signal);
      } catch (error) {
        if (operation.signal.aborted) throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        project = { projectId: "aicode-consumers" };
      }
      if (operation.signal.aborted) throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
      if (project === void 0 || !project.projectId) {
        project = { projectId: "aicode-consumers" };
      }
      let email = token.email ?? project.email;
      let label;
      try {
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${token.accessToken}` },
          signal: operation.signal
        });
        if (userinfoRes.ok) {
          const info = await userinfoRes.json();
          if (typeof info.email === "string") email = info.email;
          if (typeof info.name === "string") label = info.name;
        }
      } catch {
      }
      project = normalizeProject({
        ...project,
        ...email ? { email } : {},
        ...label ? { label } : {},
        tier: "Pro"
      });
      try {
        if (operation.signal.aborted) throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        candidate.commitStarted = true;
        committingGeneration = candidate.generation;
        try {
          await commit(token, project, operation.signal);
        } finally {
          committingGeneration = void 0;
        }
      } catch (error) {
        if (operation.signal.aborted) throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        throw error instanceof OAuthFlowError ? error : new OAuthFlowError("persistence-failed", "The login could not be saved");
      }
      updateStatus(candidate, { phase: "success" });
      return { completed: true, phase: "success" };
    } catch (error) {
      const safe = classifyCompletionError(error, candidate.controller.signal);
      if (safe.code === "cancelled") {
        updateStatus(candidate, { phase: "cancelled", errorCode: "cancelled" });
        return { completed: false, phase: "cancelled", errorCode: "cancelled" };
      }
      updateStatus(candidate, { phase: "failed", errorCode: safe.code });
      return { completed: false, phase: "failed", errorCode: safe.code };
    } finally {
      operation.cleanup();
      if (processing === candidate) processing = void 0;
    }
  }
  async function handleLoopbackRequest(request2) {
    try {
      const result2 = await completeCallback(request2);
      if (result2.completed) return callbackResponse(200, "success");
      return callbackResponse(result2.phase === "cancelled" ? 409 : 400, result2.errorCode);
    } catch (error) {
      const safe = error instanceof OAuthFlowError ? error : new OAuthFlowError("internal", "The callback could not be processed");
      return callbackResponse(callbackStatus(safe.code), safe.code);
    }
  }
  async function expire(candidate) {
    if (pending !== candidate || !candidate.active) return;
    await cancelPending(candidate, "expired");
  }
  async function cancelPending(candidate, phase) {
    if (!candidate.active && pending !== candidate) return;
    candidate.active = false;
    if (pending === candidate) pending = void 0;
    clock.clearTimeout(candidate.timeout);
    candidate.controller.abort(new OAuthFlowError(phase, phase === "expired" ? "The OAuth login expired" : "The OAuth login was cancelled"));
    await closeListener(candidate);
    updateStatus(candidate, {
      phase,
      errorCode: phase
    });
  }
  function updateStatus(candidate, status) {
    if (candidate.generation === generation) currentStatus = status;
  }
  return flow;
}
function createNodeLoopbackListenerFactory() {
  return {
    listen: (handler) => new Promise((resolve3, reject) => {
      const server = createServer((request2, response) => {
        void serveRequest(handler, request2, response);
      });
      let settled = false;
      const onError = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      server.once("error", onError);
      server.listen(ANTIGRAVITY_CALLBACK_PORT, "127.0.0.1", () => {
        settled = true;
        server.removeListener("error", onError);
        resolve3({
          close: () => new Promise((resolveClose, rejectClose) => {
            if (!server.listening) {
              resolveClose();
              return;
            }
            server.close((error) => error === void 0 ? resolveClose() : rejectClose(error));
          })
        });
      });
    })
  };
}
function buildAuthorizationUrl(state, verifier) {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", ANTIGRAVITY_CLIENT_ID2);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ANTIGRAVITY_REDIRECT_URI);
  url.searchParams.set("scope", ANTIGRAVITY_SCOPES.join(" "));
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}
function createGoogleTokenExchanger(fetchImpl, clock = systemClock()) {
  return async ({ code, verifier, signal }) => {
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID2,
        client_secret: ANTIGRAVITY_CLIENT_SECRET2,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: ANTIGRAVITY_REDIRECT_URI
      }),
      signal
    });
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
      }
      throw new OAuthFlowError("token-exchange-failed", "The authorization code could not be exchanged");
    }
    const payload = await readJsonBounded(response, signal);
    if (!isRecord4(payload) || typeof payload.access_token !== "string" || payload.access_token.length === 0 || typeof payload.refresh_token !== "string" || payload.refresh_token.length === 0) {
      throw new OAuthFlowError("token-exchange-failed", "The token response was not accepted");
    }
    const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) && payload.expires_in > 0 ? payload.expires_in : 3600;
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: clock.now() + expiresIn * 1e3,
      ...typeof payload.email === "string" ? { email: payload.email } : {}
    };
  };
}
function assertCallbackRequest(request2) {
  if (request2.method !== "GET") throw new OAuthFlowError("invalid-method", "The OAuth callback method is not accepted");
  if (typeof request2.host !== "string" || !isAllowedCallbackHost(request2.host)) {
    throw new OAuthFlowError("invalid-host", "The OAuth callback host is not accepted");
  }
  let parsed;
  try {
    parsed = new URL(request2.url, `http://${request2.host}`);
  } catch {
    throw new OAuthFlowError("invalid-path", "The OAuth callback URL is not accepted");
  }
  if (parsed.protocol !== "http:" || !isAllowedCallbackHost(parsed.host) || parsed.username.length > 0 || parsed.password.length > 0 || parsed.pathname !== ANTIGRAVITY_CALLBACK_PATH || parsed.hash.length > 0) {
    throw new OAuthFlowError("invalid-path", "The OAuth callback path is not accepted");
  }
}
function parseCallback(value) {
  let parsed;
  try {
    parsed = new URL(value, `http://${ANTIGRAVITY_CALLBACK_HOSTS[0]}`);
  } catch {
    throw new OAuthFlowError("invalid-path", "The OAuth callback URL is not accepted");
  }
  const seen = /* @__PURE__ */ new Set();
  for (const [key, paramValue] of parsed.searchParams) {
    if (seen.has(key)) throw new OAuthFlowError("duplicate-parameter", "The OAuth callback contains duplicate parameters");
    if (!safeCallbackValue(key) || !safeCallbackValue(paramValue)) {
      throw new OAuthFlowError("invalid-parameters", "The OAuth callback parameters are not accepted");
    }
    seen.add(key);
  }
  const state = parsed.searchParams.get("state");
  if (state === null || !safeCallbackValue(state)) throw new OAuthFlowError("missing-state", "The OAuth callback state is missing");
  const code = parsed.searchParams.get("code");
  const error = parsed.searchParams.get("error");
  if (error !== null) {
    if (code !== null || !safeCallbackValue(error)) throw new OAuthFlowError("invalid-parameters", "The OAuth callback parameters are not accepted");
    return { state, error };
  }
  if (parsed.searchParams.has("error_description") || parsed.searchParams.has("error_uri")) {
    throw new OAuthFlowError("invalid-parameters", "The OAuth callback parameters are not accepted");
  }
  if (code === null || !safeCallbackValue(code)) throw new OAuthFlowError("missing-code", "The OAuth callback code is missing");
  return { state, code };
}
function isAllowedCallbackHost(value) {
  return ANTIGRAVITY_CALLBACK_HOSTS.includes(value.toLowerCase());
}
function safeCallbackValue(value) {
  return isBoundedSafeText(value, MAX_CALLBACK_VALUE_LENGTH);
}
function randomBytes(random, size) {
  const bytes = random(size);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size) {
    throw new OAuthFlowError("internal", "The OAuth random source is unavailable");
  }
  return bytes;
}
function encodeBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function systemClock() {
  return {
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimeout: (handle) => clearTimeout(handle)
  };
}
function noPendingError(status) {
  if (status.phase === "expired") return new OAuthFlowError("expired", "The OAuth login expired");
  if (status.phase === "cancelled") return new OAuthFlowError("cancelled", "The OAuth login was cancelled");
  return new OAuthFlowError("no-pending-flow", "There is no pending OAuth login");
}
function asListenerError(error) {
  if (error instanceof OAuthFlowError) return error;
  if (isRecord4(error) && error.code === "EADDRINUSE") {
    return new OAuthFlowError("port-conflict", "The fixed OAuth callback port is already in use");
  }
  return new OAuthFlowError("internal", "The OAuth callback listener could not start");
}
function classifyCompletionError(error, signal) {
  if (signal.aborted || error instanceof OAuthFlowError && error.code === "cancelled") {
    return new OAuthFlowError("cancelled", "The OAuth login was cancelled");
  }
  if (error instanceof OAuthFlowError) return error;
  return new OAuthFlowError("token-exchange-failed", "The OAuth login could not be completed");
}
function assertToken(value) {
  if (!isRecord4(value) || typeof value.accessToken !== "string" || value.accessToken.length === 0 || typeof value.refreshToken !== "string" || value.refreshToken.length === 0 || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) {
    throw new OAuthFlowError("token-exchange-failed", "The token response was not accepted");
  }
}
function normalizeProject(value) {
  if (!isRecord4(value)) throw new OAuthFlowError("project-validation-failed", "Project validation failed");
  const projectId = normalizeProjectId(value.projectId);
  if (projectId === void 0) throw new OAuthFlowError("project-validation-failed", "Project validation failed");
  return {
    projectId,
    ...typeof value.email === "string" ? { email: value.email } : {},
    ...typeof value.label === "string" ? { label: value.label } : {},
    ...typeof value.tier === "string" ? { tier: value.tier } : {}
  };
}
function callbackResponse(status, outcome) {
  const body = outcome === "success" ? '<!doctype html><meta charset="utf-8"><title>Authorization complete</title><p>Authorization complete. You may return to DeepSeek Harness.</p>' : '<!doctype html><meta charset="utf-8"><title>Authorization could not be completed</title><p>Authorization could not be completed. Return to DeepSeek Harness for details.</p>';
  return { status, headers: EMPTY_RESPONSE_HEADERS, body };
}
function callbackStatus(code) {
  if (code === "port-conflict") return 409;
  if (code === "internal") return 500;
  return 400;
}
async function serveRequest(handler, request2, response) {
  const host = typeof request2.headers.host === "string" ? request2.headers.host : void 0;
  const result2 = await handler({
    method: request2.method ?? "",
    ...host === void 0 ? {} : { host },
    url: request2.url ?? ""
  });
  response.writeHead(result2.status, result2.headers);
  response.end(result2.body);
}
async function readJsonBounded(response, signal) {
  if (response.body === null) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_TOKEN_RESPONSE_BYTES) {
      throw new OAuthFlowError("token-exchange-failed", "The token response was not accepted");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new OAuthFlowError("token-exchange-failed", "The token response was not accepted");
    }
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_TOKEN_RESPONSE_BYTES) throw new OAuthFlowError("token-exchange-failed", "The token response was not accepted");
      chunks.push(next.value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new OAuthFlowError("token-exchange-failed", "The token response was not accepted");
  }
}
function combineSignals(primary) {
  const controller = new AbortController();
  const onAbort = () => {
    if (!controller.signal.aborted) controller.abort(primary.reason);
  };
  if (primary.aborted) controller.abort(primary.reason);
  else primary.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => primary.removeEventListener("abort", onAbort)
  };
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANTIGRAVITY_CALLBACK_PORT, ANTIGRAVITY_CALLBACK_PATH, ANTIGRAVITY_CALLBACK_HOSTS, OAUTH_FLOW_TTL_MS, AUTHORIZATION_ENDPOINT, TOKEN_ENDPOINT, MAX_CALLBACK_VALUE_LENGTH, MAX_TOKEN_RESPONSE_BYTES, EMPTY_RESPONSE_HEADERS, OAuthFlowError;
var init_oauth_flow = __esm({
  "src/antigravity/oauth-flow.ts"() {
    "use strict";
    init_project_context();
    init_safe_text();
    ANTIGRAVITY_CALLBACK_PORT = 51121;
    ANTIGRAVITY_CALLBACK_PATH = "/oauth-callback";
    ANTIGRAVITY_CALLBACK_HOSTS = Object.freeze([
      `localhost:${String(ANTIGRAVITY_CALLBACK_PORT)}`,
      `127.0.0.1:${String(ANTIGRAVITY_CALLBACK_PORT)}`,
      `[::1]:${String(ANTIGRAVITY_CALLBACK_PORT)}`,
      "localhost",
      "127.0.0.1",
      "[::1]"
    ]);
    OAUTH_FLOW_TTL_MS = 5 * 60 * 1e3;
    AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    MAX_CALLBACK_VALUE_LENGTH = 4096;
    MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;
    EMPTY_RESPONSE_HEADERS = Object.freeze({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    OAuthFlowError = class extends Error {
      code;
      constructor(code, message) {
        super(message);
        this.name = "OAuthFlowError";
        this.code = code;
      }
    };
  }
});

// src/antigravity/status.ts
function createStatusView(riskAcknowledged, login, credential, revoke, gates = {}) {
  return Object.freeze({
    pluginId: ANTIGRAVITY_PLUGIN_ID,
    phase: "bootstrap",
    privateSelfUse: true,
    singleAccount: true,
    riskAcknowledgementRequired: true,
    riskAcknowledged,
    login: Object.freeze({ ...login }),
    ...credential === void 0 ? {} : { credential: Object.freeze({ ...credential }) },
    ...revoke === void 0 ? {} : { revoke: Object.freeze({ ...revoke }) },
    capabilities: Object.freeze(capabilitiesFor(login, gates).map((capability) => Object.freeze({ ...capability })))
  });
}
function capabilitiesFor(login, gates) {
  const projectBlocked = !login.projectAvailable && (login.configured || login.errorCode !== void 0 && PROJECT_DISCOVERY_FAILURES.has(login.errorCode));
  if (projectBlocked) return CAPABILITY_DEFINITIONS.map((capability) => ({
    id: capability.id,
    state: "disabled",
    reasonCode: "project-unavailable"
  }));
  if (!login.projectAvailable) return CAPABILITY_DEFINITIONS;
  if (gates.gate0?.outcome !== "passed") {
    return CAPABILITY_ROW_IDS.map((id) => gate0Status(id, gates.gate0));
  }
  return CAPABILITY_ROW_IDS.map((id) => gateStatus(
    id,
    id === "auth-llm" ? llmFamilyResult(gates) : gates.capabilities?.[id]
  ));
}
function llmFamilyResult(gates) {
  const results = LLM_FAMILY_IDS.map((family) => gates.llmFamilies?.[family]);
  const failure = results.find((result2) => result2 !== void 0 && result2.outcome !== "passed");
  if (failure !== void 0) return failure;
  if (results.some((result2) => result2?.outcome !== "passed")) return void 0;
  return results.reduce((latest, result2) => latest === void 0 || Date.parse(result2.checkedAt) > Date.parse(latest.checkedAt) ? result2 : latest, void 0);
}
function gate0Status(id, result2) {
  if (result2?.outcome === "failed" || result2?.outcome === "attribution-rejected") {
    return { id, state: "disabled", reasonCode: "gate-0-failed" };
  }
  return gateStatus(id, result2);
}
function gateStatus(id, result2) {
  if (result2 === void 0) return { id, state: "poc-pending", reasonCode: "gate-not-run" };
  if (result2.outcome === "passed") return { id, state: "available", reasonCode: "capability-ready" };
  if (result2.outcome === "protocol-drift") return { id, state: "protocol-drift", reasonCode: "protocol-drift" };
  if (result2.outcome === "attribution-rejected") return { id, state: "disabled", reasonCode: "gate-0-failed" };
  if (result2.outcome === "unauthenticated") return { id, state: "disabled", reasonCode: "unauthenticated" };
  if (result2.outcome === "rate-limited") return { id, state: "disabled", reasonCode: "rate-limited" };
  if (result2.outcome === "cancelled") return { id, state: "disabled", reasonCode: "cancelled" };
  if (result2.outcome === "unsupported-video") return { id, state: "disabled", reasonCode: "unsupported-video" };
  return { id, state: "disabled", reasonCode: "gate-failed" };
}
var ANTIGRAVITY_PLUGIN_ID, CAPABILITY_ROW_IDS, LLM_FAMILY_IDS, CAPABILITY_GATE_OUTCOMES, CAPABILITY_DEFINITIONS, PROJECT_DISCOVERY_FAILURES;
var init_status = __esm({
  "src/antigravity/status.ts"() {
    "use strict";
    ANTIGRAVITY_PLUGIN_ID = "dsh-antigravity-auth";
    CAPABILITY_ROW_IDS = ["auth-llm", "search", "image", "video"];
    LLM_FAMILY_IDS = ["gemini", "claude", "gpt-oss"];
    CAPABILITY_GATE_OUTCOMES = [
      "passed",
      "unauthenticated",
      "rate-limited",
      "cancelled",
      "attribution-rejected",
      "protocol-drift",
      "unsupported-video",
      "failed"
    ];
    CAPABILITY_DEFINITIONS = Object.freeze(
      CAPABILITY_ROW_IDS.map((id) => Object.freeze({ id, state: "disabled", reasonCode: "unauthenticated" }))
    );
    PROJECT_DISCOVERY_FAILURES = /* @__PURE__ */ new Set([
      "project-unavailable",
      "project-authentication-failed",
      "project-forbidden",
      "project-rate-limited",
      "project-offline",
      "project-malformed",
      "project-protocol-drift"
    ]);
  }
});

// src/antigravity/quota.ts
function normalizeQuotaResponse(value, now = Date.now()) {
  const groups = [];
  const sourceValue = isRecord5(value) && isRecord5(value.response) ? value.response : value;
  const source = isRecord5(sourceValue) ? sourceValue : void 0;
  const candidates = source === void 0 ? [] : [
    ...Array.isArray(source.groups) ? source.groups : [],
    ...Array.isArray(source.buckets) ? source.buckets : [],
    ...Array.isArray(source.quotaBuckets) ? source.quotaBuckets : [],
    ...Array.isArray(source.quota_buckets) ? source.quota_buckets : [],
    ...Array.isArray(source.userQuotaSummary) ? source.userQuotaSummary : [],
    ...Array.isArray(source.quotas) ? source.quotas : []
  ];
  for (const candidate of candidates) {
    if (!isRecord5(candidate)) continue;
    const buckets = Array.isArray(candidate.buckets) ? candidate.buckets : Array.isArray(candidate.quotaBuckets) ? candidate.quotaBuckets : Array.isArray(candidate.windows) ? candidate.windows : [candidate];
    for (const rawBucket of buckets) {
      if (!isRecord5(rawBucket)) continue;
      const window = identifyWindow(rawBucket);
      const resetTime = normalizeResetTime(rawBucket.resetTime ?? rawBucket.reset_time ?? rawBucket.resetAt ?? rawBucket.reset_at, now);
      const fraction = normalizeFraction(rawBucket.remainingFraction ?? rawBucket.remaining_fraction ?? rawBucket.fraction ?? rawBucket.remaining ?? rawBucket.remaining_percent ?? rawBucket.percentage);
      if (window === void 0 || resetTime === void 0 || fraction === void 0) continue;
      const group = identifyGroup(candidate, rawBucket);
      if (group === void 0) continue;
      const modelCount = boundedCount(candidate.modelCount ?? candidate.model_count ?? candidate.models ?? descriptionModelCount(candidate.description));
      const existing = groups.find((item) => item.group === group);
      if (existing === void 0) groups.push({ group, modelCount, windows: [{ window, remainingFraction: fraction, resetTime }] });
      else if (!existing.windows.some((item) => item.window === window)) {
        const updated = {
          group,
          modelCount: Math.max(existing.modelCount, modelCount),
          windows: [...existing.windows, { window, remainingFraction: fraction, resetTime }].sort(windowOrder)
        };
        groups.splice(groups.indexOf(existing), 1, updated);
      } else {
        const updatedWindows = existing.windows.map((item) => item.window === window ? { window, remainingFraction: Math.min(item.remainingFraction, fraction), resetTime: item.resetTime } : item);
        const updated = {
          group,
          modelCount: Math.max(existing.modelCount, modelCount),
          windows: updatedWindows.sort(windowOrder)
        };
        groups.splice(groups.indexOf(existing), 1, updated);
      }
    }
  }
  if (groups.length === 0) {
    if (isRecord5(source)) {
      return { state: "available", checkedAt: new Date(now).toISOString(), groups: [] };
    }
    throw new QuotaNormalizationError("The quota response did not contain recognized windows");
  }
  return { state: "available", checkedAt: new Date(now).toISOString(), groups: groups.sort((left, right) => left.group.localeCompare(right.group)) };
}
function createQuotaService(options) {
  const now = options.now ?? (() => Date.now());
  const minInterval = positive(options.minIntervalMs, QUOTA_REFRESH_MIN_INTERVAL_MS);
  const transport = options.transport ?? createPrivateTransport({
    ...options.transportOptions?.responseHeaderTimeoutMs === void 0 ? {} : { responseHeaderTimeoutMs: options.transportOptions.responseHeaderTimeoutMs },
    ...options.transportOptions?.maxRequestBytes === void 0 ? {} : { maxRequestBytes: options.transportOptions.maxRequestBytes }
  });
  let current = { state: "unauthenticated" };
  let checkedAt = 0;
  let inFlight;
  let inFlightAbort;
  const lifecycleController = new AbortController();
  let disposed = false;
  return {
    refresh: async (signal, force = false) => {
      if (disposed) return current;
      if (!force && checkedAt > 0 && now() - checkedAt < minInterval) return current;
      if (inFlight !== void 0) return await waitForCaller2(inFlight, signal);
      const combined = mergeAbortSignals(void 0, lifecycleController.signal);
      inFlightAbort = combined.dispose;
      inFlight = refreshQuota(options.auth, transport, combined.signal, now).then((value) => {
        current = value;
        checkedAt = now();
        return value;
      }).catch((error) => {
        current = mapQuotaError(error, now());
        checkedAt = now();
        return current;
      }).finally(() => {
        combined.dispose();
        inFlightAbort = void 0;
        inFlight = void 0;
      });
      return await waitForCaller2(inFlight, signal);
    },
    status: () => current,
    dispose: async () => {
      disposed = true;
      lifecycleController.abort();
      inFlightAbort?.();
      await inFlight?.catch(() => {
      });
    }
  };
}
async function refreshQuota(auth, transport, signal, now) {
  const credential = await auth.credential(signal);
  if (credential === void 0) return { state: "unauthenticated" };
  const body = credential.projectId ? { project: credential.projectId } : {};
  let response = await transport.request({
    url: ANTIGRAVITY_QUOTA_ENDPOINT,
    accessToken: credential.accessToken,
    body: JSON.stringify(body),
    ...signal === void 0 ? {} : { signal }
  });
  if (response.status === 403 && credential.projectId) {
    try {
      const retryResponse = await transport.request({
        url: ANTIGRAVITY_QUOTA_ENDPOINT,
        accessToken: credential.accessToken,
        body: JSON.stringify({}),
        ...signal === void 0 ? {} : { signal }
      });
      if (retryResponse.ok) {
        response = retryResponse;
      }
    } catch {
    }
  }
  const statusError = privateStatusError(response.status);
  if (statusError !== void 0) {
    await response.body?.cancel().catch(() => {
    });
    throw statusError;
  }
  let value;
  try {
    value = JSON.parse(await readPrivateText(response, { ...signal === void 0 ? {} : { signal }, maxBytes: DEFAULT_PRIVATE_RESPONSE_BYTES }));
  } catch (error) {
    if (error instanceof PrivateTransportError) throw error;
    throw new QuotaNormalizationError("The quota response was not valid JSON");
  }
  return normalizeQuotaResponse(value, now());
}
function mapQuotaError(error, checkedAt) {
  const state = error instanceof PrivateTransportError ? QUOTA_FAILURE_STATES[classifyPrivateFailure(error)] : error instanceof QuotaNormalizationError ? "protocol-drift" : "offline";
  return { state, checkedAt: new Date(checkedAt).toISOString() };
}
function identifyWindow(value) {
  const raw = String(value.window ?? value.windowType ?? value.window_type ?? value.bucketId ?? value.bucket_id ?? "").toLowerCase();
  if (raw.includes("5h") || raw.includes("5-hour") || raw.includes("five")) return "5h";
  if (raw.includes("week") || raw.includes("weekly") || raw.includes("7d")) return "weekly";
  const seconds = numberValue(value.durationSeconds ?? value.duration_seconds);
  if (seconds !== void 0) {
    if (seconds <= 5 * 60 * 60) return "5h";
    if (seconds <= 8 * 24 * 60 * 60) return "weekly";
  }
  return void 0;
}
function identifyGroup(candidate, bucket) {
  const raw = [
    candidate.displayName,
    candidate.group,
    candidate.quotaGroup,
    candidate.quota_group,
    candidate.modelFamily,
    candidate.title,
    candidate.name,
    candidate.description,
    bucket?.bucketId,
    bucket?.bucket_id,
    bucket?.displayName
  ].filter(Boolean).map(String).join(" ").toLowerCase();
  if (raw.includes("3p") || raw.includes("non") || raw.includes("claude") || raw.includes("gpt") || raw.includes("openai") || raw.includes("anthropic") || raw.includes("third-party") || raw.includes("external")) return "non-gemini";
  if (raw.includes("gemini") || raw.includes("google") || raw.includes("chat") || raw.includes("code") || raw.includes("default") || raw.length === 0) return "gemini";
  return "gemini";
}
function normalizeFraction(value) {
  const number = numberValue(value);
  if (number === void 0) return void 0;
  if (number >= 0 && number <= 1) return number;
  if (number <= 100) return number / 100;
  return void 0;
}
function normalizeResetTime(value, now) {
  const parsed = typeof value === "number" ? value < 1e10 ? value * 1e3 : value : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1e14) return void 0;
  const iso = new Date(parsed).toISOString();
  return Number.isFinite(Date.parse(iso)) && parsed >= now - 365 * 24 * 60 * 60 * 1e3 ? iso : void 0;
}
function boundedCount(value) {
  if (Array.isArray(value)) return Math.min(value.length, 1e4);
  const number = numberValue(value);
  return number === void 0 ? 0 : Math.min(Math.floor(number), 1e4);
}
function descriptionModelCount(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 16 * 1024) return 0;
  if (!/^[^:]{1,256}:\s*/u.test(value)) return 0;
  const payload = value.replace(/^[^:]{1,256}:\s*/u, "");
  return Math.min(payload.split(",").map((item) => item.trim()).filter((item) => item.length > 0).length, 1e4);
}
function windowOrder(left, right) {
  return left.window === right.window ? 0 : left.window === "5h" ? -1 : 1;
}
function positive(value, fallback) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 24 * 60 * 60 * 1e3);
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
async function waitForCaller2(promise, signal) {
  if (signal === void 0) return await promise;
  if (signal.aborted) throw new PrivateTransportError("cancelled", "The quota request was cancelled", { accepted: false });
  let remove;
  const cancellation = new Promise((_, reject) => {
    const abort = () => reject(new PrivateTransportError("cancelled", "The quota request was cancelled", { accepted: false }));
    remove = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([promise, cancellation]);
  } finally {
    remove?.();
  }
}
function mergeAbortSignals(first, second) {
  const controller = new AbortController();
  const abort = (event) => {
    if (!controller.signal.aborted) controller.abort(event.target.reason);
  };
  const signals = first === void 0 ? [second] : [first, second];
  for (const signal of signals) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const signal of signals) signal.removeEventListener("abort", abort);
    }
  };
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANTIGRAVITY_QUOTA_ENDPOINT, QUOTA_REFRESH_MIN_INTERVAL_MS, QuotaNormalizationError, QUOTA_FAILURE_STATES;
var init_quota = __esm({
  "src/antigravity/quota.ts"() {
    "use strict";
    init_wire_identity();
    init_private_transport();
    init_private_failure();
    ANTIGRAVITY_QUOTA_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:retrieveUserQuotaSummary`;
    QUOTA_REFRESH_MIN_INTERVAL_MS = 3e4;
    QuotaNormalizationError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "QuotaNormalizationError";
      }
    };
    QUOTA_FAILURE_STATES = {
      authentication: "unauthenticated",
      forbidden: "forbidden",
      "rate-limited": "rate-limited",
      cancelled: "offline",
      timeout: "timeout",
      "attribution-rejected": "protocol-drift",
      "protocol-drift": "protocol-drift",
      "response-limit": "protocol-drift",
      "request-limit": "protocol-drift",
      upstream: "offline",
      network: "offline",
      failed: "offline"
    };
  }
});

// src/antigravity/capability-gates.ts
import { chmod as chmod2, lstat as lstat2, mkdir as mkdir2, readFile as readFile2, rename as rename2, rm, writeFile } from "node:fs/promises";
import { dirname as dirname2, join as join2 } from "node:path";
function defaultCapabilityGatePath(authStorePath) {
  return join2(dirname2(authStorePath), "gates.json");
}
function createMemoryCapabilityGates(initial = {}, now = () => Date.now()) {
  let current = cloneEvidence(initial);
  return {
    read: async () => cloneEvidence(current),
    recordGate0: async (subject, outcome) => {
      current = { subject: checkedSubject(subject), gate0: result(outcome, now) };
      return cloneEvidence(current);
    },
    recordLlmFamily: async (subject, family, outcome) => {
      current = evidenceForSubject(current, subject);
      current = { ...current, llmFamilies: { ...current.llmFamilies, [family]: result(outcome, now) } };
      return cloneEvidence(current);
    },
    recordCapability: async (subject, id, outcome) => {
      current = evidenceForSubject(current, subject);
      current = { ...current, capabilities: { ...current.capabilities, [id]: result(outcome, now) } };
      return cloneEvidence(current);
    },
    clear: async () => {
      current = {};
    }
  };
}
function createFileCapabilityGates(path, options = {}) {
  const now = options.now ?? (() => Date.now());
  const platform = options.platform ?? process.platform;
  let mutation = Promise.resolve();
  const read = async () => {
    let text;
    try {
      const [file, directory] = await Promise.all([lstat2(path), lstat2(dirname2(path))]);
      const unsafePosixMode = platform !== "win32" && ((file.mode & 63) !== 0 || (directory.mode & 63) !== 0);
      if (file.isSymbolicLink() || !file.isFile() || directory.isSymbolicLink() || !directory.isDirectory() || file.size > MAX_GATE_FILE_BYTES || unsafePosixMode) throw new Error("unsafe gate record");
      text = await readFile2(path, "utf8");
      if (text.length > MAX_GATE_FILE_BYTES) throw new Error("oversized gate record");
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error("The Antigravity capability gate record could not be read");
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("The Antigravity capability gate record is malformed");
    }
    return parseFile(value);
  };
  const update = async (mutate) => {
    let output = {};
    const operation = mutation.then(async () => {
      output = mutate(await read());
      await writeEvidence(path, output);
    });
    mutation = operation.catch(() => {
    });
    await operation;
    return cloneEvidence(output);
  };
  return {
    read,
    recordGate0: (subject, outcome) => update(() => ({ subject: checkedSubject(subject), gate0: result(outcome, now) })),
    recordLlmFamily: (subject, family, outcome) => update((current) => {
      const owned = evidenceForSubject(current, subject);
      return { ...owned, llmFamilies: { ...owned.llmFamilies, [family]: result(outcome, now) } };
    }),
    recordCapability: (subject, id, outcome) => update((current) => {
      const owned = evidenceForSubject(current, subject);
      return { ...owned, capabilities: { ...owned.capabilities, [id]: result(outcome, now) } };
    }),
    clear: async () => {
      const operation = mutation.then(async () => {
        await rm(path, { force: true });
      });
      mutation = operation.catch(() => {
      });
      await operation;
    }
  };
}
async function writeEvidence(path, evidence) {
  const directory = dirname2(path);
  await mkdir2(directory, { recursive: true, mode: 448 });
  await chmod2(directory, 448);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const encoded = `${JSON.stringify({ version: GATE_FILE_VERSION, ...evidence })}
`;
  try {
    await writeFile(temporary, encoded, { encoding: "utf8", mode: 384, flag: "wx" });
    await rename2(temporary, path);
    await chmod2(path, 384);
  } finally {
    await rm(temporary, { force: true }).catch(() => {
    });
  }
}
function parseFile(value) {
  if (!isRecord6(value) || value.version !== GATE_FILE_VERSION) throw new Error("The Antigravity capability gate record is malformed");
  if (Object.keys(value).some((key) => !["version", "subject", "gate0", "llmFamilies", "capabilities"].includes(key))) {
    throw new Error("The Antigravity capability gate record is malformed");
  }
  if (typeof value.subject !== "string" || !isBoundedSafeText(value.subject, 128)) {
    throw new Error("The Antigravity capability gate record is malformed");
  }
  const gate0 = value.gate0 === void 0 ? void 0 : parseResult(value.gate0);
  const llmFamilies = value.llmFamilies === void 0 ? void 0 : parseLlmFamilies(value.llmFamilies);
  const capabilities = value.capabilities === void 0 ? void 0 : parseCapabilities(value.capabilities);
  return {
    subject: value.subject,
    ...gate0 === void 0 ? {} : { gate0 },
    ...llmFamilies === void 0 ? {} : { llmFamilies },
    ...capabilities === void 0 ? {} : { capabilities }
  };
}
function parseLlmFamilies(value) {
  if (!isRecord6(value) || Object.keys(value).some((key) => !LLM_FAMILY_IDS.includes(key))) {
    throw new Error("The Antigravity capability gate record is malformed");
  }
  const output = {};
  for (const family of LLM_FAMILY_IDS) {
    if (value[family] !== void 0) output[family] = parseResult(value[family]);
  }
  return output;
}
function parseCapabilities(value) {
  if (!isRecord6(value) || Object.keys(value).some((key) => !PERSISTED_CAPABILITY_IDS.includes(key))) {
    throw new Error("The Antigravity capability gate record is malformed");
  }
  const output = {};
  for (const id of PERSISTED_CAPABILITY_IDS) {
    if (value[id] !== void 0) output[id] = parseResult(value[id]);
  }
  return output;
}
function parseResult(value) {
  if (!isRecord6(value) || Object.keys(value).length !== 2 || !Object.prototype.hasOwnProperty.call(value, "outcome") || !Object.prototype.hasOwnProperty.call(value, "checkedAt") || typeof value.outcome !== "string" || !CAPABILITY_GATE_OUTCOMES.includes(value.outcome) || typeof value.checkedAt !== "string" || value.checkedAt.length > 64 || !Number.isFinite(Date.parse(value.checkedAt))) {
    throw new Error("The Antigravity capability gate record is malformed");
  }
  return { outcome: value.outcome, checkedAt: value.checkedAt };
}
function result(outcome, now) {
  if (!CAPABILITY_GATE_OUTCOMES.includes(outcome)) throw new Error("The Antigravity capability gate outcome is invalid");
  const timestamp = now();
  if (!Number.isFinite(timestamp)) throw new Error("The Antigravity capability gate clock is invalid");
  return { outcome, checkedAt: new Date(timestamp).toISOString() };
}
function checkedSubject(subject) {
  if (!isBoundedSafeText(subject, 128)) throw new Error("The Antigravity capability gate subject is invalid");
  return subject;
}
function evidenceForSubject(current, subject) {
  const checked = checkedSubject(subject);
  return current.subject === checked ? current : { subject: checked };
}
function cloneEvidence(value) {
  return {
    ...value.subject === void 0 ? {} : { subject: value.subject },
    ...value.gate0 === void 0 ? {} : { gate0: { ...value.gate0 } },
    ...value.llmFamilies === void 0 ? {} : { llmFamilies: Object.fromEntries(Object.entries(value.llmFamilies).map(([id, entry]) => [id, entry === void 0 ? void 0 : { ...entry }])) },
    ...value.capabilities === void 0 ? {} : { capabilities: Object.fromEntries(Object.entries(value.capabilities).map(([id, entry]) => [id, entry === void 0 ? void 0 : { ...entry }])) }
  };
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var GATE_FILE_VERSION, MAX_GATE_FILE_BYTES, PERSISTED_CAPABILITY_IDS;
var init_capability_gates = __esm({
  "src/antigravity/capability-gates.ts"() {
    "use strict";
    init_status();
    init_safe_text();
    GATE_FILE_VERSION = 2;
    MAX_GATE_FILE_BYTES = 64 * 1024;
    PERSISTED_CAPABILITY_IDS = CAPABILITY_ROW_IDS.filter((id) => id !== "auth-llm");
  }
});

// src/antigravity/auth-service.ts
function gateSubject(record2) {
  return record2.lineage ?? "legacy-account";
}
function createAntigravityAuthService(options = {}) {
  return new AntigravityAuthService(options);
}
function maskEmail(value) {
  if (!isBoundedSafeText(value, 4096)) return void 0;
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) return void 0;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!/^[^\s@]+$/u.test(local) || !/^[^\s@]+$/u.test(domain)) return void 0;
  return `${local.slice(0, 1)}***@${domain}`;
}
var AntigravityAuthService;
var init_auth_service = __esm({
  "src/antigravity/auth-service.ts"() {
    "use strict";
    init_auth_store();
    init_credential_coordinator();
    init_oauth_flow();
    init_project_context();
    init_safe_text();
    init_status();
    init_quota();
    init_capability_gates();
    AntigravityAuthService = class {
      store;
      credentials;
      flow;
      quota;
      gates;
      autoActivate;
      riskAcknowledged = false;
      activeFlowGeneration = 0;
      disposed = false;
      statusListeners = /* @__PURE__ */ new Set();
      constructor(options = {}) {
        this.autoActivate = options.autoActivateGates ?? false;
        const storePath = options.storePath ?? defaultAuthStorePath();
        this.store = options.store ?? createAuthStore(storePath);
        this.gates = options.gates ?? (options.gatePath !== void 0 ? createFileCapabilityGates(options.gatePath) : options.store === void 0 ? createFileCapabilityGates(defaultCapabilityGatePath(storePath)) : createMemoryCapabilityGates());
        this.credentials = createCredentialCoordinator({
          ...options.credentialOptions,
          store: this.store
        });
        this.quota = createQuotaService({
          ...options.quotaOptions,
          auth: this.credentials
        });
        const projectDiscovery = createProjectDiscovery(options.projectOptions);
        this.flow = createOAuthFlow({
          ...options.flowOptions,
          validateProject: (accessToken, signal) => projectDiscovery.discover(accessToken, signal),
          commit: (token, project, signal) => this.commitCredential(token, project, signal)
        });
      }
      async status() {
        const record2 = await this.readRecord();
        const flowStatus = this.flow.status();
        const phase = flowStatus.phase === "idle" && record2 !== void 0 ? "success" : flowStatus.phase;
        const maskedEmail = maskEmail(record2?.email);
        const credentialStatus = await this.credentials.status();
        const gateEvidence = await this.gateEvidenceFor(record2);
        const login = {
          phase,
          configured: record2 !== void 0,
          projectAvailable: record2?.projectId !== void 0,
          ...flowStatus.authorizationUrl === void 0 ? {} : { authorizationUrl: flowStatus.authorizationUrl },
          ...flowStatus.expiresAt === void 0 ? {} : { expiresAt: flowStatus.expiresAt },
          ...maskedEmail === void 0 ? {} : { maskedEmail },
          ...flowStatus.errorCode === void 0 ? {} : { errorCode: flowStatus.errorCode }
        };
        return createStatusView(this.riskAcknowledged, login, credentialStatus, this.credentials.revokeStatus(), gateEvidence);
      }
      async acknowledgeRisk() {
        this.riskAcknowledged = true;
        this.notifyStatus();
        return { acknowledged: true };
      }
      /** Observe value-safe gate changes so capability rows can register without polling secrets. */
      watchStatus(listener) {
        this.statusListeners.add(listener);
        return () => {
          this.statusListeners.delete(listener);
        };
      }
      async recordGate0(outcome) {
        const subject = gateSubject(await this.requireRecord());
        await this.gates.recordGate0(subject, outcome);
        this.notifyStatus();
      }
      async recordLlmFamilyGate(family, outcome) {
        const record2 = await this.requireRecord();
        const subject = gateSubject(record2);
        await this.gates.recordLlmFamily(subject, family, outcome);
        this.notifyStatus();
      }
      async recordCapabilityGate(id, outcome) {
        const record2 = await this.requireRecord();
        const subject = gateSubject(record2);
        if (id === "auth-llm") {
          throw new OAuthFlowError("internal", "Auth/LLM availability is derived from independent family evidence");
        }
        await this.gates.recordCapability(subject, id, outcome);
        this.notifyStatus();
      }
      async capabilityGateEvidence() {
        return this.gateEvidenceFor(await this.readRecord());
      }
      async gate0Passed() {
        return (await this.capabilityGateEvidence()).gate0?.outcome === "passed";
      }
      async capabilityAvailable(id) {
        const status = await this.status();
        return status.capabilities.some((capability) => capability.id === id && capability.state === "available");
      }
      async startLogin() {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        if (!this.riskAcknowledged) {
          throw new OAuthFlowError("risk-acknowledgement-required", "Risk acknowledgement is required before login");
        }
        const started = await this.flow.start();
        this.activeFlowGeneration = this.flow.generation();
        this.notifyStatus();
        return started;
      }
      async completeCallback(callbackUrl) {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        try {
          return await this.flow.completeCallbackUrl(callbackUrl);
        } finally {
          this.notifyStatus();
        }
      }
      async cancelLogin() {
        const status = await this.flow.cancel();
        if (status.phase !== "success") this.activeFlowGeneration = 0;
        this.notifyStatus();
        return {
          phase: status.phase,
          ...status.errorCode === void 0 ? {} : { errorCode: status.errorCode }
        };
      }
      async credential(signal, options) {
        return await this.credentials.credential(signal, options);
      }
      async usage(signal, force = false) {
        return await this.quota.refresh(signal, force);
      }
      async logout() {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        this.activeFlowGeneration = 0;
        await this.flow.cancel();
        try {
          const result2 = await this.credentials.logout();
          await this.gates.clear();
          this.notifyStatus();
          return result2;
        } catch {
          throw new OAuthFlowError("persistence-failed", "The local Antigravity credential could not be cleared");
        }
      }
      async revoke(confirmed, signal) {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        const result2 = await this.credentials.revoke(confirmed, signal);
        if (result2.state === "revoked" || result2.state === "logged-out" || result2.state === "superseded") await this.gates.clear();
        this.notifyStatus();
        return result2;
      }
      async accounts() {
        const list = await this.credentials.accounts();
        return list.map((acc) => ({
          id: acc.id,
          label: acc.label,
          ...acc.email ? { email: acc.email } : {},
          tier: acc.tier || "Pro",
          active: acc.active
        }));
      }
      async selectAccount(id) {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        await this.credentials.selectAccount(id);
        this.notifyStatus();
        return await this.accounts();
      }
      async updateAccount(id, patch) {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        await this.credentials.updateAccount(id, patch);
        this.notifyStatus();
        return await this.accounts();
      }
      async renameAccount(id, label) {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        await this.credentials.renameAccount(id, label);
        this.notifyStatus();
        return await this.accounts();
      }
      async removeAccount(id) {
        if (this.disposed) throw new OAuthFlowError("internal", "The Antigravity login is unavailable");
        await this.credentials.removeAccount(id);
        this.notifyStatus();
        return await this.accounts();
      }
      async dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.activeFlowGeneration = 0;
        this.statusListeners.clear();
        await Promise.all([this.flow.dispose(), this.credentials.dispose(), this.quota.dispose()]);
      }
      async commitCredential(token, project, signal) {
        const flowGeneration = this.flow.generation();
        if (this.disposed || flowGeneration !== this.activeFlowGeneration || signal.aborted) {
          throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        }
        const current = await this.readRecord();
        if (this.disposed || flowGeneration !== this.activeFlowGeneration || signal.aborted) {
          throw new OAuthFlowError("cancelled", "The OAuth login was cancelled");
        }
        const email = project.email ?? token.email;
        const label = project.label ?? email ?? "Google Account";
        const draft = {
          refreshToken: token.refreshToken,
          projectId: project.projectId,
          ...email === void 0 ? {} : { email },
          label,
          tier: project.tier ?? "Pro"
        };
        const committed = await this.store.compareAndCommit(current?.revision ?? 0, draft, current?.lineage);
        if (committed === void 0) throw new OAuthFlowError("credential-conflict", "The login changed while it was completing");
        if (this.autoActivate) {
          const subject = committed.lineage ?? "legacy-account";
          await this.autoActivateGates(subject);
        } else {
          await this.gates.clear().catch(() => {
          });
        }
        this.credentials.replaceFromLogin({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt,
          projectId: project.projectId
        }, committed);
        this.notifyStatus();
      }
      notifyStatus() {
        for (const listener of this.statusListeners) {
          try {
            listener();
          } catch {
          }
        }
      }
      async gateEvidenceFor(record2) {
        try {
          const evidence = await this.gates.read();
          if (record2 === void 0) return {};
          const subject = gateSubject(record2);
          if (evidence.subject === subject) return evidence;
          if (this.autoActivate && record2.projectId !== void 0) {
            await this.autoActivateGates(subject);
            return await this.gates.read();
          }
          return {};
        } catch {
          return { gate0: { outcome: "protocol-drift", checkedAt: (/* @__PURE__ */ new Date()).toISOString() } };
        }
      }
      async autoActivateGates(subject) {
        try {
          await this.gates.recordGate0(subject, "passed");
          await this.gates.recordLlmFamily(subject, "gemini", "passed");
          await this.gates.recordLlmFamily(subject, "claude", "passed");
          await this.gates.recordLlmFamily(subject, "gpt-oss", "passed");
          await this.gates.recordCapability(subject, "search", "passed");
          await this.gates.recordCapability(subject, "image", "passed");
          await this.gates.recordCapability(subject, "video", "passed");
        } catch {
        }
      }
      async requireRecord() {
        const record2 = await this.readRecord();
        if (record2 === void 0) throw new OAuthFlowError("internal", "Antigravity login is required");
        return record2;
      }
      async readRecord() {
        try {
          return await this.store.read();
        } catch {
          throw new OAuthFlowError("persistence-failed", "The Antigravity auth store could not be read");
        }
      }
    };
  }
});

// src/antigravity/replay.ts
function createReplayState(model, family, finish, blocks) {
  const boundedBlocks = blocks.slice(0, MAX_BLOCKS).map((block) => {
    const signature = safeSignature(block.signature);
    return { kind: block.kind, ...signature === void 0 ? {} : { signature } };
  });
  const boundedFinish = safeFinish(finish);
  return {
    response: {
      version: ANTIGRAVITY_REPLAY_VERSION,
      provider: "google-antigravity",
      model: model.slice(0, 256),
      family,
      ...boundedFinish === void 0 ? {} : { finish: boundedFinish }
    },
    blocks: boundedBlocks
  };
}
function compatibleReplayState(message, provider, model, blockKinds) {
  if (provider !== "google-antigravity" || message.role !== "assistant") return void 0;
  const provenance = isRecord7(message.source) ? message.source : void 0;
  if (provenance !== void 0 && provenance.kind === "model" && (provenance.provider !== provider || provenance.model !== model)) return void 0;
  const value = isRecord7(provenance?.replayState) ? provenance.replayState : isRecord7(message.replayState) ? message.replayState : void 0;
  if (!isRecord7(value) || !isRecord7(value.response) || !Array.isArray(value.blocks)) return void 0;
  const family = value.response.family;
  if (value.response.version !== ANTIGRAVITY_REPLAY_VERSION || value.response.provider !== provider || value.response.model !== model || !isFamily(family) || value.blocks.length > MAX_BLOCKS) return void 0;
  const blocks = [];
  for (const item of value.blocks) {
    if (!isRecord7(item) || typeof item.kind !== "string") continue;
    const kind = item.kind;
    const signature = typeof item.signature === "string" && safeSignature(item.signature) !== void 0 ? item.signature : void 0;
    blocks.push({ kind, ...signature === void 0 ? {} : { signature } });
  }
  if (blockKinds !== void 0 && (blocks.length !== blockKinds.length || blocks.some((block, index) => block.kind !== blockKinds[index]))) return void 0;
  const finish = value.response.finish === void 0 ? void 0 : safeFinish(value.response.finish);
  if (value.response.finish !== void 0 && finish === void 0) return void 0;
  return {
    response: {
      version: ANTIGRAVITY_REPLAY_VERSION,
      provider: "google-antigravity",
      model,
      family,
      ...finish === void 0 ? {} : { finish }
    },
    blocks
  };
}
function antigravityModelFamily(model) {
  const value = model.toLowerCase();
  if (value.includes("gemini")) return "gemini";
  if (value.includes("claude")) return "claude";
  if (value.includes("gpt-oss")) return "gpt-oss";
  return "unknown";
}
function sanitizeToolSchemas(tools) {
  if (tools === void 0) return [];
  return tools.slice(0, 64).map((tool) => ({
    name: boundedName(tool.name),
    description: boundedText(tool.description, 4096),
    parameters: sanitizeSchema(tool.parameters)
  }));
}
function buildFunctionDeclarations(tools) {
  return sanitizeToolSchemas(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}
function sanitizeSchema(value, depth = 0) {
  if (depth > 8 || !isRecord7(value)) return { type: "object", properties: {} };
  const type = typeof value.type === "string" && ["object", "array", "string", "number", "integer", "boolean", "null"].includes(value.type) ? value.type : "object";
  const output = { type };
  if (typeof value.description === "string") output.description = boundedText(value.description, 1024);
  if (Array.isArray(value.required)) output.required = value.required.filter((item) => typeof item === "string").slice(0, 128);
  if (Array.isArray(value.enum)) output.enum = value.enum.slice(0, 128).filter((item) => ["string", "number", "boolean", "null"].includes(typeof item));
  if (type === "object" && isRecord7(value.properties)) {
    const properties = {};
    for (const [key, item] of Object.entries(value.properties).slice(0, 128)) {
      if (!hasControl(key) && key.length > 0) properties[key.slice(0, 128)] = sanitizeSchema(item, depth + 1);
    }
    output.properties = properties;
  }
  if (type === "array") output.items = sanitizeSchema(value.items, depth + 1);
  if (Array.isArray(value.oneOf)) output.oneOf = value.oneOf.slice(0, 8).map((item) => sanitizeSchema(item, depth + 1));
  return output;
}
function safeFinish(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return void 0;
  const normalized = value.toUpperCase();
  return ["STOP", "MAX_TOKENS", "LENGTH", "TOOL_CALLS", "FUNCTION_CALL", "SAFETY", "BLOCKLIST", "ERROR"].includes(normalized) ? normalized : void 0;
}
function safeSignature(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_SIGNATURE_LENGTH) return void 0;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return void 0;
  }
  return value;
}
function boundedName(value) {
  return typeof value === "string" && value.length > 0 && !hasControl(value) ? value.slice(0, 128) : "unnamed_tool";
}
function boundedText(value, limit) {
  return typeof value === "string" && !hasControl(value) ? value.slice(0, limit) : "";
}
function hasControl(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function isFamily(value) {
  return value === "gemini" || value === "claude" || value === "gpt-oss" || value === "unknown";
}
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANTIGRAVITY_REPLAY_VERSION, MAX_SIGNATURE_LENGTH, MAX_BLOCKS;
var init_replay = __esm({
  "src/antigravity/replay.ts"() {
    "use strict";
    ANTIGRAVITY_REPLAY_VERSION = 1;
    MAX_SIGNATURE_LENGTH = 16 * 1024;
    MAX_BLOCKS = 128;
  }
});

// src/antigravity/llm-adapter.ts
import { Buffer as Buffer4 } from "node:buffer";
import {
  AgyRequestSessionStore,
  CLAUDE_DESCRIPTION_PROMPT,
  CLAUDE_TOOL_SYSTEM_INSTRUCTION,
  SKIP_THOUGHT_SIGNATURE,
  applyClaudeTransforms,
  applyGeminiTransforms,
  buildAgyAgentRequestMetadata,
  fnv1a64Signed,
  getPublicModelDefinitions,
  getResolverAliasMap,
  orderAgyRequestPayloadInPlace,
  resolveModelWithTier
} from "@cortexkit/antigravity-auth-core";
import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  ToolCallId,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  resolveRetryPolicy
} from "@deepseek-ai/dsh-llm";
function cleanModelDisplayName(name2) {
  return name2.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}
function getModelReasoningEfforts(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.includes("flash") && !lower.includes("image")) {
    return {
      efforts: [
        { id: ReasoningEffortId("low"), name: "Low" },
        { id: ReasoningEffortId("medium"), name: "Medium" },
        { id: ReasoningEffortId("high"), name: "High" }
      ],
      defaultEffort: ReasoningEffortId(lower.includes("gemini-3.8-flash") ? "medium" : "high")
    };
  }
  if (lower.includes("pro")) {
    return {
      efforts: [
        { id: ReasoningEffortId("low"), name: "Low" },
        { id: ReasoningEffortId("high"), name: "High" }
      ],
      defaultEffort: ReasoningEffortId("high")
    };
  }
  return void 0;
}
function createCatalogView(definitions, state, available, checkedAt) {
  const models = Object.values(definitions).filter((definition) => !definition.modalities.output.includes("image")).map((definition) => ({
    id: definition.id,
    name: cleanModelDisplayName(definition.name),
    state: state === "live-available" ? available?.has(definition.id) === true ? "live-available" : "unavailable" : "snapshot"
  }));
  return { state, models, ...checkedAt === void 0 ? {} : { checkedAt } };
}
function cloneCatalogView(value) {
  return {
    state: value.state,
    models: value.models.map((model) => ({ ...model })),
    ...value.checkedAt === void 0 ? {} : { checkedAt: value.checkedAt }
  };
}
function parseLiveModelIds(value, definitions) {
  const root = isRecord8(value) && isRecord8(value.response) ? value.response : value;
  if (!isRecord8(root) || !isRecord8(root.models)) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
  const entries = Object.entries(root.models);
  if (entries.length > 512) throw new LlmError("The Antigravity live model catalog exceeded the model limit", "PROTOCOL_DRIFT");
  const aliases = getResolverAliasMap();
  const live = /* @__PURE__ */ new Set();
  for (const [id, rawEntry] of entries) {
    if (!safeModelId(id) || !isRecord8(rawEntry)) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
    const cleanId = cleanModelId(id);
    live.add(canonicalWireModel(cleanId, aliases));
    live.add(cleanId);
    live.add(id);
    if (cleanId === "gemini-3-flash" || cleanId === "gemini-3-flash-agent" || cleanId === "gemini-3.7-flash-tiered" || cleanId.startsWith("gemini-3-flash") || cleanId.startsWith("gemini-3.7-flash")) {
      live.add("gemini-3.7-flash");
      live.add("gemini-3.7-flash-medium");
      live.add("gemini-3.7-flash-low");
      live.add("gemini-3.7-flash-high");
    }
    if (cleanId === "gemini-3.8-flash-tiered" || cleanId.startsWith("gemini-3.8-flash")) {
      live.add("gemini-3.8-flash");
      live.add("gemini-3.8-flash-medium");
      live.add("gemini-3.8-flash-low");
      live.add("gemini-3.8-flash-high");
    }
    if (rawEntry.modelName !== void 0 && typeof rawEntry.modelName === "string") {
      if (!safeModelId(rawEntry.modelName)) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
      const cleanName = cleanModelId(rawEntry.modelName);
      live.add(canonicalWireModel(cleanName, aliases));
      live.add(cleanName);
    }
    if (rawEntry.displayName !== void 0 && (typeof rawEntry.displayName !== "string" || rawEntry.displayName.length > 512 || containsControl(rawEntry.displayName))) {
      throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
    }
  }
  const available = /* @__PURE__ */ new Set();
  for (const definition of Object.values(definitions)) {
    const resolved = resolveModelWithTier(definition.id).actualModel;
    const cleanResolved = cleanModelId(resolved);
    const canonical = canonicalWireModel(cleanResolved, aliases);
    if (live.has(canonical) || live.has(cleanResolved) || live.has(resolved) || live.has(definition.id) || definition.id === "antigravity-gemini-3.7-flash" && (live.has("gemini-3-flash") || live.has("gemini-3-flash-agent") || live.has("gemini-3.7-flash-tiered") || live.has("gemini-3.7-flash") || live.has("gemini-3.7-flash-medium"))) {
      available.add(definition.id);
    }
  }
  return available;
}
function cleanModelId(value) {
  return value.replace(/^(?:publishers\/[^/]+\/)?models\//, "");
}
function canonicalWireModel(value, aliases) {
  return aliases[value] ?? value;
}
function safeModelId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !containsControl(value);
}
function containsControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function beginBlock(states, part) {
  const index = states.length;
  const block = part.kind === "tool-call" ? {
    index,
    kind: "tool-call",
    id: ToolCallId(part.id ?? `antigravity-call-${String(index)}`),
    ...part.name === void 0 ? {} : { name: part.name },
    text: "",
    ...part.signature === void 0 ? {} : { signature: part.signature }
  } : {
    index,
    kind: part.kind,
    id: ToolCallId(`antigravity-block-${String(index)}`),
    text: "",
    ...part.signature === void 0 ? {} : { signature: part.signature }
  };
  states.push(block);
  return block;
}
function sameBlock(state, part) {
  if (state.kind !== part.kind) return false;
  return part.kind !== "tool-call" || (part.id === void 0 || part.id === String(state.id));
}
function assembleFunctionName(current, fragment) {
  if (fragment.length === 0 || fragment.length > 256 || containsControl(fragment)) {
    throw new PrivateTransportError("protocol-drift", "The private tool-call name was invalid");
  }
  if (current === void 0 || current.length === 0) return fragment;
  if (fragment === current) return current;
  if (fragment.startsWith(current)) return fragment;
  const combined = `${current}${fragment}`;
  if (combined.length > 256) throw new PrivateTransportError("protocol-drift", "The private tool-call name exceeded the byte limit");
  return combined;
}
function endBlock(state) {
  if (state.kind === "text") return { type: "block-end", index: state.index, block: { type: "text", text: state.text } };
  if (state.kind === "reasoning") return { type: "block-end", index: state.index, block: { type: "reasoning", text: state.text } };
  let parsed;
  try {
    parsed = JSON.parse(state.text);
  } catch {
    throw new PrivateTransportError("protocol-drift", "The private tool-call arguments were incomplete JSON");
  }
  if (!isRecord8(parsed)) throw new PrivateTransportError("protocol-drift", "The private tool-call arguments were not an object");
  const args = state.text;
  if (state.name === void 0 || !/^[A-Za-z_][A-Za-z0-9_.:-]{0,255}$/u.test(state.name)) {
    throw new PrivateTransportError("protocol-drift", "The private tool-call name was missing or invalid");
  }
  return {
    type: "block-end",
    index: state.index,
    block: {
      type: "tool-call",
      id: state.id,
      name: state.name,
      arguments: args
    }
  };
}
function buildAntigravityGeneratePayload(options, credential) {
  const toolNames = /* @__PURE__ */ new Map();
  const droppedCallIds = unsignedToolCallIds(options);
  const contents = options.messages.filter((message) => message.role !== "system").map((message) => mapMessage(message, options.model, toolNames, droppedCallIds));
  return buildPayloadFromContents(options, credential, contents);
}
async function buildAntigravityGeneratePayloadForAdapter(options, credential, session, timestamp, attachments) {
  const contents = [];
  const toolNames = /* @__PURE__ */ new Map();
  const droppedCallIds = unsignedToolCallIds(options);
  for (const message of options.messages) {
    if (message.role === "system") continue;
    contents.push(await mapMessageWithAttachments(message, options.model, toolNames, attachments, options.signal, droppedCallIds));
  }
  const payload = buildPayloadFromContents(options, credential, contents);
  const metadata = buildAgyAgentRequestMetadata(session, payload.request, resolveWireModel(options.model, options.reasoningEffort), timestamp);
  const request2 = payload.request;
  request2.labels = metadata.labels;
  request2.sessionId = metadata.sessionId;
  orderAgyRequestPayloadInPlace(request2);
  return {
    ...payload.project === void 0 ? {} : { project: payload.project },
    requestId: metadata.requestId,
    request: request2,
    model: payload.model,
    userAgent: "antigravity",
    requestType: "agent"
  };
}
function groupClaudeFunctionResponses(contents, model) {
  if (antigravityModelFamily(model) !== "claude") return contents;
  const grouped = [];
  let pendingResponses = [];
  const flushResponses = () => {
    if (pendingResponses.length === 0) return;
    grouped.push({ role: "user", parts: pendingResponses });
    pendingResponses = [];
  };
  for (const content of contents) {
    const rawParts = Array.isArray(content.parts) ? content.parts : [];
    const responseParts = rawParts.filter((part) => isRecord8(part) && isRecord8(part.functionResponse));
    const responseOnly = content.role === "user" && rawParts.length > 0 && responseParts.length === rawParts.length;
    if (responseOnly) {
      pendingResponses.push(...responseParts);
      continue;
    }
    flushResponses();
    grouped.push(content);
  }
  flushResponses();
  return grouped;
}
function buildPayloadFromContents(options, credential, contents) {
  const wireModel = resolveWireModel(options.model, options.reasoningEffort);
  const usesCapturedGemini38ThinkingBudget = /^gemini-3\.8-flash-(?:low|medium|high)$/u.test(wireModel);
  const requestContents = groupClaudeFunctionResponses(contents, options.model);
  const request2 = { contents: requestContents };
  const systemParts = [
    ...options.system?.trim() ? [{ text: options.system }] : [],
    ...options.messages.flatMap((message) => message.role === "system" ? message.content.flatMap((block) => block.type === "text" && block.text.trim() ? [{ text: block.text }] : []) : [])
  ];
  if (systemParts.length > 0) request2.systemInstruction = { parts: systemParts };
  const generationConfig = {};
  if (options.maxTokens !== void 0) generationConfig.maxOutputTokens = boundedInteger(options.maxTokens, 1, 1e6, "maxTokens");
  else if (usesCapturedGemini38ThinkingBudget) generationConfig.maxOutputTokens = 65536;
  if (options.temperature !== void 0) generationConfig.temperature = boundedNumber(options.temperature, -100, 100, "temperature");
  if (options.stop !== void 0) generationConfig.stopSequences = options.stop.slice(0, 16).map((item) => item.slice(0, 256));
  if (options.reasoningEffort !== void 0) generationConfig.thinkingConfig = { thinkingLevel: String(options.reasoningEffort) };
  if (Object.keys(generationConfig).length > 0) request2.generationConfig = generationConfig;
  if (options.tools !== void 0 && options.tools.length > 0) {
    const declarations = buildFunctionDeclarations(options.tools);
    if (declarations.length > 0) request2.tools = [{ functionDeclarations: declarations }];
  }
  const resolved = resolveModelWithTier(usesCapturedGemini38ThinkingBudget ? wireModel : options.model, { cli_first: false });
  const requestedEffort = normalizeReasoningEffort(options.reasoningEffort);
  const thinkingLevel = requestedEffort ?? resolved.thinkingLevel;
  if (wireModel.toLowerCase().includes("claude")) {
    applyClaudeToolHardening(request2);
    applyClaudeTransforms(request2, {
      model: wireModel,
      ...resolved.thinkingBudget === void 0 ? {} : { tierThinkingBudget: resolved.thinkingBudget },
      ...options.reasoningEffort === void 0 && resolved.thinkingBudget === void 0 ? {} : { normalizedThinking: { includeThoughts: true, ...resolved.thinkingBudget === void 0 ? {} : { thinkingBudget: resolved.thinkingBudget } } },
      cleanJSONSchema: (value) => isRecord8(value) ? value : { type: "object", properties: {} }
    });
  } else {
    applyGeminiTransforms(request2, {
      model: wireModel,
      ...thinkingLevel === void 0 || usesCapturedGemini38ThinkingBudget ? {} : { tierThinkingLevel: thinkingLevel },
      ...resolved.thinkingBudget === void 0 ? {} : { tierThinkingBudget: resolved.thinkingBudget },
      ...options.reasoningEffort === void 0 && resolved.thinkingBudget === void 0 ? {} : { normalizedThinking: { includeThoughts: true, ...resolved.thinkingBudget === void 0 ? {} : { thinkingBudget: resolved.thinkingBudget } } }
    });
    if (usesCapturedGemini38ThinkingBudget) {
      const transformedConfig = request2.generationConfig;
      if (!isRecord8(transformedConfig) || typeof resolved.thinkingBudget !== "number") {
        throw new LlmError("The Gemini 3.8 captured thinking configuration could not be resolved", "PROTOCOL_DRIFT");
      }
      transformedConfig.thinkingConfig = { includeThoughts: true, thinkingBudget: resolved.thinkingBudget };
    }
  }
  const project = credential.projectId === "inductive-dreamer-qrkws" || !credential.projectId ? void 0 : credential.projectId;
  return { ...project === void 0 ? {} : { project }, model: wireModel, request: request2 };
}
function applyClaudeToolHardening(request2) {
  if (!Array.isArray(request2.tools) || request2.tools.length === 0) return;
  request2.tools = request2.tools.map((tool) => {
    if (!isRecord8(tool) || !Array.isArray(tool.functionDeclarations)) return tool;
    return {
      ...tool,
      functionDeclarations: tool.functionDeclarations.map((declaration) => hardenClaudeToolDeclaration(declaration))
    };
  });
  const instructionPart = { text: CLAUDE_TOOL_SYSTEM_INSTRUCTION };
  const existing = request2.systemInstruction;
  if (isRecord8(existing) && Array.isArray(existing.parts)) {
    if (existing.parts.some((part) => isRecord8(part) && typeof part.text === "string" && part.text.includes("CRITICAL TOOL USAGE INSTRUCTIONS"))) return;
    request2.systemInstruction = { ...existing, parts: [...existing.parts, instructionPart] };
  } else if (typeof existing === "string") {
    request2.systemInstruction = { role: "user", parts: [{ text: existing }, instructionPart] };
  } else {
    request2.systemInstruction = { role: "user", parts: [instructionPart] };
  }
}
function hardenClaudeToolDeclaration(value) {
  if (!isRecord8(value)) return value;
  const description = typeof value.description === "string" ? value.description : "";
  if (description.includes("STRICT PARAMETERS:")) return value;
  const schema = isRecord8(value.parameters) ? value.parameters : void 0;
  const properties = schema !== void 0 && isRecord8(schema.properties) ? schema.properties : void 0;
  if (properties === void 0 || Object.keys(properties).length === 0) return value;
  const required = new Set(Array.isArray(schema?.required) ? schema.required.filter((item) => typeof item === "string") : []);
  const parameters = Object.entries(properties).map(([name2, property]) => {
    const requiredHint = required.has(name2) ? ", REQUIRED" : "";
    return `${name2} (${claudeToolTypeHint(property)}${requiredHint})`;
  });
  return {
    ...value,
    description: description + CLAUDE_DESCRIPTION_PROMPT.replace("{params}", parameters.join(", "))
  };
}
function claudeToolTypeHint(value) {
  if (!isRecord8(value)) return "unknown";
  if (Array.isArray(value.enum)) {
    return value.enum.length <= 5 ? `string ENUM[${value.enum.map((item) => JSON.stringify(item)).join(", ")}]` : `string ENUM[${value.enum.length} options]`;
  }
  const type = typeof value.type === "string" ? value.type : "unknown";
  if (type === "array") {
    if (!isRecord8(value.items)) return "ARRAY";
    const itemType = typeof value.items.type === "string" ? value.items.type : "unknown";
    if (itemType !== "object") return `ARRAY_OF_${itemType.toUpperCase()}`;
    if (!isRecord8(value.items.properties)) return "ARRAY_OF_OBJECTS";
    const nestedRequired = new Set(Array.isArray(value.items.required) ? value.items.required.filter((item) => typeof item === "string") : []);
    const nested = Object.entries(value.items.properties).map(([name2, property]) => {
      const nestedType = isRecord8(property) && typeof property.type === "string" ? property.type : "unknown";
      return `${name2}: ${nestedType}${nestedRequired.has(name2) ? " REQUIRED" : ""}`;
    });
    return `ARRAY_OF_OBJECTS[${nested.join(", ")}]`;
  }
  if (type === "object" && isRecord8(value.properties)) {
    const nestedRequired = new Set(Array.isArray(value.required) ? value.required.filter((item) => typeof item === "string") : []);
    const nested = Object.entries(value.properties).map(([name2, property]) => {
      const nestedType = isRecord8(property) && typeof property.type === "string" ? property.type : "unknown";
      return `${name2}: ${nestedType}${nestedRequired.has(name2) ? " REQUIRED" : ""}`;
    });
    return `object{${nested.join(", ")}}`;
  }
  return type;
}
function mapMessage(message, model, toolNames, droppedCallIds) {
  const parts = [];
  const replay = compatibleReplayState(message, ANTIGRAVITY_PROVIDER, model, contentKinds(message));
  const replayBlocks = replay?.blocks ?? [];
  const isClaude = antigravityModelFamily(model) === "claude";
  let replayIndex = 0;
  let sawClaudeFunctionCall = false;
  for (const block of message.content) {
    const replayKind = block.type === "text" || block.type === "reasoning" || block.type === "tool-call" ? block.type : void 0;
    const replayBlock = replayKind === void 0 ? void 0 : replayBlocks[replayIndex++];
    const replaySignature = replayBlock !== void 0 && replayBlock.kind === replayKind ? replayBlock.signature : void 0;
    const blockSignature = block.signature ?? block.thoughtSignature ?? replaySignature;
    if (block.type === "text") {
      if (block.text.length === 0 && message.content.length > 1) continue;
      parts.push({ text: block.text, ...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature } });
    } else if (block.type === "reasoning") {
      if (isClaude && blockSignature === void 0) continue;
      parts.push({ text: block.text, thought: true, ...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature } });
    } else if (block.type === "tool-call") {
      if (droppedCallIds.has(block.id)) continue;
      const callId = rememberToolName(toolNames, block.id, block.name);
      const signature = isClaude ? sawClaudeFunctionCall ? void 0 : blockSignature ?? SKIP_THOUGHT_SIGNATURE : blockSignature;
      sawClaudeFunctionCall ||= isClaude;
      parts.push({
        functionCall: {
          ...isClaude ? { id: callId } : {},
          name: block.name,
          args: parseJsonObject(block.arguments)
        },
        ...signature === void 0 ? {} : { thoughtSignature: signature }
      });
    } else if (block.type === "tool-result") {
      if (droppedCallIds.has(requireToolCallId(block.toolCallId))) {
        parts.push({ text: UNSIGNED_TOOL_RESULT_NOTE });
        continue;
      }
      const callId = requireToolCallId(block.toolCallId);
      parts.push({
        functionResponse: {
          ...isClaude ? { id: callId } : {},
          name: requireToolName(toolNames, callId),
          response: { content: blocksToText(block.content) }
        }
      });
    } else if (block.type === "image") {
      throw new LlmError("Antigravity text requests do not accept unresolved image blocks", "UNSUPPORTED_MODALITY");
    }
  }
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts
  };
}
async function mapMessageWithAttachments(message, model, toolNames, attachments, signal, droppedCallIds) {
  if (!message.content.some((block) => block.type === "image")) return mapMessage(message, model, toolNames, droppedCallIds);
  if (attachments === void 0) throw new LlmError("Antigravity image input requires the Host AttachmentStore", "UNSUPPORTED_MODALITY");
  const replay = compatibleReplayState(message, ANTIGRAVITY_PROVIDER, model, contentKinds(message));
  const replayBlocks = replay?.blocks ?? [];
  const parts = [];
  const isClaude = antigravityModelFamily(model) === "claude";
  let replayIndex = 0;
  let sawClaudeFunctionCall = false;
  for (const block of message.content) {
    const replayKind = block.type === "text" || block.type === "reasoning" || block.type === "tool-call" ? block.type : void 0;
    const replayBlock = replayKind === void 0 ? void 0 : replayBlocks[replayIndex++];
    const replaySignature = replayBlock !== void 0 && replayBlock.kind === replayKind ? replayBlock.signature : void 0;
    const blockSignature = block.signature ?? block.thoughtSignature ?? replaySignature;
    if (block.type === "image") {
      const stored = await attachments.readImage(block.attachment, signal);
      parts.push({ inlineData: { mimeType: stored.ref.mediaType, data: Buffer4.from(stored.data).toString("base64") } });
    } else if (block.type === "text") {
      if (block.text.length === 0 && message.content.length > 1) continue;
      parts.push({ text: block.text, ...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature } });
    } else if (block.type === "reasoning") {
      if (isClaude && blockSignature === void 0) continue;
      parts.push({ text: block.text, thought: true, ...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature } });
    } else if (block.type === "tool-call") {
      if (droppedCallIds.has(block.id)) continue;
      const callId = rememberToolName(toolNames, block.id, block.name);
      const signature = isClaude ? sawClaudeFunctionCall ? void 0 : blockSignature ?? SKIP_THOUGHT_SIGNATURE : blockSignature;
      sawClaudeFunctionCall ||= isClaude;
      parts.push({
        functionCall: {
          ...isClaude ? { id: callId } : {},
          name: block.name,
          args: parseJsonObject(block.arguments)
        },
        ...signature === void 0 ? {} : { thoughtSignature: signature }
      });
    } else if (block.type === "tool-result") {
      if (droppedCallIds.has(requireToolCallId(block.toolCallId))) {
        parts.push({ text: UNSIGNED_TOOL_RESULT_NOTE });
        continue;
      }
      const callId = requireToolCallId(block.toolCallId);
      parts.push({
        functionResponse: {
          ...isClaude ? { id: callId } : {},
          name: requireToolName(toolNames, callId),
          response: { content: blocksToText(block.content) }
        }
      });
    }
  }
  return { role: message.role === "assistant" ? "model" : "user", parts };
}
function rememberToolName(toolNames, callId, name2) {
  if (name2.length === 0 || name2.length > 256 || containsControl(name2)) throw new LlmError("The tool call name is invalid", "INVALID_ARGS");
  const id = requireToolCallId(callId);
  const existing = toolNames.get(id);
  if (existing !== void 0 && existing !== name2) throw new LlmError("A tool call id was reused with a different name", "INVALID_ARGS");
  toolNames.set(id, name2);
  return id;
}
function requireToolName(toolNames, callId) {
  const name2 = toolNames.get(requireToolCallId(callId));
  if (name2 === void 0) throw new LlmError("A tool result did not match a prior tool call", "INVALID_ARGS");
  return name2;
}
function requireToolCallId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || containsControl(value)) {
    throw new LlmError("The tool call id is invalid", "INVALID_ARGS");
  }
  return value;
}
function normalizeReasoningEffort(value) {
  if (value === void 0) return void 0;
  const normalized = String(value).toLowerCase();
  return ["minimal", "low", "medium", "high"].includes(normalized) ? normalized : void 0;
}
function resolveWireModel(model, reasoningEffort) {
  if (model === "antigravity-gemini-3.7-flash" || model === "gemini-3.7-flash") {
    return "gemini-3-flash";
  }
  const effort = normalizeReasoningEffort(reasoningEffort);
  const routeModel = effort !== void 0 && (model === "antigravity-gemini-3.8-flash" || model === "gemini-3.8-flash") ? `${model}-${effort}` : model;
  const resolved = resolveModelWithTier(routeModel, { cli_first: false });
  if (resolved.actualModel.startsWith("gemini-3.7-flash")) {
    return "gemini-3-flash";
  }
  return resolved.actualModel;
}
function requestSessionKey(options) {
  return options.sessionId === void 0 ? "default" : `session:${fnv1a64Signed(String(options.sessionId))}`;
}
function contentKinds(message) {
  return message.content.flatMap((block) => block.type === "text" || block.type === "reasoning" || block.type === "tool-call" ? [block.type] : []);
}
function unsignedToolCallIds(options) {
  const dropped = /* @__PURE__ */ new Set();
  if (antigravityModelFamily(options.model) === "claude") return dropped;
  const lastAssistant = options.messages.filter((message) => message.role === "assistant").at(-1);
  if (lastAssistant === void 0) return dropped;
  const replay = compatibleReplayState(lastAssistant, ANTIGRAVITY_PROVIDER, options.model, contentKinds(lastAssistant));
  if (replay === void 0) return dropped;
  const replayBlocks = replay.blocks;
  let replayIndex = 0;
  for (const block of lastAssistant.content) {
    if (block.type !== "text" && block.type !== "reasoning" && block.type !== "tool-call") continue;
    const replayBlock = replayBlocks[replayIndex++];
    if (block.type !== "tool-call") continue;
    const blockSignature = block.signature ?? block.thoughtSignature;
    const replaySignature = replayBlock !== void 0 && replayBlock.kind === "tool-call" ? replayBlock.signature : void 0;
    if (blockSignature === void 0 && replaySignature === void 0) dropped.add(block.id);
  }
  return dropped;
}
function parseProviderEvent(data) {
  const normalized = data.trim().replace(/^\)\]\}'(?:\r?\n)?/u, "");
  let value;
  try {
    value = JSON.parse(normalized);
  } catch {
    throw new PrivateTransportError("invalid-response", "The private response contained invalid JSON");
  }
  if (!isRecord8(value)) throw new PrivateTransportError("protocol-drift", "The private response event was not an object");
  if (isRecord8(value.error)) return { parts: [], error: errorDetails(value.error) };
  const root = isRecord8(value.response) ? value.response : value;
  if (isRecord8(root.error)) return { parts: [], error: errorDetails(root.error) };
  const partsValue = findParts(root);
  const parts = [];
  for (const part of partsValue) {
    const parsed = parsePart(part);
    if (parsed !== void 0) parts.push(parsed);
  }
  const usage = parseUsage(root.usageMetadata ?? value.usageMetadata);
  const finish = findFinish(root);
  return {
    parts,
    ...usage === void 0 ? {} : { usage },
    ...finish === void 0 ? {} : { finish }
  };
}
function findParts(value) {
  if (Array.isArray(value.parts)) return boundedParts(value.parts);
  if (isRecord8(value.content) && Array.isArray(value.content.parts)) return boundedParts(value.content.parts);
  if (isRecord8(value.modelTurn) && Array.isArray(value.modelTurn.parts)) return boundedParts(value.modelTurn.parts);
  if (Array.isArray(value.candidates)) {
    const output = [];
    for (const candidate of value.candidates) {
      if (!isRecord8(candidate)) continue;
      const content = isRecord8(candidate.content) ? candidate.content : candidate;
      if (Array.isArray(content.parts)) {
        if (output.length + content.parts.length > MAX_PROVIDER_PARTS) throw new PrivateTransportError("protocol-drift", "The private response contained too many parts");
        output.push(...content.parts);
      }
    }
    return output;
  }
  if (isRecord8(value.serverContent) && isRecord8(value.serverContent.modelTurn) && Array.isArray(value.serverContent.modelTurn.parts)) {
    return boundedParts(value.serverContent.modelTurn.parts);
  }
  return [];
}
function boundedParts(value) {
  if (value.length > MAX_PROVIDER_PARTS) throw new PrivateTransportError("protocol-drift", "The private response contained too many parts");
  return value;
}
function parsePart(value) {
  if (!isRecord8(value)) throw new PrivateTransportError("protocol-drift", "The private response part was malformed");
  const functionCall = isRecord8(value.functionCall) ? value.functionCall : isRecord8(value.function_call) ? value.function_call : void 0;
  if (functionCall !== void 0) {
    const name2 = stringValue(functionCall.name);
    const id = stringValue(functionCall.id);
    const signature = signatureOf(value) ?? signatureOf(functionCall);
    const args = typeof functionCall.args === "string" ? functionCall.args : JSON.stringify(functionCall.args ?? {});
    return {
      kind: "tool-call",
      ...name2 === void 0 ? {} : { name: name2 },
      ...id === void 0 ? {} : { id },
      arguments: args,
      ...signature === void 0 ? {} : { signature }
    };
  }
  if (typeof value.text === "string" || signatureOf(value) !== void 0) {
    const kind = value.thought === true || value.reasoning === true || value.thinking === true ? "reasoning" : "text";
    const signature = signatureOf(value);
    const text = typeof value.text === "string" ? value.text : "";
    return { kind, text, ...signature === void 0 ? {} : { signature } };
  }
  if (value.inlineData !== void 0 || value.inline_data !== void 0) {
    throw new PrivateTransportError("protocol-drift", "The text model returned unsupported media output");
  }
  throw new PrivateTransportError("protocol-drift", "The private response contained an unknown part type");
}
function errorDetails(value) {
  const status = numberValue2(value.status);
  const code = stringValue(value.code);
  const contextWindowExceeded = providerErrorReportsContextWindowExceeded(value, 0);
  return {
    ...status === void 0 ? {} : { status },
    ...code === void 0 ? {} : { code },
    ...contextWindowExceeded ? { contextWindowExceeded: true } : {}
  };
}
async function responseReportsContextWindowExceeded(response, options) {
  try {
    for await (const event of iteratePrivateSse(response, {
      ...options.signal === void 0 ? {} : { signal: options.signal },
      idleTimeoutMs: options.idleTimeoutMs,
      totalTimeoutMs: options.totalTimeoutMs,
      maxBytes: Math.min(MAX_PROVIDER_ERROR_BYTES, options.maxResponseBytes),
      maxFrameBytes: Math.min(MAX_PROVIDER_ERROR_FRAME_BYTES, options.maxFrameBytes)
    })) {
      const payload = event.data.replace(/^\)\]\}'(?:\r?\n)?/u, "");
      if (providerErrorEnvelopeReportsContextWindowExceeded(payload, 0)) return true;
    }
    return false;
  } catch (error) {
    if (error instanceof PrivateTransportError && error.code === "cancelled") throw toLlmError(error);
    if (isAborted3(options.signal)) throw new LlmError("The Antigravity request was cancelled", "CANCELLED");
    return false;
  }
}
function providerErrorReportsContextWindowExceeded(value, depth) {
  if (depth > MAX_PROVIDER_ERROR_JSON_DEPTH) return false;
  if (typeof value.message === "string") {
    if (isExactContextWindowExceededMessage(value.message)) return true;
    if (providerErrorEnvelopeReportsContextWindowExceeded(value.message, depth + 1)) return true;
  }
  return isRecord8(value.error) && providerErrorReportsContextWindowExceeded(value.error, depth + 1);
}
function providerErrorEnvelopeReportsContextWindowExceeded(value, depth) {
  if (depth > MAX_PROVIDER_ERROR_JSON_DEPTH || value.length === 0 || value.length > MAX_PROVIDER_ERROR_BYTES) return false;
  const json = value.trim();
  if (!json.startsWith("{") || !jsonDepthIsBounded(json, MAX_PROVIDER_ERROR_JSON_DEPTH)) return false;
  try {
    const parsed = JSON.parse(json);
    return isRecord8(parsed) && isRecord8(parsed.error) ? providerErrorReportsContextWindowExceeded(parsed.error, depth + 1) : false;
  } catch {
    return false;
  }
}
function isExactContextWindowExceededMessage(value) {
  const match = /^prompt is too long: ([0-9]{1,16}) tokens > ([0-9]{1,16}) maximum$/u.exec(value);
  const actual = match?.[1];
  const maximum = match?.[2];
  return actual !== void 0 && maximum !== void 0 && BigInt(actual) > BigInt(maximum);
}
function jsonDepthIsBounded(value, maxDepth) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      depth += 1;
      if (depth > maxDepth) return false;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inString && !escaped;
}
function contextWindowExceededError(status) {
  const message = "The Antigravity request exceeded the model context window";
  return status === void 0 ? new LlmError(message, CONTEXT_WINDOW_EXCEEDED_CODE) : new LlmError(message, CONTEXT_WINDOW_EXCEEDED_CODE, { status });
}
function parseUsage(value) {
  if (!isRecord8(value)) return void 0;
  const input = numberValue2(value.promptTokenCount ?? value.inputTokenCount);
  const output = numberValue2(value.candidatesTokenCount ?? value.outputTokenCount);
  const reasoning = numberValue2(value.thoughtsTokenCount ?? value.reasoningTokenCount);
  const cached = numberValue2(value.cachedContentTokenCount ?? value.cacheReadTokens);
  if (input === void 0 && output === void 0 && reasoning === void 0 && cached === void 0) return void 0;
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    ...cached === void 0 ? {} : { cacheReadTokens: cached },
    ...reasoning === void 0 ? {} : { reasoningTokens: reasoning }
  };
}
function findFinish(value) {
  const candidate = value.finishReason ?? value.finish_reason;
  if (typeof candidate === "string") return candidate;
  if (isRecord8(value.serverContent) && typeof value.serverContent.finishReason === "string") return value.serverContent.finishReason;
  if (Array.isArray(value.candidates)) {
    for (const item of value.candidates) if (isRecord8(item) && typeof item.finishReason === "string") return item.finishReason;
  }
  return void 0;
}
function signatureOf(value) {
  return stringValue(value.thoughtSignature ?? value.thought_signature ?? value.signature);
}
function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    if (isRecord8(parsed)) return parsed;
  } catch {
  }
  throw new LlmError("The Antigravity tool-call history is malformed", "PROTOCOL_DRIFT");
}
function blocksToText(blocks) {
  return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").slice(0, 64 * 1024);
}
function isAuthenticationCode(value) {
  const normalized = value?.toUpperCase();
  return normalized === "UNAUTHENTICATED" || normalized === "AUTHENTICATION" || normalized === "INVALID_GRANT" || normalized === "UNAUTHENTICATED_REQUEST";
}
function mapFinishReason(value) {
  const normalized = value?.toUpperCase();
  if (normalized === "MAX_TOKENS" || normalized === "LENGTH") return "max-tokens";
  if (normalized === "SAFETY" || normalized === "BLOCKLIST" || normalized === "ERROR") return "error";
  if (normalized === "TOOL_CALLS" || normalized === "FUNCTION_CALL") return "tool-calls";
  return "stop";
}
function finishChunk(kind, code, status, replayState) {
  const reason = kind === "aborted" ? { kind: "aborted", failure: { code, message: "The Antigravity request was cancelled" } } : kind === "error" ? { kind: "error", failure: { code, message: "The Antigravity provider request failed", ...status === void 0 ? {} : { status } } } : kind === "max-tokens" ? { kind: "max-tokens" } : kind === "tool-calls" ? { kind: "tool-calls" } : { kind: "stop" };
  return { type: "finish", reason, ...replayState === void 0 ? {} : { replayState } };
}
function canFallBackToPinnedTextSnapshot(error) {
  if (!(error instanceof LlmError)) return false;
  return error.code === "RATE_LIMIT" || error.code === "TIMEOUT" || error.code === "PROTOCOL_DRIFT" || error.code === "RESPONSE_LIMIT" || error.code === "UPSTREAM" || error.code === "NETWORK";
}
function toModelCatalogError(error, signal, fallback) {
  if (isAborted3(signal)) return new LlmError("The Antigravity live model catalog request was cancelled", "CANCELLED");
  if (error instanceof LlmError) return error;
  if (error instanceof PrivateTransportError || fallback === "provider") return toLlmError(error);
  return new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
}
function toLlmError(error) {
  if (error instanceof LlmError) return error;
  if (error instanceof PrivateTransportError) {
    const kind = classifyPrivateFailure(error);
    const code = LLM_FAILURE_CODES[kind];
    const message = kind === "rate-limited" ? "Antigravity rate limit reached (Google returned 429 Resource Exhausted); please wait for your quota window to refresh" : "The Antigravity private request failed safely";
    return error.status === void 0 ? new LlmError(message, code) : new LlmError(message, code, { status: error.status });
  }
  return new LlmError("The Antigravity provider request failed safely", "PROVIDER_ERROR");
}
function boundedTimeout3(value, fallback) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 10 * 60 * 1e3);
}
function boundedLimit(value, fallback) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), fallback);
}
function boundedInteger(value, min, max, field) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new LlmError(`The Antigravity ${field} option is invalid`, "INVALID_OPTIONS");
  return value;
}
function boundedNumber(value, min, max, field) {
  if (!Number.isFinite(value) || value < min || value > max) throw new LlmError(`The Antigravity ${field} option is invalid`, "INVALID_OPTIONS");
  return value;
}
function numberValue2(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : void 0;
}
function stringValue(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 16 * 1024 && !containsControl(value) ? value : void 0;
}
function safeProviderErrorCode(value) {
  const normalized = value?.toUpperCase();
  return normalized === "SAFETY" || normalized === "BLOCKED" || normalized === "RESOURCE_EXHAUSTED" || normalized === "INVALID_ARGUMENT" ? normalized : "UPSTREAM_ERROR";
}
function safeProviderStatus(value) {
  return value !== void 0 && Number.isInteger(value) && value >= 400 && value <= 599 ? value : void 0;
}
async function cancelResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
  }
}
function isAborted3(signal) {
  return signal !== void 0 && signal.aborted;
}
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANTIGRAVITY_PROVIDER, ANTIGRAVITY_STREAM_ENDPOINT, ANTIGRAVITY_GENERATE_ENDPOINT, ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT, ANTIGRAVITY_LLM_ROUTE, MODEL_CATALOG_TTL_MS, MAX_MODEL_CATALOG_BYTES, MAX_PROVIDER_ERROR_BYTES, MAX_PROVIDER_ERROR_FRAME_BYTES, MAX_PROVIDER_ERROR_JSON_DEPTH, MAX_PROVIDER_PARTS, UNSIGNED_TOOL_RESULT_NOTE, AntigravityAdapter, LLM_FAILURE_CODES;
var init_llm_adapter = __esm({
  "src/antigravity/llm-adapter.ts"() {
    "use strict";
    init_private_transport();
    init_replay();
    init_wire_identity();
    init_private_failure();
    ANTIGRAVITY_PROVIDER = "google-antigravity";
    ANTIGRAVITY_STREAM_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:streamGenerateContent?alt=sse`;
    ANTIGRAVITY_GENERATE_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
    ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:fetchAvailableModels`;
    ANTIGRAVITY_LLM_ROUTE = ANTIGRAVITY_PROVIDER;
    MODEL_CATALOG_TTL_MS = 3e4;
    MAX_MODEL_CATALOG_BYTES = 256 * 1024;
    MAX_PROVIDER_ERROR_BYTES = 64 * 1024;
    MAX_PROVIDER_ERROR_FRAME_BYTES = 16 * 1024;
    MAX_PROVIDER_ERROR_JSON_DEPTH = 8;
    MAX_PROVIDER_PARTS = 4096;
    UNSIGNED_TOOL_RESULT_NOTE = "A tool call ran here, but its provider-issued thinking signature is no longer available, so its result cannot be replayed. Use another tool call if you still need this information.";
    AntigravityAdapter = class extends LlmAdapter {
      constructor(adapterOptions) {
        super();
        this.adapterOptions = adapterOptions;
        this.transport = adapterOptions.transport ?? createPrivateTransport(
          adapterOptions.responseHeaderTimeoutMs === void 0 ? {} : { responseHeaderTimeoutMs: adapterOptions.responseHeaderTimeoutMs }
        );
        this.options = {
          responseHeaderTimeoutMs: boundedTimeout3(adapterOptions.responseHeaderTimeoutMs, DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS),
          idleTimeoutMs: boundedTimeout3(adapterOptions.idleTimeoutMs, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS),
          totalTimeoutMs: boundedTimeout3(adapterOptions.totalTimeoutMs, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS),
          maxResponseBytes: boundedLimit(adapterOptions.maxResponseBytes, DEFAULT_PRIVATE_RESPONSE_BYTES),
          maxFrameBytes: boundedLimit(adapterOptions.maxFrameBytes, DEFAULT_PRIVATE_FRAME_BYTES)
        };
        this.catalogView = createCatalogView(this.definitions, "snapshot");
      }
      adapterOptions;
      transport;
      sessions = new AgyRequestSessionStore("dsh-antigravity-auth");
      options;
      definitions = getPublicModelDefinitions();
      catalogProjectId;
      catalogExpiresAt = 0;
      catalogModelIds = /* @__PURE__ */ new Set();
      catalogFailureCode;
      catalogView;
      providerInfo(provider) {
        if (provider !== ANTIGRAVITY_PROVIDER) throw new LlmError("Unknown Antigravity provider route", "NO_ADAPTER");
        return { id: ANTIGRAVITY_PROVIDER, name: "Google Antigravity" };
      }
      providerRetryPolicy() {
        return resolveRetryPolicy({ mode: "normal", maxRetries: 0 }, "google-antigravity");
      }
      /** Forget account-bound availability when Gate 0 or the credential is replaced. */
      invalidateModelCatalog() {
        this.catalogProjectId = void 0;
        this.catalogExpiresAt = 0;
        this.catalogModelIds = /* @__PURE__ */ new Set();
        this.catalogFailureCode = void 0;
        this.catalogView = createCatalogView(this.definitions, "snapshot");
      }
      /** Return the pinned catalog without performing credential or network work. */
      catalogSnapshot() {
        return cloneCatalogView(createCatalogView(this.definitions, "snapshot"));
      }
      /** Refresh the advisory catalog and collapse failures into browser-safe state. */
      async modelCatalog(signal, forceRefresh = false) {
        try {
          const available = await this.readLiveModelIds(signal, forceRefresh);
          this.catalogView = createCatalogView(this.definitions, "live-available", available, (/* @__PURE__ */ new Date()).toISOString());
        } catch (error) {
          const state = error instanceof LlmError && error.code === "PROTOCOL_DRIFT" ? "protocol-drift" : "refresh-failed";
          this.catalogView = createCatalogView(this.definitions, state, void 0, (/* @__PURE__ */ new Date()).toISOString());
        }
        return cloneCatalogView(this.catalogView);
      }
      async listModels(provider, signal) {
        this.providerInfo(provider);
        const snapshot = this.pinnedTextModelInfos();
        let available;
        try {
          available = await this.readLiveModelIds(signal);
          this.catalogView = createCatalogView(this.definitions, "live-available", available, (/* @__PURE__ */ new Date()).toISOString());
        } catch (error) {
          const state = error instanceof LlmError && error.code === "PROTOCOL_DRIFT" ? "protocol-drift" : "refresh-failed";
          this.catalogView = createCatalogView(this.definitions, state, void 0, (/* @__PURE__ */ new Date()).toISOString());
          if (!canFallBackToPinnedTextSnapshot(error)) throw error;
          return snapshot;
        }
        return snapshot.filter((model) => available.has(model.id));
      }
      pinnedTextModelInfos() {
        return Object.values(this.definitions).filter((definition) => !definition.modalities.output.includes("image")).map((definition) => ({
          provider: ANTIGRAVITY_PROVIDER,
          id: definition.id,
          name: cleanModelDisplayName(definition.name),
          inputModalities: definition.modalities.input.filter((item) => item === "text" || item === "image")
        }));
      }
      async resolveModel(provider, model, _signal) {
        this.providerInfo(provider);
        if (typeof model !== "string" || model.trim().length === 0 || model.length > 256) {
          throw new LlmError("The Antigravity model id is invalid", "INVALID_MODEL");
        }
        const definition = this.definitions[model];
        if (definition === void 0 || definition.modalities.output.includes("image")) {
          throw new LlmError("The Antigravity model is not in the audited text model snapshot", "INVALID_MODEL");
        }
        const reasoning = getModelReasoningEfforts(model);
        return {
          provider: ANTIGRAVITY_PROVIDER,
          id: definition.id,
          name: cleanModelDisplayName(definition.name),
          inputModalities: definition.modalities.input.filter((item) => item === "text" || item === "image"),
          context: { contextWindow: definition.limit.context },
          defaultMaxTokens: definition.limit.output,
          ...reasoning === void 0 ? {} : { reasoning }
        };
      }
      async *stream(options) {
        if (options.provider !== ANTIGRAVITY_PROVIDER) {
          throw new LlmError("The Antigravity adapter received an unknown provider route", "NO_ADAPTER");
        }
        const signal = options.signal;
        const requestedDefinition = this.definitions[options.model];
        if (requestedDefinition === void 0 || requestedDefinition.modalities.output.includes("image")) throw new LlmError("The Antigravity model is not in the audited text model snapshot", "INVALID_MODEL");
        if (isAborted3(signal)) {
          yield finishChunk("aborted", "CANCELLED");
          return;
        }
        const hasEmitted = { value: false };
        let replayed = false;
        for (; ; ) {
          const credential = await this.readCredential(signal, replayed);
          if (credential === void 0) {
            throw new LlmError("Antigravity login is required before model use", "AUTH");
          }
          const sessionKey = requestSessionKey(options);
          const requestScope = this.sessions.beginRequest(sessionKey);
          let payload;
          try {
            payload = await buildAntigravityGeneratePayloadForAdapter(options, credential, requestScope.session, requestScope.timestamp, this.adapterOptions.attachments);
          } catch (error) {
            if (error instanceof LlmError) throw error;
            throw new LlmError("The Antigravity image input could not be admitted safely", "UNSUPPORTED_MODALITY");
          }
          let response;
          try {
            response = await this.transport.request({
              url: ANTIGRAVITY_STREAM_ENDPOINT,
              accessToken: credential.accessToken,
              body: JSON.stringify(payload),
              ...signal === void 0 ? {} : { signal },
              responseHeaderTimeoutMs: this.options.responseHeaderTimeoutMs
            });
          } catch (error) {
            throw toLlmError(error);
          }
          const statusError = privateStatusError(response.status);
          if (statusError !== void 0) {
            if (statusError.code === "authentication" && !replayed && !hasEmitted.value && !isAborted3(signal)) {
              await cancelResponse(response);
              replayed = true;
              continue;
            }
            if (response.status === 400 && await responseReportsContextWindowExceeded(response, {
              ...signal === void 0 ? {} : { signal },
              idleTimeoutMs: this.options.idleTimeoutMs,
              totalTimeoutMs: this.options.totalTimeoutMs,
              maxResponseBytes: this.options.maxResponseBytes,
              maxFrameBytes: this.options.maxFrameBytes
            })) {
              throw contextWindowExceededError(response.status);
            }
            await cancelResponse(response);
            throw toLlmError(statusError);
          }
          try {
            yield* this.streamResponse(response, options, hasEmitted);
            this.sessions.completeExecution(sessionKey);
            return;
          } catch (error) {
            const privateError = error instanceof PrivateTransportError ? error : void 0;
            if (privateError?.code === "authentication" && !replayed && !hasEmitted.value && !isAborted3(signal)) {
              replayed = true;
              continue;
            }
            throw toLlmError(error);
          }
        }
      }
      async *streamResponse(response, options, hasEmitted) {
        const states = [];
        let current;
        let usage;
        let finish;
        let eventError;
        for await (const sse of iteratePrivateSse(response, {
          ...options.signal === void 0 ? {} : { signal: options.signal },
          idleTimeoutMs: this.options.idleTimeoutMs,
          totalTimeoutMs: this.options.totalTimeoutMs,
          maxBytes: this.options.maxResponseBytes,
          maxFrameBytes: this.options.maxFrameBytes
        })) {
          if (sse.data.trim() === "[DONE]") continue;
          const event = parseProviderEvent(sse.data);
          if (event.error !== void 0) {
            eventError = event.error;
            if (event.error.status === 401 || isAuthenticationCode(event.error.code)) throw new PrivateTransportError("authentication", "The private endpoint requires authentication", { status: event.error.status ?? 401 });
            break;
          }
          if (event.usage !== void 0) usage = event.usage;
          if (event.finish !== void 0) finish = event.finish;
          for (const part of event.parts) {
            if (current === void 0 || !sameBlock(current, part)) {
              if (current !== void 0) {
                yield endBlock(current);
              }
              current = beginBlock(states, part);
              yield { type: "block-start", index: current.index, blockType: current.kind };
            }
            if (part.kind === "tool-call") {
              if (part.name !== void 0) current.name = assembleFunctionName(current.name, part.name);
              current.text += part.arguments;
              hasEmitted.value ||= part.arguments.length > 0 || part.name !== void 0;
              yield {
                type: "tool-call-delta",
                index: current.index,
                id: current.id,
                ...part.name === void 0 ? {} : { name: part.name },
                argumentsDelta: part.arguments
              };
              if (part.signature !== void 0) current.signature = part.signature;
            } else if (part.kind === "reasoning") {
              current.text += part.text;
              hasEmitted.value ||= part.text.length > 0;
              if (part.text.length > 0) yield { type: "reasoning-delta", index: current.index, text: part.text };
            } else {
              current.text += part.text;
              hasEmitted.value ||= part.text.length > 0;
              if (part.text.length > 0) yield { type: "text-delta", index: current.index, text: part.text };
            }
          }
        }
        if (current !== void 0) yield endBlock(current);
        if (usage !== void 0) yield { type: "usage", usage };
        if (eventError !== void 0) {
          yield finishChunk(
            "error",
            eventError.contextWindowExceeded === true ? CONTEXT_WINDOW_EXCEEDED_CODE : safeProviderErrorCode(eventError.code),
            safeProviderStatus(eventError.status)
          );
          return;
        }
        if (isAborted3(options.signal)) {
          yield finishChunk("aborted", "CANCELLED");
          return;
        }
        if (states.length === 0) {
          yield finishChunk("error", "EMPTY_RESPONSE");
          return;
        }
        const replayBlocks = states.map((state) => ({
          kind: state.kind,
          ...state.signature === void 0 ? {} : { signature: state.signature }
        }));
        const replayState = createReplayState(options.model, antigravityModelFamily(options.model), finish, replayBlocks);
        yield finishChunk(mapFinishReason(finish), finish ?? "STOP", void 0, replayState);
      }
      async readLiveModelIds(signal, bypassCache = false, forceCredentialRefresh = false) {
        const credential = await this.readCredential(signal, forceCredentialRefresh);
        if (credential === void 0) throw new LlmError("Antigravity login is required before model discovery", "AUTH");
        if (!bypassCache && this.catalogProjectId === credential.projectId && Date.now() < this.catalogExpiresAt) {
          if (this.catalogFailureCode !== void 0) throw new LlmError("The Antigravity live model catalog refresh remains unavailable", this.catalogFailureCode);
          return this.catalogModelIds;
        }
        let response;
        const body = credential.projectId ? { project: credential.projectId } : {};
        try {
          response = await this.transport.request({
            url: ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT,
            accessToken: credential.accessToken,
            body: JSON.stringify(body),
            ...signal === void 0 ? {} : { signal },
            responseHeaderTimeoutMs: this.options.responseHeaderTimeoutMs
          });
        } catch (error) {
          const failure = toModelCatalogError(error, signal, "provider");
          this.rememberCatalogFailure(credential.projectId, failure);
          throw failure;
        }
        if (response.status === 403 && credential.projectId) {
          try {
            const retryResponse = await this.transport.request({
              url: ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT,
              accessToken: credential.accessToken,
              body: JSON.stringify({}),
              ...signal === void 0 ? {} : { signal },
              responseHeaderTimeoutMs: this.options.responseHeaderTimeoutMs
            });
            if (retryResponse.ok) {
              await cancelResponse(response);
              response = retryResponse;
            } else {
              await cancelResponse(retryResponse);
            }
          } catch (error) {
            const failure = toModelCatalogError(error, signal, "provider");
            if (failure.code === "CANCELLED" || failure.code === "GATE_0_ATTRIBUTION") {
              await cancelResponse(response);
              this.rememberCatalogFailure(credential.projectId, failure);
              throw failure;
            }
          }
        }
        const statusError = privateStatusError(response.status);
        if (statusError !== void 0) {
          await cancelResponse(response);
          if (statusError.code === "authentication" && !forceCredentialRefresh && !isAborted3(signal)) {
            this.catalogExpiresAt = 0;
            return this.readLiveModelIds(signal, true, true);
          }
          const failure = toLlmError(statusError);
          this.rememberCatalogFailure(credential.projectId, failure);
          throw failure;
        }
        let value;
        try {
          value = JSON.parse(await readPrivateText(response, {
            ...signal === void 0 ? {} : { signal },
            idleTimeoutMs: this.options.idleTimeoutMs,
            totalTimeoutMs: this.options.totalTimeoutMs,
            maxBytes: Math.min(this.options.maxResponseBytes, MAX_MODEL_CATALOG_BYTES)
          }));
        } catch (error) {
          const failure = toModelCatalogError(error, signal, "protocol");
          this.rememberCatalogFailure(credential.projectId, failure);
          throw failure;
        }
        let ids;
        try {
          ids = parseLiveModelIds(value, this.definitions);
        } catch (error) {
          const failure = error instanceof LlmError ? error : new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
          this.rememberCatalogFailure(credential.projectId, failure);
          throw failure;
        }
        this.catalogProjectId = credential.projectId;
        this.catalogModelIds = ids;
        this.catalogFailureCode = void 0;
        this.catalogExpiresAt = Date.now() + MODEL_CATALOG_TTL_MS;
        return ids;
      }
      rememberCatalogFailure(projectId, failure) {
        if (failure.code === "AUTH" || failure.code === "CANCELLED") return;
        this.catalogProjectId = projectId;
        this.catalogModelIds = /* @__PURE__ */ new Set();
        this.catalogFailureCode = failure.code;
        this.catalogExpiresAt = Date.now() + MODEL_CATALOG_TTL_MS;
      }
      async readCredential(signal, forceRefresh) {
        try {
          return await this.adapterOptions.auth.credential(signal, forceRefresh ? { forceRefresh: true } : void 0);
        } catch (error) {
          throw toLlmError(error);
        }
      }
    };
    LLM_FAILURE_CODES = {
      authentication: "AUTH",
      forbidden: "FORBIDDEN",
      "rate-limited": "RATE_LIMIT",
      cancelled: "CANCELLED",
      timeout: "TIMEOUT",
      "attribution-rejected": "GATE_0_ATTRIBUTION",
      "protocol-drift": "PROTOCOL_DRIFT",
      "response-limit": "RESPONSE_LIMIT",
      "request-limit": "REQUEST_LIMIT",
      upstream: "UPSTREAM",
      network: "NETWORK",
      failed: "PROVIDER_ERROR"
    };
  }
});

// src/antigravity/capability-lifecycle.ts
function registerCapabilitySet(values, register) {
  const disposers = [];
  const disposeAll = () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
      }
    }
  };
  try {
    for (const value of values) disposers.push(register(value));
  } catch (error) {
    disposeAll();
    throw error;
  }
  return disposeAll;
}
function mountCapabilityLifecycle(options) {
  let gateReady = false;
  let registration;
  let generation = 0;
  let disposed = false;
  const sync = () => {
    if (disposed) return;
    const shouldRegister = options.enabled() && gateReady;
    if (shouldRegister && registration === void 0) {
      try {
        registration = options.register();
      } catch {
        gateReady = false;
      }
    } else if (!shouldRegister && registration !== void 0) {
      const dispose = registration;
      registration = void 0;
      try {
        dispose();
      } catch {
      }
    }
  };
  const refresh = async () => {
    const currentGeneration = ++generation;
    let ready = false;
    try {
      const status = await options.auth.status();
      ready = status.login.projectAvailable && status.capabilities.some((capability) => capability.id === options.id && capability.state === "available");
    } catch {
      ready = false;
    }
    if (disposed || currentGeneration !== generation) return;
    gateReady = ready;
    sync();
  };
  const unwatch = options.auth.watchStatus?.(() => {
    void refresh();
  }) ?? (() => {
  });
  const lifecycle = options.ctx;
  lifecycle.effect?.(() => async () => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    try {
      unwatch();
    } finally {
      const dispose = registration;
      registration = void 0;
      try {
        dispose?.();
      } finally {
        try {
          await options.cleanup?.();
        } finally {
          if (options.ownsAuth) await options.auth.dispose?.();
        }
      }
    }
  }, options.label);
  sync();
  void refresh();
  return { sync, refresh };
}
var init_capability_lifecycle = __esm({
  "src/antigravity/capability-lifecycle.ts"() {
    "use strict";
  }
});

// src/antigravity/media-admission.ts
import { Buffer as Buffer5 } from "node:buffer";
import { HarnessError } from "@deepseek-ai/dsh-llm";
function imageHandle(ref) {
  return `image:${String(ref.attachmentId)}`;
}
async function admitImageBytes(options, data, source, name2 = "antigravity-image", signal) {
  throwIfAborted(signal);
  const limits = options.attachments.imageLimits;
  if (data.byteLength === 0 || data.byteLength > limits.maxImageBytes) {
    throw new MediaAdmissionError("The image exceeds the deployment byte limit", "MEDIA_IMAGE_TOO_LARGE");
  }
  const mediaType = detectImageMediaType(data);
  if (mediaType === void 0 || !limits.mediaTypes.includes(mediaType)) {
    throw new MediaAdmissionError("The image media type or magic bytes are not supported", "MEDIA_IMAGE_INVALID");
  }
  const input = {
    data,
    mediaType,
    name: safeName(name2)
  };
  try {
    await options.attachments.validateImage(input);
  } catch {
    throw new MediaAdmissionError("The image failed AttachmentStore admission", "MEDIA_IMAGE_INVALID");
  }
  return { kind: "image", input, source };
}
async function admitBase64Image(options, encoded, source = "inline", name2, signal) {
  const maxEncoded = Math.ceil(options.attachments.imageLimits.maxImageBytes / 3) * 4 + 4;
  if (encoded.length === 0 || encoded.length > maxEncoded || !isCanonicalBase64(encoded)) {
    throw new MediaAdmissionError("The encoded image is not bounded canonical base64", "MEDIA_IMAGE_INVALID");
  }
  let data;
  try {
    data = new Uint8Array(Buffer5.from(encoded, "base64"));
  } catch {
    throw new MediaAdmissionError("The encoded image could not be decoded", "MEDIA_IMAGE_INVALID");
  }
  return admitImageBytes(options, data, source, name2, signal);
}
async function admitSessionImage(options, agent, handle, signal) {
  throwIfAborted(signal);
  if (!IMAGE_HANDLE_PATTERN.test(handle)) throw new MediaAdmissionError("The image handle is invalid", "MEDIA_HANDLE_INVALID");
  const authorized = authorizedSessionImages(agent);
  const ref = authorized.get(handle);
  if (ref === void 0) throw new MediaAdmissionError("The image handle is not authorized by this session", "MEDIA_HANDLE_UNAUTHORIZED");
  try {
    const stored = await options.attachments.readImage(ref, signal);
    return { kind: "image", input: { data: stored.data, mediaType: stored.ref.mediaType, ...stored.ref.name === void 0 ? {} : { name: stored.ref.name } }, stored, source: "session" };
  } catch {
    throw new MediaAdmissionError("The authorized image could not be read", "MEDIA_IMAGE_READ_FAILED");
  }
}
async function admitWorkspaceImage(options, workspace, path, signal) {
  throwIfAborted(signal);
  if (path.length === 0 || path.length > 4096 || /^https?:\/\//iu.test(path)) {
    throw new MediaAdmissionError("The workspace image reference is invalid", "MEDIA_WORKSPACE_INVALID");
  }
  const data = await readStableWorkspaceBytes(
    options.fs,
    workspace,
    path,
    options.attachments.imageLimits.maxImageBytes,
    "image",
    signal
  );
  return admitImageBytes(options, data, "workspace", basename(path), signal);
}
async function admitWorkspaceVideo(options, workspace, path, signal) {
  throwIfAborted(signal);
  if (path.length === 0 || path.length > 4096 || /^https?:\/\//iu.test(path)) {
    throw new MediaAdmissionError("The workspace video reference is invalid", "MEDIA_VIDEO_INVALID");
  }
  const maxBytes = positive2(options.maxVideoBytes, DEFAULT_VIDEO_BYTES);
  const data = await readStableWorkspaceBytes(options.fs, workspace, path, maxBytes, "video", signal);
  if (data.byteLength === 0 || data.byteLength > maxBytes || !isMp4(data)) {
    throw new MediaAdmissionError("The workspace file is not a bounded MP4 video", "MEDIA_VIDEO_INVALID");
  }
  return { kind: "video", data, mediaType: "video/mp4" };
}
async function readStableWorkspaceBytes(fs, workspace, path, maxBytes, kind, signal) {
  const symlinkCode = kind === "image" ? "MEDIA_WORKSPACE_SYMLINK" : "MEDIA_VIDEO_SYMLINK";
  const regularCode = kind === "image" ? "MEDIA_WORKSPACE_NOT_REGULAR" : "MEDIA_VIDEO_NOT_REGULAR";
  const containmentCode = kind === "image" ? "MEDIA_WORKSPACE_CONTAINMENT" : "MEDIA_VIDEO_CONTAINMENT";
  const changedCode = kind === "image" ? "MEDIA_WORKSPACE_CHANGED" : "MEDIA_VIDEO_CHANGED";
  const initialPath = await fs.lstat(path, { cwd: workspace }, signal);
  if (initialPath?.type === "symlink") throw new MediaAdmissionError(`The workspace ${kind} is a symbolic link`, symlinkCode);
  if (initialPath === void 0 || initialPath.type !== "file") throw new MediaAdmissionError(`The workspace ${kind} is not a regular file`, regularCode);
  const root = await fs.resolve(workspace, fsResolveOptions(workspace, signal));
  const target = await fs.resolve(path, fsResolveOptions(workspace, signal));
  if (!fs.contains(root, target)) throw new MediaAdmissionError(`The workspace ${kind} is outside the active workspace`, containmentCode);
  const before = await fs.stat(target, signal);
  if (before === void 0 || before.type !== "file") throw new MediaAdmissionError(`The workspace ${kind} is not a regular file`, regularCode);
  if (before.version !== initialPath.version) throw new MediaAdmissionError(`The workspace ${kind} changed before it could be read`, changedCode);
  const data = await fs.readBytes(target, signal, maxBytes);
  const finalPath = await fs.lstat(path, { cwd: workspace }, signal);
  const finalTarget = await fs.resolve(path, fsResolveOptions(workspace, signal));
  const after = await fs.stat(target, signal);
  if (finalPath === void 0 || finalPath.type !== "file" || finalPath.version !== initialPath.version || finalTarget.targetKey !== target.targetKey || !fs.contains(root, finalTarget) || after === void 0 || after.type !== "file" || after.version !== before.version) {
    throw new MediaAdmissionError(`The workspace ${kind} changed while it was being read`, changedCode);
  }
  return data;
}
function detectImageMediaType(data) {
  if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return "image/png";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "image/webp";
  if (data.length >= 6 && (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a")) return "image/gif";
  return void 0;
}
function isMp4(data) {
  return data.length >= 12 && ascii(data, 4, 8) === "ftyp";
}
function sessionImageCatalog(agent) {
  const result2 = /* @__PURE__ */ new Map();
  const visited = /* @__PURE__ */ new WeakSet();
  let sequence = 0;
  let visitedNodes = 0;
  const visit = (value, origin, depth = 0) => {
    if (typeof value !== "object" || value === null || depth > 64 || visitedNodes >= 1e4 || visited.has(value)) return;
    visited.add(value);
    visitedNodes += 1;
    if (Array.isArray(value)) {
      for (const nested of value) visit(nested, origin, depth + 1);
      return;
    }
    if (!isRecord11(value)) return;
    const attachment = value.type === "image" ? parseImageRef(value.attachment) : void 0;
    if (attachment !== void 0) {
      const handle = imageHandle(attachment);
      if (!result2.has(handle)) result2.set(handle, { handle, attachment, origin, sequence: sequence++ });
    }
    if (value.type === "tool-result" && Array.isArray(value.content)) visit(value.content, origin, depth + 1);
  };
  for (const event of agent.session.snapshotEvents()) {
    const rawEvent = event;
    if (!isRecord11(rawEvent) || !isRecord11(rawEvent.data)) continue;
    if (rawEvent.type === "user/message") visit(rawEvent.data.content, "user");
    else if (rawEvent.type === "assistant/message" && isRecord11(rawEvent.data.message)) visit(rawEvent.data.message.content, "reference");
    else if (rawEvent.type === "tool/result" && isRecord11(rawEvent.data.message)) visit(rawEvent.data.message.content, "generated");
  }
  return [...result2.values()];
}
function authorizedSessionImages(agent) {
  return new Map(sessionImageCatalog(agent).map((entry) => [entry.handle, entry.attachment]));
}
function parseImageRef(value) {
  if (!isRecord11(value) || !isBoundedSafeText(value.attachmentId, 256) || value.mediaType !== "image/png" && value.mediaType !== "image/jpeg" && value.mediaType !== "image/webp" && value.mediaType !== "image/gif" || !isPositiveSafeInteger(value.bytes, 1024 * 1024 * 1024) || !isPositiveSafeInteger(value.width, 1e6) || !isPositiveSafeInteger(value.height, 1e6)) return void 0;
  const name2 = typeof value.name === "string" && isBoundedSafeText(value.name, 256) ? safeName(value.name) : void 0;
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...name2 === void 0 ? {} : { name: name2 }
  };
}
function isPositiveSafeInteger(value, max) {
  return Number.isSafeInteger(value) && value > 0 && value <= max;
}
function isCanonicalBase64(value) {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}
function safeName(value) {
  const base = [...basename(value)].map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === "/" || character === "\\" ? "_" : character).join("").slice(0, 256);
  return base.length > 0 ? base : "antigravity-image";
}
function basename(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}
function fsResolveOptions(cwd, signal) {
  return signal === void 0 ? { cwd } : { cwd, signal };
}
function ascii(data, start, end) {
  return String.fromCharCode(...data.slice(start, end));
}
function positive2(value, fallback) {
  return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 128 * 1024 * 1024);
}
function throwIfAborted(signal) {
  if (signal !== void 0 && signal.aborted) throw new MediaAdmissionError("Media admission was cancelled", "MEDIA_CANCELLED");
}
function isRecord11(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var DEFAULT_VIDEO_BYTES, DEFAULT_INLINE_IMAGE_BYTES, IMAGE_HANDLE_PATTERN, MediaAdmissionError;
var init_media_admission = __esm({
  "src/antigravity/media-admission.ts"() {
    "use strict";
    init_safe_text();
    DEFAULT_VIDEO_BYTES = 32 * 1024 * 1024;
    DEFAULT_INLINE_IMAGE_BYTES = 20 * 1024 * 1024;
    IMAGE_HANDLE_PATTERN = /^image:[^\s\p{C}]{1,256}$/u;
    MediaAdmissionError = class extends HarnessError {
      constructor(message, code, options = {}) {
        super(message, code, options);
      }
    };
  }
});

// src/antigravity/live-gate-auth.ts
async function runAuthGate(auth, output) {
  await auth.acknowledgeRisk();
  const started = await auth.startLogin();
  output(JSON.stringify({ gate: "A", action: "open-authorization", authorizationUrl: started.authorizationUrl }));
  const deadline = Date.now() + AUTH_WAIT_MS;
  while (Date.now() < deadline) {
    const status = await auth.status();
    if (status.login.phase === "success") {
      const credential = await auth.credential(void 0, { forceRefresh: true });
      return { gate: "A", outcome: credential === void 0 ? "unauthenticated" : "passed" };
    }
    if (status.login.phase === "failed" || status.login.phase === "cancelled" || status.login.phase === "expired") {
      return { gate: "A", outcome: status.login.phase === "cancelled" ? "cancelled" : "failed" };
    }
    await new Promise((resolve3) => setTimeout(resolve3, POLL_MS));
  }
  await auth.cancelLogin();
  return { gate: "A", outcome: "cancelled" };
}
var AUTH_WAIT_MS, POLL_MS;
var init_live_gate_auth = __esm({
  "src/antigravity/live-gate-auth.ts"() {
    "use strict";
    AUTH_WAIT_MS = 10 * 60 * 1e3;
    POLL_MS = 250;
  }
});

// src/antigravity/image.ts
import { Buffer as Buffer6 } from "node:buffer";
import { resolveModelWithTier as resolveModelWithTier2 } from "@cortexkit/antigravity-auth-core";
import z from "@deepseek-ai/schemastery";
import { HarnessError as HarnessError2 } from "@deepseek-ai/dsh-llm";
function createAntigravityImageTools(options) {
  const fixedOptions = { ...options, transport: options.transport ?? createPrivateTransport() };
  return [createGenerateTool(fixedOptions), createListTool(fixedOptions)];
}
function createGenerateTool(options) {
  return {
    name: GENERATE_IMAGE_TOOL_NAME,
    description: "Generate or edit bounded Antigravity images and return durable session image handles.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 16384 },
        references: {
          type: "array",
          maxItems: MAX_REFERENCES,
          items: { oneOf: [
            { type: "object", properties: { kind: { const: "session" }, handle: { type: "string" } }, required: ["kind", "handle"], additionalProperties: false },
            { type: "object", properties: { kind: { const: "workspace" }, path: { type: "string" } }, required: ["kind", "path"], additionalProperties: false }
          ] }
        },
        model: { type: "string" },
        n: { type: "integer", minimum: 1, maximum: MAX_IMAGES }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    output: {
      schema: generateSchema,
      render: (_args, value) => renderGenerate(value),
      presentationMeta: (_args, value) => value
    },
    execute: async (args, exec) => executeGenerate(options, args, exec),
    isConcurrencySafe: () => false
  };
}
function createListTool(options) {
  return {
    name: LIST_IMAGES_TOOL_NAME,
    description: "List durable image handles authorized by the current session with bounded pagination.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 20 },
        cursor: { type: "string" },
        origin: { type: "string", enum: [...IMAGE_ORIGINS] }
      },
      additionalProperties: false
    },
    output: {
      schema: listSchema,
      render: (_args, value) => renderList(value),
      presentationMeta: (_args, value) => value
    },
    execute: async (args, exec) => executeList(options, args, exec),
    isConcurrencySafe: () => true
  };
}
async function executeGenerate(options, rawArgs, exec) {
  const settings = options.settings?.() ?? { enabled: true, model: ANTIGRAVITY_IMAGE_MODEL, n: 1 };
  if (!settings.enabled) throw new AntigravityImageError("Antigravity Image is disabled by its capability gate", "IMAGE_DISABLED");
  const args = parseGenerateArgs(rawArgs, settings);
  const credential = await requireCredential(options.auth, exec.signal);
  const agent = requireAgent(exec);
  const cwd = workspaceCwd(agent);
  const admission = { attachments: options.attachments, fs: options.fs };
  const references = [];
  const referenceParts = [];
  for (const [index, reference] of args.references.entries()) {
    const admitted = reference.kind === "session" ? await admitSessionImage(admission, agent, reference.handle, exec.signal) : await admitWorkspaceImage(admission, cwd, reference.path, exec.signal);
    const stored = admitted.stored ?? { ref: await options.attachments.saveImage(admitted.input), data: admitted.input.data };
    const item = { handle: imageHandle(stored.ref), attachment: stored.ref, origin: "reference", seq: index };
    references.push(item);
    referenceParts.push({ inlineData: { mimeType: stored.ref.mediaType, data: Buffer6.from(stored.data).toString("base64") } });
  }
  const transport = options.transport;
  if (transport === void 0) throw new AntigravityImageError("The Antigravity Image transport is unavailable", "IMAGE_FAILED");
  const body = buildImagePayload(args.prompt, args.model, credential, referenceParts);
  const images = [];
  const warnings = [];
  let firstFailure;
  for (let index = 0; index < args.n; index += 1) {
    let response;
    try {
      response = await transport.request({ url: ANTIGRAVITY_IMAGE_ENDPOINT, accessToken: credential.accessToken, body: JSON.stringify(body), signal: exec.signal });
    } catch (error) {
      const failure = toImageError(error);
      if (failure.code === "IMAGE_CANCELLED") throw failure;
      firstFailure ??= failure;
      warnings.push({ index, code: imageRequestWarning(failure.code) });
      continue;
    }
    const statusError = privateStatusError(response.status);
    if (statusError !== void 0) {
      await response.body?.cancel().catch(() => {
      });
      const failure = toImageError(statusError);
      firstFailure ??= failure;
      warnings.push({ index, code: imageRequestWarning(failure.code) });
      continue;
    }
    let envelope;
    try {
      envelope = JSON.parse(await readPrivateText(response, { signal: exec.signal, maxBytes: DEFAULT_PRIVATE_RESPONSE_BYTES }));
    } catch (error) {
      const failure = toImageError(error);
      if (failure.code === "IMAGE_CANCELLED") throw failure;
      firstFailure ??= failure;
      warnings.push({ index, code: "IMAGE_RESPONSE_INVALID" });
      continue;
    }
    const candidate = collectInlineData(envelope)[0];
    if (candidate === void 0) {
      firstFailure ??= new AntigravityImageError("Antigravity Image returned no admitted inlineData", "IMAGE_RESPONSE_EMPTY");
      warnings.push({ index, code: "IMAGE_RESPONSE_EMPTY" });
      continue;
    }
    try {
      const admitted = await admitBase64Image(options, candidate.data, "inline", `generated-${String(index + 1)}`, exec.signal);
      if (candidate.mediaType !== void 0 && normalizeImageMime(candidate.mediaType) !== admitted.input.mediaType) {
        throw new AntigravityImageError("The declared image MIME did not match the admitted magic bytes", "IMAGE_MIME_MISMATCH");
      }
      const attachment = await options.attachments.saveImage(admitted.input);
      images.push({ handle: imageHandle(attachment), attachment, origin: "generated", seq: index });
    } catch (error) {
      if (exec.signal?.aborted === true) throw new AntigravityImageError("Antigravity Image generation was cancelled", "IMAGE_CANCELLED");
      if (error instanceof AntigravityImageError && error.code === "MEDIA_CANCELLED") throw new AntigravityImageError("Antigravity Image generation was cancelled", "IMAGE_CANCELLED");
      const failure = error instanceof AntigravityImageError && error.code === "IMAGE_MIME_MISMATCH" ? error : new AntigravityImageError("The generated image failed media admission", "IMAGE_ADMISSION_FAILED");
      firstFailure ??= failure;
      warnings.push({ index, code: failure.code });
    }
  }
  if (images.length === 0) {
    if (firstFailure !== void 0) throw firstFailure;
    throw new AntigravityImageError("No generated image passed media admission", "IMAGE_RESPONSE_INVALID");
  }
  return { operation: references.length === 0 ? "generate" : "edit", images, references, warnings };
}
async function executeList(options, rawArgs, exec) {
  const settings = options.settings?.() ?? { enabled: true, model: ANTIGRAVITY_IMAGE_MODEL, n: 1 };
  if (!settings.enabled) throw new AntigravityImageError("Antigravity Image is disabled by its capability gate", "IMAGE_DISABLED");
  await requireCredential(options.auth, exec.signal);
  const agent = requireAgent(exec);
  const args = parseListArgs(rawArgs);
  let items = collectImages(agent);
  if (args.origin !== "all") items = items.filter((item) => item.origin === args.origin);
  if (args.cursor !== void 0) items = afterCursor(items, args.cursor, args.origin);
  const selected = items.slice(0, args.limit);
  return {
    items: selected,
    ...items.length > selected.length && selected.length > 0 ? { nextCursor: encodeCursor(selected[selected.length - 1], args.origin) } : {}
  };
}
function buildImagePayload(prompt, model, credential, referenceParts) {
  const resolved = resolveModelWithTier2(model, { cli_first: false });
  if (resolved.isImageModel !== true) throw new AntigravityImageError("The selected Antigravity model is not an image model", "INVALID_ARGS");
  const project = credential.projectId === "inductive-dreamer-qrkws" || !credential.projectId ? void 0 : credential.projectId;
  return {
    ...project === void 0 ? {} : { project },
    model: resolved.actualModel,
    request: {
      contents: [{ role: "user", parts: [{ text: prompt }, ...referenceParts] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    }
  };
}
function normalizeImageMime(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp" || normalized === "image/gif" ? normalized : void 0;
}
function collectInlineData(value) {
  const output = [];
  const visit = (item, depth = 0) => {
    if (output.length >= MAX_IMAGES || depth > 32) return;
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    if (!isRecord12(item)) return;
    const inline = isRecord12(item.inlineData) ? item.inlineData : isRecord12(item.inline_data) ? item.inline_data : void 0;
    if (inline !== void 0 && typeof inline.data === "string") {
      const mediaType = inline.mimeType ?? inline.mime_type;
      output.push({ data: inline.data, ...typeof mediaType === "string" ? { mediaType } : {} });
      return;
    }
    for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(value);
  return output;
}
function collectImages(agent) {
  return sessionImageCatalog(agent).map((entry) => ({ handle: entry.handle, attachment: entry.attachment, origin: entry.origin, seq: entry.sequence })).sort((left, right) => right.seq - left.seq || String(right.attachment.attachmentId).localeCompare(String(left.attachment.attachmentId)));
}
function renderGenerate(value) {
  return [
    { type: "text", text: `Created ${String(value.images.length)} durable image(s): ${value.images.map((item) => item.handle).join(", ")}.` },
    ...value.references.map((item) => ({ type: "image", attachment: item.attachment })),
    ...value.images.map((item) => ({ type: "image", attachment: item.attachment }))
  ];
}
function renderList(value) {
  return [
    { type: "text", text: value.items.length === 0 ? "No authorized session images matched." : value.items.map((item) => `${item.handle} (${item.origin})`).join(", ") },
    ...value.items.map((item) => ({ type: "image", attachment: item.attachment }))
  ];
}
function apply(ctx, config = { enabled: true, model: ANTIGRAVITY_IMAGE_MODEL, n: 1 }) {
  if (ctx === void 0) return;
  const candidate = ctx;
  if (candidate.tools === void 0 || candidate.attachments === void 0 || candidate.fs === void 0) return;
  let current = () => config;
  let lifecycle;
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => {
        current = source;
        lifecycle?.sync();
      },
      onChange: () => {
        lifecycle?.sync();
      }
    });
  });
  const provided = candidate.get?.("antigravityAuth");
  const auth = isAuthService(provided) ? provided : createAntigravityAuthService();
  const options = { auth, attachments: candidate.attachments, fs: candidate.fs, settings: () => current() };
  lifecycle = mountCapabilityLifecycle({
    ctx,
    auth,
    id: "image",
    enabled: () => current().enabled,
    register: () => registerCapabilitySet(
      createAntigravityImageTools(options),
      (tool) => candidate.tools.register(tool)
    ),
    ownsAuth: auth !== provided,
    label: "antigravity-image: tool lifecycle"
  });
}
async function requireCredential(auth, signal) {
  const credential = await auth.credential(signal);
  if (credential === void 0) throw new AntigravityImageError("Antigravity Image requires a logged-in account", "IMAGE_AUTH_REQUIRED");
  return credential;
}
function requireAgent(exec) {
  if (exec.agent === void 0) throw new AntigravityImageError("Antigravity Image requires an active session", "IMAGE_AGENT_REQUIRED");
  workspaceCwd(exec.agent);
  return exec.agent;
}
function workspaceCwd(agent) {
  const cwd = agent.session.header.cwd;
  if (typeof cwd !== "string" || cwd.length === 0) throw new AntigravityImageError("Antigravity Image requires an active workspace", "IMAGE_WORKSPACE_REQUIRED");
  return cwd;
}
function parseGenerateArgs(value, settings) {
  if (!isRecord12(value) || hasExtra(value, ["prompt", "references", "model", "n"]) || typeof value.prompt !== "string" || value.prompt.trim().length === 0 || value.prompt.length > 16384) {
    throw new AntigravityImageError("generate_image expects a closed prompt object", "INVALID_ARGS");
  }
  const refs = value.references === void 0 ? [] : parseReferences(value.references);
  const model = nonBlank(value.model ?? settings.model);
  const n = integer(value.n ?? settings.n, 1, MAX_IMAGES);
  return { prompt: value.prompt.trim().slice(0, 16384), references: refs, model, n };
}
function parseReferences(value) {
  if (!Array.isArray(value) || value.length > MAX_REFERENCES) throw new AntigravityImageError("references exceed the bounded limit", "INVALID_ARGS");
  return value.map((item) => {
    if (!isRecord12(item) || hasExtra(item, ["kind", "handle", "path"]) || typeof item.kind !== "string") throw new AntigravityImageError("reference is invalid", "INVALID_ARGS");
    if (item.kind === "session" && typeof item.handle === "string" && IMAGE_HANDLE_PATTERN.test(item.handle)) return { kind: "session", handle: item.handle };
    if (item.kind === "workspace" && typeof item.path === "string" && item.path.length > 0) return { kind: "workspace", path: item.path };
    throw new AntigravityImageError("reference is invalid", "INVALID_ARGS");
  });
}
function parseListArgs(value) {
  if (!isRecord12(value) || hasExtra(value, ["limit", "cursor", "origin"])) throw new AntigravityImageError("list_images expects a closed object", "INVALID_ARGS");
  const limit = value.limit === void 0 ? 5 : integer(value.limit, 1, 20);
  const cursor = value.cursor === void 0 ? void 0 : nonBlank(value.cursor);
  const origin = value.origin === void 0 ? "all" : enumValue(value.origin, IMAGE_ORIGINS);
  return { limit, ...cursor === void 0 ? {} : { cursor }, origin };
}
function afterCursor(items, cursor, origin) {
  let value;
  try {
    value = JSON.parse(Buffer6.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new AntigravityImageError("The image cursor is invalid", "IMAGE_CURSOR_INVALID");
  }
  if (!isRecord12(value) || Object.keys(value).length !== 3 || hasExtra(value, ["id", "seq", "origin"]) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 256 || !Number.isSafeInteger(value.seq) || value.origin !== origin) throw new AntigravityImageError("The image cursor is invalid", "IMAGE_CURSOR_INVALID");
  const index = items.findIndex((item) => item.seq === value.seq && String(item.attachment.attachmentId) === value.id);
  if (index < 0) throw new AntigravityImageError("The image cursor is stale", "IMAGE_CURSOR_INVALID");
  return items.slice(index + 1);
}
function encodeCursor(item, origin) {
  return Buffer6.from(JSON.stringify({ id: String(item.attachment.attachmentId), seq: item.seq, origin })).toString("base64url");
}
function isAuthService(value) {
  return isRecord12(value) && typeof value.credential === "function" && typeof value.status === "function";
}
function imageRequestWarning(code) {
  if (code === "IMAGE_AUTH_REQUIRED") return "IMAGE_REQUEST_UNAUTHENTICATED";
  if (code === "IMAGE_RATE_LIMITED") return "IMAGE_REQUEST_RATE_LIMITED";
  if (code === "IMAGE_TIMEOUT") return "IMAGE_REQUEST_TIMEOUT";
  if (code === "IMAGE_PROTOCOL_DRIFT") return "IMAGE_REQUEST_PROTOCOL_DRIFT";
  return "IMAGE_REQUEST_FAILED";
}
function toImageError(error) {
  if (error instanceof AntigravityImageError) return error;
  if (error instanceof PrivateTransportError) {
    return new AntigravityImageError("The Antigravity Image request failed safely", IMAGE_FAILURE_CODES[classifyPrivateFailure(error)]);
  }
  return new AntigravityImageError("The Antigravity Image request failed safely", "IMAGE_FAILED");
}
function hasExtra(value, allowed) {
  return Object.keys(value).some((key) => !allowed.includes(key));
}
function nonBlank(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) throw new AntigravityImageError("The image option is invalid", "INVALID_ARGS");
  return value.trim();
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new AntigravityImageError("The image option is invalid", "INVALID_ARGS");
  return value;
}
function enumValue(value, values) {
  if (typeof value !== "string" || !values.includes(value)) throw new AntigravityImageError("The image option is invalid", "INVALID_ARGS");
  return value;
}
function isRecord12(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var GENERATE_IMAGE_TOOL_NAME, LIST_IMAGES_TOOL_NAME, ANTIGRAVITY_IMAGE_ENDPOINT, ANTIGRAVITY_IMAGE_MODEL, ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE, Config, MAX_REFERENCES, MAX_IMAGES, IMAGE_ORIGINS, generateSchema, listSchema, AntigravityImageError, IMAGE_FAILURE_CODES;
var init_image = __esm({
  "src/antigravity/image.ts"() {
    "use strict";
    init_auth_service();
    init_private_transport();
    init_media_admission();
    init_wire_identity();
    init_private_failure();
    init_capability_lifecycle();
    GENERATE_IMAGE_TOOL_NAME = "generate_image";
    LIST_IMAGES_TOOL_NAME = "list_images";
    ANTIGRAVITY_IMAGE_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
    ANTIGRAVITY_IMAGE_MODEL = "antigravity-gemini-3.1-flash-image";
    ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE = "antigravity-image";
    Config = z.object({
      enabled: z.boolean().default(true),
      model: z.string().default(ANTIGRAVITY_IMAGE_MODEL),
      n: z.number().step(1).min(1).max(4).default(1)
    });
    MAX_REFERENCES = 5;
    MAX_IMAGES = 4;
    IMAGE_ORIGINS = ["all", "generated", "reference", "user"];
    generateSchema = {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["generate", "edit"] },
        images: { type: "array", items: { type: "object" } },
        references: { type: "array", items: { type: "object" } },
        warnings: { type: "array", items: { type: "object" } }
      },
      required: ["operation", "images", "references", "warnings"],
      additionalProperties: false
    };
    listSchema = {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object" } },
        nextCursor: { type: "string" }
      },
      required: ["items"],
      additionalProperties: false
    };
    AntigravityImageError = class extends HarnessError2 {
    };
    IMAGE_FAILURE_CODES = {
      authentication: "IMAGE_AUTH_REQUIRED",
      forbidden: "IMAGE_FORBIDDEN",
      "rate-limited": "IMAGE_RATE_LIMITED",
      cancelled: "IMAGE_CANCELLED",
      timeout: "IMAGE_TIMEOUT",
      "attribution-rejected": "IMAGE_PROTOCOL_DRIFT",
      "protocol-drift": "IMAGE_PROTOCOL_DRIFT",
      "response-limit": "IMAGE_PROTOCOL_DRIFT",
      "request-limit": "IMAGE_PROTOCOL_DRIFT",
      upstream: "IMAGE_FAILED",
      network: "IMAGE_FAILED",
      failed: "IMAGE_FAILED"
    };
  }
});

// src/antigravity/live-gate-attachments.ts
import { Buffer as Buffer7 } from "node:buffer";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { chmod as chmod3, link, lstat as lstat3, mkdir as mkdir3, readFile as readFile3, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { join as join3 } from "node:path";
import { inflateSync } from "node:zlib";
function createDurableLiveAttachmentStore(root, options = {}) {
  const platform = options.platform ?? process.platform;
  const imageLimits = Object.freeze({
    maxImageBytes: MAX_LIVE_IMAGE_BYTES,
    maxImagesPerMessage: 2,
    maxMessageImageBytes: MAX_LIVE_IMAGE_BYTES * 2,
    maxImagePixels: MAX_LIVE_IMAGE_PIXELS,
    maxImageDimension: MAX_LIVE_IMAGE_DIMENSION,
    mediaTypes: Object.freeze(["image/png"])
  });
  const validateImage = async (input) => {
    inspectPng(input);
  };
  const saveImage = async (input) => {
    const dimensions = inspectPng(input);
    await ensureRoot(root);
    const data = Uint8Array.from(input.data);
    const digest2 = createHash2("sha256").update(data).digest("hex");
    const target = join3(root, `${digest2}.png`);
    const temporary = join3(root, `.${digest2}.${process.pid}.${randomUUID2()}.tmp`);
    try {
      await writeFile2(temporary, data, { flag: "wx", mode: 384 });
      try {
        await link(temporary, target);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = await readBounded(target, platform);
        if (createHash2("sha256").update(existing).digest("hex") !== digest2) throw new Error("collision");
      }
      await chmod3(target, 384);
    } catch {
      throw admissionError();
    } finally {
      await rm2(temporary, { force: true }).catch(() => {
      });
    }
    return {
      attachmentId: `${ID_PREFIX}${digest2}`,
      mediaType: "image/png",
      bytes: data.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      ...input.name === void 0 ? {} : { name: safeName2(input.name) }
    };
  };
  const readImage = async (ref, signal) => {
    signal?.throwIfAborted();
    const id = String(ref.attachmentId);
    const digest2 = id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : "";
    if (!/^[a-f0-9]{64}$/u.test(digest2) || ref.mediaType !== "image/png") throw admissionError();
    let data;
    try {
      data = await readBounded(join3(root, `${digest2}.png`), platform);
    } catch {
      throw admissionError();
    }
    signal?.throwIfAborted();
    if (createHash2("sha256").update(data).digest("hex") !== digest2) throw admissionError();
    const dimensions = inspectPng({ data, mediaType: "image/png" });
    if (ref.bytes !== data.byteLength || ref.width !== dimensions.width || ref.height !== dimensions.height) throw admissionError();
    return { ref: { ...ref }, data: Uint8Array.from(data) };
  };
  return {
    imageLimits,
    validateImage,
    saveImage,
    saveImages: async (inputs) => {
      for (const input of inputs) await validateImage(input);
      const output = [];
      for (const input of inputs) output.push(await saveImage(input));
      return output;
    },
    readImage
  };
}
function inspectPng(input) {
  try {
    return decodePng(input);
  } catch {
    throw admissionError();
  }
}
function decodePng(input) {
  const data = input.data;
  if (input.mediaType !== "image/png" || data.byteLength < 57 || data.byteLength > MAX_LIVE_IMAGE_BYTES) throw new Error("invalid PNG");
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (data[index] !== PNG_SIGNATURE[index]) throw new Error("invalid PNG signature");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels = 0;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  const compressed = [];
  while (offset < data.byteLength) {
    if (offset + 12 > data.byteLength) throw new Error("truncated PNG chunk");
    const length = view.getUint32(offset);
    const typeOffset = offset + 4;
    const payloadOffset = offset + 8;
    const end = payloadOffset + length;
    if (length > MAX_LIVE_IMAGE_BYTES || end + 4 > data.byteLength) throw new Error("oversized PNG chunk");
    const type = String.fromCharCode(data[typeOffset], data[typeOffset + 1], data[typeOffset + 2], data[typeOffset + 3]);
    if (!/^[A-Za-z]{4}$/u.test(type) || view.getUint32(end) !== crc32(data.subarray(typeOffset, end))) throw new Error("invalid PNG chunk");
    const payload = data.subarray(payloadOffset, end);
    if (!sawHeader && type !== "IHDR") throw new Error("missing PNG header");
    if (type === "IHDR") {
      if (sawHeader || length !== 13) throw new Error("duplicate PNG header");
      width = view.getUint32(payloadOffset);
      height = view.getUint32(payloadOffset + 4);
      const bitDepth = data[payloadOffset + 8];
      const colorType = data[payloadOffset + 9];
      if (bitDepth !== 8 || colorType !== 2 && colorType !== 6 || data[payloadOffset + 10] !== 0 || data[payloadOffset + 11] !== 0 || data[payloadOffset + 12] !== 0) {
        throw new Error("unsupported PNG encoding");
      }
      channels = colorType === 6 ? 4 : 3;
      if (width < 1 || height < 1 || width > MAX_LIVE_IMAGE_DIMENSION || height > MAX_LIVE_IMAGE_DIMENSION || width * height > MAX_LIVE_IMAGE_PIXELS) throw new Error("invalid PNG dimensions");
      sawHeader = true;
    } else if (type === "IDAT") {
      if (!sawHeader || sawEnd || length === 0) throw new Error("invalid PNG data");
      sawData = true;
      compressed.push(payload);
    } else if (type === "IEND") {
      if (!sawData || sawEnd || length !== 0 || end + 4 !== data.byteLength) throw new Error("invalid PNG end");
      sawEnd = true;
    } else if (type[0] === type[0]?.toUpperCase() && type !== "PLTE") {
      throw new Error("unknown critical PNG chunk");
    }
    offset = end + 4;
  }
  if (!sawHeader || !sawData || !sawEnd || offset !== data.byteLength) throw new Error("incomplete PNG");
  const rowBytes = width * channels;
  const decodedBytes = (rowBytes + 1) * height;
  if (!Number.isSafeInteger(decodedBytes) || decodedBytes > MAX_DECODED_IMAGE_BYTES) throw new Error("oversized decoded PNG");
  const decoded = inflateSync(Buffer7.concat(compressed.map((part) => Buffer7.from(part))), { maxOutputLength: decodedBytes + 1 });
  if (decoded.byteLength !== decodedBytes) throw new Error("invalid decoded PNG length");
  for (let row = 0; row < height; row += 1) {
    if (decoded[row * (rowBytes + 1)] > 4) throw new Error("invalid PNG row filter");
  }
  return { width, height };
}
function crc32(data) {
  let crc = 4294967295;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
  }
  return (crc ^ 4294967295) >>> 0;
}
async function ensureRoot(root) {
  try {
    await mkdir3(root, { recursive: true, mode: 448 });
    const info = await lstat3(root);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("unsafe root");
    await chmod3(root, 448);
  } catch {
    throw admissionError();
  }
}
async function readBounded(path, platform) {
  const info = await lstat3(path);
  const unsafePosixMode = platform !== "win32" && (info.mode & 63) !== 0;
  if (info.isSymbolicLink() || !info.isFile() || info.size < 1 || info.size > MAX_LIVE_IMAGE_BYTES || unsafePosixMode) {
    throw admissionError();
  }
  const data = await readFile3(path);
  if (data.byteLength !== info.size) throw admissionError();
  return data;
}
function safeName2(value) {
  const name2 = value.replaceAll("\\", "/").split("/").at(-1)?.slice(0, 128);
  return name2 !== void 0 && isBoundedSafeText(name2, 128) ? name2 : "live-gate-output.png";
}
function admissionError() {
  return new Error("The live image output could not be admitted durably");
}
var MAX_LIVE_IMAGE_BYTES, MAX_LIVE_IMAGE_DIMENSION, MAX_LIVE_IMAGE_PIXELS, MAX_DECODED_IMAGE_BYTES, ID_PREFIX, PNG_SIGNATURE;
var init_live_gate_attachments = __esm({
  "src/antigravity/live-gate-attachments.ts"() {
    "use strict";
    init_safe_text();
    MAX_LIVE_IMAGE_BYTES = 20 * 1024 * 1024;
    MAX_LIVE_IMAGE_DIMENSION = 16384;
    MAX_LIVE_IMAGE_PIXELS = 16 * 1024 * 1024;
    MAX_DECODED_IMAGE_BYTES = 64 * 1024 * 1024;
    ID_PREFIX = "live-sha256-";
    PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

// src/antigravity/live-gate-image.ts
async function runImageGate(auth, attachmentRoot) {
  const attachments = createDurableLiveAttachmentStore(attachmentRoot);
  const events = [];
  const agent = { session: { header: { cwd: process.cwd() }, events } };
  const context = { agent, signal: new AbortController().signal };
  const tool = createAntigravityImageTools({
    auth,
    attachments,
    fs: createUnavailableFileSystem(),
    settings: () => ({ enabled: true, model: ANTIGRAVITY_IMAGE_MODEL, n: 1 })
  })[0];
  if (tool === void 0) throw new Error("The image gate tool is unavailable");
  const generated = await tool.execute({ prompt: "A single small blue circle on a plain white background.", n: 1 }, context);
  const reference = generated.images[0];
  if (reference === void 0) throw new Error("The image generation gate returned no image");
  events.push({ type: "tool/result", data: { message: { content: [{ type: "image", attachment: reference.attachment }] } } });
  const edited = await tool.execute({
    prompt: "Keep the image simple and change the blue circle to green.",
    references: [{ kind: "session", handle: reference.handle }],
    n: 1
  }, context);
  if (edited.images.length === 0 || edited.references.length !== 1) throw new Error("The image edit gate returned no admitted output");
  await auth.recordCapabilityGate("image", "passed");
  return { gate: "I", outcome: "passed" };
}
function createUnavailableFileSystem() {
  const unavailable = async () => {
    throw new Error("Workspace media is unavailable in Gate I");
  };
  return {
    resolve: unavailable,
    contains: () => false,
    readBytes: unavailable,
    lstat: unavailable,
    stat: unavailable
  };
}
var init_live_gate_image = __esm({
  "src/antigravity/live-gate-image.ts"() {
    "use strict";
    init_image();
    init_live_gate_attachments();
  }
});

// src/antigravity/live-gate-outcome.ts
async function recordGateFailure(auth, gate, outcome, family) {
  if (gate === "0L") {
    if (family === void 0) await auth.recordGate0(outcome);
    else await auth.recordLlmFamilyGate(family, outcome);
    return;
  }
  const id = CAPABILITY_BY_GATE[gate];
  if (id !== void 0) await auth.recordCapabilityGate(id, outcome);
}
function classifyGate0Outcome(error) {
  const code = errorCode(error);
  if (code === "GATE_0_ATTRIBUTION" || code.includes("ATTRIBUTION_REJECTED")) return "attribution-rejected";
  return classifyOutcome(error);
}
function classifyOutcome(error) {
  const code = errorCode(error);
  if (code === "GATE_0_ATTRIBUTION" || code.includes("ATTRIBUTION_REJECTED")) return "attribution-rejected";
  if (code.includes("AUTH") || code.includes("GRANT") || code.includes("LOGIN")) return "unauthenticated";
  if (code.includes("RATE") || code.includes("RESOURCE_EXHAUSTED")) return "rate-limited";
  if (code.includes("CANCEL") || code.includes("ABORT")) return "cancelled";
  if (code.includes("UNSUPPORTED_VIDEO") || code.includes("VIDEO_UNSUPPORTED")) return "unsupported-video";
  if (code.includes("PROTOCOL") || code.includes("MALFORMED") || code.includes("RESPONSE")) return "protocol-drift";
  return "failed";
}
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code).toUpperCase() : "";
}
var CAPABILITY_BY_GATE;
var init_live_gate_outcome = __esm({
  "src/antigravity/live-gate-outcome.ts"() {
    "use strict";
    CAPABILITY_BY_GATE = Object.freeze({
      S: "search",
      I: "image",
      V: "video"
    });
  }
});

// src/antigravity/live-gate-llm.ts
async function runLlmGate(auth, gates, family, adapter = new AntigravityAdapter({ auth })) {
  if (family === void 0) await gates.clear();
  const model = family === void 0 ? LIVE_TEXT_MODEL : LIVE_TEXT_MODEL_BY_FAMILY[family];
  try {
    const chunks = [];
    for await (const chunk of adapter.stream(minimalGenerateOptions(model))) chunks.push(chunk);
    const finish = chunks.at(-1);
    if (finish?.type !== "finish") throw new Error("The live text gate did not finish normally");
    if (finish.reason.kind === "error" || finish.reason.kind === "aborted") {
      throw Object.assign(new Error("The live text gate did not finish normally"), { code: finish.reason.failure.code });
    }
    if (!chunks.some((chunk) => chunk.type === "text-delta" || chunk.type === "reasoning-delta" || chunk.type === "block-end")) {
      throw new Error("The live text gate returned no content");
    }
  } catch (error) {
    const outcome = classifyGate0Outcome(error);
    if (family === void 0) await auth.recordGate0(outcome);
    else await auth.recordLlmFamilyGate(family, outcome);
    return { gate: "0L", outcome };
  }
  if (family === void 0) await auth.recordGate0("passed");
  else await auth.recordLlmFamilyGate(family, "passed");
  return { gate: "0L", outcome: "passed" };
}
function minimalGenerateOptions(model) {
  const message = {
    id: "antigravity-live-gate-message",
    role: "user",
    source: { kind: "user" },
    content: [{ type: "text", text: "Reply with exactly: OK" }]
  };
  return { provider: ANTIGRAVITY_PROVIDER, model, messages: [message] };
}
var LIVE_TEXT_MODEL, LIVE_TEXT_MODEL_BY_FAMILY;
var init_live_gate_llm = __esm({
  "src/antigravity/live-gate-llm.ts"() {
    "use strict";
    init_llm_adapter();
    init_live_gate_outcome();
    LIVE_TEXT_MODEL = "antigravity-gemini-3.7-flash";
    LIVE_TEXT_MODEL_BY_FAMILY = Object.freeze({
      gemini: LIVE_TEXT_MODEL,
      claude: "antigravity-claude-sonnet-4-6-thinking",
      "gpt-oss": "antigravity-gpt-oss-120b-medium"
    });
  }
});

// src/antigravity/search.ts
import { resolveModelWithTier as resolveModelWithTier3 } from "@cortexkit/antigravity-auth-core";
import z2 from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
function buildGroundedSearchPayload(query, credential, model = ANTIGRAVITY_SEARCH_MODEL) {
  return {
    project: credential.projectId,
    model: resolveModelWithTier3(model, { cli_first: false }).actualModel,
    request: {
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ googleSearch: {} }],
      systemInstruction: { parts: [{ text: "Return a concise grounded answer with only sources supplied by the provider." }] }
    }
  };
}
function apply2(ctx, config = { enabled: true, model: ANTIGRAVITY_SEARCH_MODEL, maxResults: 10 }) {
  if (ctx === void 0) return;
  const candidate = ctx;
  if (candidate.web === void 0) return;
  let current = () => config;
  let lifecycle;
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE, Config2, config, {
      setSource: (source) => {
        current = source;
        lifecycle?.sync();
      },
      onChange: () => {
        lifecycle?.sync();
      }
    });
  });
  const provided = candidate.get?.("antigravityAuth");
  const auth = isAuthService2(provided) ? provided : createAntigravityAuthService();
  lifecycle = mountCapabilityLifecycle({
    ctx,
    auth,
    id: "search",
    enabled: () => current().enabled,
    register: () => candidate.web.registerSearchProvider(new AntigravitySearchProvider({ auth, settings: () => current() })),
    ownsAuth: auth !== provided,
    label: "antigravity-search: provider lifecycle"
  });
}
function collectSearchFacts(value, content, sources, seen, maxResults) {
  if (!isRecord13(value)) return false;
  const root = isRecord13(value.response) ? value.response : value;
  const texts = [findText(root)];
  const metadataValues = [root.groundingMetadata, root.grounding_metadata, value.groundingMetadata];
  if (Array.isArray(root.candidates)) {
    if (root.candidates.length > 512) throw new WebError("Antigravity Search returned too many candidates", "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT");
    for (const candidate of root.candidates) {
      if (!isRecord13(candidate)) continue;
      texts.push(findText(candidate));
      if (isRecord13(candidate.content)) texts.push(findText(candidate.content));
      metadataValues.push(candidate.groundingMetadata, candidate.grounding_metadata);
    }
  }
  for (const text of texts) appendBounded(content, text);
  let truncated = false;
  for (const rawMetadata of metadataValues) {
    if (!isRecord13(rawMetadata)) continue;
    const chunks = rawMetadata.groundingChunks ?? rawMetadata.grounding_chunks;
    if (!Array.isArray(chunks)) continue;
    if (chunks.length > 4096) throw new WebError("Antigravity Search returned too many grounding sources", "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT");
    for (const chunk of chunks) {
      if (!isRecord13(chunk)) continue;
      const web = isRecord13(chunk.web) ? chunk.web : isRecord13(chunk.webSource) ? chunk.webSource : void 0;
      if (web === void 0 || typeof web.uri !== "string" || !isHttpUrl(web.uri)) continue;
      const url = web.uri;
      if (seen.has(url)) continue;
      if (sources.length >= maxResults) {
        truncated = true;
        break;
      }
      seen.add(url);
      const title = safeSourceText(web.title, 1024);
      const snippet = safeSourceText(web.snippet, 4096);
      sources.push({ url, ...title === void 0 ? {} : { title }, ...snippet === void 0 ? {} : { snippet } });
    }
  }
  return truncated;
}
function appendBounded(output, value) {
  if (value === void 0 || value.length === 0) return;
  const used = output.reduce((total, item) => total + item.length, 0);
  if (used < 64 * 1024) output.push(value.slice(0, 64 * 1024 - used));
}
function findText(value) {
  const parts = Array.isArray(value.parts) ? value.parts : isRecord13(value.content) && Array.isArray(value.content.parts) ? value.content.parts : [];
  const output = [];
  let length = 0;
  for (const part of parts) {
    if (!isRecord13(part) || typeof part.text !== "string" || hasControl2(part.text)) continue;
    const text = part.text.slice(0, 64 * 1024 - length);
    output.push(text);
    length += text.length;
    if (length >= 64 * 1024) break;
  }
  return output.length === 0 ? void 0 : output.join("");
}
function safeSourceText(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max && !hasControl2(value) ? value : void 0;
}
function hasControl2(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function parseJson(value) {
  const normalized = value.trim().replace(/^\)\]\}'(?:\r?\n)?/u, "");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new WebError("Antigravity Search returned malformed provider data", "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT");
  }
}
function toWebError(error) {
  if (error instanceof WebError) return error;
  if (error instanceof PrivateTransportError) {
    return new WebError("The Antigravity Search request failed safely", SEARCH_FAILURE_CODES[classifyPrivateFailure(error)]);
  }
  return new WebError("The Antigravity Search request failed safely", "ANTIGRAVITY_SEARCH_FAILED");
}
function isAuthService2(value) {
  return isRecord13(value) && typeof value.credential === "function" && typeof value.status === "function";
}
function isHttpUrl(value) {
  if (value.length === 0 || value.length > 8192 || value.trim() !== value || hasControl2(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.username.length === 0 && url.password.length === 0;
  } catch {
    return false;
  }
}
function boundedInteger2(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new WebError("Antigravity Search result limit is invalid", "ANTIGRAVITY_SEARCH_INVALID_QUERY");
  return value;
}
function isRecord13(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANTIGRAVITY_SEARCH_PROVIDER_ID, ANTIGRAVITY_SEARCH_ENDPOINT, ANTIGRAVITY_SEARCH_MODEL, ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE, Config2, AntigravitySearchProvider, SEARCH_FAILURE_CODES;
var init_search = __esm({
  "src/antigravity/search.ts"() {
    "use strict";
    init_auth_service();
    init_private_transport();
    init_wire_identity();
    init_private_failure();
    init_capability_lifecycle();
    ANTIGRAVITY_SEARCH_PROVIDER_ID = "antigravity";
    ANTIGRAVITY_SEARCH_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
    ANTIGRAVITY_SEARCH_MODEL = "antigravity-gemini-3.7-flash";
    ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE = "antigravity-search";
    Config2 = z2.object({
      enabled: z2.boolean().default(true),
      model: z2.string().default(ANTIGRAVITY_SEARCH_MODEL),
      maxResults: z2.number().step(1).min(1).max(50).default(10)
    });
    AntigravitySearchProvider = class {
      constructor(options) {
        this.options = options;
        this.enabled = options.enabled ?? (() => options.settings?.().enabled ?? true);
        this.transport = options.transport ?? createPrivateTransport();
      }
      options;
      id = ANTIGRAVITY_SEARCH_PROVIDER_ID;
      enabled;
      transport;
      available() {
        return this.enabled();
      }
      async search(request2, signal) {
        if (!this.enabled()) throw new WebError("Antigravity Web Search is disabled by its capability gate", "ANTIGRAVITY_SEARCH_DISABLED");
        if (signal?.aborted === true) throw new WebError("Antigravity Web Search was cancelled", "ANTIGRAVITY_SEARCH_CANCELLED");
        if (typeof request2.query !== "string" || request2.query.trim().length === 0 || request2.query.length > 16384) {
          throw new WebError("Antigravity Web Search requires a bounded query", "ANTIGRAVITY_SEARCH_INVALID_QUERY");
        }
        const settings = this.options.settings?.() ?? { enabled: true, model: ANTIGRAVITY_SEARCH_MODEL, maxResults: 10 };
        const configuredMax = boundedInteger2(settings.maxResults, 1, 50);
        const requestedMax = request2.maxResults === void 0 ? configuredMax : boundedInteger2(request2.maxResults, 1, 50);
        const maxResults = Math.min(configuredMax, requestedMax);
        const credential = await this.options.auth.credential(signal);
        if (credential === void 0) throw new WebError("Antigravity Web Search requires a logged-in account", "ANTIGRAVITY_SEARCH_AUTH_REQUIRED");
        const response = await this.transport.request({
          url: ANTIGRAVITY_SEARCH_ENDPOINT,
          accessToken: credential.accessToken,
          body: JSON.stringify(buildGroundedSearchPayload(request2.query.trim(), credential, settings.model)),
          ...signal === void 0 ? {} : { signal }
        }).catch((error) => {
          throw toWebError(error);
        });
        const statusError = privateStatusError(response.status);
        if (statusError !== void 0) {
          await response.body?.cancel().catch(() => {
          });
          throw toWebError(statusError);
        }
        const sources = [];
        const seen = /* @__PURE__ */ new Set();
        const content = [];
        let truncated = false;
        try {
          for await (const event of iteratePrivateSse(response, {
            ...signal === void 0 ? {} : { signal },
            idleTimeoutMs: DEFAULT_PRIVATE_IDLE_TIMEOUT_MS,
            totalTimeoutMs: DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS,
            maxBytes: this.options.maxResponseBytes ?? DEFAULT_PRIVATE_RESPONSE_BYTES,
            maxFrameBytes: DEFAULT_PRIVATE_FRAME_BYTES
          })) {
            if (event.data.trim() === "[DONE]") continue;
            const value = parseJson(event.data);
            truncated ||= collectSearchFacts(value, content, sources, seen, maxResults);
          }
        } catch (error) {
          throw toWebError(error);
        }
        if (sources.length === 0) throw new WebError("Antigravity Search returned no validated grounding sources", "ANTIGRAVITY_SEARCH_NO_SOURCES");
        return {
          ...content.length === 0 ? {} : { content: content.join("").slice(0, 64 * 1024) },
          sources,
          truncated
        };
      }
    };
    SEARCH_FAILURE_CODES = {
      authentication: "ANTIGRAVITY_SEARCH_AUTH_REQUIRED",
      forbidden: "ANTIGRAVITY_SEARCH_FORBIDDEN",
      "rate-limited": "ANTIGRAVITY_SEARCH_RATE_LIMITED",
      cancelled: "ANTIGRAVITY_SEARCH_CANCELLED",
      timeout: "ANTIGRAVITY_SEARCH_TIMEOUT",
      "attribution-rejected": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
      "protocol-drift": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
      "response-limit": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
      "request-limit": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
      upstream: "ANTIGRAVITY_SEARCH_FAILED",
      network: "ANTIGRAVITY_SEARCH_FAILED",
      failed: "ANTIGRAVITY_SEARCH_FAILED"
    };
  }
});

// src/antigravity/live-gate-search.ts
async function runSearchGate(auth) {
  const provider = new AntigravitySearchProvider({
    auth,
    settings: () => ({ enabled: true, model: ANTIGRAVITY_SEARCH_MODEL, maxResults: 3 })
  });
  const result2 = await provider.search({ query: "What is the official Google domain?", maxResults: 3 });
  if (result2.sources.length === 0) throw new Error("The grounded search gate returned no sources");
  await auth.recordCapabilityGate("search", "passed");
  return { gate: "S", outcome: "passed" };
}
var init_live_gate_search = __esm({
  "src/antigravity/live-gate-search.ts"() {
    "use strict";
    init_search();
  }
});

// src/antigravity/video.ts
import { Buffer as Buffer8 } from "node:buffer";
import { resolveModelWithTier as resolveModelWithTier4 } from "@cortexkit/antigravity-auth-core";
import z3 from "@deepseek-ai/schemastery";
import { HarnessError as HarnessError3 } from "@deepseek-ai/dsh-llm";
function createAntigravityVideoTools(options) {
  const fixedOptions = {
    ...options,
    transport: options.transport ?? createPrivateTransport({ maxRequestBytes: 48 * 1024 * 1024 })
  };
  return [{
    name: ANALYZE_VIDEO_TOOL_NAME,
    description: "Analyze an explicit MP4 file inside the active workspace with the gated Antigravity video POC.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", minLength: 1, maxLength: 4096 },
        prompt: { type: "string", minLength: 1, maxLength: 16384 },
        model: { type: "string", maxLength: 256 }
      },
      required: ["path", "prompt"],
      additionalProperties: false
    },
    output: {
      schema: videoSchema,
      render: (_args, value) => [{ type: "text", text: value.text }],
      presentationMeta: (_args, value) => value
    },
    execute: async (args, exec) => executeVideo(fixedOptions, args, exec),
    isConcurrencySafe: () => false
  }];
}
async function executeVideo(options, rawArgs, exec) {
  const settings = options.settings?.() ?? { enabled: true, model: ANTIGRAVITY_VIDEO_MODEL };
  if (!settings.enabled) throw new AntigravityVideoError("Antigravity Video is disabled by its capability gate", "VIDEO_DISABLED");
  const args = parseArgs(rawArgs, settings);
  const agent = requireAgent2(exec);
  const credential = await options.auth.credential(exec.signal);
  if (credential === void 0) throw new AntigravityVideoError("Antigravity Video requires a logged-in account", "VIDEO_AUTH_REQUIRED");
  const cwd = workspaceCwd2(agent);
  const admitted = await admitWorkspaceVideo({ fs: options.fs, ...settings.maxBytes === void 0 ? {} : { maxVideoBytes: settings.maxBytes } }, cwd, args.path, exec.signal);
  const transport = options.transport;
  if (transport === void 0) throw new AntigravityVideoError("The Antigravity Video transport is unavailable", "VIDEO_FAILED");
  let response;
  try {
    response = await transport.request({
      url: ANTIGRAVITY_VIDEO_ENDPOINT,
      accessToken: credential.accessToken,
      body: JSON.stringify(buildVideoPayload(args.prompt, args.model, credential, admitted.data)),
      signal: exec.signal
    });
  } catch (error) {
    throw toVideoError(error);
  }
  const statusError = privateStatusError(response.status);
  if (statusError !== void 0) {
    await response.body?.cancel().catch(() => {
    });
    throw toVideoError(statusError);
  }
  let value;
  try {
    value = JSON.parse(await readPrivateText(response, { signal: exec.signal, maxBytes: DEFAULT_PRIVATE_RESPONSE_BYTES }));
  } catch (error) {
    throw toVideoError(error);
  }
  const text = extractText(value);
  if (text === void 0) throw new AntigravityVideoError("Antigravity Video returned no text understanding", "VIDEO_RESPONSE_EMPTY");
  const usage = extractUsage(value);
  return { text, ...usage === void 0 ? {} : { usage } };
}
function buildVideoPayload(prompt, model, credential, data) {
  const project = credential.projectId === "inductive-dreamer-qrkws" || !credential.projectId ? void 0 : credential.projectId;
  const resolved = resolveModelWithTier4(model, { cli_first: false });
  const wireModel = resolved.actualModel.startsWith("gemini-3.7-flash") ? "gemini-3-flash" : resolved.actualModel;
  return {
    ...project === void 0 ? {} : { project },
    model: wireModel,
    request: {
      contents: [{ role: "user", parts: [
        { text: prompt },
        { inlineData: { mimeType: "video/mp4", data: Buffer8.from(data).toString("base64") } }
      ] }]
    }
  };
}
function apply3(ctx, config = { enabled: true, model: ANTIGRAVITY_VIDEO_MODEL, maxBytes: 32 * 1024 * 1024 }) {
  if (ctx === void 0) return;
  const candidate = ctx;
  if (candidate.tools === void 0 || candidate.fs === void 0) return;
  let current = () => config;
  let lifecycle;
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE, Config3, config, {
      setSource: (source) => {
        current = source;
        lifecycle?.sync();
      },
      onChange: () => {
        lifecycle?.sync();
      }
    });
  });
  const provided = candidate.get?.("antigravityAuth");
  const auth = isAuthService3(provided) ? provided : createAntigravityAuthService();
  lifecycle = mountCapabilityLifecycle({
    ctx,
    auth,
    id: "video",
    enabled: () => current().enabled,
    register: () => {
      const disposers = createAntigravityVideoTools({ auth, fs: candidate.fs, settings: () => current() }).map((tool) => candidate.tools.register(tool));
      return () => {
        for (const dispose of disposers.reverse()) dispose();
      };
    },
    ownsAuth: auth !== provided,
    label: "antigravity-video: tool lifecycle"
  });
}
function isAuthService3(value) {
  return isRecord14(value) && typeof value.credential === "function" && typeof value.status === "function";
}
function extractText(value) {
  const output = [];
  let outputLength = 0;
  const visit = (item, depth = 0) => {
    if (depth > 32 || outputLength >= 64 * 1024) return;
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    if (!isRecord14(item)) return;
    if (Array.isArray(item.parts)) {
      for (const part of item.parts) {
        if (!isRecord14(part) || typeof part.text !== "string" || hasControl3(part.text)) continue;
        const text2 = part.text.slice(0, 64 * 1024 - outputLength);
        output.push(text2);
        outputLength += text2.length;
      }
    }
    if (isRecord14(item.response)) visit(item.response, depth + 1);
    if (isRecord14(item.content)) visit(item.content, depth + 1);
    if (Array.isArray(item.candidates)) visit(item.candidates, depth + 1);
    if (isRecord14(item.serverContent)) visit(item.serverContent, depth + 1);
    if (isRecord14(item.modelTurn)) visit(item.modelTurn, depth + 1);
  };
  visit(value);
  const text = output.join("").trim();
  return text.length === 0 ? void 0 : text.slice(0, 64 * 1024);
}
function extractUsage(value) {
  const visit = (item, depth = 0) => {
    if (depth > 32) return void 0;
    if (Array.isArray(item)) {
      for (const child of item) {
        const result2 = visit(child, depth + 1);
        if (result2 !== void 0) return result2;
      }
      return void 0;
    }
    if (!isRecord14(item)) return void 0;
    const raw = isRecord14(item.usageMetadata) ? item.usageMetadata : isRecord14(item.usage_metadata) ? item.usage_metadata : isRecord14(item.usage) ? item.usage : void 0;
    if (raw !== void 0) {
      const input = safeCount(raw.promptTokenCount ?? raw.inputTokenCount);
      const output = safeCount(raw.candidatesTokenCount ?? raw.outputTokenCount);
      const cached = safeCount(raw.cachedContentTokenCount ?? raw.cacheReadTokens);
      const reasoning = safeCount(raw.thoughtsTokenCount ?? raw.reasoningTokenCount);
      if (input !== void 0 || output !== void 0 || cached !== void 0 || reasoning !== void 0) {
        return { inputTokens: input ?? 0, outputTokens: output ?? 0, ...cached === void 0 ? {} : { cacheReadTokens: cached }, ...reasoning === void 0 ? {} : { reasoningTokens: reasoning } };
      }
    }
    for (const key of ["response", "candidates", "serverContent"]) {
      const result2 = visit(item[key], depth + 1);
      if (result2 !== void 0) return result2;
    }
    return void 0;
  };
  return visit(value);
}
function safeCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function parseArgs(value, settings) {
  if (!isRecord14(value) || hasExtra2(value, ["path", "prompt", "model"]) || typeof value.path !== "string" || typeof value.prompt !== "string" || value.path.length === 0 || value.path.length > 4096 || value.prompt.trim().length === 0 || value.prompt.length > 16384) {
    throw new AntigravityVideoError("analyze_video expects a closed path and prompt object", "INVALID_ARGS");
  }
  const model = value.model === void 0 ? settings.model : value.model;
  if (typeof model !== "string" || model.trim().length === 0 || model.length > 256) throw new AntigravityVideoError("The video model is invalid", "INVALID_ARGS");
  return { path: value.path, prompt: value.prompt.trim().slice(0, 16384), model: model.trim() };
}
function requireAgent2(exec) {
  if (exec.agent === void 0) throw new AntigravityVideoError("Video analysis requires an active workspace", "VIDEO_WORKSPACE_REQUIRED");
  workspaceCwd2(exec.agent);
  return exec.agent;
}
function workspaceCwd2(agent) {
  const cwd = agent.session.header.cwd;
  if (typeof cwd !== "string" || cwd.length === 0) throw new AntigravityVideoError("Video analysis requires an active workspace", "VIDEO_WORKSPACE_REQUIRED");
  return cwd;
}
function toVideoError(error) {
  if (error instanceof AntigravityVideoError) return error;
  if (error instanceof PrivateTransportError) {
    return new AntigravityVideoError("The Antigravity Video request failed safely", VIDEO_FAILURE_CODES[classifyPrivateFailure(error)]);
  }
  return new AntigravityVideoError("The Antigravity Video request failed safely", "VIDEO_FAILED");
}
function hasControl3(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function hasExtra2(value, allowed) {
  return Object.keys(value).some((key) => !allowed.includes(key));
}
function isRecord14(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var ANALYZE_VIDEO_TOOL_NAME, ANTIGRAVITY_VIDEO_ENDPOINT, ANTIGRAVITY_VIDEO_MODEL, ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE, Config3, AntigravityVideoError, VIDEO_FAILURE_CODES, videoSchema;
var init_video = __esm({
  "src/antigravity/video.ts"() {
    "use strict";
    init_auth_service();
    init_private_transport();
    init_media_admission();
    init_wire_identity();
    init_private_failure();
    init_capability_lifecycle();
    ANALYZE_VIDEO_TOOL_NAME = "analyze_video";
    ANTIGRAVITY_VIDEO_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
    ANTIGRAVITY_VIDEO_MODEL = "antigravity-gemini-3.7-flash";
    ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE = "antigravity-video";
    Config3 = z3.object({
      enabled: z3.boolean().default(true),
      model: z3.string().default(ANTIGRAVITY_VIDEO_MODEL),
      maxBytes: z3.number().step(1).min(1).max(32 * 1024 * 1024).default(32 * 1024 * 1024)
    });
    AntigravityVideoError = class extends HarnessError3 {
    };
    VIDEO_FAILURE_CODES = {
      authentication: "VIDEO_AUTH_REQUIRED",
      forbidden: "VIDEO_FORBIDDEN",
      "rate-limited": "VIDEO_RATE_LIMITED",
      cancelled: "VIDEO_CANCELLED",
      timeout: "VIDEO_TIMEOUT",
      "attribution-rejected": "VIDEO_PROTOCOL_DRIFT",
      "protocol-drift": "VIDEO_PROTOCOL_DRIFT",
      "response-limit": "VIDEO_PROTOCOL_DRIFT",
      "request-limit": "VIDEO_PROTOCOL_DRIFT",
      upstream: "VIDEO_FAILED",
      network: "VIDEO_FAILED",
      failed: "VIDEO_FAILED"
    };
    videoSchema = {
      type: "object",
      properties: {
        text: { type: "string" },
        usage: {
          type: "object",
          properties: {
            inputTokens: { type: "integer" },
            outputTokens: { type: "integer" },
            cacheReadTokens: { type: "integer" },
            reasoningTokens: { type: "integer" }
          },
          required: ["inputTokens", "outputTokens"],
          additionalProperties: false
        }
      },
      required: ["text"],
      additionalProperties: false
    };
  }
});

// src/antigravity/live-gate-video.ts
import { lstat as lstat4, readFile as readFile4, realpath, stat } from "node:fs/promises";
import { dirname as dirname3, isAbsolute, join as join4, relative, resolve } from "node:path";
async function runVideoGate(auth, options) {
  if (options.videoFile === void 0) return { gate: "V", outcome: "failed" };
  const absolute = resolve(options.videoFile);
  const workspace = dirname3(absolute);
  const path = relative(workspace, absolute);
  const agent = { session: { header: { cwd: workspace }, events: [] } };
  const context = { agent, signal: new AbortController().signal };
  const tool = createAntigravityVideoTools({
    auth,
    fs: createNodeFileSystem(workspace),
    settings: () => ({ enabled: true, model: ANTIGRAVITY_VIDEO_MODEL, maxBytes: LIVE_VIDEO_BYTES })
  })[0];
  if (tool === void 0) throw new Error("The video gate tool is unavailable");
  const result2 = await tool.execute({ path, prompt: LIVE_VIDEO_QUESTION }, context);
  if (!isDeterministicVideoAnswer(result2.text)) throw new Error("The video gate did not verify the fixture pixel fact");
  await auth.recordCapabilityGate("video", "passed");
  return { gate: "V", outcome: "passed" };
}
function isDeterministicVideoAnswer(value) {
  return typeof value === "string" && value === LIVE_VIDEO_EXPECTED_ANSWER;
}
function createNodeFileSystem(workspace) {
  const target = (path) => ({ targetKey: path, displayPath: path });
  const resolveTarget = async (path, options) => {
    const absolute = isAbsolute(path) ? path : join4(options?.cwd ?? workspace, path);
    return target(await realpath(absolute));
  };
  const version = (value) => `${String(value.dev)}:${String(value.ino)}:${String(value.size)}:${String(value.mtimeMs)}`;
  return {
    resolve: resolveTarget,
    contains: (parent, child) => {
      const childRelative = relative(String(parent.targetKey), String(child.targetKey));
      return childRelative === "" || !childRelative.startsWith("..") && !isAbsolute(childRelative);
    },
    lstat: async (path, options) => {
      const absolute = isAbsolute(path) ? path : join4(options?.cwd ?? workspace, path);
      const info = await lstat4(absolute, { bigint: true });
      return { type: info.isSymbolicLink() ? "symlink" : info.isFile() ? "file" : info.isDirectory() ? "directory" : "other", version: version(info), size: Number(info.size) };
    },
    stat: async (value) => {
      const info = await stat(String(value.targetKey), { bigint: true });
      return { type: info.isFile() ? "file" : info.isDirectory() ? "directory" : "other", version: version(info), size: Number(info.size) };
    },
    readBytes: async (value, signal, maxBytes) => {
      signal?.throwIfAborted();
      const info = await stat(String(value.targetKey));
      if (info.size > maxBytes) throw new Error("Fixture exceeds gate bound");
      const data = await readFile4(String(value.targetKey));
      signal?.throwIfAborted();
      if (data.byteLength > maxBytes) throw new Error("Fixture exceeds gate bound");
      return new Uint8Array(data);
    }
  };
}
var LIVE_VIDEO_BYTES, LIVE_VIDEO_QUESTION, LIVE_VIDEO_EXPECTED_ANSWER;
var init_live_gate_video = __esm({
  "src/antigravity/live-gate-video.ts"() {
    "use strict";
    init_video();
    LIVE_VIDEO_BYTES = 32 * 1024 * 1024;
    LIVE_VIDEO_QUESTION = "What exact uppercase word is visibly shown in the center of the video? Reply with that word only.";
    LIVE_VIDEO_EXPECTED_ANSWER = "KUMQUAT";
  }
});

// src/antigravity/live-gate-runner.ts
var live_gate_runner_exports = {};
__export(live_gate_runner_exports, {
  LIVE_TEXT_MODEL: () => LIVE_TEXT_MODEL,
  LIVE_TEXT_MODEL_BY_FAMILY: () => LIVE_TEXT_MODEL_BY_FAMILY,
  LIVE_VIDEO_EXPECTED_ANSWER: () => LIVE_VIDEO_EXPECTED_ANSWER,
  LIVE_VIDEO_QUESTION: () => LIVE_VIDEO_QUESTION,
  classifyGate0Outcome: () => classifyGate0Outcome,
  createProductionLiveGateRunner: () => createProductionLiveGateRunner,
  isDeterministicVideoAnswer: () => isDeterministicVideoAnswer,
  runLlmGate: () => runLlmGate
});
import { dirname as dirname4, join as join5 } from "node:path";
function createProductionLiveGateRunner(options = {}) {
  const authPath = defaultAuthStorePath();
  const gates = options.gates ?? createFileCapabilityGates(defaultCapabilityGatePath(authPath));
  const auth = options.auth ?? createAntigravityAuthService({ storePath: authPath, gates });
  const ownsAuth = options.auth === void 0;
  const output = options.output ?? (() => {
  });
  const attachmentRoot = options.attachmentRoot ?? join5(dirname4(authPath), "live-gate-attachments");
  return {
    run: async (gate, runOptions) => {
      try {
        if (gate === "A") return await runAuthGate(auth, output);
        if (gate === "0L") {
          if (runOptions.llmFamily !== void 0 && !await auth.gate0Passed()) return { gate, outcome: "failed" };
          return await runLlmGate(auth, gates, runOptions.llmFamily);
        }
        if (!await auth.gate0Passed()) {
          await recordGateFailure(auth, gate, "failed");
          return { gate, outcome: "failed" };
        }
        if (gate === "S") return await runSearchGate(auth);
        if (gate === "I") return await runImageGate(auth, attachmentRoot);
        return await runVideoGate(auth, runOptions);
      } catch (error) {
        const outcome = gate === "0L" ? classifyGate0Outcome(error) : classifyOutcome(error);
        await recordGateFailure(auth, gate, outcome, runOptions.llmFamily).catch(() => {
        });
        return { gate, outcome };
      }
    },
    dispose: async () => {
      if (ownsAuth) await auth.dispose();
    }
  };
}
var init_live_gate_runner = __esm({
  "src/antigravity/live-gate-runner.ts"() {
    "use strict";
    init_auth_service();
    init_auth_store();
    init_capability_gates();
    init_live_gate_auth();
    init_live_gate_image();
    init_live_gate_llm();
    init_live_gate_outcome();
    init_live_gate_search();
    init_live_gate_video();
    init_live_gate_llm();
    init_live_gate_outcome();
    init_live_gate_video();
  }
});

// src/antigravity/index.ts
init_auth_service();

// src/antigravity/loopback-rpc.ts
var LOOPBACK_REQUIRED_MESSAGE = "Antigravity account controls require a loopback-bound DSH Host";
function loopbackMode(webServerHost) {
  return webServerHost === "127.0.0.1" ? "enabled" : "blocked";
}
var ACCOUNT_COMMAND_DENIED_MESSAGE = "Antigravity account commands require a local DSH Host (no WebServer or 127.0.0.1-bound)";
function commandAccountMode(webServer) {
  if (webServer === void 0) return "enabled";
  return loopbackMode(webServer.host);
}
function createLoopbackRpcGuard(webServerHost, delegate) {
  if (loopbackMode(webServerHost) === "blocked") {
    return {
      mode: "blocked",
      handler: async () => ({
        ok: false,
        error: {
          code: "loopback-required",
          message: LOOPBACK_REQUIRED_MESSAGE,
          details: {}
        }
      })
    };
  }
  return { mode: "enabled", handler: delegate };
}

// src/antigravity/open-authorization-url.ts
import { spawn } from "node:child_process";
var AUTHORIZATION_HOST = "accounts.google.com";
function openerSpec(platform, url) {
  if (platform === "darwin") return { command: "open", args: [url], verbatimArguments: false };
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", '""', `"${url}"`], verbatimArguments: true };
  }
  return { command: "xdg-open", args: [url], verbatimArguments: false };
}
function isAntigravityAuthorizationUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === AUTHORIZATION_HOST && parsed.pathname.startsWith("/o/oauth2/");
  } catch {
    return false;
  }
}
async function openAuthorizationUrl(url, spawnFn = spawn, platform = process.platform) {
  if (!isAntigravityAuthorizationUrl(url)) return false;
  const spec = openerSpec(platform, url);
  try {
    const child = spawnFn(spec.command, spec.args, {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: spec.verbatimArguments
    });
    return await new Promise((resolve3) => {
      child.once("error", () => {
        resolve3(false);
      });
      child.once("spawn", () => {
        child.unref();
        resolve3(true);
      });
    });
  } catch {
    return false;
  }
}

// src/antigravity/auth-command.ts
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function formatStatus(status) {
  const login = status.login;
  const parts = [
    login.configured ? "configured" : "not configured",
    login.projectAvailable ? "project available" : "no project"
  ];
  if (login.maskedEmail !== void 0) parts.push(login.maskedEmail);
  if (login.phase === "pending") {
    parts.push("authorization pending");
  } else if (login.phase !== "idle" && login.phase !== "success") {
    parts.push(`phase ${login.phase}`);
  }
  if (login.errorCode !== void 0) parts.push(`error ${login.errorCode}`);
  const available = status.capabilities.filter((capability) => capability.state === "available").map((capability) => capability.id);
  if (available.length > 0) parts.push(`available: ${available.join(", ")}`);
  return `Antigravity auth: ${parts.join("; ")}`;
}
function createAntigravityAuthCommand(service, accountMode, openUrl = openAuthorizationUrl) {
  return {
    name: "antigravity-auth",
    description: "Inspect or start the Antigravity OAuth login",
    input: { hint: "[status|login|cancel|logout]" },
    handler: async ({ rawInput }) => {
      if (accountMode() === "blocked") {
        return { kind: "error", text: ACCOUNT_COMMAND_DENIED_MESSAGE };
      }
      const operation = rawInput.trim() || "status";
      if (operation === "status") {
        try {
          return { kind: "success", text: formatStatus(await service.status()) };
        } catch (error) {
          return { kind: "error", text: `reading Antigravity auth status failed: ${errorMessage(error)}` };
        }
      }
      if (operation === "login") {
        try {
          const replaced = (await service.status()).login.phase === "pending";
          await service.acknowledgeRisk();
          const started = await service.startLogin();
          const opened = await openUrl(started.authorizationUrl);
          if (!opened) {
            return {
              kind: "error",
              text: "Antigravity authorization started, but this Host could not open a browser automatically; complete sign-in in a browser on this Host, then run /antigravity-auth status."
            };
          }
          return {
            kind: "success",
            text: replaced ? "Previous Antigravity authorization cancelled and a new one started (unofficial Antigravity channel, personal use); complete Google sign-in in the opened browser, then run /antigravity-auth status." : "Antigravity authorization started (unofficial Antigravity channel, personal use); complete Google sign-in in the opened browser, then run /antigravity-auth status."
          };
        } catch (error) {
          return { kind: "error", text: `starting Antigravity login failed: ${errorMessage(error)}` };
        }
      }
      if (operation === "cancel") {
        try {
          const result2 = await service.cancelLogin();
          return result2.phase === "cancelled" ? { kind: "success", text: "Antigravity authorization cancelled." } : { kind: "error", text: `Antigravity authorization could not be cancelled (phase ${result2.phase}).` };
        } catch (error) {
          return { kind: "error", text: `cancelling Antigravity login failed: ${errorMessage(error)}` };
        }
      }
      if (operation === "logout") {
        try {
          await service.logout();
          return { kind: "success", text: "Antigravity logged out." };
        } catch (error) {
          return { kind: "error", text: `logging out of Antigravity failed: ${errorMessage(error)}` };
        }
      }
      return { kind: "error", text: `unknown operation "${operation}" (available: status, login, cancel, logout)` };
    }
  };
}

// src/antigravity/index.ts
init_llm_adapter();
init_auth_store();

// src/antigravity/account-routes.ts
import { clientRequestSchema } from "@deepseek-ai/dsh-client-connection";
function registerAccountRoutes(connection, namespace, endpoints, handler) {
  const disposers = endpoints.map((endpoint) => connection.fetch.register({
    path: `/api/${namespace}/${endpoint}`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request2) => {
      if (request2.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        return new Response("content type must be application/json", { status: 415 });
      }
      let body;
      try {
        body = await request2.json();
      } catch {
        return new Response("invalid JSON", { status: 400 });
      }
      const envelope = clientRequestSchema.safeParse(body);
      if (!envelope.success) return new Response("invalid account request", { status: 400 });
      const { rpcId, method, payload } = envelope.data;
      const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } });
      let result2;
      try {
        result2 = method === `${namespace}/${endpoint}` ? await handler(endpoint, payload, request2.signal) : failure("bad-request", "Account request method does not match its endpoint");
      } catch {
        result2 = failure("internal", "Account request failed");
      }
      return Response.json({ type: "server-response", rpcId, result: result2 });
    }
  }));
  return async () => {
    await Promise.all(disposers.map((dispose) => dispose()));
  };
}

// src/antigravity/rpc.ts
init_oauth_flow();
init_credential_coordinator();

// src/antigravity/login-types.ts
var LOGIN_PHASES = [
  "idle",
  "pending",
  "success",
  "cancelled",
  "expired",
  "port-conflict",
  "failed"
];
var LOGIN_ERROR_CODES = [
  "invalid-method",
  "invalid-path",
  "invalid-host",
  "duplicate-parameter",
  "invalid-parameters",
  "missing-state",
  "state-mismatch",
  "missing-code",
  "oauth-error",
  "no-pending-flow",
  "expired",
  "cancelled",
  "port-conflict",
  "token-exchange-failed",
  "project-unavailable",
  "project-authentication-failed",
  "project-forbidden",
  "project-rate-limited",
  "project-offline",
  "project-malformed",
  "project-protocol-drift",
  "project-validation-failed",
  "persistence-failed",
  "credential-conflict",
  "invalid-callback-url",
  "risk-acknowledgement-required",
  "internal"
];
function isLoginPhase(value) {
  return typeof value === "string" && LOGIN_PHASES.includes(value);
}
function isLoginErrorCode(value) {
  return typeof value === "string" && LOGIN_ERROR_CODES.includes(value);
}

// src/antigravity/rpc-vocabulary.ts
var OPERATION_ERROR_CODES = [
  "loopback-required",
  "invalid-grant",
  "network",
  "timeout",
  "rate-limited",
  "server-error",
  "http-error",
  "invalid-response",
  "conflict",
  "storage"
];
var SAFE_RPC_ERROR_CODES = [
  "bad-request",
  ...LOGIN_ERROR_CODES,
  ...OPERATION_ERROR_CODES
];
var SAFE_RPC_ERROR_MESSAGES = Object.freeze({
  "bad-request": "antigravity-auth: invalid request",
  "loopback-required": "Antigravity account controls require a loopback-bound DSH Host",
  cancelled: "The operation was cancelled",
  "risk-acknowledgement-required": "Risk acknowledgement is required before login",
  "port-conflict": "The fixed OAuth callback port is already in use",
  "invalid-method": "The OAuth callback method is not accepted",
  "invalid-path": "The OAuth callback path is not accepted",
  "invalid-host": "The OAuth callback host is not accepted",
  "duplicate-parameter": "The OAuth callback contains duplicate parameters",
  "invalid-parameters": "The OAuth callback parameters are not accepted",
  "missing-state": "The OAuth callback state is missing",
  "state-mismatch": "The OAuth callback state was not accepted",
  "missing-code": "The OAuth callback code is missing",
  "oauth-error": "The OAuth provider rejected authorization",
  expired: "The OAuth login expired",
  "no-pending-flow": "There is no pending OAuth login",
  "project-unavailable": "No usable project is available for this account",
  "project-authentication-failed": "The Antigravity project probe requires authentication",
  "project-forbidden": "The Antigravity project probe was forbidden",
  "project-rate-limited": "The Antigravity project probe is rate-limited",
  "project-offline": "The Antigravity project probe is offline",
  "project-malformed": "The Antigravity project response was malformed",
  "project-protocol-drift": "The Antigravity project protocol changed",
  "project-validation-failed": "Project validation failed",
  "credential-conflict": "The login changed while it was completing",
  "persistence-failed": "The login could not be saved",
  "token-exchange-failed": "The authorization code could not be exchanged",
  "invalid-callback-url": "The callback URL is invalid",
  "invalid-grant": "The account must be authenticated again",
  network: "The operation could not reach the provider",
  timeout: "The operation timed out",
  "rate-limited": "The operation is rate-limited",
  "server-error": "The provider is unavailable",
  "http-error": "The provider rejected the operation",
  "invalid-response": "The provider response was not accepted",
  conflict: "The account changed while the operation was running",
  storage: "The local account state could not be updated"
});
function isSafeRpcErrorCode(value) {
  return typeof value === "string" && SAFE_RPC_ERROR_CODES.includes(value);
}
function safeRpcErrorMessage(code) {
  return SAFE_RPC_ERROR_MESSAGES[code] ?? "antigravity-auth: operation failed";
}

// src/antigravity/rpc-contract.ts
init_status();

// src/antigravity/model-catalog.ts
var ANTIGRAVITY_MODEL_CATALOG_STATES = [
  "snapshot",
  "live-available",
  "refresh-failed",
  "protocol-drift"
];

// src/antigravity/rpc-contract.ts
init_safe_text();
var ANTIGRAVITY_AUTH_RPC_CHANNEL = "/api";
var ANTIGRAVITY_AUTH_RPC_NAMESPACE = "antigravity-auth";
function createAntigravityAuthRpcClient(rpc) {
  return {
    status: (signal) => callValidated(rpc, "status", {}, signal, (value) => {
      const status = parseStatusResult(value);
      return status === void 0 ? void 0 : { status };
    }),
    acknowledgeRisk: (signal) => callValidated(rpc, "acknowledge-risk", { acknowledge: true }, signal, parseAcknowledgementResult),
    login: (signal) => callValidated(rpc, "login", {}, signal, parseLoginResult),
    cancelLogin: (signal) => callValidated(rpc, "cancel", {}, signal, parseActionResult),
    logout: (signal) => callValidated(rpc, "logout", {}, signal, parseLogoutResult),
    revoke: (signal) => callValidated(rpc, "revoke", { confirmed: true }, signal, parseRevokeResult),
    models: (signal, force = false) => callValidated(rpc, "models", { force }, signal, parseModelCatalogResult),
    usage: (signal, force = false) => callValidated(rpc, "usage", { force }, signal, parseUsageResult)
  };
}
async function callValidated(rpc, endpoint, payload, signal, parse) {
  let result2;
  try {
    result2 = await rpc.call(ANTIGRAVITY_AUTH_RPC_CHANNEL, `${ANTIGRAVITY_AUTH_RPC_NAMESPACE}/${endpoint}`, payload, signal);
  } catch {
    return invalidResponse(endpoint);
  }
  if (!result2.ok) return sanitizeFailure(result2, endpoint);
  const value = parse(result2.value);
  return value === void 0 ? invalidResponse(endpoint) : { ok: true, value };
}
function sanitizeFailure(result2, endpoint) {
  const error = result2.error;
  if (!isRecord9(error) || !hasExactKeys(error, ["code", "message", "details"]) || !isSafeRpcErrorCode(error.code) || typeof error.message !== "string" || !isBoundedSafeText(error.message, 512) || !isSafeErrorDetails(error.details)) return invalidResponse(endpoint);
  return {
    ok: false,
    error: {
      code: error.code,
      message: safeRpcErrorMessage(error.code),
      details: {}
    }
  };
}
function isSafeErrorDetails(value) {
  if (!isRecord9(value)) return false;
  if (Object.keys(value).length === 0) return true;
  return hasExactKeys(value, ["issues"]) && Array.isArray(value.issues) && value.issues.length === 0;
}
function parseModelCatalogResult(value) {
  if (!isRecord9(value) || !hasExactKeys(value, ["state", "models", ...value.checkedAt === void 0 ? [] : ["checkedAt"]]) || !ANTIGRAVITY_MODEL_CATALOG_STATES.includes(value.state) || !Array.isArray(value.models) || value.models.length === 0 || value.models.length > 64 || value.checkedAt !== void 0 && !isIsoTime(value.checkedAt)) return void 0;
  const models = [];
  const ids = /* @__PURE__ */ new Set();
  for (const model of value.models) {
    if (!isRecord9(model) || !hasExactKeys(model, ["id", "name", "state"]) || !isBoundedSafeText(model.id, 256) || !isBoundedSafeText(model.name, 256) || model.state !== "snapshot" && model.state !== "live-available" && model.state !== "unavailable" || ids.has(model.id)) return void 0;
    if (value.state === "live-available" ? model.state === "snapshot" : model.state !== "snapshot") return void 0;
    ids.add(model.id);
    models.push({ id: model.id, name: model.name, state: model.state });
  }
  return {
    state: value.state,
    models,
    ...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {}
  };
}
function parseUsageResult(value) {
  if (!isRecord9(value) || !hasExactKeys(value, ["state", ...value.checkedAt === void 0 ? [] : ["checkedAt"], ...value.groups === void 0 ? [] : ["groups"]])) return void 0;
  if (!isQuotaState(value.state)) return void 0;
  if (value.checkedAt !== void 0 && !isIsoTime(value.checkedAt)) return void 0;
  if (value.state === "available" && value.groups === void 0) return void 0;
  if (value.groups !== void 0) {
    if (!Array.isArray(value.groups) || value.groups.length === 0 || value.groups.length > 2) return void 0;
    const groups = [];
    const groupNames = /* @__PURE__ */ new Set();
    for (const rawGroup of value.groups) {
      if (!isRecord9(rawGroup) || !hasExactKeys(rawGroup, ["group", "modelCount", "windows"]) || rawGroup.group !== "gemini" && rawGroup.group !== "non-gemini" || !Number.isSafeInteger(rawGroup.modelCount) || rawGroup.modelCount < 0 || !Array.isArray(rawGroup.windows)) return void 0;
      if (groupNames.has(rawGroup.group)) return void 0;
      groupNames.add(rawGroup.group);
      const modelCount = rawGroup.modelCount;
      if (rawGroup.windows.length === 0 || rawGroup.windows.length > 2) return void 0;
      const windows = [];
      const windowKinds = /* @__PURE__ */ new Set();
      for (const rawWindow of rawGroup.windows) {
        if (!isRecord9(rawWindow) || !hasExactKeys(rawWindow, ["window", "remainingFraction", "resetTime"]) || rawWindow.window !== "5h" && rawWindow.window !== "weekly" || windowKinds.has(rawWindow.window) || typeof rawWindow.remainingFraction !== "number" || !Number.isFinite(rawWindow.remainingFraction) || rawWindow.remainingFraction < 0 || rawWindow.remainingFraction > 1 || !isIsoTime(rawWindow.resetTime)) return void 0;
        windowKinds.add(rawWindow.window);
        windows.push({ window: rawWindow.window, remainingFraction: rawWindow.remainingFraction, resetTime: rawWindow.resetTime });
      }
      groups.push({ group: rawGroup.group, modelCount, windows });
    }
    return { state: value.state, ...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {}, groups };
  }
  return { state: value.state, ...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {} };
}
function parseStatusResult(value) {
  if (!isRecord9(value) || !hasExactKeys(value, ["status"])) return void 0;
  return parseStatus(value.status);
}
function parseStatus(value) {
  if (!isRecord9(value) || !hasAllowedKeys(value, [
    "pluginId",
    "phase",
    "privateSelfUse",
    "singleAccount",
    "riskAcknowledgementRequired",
    "riskAcknowledged",
    "login",
    "credential",
    "revoke",
    "capabilities"
  ]) || value.pluginId !== "dsh-antigravity-auth" || value.phase !== "bootstrap" || value.privateSelfUse !== true || value.singleAccount !== true || value.riskAcknowledgementRequired !== true || typeof value.riskAcknowledged !== "boolean" || !Array.isArray(value.capabilities)) return void 0;
  const login = parseLoginStatus(value.login);
  if (login === void 0) return void 0;
  const credential = value.credential === void 0 ? void 0 : parseCredentialStatus(value.credential);
  if (value.credential !== void 0 && credential === void 0) return void 0;
  const revoke = value.revoke === void 0 ? void 0 : parseRevokeStatus(value.revoke);
  if (value.revoke !== void 0 && revoke === void 0) return void 0;
  const seen = /* @__PURE__ */ new Set();
  const capabilities = [];
  for (const capability of value.capabilities) {
    const parsed = parseCapability(capability);
    if (parsed === void 0 || seen.has(parsed.id)) return void 0;
    seen.add(parsed.id);
    capabilities.push(parsed);
  }
  if (seen.size !== CAPABILITY_ROW_IDS.length || CAPABILITY_ROW_IDS.some((id) => !seen.has(id))) return void 0;
  return {
    pluginId: "dsh-antigravity-auth",
    phase: "bootstrap",
    privateSelfUse: true,
    singleAccount: true,
    riskAcknowledgementRequired: true,
    riskAcknowledged: value.riskAcknowledged,
    login,
    ...credential === void 0 ? {} : { credential },
    ...revoke === void 0 ? {} : { revoke },
    capabilities
  };
}
function parseCredentialStatus(value) {
  if (!isRecord9(value) || typeof value.state !== "string" || !isCredentialState(value.state) || typeof value.configured !== "boolean" || !hasAllowedKeys(value, ["state", "configured", "expiresAt", "lastRefreshAt", "errorCode"])) return void 0;
  if (value.expiresAt !== void 0 && !isIsoTime(value.expiresAt)) return void 0;
  if (value.lastRefreshAt !== void 0 && !isIsoTime(value.lastRefreshAt)) return void 0;
  if (value.errorCode !== void 0 && (typeof value.errorCode !== "string" || !isCredentialErrorCode(value.errorCode))) return void 0;
  return {
    state: value.state,
    configured: value.configured,
    ...typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {},
    ...typeof value.lastRefreshAt === "string" ? { lastRefreshAt: value.lastRefreshAt } : {},
    ...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
  };
}
function parseRevokeStatus(value) {
  if (!isRecord9(value) || typeof value.state !== "string" || !isRevokeState(value.state) || !hasAllowedKeys(value, ["state", "errorCode"])) return void 0;
  if (value.errorCode !== void 0 && (typeof value.errorCode !== "string" || !isRevokeErrorCode(value.errorCode))) return void 0;
  return {
    state: value.state,
    ...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
  };
}
function parseLoginStatus(value) {
  if (!isRecord9(value) || typeof value.phase !== "string" || !isLoginPhase(value.phase) || typeof value.configured !== "boolean" || typeof value.projectAvailable !== "boolean") return void 0;
  const allowed = ["phase", "configured", "projectAvailable", "authorizationUrl", "expiresAt", "maskedEmail", "errorCode"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return void 0;
  if (value.authorizationUrl !== void 0 && !isSafeAuthorizationUrl(value.authorizationUrl)) return void 0;
  if (value.expiresAt !== void 0 && !isIsoTime(value.expiresAt)) return void 0;
  if (value.maskedEmail !== void 0 && (typeof value.maskedEmail !== "string" || !isMaskedEmail(value.maskedEmail))) return void 0;
  if (value.errorCode !== void 0 && !isLoginErrorCode(value.errorCode)) return void 0;
  if (isErrorPhase(value.phase) ? typeof value.errorCode !== "string" : value.errorCode !== void 0) return void 0;
  if (value.phase === "pending" ? typeof value.authorizationUrl !== "string" || typeof value.expiresAt !== "string" : value.authorizationUrl !== void 0) return void 0;
  return {
    phase: value.phase,
    configured: value.configured,
    projectAvailable: value.projectAvailable,
    ...typeof value.authorizationUrl === "string" ? { authorizationUrl: value.authorizationUrl } : {},
    ...typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {},
    ...typeof value.maskedEmail === "string" ? { maskedEmail: value.maskedEmail } : {},
    ...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
  };
}
function parseCapability(value) {
  if (!isRecord9(value) || !hasExactKeys(value, ["id", "state", "reasonCode"])) return void 0;
  if (!isCapabilityRowId(value.id) || !isCapabilityGateState(value.state) || !isCapabilityReasonCode(value.reasonCode)) {
    return void 0;
  }
  return { id: value.id, state: value.state, reasonCode: value.reasonCode };
}
function parseAcknowledgementResult(value) {
  return isRecord9(value) && hasExactKeys(value, ["acknowledged"]) && value.acknowledged === true ? { acknowledged: true } : void 0;
}
function parseLoginResult(value) {
  return isRecord9(value) && hasExactKeys(value, ["started", "phase", "authorizationUrl", "expiresAt"]) && value.started === true && value.phase === "pending" && isSafeAuthorizationUrl(value.authorizationUrl) && isIsoTime(value.expiresAt) ? {
    started: true,
    phase: "pending",
    authorizationUrl: value.authorizationUrl,
    expiresAt: value.expiresAt
  } : void 0;
}
function parseActionResult(value) {
  if (!isRecord9(value) || typeof value.phase !== "string" || !isLoginPhase(value.phase)) return void 0;
  if (Object.keys(value).some((key) => key !== "phase" && key !== "errorCode")) return void 0;
  if (value.errorCode !== void 0 && !isLoginErrorCode(value.errorCode)) return void 0;
  return {
    phase: value.phase,
    ...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
  };
}
function parseLogoutResult(value) {
  return isRecord9(value) && hasExactKeys(value, ["state"]) && value.state === "logged-out" ? { state: "logged-out" } : void 0;
}
function parseRevokeResult(value) {
  if (!isRecord9(value) || typeof value.state !== "string") return void 0;
  if (value.state === "confirmation-required" || value.state === "revoked" || value.state === "logged-out" || value.state === "superseded") {
    return hasExactKeys(value, ["state"]) ? { state: value.state } : void 0;
  }
  if (value.state === "failed" && hasExactKeys(value, ["state", "errorCode"]) && typeof value.errorCode === "string" && isRevokeErrorCode(value.errorCode)) {
    return { state: "failed", errorCode: value.errorCode };
  }
  return void 0;
}
function isSafeAuthorizationUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 8192) return false;
  try {
    const parsed = new URL(value);
    const allowed = /* @__PURE__ */ new Set(["client_id", "response_type", "redirect_uri", "scope", "code_challenge", "code_challenge_method", "state", "access_type", "prompt"]);
    for (const [key, parameter] of parsed.searchParams) {
      if (!allowed.has(key) || parsed.searchParams.getAll(key).length !== 1 || !isBoundedSafeText(parameter, 4096)) return false;
    }
    const state = parsed.searchParams.get("state");
    const clientId = parsed.searchParams.get("client_id");
    const challenge = parsed.searchParams.get("code_challenge");
    return parsed.protocol === "https:" && parsed.hostname === "accounts.google.com" && parsed.port === "" && parsed.username === "" && parsed.password === "" && parsed.pathname === "/o/oauth2/v2/auth" && parsed.hash.length === 0 && typeof state === "string" && /^[A-Za-z0-9_-]{43}$/u.test(state) && (clientId === null || clientId.length <= 256 && clientId.endsWith(".apps.googleusercontent.com")) && (challenge === null || /^[A-Za-z0-9_-]{43}$/u.test(challenge)) && (parsed.searchParams.get("response_type") === null || parsed.searchParams.get("response_type") === "code") && (parsed.searchParams.get("redirect_uri") === null || parsed.searchParams.get("redirect_uri") === "http://localhost:51121/oauth-callback") && (parsed.searchParams.get("code_challenge_method") === null || parsed.searchParams.get("code_challenge_method") === "S256") && (parsed.searchParams.get("access_type") === null || parsed.searchParams.get("access_type") === "offline") && (parsed.searchParams.get("prompt") === null || parsed.searchParams.get("prompt") === "consent");
  } catch {
    return false;
  }
}
function isMaskedEmail(value) {
  return isBoundedSafeText(value, 256) && /^.[*]{3}[^@]*@[^@\s]+$/u.test(value);
}
function isErrorPhase(value) {
  return value === "cancelled" || value === "expired" || value === "port-conflict" || value === "failed";
}
function isQuotaState(value) {
  return value === "available" || value === "unauthenticated" || value === "forbidden" || value === "rate-limited" || value === "offline" || value === "timeout" || value === "protocol-drift";
}
function isIsoTime(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
function isCapabilityRowId(value) {
  return typeof value === "string" && CAPABILITY_ROW_IDS.includes(value);
}
function isCapabilityGateState(value) {
  return value === "available" || value === "disabled" || value === "poc-pending" || value === "protocol-drift";
}
function isCapabilityReasonCode(value) {
  return value === "gate-not-run" || value === "project-unavailable" || value === "capability-ready" || value === "unauthenticated" || value === "rate-limited" || value === "cancelled" || value === "gate-0-failed" || value === "gate-failed" || value === "unsupported-video" || value === "protocol-drift";
}
function isCredentialState(value) {
  return value === "logged-out" || value === "logged-in" || value === "refreshing" || value === "refresh-failed" || value === "re-login-required";
}
function isCredentialErrorCode(value) {
  return value === "invalid-grant" || value === "network" || value === "timeout" || value === "rate-limited" || value === "server-error" || value === "http-error" || value === "invalid-response" || value === "conflict" || value === "storage" || value === "cancelled";
}
function isRevokeState(value) {
  return value === "idle" || value === "pending" || value === "confirmation-required" || value === "revoked" || value === "logged-out" || value === "failed" || value === "superseded";
}
function isRevokeErrorCode(value) {
  return value === "network" || value === "timeout" || value === "rate-limited" || value === "server-error" || value === "http-error" || value === "invalid-response" || value === "storage";
}
function hasAllowedKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function hasExactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}
function invalidResponse(endpoint) {
  return {
    ok: false,
    error: {
      code: "internal",
      message: `antigravity-auth: invalid ${endpoint} response from Host`,
      details: {}
    }
  };
}
function isRecord9(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/antigravity/rpc.ts
async function handleAntigravityAuthRpc(service, endpoint, payload, signal, modelCatalog) {
  if (signal?.aborted === true) return cancelled2();
  try {
    if (endpoint === "status") {
      if (!isEmptyRecord(payload)) return badRequest("status expects an empty payload");
      const status = await service.status();
      const accounts = service.accounts ? await service.accounts() : [];
      return { ok: true, value: { status, accounts } };
    }
    if (endpoint === "accounts") {
      const accounts = service.accounts ? await service.accounts() : [];
      return { ok: true, value: { accounts } };
    }
    if (endpoint === "account/select") {
      const rec = typeof payload === "object" && payload !== null ? payload : {};
      const id = typeof rec.id === "string" ? rec.id : void 0;
      if (id === void 0 || id.length === 0) return badRequest("account/select expects { id: string }");
      const accounts = service.selectAccount ? await service.selectAccount(id) : [];
      return { ok: true, value: { accounts } };
    }
    if (endpoint === "account/update") {
      const rec = typeof payload === "object" && payload !== null ? payload : {};
      const id = typeof rec.id === "string" ? rec.id : void 0;
      const label = typeof rec.label === "string" ? rec.label.trim() : void 0;
      const tier = typeof rec.tier === "string" ? rec.tier.trim() : void 0;
      if (!id) return badRequest("account/update expects { id: string }");
      const accounts = service.updateAccount ? await service.updateAccount(id, { label, tier }) : [];
      return { ok: true, value: { accounts } };
    }
    if (endpoint === "account/rename") {
      const rec = typeof payload === "object" && payload !== null ? payload : {};
      const id = typeof rec.id === "string" ? rec.id : void 0;
      const label = typeof rec.label === "string" ? rec.label.trim() : void 0;
      if (!id || !label) return badRequest("account/rename expects { id: string, label: string }");
      const accounts = service.renameAccount ? await service.renameAccount(id, label) : [];
      return { ok: true, value: { accounts } };
    }
    if (endpoint === "account/remove") {
      const rec = typeof payload === "object" && payload !== null ? payload : {};
      const id = typeof rec.id === "string" ? rec.id : void 0;
      if (id === void 0 || id.length === 0) return badRequest("account/remove expects { id: string }");
      const accounts = service.removeAccount ? await service.removeAccount(id) : [];
      return { ok: true, value: { accounts } };
    }
    if (endpoint === "models") {
      if (!isRefreshPayload(payload)) return badRequest("models expects {} or { force: boolean }");
      if (modelCatalog === void 0) return badRequest("model catalog is unavailable");
      const status = await service.status();
      const gateReady = status.login.projectAvailable && status.capabilities.some((capability) => capability.id === "auth-llm" && capability.state === "available");
      return { ok: true, value: gateReady ? await modelCatalog.modelCatalog(signal, payload.force) : modelCatalog.catalogSnapshot() };
    }
    if (endpoint === "usage") {
      if (!isRefreshPayload(payload)) return badRequest("usage expects {} or { force: boolean }");
      if (service.usage === void 0) return { ok: true, value: { state: "protocol-drift" } };
      return { ok: true, value: await service.usage(signal, payload.force) };
    }
    if (endpoint === "acknowledge-risk") {
      if (!isAcknowledgement(payload)) return badRequest("acknowledge-risk expects { acknowledge: true }");
      return { ok: true, value: await service.acknowledgeRisk() };
    }
    if (endpoint === "login") {
      if (!isEmptyRecord(payload)) return badRequest("login expects an empty payload");
      return { ok: true, value: await service.startLogin() };
    }
    if (endpoint === "cancel" || endpoint === "cancel-login") {
      if (!isEmptyRecord(payload)) return badRequest("cancel expects an empty payload");
      return { ok: true, value: await service.cancelLogin() };
    }
    if (endpoint === "logout") {
      if (!isEmptyRecord(payload)) return badRequest("logout expects an empty payload");
      return { ok: true, value: await service.logout() };
    }
    if (endpoint === "revoke") {
      if (!isRevokePayload(payload)) return badRequest("revoke expects { confirmed: true }");
      return { ok: true, value: await service.revoke(true, signal) };
    }
    return badRequest("unknown Antigravity auth endpoint");
  } catch (error) {
    return safeFailure(error);
  }
}
function badRequest(message) {
  return { ok: false, error: { code: "bad-request", message, details: { issues: [] } } };
}
function cancelled2() {
  return { ok: false, error: { code: "cancelled", message: "antigravity-auth: request cancelled", details: {} } };
}
function safeFailure(error) {
  const credentialError = error instanceof CredentialOperationError ? error : void 0;
  const candidate = error instanceof OAuthFlowError ? error.code : credentialError?.code ?? "internal";
  const code = isSafeRpcErrorCode(candidate) ? candidate : "internal";
  return {
    ok: false,
    error: {
      code,
      message: credentialError === void 0 ? safeRpcErrorMessage(code) : credentialErrorMessage(credentialError.code) ?? safeRpcErrorMessage(code),
      details: {}
    }
  };
}
function isEmptyRecord(value) {
  return isRecord10(value) && Object.keys(value).length === 0;
}
function isRefreshPayload(value) {
  return isRecord10(value) && Object.keys(value).every((key) => key === "force") && (value.force === void 0 || typeof value.force === "boolean");
}
function isAcknowledgement(value) {
  return isRecord10(value) && Object.keys(value).length === 1 && value.acknowledge === true;
}
function isRevokePayload(value) {
  return isRecord10(value) && Object.keys(value).length === 1 && value.confirmed === true;
}
function isRecord10(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/antigravity/index.ts
init_capability_lifecycle();
init_auth_service();
init_credential_coordinator();
init_status();
init_project_context();
init_wire_identity();
init_llm_adapter();
init_private_transport();
init_replay();
init_quota();
init_media_admission();
init_capability_gates();

// src/antigravity/live-gates.ts
init_status();
var LIVE_ACKNOWLEDGEMENT = "I_ACKNOWLEDGE_UNOFFICIAL_ANTIGRAVITY_PRIVATE_ENDPOINT_RISK";
var LIVE_GATE_IDS = ["A", "0L", "S", "I", "V"];
async function runLiveGateCli(argv, env = process.env, dependencies = {}) {
  const output = dependencies.output ?? ((line) => {
    process.stdout.write(`${line}
`);
  });
  const error = dependencies.error ?? ((line) => {
    process.stderr.write(`${line}
`);
  });
  const parsed = parseArguments(argv);
  if (parsed.error !== void 0) {
    error(parsed.error);
    return 2;
  }
  if (!parsed.acknowledged || env.DSH_ANTIGRAVITY_LIVE_ACK !== LIVE_ACKNOWLEDGEMENT) {
    error("Live gates require explicit acknowledgement via both --acknowledge-private-risk and DSH_ANTIGRAVITY_LIVE_ACK.");
    return 2;
  }
  const createRunner = dependencies.createRunner ?? (async () => {
    const module = await Promise.resolve().then(() => (init_live_gate_runner(), live_gate_runner_exports));
    return module.createProductionLiveGateRunner({ output });
  });
  let runner;
  try {
    runner = await createRunner();
    const result2 = await runner.run(parsed.gate, parsed.options);
    output(JSON.stringify(result2));
    return result2.outcome === "passed" ? 0 : 1;
  } catch {
    error("The selected Antigravity live gate failed safely.");
    return 1;
  } finally {
    await runner?.dispose().catch(() => {
    });
  }
}
function parseArguments(argv) {
  let acknowledged = false;
  let gate;
  let videoFile;
  let llmFamily;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--acknowledge-private-risk") {
      if (acknowledged) return { error: "The acknowledgement flag may be supplied only once." };
      acknowledged = true;
      continue;
    }
    if (value === "--gate") {
      if (gate !== void 0) return { error: "Select exactly one live gate per invocation." };
      const candidate = argv[index + 1];
      if (candidate === void 0 || !LIVE_GATE_IDS.includes(candidate)) return { error: "Select one live gate: A, 0L, S, I, or V." };
      gate = candidate;
      index += 1;
      continue;
    }
    if (value === "--family") {
      if (llmFamily !== void 0) return { error: "The LLM family may be supplied only once." };
      const candidate = argv[index + 1];
      if (candidate === void 0 || !LLM_FAMILY_IDS.includes(candidate)) {
        return { error: "Select one LLM family: gemini, claude, or gpt-oss." };
      }
      llmFamily = candidate;
      index += 1;
      continue;
    }
    if (value === "--video-file") {
      if (videoFile !== void 0) return { error: "The video fixture may be supplied only once." };
      const candidate = argv[index + 1];
      if (candidate === void 0 || candidate.length === 0 || candidate.length > 4096) return { error: "Gate V requires a bounded video fixture path." };
      videoFile = candidate;
      index += 1;
      continue;
    }
    return { error: "The live gate arguments are invalid." };
  }
  if (gate === void 0) return { error: "Select exactly one live gate per invocation." };
  if (gate === "V" && videoFile === void 0) return { error: "Gate V requires --video-file." };
  if (gate !== "V" && videoFile !== void 0) return { error: "--video-file is valid only for Gate V." };
  if (gate !== "0L" && llmFamily !== void 0) return { error: "--family is valid only for Gate 0/L." };
  return {
    acknowledged,
    gate,
    options: {
      ...videoFile === void 0 ? {} : { videoFile },
      ...llmFamily === void 0 ? {} : { llmFamily }
    }
  };
}

// src/antigravity/index.ts
function apply4(ctx) {
  const service = createAntigravityAuthService({
    storePath: defaultAuthStorePath(),
    autoActivateGates: true
  });
  let accountMode = "enabled";
  const runtime = ctx;
  const adapter = new AntigravityAdapter({
    auth: service,
    ...runtime.attachments === void 0 ? {} : { attachments: runtime.attachments }
  });
  const contextWithProvide = ctx;
  const unprovide = contextWithProvide.provide?.("antigravityAuth", service) ?? (() => {
  });
  ctx.inject(["connection"], (connectionCtx) => {
    const webServer = connectionCtx.get("webServer");
    accountMode = commandAccountMode(webServer);
    const guard = createLoopbackRpcGuard(
      webServer?.host,
      (endpoint, payload, signal) => handleAntigravityAuthRpc(service, endpoint, payload, signal, adapter)
    );
    if (guard.mode === "blocked") {
      connectionCtx.logger.warn("antigravity-auth: account RPC is disabled because the WebServer is not loopback-bound");
    }
    return registerAccountRoutes(connectionCtx.connection, ANTIGRAVITY_AUTH_RPC_NAMESPACE, ["status", "models", "usage", "acknowledge-risk", "login", "cancel", "cancel-login", "logout", "revoke", "accounts", "account/select", "account/update", "account/rename", "account/remove"], guard.handler);
  });
  mountCapabilityLifecycle({
    ctx,
    auth: service,
    id: "auth-llm",
    enabled: () => runtime.llm?.registerAdapter !== void 0,
    register: () => {
      if (runtime.llm?.registerAdapter === void 0) return void 0;
      if (runtime.llm.listProviders?.().some((provider) => provider.id === ANTIGRAVITY_PROVIDER)) return void 0;
      const dispose = runtime.llm.registerAdapter([ANTIGRAVITY_PROVIDER], adapter);
      return () => {
        try {
          dispose();
        } finally {
          adapter.invalidateModelCatalog();
        }
      };
    },
    ownsAuth: true,
    cleanup: unprovide,
    label: "antigravity-auth: OAuth and LLM operations"
  });
  ctx.inject(["commands"], (commandCtx) => commandCtx.commands.register(createAntigravityAuthCommand(service, () => accountMode)));
}

// src/index.ts
init_search();
init_image();
init_video();

// src/codex/index.js
import { clientRequestSchema as clientRequestSchema2 } from "@deepseek-ai/dsh-client-connection";
import * as dshCredentials from "@deepseek-ai/dsh-credentials";
import { dshHomePath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { LlmError as LlmError2, createUserMessage } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import z4 from "@deepseek-ai/schemastery";
import { createHash as createHash3, randomBytes as randomBytes2, randomUUID as randomUUID3 } from "node:crypto";
import { execFile, spawn as spawn2 } from "node:child_process";
import { request } from "node:https";
import { AsyncLocalStorage } from "node:async_hooks";
import { Readable as Readable2 } from "node:stream";
import { promisify } from "node:util";
import { HttpsProxyAgent } from "https-proxy-agent";
import { openaiCodexProvider as createOpenAICodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { createModels } from "@earendil-works/pi-ai";
import { WebError as WebError2 } from "@deepseek-ai/dsh-web";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { constants } from "node:fs";
import { lstat as lstat5, mkdir as mkdir4, open as open2, readFile as readFile5, rename as rename3, rm as rm3, stat as stat2 } from "node:fs/promises";
import { dirname as dirname5, join as join6, resolve as resolve2 } from "node:path";
var DEFAULT_IMAGE_MODEL = "gpt-image-2";
var IMAGE_MODELS = Object.freeze({
  "gpt-image-2": Object.freeze([
    "auto",
    "low",
    "medium",
    "high"
  ]),
  "gpt-image-2.5-flare": Object.freeze([
    "auto",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ]),
  "gpt-image-2.5-sunburst": Object.freeze([
    "auto",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ])
});
function resolveImageModel(model = DEFAULT_IMAGE_MODEL) {
  if (typeof model !== "string" || !Object.hasOwn(IMAGE_MODELS, model)) throw new Error("Unknown image model");
  return model;
}
function validateImageQuality(model, quality) {
  if (!IMAGE_MODELS[resolveImageModel(model)].includes(quality)) throw new Error(`Unsupported quality for ${model}`);
}
var IMAGE_FEATURE_DEFAULTS = Object.freeze({
  imageGeneration: true,
  imageShortcut: true,
  imageEditing: true,
  imageViewer: true,
  imageAnnotations: true,
  imageSketch: true
});
function readImageFeatures(value = {}) {
  return Object.fromEntries(Object.entries(IMAGE_FEATURE_DEFAULTS).map(([key, fallback]) => [key, typeof value?.[key] === "boolean" ? value[key] : fallback]));
}
function readImageDefaults(value = {}) {
  const imageModel = Object.hasOwn(IMAGE_MODELS, value?.imageModel) ? value.imageModel : DEFAULT_IMAGE_MODEL;
  return {
    imageModel,
    imageQuality: IMAGE_MODELS[imageModel].includes(value?.imageQuality) ? value.imageQuality : "auto"
  };
}
function imageFeaturePatch(value = {}) {
  const patch = {};
  if (Object.hasOwn(value, "imageModel")) patch.imageModel = resolveImageModel(value.imageModel);
  if (Object.hasOwn(value, "imageQuality")) {
    if (![
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ].includes(value.imageQuality)) throw new Error("Invalid image quality");
    patch.imageQuality = value.imageQuality;
  }
  for (const key of Object.keys(IMAGE_FEATURE_DEFAULTS)) {
    if (!Object.hasOwn(value, key)) continue;
    if (typeof value[key] !== "boolean") throw new Error("Invalid image feature preference");
    patch[key] = value[key];
  }
  return patch;
}
function assertImageOperation(features, editing) {
  const current = readImageFeatures(features);
  if (!(editing ? current.imageEditing : current.imageGeneration)) throw new Error(editing ? "Image editing is disabled in subscription settings" : "Image generation is disabled in subscription settings");
}
var CUSTOM_CONTEXT_OVERRIDES_FIELD = "customContextModels";
var SEARCH_MODE_FIELD = "searchMode";
var SEARCH_DOMAINS_FIELD = "searchDomains";
var QUOTA_ALERTS_FIELD = "quotaAlerts";
var SEARCH_MODES = [
  "live",
  "cached",
  "disabled"
];
var QUOTA_ALERT_MODES = [
  "off",
  "important",
  "early",
  "custom"
];
var QUOTA_THRESHOLD_FIELDS = ["quotaShortThreshold", "quotaLongThreshold"];
var validQuotaThreshold = (value) => Number.isInteger(value) && value >= 1 && value <= 100;
var MAX_CONTEXT_BUDGET = 16e6;
var validModelKey = (key) => typeof key === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,95}$/u.test(key) && ![
  "constructor",
  "prototype",
  "__proto__"
].includes(key);
function normalizeContextOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, size]) => validModelKey(key) && Number.isSafeInteger(size) && size > 0 && size <= 16e6).slice(0, 64));
}
function normalizeSearchDomains(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Invalid search domains");
  return [...new Set(value.map((item) => {
    if (typeof item !== "string" || item.length > 253 || !/^[\p{L}\p{N}.-]+$/u.test(item)) throw new Error("Invalid search domain");
    const hostname = new URL(`https://${item}`).hostname.toLowerCase();
    if (!hostname.includes(".") || hostname.split(".").some((part) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part))) throw new Error("Invalid search domain");
    return hostname;
  }))];
}
function readCapabilitySettings(value = {}) {
  return {
    ...Object.fromEntries(QUOTA_THRESHOLD_FIELDS.map((key) => [key, validQuotaThreshold(value[key]) ? value[key] : 20])),
    ...readImageFeatures(value),
    ...readImageDefaults(value),
    [CUSTOM_CONTEXT_OVERRIDES_FIELD]: normalizeContextOverrides(value[CUSTOM_CONTEXT_OVERRIDES_FIELD]),
    [SEARCH_MODE_FIELD]: SEARCH_MODES.includes(value["searchMode"]) ? value[SEARCH_MODE_FIELD] : "live",
    [SEARCH_DOMAINS_FIELD]: normalizeSearchDomains(value["searchDomains"] ?? []),
    [QUOTA_ALERTS_FIELD]: QUOTA_ALERT_MODES.includes(value["quotaAlerts"]) ? value[QUOTA_ALERTS_FIELD] : "important"
  };
}
function capabilityPatch(payload) {
  const patch = imageFeaturePatch(payload ?? {});
  for (const field of QUOTA_THRESHOLD_FIELDS) {
    if (!Object.hasOwn(payload ?? {}, field)) continue;
    if (!validQuotaThreshold(payload[field])) throw new Error("Threshold must be an integer from 1 to 100");
    patch[field] = payload[field];
  }
  for (const [key, choices] of [[SEARCH_MODE_FIELD, SEARCH_MODES], [QUOTA_ALERTS_FIELD, QUOTA_ALERT_MODES]]) {
    if (!Object.hasOwn(payload ?? {}, key)) continue;
    if (!choices.includes(payload[key])) throw new Error("Invalid capability preference");
    patch[key] = payload[key];
  }
  if (Object.hasOwn(payload ?? {}, "searchDomains")) patch[SEARCH_DOMAINS_FIELD] = normalizeSearchDomains(payload[SEARCH_DOMAINS_FIELD]);
  if (Object.hasOwn(payload ?? {}, "customContextModels")) {
    const original = payload[CUSTOM_CONTEXT_OVERRIDES_FIELD];
    const normalized = normalizeContextOverrides(original);
    if (JSON.stringify(normalized) !== JSON.stringify(original)) throw new Error("Invalid model context preferences");
    patch[CUSTOM_CONTEXT_OVERRIDES_FIELD] = normalized;
  }
  return patch;
}
var SETTINGS_NAMESPACE = "codex-subscription";
var QUICK_QUOTA_MODE_FIELD = "quickQuotaMode";
var LEGACY_QUICK_QUOTA_FIELD = "quickQuotaVisible";
var QUICK_QUOTA_MODE_PERCENT = "percent";
var QUICK_QUOTA_MODE_FORECAST = "forecast";
var SEARCH_PROVIDER_FIELD = "searchProvider";
var SEARCH_PROVIDER_AUTO = "auto";
var SEARCH_PROVIDER_CODEX = "codex";
var DEFAULT_SEARCH_PROVIDER = SEARCH_PROVIDER_AUTO;
var SPEED_MODE_FIELD = "speedMode";
var SPEED_MODE_STANDARD = "standard";
var SPEED_MODE_FAST = "fast";
var DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD;
var OUTPUT_VERBOSITY_FIELD = "outputVerbosity";
var OUTPUT_VERBOSITY_DEFAULT = "default";
var OUTPUT_VERBOSITY_MEDIUM = "medium";
var OUTPUT_VERBOSITY_HIGH = "high";
var DEFAULT_OUTPUT_VERBOSITY = OUTPUT_VERBOSITY_DEFAULT;
var CONTEXT_MODE_FIELD = "contextMode";
var CONTEXT_MODE_STANDARD = "standard";
var CONTEXT_MODE_EXTENDED = "extended";
var CONTEXT_MODE_CUSTOM = "custom";
var DEFAULT_CONTEXT_MODE = CONTEXT_MODE_STANDARD;
var CUSTOM_CONTEXT_WINDOW_FIELD = "customContextWindow";
var DEFAULT_CUSTOM_CONTEXT_WINDOW = 272e3;
var MIN_CUSTOM_CONTEXT_WINDOW = 128e3;
var MAX_CUSTOM_CONTEXT_WINDOW = 1e6;
var CUSTOM_CONTEXT_MODEL_FIELDS = Object.freeze({
  "gpt-5.4": "customContextGpt54",
  "gpt-5.4-mini": "customContextGpt54Mini",
  "gpt-5.5": "customContextGpt55",
  "gpt-5.6": "customContextGpt56",
  "gpt-6-astra": "customContextGpt6Astra"
});
var CUSTOM_CONTEXT_MODEL_CAPS = Object.freeze({
  "gpt-5.4": 1e6,
  "gpt-5.4-mini": 4e5,
  "gpt-5.5": 1e6,
  "gpt-5.6": 1e6,
  "gpt-6-astra": 872e3
});
var CUSTOM_CONTEXT_MODEL_DEFAULTS = Object.freeze({
  "gpt-5.4": 272e3,
  "gpt-5.4-mini": 272e3,
  "gpt-5.5": 272e3,
  "gpt-5.6": 272e3,
  "gpt-6-astra": 272e3
});
var normalizeOutputVerbosity = (value) => [
  "default",
  "low",
  "medium",
  "high"
].includes(value) ? value : DEFAULT_OUTPUT_VERBOSITY;
var normalizeContextMode = (value) => [
  "standard",
  "extended",
  "custom"
].includes(value) ? value : DEFAULT_CONTEXT_MODE;
var normalizeCustomContextWindow = (value, maximum = MAX_CUSTOM_CONTEXT_WINDOW) => {
  if (!Number.isInteger(value)) return DEFAULT_CUSTOM_CONTEXT_WINDOW;
  return Math.min(Math.max(value, MIN_CUSTOM_CONTEXT_WINDOW), maximum);
};
var customContextModelKey = (modelId) => modelId?.startsWith("gpt-5.6-") ? "gpt-5.6" : modelId;
function modelContextMaximum(model) {
  const explicit = Number.isSafeInteger(model?.maxContextWindow) && model.maxContextWindow > 0 ? model.maxContextWindow : void 0;
  const fallback = CUSTOM_CONTEXT_MODEL_CAPS[customContextModelKey(model?.id)] ?? model?.contextWindow;
  return Math.min(MAX_CONTEXT_BUDGET, explicit ?? fallback ?? 272e3);
}
function clampModelContext(value, maximum, fallback = DEFAULT_CUSTOM_CONTEXT_WINDOW) {
  return Math.max(Math.min(MIN_CUSTOM_CONTEXT_WINDOW, maximum), Math.min(Number.isSafeInteger(value) ? value : fallback, maximum));
}
function contextModelGroups(models) {
  const groups = /* @__PURE__ */ new Map();
  for (const model of models ?? []) {
    if (model?.id === "gpt-5.3-codex-spark") {
      groups.set(model.id, {
        key: model.id,
        label: model.name ?? model.id,
        maximum: 128e3,
        fixed: true
      });
      continue;
    }
    const key = customContextModelKey(model?.id);
    if (!validModelKey(key)) continue;
    const maximum = modelContextMaximum(model);
    if (key !== "gpt-5.6") {
      groups.set(key, {
        key,
        label: model.name ?? model.id,
        maximum,
        ...Object.hasOwn(CUSTOM_CONTEXT_MODEL_FIELDS, key) ? {} : { default: clampModelContext(model.contextWindow, maximum) }
      });
      continue;
    }
    const variant = String(model.name ?? model.id).replace(/^GPT-5\.6[ -]/iu, "");
    const current = groups.get(key);
    groups.set(key, {
      key,
      label: `GPT-5.6 ${current === void 0 ? variant : `${current.label.replace(/^GPT-5\.6 /u, "")} / ${variant}`}`,
      maximum: Math.min(current?.maximum ?? maximum, maximum)
    });
  }
  return [...groups.values()];
}
var normalizeQuickQuotaMode = (value, legacyVisible = false) => [
  "off",
  "percent",
  "bar",
  "forecast"
].includes(value) ? value : legacyVisible === true ? QUICK_QUOTA_MODE_PERCENT : "off";
var supportsCodexFastMode = (modelId) => typeof modelId === "string" && (/^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === "gpt-5.4" || modelId === "gpt-6-astra");
var PREFERENCE_FIELDS = Object.freeze({
  [QUICK_QUOTA_MODE_FIELD]: {
    choices: [
      "off",
      QUICK_QUOTA_MODE_PERCENT,
      "bar",
      QUICK_QUOTA_MODE_FORECAST
    ],
    error: "Invalid quick quota preference"
  },
  [SEARCH_PROVIDER_FIELD]: {
    choices: [
      SEARCH_PROVIDER_AUTO,
      "dsh",
      SEARCH_PROVIDER_CODEX
    ],
    default: DEFAULT_SEARCH_PROVIDER,
    error: "Invalid search provider preference"
  },
  [SPEED_MODE_FIELD]: {
    choices: [SPEED_MODE_STANDARD, SPEED_MODE_FAST],
    default: DEFAULT_SPEED_MODE,
    error: "Invalid speed mode preference"
  },
  [OUTPUT_VERBOSITY_FIELD]: {
    choices: [
      OUTPUT_VERBOSITY_DEFAULT,
      "low",
      OUTPUT_VERBOSITY_MEDIUM,
      OUTPUT_VERBOSITY_HIGH
    ],
    default: DEFAULT_OUTPUT_VERBOSITY,
    error: "Invalid output verbosity preference"
  },
  [CONTEXT_MODE_FIELD]: {
    choices: [
      CONTEXT_MODE_STANDARD,
      CONTEXT_MODE_EXTENDED,
      CONTEXT_MODE_CUSTOM
    ],
    default: DEFAULT_CONTEXT_MODE,
    error: "Invalid context mode preference"
  }
});
var RPC_ENDPOINTS = Object.freeze([
  "status",
  "login/start",
  "login/status",
  "login/submit",
  "login/cancel",
  "logout",
  "account/select",
  "account/remove",
  "usage",
  "diagnostics",
  "preferences/status",
  "preferences/models",
  "preferences/update",
  "reset-credit/inspect",
  "reset-credit/prepare",
  "reset-credit/consume",
  "image/original/chunk"
]);
function registerSubscriptionTransport(connection, handler) {
  const disposers = [];
  try {
    for (const endpoint of RPC_ENDPOINTS) {
      const method = `codex-subscription/${endpoint}`;
      disposers.push(connection.fetch.register({
        path: `/api/${method}`,
        methods: ["POST"],
        requestBody: "buffered",
        async fetch(request2) {
          if (request2.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return new Response("content type must be application/json", { status: 415 });
          let body;
          try {
            body = await request2.json();
          } catch {
            return new Response("invalid JSON", { status: 400 });
          }
          const envelope = clientRequestSchema2.safeParse(body);
          if (!envelope.success || envelope.data.method !== method) return new Response("invalid RPC envelope", { status: 400 });
          let result2;
          try {
            request2.signal.throwIfAborted();
            result2 = await handler(endpoint, envelope.data.payload, request2.signal);
          } catch {
            result2 = {
              ok: false,
              error: {
                code: "internal",
                message: "Subscription request failed",
                details: { issues: [] }
              }
            };
          }
          return Response.json({
            type: "server-response",
            rpcId: envelope.data.rpcId,
            result: result2
          });
        }
      }));
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}
var VERSION = 1;
var DEFAULT_LABEL = "Account 1";
var clone$1 = (value) => value === void 0 ? void 0 : structuredClone(value);
var EMAIL_MAX_LENGTH = 254;
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
function normalizeAccountEmail(value) {
  if (typeof value !== "string") return void 0;
  const email = value.trim();
  return email.length > 0 && email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email) ? email : void 0;
}
function decodeJwtPayload(access) {
  if (typeof access !== "string") return void 0;
  const encoded = access.split(".")[1];
  if (typeof encoded !== "string" || encoded.length === 0) return void 0;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return;
  }
}
function emailFromAccessToken(access) {
  const payload = decodeJwtPayload(access);
  return normalizeAccountEmail(payload?.["https://api.openai.com/profile"]?.email ?? payload?.email);
}
function sanitizeOAuthCredential(value) {
  const credential = assertOAuthCredential$1(value);
  const email = emailFromAccessToken(credential.access) ?? normalizeAccountEmail(credential.email);
  if (email === void 0) {
    delete credential.email;
    return credential;
  }
  return {
    ...credential,
    email
  };
}
function assertOAuthCredential$1(value) {
  if (value === null || typeof value !== "object" || value.type !== "oauth" || typeof value.access !== "string" || value.access.length === 0 || typeof value.refresh !== "string" || value.refresh.length === 0 || typeof value.expires !== "number" || !Number.isFinite(value.expires)) throw new Error("Codex account vault received a malformed OAuth credential");
  return clone$1(value);
}
function parseOAuthCredential$1(value) {
  try {
    return assertOAuthCredential$1(JSON.parse(value));
  } catch (error) {
    if (error?.message === "Codex account vault received a malformed OAuth credential") throw error;
    throw new Error("Codex account vault contains malformed OAuth JSON", { cause: error });
  }
}
function normalizeLabel(value) {
  if (typeof value !== "string") throw new Error("Codex account label must be text");
  const label = value.trim().replace(/\s+/gu, " ");
  if (label.length === 0 || label.length > 48) throw new Error("Codex account label must contain 1 to 48 characters");
  return label;
}
function assertVaultRecord(record2) {
  if (record2?.kind !== "grant" || record2.payload?.version !== VERSION || typeof record2.payload.activeId !== "string" || !Array.isArray(record2.payload.accounts) || record2.payload.accounts.length === 0) throw new Error("Codex account vault contains a malformed grant record");
  const ids = /* @__PURE__ */ new Set();
  const accounts = record2.payload.accounts.map((account) => {
    if (account === null || typeof account !== "object" || typeof account.id !== "string" || account.id.length === 0 || ids.has(account.id)) throw new Error("Codex account vault contains a malformed account id");
    ids.add(account.id);
    return {
      id: account.id,
      label: normalizeLabel(account.label),
      credential: sanitizeOAuthCredential(account.credential)
    };
  });
  if (!ids.has(record2.payload.activeId)) throw new Error("Codex account vault active account is missing");
  const legacyAccountId = record2.payload.legacyAccountId;
  if (legacyAccountId !== void 0 && !ids.has(legacyAccountId)) throw new Error("Codex account vault legacy account is missing");
  return {
    version: VERSION,
    activeId: record2.payload.activeId,
    legacyAccountId,
    accounts
  };
}
var grant = (payload) => ({
  kind: "grant",
  payload
});
var PendingOAuthCredentialStore = class {
  #credential;
  async read(providerId) {
    if (providerId !== "openai-codex") throw new Error("Pending Codex login received an unknown provider");
    return clone$1(this.#credential);
  }
  async list() {
    return this.#credential === void 0 ? [] : [{
      providerId: "openai-codex",
      type: "oauth"
    }];
  }
  async modify(providerId, update) {
    if (providerId !== "openai-codex") throw new Error("Pending Codex login received an unknown provider");
    const next = await update(clone$1(this.#credential));
    if (next !== void 0) this.#credential = sanitizeOAuthCredential(next);
    return clone$1(this.#credential);
  }
  async delete(providerId) {
    if (providerId !== "openai-codex") throw new Error("Pending Codex login received an unknown provider");
    this.#credential = void 0;
  }
  credential() {
    return clone$1(this.#credential);
  }
};
var DshOAuthAccountVault = class {
  #tail = Promise.resolve();
  constructor(credentials, options) {
    if (credentials === void 0 || credentials === null || typeof credentials.readRecord !== "function" || typeof credentials.modifyRecord !== "function") throw new Error("Codex multi-account requires DSH credential records");
    this.credentials = credentials;
    this.key = options.key;
    this.legacyRef = options.legacyRef;
    this.legacyRefs = Object.freeze([...options.legacyRefs ?? []]);
    this.createId = options.createId ?? randomUUID3;
    this.onLegacySyncFailure = options.onLegacySyncFailure ?? (() => {
    });
  }
  #enqueue(operation) {
    const current = this.#tail.catch(() => void 0).then(operation);
    this.#tail = current.catch(() => void 0);
    return current;
  }
  async #legacyCredential() {
    for (const ref of [this.legacyRef, ...this.legacyRefs]) {
      const hit = await this.credentials.resolve(ref);
      if (hit?.value === void 0 || hit.value === "") continue;
      return {
        ref,
        credential: parseOAuthCredential$1(hit.value)
      };
    }
  }
  async #ensurePayload() {
    const existing = await this.credentials.readRecord(this.key);
    if (existing !== void 0) return assertVaultRecord(existing);
    const legacy = await this.#legacyCredential();
    if (legacy === void 0) return void 0;
    const id = this.createId();
    return assertVaultRecord(await this.credentials.modifyRecord(this.key, (current) => {
      if (current !== void 0) return Promise.resolve(current);
      return Promise.resolve(grant({
        version: VERSION,
        activeId: id,
        legacyAccountId: id,
        accounts: [{
          id,
          label: DEFAULT_LABEL,
          credential: legacy.credential
        }]
      }));
    }));
  }
  async #modifyPayload(update) {
    await this.#ensurePayload();
    let previousLegacy;
    const payload = assertVaultRecord(await this.credentials.modifyRecord(this.key, async (current) => {
      if (current === void 0) throw new Error("Codex account vault is not signed in");
      const payload2 = assertVaultRecord(current);
      previousLegacy = payload2.accounts.find((account) => account.id === payload2.legacyAccountId)?.credential;
      const next = await update(clone$1(payload2));
      return grant(next);
    }));
    const legacy = payload.accounts.find((account) => account.id === payload.legacyAccountId)?.credential;
    try {
      if (legacy === void 0) {
        if (previousLegacy !== void 0) await this.credentials.unset(this.legacyRef);
      } else if (JSON.stringify(legacy) !== JSON.stringify(previousLegacy)) await this.credentials.set(this.legacyRef, JSON.stringify(legacy));
    } catch {
      this.onLegacySyncFailure();
    }
    return payload;
  }
  list() {
    return this.#enqueue(async () => {
      const payload = await this.#ensurePayload();
      if (payload === void 0) return [];
      return payload.accounts.map((account) => ({
        id: account.id,
        label: account.label,
        active: account.id === payload.activeId,
        expiresAt: account.credential.expires,
        ...account.credential.email === void 0 ? {} : { email: account.credential.email }
      }));
    });
  }
  readActive() {
    return this.#enqueue(async () => {
      const payload = await this.#ensurePayload();
      return clone$1(payload?.accounts.find((account) => account.id === payload.activeId)?.credential);
    });
  }
  activeId() {
    return this.#enqueue(async () => (await this.#ensurePayload())?.activeId);
  }
  readById(id) {
    return this.#enqueue(async () => {
      const payload = await this.#ensurePayload();
      return clone$1(payload?.accounts.find((account) => account.id === id)?.credential);
    });
  }
  add(label, credential) {
    return this.#enqueue(async () => {
      const normalizedLabel = normalizeLabel(label);
      const validated = sanitizeOAuthCredential(credential);
      await this.#ensurePayload();
      const id = this.createId();
      const account = (await this.#modifyPayload((current) => ({
        ...current,
        activeId: id,
        accounts: [...current.accounts, {
          id,
          label: normalizedLabel,
          credential: validated
        }]
      }))).accounts.find((candidate) => candidate.id === id);
      return {
        id,
        label: account.label,
        active: true,
        expiresAt: account.credential.expires,
        ...account.credential.email === void 0 ? {} : { email: account.credential.email }
      };
    });
  }
  select(id) {
    return this.#enqueue(async () => {
      await this.#modifyPayload((current) => {
        if (!current.accounts.some((account) => account.id === id)) throw new Error("Unknown Codex account");
        return {
          ...current,
          activeId: id,
          legacyAccountId: id
        };
      });
    });
  }
  modifyActive(update) {
    return this.#enqueue(async () => {
      if (await this.#ensurePayload() === void 0) {
        const initial = await update(void 0);
        if (initial === void 0) return void 0;
        const credential = sanitizeOAuthCredential(initial);
        await this.credentials.set(this.legacyRef, JSON.stringify(credential));
        await this.#ensurePayload();
        return clone$1(credential);
      }
      let result2;
      await this.#modifyPayload(async (current) => {
        const index = current.accounts.findIndex((account) => account.id === current.activeId);
        const previous = clone$1(current.accounts[index].credential);
        const next = await update(previous);
        if (next === void 0) {
          result2 = previous;
          return current;
        }
        const credential = sanitizeOAuthCredential(next);
        if (credential.email === void 0 && previous.email !== void 0) credential.email = previous.email;
        const accounts = [...current.accounts];
        accounts[index] = {
          ...accounts[index],
          credential
        };
        result2 = clone$1(credential);
        return {
          ...current,
          accounts
        };
      });
      return result2;
    });
  }
  deleteAll() {
    return this.#enqueue(async () => {
      await this.credentials.deleteRecord(this.key);
      await this.credentials.unset(this.legacyRef);
      for (const ref of this.legacyRefs) await this.credentials.unset(ref);
    });
  }
  remove(id) {
    return this.#enqueue(async () => {
      await this.#modifyPayload((current) => {
        if (!current.accounts.some((account) => account.id === id)) throw new Error("Unknown Codex account");
        if (current.accounts.length === 1) throw new Error("Cannot remove the last account; sign out instead");
        const accounts = current.accounts.filter((account) => account.id !== id);
        return {
          ...current,
          activeId: current.activeId === id ? accounts[0].id : current.activeId,
          legacyAccountId: current.legacyAccountId === id ? void 0 : current.legacyAccountId,
          accounts
        };
      });
    });
  }
};
var PROVIDER$1 = "openai-codex";
var abortIfNeeded = (options) => options?.signal?.throwIfAborted();
var clone = (value) => value === void 0 ? void 0 : structuredClone(value);
function assertProvider(providerId) {
  if (providerId !== PROVIDER$1) throw new Error(`Codex credential store does not own provider ${JSON.stringify(providerId)}`);
}
function assertOAuthCredential(value) {
  if (value === void 0) return void 0;
  if (value === null || typeof value !== "object" || value.type !== "oauth" || typeof value.access !== "string" || value.access.length === 0 || typeof value.refresh !== "string" || value.refresh.length === 0 || typeof value.expires !== "number" || !Number.isFinite(value.expires)) throw new Error("Codex credential store received a malformed OAuth credential");
  return clone(value);
}
function parseOAuthCredential(value) {
  try {
    return assertOAuthCredential(JSON.parse(value));
  } catch (error) {
    if (error?.message === "Codex credential store received a malformed OAuth credential") throw error;
    throw new Error("Codex credential store contains malformed OAuth JSON", { cause: error });
  }
}
var DshOAuthCredentialStore = class {
  #chains = /* @__PURE__ */ new Map();
  constructor(credentials, ref, legacyRefs = [], options = {}) {
    if (credentials === void 0 || credentials === null) throw new Error("Codex OAuth requires the DSH credentials service");
    const expirySkewMs = options.expirySkewMs ?? 0;
    if (!Number.isFinite(expirySkewMs) || expirySkewMs < 0) throw new Error("Codex OAuth expiry skew must be a non-negative finite number");
    this.credentials = credentials;
    this.ref = ref;
    this.legacyRefs = Object.freeze([...legacyRefs]);
    this.expirySkewMs = expirySkewMs;
    this.vault = options.vault;
  }
  #enqueue(providerId, operation, options) {
    assertProvider(providerId);
    const current = (this.#chains.get(providerId) ?? Promise.resolve()).catch(() => void 0).then(async () => {
      abortIfNeeded(options);
      return operation();
    });
    const tail = current.catch(() => void 0);
    this.#chains.set(providerId, tail);
    tail.finally(() => {
      if (this.#chains.get(providerId) === tail) this.#chains.delete(providerId);
    });
    return current;
  }
  async #read(providerId, options) {
    assertProvider(providerId);
    abortIfNeeded(options);
    if (this.vault !== void 0) {
      const current = await this.vault.readActive();
      if (current === void 0) return void 0;
      return this.expirySkewMs === 0 ? current : {
        ...current,
        expires: current.expires - this.expirySkewMs
      };
    }
    let hit = await this.credentials.resolve(this.ref);
    if (hit?.value === void 0 || hit.value === "") for (const legacyRef of this.legacyRefs) {
      const legacy = await this.credentials.resolve(legacyRef);
      if (legacy?.value === void 0 || legacy.value === "") continue;
      const migrated = parseOAuthCredential(legacy.value);
      await this.credentials.set(this.ref, JSON.stringify(migrated));
      await this.credentials.unset(legacyRef);
      hit = { value: JSON.stringify(migrated) };
      break;
    }
    abortIfNeeded(options);
    if (hit?.value === void 0 || hit.value === "") return void 0;
    const credential = parseOAuthCredential(hit.value);
    return this.expirySkewMs === 0 ? credential : {
      ...credential,
      expires: credential.expires - this.expirySkewMs
    };
  }
  read(providerId, options) {
    return this.#enqueue(providerId, () => this.#read(providerId, options), options);
  }
  async list(options) {
    abortIfNeeded(options);
    return await this.read(PROVIDER$1, options) === void 0 ? [] : [{
      providerId: PROVIDER$1,
      type: "oauth"
    }];
  }
  modify(providerId, update, options) {
    return this.#enqueue(providerId, async () => {
      if (this.vault !== void 0) {
        const next2 = await this.vault.modifyActive(async (current2) => {
          const visible = current2 === void 0 || this.expirySkewMs === 0 ? current2 : {
            ...current2,
            expires: current2.expires - this.expirySkewMs
          };
          const updated = await update(clone(visible));
          return updated === void 0 ? void 0 : assertOAuthCredential(updated);
        });
        abortIfNeeded(options);
        return clone(next2);
      }
      const current = await this.#read(providerId, options);
      const next = await update(clone(current));
      abortIfNeeded(options);
      if (next === void 0) return current;
      const validated = assertOAuthCredential(next);
      await this.credentials.set(this.ref, JSON.stringify(validated));
      for (const legacyRef of this.legacyRefs) await this.credentials.unset(legacyRef);
      abortIfNeeded(options);
      return clone(validated);
    }, options);
  }
  delete(providerId, options) {
    return this.#enqueue(providerId, async () => {
      if (this.vault !== void 0) {
        await this.vault.deleteAll();
        abortIfNeeded(options);
        return;
      }
      await this.credentials.unset(this.ref);
      for (const legacyRef of this.legacyRefs) await this.credentials.unset(legacyRef);
      abortIfNeeded(options);
    }, options);
  }
};
function createCodexAuthService(models, store, options = {}) {
  const runLogin = options.runLogin ?? ((run) => run());
  const accountVault = options.accountVault;
  const createLoginModels = options.createLoginModels;
  const createPendingStore = options.createPendingStore ?? (() => new PendingOAuthCredentialStore());
  return Object.freeze({
    async status(options2) {
      const current = await store.read(PROVIDER$1, options2);
      const accounts = await accountVault?.list();
      if (current === void 0) return {
        authenticated: false,
        provider: PROVIDER$1,
        ...accounts === void 0 ? {} : { accounts }
      };
      return {
        authenticated: true,
        provider: PROVIDER$1,
        type: "oauth",
        expiresAt: current.expires,
        ...accounts === void 0 ? {} : { accounts }
      };
    },
    login(interaction, input = {}) {
      if (input.label !== void 0) {
        if (accountVault === void 0 || createLoginModels === void 0) throw new Error("Codex multi-account is unavailable");
        return runLogin(async () => {
          const pending = createPendingStore();
          await createLoginModels(pending).login(PROVIDER$1, "oauth", interaction);
          const credential = pending.credential();
          if (credential === void 0) throw new Error("Codex login did not return credentials");
          await accountVault.add(input.label, credential);
        });
      }
      return runLogin(() => models.login(PROVIDER$1, "oauth", interaction));
    },
    async select(id) {
      if (accountVault === void 0) throw new Error("Codex multi-account is unavailable");
      await accountVault.select(id);
      return this.status();
    },
    async remove(id) {
      if (accountVault === void 0) throw new Error("Codex multi-account is unavailable");
      await accountVault.remove(id);
      return this.status();
    },
    logout(options2) {
      return models.logout(PROVIDER$1, options2);
    }
  });
}
var OPENAI_AUTH_ORIGIN = "https://auth.openai.com";
function assertCodexAuthUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Codex auth URL is invalid");
  }
  if (url.protocol !== "https:") throw new Error("Codex auth URL must use HTTPS");
  if (url.origin !== OPENAI_AUTH_ORIGIN || url.username !== "" || url.password !== "") throw new Error("Codex auth URL must use the OpenAI auth origin");
  return url.href;
}
function commandForCodexAuthUrl(value, platform = process.platform) {
  const url = assertCodexAuthUrl(value);
  if (platform === "win32") return {
    file: "rundll32.exe",
    args: ["url.dll,FileProtocolHandler", url],
    shell: false
  };
  if (platform === "darwin") return {
    file: "open",
    args: [url],
    shell: false
  };
  if (platform === "linux") return {
    file: "xdg-open",
    args: [url],
    shell: false
  };
  throw new Error(`Codex auth URL opener is unsupported on ${platform}`);
}
function openCodexAuthUrl(value, options = {}) {
  const command = commandForCodexAuthUrl(value, options.platform);
  const spawnProcess = options.spawn ?? spawn2;
  return new Promise((resolve3, reject) => {
    const child = spawnProcess(command.file, command.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: command.shell
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve3();
    });
  });
}
var LOGIN_METHODS = /* @__PURE__ */ new Set(["browser", "device_code"]);
var TERMINAL_PHASES = /* @__PURE__ */ new Set([
  "authenticated",
  "failed",
  "cancelled"
]);
var publicClone = (value) => structuredClone(value);
var asObject = (value) => value !== null && typeof value === "object" ? value : {};
var ok = (value) => ({
  ok: true,
  value
});
var badRequest2 = (message) => ({
  ok: false,
  error: {
    code: "bad-request",
    message,
    details: { issues: [] }
  }
});
var accountStatusError = (message) => ({
  ok: false,
  error: {
    code: "internal",
    message,
    details: { issues: [] }
  }
});
var classifyAccountStatusError = (error) => {
  const message = error instanceof Error ? error.message : "";
  if (/malformed (?:OAuth|grant|account vault)|received a malformed OAuth|contains malformed OAuth/iu.test(message)) return ["credential-malformed", "Codex account credentials are malformed"];
  if (/credential|account vault|readRecord|credential store|credentials service/iu.test(message)) return ["credential-unavailable", "Codex account credentials are unavailable"];
  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  if (error?.name === "TimeoutError" || [
    "TIMEOUT",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT"
  ].includes(code)) return ["transport", "Codex account status service is unavailable"];
  if ([
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "NETWORK",
    "NETWORK_ERROR",
    "TRANSPORT"
  ].includes(code) || error?.name === "NetworkError") return ["transport", "Codex account status service is unavailable"];
  return ["unknown", "Could not read Codex account status"];
};
var deferred = () => {
  let resolve3;
  let reject;
  return {
    promise: new Promise((onResolve, onReject) => {
      resolve3 = onResolve;
      reject = onReject;
    }),
    resolve: resolve3,
    reject
  };
};
var publicPrompt = (prompt) => ({
  type: prompt.type,
  message: String(prompt.message ?? ""),
  ...typeof prompt.placeholder === "string" ? { placeholder: prompt.placeholder } : {}
});
function classifyLoginFailure(error) {
  const message = error instanceof Error ? error.message : "";
  if (/token exchange failed/iu.test(message)) return "token-exchange";
  if (/fetch failed|\b(?:ECONN|ENOTFOUND|ETIMEDOUT|CERT_|socket|network)\b/iu.test(message)) return "network";
  if (/extract accountId|account[_ -]?id/iu.test(message)) return "account-claim";
  if (/credential|credentials-local|OAuth JSON/iu.test(message)) return "credential-store";
  if (/Missing authorization code|State mismatch|callback/iu.test(message)) return "callback";
  return "provider";
}
var CodexLoginCoordinator = class {
  #sessions = /* @__PURE__ */ new Map();
  #activeId;
  constructor(auth, options = {}) {
    this.auth = auth;
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }
  async accountStatus(options) {
    return publicClone(await this.auth.status(options));
  }
  supportState() {
    const active = this.#activeId === void 0 ? void 0 : this.#sessions.get(this.#activeId);
    if (active === void 0) return { phase: "idle" };
    return {
      method: active.view.method,
      phase: active.view.phase,
      ...active.view.phase === "failed" ? { failure: classifyLoginFailure(active.hostError) } : {}
    };
  }
  async start({ method, label }) {
    if (!LOGIN_METHODS.has(method)) throw new Error(`unsupported Codex login method: ${String(method)}`);
    if (label !== void 0 && (typeof label !== "string" || label.trim().length === 0 || label.trim().length > 48)) throw new Error("unsupported Codex account label");
    const active = this.#activeId === void 0 ? void 0 : this.#sessions.get(this.#activeId);
    if (active !== void 0 && !TERMINAL_PHASES.has(active.view.phase)) {
      active.view = {
        id: active.view.id,
        provider: "openai-codex",
        method: active.view.method,
        phase: "cancelled",
        authenticated: false
      };
      active.controller.abort(/* @__PURE__ */ new Error("Codex login replaced by a new attempt"));
    }
    if (active !== void 0) this.#sessions.delete(active.view.id);
    const id = this.createId();
    const ready = deferred();
    const controller = new AbortController();
    const session = {
      controller,
      prompt: void 0,
      ready,
      view: {
        id,
        provider: "openai-codex",
        method,
        phase: "starting",
        authenticated: false
      }
    };
    this.#sessions.set(id, session);
    this.#activeId = id;
    const publishReady = () => ready.resolve(publicClone(session.view));
    const interaction = {
      signal: controller.signal,
      prompt: async (prompt) => {
        controller.signal.throwIfAborted();
        if (prompt.type === "select") return method;
        if (![
          "manual_code",
          "text",
          "secret"
        ].includes(prompt.type)) throw new Error(`unsupported Codex auth prompt: ${String(prompt.type)}`);
        const answer = deferred();
        session.prompt = answer;
        session.view = {
          ...session.view,
          phase: "waiting_input",
          prompt: publicPrompt(prompt)
        };
        const abortPrompt = () => answer.reject(controller.signal.reason ?? /* @__PURE__ */ new Error("login cancelled"));
        controller.signal.addEventListener("abort", abortPrompt, { once: true });
        prompt.signal?.addEventListener("abort", abortPrompt, { once: true });
        publishReady();
        try {
          return await answer.promise;
        } finally {
          controller.signal.removeEventListener("abort", abortPrompt);
          prompt.signal?.removeEventListener("abort", abortPrompt);
          if (session.prompt === answer) session.prompt = void 0;
        }
      },
      notify: (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "auth_url") session.view = {
          ...session.view,
          phase: "waiting_browser",
          authUrl: assertCodexAuthUrl(event.url),
          ...typeof event.instructions === "string" ? { instructions: event.instructions } : {}
        };
        else if (event.type === "device_code") session.view = {
          ...session.view,
          phase: "waiting_device",
          deviceCode: {
            userCode: event.userCode,
            verificationUri: assertCodexAuthUrl(event.verificationUri),
            ...typeof event.intervalSeconds === "number" ? { intervalSeconds: event.intervalSeconds } : {},
            ...typeof event.expiresInSeconds === "number" ? { expiresInSeconds: event.expiresInSeconds } : {}
          }
        };
        else session.view = {
          ...session.view,
          message: String(event.message ?? "")
        };
        publishReady();
      }
    };
    session.run = Promise.resolve().then(() => this.auth.login(interaction, label === void 0 ? {} : { label: label.trim() })).then(async () => {
      if (controller.signal.aborted) return;
      const status = await this.auth.status();
      session.view = {
        id,
        provider: "openai-codex",
        method,
        phase: "authenticated",
        authenticated: status.authenticated === true,
        ...typeof status.expiresAt === "number" ? { expiresAt: status.expiresAt } : {}
      };
    }).catch(async (error) => {
      if (controller.signal.aborted) {
        session.view = {
          id,
          provider: "openai-codex",
          method,
          phase: "cancelled",
          authenticated: false
        };
        return;
      }
      try {
        if (label !== void 0) throw error;
        const status = await this.auth.status();
        if (status.authenticated === true) {
          session.view = {
            id,
            provider: "openai-codex",
            method,
            phase: "authenticated",
            authenticated: true,
            ...typeof status.expiresAt === "number" ? { expiresAt: status.expiresAt } : {}
          };
          return;
        }
      } catch {
      }
      session.view = {
        id,
        provider: "openai-codex",
        method,
        phase: "failed",
        authenticated: false,
        error: "Codex login failed"
      };
      session.hostError = error;
    }).finally(publishReady);
    return ready.promise;
  }
  read(id) {
    const session = this.#sessions.get(id);
    if (session === void 0) throw new Error("unknown Codex login");
    return publicClone(session.view);
  }
  async submit({ id, value }) {
    const session = this.#sessions.get(id);
    if (session === void 0) throw new Error("unknown Codex login");
    if (session.prompt === void 0 || session.view.phase !== "waiting_input") throw new Error("Codex login is not waiting for input");
    if (typeof value !== "string" || value.trim() === "") throw new Error("Codex login input is empty");
    const answer = session.prompt;
    session.prompt = void 0;
    session.view = {
      ...session.view,
      phase: session.view.authUrl === void 0 ? "starting" : "waiting_browser",
      prompt: void 0
    };
    answer.resolve(value);
    return this.read(id);
  }
  async cancel(id) {
    const session = this.#sessions.get(id);
    if (session === void 0) throw new Error("unknown Codex login");
    if (!TERMINAL_PHASES.has(session.view.phase)) {
      session.view = {
        id,
        provider: "openai-codex",
        method: session.view.method,
        phase: "cancelled",
        authenticated: false
      };
      session.controller.abort(/* @__PURE__ */ new Error("Codex login cancelled"));
    }
    return this.read(id);
  }
  async logout(options) {
    if (this.#activeId !== void 0) {
      const active = this.#sessions.get(this.#activeId);
      if (active !== void 0 && !TERMINAL_PHASES.has(active.view.phase)) await this.cancel(active.view.id);
    }
    await this.auth.logout(options);
    return this.accountStatus(options);
  }
  async selectAccount(id) {
    return publicClone(await this.auth.select(id));
  }
  async removeAccount(id) {
    return publicClone(await this.auth.remove(id));
  }
};
function createCodexRpcHandler(coordinator, options = {}) {
  const openExternal = options.openExternal;
  return async (endpoint, payload, signal) => {
    try {
      signal.throwIfAborted();
      const input = asObject(payload);
      if (endpoint === "status") try {
        return ok(await coordinator.accountStatus({ signal }));
      } catch (error) {
        if (signal.aborted) throw error;
        const [, message] = classifyAccountStatusError(error);
        return accountStatusError(message);
      }
      if (endpoint === "login/start") {
        const started = await coordinator.start({
          method: input.method,
          label: input.label
        });
        if (input.openExternal !== true) return ok(started);
        const url = started.authUrl ?? started.deviceCode?.verificationUri;
        if (typeof url !== "string" || openExternal === void 0) return ok({
          ...started,
          externalOpened: false
        });
        try {
          await openExternal(url);
          return ok({
            ...started,
            externalOpened: true
          });
        } catch {
          return ok({
            ...started,
            externalOpened: false
          });
        }
      }
      if (endpoint === "login/status") return ok(coordinator.read(input.id));
      if (endpoint === "login/submit") return ok(await coordinator.submit({
        id: input.id,
        value: input.value
      }));
      if (endpoint === "login/cancel") return ok(await coordinator.cancel(input.id));
      if (endpoint === "logout") return ok(await coordinator.logout({ signal }));
      if (endpoint === "account/select") return ok(await coordinator.selectAccount(input.id));
      if (endpoint === "account/remove") return ok(await coordinator.removeAccount(input.id));
      return badRequest2(`unknown Codex auth endpoint: ${endpoint}`);
    } catch (error) {
      if (signal.aborted) throw error;
      const message = error instanceof Error && /^(unknown|unsupported|a Codex|Codex login)/.test(error.message) ? error.message : "Codex request failed";
      return badRequest2(message);
    }
  };
}
var execFileAsync = promisify(execFile);
var CODEX_AUTH_HOST = "auth.openai.com";
var CODEX_HOSTS = /* @__PURE__ */ new Set([CODEX_AUTH_HOST, "chatgpt.com"]);
var networkScope = new AsyncLocalStorage();
var activeScopes = 0;
var baseFetch;
var scopedFetch;
function normalizeProxy(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return void 0;
  const value = raw.trim().includes("://") ? raw.trim() : `http://${raw.trim()}`;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.hostname === "") return void 0;
    return url.toString();
  } catch {
    return;
  }
}
function bypassesProxy(hostname, port, rawNoProxy) {
  if (typeof rawNoProxy !== "string" || rawNoProxy.trim() === "") return false;
  return rawNoProxy.split(/[\s,]+/u).some((raw) => {
    const entry = raw.trim().toLowerCase();
    if (entry === "*") return true;
    if (entry === "") return false;
    const match = /^(.*?)(?::(\d+))?$/u.exec(entry);
    const host = match?.[1]?.replace(/^\./u, "");
    const entryPort = match?.[2];
    if (!host || entryPort && entryPort !== port) return false;
    return hostname === host || hostname.endsWith(`.${host}`);
  });
}
function proxyFromEnvironment(env = process.env, target = new URL(`https://${CODEX_AUTH_HOST}/`)) {
  if (bypassesProxy(target.hostname.toLowerCase(), target.port || "443", env.NO_PROXY ?? env.no_proxy)) return void 0;
  return normalizeProxy(env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy);
}
function selectWindowsProxy(value) {
  if (typeof value !== "string") return void 0;
  const entries = value.split(";").map((item) => item.trim()).filter(Boolean);
  const https = entries.find((item) => /^https=/iu.test(item));
  const http = entries.find((item) => /^http=/iu.test(item));
  const selected = (https ?? http ?? entries.find((item) => !item.includes("=")))?.replace(/^[^=]+=/u, "");
  return normalizeProxy(selected);
}
async function windowsSystemProxy(options = {}) {
  const run = options.execFile ?? execFileAsync;
  const reg = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\reg.exe`;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  try {
    const enabled = await run(reg, [
      "query",
      key,
      "/v",
      "ProxyEnable"
    ], {
      windowsHide: true,
      encoding: "utf8"
    });
    if (!/REG_DWORD\s+0x1\b/iu.test(enabled.stdout)) return void 0;
    const configured = await run(reg, [
      "query",
      key,
      "/v",
      "ProxyServer"
    ], {
      windowsHide: true,
      encoding: "utf8"
    });
    return selectWindowsProxy(/^\s*ProxyServer\s+REG_\w+\s+(.+)$/imu.exec(configured.stdout)?.[1]);
  } catch {
    return;
  }
}
async function macSystemProxy(options = {}) {
  const run = options.execFile ?? execFileAsync;
  try {
    const result2 = await run("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8" });
    if (!/^\s*HTTPSEnable\s*:\s*1\s*$/imu.test(result2.stdout)) return void 0;
    const host = /^\s*HTTPSProxy\s*:\s*(\S+)\s*$/imu.exec(result2.stdout)?.[1];
    const port = /^\s*HTTPSPort\s*:\s*(\d+)\s*$/imu.exec(result2.stdout)?.[1];
    return normalizeProxy(host && port ? `${host}:${port}` : void 0);
  } catch {
    return;
  }
}
async function resolveCodexProxy(options = {}) {
  const target = options.target ?? new URL(`https://${CODEX_AUTH_HOST}/`);
  const env = options.env ?? process.env;
  if (bypassesProxy(target.hostname.toLowerCase(), target.port || "443", env.NO_PROXY ?? env.no_proxy)) return {
    url: void 0,
    source: "bypass"
  };
  const envProxy = proxyFromEnvironment(env, target);
  if (envProxy) return {
    url: envProxy,
    source: "environment"
  };
  const platform = options.platform ?? process.platform;
  const system = platform === "win32" ? await windowsSystemProxy(options) : platform === "darwin" ? await macSystemProxy(options) : void 0;
  return system ? {
    url: system,
    source: "system"
  } : {
    url: void 0,
    source: "direct"
  };
}
function bodyBytes(body) {
  if (body === void 0 || body === null) return void 0;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new TypeError("Unsupported Codex OAuth request body");
}
function fetchThroughProxy(input, init, proxyUrl) {
  const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const body = bodyBytes(init?.body);
  const headers = new Headers(init?.headers);
  if (body && !headers.has("content-length")) headers.set("content-length", String(body.byteLength));
  return new Promise((resolve3, reject) => {
    const request$1 = request(target, {
      method: init?.method ?? "GET",
      headers: Object.fromEntries(headers.entries()),
      agent: new HttpsProxyAgent(proxyUrl),
      signal: init?.signal
    }, (response) => {
      const responseHeaders = new Headers();
      for (const [name2, value] of Object.entries(response.headers)) if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name2, item));
      else if (value !== void 0) responseHeaders.set(name2, value);
      const status = response.statusCode ?? 500;
      const empty = init?.method === "HEAD" || [
        204,
        205,
        304
      ].includes(status);
      resolve3(new Response(empty ? null : Readable2.toWeb(response), {
        status,
        statusText: response.statusMessage,
        headers: responseHeaders
      }));
    });
    request$1.on("error", reject);
    if (body) request$1.write(body);
    request$1.end();
  });
}
async function withCodexNetwork(run, options = {}) {
  if (activeScopes === 0) {
    baseFetch = globalThis.fetch;
    scopedFetch = async (input, init) => {
      const scope2 = networkScope.getStore();
      if (scope2 === void 0) return baseFetch(input, init);
      const { options: scopedOptions, allowedHosts, resolved } = scope2;
      const proxyFetch = scopedOptions.fetchThroughProxy ?? fetchThroughProxy;
      const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (target.protocol !== "https:" || !allowedHosts.has(target.hostname)) return baseFetch(input, init);
      let proxy = resolved.get(target.hostname);
      if (proxy === void 0) {
        proxy = resolveCodexProxy({
          ...scopedOptions,
          target
        });
        resolved.set(target.hostname, proxy);
      }
      const route = await proxy;
      scopedOptions.onRoute?.(route.source);
      return route.url === void 0 ? baseFetch(input, init) : proxyFetch(input, init, route.url);
    };
    globalThis.fetch = scopedFetch;
  }
  activeScopes += 1;
  const scope = {
    options,
    allowedHosts: options.hosts ?? CODEX_HOSTS,
    resolved: /* @__PURE__ */ new Map()
  };
  try {
    return await networkScope.run(scope, run);
  } finally {
    activeScopes -= 1;
    if (activeScopes === 0) {
      if (globalThis.fetch === scopedFetch) globalThis.fetch = baseFetch;
      baseFetch = void 0;
      scopedFetch = void 0;
    }
  }
}
function classifyTransportError(error) {
  const name2 = error?.name;
  const code = String(error?.code ?? error?.cause?.code ?? "");
  if (name2 === "AbortError" || name2 === "TimeoutError" || /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/u.test(code)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN/u.test(code)) return "dns";
  if (/CERT_|TLS|SSL/u.test(code)) return "tls";
  if (/ECONN|EPIPE|UND_ERR_SOCKET/u.test(code)) return "connection";
  return "network";
}
var elapsedBucket = (elapsed) => elapsed < 1e3 ? "under-1s" : elapsed < 5e3 ? "1-5s" : elapsed < 15e3 ? "5-15s" : "over-15s";
function createCodexNetworkTransport(options = {}) {
  const attempts = /* @__PURE__ */ new Map();
  const now = options.now ?? Date.now;
  const run = async (area, operation) => {
    const startedAt = now();
    let route = attempts.get(area)?.route ?? "direct";
    let routed = false;
    try {
      const value = await withCodexNetwork(operation, {
        ...options,
        onRoute: (source) => {
          route = source;
          routed = true;
        }
      });
      if (value instanceof Response && !value.ok) attempts.set(area, {
        status: "failed",
        stage: "http",
        code: "http-error",
        httpStatus: value.status,
        route,
        elapsed: elapsedBucket(now() - startedAt)
      });
      else if (routed || value instanceof Response) attempts.set(area, {
        status: "ok",
        route,
        elapsed: elapsedBucket(now() - startedAt)
      });
      return value;
    } catch (error) {
      if (routed) attempts.set(area, {
        status: "failed",
        stage: "transport",
        code: classifyTransportError(error),
        route,
        elapsed: elapsedBucket(now() - startedAt)
      });
      throw error;
    }
  };
  return Object.freeze({
    run,
    fetch: (area, input, init) => run(area, () => globalThis.fetch(input, init)),
    snapshot: () => Object.fromEntries([...attempts].map(([area, value]) => [area, { ...value }]))
  });
}
var FAST_SERVICE_TIER = "priority";
function openaiCodexSubscriptionProvider({ resolveSpeedMode = () => void 0, resolveOutputVerbosity = () => OUTPUT_VERBOSITY_DEFAULT, resolveContextMode = () => void 0, resolveCustomContextWindow = () => void 0, catalog, runNetwork = (_area, operation) => operation() } = {}) {
  const provider = createOpenAICodexProvider();
  const requestToken = Object.freeze({
    name: "DSH-managed Codex OAuth request token",
    async resolve({ credential }) {
      const token = credential?.type === "api_key" ? credential.key : void 0;
      if (typeof token !== "string" || token.length === 0) return void 0;
      return {
        auth: { apiKey: token },
        source: "DSH-managed OAuth request"
      };
    }
  });
  const modelMetadata = (model) => catalog?.metadata(model?.id);
  const supportsVerbosity = (model) => modelMetadata(model)?.supportVerbosity ?? model?.id !== "gpt-5.3-codex-spark";
  const withPreferences = (model, options = {}) => {
    const metadata = modelMetadata(model);
    const requestedVerbosity = resolveOutputVerbosity();
    const textVerbosity = supportsVerbosity(model) ? requestedVerbosity === "default" ? metadata?.defaultVerbosity ?? "medium" : requestedVerbosity : void 0;
    const fast = resolveSpeedMode() === "fast" && (metadata?.supportsFast ?? supportsCodexFastMode(model?.id));
    const onPayload = options.onPayload;
    return {
      ...options,
      ...textVerbosity === void 0 ? {} : { textVerbosity },
      ...fast ? { serviceTier: FAST_SERVICE_TIER } : {},
      async onPayload(payload, requestModel) {
        const preferred = {
          ...payload,
          ...textVerbosity === void 0 ? {} : { text: {
            ...payload.text ?? {},
            verbosity: textVerbosity
          } },
          ...fast ? { service_tier: FAST_SERVICE_TIER } : {}
        };
        const next = await onPayload?.(preferred, requestModel);
        return {
          ...next ?? preferred,
          ...textVerbosity === void 0 ? {} : { text: {
            ...(next ?? preferred).text ?? {},
            verbosity: textVerbosity
          } },
          ...fast ? { service_tier: FAST_SERVICE_TIER } : {}
        };
      }
    };
  };
  const getModels = () => (catalog?.getModels(provider.getModels()) ?? provider.getModels()).map((model) => {
    const maximum = modelContextMaximum(model);
    const mode = resolveContextMode();
    if (model.id === "gpt-5.3-codex-spark" || !["extended", "custom"].includes(mode)) return model;
    if (mode === "extended") {
      const contextWindow = maximum;
      return {
        ...model,
        contextWindow
      };
    }
    const requested = clampModelContext(resolveCustomContextWindow(customContextModelKey(model.id)), maximum, model.contextWindow);
    return {
      ...model,
      contextWindow: requested
    };
  });
  const networkIterable = (factory) => {
    let iterator;
    const getIterator = () => iterator ??= factory()[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: (value) => runNetwork("model", () => getIterator().next(value)),
      return: (value) => runNetwork("model", () => getIterator().return?.(value) ?? Promise.resolve({
        done: true,
        value
      })),
      throw: (error) => runNetwork("model", () => getIterator().throw?.(error) ?? Promise.reject(error))
    };
  };
  return Object.freeze({
    ...provider,
    auth: Object.freeze({
      ...provider.auth,
      apiKey: requestToken
    }),
    getModels,
    stream: (model, context, options) => networkIterable(() => provider.stream(model, context, withPreferences(model, options))),
    streamSimple: (model, context, options) => networkIterable(() => provider.streamSimple(model, context, withPreferences(model, options)))
  });
}
var PACKAGE_VERSION = "2.0.1";
var USER_AGENT = `dsh-codex-subscription/${PACKAGE_VERSION}`;
var CODEX_MODELS_URL = `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(PACKAGE_VERSION)}`;
var LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
var DEFAULT_REFRESH_TIMEOUT_MS = 1e4;
var record$4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var nonEmpty$2 = (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
var positiveInteger$1 = (value) => Number.isSafeInteger(value) && value > 0 ? value : void 0;
function reasoningMap(levels) {
  const supported = new Set((Array.isArray(levels) ? levels : []).map((level) => nonEmpty$2(record$4(level) ? level.effort : void 0)).filter(Boolean));
  const map = Object.fromEntries(LEVELS.map((level) => [level, null]));
  if (supported.has("none")) map.off = "none";
  for (const level of LEVELS.slice(1)) if (supported.has(level)) map[level] = level;
  return map;
}
function visibleModel(value) {
  if (!record$4(value)) return void 0;
  const id = nonEmpty$2(value.slug);
  if (id === void 0 || value.visibility !== "list") return void 0;
  const supported = Array.isArray(value.supported_reasoning_levels) ? value.supported_reasoning_levels : [];
  const input = Array.isArray(value.input_modalities) ? value.input_modalities.filter((item) => ["text", "image"].includes(item)) : ["text", "image"];
  return {
    id,
    name: nonEmpty$2(value.display_name) ?? id,
    description: nonEmpty$2(value.description),
    priority: Number.isFinite(value.priority) ? value.priority : 0,
    input: input.length > 0 ? input : ["text"],
    contextWindow: positiveInteger$1(value.context_window) ?? positiveInteger$1(value.max_context_window),
    ...positiveInteger$1(value.max_context_window) === void 0 ? {} : { maxContextWindow: value.max_context_window },
    reasoning: supported.length > 0,
    thinkingLevelMap: reasoningMap(supported),
    supportVerbosity: value.support_verbosity === true,
    defaultVerbosity: [
      "low",
      "medium",
      "high"
    ].includes(value.default_verbosity) ? value.default_verbosity : void 0,
    supportsFast: [...Array.isArray(value.additional_speed_tiers) ? value.additional_speed_tiers : [], ...Array.isArray(value.service_tiers) ? value.service_tiers.map((tier) => tier?.id) : []].some((tier) => tier === "fast" || tier === "priority")
  };
}
function parseOfficialModelCatalog(value) {
  if (!record$4(value) || !Array.isArray(value.models)) throw new Error("Codex returned a malformed model catalog");
  const seen = /* @__PURE__ */ new Set();
  return value.models.map(visibleModel).filter((model) => model !== void 0 && !seen.has(model.id) && seen.add(model.id)).sort((left, right) => right.priority - left.priority);
}
function mergeModel(baseModels, remote) {
  const base = baseModels.find((model) => model.id === remote.id) ?? baseModels.find((model) => model.id !== "gpt-5.3-codex-spark") ?? baseModels[0];
  if (base === void 0) return void 0;
  return {
    ...base,
    id: remote.id,
    name: remote.name,
    input: remote.input,
    reasoning: remote.reasoning,
    thinkingLevelMap: remote.thinkingLevelMap,
    ...remote.contextWindow === void 0 ? {} : { contextWindow: remote.contextWindow },
    ...remote.maxContextWindow === void 0 ? {} : { maxContextWindow: remote.maxContextWindow },
    ...base.id === remote.id ? {} : { cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    } }
  };
}
function createOfficialModelCatalog(options = {}) {
  const fetchCatalog = options.fetch ?? fetch;
  const scheduleTimeout = options.setTimeout ?? setTimeout;
  const cancelTimeout = options.clearTimeout ?? clearTimeout;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_REFRESH_TIMEOUT_MS;
  let models;
  let metadata = /* @__PURE__ */ new Map();
  let etag;
  let revision = 0;
  let refreshing;
  let generation = 0;
  let refreshStatus = "idle";
  const refresh = ({ signal } = {}) => {
    if (signal?.aborted) return Promise.reject(signal.reason ?? /* @__PURE__ */ new Error("Codex model catalog refresh aborted"));
    if (refreshing?.generation === generation) return refreshing.promise;
    const currentGeneration = generation;
    refreshStatus = "refreshing";
    let outcome = "idle";
    const controller = new AbortController();
    const abort = () => {
      if (!controller.signal.aborted) controller.abort(signal?.reason ?? /* @__PURE__ */ new Error("Codex model catalog refresh aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    const requestSignal2 = controller.signal;
    let timer;
    const timeoutError = /* @__PURE__ */ new Error("Codex model catalog refresh timed out");
    const work = (async () => {
      const auth = await options.getAuth({ signal: requestSignal2 });
      if (currentGeneration !== generation || requestSignal2.aborted) return false;
      const credential = await options.readCredential({ signal: requestSignal2 });
      if (currentGeneration !== generation || requestSignal2.aborted) return false;
      const access = auth?.auth?.apiKey;
      const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
      if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) return false;
      const headers = {
        authorization: `Bearer ${access}`,
        "chatgpt-account-id": accountId,
        accept: "application/json",
        originator: "pi",
        "user-agent": USER_AGENT,
        ...etag === void 0 ? {} : { "if-none-match": etag }
      };
      const response = await fetchCatalog(CODEX_MODELS_URL, {
        method: "GET",
        redirect: "error",
        headers,
        signal: requestSignal2
      });
      if (currentGeneration !== generation || requestSignal2.aborted) return false;
      if (response.status === 304) {
        outcome = "ok";
        return false;
      }
      if (!response.ok) throw new Error(`Codex model catalog failed (HTTP ${response.status})`);
      const remote = parseOfficialModelCatalog(await response.json());
      if (currentGeneration !== generation || requestSignal2.aborted) return false;
      if (remote.length === 0) throw new Error("Codex returned an empty model catalog");
      const baseModels = options.baseModels();
      const next = remote.map((model) => mergeModel(baseModels, model)).filter(Boolean);
      if (next.length === 0) throw new Error("Codex model catalog has no compatible models");
      if (currentGeneration !== generation || requestSignal2.aborted) return false;
      models = next;
      metadata = new Map(remote.map((model) => [model.id, model]));
      etag = nonEmpty$2(response.headers.get("etag")) ?? etag;
      revision += 1;
      outcome = "ok";
      return true;
    })();
    let rejectAborted;
    const abortPromise = new Promise((_, reject) => {
      rejectAborted = () => reject(requestSignal2.reason ?? /* @__PURE__ */ new Error("Codex model catalog refresh aborted"));
      if (requestSignal2.aborted) rejectAborted();
      else requestSignal2.addEventListener("abort", rejectAborted, { once: true });
    });
    timer = scheduleTimeout(() => controller.abort(timeoutError), timeoutMs);
    timer.unref?.();
    const promise = Promise.race([work, abortPromise]).catch((error) => {
      outcome = "failed";
      throw error;
    }).finally(() => {
      cancelTimeout(timer);
      signal?.removeEventListener("abort", abort);
      requestSignal2.removeEventListener("abort", rejectAborted);
      if (refreshing?.promise === promise) {
        refreshing = void 0;
        refreshStatus = outcome;
      }
    });
    refreshing = {
      generation: currentGeneration,
      promise,
      cancel: () => controller.abort()
    };
    return promise;
  };
  return Object.freeze({
    refresh,
    getModels: (fallback) => models ?? fallback,
    metadata: (modelId) => metadata.get(modelId),
    revision: () => revision,
    status: () => ({
      source: models === void 0 ? "fallback" : "online",
      refresh: refreshStatus
    }),
    clear() {
      generation += 1;
      const flight = refreshing;
      refreshing = void 0;
      flight?.cancel();
      models = void 0;
      metadata = /* @__PURE__ */ new Map();
      etag = void 0;
      refreshStatus = "idle";
      revision += 1;
    }
  });
}
var CODEX_SEARCH_PROVIDER_ID = "codex-subscription";
var CODEX_AUTO_SEARCH_PROVIDER_ID = "codex-subscription-auto";
var CODEX_SEARCH_URL = "https://chatgpt.com/backend-api/codex/alpha/search";
var DEFAULT_MODEL = "gpt-5.6-luna";
var MAX_OUTPUT_TOKENS = 4096;
var MAX_SOURCE_DATE = 64;
var record$3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var nonEmpty$1 = (value) => typeof value === "string" && value.length > 0 ? value : void 0;
var displayText = (value) => {
  const text = nonEmpty$1(value)?.replace(/\s+/gu, " ").trim();
  if (text === void 0 || text.length === 0) return void 0;
  return text;
};
var boundedDisplayText = (value, maximum) => {
  const text = displayText(value);
  if (text === void 0 || text.length <= maximum) return text;
  return `${text.slice(0, maximum - 1)}\u2026`;
};
function sourceOf(value) {
  if (!record$3(value)) return void 0;
  const url = nonEmpty$1(value.url);
  if (url === void 0) return void 0;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
  const title = displayText(value.title) ?? parsed.hostname;
  const snippet = displayText(value.snippet);
  const publishedAt = boundedDisplayText(value.published_at, MAX_SOURCE_DATE) ?? boundedDisplayText(value.publishedAt, MAX_SOURCE_DATE);
  return {
    url,
    title,
    ...snippet === void 0 ? {} : { snippet },
    ...publishedAt === void 0 ? {} : { publishedAt }
  };
}
function parseSearchResponse(value) {
  if (!record$3(value) || !Array.isArray(value.results)) throw new Error("Codex returned a malformed search response");
  const seen = /* @__PURE__ */ new Set();
  const sources = [];
  for (const result2 of value.results ?? []) {
    const source = sourceOf(result2);
    if (source === void 0 || seen.has(source.url)) continue;
    seen.add(source.url);
    sources.push(source);
  }
  return {
    sources,
    truncated: false
  };
}
function createCodexSearchProvider(options) {
  const fetchSearch = options.fetch ?? fetch;
  return Object.freeze({
    id: CODEX_SEARCH_PROVIDER_ID,
    available: () => true,
    async search(request2, signal) {
      signal?.throwIfAborted();
      const preferences = readCapabilitySettings(options.resolvePreferences?.());
      if (preferences.searchMode === "disabled") throw new WebError2("Codex search is disabled in subscription settings", "WEB_PROVIDER_UNAVAILABLE");
      const auth = await options.getAuth({ signal });
      const credential = await options.readCredential({ signal });
      const access = auth?.auth?.apiKey;
      const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
      if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new WebError2("ChatGPT subscription is not signed in", "WEB_PROVIDER_CREDENTIAL_MISSING");
      const model = nonEmpty$1(options.resolveModel?.()) ?? DEFAULT_MODEL;
      const id = nonEmpty$1(options.resolveSessionId?.()) ?? randomUUID3();
      let response;
      try {
        response = await fetchSearch(CODEX_SEARCH_URL, {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${access}`,
            "chatgpt-account-id": accountId,
            accept: "application/json",
            "content-type": "application/json",
            originator: "pi",
            "user-agent": USER_AGENT
          },
          body: JSON.stringify({
            id,
            model,
            input: request2.query,
            commands: {
              search_query: [{ q: request2.query }],
              response_length: "short"
            },
            settings: {
              allowed_callers: ["direct"],
              external_web_access: preferences.searchMode === "live"
            },
            max_output_tokens: MAX_OUTPUT_TOKENS
          }),
          signal
        });
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") throw new WebError2("Codex search aborted", "WEB_ABORTED", { cause: error });
        throw new WebError2("Codex search request failed", "WEB_PROVIDER_ERROR", { cause: error });
      }
      if (!response.ok) throw response.status === 401 || response.status === 403 ? new WebError2("ChatGPT sign-in needs to be renewed", "WEB_PROVIDER_CREDENTIAL_MISSING") : new WebError2(`Codex search request failed (HTTP ${response.status})`, "WEB_PROVIDER_ERROR");
      let value;
      try {
        value = await response.json();
      } catch (error) {
        throw new WebError2("Codex returned an unreadable search response", "WEB_PROVIDER_ERROR", { cause: error });
      }
      try {
        const result2 = parseSearchResponse(value);
        if (preferences.searchDomains.length > 0) result2.sources = result2.sources.filter((source) => {
          const hostname = new URL(source.url).hostname.toLowerCase();
          return preferences.searchDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
        });
        return result2;
      } catch (error) {
        throw new WebError2("Codex returned a malformed search response", "WEB_PROVIDER_ERROR", { cause: error });
      }
    }
  });
}
function createCodexAutoSearchProvider(options) {
  return Object.freeze({
    id: CODEX_AUTO_SEARCH_PROVIDER_ID,
    available: () => true,
    async search(request2, signal) {
      if (options.resolveModelProvider?.() === "openai-codex") return options.codex.search(request2, signal);
      const provider = options.resolveDshProvider?.();
      if (provider === void 0 || provider.id === "codex-subscription-auto" || provider.id === "codex-subscription" || provider.available() !== true) throw new WebError2("DSH default search is unavailable", "WEB_PROVIDER_UNAVAILABLE");
      return provider.search(request2, signal);
    }
  });
}
var ORIGINAL_IMAGE_CHUNK_BYTES = 4 * 1024 * 1024;
var ORIGINAL_IMAGE_ID_PATTERN = /^img_[0-9a-f]{32}$/u;
var positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
function decodeOriginalImageRef(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.assetId !== "string" || !ORIGINAL_IMAGE_ID_PATTERN.test(value.assetId) || value.mediaType !== "image/png" || !positiveInteger(value.bytes) || value.bytes > 48 * 1024 * 1024 || !positiveInteger(value.width) || !positiveInteger(value.height) || typeof value.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.name) || typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.sha256)) return void 0;
  return {
    assetId: value.assetId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    name: value.name,
    sha256: value.sha256
  };
}
function decodeImagePresentation(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value.kind !== "codex-subscription-image" || value.schemaVersion !== 1) return void 0;
  const original = decodeOriginalImageRef(value.original);
  return original === void 0 ? void 0 : { original };
}
function originalImageRefsEqual(left, right) {
  const a = decodeOriginalImageRef(left);
  const b = decodeOriginalImageRef(right);
  return a !== void 0 && b !== void 0 && a.assetId === b.assetId && a.mediaType === b.mediaType && a.bytes === b.bytes && a.width === b.width && a.height === b.height && a.name === b.name && a.sha256 === b.sha256;
}
function inheritedOriginalImageRef(session, assetId) {
  const parentSession = session?.header?.parentSession;
  const seedLength = Number.isSafeInteger(session?.inheritedEventCount) ? session.inheritedEventCount : session?.header?.seedLength;
  if (typeof parentSession !== "string" || parentSession.length === 0 || !Number.isSafeInteger(seedLength) || seedLength < 0 || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return void 0;
  let events = session?.events;
  if (!Array.isArray(events) && typeof session?.snapshotEvents === "function") try {
    events = session.snapshotEvents();
  } catch {
    return;
  }
  if (!Array.isArray(events)) return void 0;
  for (const event of events) {
    if (!Number.isSafeInteger(event?.seq) || event.seq < 0 || event.seq >= seedLength || event.type !== "tool/result") continue;
    const original = decodeImagePresentation(event.data?.meta)?.original;
    if (original?.assetId === assetId) return original;
  }
}
var CODEX_IMAGE_TOOL_NAME = "codex_image_generate";
var CODEX_IMAGE_GENERATION_URL = "https://chatgpt.com/backend-api/codex/images/generations";
var CODEX_IMAGE_EDIT_URL = "https://chatgpt.com/backend-api/codex/images/edits";
var MAX_REFERENCE_IMAGES = 5;
var RESPONSE_ENVELOPE_BYTES = 1024 * 1024;
var IMAGE_BACKGROUNDS = /* @__PURE__ */ new Set([
  "auto",
  "transparent",
  "opaque"
]);
var PNG_SIGNATURE2 = Buffer.from([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10
]);
var FULL_ATTACHMENT_ID = /^sha256:[0-9a-f]{64}$/u;
var BARE_ATTACHMENT_DIGEST = /^[0-9a-f]{64}$/iu;
var PATH_LIKE_ATTACHMENT_ID = /[\\/]/u;
var FILE_NAME_ATTACHMENT_ID = /\.[A-Za-z0-9]{1,16}$/u;
var record$2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var nonEmpty = (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
function normalizeImageOptions(args) {
  const quality = nonEmpty(args?.quality) ?? "auto";
  const background = nonEmpty(args?.background) ?? "auto";
  const size = nonEmpty(args?.size) ?? "auto";
  validateImageQuality(resolveImageModel(args?.model), quality);
  if (!IMAGE_BACKGROUNDS.has(background)) throw new Error("background must be auto, transparent, or opaque");
  if (size !== "auto") {
    const match = /^(\d+)x(\d+)$/u.exec(size);
    const width = Number(match?.[1]);
    const height = Number(match?.[2]);
    const short = Math.min(width, height);
    const long = Math.max(width, height);
    const pixels = width * height;
    if (match === null || width % 16 !== 0 || height % 16 !== 0 || long > 3840 || long > short * 3 || pixels < 655360 || pixels > 8294400) throw new Error("size must be auto or a valid GPT Image 2 widthxheight resolution");
  }
  return {
    quality,
    background,
    size
  };
}
function encodedLimit(decodedBytes) {
  return Math.ceil(decodedBytes / 3) * 4;
}
function validBase64Body(value, end) {
  for (let index = 0; index < end; index += 1) {
    const code = value.charCodeAt(index);
    if (!(code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47)) return false;
  }
  return true;
}
async function readJsonWithin(response, maximumBytes) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new Error("Codex image response exceeds the image size limit");
  if (response.body === null) throw new Error("Codex returned an unreadable image response");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error("Codex image response exceeds the image size limit");
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString("utf8");
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Codex returned an unreadable image response");
  }
}
function decodeCodexPng(value, maximumBytes) {
  const encoded = nonEmpty(value);
  const padding = encoded?.endsWith("==") ? 2 : encoded?.endsWith("=") ? 1 : 0;
  if (encoded === void 0 || encoded.length % 4 !== 0 || !validBase64Body(encoded, encoded.length - padding)) throw new Error("Codex returned an invalid base64 PNG");
  const decodedBytes = encoded.length / 4 * 3 - padding;
  if (decodedBytes > maximumBytes) throw new Error("Codex image exceeds the image size limit");
  const data = Buffer.from(encoded, "base64");
  if (data.length !== decodedBytes || data.length < PNG_SIGNATURE2.length || !data.subarray(0, PNG_SIGNATURE2.length).equals(PNG_SIGNATURE2)) throw new Error("Codex returned an invalid PNG");
  return new Uint8Array(data);
}
function imageReference(value) {
  const originalDimensions = record$2(value.originalDimensions) ? {
    width: value.originalDimensions.width,
    height: value.originalDimensions.height
  } : void 0;
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...value.name === void 0 ? {} : { name: value.name },
    ...originalDimensions === void 0 ? {} : { originalDimensions }
  };
}
function normalizeAttachmentId(value) {
  if (typeof value !== "string") return void 0;
  if (FULL_ATTACHMENT_ID.test(value)) return value;
  const bare = BARE_ATTACHMENT_DIGEST.exec(value);
  return bare === null ? void 0 : `sha256:${bare[0].toLowerCase()}`;
}
function invalidAttachmentId(value) {
  const attachmentId = value?.attachmentId;
  if (typeof attachmentId === "string" && (PATH_LIKE_ATTACHMENT_ID.test(attachmentId) || FILE_NAME_ATTACHMENT_ID.test(attachmentId))) throw new Error("referenceImages attachmentId is a file path or filename; call read_image on that file and retry with its complete sha256:<64 lowercase hex> attachment reference. Do not omit referenceImages or fall back to new image generation.");
  throw new Error("referenceImages attachmentId must be sha256:<64 lowercase hex> copied from an image block or read_image result. Do not omit referenceImages or fall back to new image generation.");
}
function referenceOf(value, attachments) {
  const attachmentId = normalizeAttachmentId(value?.attachmentId);
  if (attachmentId === void 0) invalidAttachmentId(value);
  if (!record$2(value) || !attachments.imageLimits.mediaTypes.includes(value.mediaType) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || !Number.isSafeInteger(value.width) || value.width <= 0 || !Number.isSafeInteger(value.height) || value.height <= 0 || value.name !== void 0 && (typeof value.name !== "string" || value.name.length > 256) || value.originalDimensions !== void 0 && (!record$2(value.originalDimensions) || !Number.isSafeInteger(value.originalDimensions.width) || value.originalDimensions.width <= 0 || !Number.isSafeInteger(value.originalDimensions.height) || value.originalDimensions.height <= 0)) throw new Error("referenceImages contains an invalid image reference");
  return imageReference({
    ...value,
    attachmentId
  });
}
function sessionImageReferences(messages) {
  const references = /* @__PURE__ */ new Map();
  const visit = (content) => {
    if (!Array.isArray(content)) return;
    for (const block of content) if (block?.type === "image" && record$2(block.attachment)) {
      const id = normalizeAttachmentId(block.attachment.attachmentId);
      if (id !== void 0) references.set(id, block.attachment);
    } else if (block?.type === "tool-result") visit(block.content);
  };
  for (const message of messages ?? []) visit(message?.content);
  return references;
}
async function editImages(values, attachments, signal, messages) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REFERENCE_IMAGES) throw new Error(`referenceImages must contain between 1 and ${MAX_REFERENCE_IMAGES} images`);
  const available = messages === void 0 ? void 0 : sessionImageReferences(messages);
  const references = values.map((value) => {
    const id = normalizeAttachmentId(value?.attachmentId);
    if (id === void 0) invalidAttachmentId(value);
    if (available === void 0) return referenceOf(value, attachments);
    const selected = available.get(id);
    if (selected === void 0) throw new Error("The selected image attachment cannot be found in the current session. Call read_image on the intended image and retry with its returned reference. Do not omit referenceImages or substitute another image.");
    return referenceOf(selected, attachments);
  });
  if (new Set(references.map((value) => value.attachmentId)).size !== references.length) throw new Error("referenceImages must not contain duplicates");
  const images = [];
  let totalBytes = 0;
  for (const reference of references) {
    const stored = await attachments.readImage(reference, signal);
    totalBytes += stored.data.byteLength;
    if (totalBytes > attachments.imageLimits.maxMessageImageBytes) throw new Error("referenceImages exceed the DSH message image limit");
    images.push({ image_url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString("base64")}` });
  }
  return images;
}
function imageContent(value) {
  const label = typeof value.size === "string" && value.size.length > 0 ? `Generated a ${value.size} image.` : "Generated an image.";
  return [{
    type: "text",
    text: value.localPath === void 0 ? label : `${label}
Original PNG saved on the DSH host at: ${JSON.stringify(value.localPath)}. Read this file or copy it to the workspace with a .png extension; this host path is not a browser URL.`
  }, {
    type: "image",
    attachment: imageReference(value.image)
  }];
}
function imageOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      image: {
        type: "object",
        required: true,
        additionalProperties: false,
        properties: {
          attachmentId: {
            type: "string",
            required: true
          },
          mediaType: {
            type: "string",
            enum: ["image/png"],
            required: true
          },
          bytes: {
            type: "integer",
            required: true
          },
          width: {
            type: "integer",
            required: true
          },
          height: {
            type: "integer",
            required: true
          },
          name: { type: "string" },
          originalDimensions: {
            type: "object",
            additionalProperties: false,
            properties: {
              width: {
                type: "integer",
                required: true
              },
              height: {
                type: "integer",
                required: true
              }
            }
          }
        }
      },
      original: {
        type: "object",
        required: true,
        additionalProperties: false,
        properties: {
          assetId: {
            type: "string",
            required: true
          },
          mediaType: {
            type: "string",
            enum: ["image/png"],
            required: true
          },
          bytes: {
            type: "integer",
            required: true
          },
          width: {
            type: "integer",
            required: true
          },
          height: {
            type: "integer",
            required: true
          },
          name: {
            type: "string",
            required: true
          },
          sha256: {
            type: "string",
            required: true
          }
        }
      },
      background: { type: "string" },
      requestedModel: { type: "string" },
      reportedModel: { type: "string" },
      requestedSize: { type: "string" },
      localPath: {
        type: "string",
        required: true,
        description: "Absolute path to the original PNG on the DSH host."
      },
      quality: { type: "string" },
      size: { type: "string" }
    }
  };
}
function responseMetadata(value) {
  const data = Array.isArray(value?.data) ? value.data[0] : void 0;
  const encoded = record$2(data) ? data.b64_json : void 0;
  if (typeof encoded !== "string") throw new Error("Codex returned no image data");
  return {
    encoded,
    background: nonEmpty(value.background),
    quality: nonEmpty(value.quality),
    size: nonEmpty(value.size),
    reportedModel: nonEmpty(value.model)
  };
}
function createCodexImageTool(options) {
  const fetchImage = options.fetch ?? fetch;
  const attachments = options.attachments;
  return defineTool({
    name: CODEX_IMAGE_TOOL_NAME,
    description: "Generate or edit images only when the user asks for image output, not when merely discussing images. Uses the signed-in Codex subscription. For a new image, omit referenceImages. For edits, copy complete references only for the images the user selected; obtain missing references using read_image. Never substitute paths, unrelated images, or text-only generation for an edit. For numbered annotations, include the clean source and location-reference image, preserve the requested changes and coordinates in the prompt, and remove guidance markers from the result. If the intended references cannot be identified, ask rather than guessing.",
    parameters: {
      model: {
        type: "string",
        enum: Object.keys(IMAGE_MODELS),
        description: "Optional image engine, independent of the conversation model. When omitted, uses the user image setting (initially gpt-image-2). The 2.5 identifiers are experimental subscription candidates; override only when explicitly requested. Never silently retry with another model."
      },
      prompt: {
        type: "string",
        required: true,
        description: "A complete, production-ready description of the image to generate."
      },
      size: {
        type: "string",
        description: "Optional GPT Image 2 output size. Use auto unless the user requests an exact valid widthxheight resolution."
      },
      quality: {
        type: "string",
        enum: [
          "auto",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        description: "Optional rendering quality. Use auto unless the user requests draft speed or final quality."
      },
      background: {
        type: "string",
        enum: [
          "auto",
          "transparent",
          "opaque"
        ],
        description: "Optional background mode. Request transparent only when the user needs transparency."
      },
      referenceImages: {
        type: "array",
        description: "Optional explicit references to 1-5 prior images to edit. Copy each complete reference from the session image block or read_image result. Omit only for a new image; an invalid reference must be fixed and retried rather than omitted.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            attachmentId: {
              type: "string",
              required: true,
              description: "Copy the complete attachmentId from the image block or read_image result: sha256:<64 lowercase hex>. Never pass a workspace path, absolute path, or filename. A bare 64-character hex digest is accepted and normalized to sha256:<64 lowercase hex>."
            },
            mediaType: {
              type: "string",
              required: true
            },
            bytes: {
              type: "integer",
              required: true
            },
            width: {
              type: "integer",
              required: true
            },
            height: {
              type: "integer",
              required: true
            },
            name: { type: "string" },
            originalDimensions: {
              type: "object",
              additionalProperties: false,
              properties: {
                width: {
                  type: "integer",
                  required: true
                },
                height: {
                  type: "integer",
                  required: true
                }
              }
            }
          }
        }
      }
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args, value) => imageContent(value),
      presentationMeta: (_args, value) => ({
        kind: "codex-subscription-image",
        schemaVersion: 1,
        original: value.original,
        ...value.requestedModel === void 0 ? {} : { requestedModel: value.requestedModel },
        ...value.reportedModel === void 0 ? {} : { reportedModel: value.reportedModel },
        ...value.requestedSize === void 0 ? {} : { requestedSize: value.requestedSize }
      })
    },
    timeoutMs: 300 * 1e3,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      assertImageOperation(options.getFeatures?.(), args.referenceImages !== void 0);
      const defaults = readImageDefaults(options.getFeatures?.());
      args = {
        ...args,
        model: args.model ?? defaults.imageModel,
        quality: args.quality ?? defaults.imageQuality
      };
      const prompt = nonEmpty(args.prompt);
      if (prompt === void 0) throw new Error("prompt must be a non-empty string");
      const imageOptions = normalizeImageOptions(args);
      const auth = await options.getAuth({ signal: exec.signal });
      const credential = await options.readCredential({ signal: exec.signal });
      const access = auth?.auth?.apiKey;
      const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
      if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
      if (!attachments.imageLimits.mediaTypes.includes("image/png")) throw new Error("This DSH installation does not accept PNG image attachments");
      const maximumBytes = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes);
      const editing = args.referenceImages !== void 0;
      const sessionMessages = editing && typeof options.getSessionMessages === "function" ? await options.getSessionMessages(exec.agent?.id) : void 0;
      const images = editing ? await editImages(args.referenceImages, attachments, exec.signal, sessionMessages ?? (options.getSessionMessages ? [] : void 0)) : void 0;
      let response;
      assertImageOperation(options.getFeatures?.(), editing);
      try {
        response = await fetchImage(editing ? CODEX_IMAGE_EDIT_URL : CODEX_IMAGE_GENERATION_URL, {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${access}`,
            "chatgpt-account-id": accountId,
            accept: "application/json",
            "content-type": "application/json",
            originator: "pi",
            "x-codex-image-turn-id": String(exec.callId),
            "user-agent": USER_AGENT
          },
          body: JSON.stringify({
            ...images === void 0 ? {} : { images },
            prompt,
            background: imageOptions.background,
            model: resolveImageModel(args.model),
            quality: imageOptions.quality,
            size: imageOptions.size
          }),
          signal: exec.signal
        });
      } catch (error) {
        if (exec.signal.aborted) throw exec.signal.reason;
        throw new Error(`Codex image ${editing ? "edit" : "generation"} request failed`, { cause: error });
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("ChatGPT sign-in needs to be renewed");
        if (response.status === 429) throw new Error("Codex image generation quota is unavailable");
        throw new Error(`Codex image ${editing ? "edit" : "generation"} failed (HTTP ${response.status})`);
      }
      const metadata = responseMetadata(await readJsonWithin(response, encodedLimit(maximumBytes) + RESPONSE_ENVELOPE_BYTES));
      const data = decodeCodexPng(metadata.encoded, maximumBytes);
      const sessionId = exec.agent?.id;
      if (sessionId === void 0) throw new Error("Codex image generation requires a session-owned tool call");
      const original = await options.originalImages.save(String(sessionId), data);
      let ref;
      try {
        ref = await attachments.saveImage({
          data,
          mediaType: "image/png",
          name: "codex-generated.png"
        });
      } catch (error) {
        await options.originalImages.remove(original);
        throw error;
      }
      const result2 = {
        requestedModel: resolveImageModel(args.model),
        requestedSize: imageOptions.size,
        ...metadata.reportedModel === void 0 ? {} : { reportedModel: metadata.reportedModel },
        image: imageReference(ref),
        original,
        localPath: options.originalImages.originalPath(original.assetId),
        ...metadata.background === void 0 ? {} : { background: metadata.background },
        ...metadata.quality === void 0 ? {} : { quality: metadata.quality },
        ...metadata.size === void 0 ? {} : { size: metadata.size }
      };
      if (exec.parent !== void 0) exec.deferContext(createUserMessage({
        content: imageContent(result2),
        source: {
          kind: "plugin",
          plugin: "codex-subscription"
        }
      }));
      return result2;
    }
  });
}
function watchImageTool(settings, register) {
  let disposeTool;
  const sync = (value) => {
    const { imageGeneration, imageEditing } = readImageFeatures(value);
    if ((imageGeneration || imageEditing) && !disposeTool) disposeTool = register();
    else if (!imageGeneration && !imageEditing && disposeTool) {
      disposeTool();
      disposeTool = void 0;
    }
  };
  sync(settings.get());
  const unwatch = settings.watch(sync);
  return () => {
    unwatch();
    disposeTool?.();
    disposeTool = void 0;
  };
}
var ORIGINAL_IMAGE_DIRECTORY = "dsh-codex-subscription/images/v1";
var METADATA_VERSION = 1;
var digest = (data) => createHash3("sha256").update(data).digest("hex");
var validSessionId = (value) => typeof value === "string" && value.length > 0 && value.length <= 512;
function pngDimensions(data) {
  if (!(data instanceof Uint8Array) || data.byteLength < 24 || Buffer.from(data.subarray(0, 8)).toString("hex") !== "89504e470d0a1a0a" || Buffer.from(data.subarray(12, 16)).toString("ascii") !== "IHDR") throw new TypeError("invalid PNG dimensions");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) throw new TypeError("invalid PNG dimensions");
  return {
    width,
    height
  };
}
async function writeExclusive(filename, data) {
  await mkdir4(dirname5(filename), {
    recursive: true,
    mode: 448
  });
  const handle = await open2(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 384);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function assertPrivateFile(filename) {
  const stat3 = await lstat5(filename);
  if (!stat3.isFile()) throw new Error("not a regular file");
  if (process.platform !== "win32" && (stat3.mode & 63) !== 0) throw new Error("file is not owner-only");
}
function parseMetadata(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return;
  }
  if (value?.version !== METADATA_VERSION || !validSessionId(value.sessionId)) return void 0;
  const image = decodeOriginalImageRef(value.image);
  return image === void 0 ? void 0 : {
    sessionId: value.sessionId,
    image
  };
}
var OriginalImageStore = class {
  constructor(dshHome) {
    this.root = resolve2(join6(resolveDshHome(dshHome), ORIGINAL_IMAGE_DIRECTORY));
  }
  directory(assetId) {
    if (!ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) throw new TypeError("invalid original image asset id");
    return join6(this.root, assetId.slice(4, 6), assetId);
  }
  originalPath(assetId) {
    return join6(this.directory(assetId), "original");
  }
  async save(sessionId, data, name2 = "codex-generated-original.png") {
    if (!validSessionId(sessionId) || !(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > 48 * 1024 * 1024) throw new TypeError("invalid original image input");
    const { width, height } = pngDimensions(data);
    const assetId = `img_${randomBytes2(16).toString("hex")}`;
    const directory = this.directory(assetId);
    const ref = {
      assetId,
      mediaType: "image/png",
      bytes: data.byteLength,
      width,
      height,
      name: name2,
      sha256: digest(data)
    };
    try {
      await mkdir4(dirname5(directory), {
        recursive: true,
        mode: 448
      });
      await mkdir4(directory, {
        recursive: false,
        mode: 448
      });
      await writeExclusive(join6(directory, "original"), data);
      const temporary = join6(directory, `metadata.${randomBytes2(8).toString("hex")}.tmp`);
      await writeExclusive(temporary, Buffer.from(`${JSON.stringify({
        version: METADATA_VERSION,
        sessionId,
        image: ref
      }, null, 2)}
`));
      await rename3(temporary, join6(directory, "metadata.json"));
      return ref;
    } catch (error) {
      await rm3(directory, {
        recursive: true,
        force: true
      }).catch(() => void 0);
      throw error;
    }
  }
  async remove(ref) {
    if (ref !== void 0 && ORIGINAL_IMAGE_ID_PATTERN.test(ref.assetId)) await rm3(this.directory(ref.assetId), {
      recursive: true,
      force: true
    }).catch(() => void 0);
  }
  async read(sessionId, assetId, inherited) {
    if (!validSessionId(sessionId) || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return void 0;
    try {
      const directory = this.directory(assetId);
      const metadataFile = join6(directory, "metadata.json");
      const originalFile = join6(directory, "original");
      await Promise.all([assertPrivateFile(metadataFile), assertPrivateFile(originalFile)]);
      const metadata = parseMetadata(await readFile5(metadataFile, "utf8"));
      if (metadata === void 0 || metadata.image.assetId !== assetId || metadata.sessionId !== sessionId && !originalImageRefsEqual(metadata.image, inherited)) return void 0;
      const buffer = await readFile5(originalFile);
      const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const dimensions = pngDimensions(data);
      if (data.byteLength !== metadata.image.bytes || digest(data) !== metadata.image.sha256 || dimensions.width !== metadata.image.width || dimensions.height !== metadata.image.height) return void 0;
      return {
        ref: metadata.image,
        data
      };
    } catch {
      return;
    }
  }
  async chunk(sessionId, assetId, offset, inherited) {
    if (!Number.isSafeInteger(offset) || offset < 0) return void 0;
    const stored = await this.read(sessionId, assetId, inherited);
    if (stored === void 0 || offset >= stored.data.byteLength || offset % 4194304 !== 0) return void 0;
    const end = Math.min(stored.data.byteLength, offset + ORIGINAL_IMAGE_CHUNK_BYTES);
    const chunk = Buffer.from(stored.data.buffer, stored.data.byteOffset + offset, end - offset);
    return {
      ref: stored.ref,
      offset,
      encoded: chunk.toString("base64"),
      done: end === stored.data.byteLength
    };
  }
};
var requestAreas = /* @__PURE__ */ new Set([
  "login",
  "model",
  "catalog",
  "quota",
  "quota-reset",
  "search",
  "image"
]);
var statuses = /* @__PURE__ */ new Set(["ok", "failed"]);
var stages = /* @__PURE__ */ new Set(["transport", "http"]);
var codes = /* @__PURE__ */ new Set([
  "timeout",
  "dns",
  "tls",
  "connection",
  "network",
  "http-error"
]);
var routes = /* @__PURE__ */ new Set([
  "direct",
  "environment",
  "system",
  "bypass"
]);
var elapsedBuckets = /* @__PURE__ */ new Set([
  "under-1s",
  "1-5s",
  "5-15s",
  "over-15s"
]);
function safeRequests(network) {
  const raw = network?.snapshot?.() ?? {};
  const result2 = {};
  for (const [area, value] of Object.entries(raw)) {
    if (!requestAreas.has(area) || value === null || typeof value !== "object") continue;
    if (!statuses.has(value.status) || !routes.has(value.route) || !elapsedBuckets.has(value.elapsed)) continue;
    result2[area] = {
      status: value.status,
      ...stages.has(value.stage) ? { stage: value.stage } : {},
      ...codes.has(value.code) ? { code: value.code } : {},
      ...Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {},
      route: value.route,
      elapsed: value.elapsed
    };
  }
  return result2;
}
async function createSubscriptionDiagnostics({ auth, preferences, login = { phase: "idle" }, network, modelCatalog }) {
  let account = { status: "unknown" };
  const issues = [];
  try {
    account = { status: (await auth.status()).authenticated === true ? "signed-in" : "signed-out" };
  } catch {
    issues.push({ code: "account-status-unavailable" });
  }
  const preference = preferences.status();
  const catalog = modelCatalog?.status?.();
  return {
    schemaVersion: 3,
    package: "dsh-codex-subscription",
    version: PACKAGE_VERSION,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    account,
    login,
    requests: safeRequests(network),
    ...catalog && ["fallback", "online"].includes(catalog.source) && [
      "idle",
      "refreshing",
      "ok",
      "failed"
    ].includes(catalog.refresh) ? { catalog: {
      source: catalog.source,
      refresh: catalog.refresh
    } } : {},
    configuration: {
      contextMode: preference.contextMode,
      quickQuotaMode: preference.quickQuotaMode,
      ...typeof preference.outputVerbosity === "string" ? { outputVerbosity: preference.outputVerbosity } : {},
      searchProvider: preference.searchProvider,
      speedMode: preference.speedMode,
      writable: preference.writable === true
    },
    issues
  };
}
var CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
var DEFAULT_TTL_MS = 6e4;
var DEFAULT_TIMEOUT_MS$1 = 15e3;
var DEFAULT_FAILURE_TTL_MS = 5e3;
var DEFAULT_MAX_RETRY_AFTER_MS = 5 * 6e4;
var record$1 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function windowOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (!record$1(value)) throw new Error("Codex returned a malformed rate-limit window");
  const used = value.used_percent;
  const seconds = value.limit_window_seconds;
  if (!Number.isFinite(used) || used < 0 || used > 100) throw new Error("Codex returned an invalid used percentage");
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error("Codex returned an invalid window duration");
  const resetsAt = epochSeconds(value.reset_at, "rate-limit reset time");
  return {
    usedPercent: used,
    remainingPercent: 100 - used,
    windowSeconds: seconds,
    ...resetsAt === void 0 ? {} : { resetsAt }
  };
}
function limitOf(id, name2, value) {
  if (value === void 0 || value === null) return void 0;
  if (!record$1(value)) throw new Error("Codex returned malformed rate-limit details");
  const windows = [windowOf(value.primary_window), windowOf(value.secondary_window)].filter(Boolean);
  return windows.length === 0 ? void 0 : {
    id,
    ...name2 ? { name: name2 } : {},
    windows
  };
}
function decimal(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(value)) throw new Error(`Codex returned an invalid ${label}`);
  return value;
}
function epochSeconds(value, label) {
  if (value === void 0 || value === null || value === 0) return void 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Codex returned an invalid ${label}`);
  return value;
}
function creditsOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (!record$1(value) || typeof value.has_credits !== "boolean" || typeof value.unlimited !== "boolean") throw new Error("Codex returned malformed credit details");
  if (!value.has_credits) return void 0;
  return {
    unlimited: value.unlimited,
    ...value.balance === void 0 || value.balance === null ? {} : { balance: decimal(value.balance, "credit balance") }
  };
}
function individualOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (!record$1(value)) throw new Error("Codex returned malformed spend control");
  const item = value.individual_limit;
  if (item === void 0 || item === null) return void 0;
  if (!record$1(item) || !Number.isFinite(item.remaining_percent) || item.remaining_percent < 0 || item.remaining_percent > 100) throw new Error("Codex returned an invalid individual-limit percentage");
  const resetsAt = epochSeconds(item.reset_at, "individual-limit reset time");
  return {
    limit: decimal(item.limit, "individual limit"),
    used: decimal(item.used, "individual usage"),
    remainingPercent: item.remaining_percent,
    ...resetsAt === void 0 ? {} : { resetsAt }
  };
}
function spendControlReachedOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (!record$1(value)) throw new Error("Codex returned malformed spend control");
  if (value.reached === void 0 || value.reached === null) return void 0;
  if (typeof value.reached !== "boolean") throw new Error("Codex returned an invalid spend-control state");
  return value.reached;
}
function resetCreditsOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (!record$1(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0) throw new Error("Codex returned malformed reset credit details");
  if (value.credits !== void 0 && value.credits !== null && !Array.isArray(value.credits)) throw new Error("Codex returned malformed reset credit details");
  const available = (value.credits ?? []).filter((credit) => record$1(credit) && credit.status?.toLowerCase?.() === "available").map((credit) => {
    const name2 = typeof credit.title === "string" && credit.title.trim().length > 0 ? credit.title.trim().slice(0, 120) : void 0;
    let expiresAt;
    if (Number.isSafeInteger(credit.expires_at) && credit.expires_at > 0) expiresAt = credit.expires_at * 1e3;
    else if (typeof credit.expires_at === "string" && credit.expires_at.length <= 64) {
      const parsed = Date.parse(credit.expires_at);
      if (Number.isFinite(parsed) && parsed > 0) expiresAt = parsed;
    }
    return {
      ...name2 === void 0 ? {} : { name: name2 },
      ...expiresAt === void 0 ? {} : { expiresAt }
    };
  });
  const expirations = available.map((credit) => credit.expiresAt).filter((expiration) => expiration !== void 0);
  return {
    availableCount: value.available_count,
    ...available.length === 0 ? {} : { credits: available },
    ...expirations.length === 0 ? {} : { nextExpiresAt: Math.min(...expirations) }
  };
}
function parseCodexUsage(value) {
  if (!record$1(value)) throw new Error("Codex returned a malformed usage response");
  const rateLimits = [];
  const seenLimitIds = /* @__PURE__ */ new Set();
  const addLimit = (limit) => {
    if (limit === void 0 || seenLimitIds.has(limit.id)) return;
    seenLimitIds.add(limit.id);
    rateLimits.push(limit);
  };
  addLimit(limitOf("codex", "Codex", value.rate_limit));
  if (value.additional_rate_limits !== void 0 && value.additional_rate_limits !== null && !Array.isArray(value.additional_rate_limits)) throw new Error("Codex returned malformed additional rate limits");
  for (const entry of value.additional_rate_limits ?? []) {
    if (!record$1(entry) || typeof entry.metered_feature !== "string" || entry.metered_feature.length === 0) throw new Error("Codex returned a malformed additional rate limit");
    if (entry.limit_name !== void 0 && entry.limit_name !== null && typeof entry.limit_name !== "string") throw new Error("Codex returned an invalid additional rate-limit name");
    addLimit(limitOf(entry.metered_feature, entry.limit_name || void 0, entry.rate_limit));
  }
  addLimit(limitOf("code_review", "Code review", value.code_review_rate_limit));
  const credits = creditsOf(value.credits);
  const individualLimit = individualOf(value.spend_control);
  const spendControlReached = spendControlReachedOf(value.spend_control);
  const resetCredits = resetCreditsOf(value.rate_limit_reset_credits);
  return {
    rateLimits,
    ...credits === void 0 ? {} : { credits },
    ...individualLimit === void 0 ? {} : { individualLimit },
    ...spendControlReached === void 0 ? {} : { spendControlReached },
    ...resetCredits === void 0 ? {} : { resetCredits }
  };
}
var requestSignal$1 = (signal, timeoutMs) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
};
function retryAfterMs(response, now, maximum) {
  if (response.status !== 429) return void 0;
  const raw = response.headers?.get?.("retry-after")?.trim();
  if (!raw) return void 0;
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1e3 : Date.parse(raw) - now();
  if (!Number.isFinite(delay) || delay < 0) return void 0;
  return Math.min(delay, maximum);
}
function createCodexUsageReader(options) {
  const getAuth = options.getAuth;
  const readCredential = options.readCredential;
  const fetchUsage = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS$1;
  const failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  let cached;
  let failed;
  let inFlight;
  let generation = 0;
  const load = async (signal) => {
    const auth = await getAuth({ signal });
    const credential = await readCredential({ signal });
    const access = auth?.auth?.apiKey;
    const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
    if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
    const response = await fetchUsage(CODEX_USAGE_URL, {
      method: "GET",
      redirect: "error",
      headers: {
        authorization: `Bearer ${access}`,
        "chatgpt-account-id": accountId,
        accept: "application/json",
        "cache-control": "no-store",
        "user-agent": USER_AGENT
      },
      signal: requestSignal$1(signal, timeoutMs)
    });
    if (!response.ok) {
      const error = /* @__PURE__ */ new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT usage request failed (HTTP ${response.status})`);
      Object.defineProperty(error, "retryAfterMs", { value: retryAfterMs(response, now, maxRetryAfterMs) });
      throw error;
    }
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error("ChatGPT returned an unreadable usage response");
    }
    return {
      ...parseCodexUsage(value),
      fetchedAt: now()
    };
  };
  return Object.freeze({
    read({ force = false, signal } = {}) {
      if (failed !== void 0 && now() < failed.retryAt) return Promise.reject(new Error(failed.message));
      if (!force && cached !== void 0 && now() - cached.fetchedAt < ttlMs) return Promise.resolve(structuredClone(cached));
      if (inFlight !== void 0) return inFlight.then(structuredClone);
      const currentGeneration = generation;
      const current = load(signal).then((value) => {
        if (generation === currentGeneration) {
          cached = structuredClone(value);
          failed = void 0;
        }
        return structuredClone(value);
      }).catch((error) => {
        if (generation === currentGeneration && error?.name !== "AbortError") {
          const delay = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : failureTtlMs;
          failed = {
            message: error instanceof Error ? error.message : "ChatGPT usage request failed",
            retryAt: now() + delay
          };
        }
        throw error;
      }).finally(() => {
        if (inFlight === current) inFlight = void 0;
      });
      inFlight = current;
      return current;
    },
    clear() {
      generation += 1;
      cached = void 0;
      failed = void 0;
      inFlight = void 0;
    }
  });
}
function quotaRateInterval(samples, { quantum = 1, rounding = "unknown" } = {}) {
  if (!(quantum > 0) || !Number.isFinite(quantum)) throw new RangeError("Invalid quantum");
  const points = samples.map((sample) => {
    const used = 100 - sample.remainingPercent;
    const lower = rounding === "floor" ? used : used - quantum / (rounding === "nearest" ? 2 : 1);
    const upper = rounding === "floor" ? used + quantum : used + quantum / (rounding === "nearest" ? 2 : 1);
    return {
      at: sample.at,
      lower: Math.max(0, lower),
      upper: Math.min(100, upper)
    };
  });
  let min = 0, max = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const minutes = (points[j].at - points[i].at) / 6e4;
    if (minutes <= 0) continue;
    min = Math.max(min, (points[j].lower - points[i].upper) / minutes);
    max = Math.min(max, (points[j].upper - points[i].lower) / minutes);
  }
  return {
    min,
    max,
    feasible: min <= max + 1e-10
  };
}
function quotaSharedOffsetInterval(samples, { quantum = 1, maxLagMs = 12e4 } = {}) {
  if (!(quantum > 0) || !Number.isFinite(quantum) || !Number.isFinite(maxLagMs) || maxLagMs < 0) throw new RangeError("Invalid interval options");
  let min = 0, max = Infinity;
  for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
    const elapsed = (samples[j].at - samples[i].at) / 6e4, lag = maxLagMs / 6e4;
    if (elapsed <= 0) continue;
    const delta = samples[i].remainingPercent - samples[j].remainingPercent;
    min = Math.max(min, (delta - quantum) / (elapsed + lag));
    if (elapsed > lag) max = Math.min(max, (delta + quantum) / (elapsed - lag));
  }
  return {
    min,
    max,
    feasible: min <= max + 1e-10
  };
}
function refineQuotaRate(samples, conservative) {
  if (!conservative.feasible || samples.length < 4 || samples.at(-1).at - samples[0].at < 20 * 6e4) return conservative;
  let crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i].remainingPercent;
    if (!Number.isInteger(value) || value <= 0 || value >= 100) return conservative;
    if (i > 0) {
      if (value > samples[i - 1].remainingPercent || samples[i].at <= samples[i - 1].at) return conservative;
      if (value < samples[i - 1].remainingPercent) crossings++;
    }
  }
  if (crossings < 3) return conservative;
  const candidate = quotaSharedOffsetInterval(samples);
  if (!candidate.feasible || candidate.min <= 0) return conservative;
  if (candidate.max - candidate.min >= conservative.max - conservative.min) return conservative;
  return {
    ...candidate,
    method: "shared-offset",
    maxLagMs: 12e4
  };
}
var HOUR_MS = 3600 * 1e3;
var HISTORY_MS = 24 * HOUR_MS;
var finite = (value) => value !== null && value !== void 0 && Number.isFinite(Number(value));
var clampPercent = (value) => Math.max(0, Math.min(100, Number(value)));
var cleanSegment = (value) => String(value ?? "default").slice(0, 96);
var keyFor = (window, context = {}) => JSON.stringify([
  cleanSegment(context.scope),
  cleanSegment(context.limitId ?? "codex"),
  Number(window.windowSeconds) || "limit"
]);
function observeQuotaForecast(state, windows, now = Date.now(), context = {}) {
  const next = { windows: { ...state?.windows ?? {} } };
  let changed = false;
  for (const window of windows ?? []) {
    if (!finite(window?.remainingPercent)) continue;
    const key = keyFor(window, context);
    const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null;
    const remainingPercent = clampPercent(window.remainingPercent);
    const previous = next.windows[key];
    const resetChanged = previous !== void 0 && (previous.resetsAt === null !== (resetsAt === null) || previous.resetsAt !== null && Math.abs(previous.resetsAt - resetsAt) > 300);
    const last = previous?.samples?.at(-1);
    const quotaIncreased = last !== void 0 && remainingPercent > last.remainingPercent + 0.5;
    const observationGap = last !== void 0 && now - last.at > 90 * 6e4;
    const record2 = resetChanged || quotaIncreased || observationGap ? {
      resetsAt,
      samples: []
    } : {
      resetsAt,
      samples: [...previous?.samples ?? []]
    };
    const latest = record2.samples.at(-1);
    if (latest === void 0 || now > latest.at) {
      record2.samples.push({
        at: now,
        remainingPercent
      });
      record2.samples = record2.samples.filter((sample) => sample.at >= now - HISTORY_MS).slice(-192);
      changed = true;
    }
    next.windows[key] = record2;
  }
  return {
    state: next,
    changed
  };
}
function estimateQuotaForecast(state, window, now = Date.now(), context = {}) {
  if (!finite(window?.remainingPercent)) return { status: "calibrating" };
  const record2 = state?.windows?.[keyFor(window, context)];
  if (record2 === void 0) return { status: "calibrating" };
  const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null;
  if (record2.resetsAt === null !== (resetsAt === null) || resetsAt !== null && Math.abs(record2.resetsAt - resetsAt) > 300) return { status: "calibrating" };
  let samples = record2.samples.filter((sample) => sample.at >= now - 2 * HOUR_MS && sample.at <= now);
  if (samples.length < 2) return {
    status: "calibrating",
    sampleCount: samples.length
  };
  if (now - samples.at(-1).at > 20 * 6e4) return {
    status: "calibrating",
    reason: "stale"
  };
  let bounds = quotaRateInterval(samples);
  let changedIntensity = false;
  while (!bounds.feasible && samples.length > 3) {
    samples = samples.slice(1);
    bounds = quotaRateInterval(samples);
    changedIntensity = true;
  }
  bounds = refineQuotaRate(samples, bounds);
  const spanMs = samples.at(-1).at - samples[0].at;
  const common = {
    sampleCount: samples.length,
    observedSpanMs: spanMs,
    consumedPercent: samples[0].remainingPercent - samples.at(-1).remainingPercent,
    lowerPacePerHour: bounds.min * 60,
    upperPacePerHour: bounds.max * 60,
    changedIntensity,
    rateMethod: bounds.method ?? "conservative"
  };
  if (!bounds.feasible) return {
    ...common,
    status: "calibrating",
    reason: "changing-pace"
  };
  if (resetsAt !== null && resetsAt <= now / 1e3) return {
    ...common,
    status: "calibrating",
    reason: "stale"
  };
  if (spanMs >= 5 * 6e4 && samples.length >= 3 && bounds.min <= 1e-9 && common.consumedPercent >= 1) {
    const pacePerHour2 = common.consumedPercent / (spanMs / HOUR_MS);
    return {
      ...common,
      status: "ready",
      provisional: true,
      pacePerHour: pacePerHour2,
      runwaySeconds: clampPercent(window.remainingPercent) / pacePerHour2 * 3600,
      survivesReset: false
    };
  }
  if (spanMs < 6e4 || bounds.min <= 1e-9) return {
    ...common,
    status: "calibrating",
    reason: "resolution"
  };
  const pacePerHour = (bounds.min + bounds.max) * 30;
  const remaining = clampPercent(window.remainingPercent);
  const runwayMinSeconds = Math.max(0, remaining - 1) / common.upperPacePerHour * 3600;
  const runwayMaxSeconds = Math.min(100, remaining + 1) / common.lowerPacePerHour * 3600;
  const resetSeconds = resetsAt === null ? null : resetsAt - now / 1e3;
  if (resetSeconds !== null && resetSeconds <= 0) return {
    ...common,
    status: "calibrating",
    reason: "stale"
  };
  return {
    ...common,
    status: "ready",
    pacePerHour,
    runwaySeconds: remaining / pacePerHour * 3600,
    runwayMinSeconds,
    runwayMaxSeconds,
    survivesReset: resetSeconds !== null && runwayMinSeconds >= resetSeconds
  };
}
function forecastUsage(usage, state = { windows: {} }, now = Date.now(), options = {}) {
  const observedAt = Number.isFinite(usage?.fetchedAt) ? usage.fetchedAt : now;
  if (observedAt > now || now - observedAt > 5 * 6e4) return {
    state,
    changed: false,
    usage: {
      ...usage,
      rateLimits: (usage?.rateLimits ?? []).map((limit) => ({
        ...limit,
        windows: limit.windows.map((window) => ({
          ...window,
          forecast: {
            status: "calibrating",
            reason: "stale"
          }
        }))
      }))
    }
  };
  let nextState = state;
  let changed = false;
  const rateLimits = (usage?.rateLimits ?? []).map((limit) => {
    const context = {
      scope: options.scope,
      limitId: limit.id
    };
    const observed = observeQuotaForecast(nextState, limit.windows, observedAt, context);
    nextState = observed.state;
    changed ||= observed.changed;
    return {
      ...limit,
      windows: limit.windows.map((window) => ({
        ...window,
        forecast: estimateQuotaForecast(nextState, window, now, context)
      }))
    };
  });
  return {
    state: nextState,
    changed,
    usage: {
      ...usage,
      rateLimits
    }
  };
}
function createQuotaForecastReader({ reader, enabled, now = Date.now, scope = () => "default", stateStore }) {
  let state = { windows: {} };
  let loaded = false;
  let loading;
  let generation = 0;
  let historyGeneration = 0;
  let persistence = Promise.resolve();
  const persist = (operation) => {
    const pending = persistence.then(operation);
    persistence = pending.catch(() => {
    });
    return pending;
  };
  const load = async () => {
    if (loaded) return;
    if (loading) return loading;
    const current = historyGeneration;
    const pending = Promise.resolve().then(() => stateStore?.load?.()).then((restored) => {
      if (current !== historyGeneration) return;
      if (restored?.windows !== null && typeof restored?.windows === "object") state = restored;
      loaded = true;
    }).finally(() => {
      if (loading === pending) loading = void 0;
    });
    loading = pending;
    return pending;
  };
  const clearHistory = (clearReader = true) => {
    generation += 1;
    historyGeneration += 1;
    state = { windows: {} };
    loaded = true;
    if (clearReader) reader.clear();
    return persist(() => stateStore?.clear?.());
  };
  return Object.freeze({
    async read(options) {
      const current = generation;
      const account = await scope();
      const usage = await reader.read(options);
      if (current !== generation) return usage;
      await load();
      const activeAccount = await scope();
      if (current !== generation || account !== activeAccount) return usage;
      if (!enabled()) {
        await clearHistory(false);
        return usage;
      }
      const forecast = forecastUsage(usage, state, now(), { scope: account });
      state = forecast.state;
      if (forecast.changed) await persist(() => stateStore?.save?.(forecast.state));
      return current === generation ? forecast.usage : usage;
    },
    clear: () => clearHistory(),
    clearCache() {
      generation += 1;
      reader.clear();
    },
    async clearScope(targetScope) {
      generation += 1;
      await load();
      const prefix = `[${JSON.stringify(cleanSegment(targetScope))},`;
      state = { windows: Object.fromEntries(Object.entries(state.windows).filter(([key]) => !key.startsWith(prefix))) };
      const snapshot = state;
      await persist(() => stateStore?.save?.(snapshot));
    }
  });
}
var DEFAULT_MAX_BYTES = 256 * 1024;
var MAX_WINDOWS = 128;
var MAX_SAMPLES = 192;
function sanitize(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value.windows === null || typeof value.windows !== "object" || Array.isArray(value.windows)) return void 0;
  const entries = Object.entries(value.windows);
  if (entries.length > MAX_WINDOWS) return void 0;
  const windows = {};
  for (const [key, record2] of entries) {
    if (key.length === 0 || key.length > 320 || record2 === null || typeof record2 !== "object" || !Array.isArray(record2.samples) || record2.samples.length > MAX_SAMPLES) return void 0;
    const resetsAt = record2.resetsAt === null ? null : Number(record2.resetsAt);
    if (resetsAt !== null && !Number.isFinite(resetsAt)) return void 0;
    const samples = [];
    for (const sample of record2.samples) {
      const at = Number(sample?.at);
      const remainingPercent = Number(sample?.remainingPercent);
      if (!Number.isFinite(at) || !Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100) return void 0;
      samples.push({
        at,
        remainingPercent
      });
    }
    windows[key] = {
      resetsAt,
      samples
    };
  }
  return { windows };
}
var QuotaForecastStateStore = class {
  constructor({ filename, maxBytes = DEFAULT_MAX_BYTES }) {
    this.filename = filename;
    this.maxBytes = maxBytes;
  }
  async load() {
    try {
      if ((await stat2(this.filename)).size > this.maxBytes) return void 0;
      return sanitize(JSON.parse(await readFile5(this.filename, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return void 0;
      throw error;
    }
  }
  async save(state) {
    const safe = sanitize(state);
    if (safe === void 0) throw new Error("Refusing to persist malformed quota forecast state");
    const data = `${JSON.stringify(safe)}
`;
    if (Buffer.byteLength(data) > this.maxBytes) throw new Error("Quota forecast state is too large");
    await mkdir4(dirname5(this.filename), {
      recursive: true,
      mode: 448
    });
    const temporary = `${this.filename}.${process.pid}.${randomUUID3()}.tmp`;
    let handle;
    try {
      handle = await open2(temporary, "wx", 384);
      await handle.writeFile(data);
      await handle.sync();
      await handle.close();
      handle = void 0;
      await rename3(temporary, this.filename);
    } finally {
      await handle?.close().catch(() => void 0);
      await rm3(temporary, { force: true }).catch(() => void 0);
    }
  }
  async clear() {
    await rm3(this.filename, { force: true });
  }
};
var CODEX_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
var CODEX_RESET_CONSUME_URL = `${CODEX_RESET_CREDITS_URL}/consume`;
var DEFAULT_CONFIRM_DELAY_MS = 5e3;
var DEFAULT_CHALLENGE_TTL_MS = 6e4;
var DEFAULT_TIMEOUT_MS = 15e3;
var MAX_COPY_LENGTH = 240;
var UNCERTAIN_RESET_RESULT = "Quota reset result is uncertain; retry this confirmation to check the same request";
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var requestSignal = (signal, timeoutMs) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
};
function safeCopy(value) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, MAX_COPY_LENGTH) : void 0;
}
function credentialsOf(auth, credential) {
  const access = auth?.auth?.apiKey;
  const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
  if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
  return {
    access,
    accountId
  };
}
function expirationOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (Number.isSafeInteger(value) && value > 0) return value * 1e3;
  if (typeof value === "string" && value.length > 0 && value.length <= 64) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  throw new Error("ChatGPT returned malformed quota reset details");
}
function parseDetails(value, now) {
  if (!record(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0 || !Array.isArray(value.credits)) throw new Error("ChatGPT returned malformed quota reset details");
  if (value.available_count === 0) throw new Error("No quota reset is available");
  const available = value.credits.filter((credit) => record(credit) && typeof credit.id === "string" && credit.id.length > 0 && credit.id.length <= 256 && typeof credit.status === "string" && credit.status.toLowerCase() === "available").map((credit) => {
    return {
      credit,
      expiresAt: expirationOf(credit.expires_at)
    };
  }).filter(({ expiresAt }) => expiresAt === void 0 || expiresAt > now).sort((a, b) => (a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER));
  if (available.length === 0) throw new Error("No usable quota reset is available");
  return {
    availableCount: value.available_count,
    credits: available.map(({ credit, expiresAt }, index) => ({
      creditId: credit.id,
      title: safeCopy(credit.title),
      description: safeCopy(credit.description),
      creditExpiresAt: expiresAt,
      index
    }))
  };
}
function parseConsumeResult(value) {
  if (!record(value) || ![
    "reset",
    "nothing_to_reset",
    "no_credit",
    "already_redeemed"
  ].includes(value.code)) throw new Error("ChatGPT returned an unreadable quota reset response");
  const windowsReset = Array.isArray(value.windows_reset) ? value.windows_reset.filter((item) => typeof item === "string").slice(0, 16) : [];
  const windowsResetCount = Number.isSafeInteger(value.windows_reset) && value.windows_reset >= 0 && value.windows_reset <= 16 ? value.windows_reset : void 0;
  return {
    code: value.code,
    windowsReset,
    ...windowsResetCount === void 0 ? {} : { windowsResetCount }
  };
}
function createCodexResetCreditService(options) {
  const getAuth = options.getAuth;
  const readCredential = options.readCredential;
  const usageReader = options.usageReader;
  const fetchReset = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const randomUUID$1 = options.randomUUID ?? randomUUID3;
  const confirmDelayMs = options.confirmDelayMs ?? DEFAULT_CONFIRM_DELAY_MS;
  const challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const challenges = /* @__PURE__ */ new Map();
  const creditRefs = /* @__PURE__ */ new Map();
  let creditRefSequence = 0;
  const rememberCreditRef = (accountId, credit) => {
    const ref = `${randomUUID$1()}-${++creditRefSequence}`;
    creditRefs.set(ref, {
      accountId,
      creditId: credit.creditId,
      index: credit.index
    });
    while (creditRefs.size > 64) creditRefs.delete(creditRefs.keys().next().value);
    return ref;
  };
  const publicCredit = (accountId, credit) => ({
    ref: rememberCreditRef(accountId, credit),
    ...credit.title === void 0 ? {} : { name: credit.title },
    ...credit.creditExpiresAt === void 0 ? {} : { expiresAt: credit.creditExpiresAt }
  });
  const resolveCredentials = async (signal) => credentialsOf(await getAuth({ signal }), await readCredential({ signal }));
  const readDetails = async (signal, credentials) => {
    const { access, accountId } = credentials ?? await resolveCredentials(signal);
    const response = await fetchReset(CODEX_RESET_CREDITS_URL, {
      method: "GET",
      redirect: "error",
      headers: {
        authorization: `Bearer ${access}`,
        "chatgpt-account-id": accountId,
        accept: "application/json",
        "cache-control": "no-store",
        "user-agent": USER_AGENT
      },
      signal: requestSignal(signal, timeoutMs)
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT quota reset request failed (HTTP ${response.status})`);
    let raw;
    try {
      raw = await response.json();
    } catch {
      throw new Error("ChatGPT returned unreadable quota reset details");
    }
    return {
      accountId,
      details: parseDetails(raw, now())
    };
  };
  return Object.freeze({
    async inspect({ signal } = {}) {
      const { accountId, details } = await readDetails(signal);
      return {
        availableCount: details.availableCount,
        credits: details.credits.map((credit) => publicCredit(accountId, credit)),
        ...details.credits[0]?.creditExpiresAt === void 0 ? {} : { nextExpiresAt: details.credits[0].creditExpiresAt }
      };
    },
    async prepare({ creditRef, signal } = {}) {
      const credentials = await resolveCredentials(signal);
      for (const [challengeId2, challenge] of challenges) {
        if (challenge.accountId === credentials.accountId && challenge.uncertain === false && challenge.creditRef === creditRef) if (now() > challenge.expiresAt) challenges.delete(challengeId2);
        else return {
          challengeId: challengeId2,
          availableCount: challenge.availableCount,
          readyAt: challenge.readyAt,
          expiresAt: challenge.expiresAt,
          ...challenge.creditExpiresAt === void 0 ? {} : { creditExpiresAt: challenge.creditExpiresAt },
          ...challenge.title === void 0 ? {} : { title: challenge.title },
          ...challenge.description === void 0 ? {} : { description: challenge.description }
        };
        if (challenge.accountId !== credentials.accountId || challenge.uncertain !== true || creditRef !== void 0 && challenge.creditRef !== creditRef) continue;
        if (now() > challenge.expiresAt) {
          challenges.delete(challengeId2);
          continue;
        }
        return {
          challengeId: challengeId2,
          availableCount: challenge.availableCount,
          readyAt: challenge.readyAt,
          expiresAt: challenge.expiresAt,
          ...challenge.creditExpiresAt === void 0 ? {} : { creditExpiresAt: challenge.creditExpiresAt },
          ...challenge.title === void 0 ? {} : { title: challenge.title },
          ...challenge.description === void 0 ? {} : { description: challenge.description }
        };
      }
      const { accountId, details } = await readDetails(signal, credentials);
      let selected = details.credits[0];
      if (creditRef !== void 0) {
        const reference = typeof creditRef === "string" ? creditRefs.get(creditRef) : void 0;
        if (reference === void 0 || reference.accountId !== accountId) throw new Error("This quota reset confirmation is no longer valid");
        selected = details.credits.find((credit) => credit.creditId === reference.creditId && credit.index === reference.index);
        if (selected === void 0) throw new Error("This quota reset confirmation is no longer valid");
      }
      if (selected === void 0) throw new Error("No usable quota reset is available");
      const preparedAt = now();
      const readyAt = preparedAt + confirmDelayMs;
      const expiresAt = Math.min(preparedAt + challengeTtlMs, selected.creditExpiresAt ?? Number.MAX_SAFE_INTEGER);
      if (expiresAt <= readyAt) throw new Error("The available quota reset expires too soon");
      const challengeId = randomUUID$1();
      challenges.set(challengeId, {
        state: "prepared",
        accountId,
        creditRef,
        creditId: selected.creditId,
        redeemRequestId: randomUUID$1(),
        readyAt,
        expiresAt,
        availableCount: details.availableCount,
        creditExpiresAt: selected.creditExpiresAt,
        title: selected.title,
        description: selected.description,
        uncertain: false
      });
      return {
        challengeId,
        availableCount: details.availableCount,
        readyAt,
        expiresAt,
        ...selected.creditExpiresAt === void 0 ? {} : { creditExpiresAt: selected.creditExpiresAt },
        ...selected.title === void 0 ? {} : { title: selected.title },
        ...selected.description === void 0 ? {} : { description: selected.description }
      };
    },
    async consume({ challengeId, acknowledged, signal } = {}) {
      const challenge = typeof challengeId === "string" ? challenges.get(challengeId) : void 0;
      if (challenge === void 0) throw new Error("This quota reset confirmation is no longer valid");
      if (challenge.state === "pending") throw new Error("This quota reset is already in progress");
      if (now() < challenge.readyAt) throw new Error("Wait before confirming this quota reset");
      if (now() > challenge.expiresAt) {
        challenges.delete(challengeId);
        throw new Error("This quota reset confirmation is no longer valid");
      }
      if (acknowledged !== true) throw new Error("You must acknowledge that this may consume one quota reset");
      challenge.state = "pending";
      let retryable = challenge.uncertain === true;
      try {
        const { access, accountId } = await resolveCredentials(signal);
        if (accountId !== challenge.accountId) {
          retryable = false;
          throw new Error("The signed-in ChatGPT account changed");
        }
        let response;
        try {
          response = await fetchReset(CODEX_RESET_CONSUME_URL, {
            method: "POST",
            redirect: "error",
            headers: {
              authorization: `Bearer ${access}`,
              "chatgpt-account-id": accountId,
              accept: "application/json",
              "content-type": "application/json",
              "cache-control": "no-store",
              "user-agent": USER_AGENT
            },
            body: JSON.stringify({
              redeem_request_id: challenge.redeemRequestId,
              credit_id: challenge.creditId
            }),
            signal: requestSignal(signal, timeoutMs)
          });
        } catch {
          retryable = true;
          throw new Error(UNCERTAIN_RESET_RESULT);
        }
        if (!response.ok) {
          if (response.status >= 500) {
            retryable = true;
            throw new Error(UNCERTAIN_RESET_RESULT);
          }
          if (response.status !== 401 && response.status !== 403) retryable = false;
          throw new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT quota reset request failed (HTTP ${response.status})`);
        }
        let raw;
        try {
          raw = await response.json();
        } catch {
          retryable = true;
          throw new Error(UNCERTAIN_RESET_RESULT);
        }
        let result2;
        try {
          result2 = parseConsumeResult(raw);
        } catch {
          retryable = true;
          throw new Error(UNCERTAIN_RESET_RESULT);
        }
        retryable = false;
        usageReader.clear();
        return result2;
      } finally {
        if (retryable && now() <= challenge.expiresAt) {
          challenge.state = "prepared";
          challenge.uncertain = true;
        } else challenges.delete(challengeId);
      }
    },
    clear() {
      challenges.clear();
      creditRefs.clear();
    }
  });
}
var publicError = (code, message) => ({
  ok: false,
  error: {
    code,
    message,
    details: { issues: [] }
  }
});
function createSubscriptionRpcHandler({ authHandler, usageReader, accountVault, network, resetCreditService, preferences, diagnosticsReader, modelCatalog, originalImages, resolveInheritedOriginal }) {
  return async (endpoint, payload, signal) => {
    if (endpoint === "image/original/chunk") try {
      signal.throwIfAborted();
      if (typeof payload?.sessionId !== "string" || payload.sessionId.length === 0 || payload.sessionId.length > 512 || typeof payload?.assetId !== "string" || !ORIGINAL_IMAGE_ID_PATTERN.test(payload.assetId) || !Number.isSafeInteger(payload?.offset) || payload.offset < 0 || payload.offset % 4194304 !== 0) return publicError("invalid-input", "Invalid original image request");
      const inherited = resolveInheritedOriginal?.(payload.sessionId, payload.assetId);
      const chunk = await originalImages?.chunk(payload.sessionId, payload.assetId, payload.offset, inherited);
      if (chunk === void 0) return publicError("not-found", "Original image is unavailable");
      return {
        ok: true,
        value: chunk
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return publicError("internal", "Could not read the original image");
    }
    if (endpoint === "diagnostics") try {
      signal.throwIfAborted();
      return {
        ok: true,
        value: await diagnosticsReader()
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return publicError("internal", "Could not create support diagnostics");
    }
    if (endpoint === "preferences/models") try {
      signal.throwIfAborted();
      if (typeof modelCatalog?.refresh !== "function" || typeof preferences?.status !== "function") return publicError("internal", "Could not refresh Codex model catalog");
      await modelCatalog.refresh({ signal });
      const value = preferences.status();
      return {
        ok: true,
        value: {
          contextModels: Array.isArray(value?.contextModels) ? value.contextModels : [],
          verbosityModels: Array.isArray(value?.verbosityModels) ? value.verbosityModels : [],
          fastModels: Array.isArray(value?.fastModels) ? value.fastModels : [],
          catalogStatus: value?.catalogStatus
        }
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return publicError("internal", "Could not refresh Codex model catalog");
    }
    if (endpoint === "preferences/status" || endpoint === "preferences/update") try {
      signal.throwIfAborted();
      if (endpoint === "preferences/update") {
        const patch = capabilityPatch(payload);
        for (const [field, rule] of Object.entries(PREFERENCE_FIELDS)) {
          if (!Object.hasOwn(payload ?? {}, field)) continue;
          if (!rule.choices.includes(payload[field])) return publicError("internal", rule.error);
          patch[field] = payload[field];
        }
        if (Object.hasOwn(payload ?? {}, "customContextWindow")) {
          if (normalizeCustomContextWindow(payload["customContextWindow"]) !== payload["customContextWindow"]) return publicError("internal", "Invalid custom context window");
          patch[CUSTOM_CONTEXT_WINDOW_FIELD] = payload[CUSTOM_CONTEXT_WINDOW_FIELD];
        }
        for (const [modelKey, field] of Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS)) {
          if (!Object.hasOwn(payload ?? {}, field)) continue;
          if (normalizeCustomContextWindow(payload[field], CUSTOM_CONTEXT_MODEL_CAPS[modelKey]) !== payload[field]) return publicError("internal", "Invalid custom model context window");
          patch[field] = payload[field];
        }
        if (Object.keys(patch).length === 0) return publicError("internal", "Invalid preference update");
        await preferences.update(patch);
      }
      return {
        ok: true,
        value: preferences.status()
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return publicError("internal", "Could not update preferences");
    }
    if (endpoint === "usage") try {
      signal.throwIfAborted();
      if (typeof payload?.id === "string" && accountVault) {
        const cred = await accountVault.readById(payload.id);
        if (cred?.access) {
          const jwtPayload = decodeJwtPayload(cred.access);
          const accountId = cred.accountId ?? jwtPayload?.["https://api.openai.com/auth"]?.account_id ?? jwtPayload?.["https://api.openai.com/auth"]?.user_id;
          if (accountId) {
            const response = await (network?.fetch ? network.fetch("quota", CODEX_USAGE_URL, {
              method: "GET",
              redirect: "error",
              headers: {
                authorization: `Bearer ${cred.access}`,
                "chatgpt-account-id": accountId,
                accept: "application/json",
                "cache-control": "no-store",
                "user-agent": USER_AGENT
              },
              signal: requestSignal$1(signal, DEFAULT_TIMEOUT_MS$1)
            }) : fetch(CODEX_USAGE_URL, {
              method: "GET",
              redirect: "error",
              headers: {
                authorization: `Bearer ${cred.access}`,
                "chatgpt-account-id": accountId,
                accept: "application/json",
                "cache-control": "no-store",
                "user-agent": USER_AGENT
              },
              signal: requestSignal$1(signal, DEFAULT_TIMEOUT_MS$1)
            }));
            if (response.ok) {
              const value = await response.json();
              return {
                ok: true,
                value: parseCodexUsage(value)
              };
            }
          }
        }
      }
      return {
        ok: true,
        value: await usageReader.read({
          force: payload?.force === true,
          signal
        })
      };
    } catch (error) {
      if (signal.aborted) throw error;
      const known = /* @__PURE__ */ new Set(["ChatGPT subscription is not signed in", "ChatGPT sign-in needs to be renewed"]);
      const message = error instanceof Error && known.has(error.message) ? error.message : "Could not read ChatGPT usage";
      return publicError("internal", message);
    }
    if (endpoint === "reset-credit/inspect" || endpoint === "reset-credit/prepare" || endpoint === "reset-credit/consume") try {
      signal.throwIfAborted();
      return {
        ok: true,
        value: endpoint === "reset-credit/inspect" ? await resetCreditService.inspect({ signal }) : endpoint === "reset-credit/prepare" ? await resetCreditService.prepare({
          creditRef: payload?.creditRef,
          signal
        }) : await resetCreditService.consume({
          challengeId: payload?.challengeId,
          acknowledged: payload?.acknowledged,
          signal
        })
      };
    } catch (error) {
      if (signal.aborted) throw error;
      const known = /* @__PURE__ */ new Set([
        "ChatGPT subscription is not signed in",
        "ChatGPT sign-in needs to be renewed",
        "No quota reset is available",
        "No usable quota reset is available",
        "The available quota reset expires too soon",
        "This quota reset confirmation is no longer valid",
        "This quota reset is already in progress",
        "Wait before confirming this quota reset",
        "You must acknowledge that one quota reset will be consumed",
        "The signed-in ChatGPT account changed"
      ]);
      const fallback = endpoint === "reset-credit/inspect" ? "Could not read quota reset details" : endpoint === "reset-credit/prepare" ? "Could not prepare a quota reset" : "Could not use the quota reset";
      const message = error instanceof Error && known.has(error.message) ? error.message : fallback;
      return publicError("internal", message);
    }
    const result2 = await authHandler(endpoint, payload, signal);
    if (endpoint === "account/remove" && result2.ok === true && typeof payload?.id === "string") await usageReader.clearScope(payload.id);
    if (endpoint === "logout" && result2.ok === true) {
      await usageReader.clear();
      resetCreditService.clear();
      modelCatalog?.clear();
    } else if (result2.ok === true && (endpoint === "account/select" || endpoint === "account/remove" || endpoint === "login/status" && result2.value?.authenticated === true)) {
      usageReader.clearCache();
      resetCreditService.clear();
      modelCatalog?.clear();
      modelCatalog?.refresh({ signal: void 0 }).catch(() => {
      });
    } else if (result2.ok === true && (endpoint === "status" || result2.value?.authenticated === true)) modelCatalog?.refresh({ signal: void 0 }).catch(() => {
    });
    return result2;
  };
}
var PROVIDER = "openai-codex";
var OAUTH_EXPIRY_SKEW_MS = 6e4;
var CREDENTIAL_REF = dshCredentials.credentialRef("OPENAI_CODEX_SUBSCRIPTION_OAUTH");
var LEGACY_CREDENTIAL_REF = dshCredentials.credentialRef("WSL043_OPENAI_CODEX_OAUTH");
var ACCOUNT_VAULT_KEY = typeof dshCredentials.credentialKey === "function" ? dshCredentials.credentialKey("codex-subscription", "accounts") : void 0;
var WEB_ENTRY_ID = "web";
var DSH_SEARCH_PROVIDER_FALLBACK = "deepseek-official";
var MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
var REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
var REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
function createSearchProviderSwitcher(loader) {
  const webEntry = () => [...loader.entries()].find((entry) => entry.options?.id === WEB_ENTRY_ID);
  const dshProviderId = () => {
    const baseConfig = webEntry()?.options?.config ?? {};
    return typeof baseConfig.searchProvider === "string" && baseConfig.searchProvider.length > 0 ? baseConfig.searchProvider : DSH_SEARCH_PROVIDER_FALLBACK;
  };
  return Object.freeze({
    dshProviderId,
    async select(selection) {
      const entry = webEntry();
      const fiber = entry?.fiber;
      if (entry === void 0 || fiber === void 0 || typeof fiber.update !== "function") throw new Error("DSH web runtime is unavailable");
      const baseConfig = entry.options?.config ?? {};
      const currentConfig = fiber.config ?? baseConfig;
      const dshProvider = dshProviderId();
      const provider = selection === "codex" ? CODEX_SEARCH_PROVIDER_ID : selection === "auto" ? CODEX_AUTO_SEARCH_PROVIDER_ID : dshProvider;
      if (currentConfig.searchProvider === provider) return;
      await fiber.update({
        ...currentConfig,
        searchProvider: provider
      }, true);
    }
  });
}
function apply5(ctx) {
  const settings = ctx.settings.register(SETTINGS_NAMESPACE, z4.object({
    ...Object.fromEntries(Object.entries(PREFERENCE_FIELDS).map(([field, rule]) => [field, rule.default === void 0 ? z4.union(rule.choices) : z4.union(rule.choices).default(rule.default)])),
    imageModel: z4.union(Object.keys(IMAGE_MODELS)).default(DEFAULT_IMAGE_MODEL),
    imageQuality: z4.union([
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]).default("auto"),
    ...Object.fromEntries(Object.entries(IMAGE_FEATURE_DEFAULTS).map(([key, value]) => [key, z4.boolean().default(value)])),
    [CUSTOM_CONTEXT_OVERRIDES_FIELD]: z4.dict(z4.number().step(1).min(1).max(MAX_CONTEXT_BUDGET)).default({}),
    [SEARCH_MODE_FIELD]: z4.union(SEARCH_MODES).default("live"),
    [SEARCH_DOMAINS_FIELD]: z4.transform(z4.array(z4.string()).max(20), (value) => readCapabilitySettings({ searchDomains: value }).searchDomains).default([]),
    ...Object.fromEntries(QUOTA_THRESHOLD_FIELDS.map((key) => [key, z4.number().step(1).min(1).max(100).default(20)])),
    [QUOTA_ALERTS_FIELD]: z4.union(QUOTA_ALERT_MODES).default("important"),
    [LEGACY_QUICK_QUOTA_FIELD]: z4.boolean(),
    [CUSTOM_CONTEXT_WINDOW_FIELD]: z4.number().step(1).min(128e3).max(1e6).default(DEFAULT_CUSTOM_CONTEXT_WINDOW),
    ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, z4.number().step(1).min(128e3).max(CUSTOM_CONTEXT_MODEL_CAPS[modelKey]).default(CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey])]))
  }));
  const searchProvider = createSearchProviderSwitcher(ctx.loader);
  const network = createCodexNetworkTransport();
  const originalImages = new OriginalImageStore();
  const accountVault = ACCOUNT_VAULT_KEY !== void 0 && typeof ctx.credentials.readRecord === "function" && typeof ctx.credentials.modifyRecord === "function" && typeof ctx.credentials.deleteRecord === "function" ? new DshOAuthAccountVault(ctx.credentials, {
    key: ACCOUNT_VAULT_KEY,
    legacyRef: CREDENTIAL_REF,
    legacyRefs: [LEGACY_CREDENTIAL_REF]
  }) : void 0;
  const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF], {
    expirySkewMs: OAUTH_EXPIRY_SKEW_MS,
    vault: accountVault
  });
  const baseProvider = createOpenAICodexProvider();
  let resolveAuth = async () => void 0;
  const modelCatalog = createOfficialModelCatalog({
    getAuth: (options) => resolveAuth(options),
    readCredential: (options) => store.read(PROVIDER, options),
    baseModels: () => baseProvider.getModels(),
    fetch: (input, init) => network.fetch("catalog", input, init)
  });
  const provider = openaiCodexSubscriptionProvider({
    resolveSpeedMode: () => settings.get()[SPEED_MODE_FIELD],
    resolveOutputVerbosity: () => normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
    resolveContextMode: () => normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
    resolveCustomContextWindow: (modelKey) => {
      const overrides = readCapabilitySettings(settings.get())[CUSTOM_CONTEXT_OVERRIDES_FIELD];
      if (Object.hasOwn(overrides, modelKey)) return overrides[modelKey];
      const field = CUSTOM_CONTEXT_MODEL_FIELDS[modelKey];
      if (field === void 0) return void 0;
      return normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey]);
    },
    catalog: modelCatalog,
    runNetwork: network.run
  });
  const preferences = {
    status: () => ({
      ...readCapabilitySettings(settings.get()),
      [QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(settings.get()[QUICK_QUOTA_MODE_FIELD], settings.get()[LEGACY_QUICK_QUOTA_FIELD]),
      [SEARCH_PROVIDER_FIELD]: settings.get()[SEARCH_PROVIDER_FIELD],
      [SPEED_MODE_FIELD]: settings.get()[SPEED_MODE_FIELD],
      [OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
      [CONTEXT_MODE_FIELD]: normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
      [CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(settings.get()[CUSTOM_CONTEXT_WINDOW_FIELD]),
      ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
      contextModels: contextModelGroups(modelCatalog.getModels(baseProvider.getModels())),
      catalogStatus: modelCatalog.status(),
      verbosityModels: provider.getModels().filter((model) => modelCatalog.metadata(model.id)?.supportVerbosity ?? model.id !== "gpt-5.3-codex-spark").map((model) => model.id),
      fastModels: provider.getModels().filter((model) => modelCatalog.metadata(model.id)?.supportsFast ?? supportsCodexFastMode(model.id)).map((model) => model.id),
      writable: ctx.settings.writable
    }),
    update: (patch) => settings.update(patch)
  };
  const authModels = createModels({ credentials: store });
  authModels.setProvider(provider);
  const profile = Object.freeze({
    provider: PROVIDER,
    displayName: "ChatGPT subscription",
    piProvider: provider,
    configuredMaxTokens: /* @__PURE__ */ new Map(),
    modelErrors: /* @__PURE__ */ new Map(),
    streamIdleTimeoutMs: 600 * 1e3,
    maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
    cacheRetention: "short",
    transport: "sse"
  });
  let profileKey;
  let profileSnapshot;
  const profiles = () => {
    const key = JSON.stringify([
      modelCatalog.revision(),
      normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
      settings.get()[CUSTOM_CONTEXT_OVERRIDES_FIELD],
      ...Object.values(CUSTOM_CONTEXT_MODEL_FIELDS).map((field) => settings.get()[field])
    ]);
    if (key !== profileKey) {
      profileKey = key;
      profileSnapshot = /* @__PURE__ */ new Map([[PROVIDER, profile]]);
    }
    return profileSnapshot;
  };
  resolveAuth = () => authModels.getAuth(PROVIDER);
  const adapterAuth = Object.freeze({
    credentials: store,
    authContext: Object.freeze({
      env: async () => void 0,
      fileExists: async () => false
    })
  });
  ctx.effect(() => watchImageTool(settings, () => ctx.tools.register(createCodexImageTool({
    getFeatures: () => settings.get(),
    getAuth: resolveAuth,
    readCredential: (options) => store.read(PROVIDER, options),
    attachments: ctx.attachments,
    getSessionMessages: (sessionId) => ctx.get?.("sessions")?.get?.(sessionId)?.deriveMessages?.() ?? [],
    originalImages,
    fetch: (input, init) => network.fetch("image", input, init)
  }))), "codex-subscription: image tool availability");
  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey: async () => {
      let resolved;
      try {
        resolved = await resolveAuth();
      } catch {
        throw new LlmError2("ChatGPT subscription authorization failed", "AUTH_FAILED");
      }
      if (typeof resolved?.auth.apiKey !== "string" || resolved.auth.apiKey.length === 0) throw new LlmError2("ChatGPT subscription is not signed in", "MISSING_CREDENTIAL");
      return resolved.auth.apiKey;
    },
    auth: adapterAuth,
    resolveAttachments: () => ctx.get?.("attachments")
  });
  ctx.llm.registerAdapter([PROVIDER], adapter);
  const currentAgent = () => ctx.get?.("agents")?.currentInitiator?.();
  const codexSearch = createCodexSearchProvider({
    resolvePreferences: () => readCapabilitySettings(settings.get()),
    getAuth: resolveAuth,
    readCredential: (options) => store.read(PROVIDER, options),
    resolveModel: () => {
      const request2 = currentAgent()?.session.requestContext?.();
      return request2?.provider === PROVIDER ? request2.model : void 0;
    },
    resolveSessionId: () => currentAgent()?.session.id,
    fetch: (input, init) => network.fetch("search", input, init)
  });
  ctx.web.registerSearchProvider(codexSearch);
  ctx.web.registerSearchProvider(createCodexAutoSearchProvider({
    codex: codexSearch,
    resolveModelProvider: () => currentAgent()?.session.requestContext?.()?.provider,
    resolveDshProvider: () => ctx.web.searchProviders?.get(searchProvider.dshProviderId())
  }));
  ctx.effect(() => {
    const select = async (value) => {
      try {
        await searchProvider.select(value[SEARCH_PROVIDER_FIELD]);
      } catch (error) {
        ctx.logger?.warn?.("could not select the configured web search provider: %s", error.message);
      }
    };
    select(settings.get());
    return settings.watch(select);
  }, "codex-subscription: search provider selection");
  const auth = createCodexAuthService(authModels, store, {
    runLogin: (operation) => network.run("login", operation),
    accountVault,
    createLoginModels: (credentials) => {
      const loginModels = createModels({ credentials });
      loginModels.setProvider(provider);
      return loginModels;
    }
  });
  const coordinator = new CodexLoginCoordinator(auth);
  const usageReader = createQuotaForecastReader({
    reader: createCodexUsageReader({
      getAuth: resolveAuth,
      readCredential: (options) => store.read(PROVIDER, options),
      fetch: (input, init) => network.fetch("quota", input, init)
    }),
    enabled: () => normalizeQuickQuotaMode(settings.get()[QUICK_QUOTA_MODE_FIELD], settings.get()[LEGACY_QUICK_QUOTA_FIELD]) === QUICK_QUOTA_MODE_FORECAST,
    scope: async () => await accountVault?.activeId() ?? "legacy",
    stateStore: new QuotaForecastStateStore({ filename: dshHomePath("state", "codex-subscription", "quota-forecast.json") })
  });
  ctx.effect(() => {
    let forecasting = false;
    const warmForecast = (value) => {
      if (!(normalizeQuickQuotaMode(value["quickQuotaMode"], value["quickQuotaVisible"]) === "forecast")) {
        if (forecasting) usageReader.clear().catch((error) => ctx.logger?.debug?.("could not clear Codex quota forecast: %s", error.message));
        forecasting = false;
        return;
      }
      forecasting = true;
      usageReader.read().catch((error) => ctx.logger?.debug?.("could not warm Codex quota forecast: %s", error.message));
    };
    warmForecast(settings.get());
    const unwatch = settings.watch(warmForecast);
    return () => {
      unwatch();
      usageReader.clearCache();
    };
  }, "codex-subscription: quota forecast warm-up");
  const resetCreditService = createCodexResetCreditService({
    getAuth: resolveAuth,
    readCredential: (options) => store.read(PROVIDER, options),
    usageReader,
    fetch: (input, init) => network.fetch("quota-reset", input, init)
  });
  const handler = createSubscriptionRpcHandler({
    authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
    usageReader,
    accountVault,
    network,
    resetCreditService,
    preferences,
    diagnosticsReader: () => createSubscriptionDiagnostics({
      auth,
      preferences,
      login: coordinator.supportState(),
      network,
      modelCatalog
    }),
    modelCatalog,
    originalImages,
    resolveInheritedOriginal: (sessionId, assetId) => inheritedOriginalImageRef(ctx.get?.("sessions")?.get?.(sessionId), assetId)
  });
  ctx.effect(() => {
    modelCatalog.refresh().catch((error) => ctx.logger?.debug?.("could not refresh Codex model catalog: %s", error.message));
  }, "codex-subscription: official model catalog");
  ctx.inject(["connection"], (connectionContext) => connectionContext.effect(() => registerSubscriptionTransport(connectionContext.connection, handler), "codex-subscription: DSH-trusted account RPC"));
}

// src/index.ts
init_search();
init_image();
init_video();
var name = "provider-extension";
var inject = [
  "llm",
  "attachments",
  "credentials",
  "settings",
  "web",
  "loader",
  "tools"
];
function apply6(ctx) {
  apply4(ctx);
  ctx.inject(["web"], (webCtx) => {
    apply2(webCtx);
  });
  ctx.inject(["tools", "attachments", "fs"], (toolsCtx) => {
    apply(toolsCtx);
  });
  ctx.inject(["tools", "fs"], (videoCtx) => {
    apply3(videoCtx);
  });
  apply5(ctx);
}
export {
  AGY_PROVIDER_USER_AGENT,
  ANALYZE_VIDEO_TOOL_NAME,
  ANTIGRAVITY_AUTH_RPC_CHANNEL,
  ANTIGRAVITY_AUTH_RPC_NAMESPACE,
  ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT,
  ANTIGRAVITY_GENERATE_ENDPOINT,
  ANTIGRAVITY_LLM_ROUTE,
  ANTIGRAVITY_MODEL_CATALOG_STATES,
  ANTIGRAVITY_PLUGIN_ID,
  ANTIGRAVITY_PROVIDER,
  ANTIGRAVITY_QUOTA_ENDPOINT,
  ANTIGRAVITY_REPLAY_VERSION,
  ANTIGRAVITY_REVOKE_ENDPOINT,
  ANTIGRAVITY_SEARCH_PROVIDER_ID,
  ANTIGRAVITY_STREAM_ENDPOINT,
  ANTIGRAVITY_TOKEN_ENDPOINT,
  ANTIGRAVITY_WIRE_ORIGIN,
  ANTIGRAVITY_WIRE_ORIGINS,
  ANTIGRAVITY_WIRE_PATHS,
  AntigravityAdapter,
  AntigravityAuthService,
  AntigravitySearchProvider,
  CAPABILITY_GATE_OUTCOMES,
  CAPABILITY_ROW_IDS,
  CredentialOperationError,
  DEFAULT_INLINE_IMAGE_BYTES,
  DEFAULT_PRIVATE_FRAME_BYTES,
  DEFAULT_PRIVATE_IDLE_TIMEOUT_MS,
  DEFAULT_PRIVATE_REQUEST_BYTES,
  DEFAULT_PRIVATE_RESPONSE_BYTES,
  DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS,
  DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS,
  DEFAULT_VIDEO_BYTES,
  DSH_ATTRIBUTION_HEADER,
  GENERATE_IMAGE_TOOL_NAME,
  IMAGE_HANDLE_PATTERN,
  LIST_IMAGES_TOOL_NAME,
  LIVE_ACKNOWLEDGEMENT,
  LIVE_GATE_IDS,
  LLM_FAMILY_IDS,
  MAX_PRIVATE_REQUEST_BYTES,
  MediaAdmissionError,
  PROJECT_DISCOVERY_ENDPOINT,
  PROJECT_DISCOVERY_PATH,
  PrivateTransportError,
  ProjectDiscoveryError,
  QUOTA_REFRESH_MIN_INTERVAL_MS,
  QuotaNormalizationError,
  WireIdentityError,
  admitBase64Image,
  admitImageBytes,
  admitSessionImage,
  admitWorkspaceImage,
  admitWorkspaceVideo,
  antigravityModelFamily,
  apply6 as apply,
  assertPrivateEndpoint,
  assertWireIdentityInvariant,
  buildAntigravityGeneratePayload,
  buildFunctionDeclarations,
  buildWireIdentityHeaders,
  compatibleReplayState,
  createAntigravityAuthRpcClient,
  createAntigravityAuthService,
  createCredentialCoordinator,
  createFileCapabilityGates,
  createGoogleRefreshTransport,
  createGoogleRevokeTransport,
  createMemoryCapabilityGates,
  createPrivateTransport,
  createProjectContext,
  createProjectDiscovery,
  createQuotaService,
  createReplayState,
  createStatusView,
  createWireIdentity,
  credentialErrorMessage,
  defaultCapabilityGatePath,
  detectImageMediaType,
  imageHandle,
  inject,
  isMp4,
  iteratePrivateSse,
  maskEmail,
  name,
  normalizeProjectId,
  normalizeQuotaResponse,
  parseModelCatalogResult,
  parseStatusResult,
  parseUsageResult,
  privateStatusError,
  readPrivateBytes,
  readPrivateText,
  runLiveGateCli,
  sanitizeToolSchemas,
  sessionImageCatalog
};
//# sourceMappingURL=index.js.map
