// Structured logging with a pluggable reporter. No dependencies: attach Sentry
// (or similar) later with setReporter() from instrumentation.ts.
export type ErrorContext = Record<string, unknown>

export type Reporter = {
  captureError?: (error: unknown, context: ErrorContext) => void | Promise<void>
  logEvent?: (name: string, props: Record<string, unknown>) => void | Promise<void>
}

let reporter: Reporter | null = null

export function setReporter(next: Reporter | null) {
  reporter = next
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest
    return { name: error.name, message: error.message, stack: error.stack, ...(digest ? { digest: String(digest) } : {}) }
  }
  return { message: String(error) }
}

export function captureError(error: unknown, context: ErrorContext = {}) {
  try {
    console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), error: serializeError(error), context }))
  } catch {
    console.error('captureError: could not serialize', error)
  }
  try {
    void Promise.resolve(reporter?.captureError?.(error, context)).catch(() => {})
  } catch {
    // reporters must never break the request
  }
}

export function logEvent(name: string, props: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), event: name, ...props }))
  } catch {
    console.log(`event ${name}`)
  }
  try {
    void Promise.resolve(reporter?.logEvent?.(name, props)).catch(() => {})
  } catch {
    // ignore
  }
}
