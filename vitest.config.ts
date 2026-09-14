import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    environment: 'node',
    server: { deps: { inline: [/@deepseek-ai\/dsh-client-ui-primitives/] } },
  },
})
