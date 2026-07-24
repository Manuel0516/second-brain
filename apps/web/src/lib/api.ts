/**
 * API client wrapper that handles authentication and token refresh.
 * - Sends credentials (httpOnly cookies) automatically
 * - Catches 401 responses and attempts token refresh
 * - Redirects to /login on refresh failure
 */

let refreshPromise: Promise<boolean> | null = null

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

/** Extract a human-readable message from a FastAPI error response. */
export async function apiErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string')
    return data.detail[0].msg
  return fallback
}

export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  let response = await fetch(endpoint, {
    ...options,
    credentials: 'include',
  })

  // A 401 from an auth endpoint is meaningful to the caller (not logged in,
  // wrong credentials, or an expired refresh token). Silently refreshing and
  // redirecting on those would loop the login probe, so only treat 401s from
  // authenticated data requests as an expired session.
  const isAuthEndpoint = endpoint.startsWith('/api/auth/')

  if (response.status === 401 && !isAuthEndpoint) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      response = await fetch(endpoint, {
        ...options,
        credentials: 'include',
      })
    } else {
      window.location.href = '/login'
    }
  }

  return response
}
