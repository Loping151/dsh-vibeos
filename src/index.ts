/**
 * Bundle source entry: the node-half surface the host loader resolves
 * through `package.json#main`.
 *
 * The `import type {}` line pins TypeScript's global-augmentation ordering
 * (client runtime Context augmentation before the plugin re-export); without
 * it TS mis-resolves client-half context services. Do not remove.
 */
import type {} from '@deepseek-ai/dsh-client-runtime/client'
export * from './host/index'
