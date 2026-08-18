/**
 * Host-side half of the dual-face example plugin.
 *
 * It exists only so the cordis loader can activate the row
 * (`vibeos-example-override`). The client-modules scanner then sees the
 * `dsh.client` declaration in package.json and serves `./client.js` to the
 * browser — that bundle carries the whole example (skin + clock override).
 */

export const name = 'vibeos-example-override';

export function apply() {
	// No host behaviour: everything happens in the browser bundle.
}
