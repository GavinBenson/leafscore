import type { Instrumentation } from 'next'
import { captureError } from '@/lib/observability'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Surface a bad production configuration in the logs at boot. The first real
  // use of getEnv() still throws, so this only reports and does not crash startup.
  try {
    const { getEnv } = await import('@/lib/env')
    getEnv()
  } catch (error) {
    captureError(error, { source: 'register', kind: 'env' })
  }
  // Attach a provider here later, e.g.
  // setReporter({ captureError: (e, c) => Sentry.captureException(e, { extra: c }) })
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  captureError(error, {
    source: 'onRequestError',
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  })
}
