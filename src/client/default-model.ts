import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { DefaultModelView } from '../default-model.ts'

/** Only successful, bounded Host acknowledgements update the Settings display. */
export async function defaultModelRequest(rpc: ClientConnectionRpc, request: { action: 'get' } | { action: 'set'; accountId: string; model: string }): Promise<DefaultModelView> {
  const response = await rpc.call('/api', 'provider-extension/default-model', request)
  if (!response.ok) throw Error(response.error.message)
  const value = response.value as DefaultModelView | undefined
  const text = (field: unknown): field is string => typeof field === 'string' && field.length > 0 && field.length <= 512
  if (!value || !value.selection || !text(value.selection.provider) || !text(value.selection.model)
    || (value.selection.reasoningEffort !== undefined && !text(value.selection.reasoningEffort))
    || (value.activeAccountId !== null && !text(value.activeAccountId))) throw Error('Invalid default-model response')
  return value
}
