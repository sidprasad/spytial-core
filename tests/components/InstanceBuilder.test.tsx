import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

import { InstanceBuilder } from '../../src/components/InstanceBuilder/InstanceBuilder'
import { JSONDataInstance } from '../../src/data-instance/json-data-instance'

/*
 * `InstanceBuilder` is deprecated in favour of the `<structured-input-graph>`
 * custom element, which edits the same `IInputDataInstance` and additionally
 * enforces constraints while you edit. It stays exported and working until the
 * next major — the repo's rule for deprecated forms — so what is worth pinning
 * is that anyone still on it hears about the replacement.
 *
 * The warning is deliberately once-per-process, not once-per-render: this is a
 * form component, and a warning on every keystroke would be noise a host learns
 * to filter out rather than act on. That makes the module-level latch part of
 * the contract, so the second render is asserted too.
 */

function instance(): JSONDataInstance {
    return new JSONDataInstance({
        atoms: [{ id: 'a', type: 'Node', label: 'a' }],
        relations: [],
    })
}

describe('InstanceBuilder deprecation', () => {
    let warn: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        warn.mockRestore()
    })

    it('warns once, naming the replacement', async () => {
        render(<InstanceBuilder instance={instance()} />)

        const deprecations = warn.mock.calls
            .map(call => String(call[0]))
            .filter(message => message.includes('InstanceBuilder'))

        expect(deprecations).toHaveLength(1)
        // The point of the warning is that it says what to use instead.
        expect(deprecations[0]).toContain('structured-input-graph')
        expect(deprecations[0]).toContain('deprecated')
    })

    it('does not warn again on a second mount', async () => {
        render(<InstanceBuilder instance={instance()} />)
        render(<InstanceBuilder instance={instance()} />)

        const deprecations = warn.mock.calls
            .map(call => String(call[0]))
            .filter(message => message.includes('InstanceBuilder'))

        // Both renders happen in one process, and the latch is module-level.
        expect(deprecations.length).toBeLessThanOrEqual(1)
    })
})
