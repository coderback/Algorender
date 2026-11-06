// An object's field names in narration and descriptions, written the way code
// would write them. Most fields are names (point.x), but a JavaScript object's
// keys can be any string ({")": "("}), and those need quotes to read as keys.

const NAME = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;
const INDEX = /^(0|[1-9]\d*)$/;

/** A field name as an object literal writes it: x, 0, or ")" in quotes. */
export function fieldKey(key: string): string {
  return NAME.test(key) || INDEX.test(key) ? key : JSON.stringify(key);
}

/** Reading a field: point.x, or row[0] and pairs[")"] where a dot can't say it. */
export function fieldAccess(name: string, key: string): string {
  return NAME.test(key) ? `${name}.${key}` : `${name}[${fieldKey(key)}]`;
}
