let counter = 0;

/** Sortable-ish unique id: time prefix + counter + randomness. No native dependency. */
export function newId(): string {
  counter = (counter + 1) % 1296;
  const rand = Math.floor(Math.random() * 36 ** 8)
    .toString(36)
    .padStart(8, '0');
  return Date.now().toString(36) + counter.toString(36).padStart(2, '0') + rand;
}
