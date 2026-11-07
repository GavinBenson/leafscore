'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/lib/auth'
import { safeCallbackUrl } from '@/lib/authRedirect'

export type EmailSignInState = {
  status: 'idle' | 'sent' | 'error'
  email?: string
  message?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function signInWithGoogle(formData: FormData) {
  await signIn('google', { redirectTo: safeCallbackUrl(formData.get('callbackUrl')) })
}

export async function signInWithEmail(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    return { status: 'error', email, message: 'Enter a valid email address.' }
  }

  try {
    const url = await signIn('resend', {
      email,
      redirectTo: safeCallbackUrl(formData.get('callbackUrl')),
      redirect: false,
    })
    if (new URL(url, 'http://localhost').searchParams.has('error')) {
      return {
        status: 'error',
        email,
        message: "We couldn't send your sign-in link. Try again in a moment, or continue with Google.",
      }
    }
  } catch (error) {
    if (error instanceof AuthError) {
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
