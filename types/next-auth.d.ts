import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    // user.id comes from Auth.js's own type, as a string. All three fields are
    // absent when the signed-in email has no matching row in `users`.
    user: {
      isPremium?: boolean
      isAdmin?: boolean
    } & DefaultSession['user']
  }
}
