import tokensCss from './tokens.css';
import baseCss from './base.css';
import aiSurfaceCss from './ai-surface.css';
import chromeCss from './chrome.css';
import menuCss from './menu.css';
import utilitiesCss from './tw.generated.css';
import devdockCss from './skins/devdock.css';
import xpCss from './skins/xp.css';
import aquaCss from './skins/aqua.css';
import harnessCss from './skins/harness.css';

/** Concatenation order is load-bearing: skin token blocks tie with `.vibe-dark`
 * on specificity and win only because they come last; utilities sit after the
 * hand-written base so component classes beat the chrome defaults. */
export const VIBEOS_CSS = [
  tokensCss,
  baseCss,
  aiSurfaceCss,
  chromeCss,
  menuCss,
  utilitiesCss,
  devdockCss,
  xpCss,
  aquaCss,
  harnessCss,
].join('\n');

export { XP_DSW_TOKENS, AQUA_DSW_TOKENS, BUILTIN_DSW_TOKENS } from './dswTokens';
