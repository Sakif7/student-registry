// Where to go after signing in. The destination comes from the URL
// (?next=/staff/students), so it must stay on this site: anything else would
// let a crafted link send someone to another site straight after sign-in.

/**
 * The path to continue to after sign-in, if it is a path on this site;
 * otherwise "/", which sends each person to their own home page.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith("/")) return "/";
  // "//host" and "/\host" are read by browsers as another host.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  // A control character could hide a scheme or a line break.
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}
