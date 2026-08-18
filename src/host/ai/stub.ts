/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/ai/SdkManager.ts (stubResponse).
 * Adapted for DeepSeek Harness (dsh-vibeos): VIBEOS_AI_STUB hint reworded for config.aiStub.
 * Original license: MIT. */

import type { AgentRole } from '../../shared';

/** Deterministic offline stub so the OS is usable without any model calls. */
export function stubResponse(role: AgentRole, prompt: string): string {
  if (role === 'ui-generation') {
    const isFirst = prompt.includes('just launched');
    if (isFirst) {
      return `<vibeos-html>
<div data-vibeos-region="root" style="display:flex;flex-direction:column;gap:12px;padding:8px">
  <h2 style="margin:0;font-size:18px">Hello from VibeOS (stub)</h2>
  <p style="color:#888;margin:0">The text model is in stub mode. Disable the aiStub config to go live.</p>
  <button data-vibeos-action="ping" style="align-self:flex-start;padding:6px 12px;border:1px solid #555;border-radius:8px;background:transparent;color:inherit">Ping</button>
</div>
</vibeos-html>
<vibeos-summary>The app launched in stub mode.</vibeos-summary>`;
    }
    return `<vibeos-html>
<div data-vibeos-region="root" style="padding:8px">
  <p style="margin:0">You interacted (stub). Time: ${new Date().toLocaleTimeString()}</p>
  <button data-vibeos-action="ping" style="margin-top:8px;padding:6px 12px;border:1px solid #555;border-radius:8px;background:transparent;color:inherit">Ping again</button>
</div>
</vibeos-html>
<vibeos-summary>The user pinged the stub app.</vibeos-summary>`;
  }
  if (role === 'system-event') {
    return `\`\`\`vibeos-syscall
{ "calls": [ { "type": "notify", "title": "System (stub)", "body": "A quiet moment passes in VibeOS.", "kind": "info" } ] }
\`\`\`
<vibeos-summary>An ambient stub event fired.</vibeos-summary>`;
  }
  return `<vibeos-summary>Memory consolidated (stub).</vibeos-summary>`;
}
