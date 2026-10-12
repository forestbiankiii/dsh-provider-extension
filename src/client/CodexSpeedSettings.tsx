/** Only the confirmed Standard/Fast preference; no changes to reasoning or routing. */
import type { SpeedMode } from '../codex/speed-mode.ts'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import { CodexSelectSetting, type CodexSelectView } from './CodexSelectSetting.tsx'
const choices = ['standard', 'fast'] as const
const labels = ['codexSpeedStandard', 'codexSpeedFast'] as const
export interface CodexSpeedView { speedMode: SpeedMode; writable: boolean; fastModels: string[] }
export async function requestCodexSpeed(rpc: CodexVerbosityProps['rpc'], value?: SpeedMode, signal?: AbortSignal): Promise<CodexSpeedView> {
  if (value !== undefined && !choices.includes(value)) throw Error('Invalid Codex speed mode preference')
  const response = await rpc.call('/api', value === undefined ? 'codex-subscription/preferences/status' : 'codex-subscription/preferences/update', value === undefined ? {} : { speedMode: value }, signal)
  if (!response.ok) throw Error(response.error.message)
  const result = response.value as { speedMode?: unknown; speedModeWritable?: unknown; writable?: unknown; fastModels?: unknown } | null
  const writable = result?.speedModeWritable ?? result?.writable
  if (!choices.includes(result?.speedMode as SpeedMode) || typeof writable !== 'boolean' || !Array.isArray(result?.fastModels) || result.fastModels.some(id => typeof id !== 'string' || id.length === 0 || id.length > 256)) throw Error('Invalid Codex speed mode response')
  if (value !== undefined && result?.speedMode !== value) throw Error('DSH did not accept the Codex speed mode update')
  return { speedMode: result.speedMode as SpeedMode, writable, fastModels: result.fastModels as string[] }
}
const load = async (rpc: CodexVerbosityProps['rpc'], value?: string, signal?: AbortSignal): Promise<CodexSelectView> => {
  const result = await requestCodexSpeed(rpc, value as SpeedMode | undefined, signal)
  return { value: result.speedMode, writable: result.writable, ...(result.fastModels.length === 0 ? { note: 'codexSpeedUnsupported' as const } : {}) }
}
export function CodexSpeedSettings(props: CodexVerbosityProps) {
  return <CodexSelectSetting {...props} choices={choices} labels={labels} title="codexSpeed" hint="codexSpeedHint" savedLabel="codexSpeedSaved" load={load} />
}
