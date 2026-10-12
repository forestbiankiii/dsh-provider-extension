import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { ConversationNodeDefinition, ConversationViewNode, ConversationController, InputActions, InputState, MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { CodexOriginalImageToolView } from './CodexOriginalImageToolView.tsx'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderPanel.module.css'

export interface CodexImageOutputBlock {
  readonly toolCallId: string
  readonly content: readonly unknown[]
  readonly isError?: boolean
  readonly meta?: unknown
}
export interface CodexImageOutputNode {
  readonly key: string
  readonly id: string
  readonly kind: 'codex-image-output'
  readonly target: 'chat'
  readonly location: { readonly kind: 'session' }
  readonly anchorSeq: number
  readonly visibility: 'visible'
  readonly data: { readonly blocks: readonly CodexImageOutputBlock[] }
}
export interface CodexImageOutputNodeOwnerProps { readonly node: CodexImageOutputNode; readonly loadImage: MessageImageLoader }
export interface CodexImageOutputChatNodeProps extends CodexImageOutputNodeOwnerProps {
  readonly rpc: ClientConnectionRpc
  readonly sessionId: SessionId
  readonly conversation: Pick<ConversationController, 'createDraftImages' | 'releaseDraftImages'> | undefined
  readonly isCodexRoute: () => boolean
  readonly loadImage: MessageImageLoader
  readonly inputActions: InputActions
  readonly useInput: SnapshotSelectorHook<InputState>
  readonly t: Translate<ProviderPanelKey>
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function hasImage(value: unknown): boolean {
  const part = record(value)
  return part?.type === 'image' && record(part.attachment) !== undefined
}
function resultBlocks(event: Parameters<ConversationNodeDefinition['match']>[0]): CodexImageOutputBlock[] {
  if (event.type !== 'tool/result') return []
  const data = record(event.data), meta = record(data?.meta), message = record(data?.message)
  if (meta?.kind !== 'codex-subscription-image' || message === undefined || !Array.isArray(message.content)) return []
  const content = message.content
  const wrapped = content.map(value => record(value)).filter((block): block is Record<string, unknown> => block?.type === 'tool-result'
    && block.isError !== true && Array.isArray(block.content) && block.content.some(hasImage))
  if (wrapped.length > 0) return wrapped.map((block, index) => ({
    toolCallId: typeof block.toolCallId === 'string' ? block.toolCallId : `codex-image-${String(data?.turn)}-${String(data?.step ?? event.seq)}-${index}`,
    content: block.content as readonly unknown[], isError: false, meta: data?.meta,
  }))
  if (!content.some(hasImage)) return []
  const source = record(message.source)
  return [{
    toolCallId: typeof source?.callId === 'string' ? source.callId : `codex-image-${String(data?.turn)}-${String(data?.step ?? event.seq)}`,
    content, isError: false, meta: data?.meta,
  }]
}
export const codexImageConversationNode: ConversationNodeDefinition<undefined> = {
  kind: 'codex-image-output', target: 'chat',
  match(event) {
    const data = record(event.data), turn = data?.turn
    if (typeof turn !== 'number' || !Number.isSafeInteger(turn)) return null
    if (event.type !== 'turn/end' && resultBlocks(event).length === 0) return null
    return { id: String(turn), role: 'update' }
  },
  start: () => undefined,
  update: () => undefined,
  buildViewNode(context) {
    const end = context.matches.find(match => match.event.type === 'turn/end')
    if (!end) return null
    const imageMatches = context.matches.flatMap(match => resultBlocks(match.event).map(block => ({ block, event: match.event })))
    if (imageMatches.length === 0) return null
    const lastResultSeq = Math.max(...imageMatches.map(match => match.event.seq))
    const turn = end.location.kind === 'turn' || end.location.kind === 'step' ? end.location.turn : undefined
    const lastStep = turn?.steps.at(-1)
    const stepData = lastStep?.data as unknown as { get?: (key: string) => unknown } | undefined
    const assistantStep = record(stepData?.get?.('assistant-step'))
    const answerSeq = record(assistantStep?.finalNode)?.seq
    const anchorSeq = typeof answerSeq === 'number' && answerSeq > lastResultSeq ? answerSeq + 0.025 : end.event.seq - 0.025
    return {
      key: context.key, id: context.id, kind: 'codex-image-output', target: 'chat',
      location: { kind: 'session' }, anchorSeq, visibility: 'visible',
      data: { blocks: imageMatches.map(({ block, event }) => ({ ...block, meta: record(event.data)?.meta })) },
    } as unknown as ConversationViewNode
  },
}
export function CodexImageOutputChatNode(props: CodexImageOutputChatNodeProps) {
  return <div className={css.codexImageOutput}>
    {props.node.data.blocks.map(block => <CodexOriginalImageToolView
      key={block.toolCallId} callId={block.toolCallId} toolName="codex_image_generate" phase="result"
      block={block} loadImage={props.loadImage} rpc={props.rpc} sessionId={props.sessionId}
      conversation={props.conversation} isCodexRoute={props.isCodexRoute} inputActions={props.inputActions}
      useInput={props.useInput} t={props.t}
    />)}
  </div>
}
