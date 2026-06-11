/** Decode the JWT stored in localStorage and return the payload. */
export function getPayload() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

/** Return the current user's role ("admin" | "sales" | "marketing" | null). */
export function getRole() {
  return getPayload()?.role ?? null;
}

/** Return the landing URL for the current role. */
export function getRoleHome() {
  const role = getRole();
  if (role === "admin")     return "/admin";
  if (role === "sales")     return "/sales";
  if (role === "marketing") return "/marketing";
  return "/login";
}
