/**
 * dsh-vibeos build: node-half lib (host plugin) + browser client bundle
 * speaking the dsh module-loader protocol (`window.__ModuleLoader__.load`).
 * Mirrors the dsh-genui build so both halves ship from one package.
 */
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const ID = 'dsh-vibeos'
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))

/** Module-table entries the client bundle may leave external: platform seed
 * rows answered by the loader's `require`. Anything else must be inlined. */
const EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
]

const CSS_VIRTUAL_PREFIX = '\0vibeos-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** `.css` imports become JS modules exporting the minified css TEXT; the
 * client concatenates them into one <style data-plugin-css> tag. */
function cssTextPlugin(): NonNullable<UserConfig['plugins']>[number] {
  return {
    name: 'vibeos-css-text',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css')) return null
      const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
      const stableId = relative(PROJECT_ROOT, abs).replaceAll('\\', '/')
      return CSS_VIRTUAL_PREFIX + stableId + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const stableId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const fileId = resolvePath(PROJECT_ROOT, stableId)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code } = transform({ filename: stableId, code: source, minify: true })
      return `export default ${JSON.stringify(code.toString())};`
    },
  }
}

function purityGate(): NonNullable<UserConfig['plugins']>[number] {
  return {
    name: 'vibeos-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (EXTERNALS.includes(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not in the module table (EXTERNALS) — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services',
      )
    },
  }
}

const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  minify: true,
  sourcemap: false,
  clean: false,
  deps: {
    neverBundle: [...EXTERNALS],
    alwaysBundle: (id: string) => !EXTERNALS.includes(id),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [purityGate(), cssTextPlugin()],
  outputOptions: {
    entryFileNames: 'client.js',
    codeSplitting: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

const libConfig: UserConfig = {
  name: ID,
  entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  outputOptions: { entryFileNames: '[name].js' },
  // `rm -rf lib` happens in the build script: tsdown must never wipe
  // lib/types (tsc's declaration output) mid-pipeline.
  clean: false,
}

export default [libConfig, clientConfig]
