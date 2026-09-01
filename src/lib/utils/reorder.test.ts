import { describe, expect, it } from 'vitest';

import { applyReorder } from './reorder';

describe('applyReorder', () => {
    it('moves an entry forward', () => {
        expect(applyReorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    });

    it('moves an entry backward', () => {
        expect(applyReorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    });

    it('keeps the list intact for identical indices', () => {
        expect(applyReorder(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    });

    it('never drops entries on out-of-range indices', () => {
        expect(applyReorder(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
        expect(applyReorder(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
        expect(applyReorder(['a', 'b'], 9, 9)).toEqual(['a', 'b']);
    });

    it('does not mutate the input list', () => {
        const list = ['a', 'b', 'c'];
        applyReorder(list, 0, 2);
        expect(list).toEqual(['a', 'b', 'c']);
    });
});
