/** Host loader entry for the provider-extension plugin with Antigravity and Codex integrations. */

import type { Context } from '@deepseek-ai/cordis'
import { apply as applyAntigravityAuth } from './antigravity/index.ts'
import { apply as applyAntigravitySearch } from './antigravity/search.ts'
import { apply as applyAntigravityImage } from './antigravity/image.ts'
import { apply as applyAntigravityVideo } from './antigravity/video.ts'
import { apply as applyCodexSubscription } from './codex/index.js'
import { apply as applyOpenCode } from './opencode/index.js'
import { apply as applyClaude, type ClaudeConfig } from './claude/index.ts'
import Schema from '@deepseek-ai/schemastery'
import { registerAccountRoutes } from './antigravity/account-routes.ts'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { applyUsage } from './usage/index.ts'
import type { ProviderBalanceReaders } from './usage/provider-balances.ts'

export const name = 'provider-extension'
export const Config = Schema.object({
  claudeExecutable: Schema.string().default('claude').description('Official Claude Code executable; no shell command string.'),
  claudeStreamIdleTimeoutMs: Schema.natural().default(300000).description('Claude CLI output idle timeout in milliseconds.'),
  claudeUnsupportedFields: Schema.union(['error', 'ignore'] as const).default('error').description('Reject unsupported temperature/maxTokens/stop by default; ignore explicitly drops them.'),
})
export const inject = [
  'llm',
  'attachments',
  'credentials',
  'settings',
  'web',
  'loader',
  'tools',
]

/** Mount Host-side Antigravity and Codex services, LLM adapters, RPC routes, and tools. */
export function apply(ctx: Context, config: ClaudeConfig = {}): void {
  const balanceReaders: ProviderBalanceReaders = {}
  // One feature failing here used to abort the whole mount, which removed the
  // LLM adapters below (a request then failed with NO_ADAPTER), so contain it.
  try {
    applyUsage(ctx, () => balanceReaders)
  } catch (error) {
    ctx.logger?.warn(`Failed to mount usage statistics: ${String(error)}`)
  }

  // 1. Mount Antigravity auth service, LLM adapter, loopback RPC, and /antigravity command
  balanceReaders.antigravity = applyAntigravityAuth(ctx)

  // 2. Mount Antigravity web search provider when web service is available
  ctx.inject(['web'], (webCtx) => {
    applyAntigravitySearch(webCtx)
  })

  // 3. Mount Antigravity image generation tools when tools, attachments, and fs are available
  ctx.inject(['tools', 'attachments', 'fs'], (toolsCtx) => {
    applyAntigravityImage(toolsCtx)
  })

  // 4. Mount Antigravity video understanding tool when tools and fs are available
  ctx.inject(['tools', 'fs'], (videoCtx) => {
    applyAntigravityVideo(videoCtx)
  })

  // 5. Mount ChatGPT / Codex subscription service, LLM adapter, account RPC, and tools
  try {
    balanceReaders.codex = applyCodexSubscription(ctx)
  } catch (error) {
    ctx.logger?.warn(`Failed to mount Codex subscription: ${String(error)}`)
  }

  // 6. Mount OpenCode Go adapter, live catalog, usage service, and remotes
  try {
    balanceReaders.opencode = applyOpenCode(ctx)
  } catch (error) {
    ctx.logger?.warn(`Failed to mount OpenCode Go: ${String(error)}`)
  }

  try {
    balanceReaders.claude = applyClaude(ctx, config)
  } catch {
    ctx.logger?.warn('Failed to mount Claude Code CLI channel')
  }

  // 7. Mount OpenCode config RPC to sync API keys to credentials and disk
  ctx.inject(['connection'], (connectionCtx) => {
    return registerAccountRoutes(
      connectionCtx.connection,
      'opencode',
      ['config/save', 'config/get'],
      async (endpoint, payload) => {
        const credentials = ctx.get('credentials')
        if (endpoint === 'config/save') {
          const data = payload as { apiKey?: string; baseURL?: string }
          if (typeof data?.apiKey === 'string') {
            const key = data.apiKey.trim()
            if (key.length > 0) {
              if (credentials) {
                try { await credentials.set(credentialRef('OPENCODE_API_KEY'), key) } catch {}
              }
              if (typeof process !== 'undefined' && process.env) {
                process.env.OPENCODE_API_KEY = key
              }
              try {
                const fs = await import('node:fs/promises')
                const os = await import('node:os')
                const path = await import('node:path')
                const credPath = path.join(os.homedir(), '.dsh', '.credentials.yaml')
                const raw = await fs.readFile(credPath, 'utf8')
                if (!raw.includes('OPENCODE_API_KEY:')) {
                  const updated = raw.replace(/^refs:\r?\n/m, `refs:\n  OPENCODE_API_KEY: '${key.replace(/'/g, "''")}'\n`)
                  await fs.writeFile(credPath, updated, 'utf8')
                } else {
                  const updated = raw.replace(/OPENCODE_API_KEY:\s*['"]?[^'"\r\n]+['"]?/, `OPENCODE_API_KEY: '${key.replace(/'/g, "''")}'`)
                  await fs.writeFile(credPath, updated, 'utf8')
                }
              } catch {}
            }
          }
          return { ok: true, value: true }
        }
        if (endpoint === 'config/get') {
          let key: string | undefined
          if (credentials) {
            try { key = (await credentials.resolve(credentialRef('OPENCODE_API_KEY')))?.value } catch {}
          }
          if (!key && typeof process !== 'undefined' && process.env) {
            key = process.env.OPENCODE_API_KEY
          }
          if (!key) {
            try {
              const fs = await import('node:fs/promises')
              const os = await import('node:os')
              const path = await import('node:path')
              const credPath = path.join(os.homedir(), '.dsh', '.credentials.yaml')
              const raw = await fs.readFile(credPath, 'utf8')
              const match = raw.match(/OPENCODE_API_KEY:\s*['"]?([^'"\r\n]+)['"]?/)
              if (match && match[1]) key = match[1].trim()
            } catch {}
          }
          const configured = Boolean(key && key.length > 0)
          return {
            ok: true,
            value: {
              configured,
              apiKey: key || '',
              baseURL: (typeof process !== 'undefined' && process.env.OPENCODE_BASE_URL) || 'https://opencode.ai/zen/go/v1',
            },
          }
        }
        return { ok: true, value: true }
      },
    )
  })
}

export * from './antigravity/index.ts'
export { AntigravitySearchProvider, ANTIGRAVITY_SEARCH_PROVIDER_ID } from './antigravity/search.ts'
export { GENERATE_IMAGE_TOOL_NAME, LIST_IMAGES_TOOL_NAME } from './antigravity/image.ts'
export { ANALYZE_VIDEO_TOOL_NAME } from './antigravity/video.ts'
