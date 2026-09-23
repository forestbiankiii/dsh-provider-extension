/** Host dispatcher protected by the Antigravity account RPC activation guard. */

import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection'
import { OAuthFlowError } from './oauth-flow.ts'
import { CredentialOperationError, credentialErrorMessage } from './credential-coordinator.ts'
import type { BootstrapStatusService } from './status.ts'
import type { QuotaStatusView } from './quota.ts'
import type { AntigravityAccountView } from './auth-service.ts'
import { isSafeRpcErrorCode, safeRpcErrorMessage } from './rpc-vocabulary.ts'
import type { AntigravityModelCatalogService } from './model-catalog.ts'

export { ANTIGRAVITY_AUTH_RPC_CHANNEL, ANTIGRAVITY_AUTH_RPC_NAMESPACE } from './rpc-contract.ts'

export type AntigravityRpcAuthService = Pick<BootstrapStatusService, 'status' | 'acknowledgeRisk' | 'startLogin' | 'cancelLogin' | 'logout' | 'revoke'> & {
  usage?: (signal?: AbortSignal, force?: boolean) => Promise<QuotaStatusView>
  accounts?: () => Promise<readonly AntigravityAccountView[]>
  selectAccount?: (id: string) => Promise<readonly AntigravityAccountView[]>
  updateAccount?: (id: string, patch: { label?: string | undefined; tier?: string | undefined }) => Promise<readonly AntigravityAccountView[]>
  renameAccount?: (id: string, label: string) => Promise<readonly AntigravityAccountView[]>
  removeAccount?: (id: string) => Promise<readonly AntigravityAccountView[]>
}

/** Dispatch closed, value-safe requests; callback URLs are never echoed. */
export async function handleAntigravityAuthRpc(
  service: AntigravityRpcAuthService,
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
  modelCatalog?: AntigravityModelCatalogService,
): Promise<RpcResult<unknown>> {
  if (signal?.aborted === true) return cancelled()

  try {
    if (endpoint === 'status') {
      if (!isEmptyRecord(payload)) return badRequest('status expects an empty payload')
      const status = await service.status()
      const accounts = service.accounts ? await service.accounts() : []
      return { ok: true, value: { status, accounts } }
    }
    if (endpoint === 'accounts') {
      const accounts = service.accounts ? await service.accounts() : []
      return { ok: true, value: { accounts } }
    }
    if (endpoint === 'account/select') {
      const rec = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
      const id = typeof rec.id === 'string' ? rec.id : undefined
      if (id === undefined || id.length === 0) return badRequest('account/select expects { id: string }')
      const accounts = service.selectAccount ? await service.selectAccount(id) : []
      return { ok: true, value: { accounts } }
    }
    if (endpoint === 'account/update') {
      const rec = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
      const id = typeof rec.id === 'string' ? rec.id : undefined
      const label = typeof rec.label === 'string' ? rec.label.trim() : undefined
      const tier = typeof rec.tier === 'string' ? rec.tier.trim() : undefined
      if (!id) return badRequest('account/update expects { id: string }')
      const accounts = service.updateAccount ? await service.updateAccount(id, { label, tier }) : []
      return { ok: true, value: { accounts } }
    }
    if (endpoint === 'account/rename') {
      const rec = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
      const id = typeof rec.id === 'string' ? rec.id : undefined
      const label = typeof rec.label === 'string' ? rec.label.trim() : undefined
      if (!id || !label) return badRequest('account/rename expects { id: string, label: string }')
      const accounts = service.renameAccount ? await service.renameAccount(id, label) : []
      return { ok: true, value: { accounts } }
    }
    if (endpoint === 'account/remove') {
      const rec = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
      const id = typeof rec.id === 'string' ? rec.id : undefined
      if (id === undefined || id.length === 0) return badRequest('account/remove expects { id: string }')
      const accounts = service.removeAccount ? await service.removeAccount(id) : []
      return { ok: true, value: { accounts } }
    }
    if (endpoint === 'models') {
      if (!isRefreshPayload(payload)) return badRequest('models expects {} or { force: boolean }')
      if (modelCatalog === undefined) return badRequest('model catalog is unavailable')
      const status = await service.status()
      const gateReady = status.login.projectAvailable
        && status.capabilities.some(capability => capability.id === 'auth-llm' && capability.state === 'available')
      return { ok: true, value: gateReady
        ? await modelCatalog.modelCatalog(signal, payload.force)
        : modelCatalog.catalogSnapshot() }
    }
    if (endpoint === 'usage') {
      if (!isRefreshPayload(payload)) return badRequest('usage expects {} or { force: boolean }')
      if (service.usage === undefined) return { ok: true, value: { state: 'protocol-drift' as const } }
      return { ok: true, value: await service.usage(signal, payload.force) }
    }
    if (endpoint === 'acknowledge-risk') {
      if (!isAcknowledgement(payload)) return badRequest('acknowledge-risk expects { acknowledge: true }')
      return { ok: true, value: await service.acknowledgeRisk() }
    }
    if (endpoint === 'login') {
      if (!isEmptyRecord(payload)) return badRequest('login expects an empty payload')
      return { ok: true, value: await service.startLogin() }
    }
    if (endpoint === 'cancel' || endpoint === 'cancel-login') {
      if (!isEmptyRecord(payload)) return badRequest('cancel expects an empty payload')
      return { ok: true, value: await service.cancelLogin() }
    }
    if (endpoint === 'logout') {
      if (!isEmptyRecord(payload)) return badRequest('logout expects an empty payload')
      return { ok: true, value: await service.logout() }
    }
    if (endpoint === 'revoke') {
      if (!isRevokePayload(payload)) return badRequest('revoke expects { confirmed: true }')
      return { ok: true, value: await service.revoke(true, signal) }
    }
    return badRequest('unknown Antigravity auth endpoint')
  } catch (error) {
    return safeFailure(error)
  }
}

function badRequest(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

function cancelled(): RpcResult<never> {
  return { ok: false, error: { code: 'cancelled', message: 'antigravity-auth: request cancelled', details: {} } }
}

function safeFailure(error: unknown): RpcResult<never> {
  const credentialError = error instanceof CredentialOperationError ? error : undefined
  const candidate = error instanceof OAuthFlowError
    ? error.code
    : credentialError?.code ?? 'internal'
  const code = isSafeRpcErrorCode(candidate) ? candidate : 'internal'
  return {
    ok: false,
    error: {
      code: code as never,
      message: credentialError === undefined
        ? safeRpcErrorMessage(code)
        : credentialErrorMessage(credentialError.code) ?? safeRpcErrorMessage(code),
      details: {},
    },
  }
}

function isEmptyRecord(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0
}

function isRefreshPayload(value: unknown): value is { force?: boolean } {
  return isRecord(value)
    && Object.keys(value).every(key => key === 'force')
    && (value.force === undefined || typeof value.force === 'boolean')
}

function isAcknowledgement(value: unknown): value is { acknowledge: true } {
  return isRecord(value)
    && Object.keys(value).length === 1
    && value.acknowledge === true
}

function isRevokePayload(value: unknown): value is { confirmed: true } {
  return isRecord(value)
    && Object.keys(value).length === 1
    && value.confirmed === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
