import { describe, expect, it } from 'vitest'
import { prepareCustomSkins, scopeSkinCss } from '../src/host/skins/customSkins'

describe('customSkins', () => {
  it('scopes and accepts a well formed skin', () => {
    const css = scopeSkinCss('terminal-green', `
      /* tokens */
      [data-skin="terminal-green"] { --background: #001100; --foreground: #33ff66; }
      [data-skin="terminal-green"] .vibe-taskbar,
      [data-skin='terminal-green'] .vibe-window { border-color: #0f0; }
      @media (min-width: 600px) { [data-skin="terminal-green"] .vibe-title { font-size: 13px } }
      @keyframes tg-blink { from { opacity: 0 } to { opacity: 1 } }
      [data-skin="terminal-green"] .vibe-winbtn::after { background: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E") }
    `)
    expect(css).toContain('#vibeos-root[data-skin="terminal-green"]{')
    expect(css).toContain('#vibeos-root[data-skin=\'terminal-green\'] .vibe-window')
    expect(css).toContain('#vibeos-root[data-skin="terminal-green"] .vibe-title{')
    expect(css).toContain('@media (min-width: 600px){')
    expect(css).toContain('@keyframes tg-blink{')
    expect(css).not.toContain('/* tokens */')
  })

  it('rejects unscoped, foreign and dangerous rules', () => {
    const bad = [
      ':root { --background: red }',
      'html { background: red }',
      'body .vibe-window { color: red }',
      '.vibe-window { color: red }',
      '[data-skin="other"] { --background: red }',
      '@import url("https://evil.example/x.css");',
      '@font-face { font-family: x; src: url("https://evil.example/f.woff2") }',
      '[data-skin="x"] { background: url("https://evil.example/bg.png") }',
      '[data-skin="x"] .ai-surface { display: block }',
      '[data-skin="x"] { color: red',
      '[data-skin="x"] { background: url("data:image/svg+xml,<svg></style>") }',
    ]
    for (const css of bad) expect(() => scopeSkinCss('x', css), css).toThrow()
  })

  it('keeps nested .ai-surface control overrides', () => {
    const css = scopeSkinCss('x', '[data-skin="x"] .ai-surface button { border-radius: 0 !important }')
    expect(css).toContain('#vibeos-root[data-skin="x"] .ai-surface button{')
  })

  it('accepts already prefixed selectors without doubling', () => {
    const css = scopeSkinCss('x', '#vibeos-root[data-skin="x"] { --brand: red }')
    expect(css.startsWith('#vibeos-root[data-skin="x"]')).toBe(true)
    expect(css).not.toContain('#vibeos-root#vibeos-root')
  })

  it('prepare: drops bad entries, warns on missing contract tokens, validates dswTokens', () => {
    const out = prepareCustomSkins([
      { name: 'xp', css: '[data-skin="xp"] { --brand: red }' },
      { name: 'Bad Name', css: '' },
      { name: 'ok', label: 'OK', css: '[data-skin="ok"] { --background: #fff }' },
      { name: 'ok', css: '[data-skin="ok"] { --background: #000 }' },
      { name: 'tok', css: '[data-skin="tok"] { --background: #fff }', dswTokens: { '--dsw-alias-bg-base': { light: '#fff', dark: '#000' } } },
      { name: 'badtok', css: '[data-skin="badtok"] {}', dswTokens: { '--dsw-alias-bg-base': 'red' as never } },
    ])
    expect(out.skins.map((s) => s.id)).toEqual(['ok', 'tok'])
    expect(out.rejected.map((r) => r.name)).toEqual(['xp', 'Bad Name', 'ok', 'badtok'])
    expect(out.warnings.join(' ')).toContain('--foreground')
    expect(out.skins[1]?.dswTokens).toEqual({ '--dsw-alias-bg-base': { light: '#fff', dark: '#000' } })
    expect(out.skins[0]?.label).toBe('OK')
  })
})
