// A list's settings in the address: building a list page's address, and
// carrying its other settings through a GET form.

/**
 * A list page's address: empty values are left out, so the plain list
 * keeps its plain address.
 */
export function listHref(
  pathname: string,
  params: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(name, String(value));
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** Hidden fields that carry a list's other settings through its GET form. */
export function HiddenParams({
  params,
}: {
  params: Record<string, string | number | undefined>;
}) {
  return Object.entries(params).map(([name, value]) =>
    value === undefined || value === "" ? null : (
      <input key={name} type="hidden" name={name} value={String(value)} />
    ),
  );
}
