/** JSON callers do not benefit from TypeScript's compile-time checks. */
export function objectInput(value: unknown, field: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${field} must be an object`);
}

export function stringInput(
  value: unknown,
  field: string,
  required = false,
): void {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || (required && !value.trim()))
    throw new Error(
      `${field} must be ${required ? "a non-empty string" : "a string"}`,
    );
}

export function stringsInput(value: unknown, field: string): void {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new Error(`${field} must be an array of non-empty strings`);
}

export function booleanInput(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== "boolean")
    throw new Error(`${field} must be a boolean`);
}

export function accessUrlInput(value: unknown, field: string): void {
  stringInput(value, field);
  if (value === undefined) return;
  try {
    const url = new URL(value as string);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
  } catch {
    throw new Error(
      `${field} must be an HTTP(S) URL without embedded credentials`,
    );
  }
}
