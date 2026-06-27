/**
 * API client wrapper that handles authentication and token refresh.
 * - Sends credentials (httpOnly cookies) automatically
 * - Catches 401 responses and attempts token refresh
 * - Redirects to /login on refresh failure
 */

async function refresh(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    return response.ok
  } catch {
    return false
  }
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
    const refreshed = await refresh()
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
