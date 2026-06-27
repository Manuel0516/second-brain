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

  if (response.status === 401) {
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
