import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, within, screen, act, waitFor, cleanup } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import {
  mountCndLayoutInterface,
  CndLayoutStateManager,
  InstanceStateManager,
} from '../webcola-demo/react-component-integration'
import userEvent, { UserEvent } from '@testing-library/user-event'
import { createRoot, Root } from 'react-dom/client'
import { buildSampleBstInstance } from './helpers/bst-instance-fixture'
import { createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance'

/*
 * Integration tests for the demo mounting path (`mountCndLayoutInterface`),
 * which renders the back-compat `CndLayoutInterface` wrapper inside the demo's
 * `CndLayoutInterfaceWrapper` and keeps the `CndLayoutStateManager` singleton in
 * sync.
 *
 * The redesign replaced the old `NoCodeView`/`CodeView` React surfaces (which
 * these tests used to mock) with the schema-driven `SpecEditor`. Those modules
 * no longer exist, so the `vi.mock` calls are gone — there is one live model and
 * nothing to stub. Assertions are updated to the new DOM (a tablist with
 * Builder/Code tabs, the YAML textarea, the Constraints/Directives sections)
 * while preserving each test's original intent: that mounting works, that the
 * code view round-trips YAML, that the view toggles, and that
 * `DataAPI.getCurrentCndSpec()` reflects the current spec in both views.
 *
 * The original "React root cleanup issue causes duplicate elements" that forced
 * three skips is fixed here by tearing down the root and removing the container
 * in `afterEach`, so the previously-skipped tests are now un-skipped.
 */

describe('CnD Layout Interface Integration Tests', () => {
  /** Testing Constants */

  const testYaml = `constraints:
  - orientation:
      selector: right
      directions:
        - right
        - below
  - orientation:
      selector: left
      directions:
        - left
        - below
directives:
  - attribute:
      field: key
  - flag: hideDisconnectedBuiltIns
`

  /** Test Helpers */

  let container: HTMLElement
  let extraRoots: Root[] = []

  function mountComponent() {
    // Create the test container element.
    container = document.createElement('div')
    container.setAttribute('id', 'test-cnd-layout-interface')
    container.setAttribute('data-testid', 'test-cnd-layout-interface')
    document.body.appendChild(container)

    act(() => {
      mountCndLayoutInterface('test-cnd-layout-interface')
    })

    // Confirm that the CnD Layout Interface is mounted.
    const cndLayoutInterface = document.getElementById(
      'test-cnd-layout-interface',
    ) as HTMLElement
    expect(cndLayoutInterface).toBeInTheDocument()
    expect(cndLayoutInterface).toHaveAttribute(
      'data-testid',
      'test-cnd-layout-interface',
    )
  }

  function getCmView(): EditorView {
    const testContainer = screen.getByTestId(
      'test-cnd-layout-interface',
    ) as HTMLElement
    const el = testContainer.querySelector('.cm-editor') as HTMLElement | null
    const view = el ? EditorView.findFromDOM(el) : null
    if (!view) throw new Error('CodeMirror editor not found')
    return view
  }

  async function typeYaml(yaml: string) {
    // Drive the CodeMirror code view (no <textarea>): dispatch a document
    // replacement, which fires the same onChange path as typing. Wrap it in
    // act() so the resulting onChange → setState → effect chain (which syncs the
    // host's state manager) flushes before the caller reads the spec back.
    await act(async () => {
      const view = getCmView()
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: yaml } })
    })
    await waitFor(() => {
      expect(getCmView().state.doc.toString()).toBe(yaml)
    })
  }

  async function switchToBuilderView(user: UserEvent) {
    const testContainer = screen.getByTestId(
      'test-cnd-layout-interface',
    ) as HTMLElement
    const builderTab = within(testContainer).getByRole('tab', { name: 'Builder' })
    await user.click(builderTab)

    // Verify the builder view is displayed (no textarea; sections present).
    expect(within(testContainer).queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      within(testContainer).getByRole('region', { name: 'Constraints' }),
    ).toBeInTheDocument()
  }

  /** Setup and Teardown */

  beforeEach(() => {
    vi.clearAllMocks()
    extraRoots = []
    // The demo wrapper seeds its initial view/spec from the shared
    // `CndLayoutStateManager` singleton, so reset it between tests to avoid
    // order-dependent pollution (e.g. a prior test leaving the builder view on).
    CndLayoutStateManager.getInstance().initializeWithConfig({
      initialYamlValue: '',
      initialIsNoCodeView: false,
      initialConstraints: [],
      initialDirectives: [],
    })
    // Reset the shared instance state too, so a test that pushes a domain
    // instance can't leak dropdown options into later tests.
    InstanceStateManager.getInstance().setCurrentInstance(
      createEmptyAlloyDataInstance(),
    )
    mountComponent()
  })

  afterEach(() => {
    // Tear down the React root and remove the container so each test starts
    // clean (this is the fix for the duplicate-element issue that forced skips).
    cleanup()
    for (const root of extraRoots) {
      act(() => root.unmount())
    }
    extraRoots = []
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  /** Test Suites */

  describe('Rendering', () => {
    it('should render CnD Layout Interface correctly', () => {
      const cndLayoutInterface = document.getElementById(
        'test-cnd-layout-interface',
      ) as HTMLElement
      expect(cndLayoutInterface).toBeInTheDocument()

      // The view toggle (tablist) and the code-view textarea are present.
      expect(
        within(cndLayoutInterface).getByRole('tablist', { name: 'Editor view' }),
      ).toBeInTheDocument()
      expect(
        within(cndLayoutInterface).getByRole('tab', { name: 'Builder' }),
      ).toBeInTheDocument()
      expect(
        within(cndLayoutInterface).getByRole('textbox'),
      ).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('injecting a default CnD spec renders the parsed constraints/directives', async () => {
      // Type the test YAML into the Code View.
      await typeYaml(testYaml)

      // Switch to the builder view.
      const user = userEvent.setup()
      await switchToBuilderView(user)

      // The builder reflects the parsed items live: two orientation constraints,
      // an attribute directive and a flag directive.
      const testContainer = screen.getByTestId(
        'test-cnd-layout-interface',
      ) as HTMLElement
      const constraintsList = within(testContainer).getByRole('list', {
        name: 'Constraints List',
      })
      const directivesList = within(testContainer).getByRole('list', {
        name: 'Directives List',
      })

      await waitFor(() => {
        expect(within(constraintsList).getAllByText('Orientation')).toHaveLength(2)
      })
      expect(within(directivesList).getByText('Attribute')).toBeInTheDocument()
      expect(within(directivesList).getByText('Flag')).toBeInTheDocument()
    })

    it('pushing an instance via DataAPI.updateInstance gives the editor domain-aware options', async () => {
      // Push a BST instance into the shared state, the way the alloy/json/dot/gw
      // demo pages do via window.updateInstanceFromReact after parsing data.
      const m = await import('../webcola-demo/react-component-integration')
      act(() => {
        m.DataAPI.updateInstance(buildSampleBstInstance())
      })

      await typeYaml(testYaml)
      const user = userEvent.setup()
      await switchToBuilderView(user)

      const testContainer = screen.getByTestId(
        'test-cnd-layout-interface',
      ) as HTMLElement

      // Expand the Attribute directive row; its `field` input is a relationName
      // field, which renders a datalist populated from the instance's relations.
      const directivesList = within(testContainer).getByRole('list', {
        name: 'Directives List',
      })
      const attributeRow = await within(directivesList).findByText('Attribute')
      await user.click(attributeRow)

      await waitFor(() => {
        const options = [
          ...testContainer.querySelectorAll('datalist option'),
        ].map((o) => (o as HTMLOptionElement).value)
        expect(options).toEqual(
          expect.arrayContaining(['left', 'right', 'key']),
        )
      })
    })
  })

  describe('CnD Spec Retrieval', () => {
    it('should retrieve the current CnD spec from the React component in both Code and Builder views', async () => {
      // Type the test YAML into the Code View.
      await typeYaml(testYaml)

      const m = await import('../webcola-demo/react-component-integration')

      // In Code View, getCurrentCndSpec returns the typed YAML (trimmed).
      let currentSpec = m.DataAPI.getCurrentCndSpec()
      expect(currentSpec?.trim()).toBe(testYaml.trim())

      // Switch to the builder view; the spec is regenerated from the model and
      // still semantically describes the same constraints/directives.
      const user = userEvent.setup()
      await switchToBuilderView(user)

      currentSpec = m.DataAPI.getCurrentCndSpec()
      expect(currentSpec).toBeTruthy()
      expect(currentSpec).toContain('orientation')
      expect(currentSpec).toContain('attribute')
      expect(currentSpec).toContain('flag')
    })

    it('should reflect builder edits when retrieving the spec after a change', async () => {
      // Type the test YAML into the Code View, then switch to the builder.
      await typeYaml(testYaml)
      const user = userEvent.setup()
      await switchToBuilderView(user)

      const testContainer = screen.getByTestId(
        'test-cnd-layout-interface',
      ) as HTMLElement
      const constraintsList = within(testContainer).getByRole('list', {
        name: 'Constraints List',
      })

      await waitFor(() => {
        expect(within(constraintsList).getAllByText('Orientation')).toHaveLength(2)
      })

      // Remove the first orientation constraint via its overflow menu.
      const firstActions = within(constraintsList).getAllByRole('button', {
        name: /Actions for Orientation/i,
      })[0]
      await user.click(firstActions)
      const removeButton = await screen.findByRole('menuitem', {
        name: /Remove Orientation constraint/i,
      })
      await user.click(removeButton)

      await waitFor(() => {
        expect(within(constraintsList).getAllByText('Orientation')).toHaveLength(1)
      })

      // The retrieved spec no longer equals the original (one constraint gone).
      const m = await import('../webcola-demo/react-component-integration')
      const currentSpec = m.DataAPI.getCurrentCndSpec()
      expect(currentSpec).not.toBe(testYaml)
      expect(currentSpec).toContain('orientation')
    })
  })
})
