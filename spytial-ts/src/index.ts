/**
 * Public entry point for spytial-ts.
 *
 * This package will expose decorator helpers that map to Spytial operators.
 * Implementation is intentionally left as a placeholder until the API is finalized.
 */

export type OperatorDecorator = (...args: unknown[]) => ClassDecorator | MethodDecorator | PropertyDecorator;

export interface OperatorRegistry {
  register: (name: string, decoratorFactory: OperatorDecorator) => void;
  get: (name: string) => OperatorDecorator | undefined;
}

export const createOperatorRegistry = (): OperatorRegistry => {
  const registry = new Map<string, OperatorDecorator>();

  return {
    register: (name, decoratorFactory) => {
      registry.set(name, decoratorFactory);
    },
    get: (name) => registry.get(name),
  };
};
