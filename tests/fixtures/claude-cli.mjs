/** Synthetic CLI for lifecycle tests; no auth files or network. */
import { writeFileSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
if (args.includes('--idle')) { setInterval(() => {}, 1000) }
else {
  if (process.env.DPE_TEST_ARGV) writeFileSync(process.env.DPE_TEST_ARGV, JSON.stringify(args))
  if (process.env.DPE_TEST_SYSTEM && args.includes('--system-prompt-file')) writeFileSync(process.env.DPE_TEST_SYSTEM, readFileSync(args[args.indexOf('--system-prompt-file') + 1], 'utf8'))
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { input += chunk })
  process.stdin.on('end', () => {
    const tool = args.includes('--mcp-config')
    const frame = event => JSON.stringify({ type: 'stream_event', event }) + '\n'
    process.stdout.write(frame({ type: 'message_start', message: { usage: { input_tokens: 17, output_tokens: 0 } } }))
    process.stdout.write(frame({ type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: 'call-test', name: 'mcp__dsh__read_test' } : { type: 'text' } }))
    process.stdout.write(frame({ type: 'content_block_delta', index: 0, delta: tool ? { type: 'input_json_delta', partial_json: '{"path":"test.txt"}' } : { type: 'text_delta', text: 'synthetic reply' } }))
    process.stdout.write(frame({ type: 'content_block_stop', index: 0 }))
    process.stdout.write(frame({ type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 3 } }))
    process.stdout.write(frame({ type: 'message_stop' }))
    setInterval(() => {}, 1000) // adapter must stop us after the first message
  })
}
