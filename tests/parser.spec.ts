import { describe, expect, test } from 'vitest';
import { extractStreamingHtml, parseAiOutput } from '../src/host/ai/streamParser';
import { stripEmoji } from '../src/shared/util/emoji';

describe('streaming html extraction', () => {
  test('null before the open tag arrives', () => {
    expect(extractStreamingHtml('thinking…')).toBeNull();
  });

  test('partial body while the close tag is still missing', () => {
    expect(extractStreamingHtml('<vibeos-html><div>hi')).toBe('<div>hi');
    expect(extractStreamingHtml('<vibeos-html><div data-vibeos-region="a">grow')).toBe(
      '<div data-vibeos-region="a">grow',
    );
  });

  test('body once closed, trailing content ignored', () => {
    expect(extractStreamingHtml('<vibeos-html><div>hi</div></vibeos-html>tail')).toBe(
      '<div>hi</div>',
    );
  });
});

describe('regions-only detection', () => {
  test('body of only region blocks parses as a regions patch', () => {
    const out = parseAiOutput(
      `<vibeos-html>
<div data-vibeos-region="addressbar"><input name="url" value="https://a.example"></div>
<div data-vibeos-region="page"><ul><li>a</li><li>b</li></ul></div>
</vibeos-html>`,
    );
    expect(out.html).toBeUndefined();
    expect(out.regions?.map((r) => r.region)).toEqual(['addressbar', 'page']);
    expect(out.regions?.[1]?.html).toContain('<li>b</li>');
  });

  test('region block plus other content is a full replacement, not a patch', () => {
    const out = parseAiOutput(
      `<vibeos-html><header>bar</header><div data-vibeos-region="body">x</div></vibeos-html>`,
    );
    expect(out.regions).toBeUndefined();
    expect(out.html).toContain('<header>bar</header>');
  });

  test('a region nested inside another region is not re-captured', () => {
    const out = parseAiOutput(
      `<vibeos-html><section data-vibeos-region="outer"><div data-vibeos-region="inner">x</div></section></vibeos-html>`,
    );
    expect(out.regions).toHaveLength(1);
    expect(out.regions?.[0]?.region).toBe('outer');
  });
});

describe('syscall batch tolerance', () => {
  test('one invalid call never discards the rest', () => {
    const out = parseAiOutput(
      `<vibeos-html><div>z</div></vibeos-html>
\`\`\`vibeos-syscall
{ "calls": [
  { "type": "notify", "title": "" },
  { "type": "notify", "title": "ok", "kind": "info" },
  { "type": "open", "appId": "browser" }
] }
\`\`\`
<vibeos-summary>Did things.</vibeos-summary>`,
    );
    expect(out.syscalls).toHaveLength(2);
    expect(out.syscalls[0]).toMatchObject({ type: 'notify', title: 'ok' });
    expect(out.syscalls[1]).toMatchObject({ type: 'open', appId: 'browser' });
    expect(out.summary).toBe('Did things.');
  });

  test('unparseable block drops to an empty batch', () => {
    const out = parseAiOutput('```vibeos-syscall\n{ not json\n```');
    expect(out.syscalls).toEqual([]);
  });
});

describe('emoji strip', () => {
  test('strips emoji and collapses the leftover whitespace', () => {
    expect(stripEmoji('Hello 🌍 world')).toBe('Hello world');
    expect(stripEmoji('New mail ✉️ arrived 🎉')).toBe('New mail arrived');
    expect(stripEmoji('🎉🎉')).toBe('');
    expect(stripEmoji('plain text')).toBe('plain text');
  });
});
