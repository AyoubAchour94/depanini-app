/**
 * The phone size of the screenshot specs: 390x844 by default, or what
 * E2E_SHOTS_VIEWPORT names ("360x640") for the small-phone pass.
 */
const [width, height] = (process.env.E2E_SHOTS_VIEWPORT ?? '390x844').split('x').map(Number);

export const VIEWPORT = { width: width!, height: height! };
