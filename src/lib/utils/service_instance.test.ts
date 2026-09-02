import { describe, expect, it, vi } from 'vitest';

import { firstSuccessful } from './service_instance';

describe('firstSuccessful', () => {
    it('resolves with the first instance outcome in list order', async () => {
        const outcome = await firstSuccessful(['a@1', 'b@2'], async (instance) => (instance === 'a@1' ? 'A' : 'B'));
        expect(outcome).toBe('A');
    });

    it('falls through an undefined outcome to the next instance', async () => {
        const seen: string[] = [];
        const outcome = await firstSuccessful(['a@1', 'b@2'], async (instance) => {
            seen.push(instance);
            return instance === 'a@1' ? undefined : 'B';
        });
        expect(outcome).toBe('B');
        expect(seen).toEqual(['a@1', 'b@2']);
    });

    it('falls through a rejecting instance to the next one', async () => {
        const outcome = await firstSuccessful(['a@1', 'b@2'], async (instance) => {
            if (instance === 'a@1') {
                throw new Error('boom');
            }
            return 'B';
        });
        expect(outcome).toBe('B');
    });

    it('stops at the first success and never touches later instances', async () => {
        const attempt = vi.fn(async (instance: string) => (instance === 'a@1' ? 'A' : 'never'));
        await firstSuccessful(['a@1', 'b@2', 'c@3'], attempt);
        expect(attempt).toHaveBeenCalledTimes(1);
    });

    it('resolves undefined when every instance missed', async () => {
        const outcome = await firstSuccessful(['a@1', 'b@2'], async () => undefined);
        expect(outcome).toBeUndefined();
    });

    it('resolves undefined for an empty list', async () => {
        expect(await firstSuccessful([], async () => 'x')).toBeUndefined();
    });
});
