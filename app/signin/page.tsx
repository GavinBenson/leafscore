import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { safeCallbackUrl } from '@/lib/authRedirect'
import { SignInForm } from '@/components/SignInForm'

export const metadata = {
  title: 'Sign in',
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: 'That email is already linked to another sign-in method. Use the method you signed up with.',
  Verification: 'That sign-in link has expired or was already used. Request a new one below.',
  AccessDenied: "You don't have access to sign in with that account.",
  Configuration: 'Sign-in is temporarily unavailable. Please try again in a moment.',
}
const DEFAULT_ERROR = 'Something went wrong signing you in. Please try again.'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const params = await searchParams
  const callbackUrl = safeCallbackUrl(params.callbackUrl)

  const user = await getCurrentUser()
  if (user) redirect(callbackUrl)

  const errorMessage = params.error ? (ERROR_MESSAGES[params.error] ?? DEFAULT_ERROR) : null

  return (
    <div className="signin-wrap">
      <div className="card signin-card">
        <div className="signin-brand" aria-hidden="true">
          <span className="brand-mark">L</span>
        </div>
        <h1 className="signin-title">Sign in to LeafScore</h1>
        <p className="subtle signin-intro">Rate teas, keep a tasting journal, and build your wishlist.</p>

        {errorMessage && (
          <p className="signin-banner" role="alert">
            {errorMessage}
          </p>
        )}

        <SignInForm callbackUrl={callbackUrl} />
      </div>
    </div>
  )
}
