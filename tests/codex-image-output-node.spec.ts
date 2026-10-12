import { describe, expect, it } from 'vitest'
import type { ConversationNodeContext } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { codexImageConversationNode } from '../src/client/codex-image-output-node.tsx'

const attachment = { attachmentId: 'sha256:test', mediaType: 'image/png', bytes: 128, width: 64, height: 64 }
const meta = { kind: 'codex-subscription-image', schemaVersion: 1, original: { assetId: `img_${'a'.repeat(32)}` } }
function resultEvent(content: unknown[], eventMeta: unknown = meta) {
  return { type: 'tool/result', seq: 5, time: 10, data: { turn: 2, step: 1, meta: eventMeta, message: { role: 'user', source: { kind: 'tool', callId: 'call-1' }, content } } } as never
}
describe('Codex image Conversation node', () => {
  it('projects only image-bearing Codex tool results into an independent Chat node', () => {
    const result = resultEvent([{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'A result' }, { type: 'image', attachment }], isError: false }])
    const turnEnd = { type: 'turn/end', seq: 9, time: 20, data: { turn: 2 } } as never
    const match = codexImageConversationNode.match(result)
    expect(match).toEqual({ id: '2', role: 'update' })
    expect(codexImageConversationNode.match(resultEvent([{ type: 'text', text: 'not an image' }], { kind: 'other' }))).toBeNull()
    const node = codexImageConversationNode.buildViewNode({
      key: 'codex-image-output:2', id: '2', state: undefined, start: undefined,
      matches: [
        { event: result, role: 'update', location: { kind: 'session' } },
        { event: turnEnd, role: 'update', location: { kind: 'session' } },
      ], current: new Map(),
    } as unknown as ConversationNodeContext<undefined>) as unknown as { kind: string; location: { kind: string }; data: { blocks: Array<{ toolCallId: string; meta: typeof meta; content: readonly unknown[] }> } }
    expect(node?.kind).toBe('codex-image-output')
    expect(node?.location.kind).toBe('session')
    expect(node?.data.blocks).toHaveLength(1)
    expect(node?.data.blocks[0]?.toolCallId).toBe('call-1')
    expect(node?.data.blocks[0]?.meta).toEqual(meta)
    expect(node?.data.blocks[0]?.content).toHaveLength(2)
  })
  it('accepts a direct image block from the tool result message', () => {
    const result = resultEvent([{ type: 'text', text: 'A result' }, { type: 'image', attachment }])
    expect(codexImageConversationNode.match(result)).toEqual({ id: '2', role: 'update' })
  })
})
