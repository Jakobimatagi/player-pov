/**
 * Paid plans stay switched off until the owner is ready to launch: set VITE_CHECKOUT_ENABLED=true
 * in Vercel (and CHECKOUT_ENABLED=true on the billing function) to turn checkout on.
 * Lives in lib so the landing page can read it without pulling in billing code.
 */
export function isCheckoutEnabled(value: string | undefined): boolean {
  return value === 'true'
}

export const CHECKOUT_ENABLED = isCheckoutEnabled(import.meta.env.VITE_CHECKOUT_ENABLED)
