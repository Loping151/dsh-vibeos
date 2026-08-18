import type { AgentRole, Locale } from '../../shared';
export declare function systemPromptFor(role: AgentRole): string;
/**
 * Appended to every system prompt so ALL generated content (app UIs,
 * notifications, summaries, app-search results) is written in the user's
 * chosen language. Structural tokens (HTML tags, syscall JSON) are unaffected.
 */
export declare function localeDirective(locale: Locale): string;
