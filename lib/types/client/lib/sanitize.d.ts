export declare function stripEmoji(text: string): string;
/**
 * Sanitize AI-generated HTML before injecting it into a window surface.
 * - strips <script>, event handlers (on*), javascript: urls, frames, <style>
 * - keeps <form> (native submit is intercepted + prevented in the delegate;
 *   action/formaction are forbidden so nothing can actually navigate)
 * - keeps data-* attributes (used for event delegation + context)
 * - keeps inline styles and classes (the AI styles its own UI)
 * - strips any emoji (hard project rule: no emoji in generated UI)
 */
export declare function sanitizeAiHtml(html: string): string;
