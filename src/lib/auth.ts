const TOKEN_KEY = 'cyphersol_token'

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || undefined
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}
