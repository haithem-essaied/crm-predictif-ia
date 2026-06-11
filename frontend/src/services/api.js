export const API_URL = "http://localhost:3000";

/**
 * Fetch wrapper that automatically adds the JWT token header.
 * On 401 (genuine authentication failure) it clears the token and redirects
 * to /login. Validation errors (400) are returned to the caller so the page
 * can display the message without logging the user out.
 */
export async function authFetch(path, options = {}) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    return null;
  }

  return res;
}
