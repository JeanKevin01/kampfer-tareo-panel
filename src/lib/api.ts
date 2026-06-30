// Fuente única de la URL base del API. Se configura por entorno con VITE_API_URL.
// NO embeber API keys aquí: el cliente se autentica con el token JWT del usuario (login).
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.apps1.astraera.space'
