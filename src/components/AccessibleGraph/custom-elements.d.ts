/**
 * Type declarations for custom elements
 */

import type { InstanceLayout } from '../../layout/interfaces';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'webcola-cnd-graph': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          ref?: React.Ref<any>;
          id?: string;
          width?: string | number;
          height?: string | number;
          layoutFormat?: 'default' | 'grid';
          'aria-label'?: string;
          'aria-hidden'?: string;
          role?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
