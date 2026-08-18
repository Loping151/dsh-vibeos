#!/usr/bin/env node
/**
 * Tailwind 4 utilities precompile: src/client/styles/tw.source.css →
 * src/client/styles/tw.generated.css (committed). Source globs live in the
 * input file's `@source` directives. No-ops with a warning while the input
 * does not exist yet.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const input = join(root, 'src/client/styles/tw.source.css')
const output = join(root, 'src/client/styles/tw.generated.css')

if (!existsSync(input)) {
  console.warn(`build-css: skipped — ${input} not found`)
  process.exit(0)
}

const pm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pm, ['exec', 'tailwindcss', '-i', input, '-o', output, '--minify'], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'inherit', 'inherit'],
})

if (result.error !== undefined) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`build-css: wrote ${output}`)
