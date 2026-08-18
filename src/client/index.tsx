/** Client bundle entry: wires the takeover, the ws→store boot dispatch and the
 * DSH theme bridge, and exposes the public `vibeos` registry API. Everything is
 * reverted through the fiber effect (classic toggle, HMR drain, plugin disable). */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-runtime/client';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import { VIBEOS_CSS } from './styles/index';
import { injectStyles, removeStyles } from './lib/cssInject';
import { themeBridge } from './themeBridge';
import { createModeManager } from './takeover';
import { registerBootWiring } from './boot';
import { wsClient } from './ws';
import { VibeosSection } from './components/dshSettings/VibeosSection';

export { vibeos, type VibeosClientApi } from './registry/index';

export const inject = ['slots', 'theme'];

export function apply(ctx: Context): void {
  injectStyles(VIBEOS_CSS);
  themeBridge.init(ctx);
  const mode = createModeManager(ctx);
  const unwire = registerBootWiring();
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'vibeos', order: 82, label: () => 'VibeOS' },
      VibeosSection,
    ),
  );
  wsClient.connect();
  ctx.effect(() => () => {
    unwire();
    wsClient.dispose();
    mode.dispose();
    themeBridge.dispose();
    removeStyles();
  }, 'vibeos: client teardown');
}
