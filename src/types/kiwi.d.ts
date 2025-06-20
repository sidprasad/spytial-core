// Type declarations for kiwi.js (modern Cassowary implementation)
declare module 'kiwi.js' {
  export class Variable {
    constructor(name?: string);
    name(): string;
    value(): number;
    
    // Arithmetic operations
    plus(value: number): Expression;
    minus(value: number): Expression;
    multiply(value: number): Expression;
    divide(value: number): Expression;
  }

  export class Expression {
    constructor(variable?: Variable, coefficient?: number, constant?: number);
    constant(): number;
    terms(): { variable: Variable; coefficient: number }[];
    value(): number;
    
    plus(other: Expression | Variable | number): Expression;
    minus(other: Expression | Variable | number): Expression;
    multiply(coefficient: number): Expression;
    divide(coefficient: number): Expression;
  }

  export class Constraint {
    constructor(expression: Expression, operator: Operator, strength?: number);
    expression(): Expression;
    op(): Operator;
    strength(): number;
  }

  export class Solver {
    constructor();
    addConstraint(constraint: Constraint): void;
    removeConstraint(constraint: Constraint): void;
    addEditVariable(variable: Variable, strength?: number): void;
    removeEditVariable(variable: Variable): void;
    hasEditVariable(variable: Variable): boolean;
    suggestValue(variable: Variable, value: number): void;
    updateVariables(): void;
  }

  export enum Operator {
    EQ = 0,
    LE = 1,
    GE = 2
  }

  export enum Strength {
    required = 1001001000,
    strong = 1000000,
    medium = 1000,
    weak = 1
  }

  // Helper functions
  export function Eq(lhs: Expression | Variable | number, rhs: Expression | Variable | number, strength?: number): Constraint;
  export function Le(lhs: Expression | Variable | number, rhs: Expression | Variable | number, strength?: number): Constraint;
  export function Ge(lhs: Expression | Variable | number, rhs: Expression | Variable | number, strength?: number): Constraint;
}
