export const PLAN_PRICES = { monthly: 5, yearly: 40 } as const

// Whole-percent saving of paying yearly instead of twelve monthly payments.
export function savingsPercent(monthly: number, yearly: number): number {
  if (!(monthly > 0) || !(yearly >= 0)) return 0
  return Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100))
}

export type SubscriptionState =
  | { kind: 'renews'; label: string }
  | { kind: 'cancels'; label: string }
  | { kind: 'none'; label: null }

export function formatBillingDate(date: Date): string {
  return date.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })
}

// "Renews on" vs "Cancels on", from the cancel_at_period_end flag.
export function subscriptionState(user: {
  isPremium: boolean
  cancelAtPeriodEnd: boolean | null
  premiumExpiresAt: Date | null
}): SubscriptionState {
  if (!user.isPremium || !user.premiumExpiresAt) return { kind: 'none', label: null }
  const date = formatBillingDate(user.premiumExpiresAt)
  return user.cancelAtPeriodEnd
    ? { kind: 'cancels', label: `Cancels on ${date}` }
    : { kind: 'renews', label: `Renews on ${date}` }
}

// Null when no trial is configured.
export function trialLabel(days: number): string | null {
  if (!Number.isInteger(days) || days < 1) return null
  return `Start with a ${days}-day free trial. You can cancel any time before it ends.`
}
