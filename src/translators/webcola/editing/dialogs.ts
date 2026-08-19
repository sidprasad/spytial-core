/**
 * The modal dialogs the editing UI puts up: confirm, prompt, and the edge
 * editor. They were methods on the graph class, but they only ever needed the
 * shadow root to mount into, so they are plain functions over that root.
 *
 * Each one resolves when the user answers and removes its own overlay first.
 * Styling comes from the .modal-* rules in the graph stylesheet.
 */

/**
 * Show a confirmation dialog
 */
export function showConfirmDialog(root: ShadowRoot, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Confirm Action</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-button secondary" data-action="cancel">Cancel</button>
          <button class="modal-button primary" data-action="confirm">Confirm</button>
        </div>
      </div>
    `;

    // Add event listeners
    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal-overlay')) {
        // Clicked outside dialog
        root.removeChild(overlay);
        resolve(false);
      } else if (target.dataset.action === 'cancel') {
        root.removeChild(overlay);
        resolve(false);
      } else if (target.dataset.action === 'confirm') {
        root.removeChild(overlay);
        resolve(true);
      }
    });

    // Handle escape key
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        root.removeChild(overlay);
        document.removeEventListener('keydown', handleKeydown);
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    root.appendChild(overlay);
    
    // Focus the confirm button
    const confirmBtn = overlay.querySelector('[data-action="confirm"]') as HTMLButtonElement;
    confirmBtn?.focus();
  });
}

/**
 * Show a prompt dialog for text input
 */
export function showPromptDialog(root: ShadowRoot, message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Input Required</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${message}</p>
          <input type="text" class="modal-input" value="${defaultValue}" placeholder="Enter text...">
        </div>
        <div class="modal-footer">
          <button class="modal-button secondary" data-action="cancel">Cancel</button>
          <button class="modal-button primary" data-action="ok">OK</button>
        </div>
      </div>
    `;

    const input = overlay.querySelector('.modal-input') as HTMLInputElement;

    // Add event listeners
    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal-overlay')) {
        // Clicked outside dialog
        root.removeChild(overlay);
        resolve(null);
      } else if (target.dataset.action === 'cancel') {
        root.removeChild(overlay);
        resolve(null);
      } else if (target.dataset.action === 'ok') {
        const value = input.value;
        root.removeChild(overlay);
        resolve(value);
      }
    });

    // Handle enter and escape keys
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const value = input.value;
        root.removeChild(overlay);
        document.removeEventListener('keydown', handleKeydown);
        resolve(value);
      } else if (e.key === 'Escape') {
        root.removeChild(overlay);
        document.removeEventListener('keydown', handleKeydown);
        resolve(null);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    root.appendChild(overlay);
    
    // Focus and select the input
    input.focus();
    input.select();
  });
}

/**
 * Show a prompt dialog for text input with a delete button option
 * @param message - Dialog message
 * @param defaultValue - Default input value
 * @returns Promise that resolves to: input value, null (cancel), or 'DELETE' (delete action)
 */
export function showEdgeEditDialog(root: ShadowRoot, message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Edit Edge</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${message}</p>
          <input type="text" class="modal-input" value="${defaultValue}" placeholder="Enter text...">
        </div>
        <div class="modal-footer">
          <button class="modal-button secondary" data-action="cancel">Cancel</button>
          <button class="modal-button danger" data-action="delete" style="background: #dc3545; margin-right: auto;">Delete Edge</button>
          <button class="modal-button primary" data-action="ok">OK</button>
        </div>
      </div>
    `;

    const input = overlay.querySelector('.modal-input') as HTMLInputElement;

    // Add event listeners
    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal-overlay')) {
        // Clicked outside dialog
        root.removeChild(overlay);
        resolve(null);
      } else if (target.dataset.action === 'cancel') {
        root.removeChild(overlay);
        resolve(null);
      } else if (target.dataset.action === 'delete') {
        root.removeChild(overlay);
        resolve('DELETE'); // Special signal for deletion
      } else if (target.dataset.action === 'ok') {
        const value = input.value;
        root.removeChild(overlay);
        resolve(value);
      }
    });

    // Handle enter and escape keys
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const value = input.value;
        root.removeChild(overlay);
        document.removeEventListener('keydown', handleKeydown);
        resolve(value);
      } else if (e.key === 'Escape') {
        root.removeChild(overlay);
        document.removeEventListener('keydown', handleKeydown);
        resolve(null);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    root.appendChild(overlay);
    
    // Focus and select the input
    input.focus();
    input.select();
  });
}

