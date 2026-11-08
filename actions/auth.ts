'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/lib/auth'
import { safeCallbackUrl } from '@/lib/authRedirect'
import { captureError } from '@/lib/observability'
import { enforceRateLimit } from '@/lib/rateLimitGuard'

export type EmailSignInState = {
  status: 'idle' | 'sent' | 'error'
  email?: string
  message?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HOUR = 3600

export async function signInWithGoogle(formData: FormData) {
  await signIn('google', { redirectTo: safeCallbackUrl(formData.get('callbackUrl')) })
}

export async function signInWithEmail(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { status: 'error', email, message: 'Enter a valid email address.' }
  }

  const ipLimit = await enforceRateLimit('magic-ip', { limit: 20, windowSeconds: HOUR })
  if (!ipLimit.ok) return { status: 'error', email, message: ipLimit.message }

  // Per-email limits show the normal "check your email" state without sending,
  // so the response never reveals that an address is being throttled.
  // Keyed on email AND IP so one attacker IP cannot exhaust a victim's allowance
  // for everyone else; a much higher global per-email ceiling bounds mail-bombing.
  const emailLimit = await enforceRateLimit('magic-email', { limit: 5, windowSeconds: HOUR, userId: email, withIp: true })
  if (!emailLimit.ok) return { status: 'sent', email }
  const globalEmailLimit = await enforceRateLimit('magic-email-global', { limit: 30, windowSeconds: HOUR, userId: email })
  if (!globalEmailLimit.ok) return { status: 'sent', email }

  try {
    const url = await signIn('resend', {
      email,
      redirectTo: safeCallbackUrl(formData.get('callbackUrl')),
      redirect: false,
    })
    const error = new URL(url, 'http://localhost').searchParams.get('error')
    // A banned address is refused by the signIn callback (AccessDenied). Show the
    // normal sent state so the form never reveals ban status.
    if (error === 'AccessDenied') return { status: 'sent', email }
    if (error) {
      return {
        status: 'error',
        email,
        message: "We couldn't send your sign-in link. Try again in a moment, or continue with Google.",
      }
    }
  } catch (error) {
    if (error instanceof AuthError && error.type === 'AccessDenied') return { status: 'sent', email }
    if (error instanceof AuthError) {
      captureError(error, { action: 'signInWithEmail' })
      return {
        status: 'error',
        email,
        message: "We couldn't send your sign-in link. Try again in a moment, or continue with Google.",
      }
    }
    throw error
  }

  return { status: 'sent', email }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' })
}
