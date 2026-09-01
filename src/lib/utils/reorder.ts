/**
 * Reorder by moving the entry at `from` so it lands at index `to`.
 * Pure and total: identical indices or out-of-range bounds degrade to a
 * copy, so a misbehaving drag source can never drop list entries.
 */
export function applyReorder(list: readonly string[], from: number, to: number): string[] {
    if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) {
        return [...list];
    }
    const next = [...list];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) {
        next.splice(to, 0, moved);
    }
    return next;
}
