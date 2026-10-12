/** One Codex-wide preference, shared by quick and full Settings views. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { OutputVerbosity } from '../codex/output-verbosity.ts'
import type { ProviderPanelKey } from './locales.ts'
import { CodexSelectSetting } from './CodexSelectSetting.tsx'
export interface CodexVerbosityProps {
  rpc: ClientConnectionRpc
  subscribe?: (listener: () => void) => () => void
  t: Translate<ProviderPanelKey>
}
export interface CodexVerbosityView { outputVerbosity: OutputVerbosity; writable: boolean }
const choices = ['default', 'low', 'medium', 'high'] as const
const labels = ['codexVerbosityDefault', 'codexVerbosityLow', 'codexVerbosityMedium', 'codexVerbosityHigh'] as const
export async function requestCodexVerbosity(rpc: ClientConnectionRpc, value?: OutputVerbosity, signal?: AbortSignal): Promise<CodexVerbosityView> {
  if (value !== undefined && !choices.includes(value)) throw Error('Invalid output verbosity preference')
  const response = await rpc.call('/api', value === undefined ? 'codex-subscription/preferences/status' : 'codex-subscription/preferences/update', value === undefined ? {} : { outputVerbosity: value }, signal)
  if (!response.ok) throw Error(response.error.message)
  const result = response.value as { outputVerbosity?: unknown; outputVerbosityWritable?: unknown; writable?: unknown } | null
  const writable = result?.outputVerbosityWritable ?? result?.writable
  if (!choices.includes(result?.outputVerbosity as OutputVerbosity) || typeof writable !== 'boolean') throw Error('Invalid Codex response detail response')
  if (value !== undefined && result?.outputVerbosity !== value) throw Error('DSH did not accept the Codex response detail update')
  return { outputVerbosity: result!.outputVerbosity as OutputVerbosity, writable }
}
const load = async (rpc: ClientConnectionRpc, value?: string, signal?: AbortSignal) => {
  const result = await requestCodexVerbosity(rpc, value as OutputVerbosity | undefined, signal)
  return { value: result.outputVerbosity, writable: result.writable }
}
export function CodexVerbositySettings(props: CodexVerbosityProps) {
  return <CodexSelectSetting {...props} choices={choices} labels={labels} title="codexVerbosity" hint="codexVerbosityHint" savedLabel="codexVerbositySaved" load={load} />
}
