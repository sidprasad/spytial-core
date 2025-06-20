// Type declarations for cassowary
declare module 'cassowary' {
  export class Variable {
    constructor(name?: string);
    name: string;
    value: number;
  }

  export class Expression {
    constructor(variable?: Variable | number);
    plus(other: Expression | Variable | number): Expression;
    minus(other: Expression | Variable | number): Expression;
    times(other: Expression | Variable | number): Expression;
    divide(other: Expression | Variable | number): Expression;
  }

  export class Constraint {
    constructor();
  }

  export class SimplexSolver {
    constructor();
    addConstraint(constraint: Constraint): void;
    removeConstraint(constraint: Constraint): void;
    addEditVar(variable: Variable, strength?: number): void;
    suggestValue(variable: Variable, value: number): void;
    solve(): void;
    resolve(): void;
  }

  export interface OperatorType {
    readonly EQ: symbol;
    readonly GEQ: symbol;
    readonly LEQ: symbol;
    readonly LE: symbol;
  }

  export const Operator: OperatorType;
  export const LEQ: symbol;
  export const GEQ: symbol;
  export const LE: symbol;

  export const Strength: {
    required: number;
    strong: number;
    medium: number;
    weak: number;
  };

  type ExpressionType = Variable | Expression | number;
  
  export function Equation(left: ExpressionType, right: ExpressionType, strength?: number): Constraint;
  
  // Inequality can be used both as a function and a constructor
  export interface InequalityConstructor {
    new (left: ExpressionType, operator: symbol, right: ExpressionType, strength?: number): Constraint;
    (left: ExpressionType, operator: symbol, right: ExpressionType, strength?: number): Constraint;
  }
  
  export const Inequality: InequalityConstructor;
}
