import { DisjunctiveConstraint, ImplicitConstraint, InstanceLayout, LayoutConstraint, LayoutGroup, LayoutNode, isAlignmentConstraint, isBoundingBoxConstraint, isGroupBoundaryConstraint, isLeftConstraint, isTopConstraint } from './interfaces';
import { type ConstraintError, orientationConstraintToString } from './constraint-validator';
import { RelativeOrientationConstraint, CyclicOrientationConstraint, AlignConstraint, GroupByField, GroupBySelector } from './layoutspec';


type SourceConstraint = RelativeOrientationConstraint | CyclicOrientationConstraint | AlignConstraint | ImplicitConstraint | GroupByField | GroupBySelector;

type CoreEntry = {
    name: string;
    type: 'constraint' | 'disjunction';
    sourceConstraint: SourceConstraint;
    constraints: LayoutConstraint[];
};

type SolverRunner = (input: string) => string | Promise<string>;

interface ConstraintValidatorOptions {
    runSolver?: SolverRunner;
}

class SmtlibConstraintValidator {
    private readonly layout: InstanceLayout;
    private readonly nodes: LayoutNode[];
    private readonly groups: LayoutGroup[];
    private readonly disjunctiveConstraints: DisjunctiveConstraint[];
    private readonly minPadding = 15;
    private readonly runSolver: SolverRunner;

    constructor(layout: InstanceLayout, options: ConstraintValidatorOptions = {}) {
        this.layout = layout;
        this.nodes = layout.nodes;
        this.groups = layout.groups;
        this.disjunctiveConstraints = [...(layout.disjunctiveConstraints ?? [])];
        this.runSolver = options.runSolver ?? this.defaultSolver;
    }

    public validateConstraints(): ConstraintError | null {
        this.addGroupBoundingBoxDisjunctions();
        const { smtlib, coreEntries } = this.buildSmtlib();
        const checkResult = this.runZ3(`${smtlib}\n(check-sat)`);
        const status = checkResult.trim().split(/\s+/)[0];

        if (status === 'sat') {
            return null;
        }

        if (status !== 'unsat') {
            throw new Error(`Unexpected Z3 status: ${status}`);
        }

        const coreOutput = this.runZ3(`${smtlib}\n(check-sat)\n(get-unsat-core)`);
        const coreConstraints = this.resolveCoreConstraints(coreOutput, coreEntries);
        return this.buildConstraintError(coreConstraints);
    }

    public async validateConstraintsAsync(): Promise<ConstraintError | null> {
        this.addGroupBoundingBoxDisjunctions();
        const { smtlib, coreEntries } = this.buildSmtlib();
        const checkResult = await this.runSolverAsync(`${smtlib}\n(check-sat)`);
        const status = checkResult.trim().split(/\s+/)[0];

        if (status === 'sat') {
            return null;
        }

        if (status !== 'unsat') {
            throw new Error(`Unexpected Z3 status: ${status}`);
        }

        const coreOutput = await this.runSolverAsync(`${smtlib}\n(check-sat)\n(get-unsat-core)`);
        const coreConstraints = this.resolveCoreConstraints(coreOutput, coreEntries);
        return this.buildConstraintError(coreConstraints);
    }

    private addGroupBoundingBoxDisjunctions() {
        const nodeToGroups = new Map<string, Set<LayoutGroup>>();
        for (const node of this.nodes) {
            nodeToGroups.set(node.id, new Set());
        }

        for (const group of this.groups) {
            if (group.nodeIds.length > 1 && group.sourceConstraint) {
                for (const nodeId of group.nodeIds) {
                    nodeToGroups.get(nodeId)?.add(group);
                }
            }
        }

        for (const group of this.groups) {
            if (group.nodeIds.length <= 1 || !group.sourceConstraint) {
                continue;
            }

            const memberIds = new Set(group.nodeIds);

            for (const node of this.nodes) {
                if (memberIds.has(node.id)) {
                    continue;
                }
                const nodeGroups = nodeToGroups.get(node.id);
                if (nodeGroups && nodeGroups.size > 0) {
                    continue;
                }

                const sourceConstraint = group.sourceConstraint;
                const alternatives: LayoutConstraint[][] = [
                    [{ group, node, side: 'left', minDistance: this.minPadding, sourceConstraint }],
                    [{ group, node, side: 'right', minDistance: this.minPadding, sourceConstraint }],
                    [{ group, node, side: 'top', minDistance: this.minPadding, sourceConstraint }],
                    [{ group, node, side: 'bottom', minDistance: this.minPadding, sourceConstraint }]
                ];

                this.disjunctiveConstraints.push(new DisjunctiveConstraint(sourceConstraint, alternatives));
            }
        }

        for (let i = 0; i < this.groups.length; i++) {
            for (let j = i + 1; j < this.groups.length; j++) {
                const groupA = this.groups[i];
                const groupB = this.groups[j];

                if (groupA.nodeIds.length <= 1 || groupB.nodeIds.length <= 1) {
                    continue;
                }

                if (this.isSubGroup(groupA, groupB) || this.isSubGroup(groupB, groupA)) {
                    continue;
                }

                if (this.groupIntersection(groupA, groupB).length > 0) {
                    continue;
                }

                const sourceConstraint = groupA.sourceConstraint || groupB.sourceConstraint;
                if (!sourceConstraint) {
                    continue;
                }

                const alternatives: LayoutConstraint[][] = [
                    [{ groupA, groupB, side: 'left', minDistance: this.minPadding, sourceConstraint }],
                    [{ groupA, groupB, side: 'right', minDistance: this.minPadding, sourceConstraint }],
                    [{ groupA, groupB, side: 'top', minDistance: this.minPadding, sourceConstraint }],
                    [{ groupA, groupB, side: 'bottom', minDistance: this.minPadding, sourceConstraint }]
                ];

                this.disjunctiveConstraints.push(new DisjunctiveConstraint(sourceConstraint, alternatives));
            }
        }
    }

    private buildSmtlib(): { smtlib: string; coreEntries: Map<string, CoreEntry> } {
        const lines: string[] = [];
        lines.push('(set-option :produce-unsat-cores true)');
        lines.push('(set-option :produce-models true)');
        lines.push('(set-logic QF_LRA)');

        const nodeVars = new Map<string, { x: string; y: string }>();
        this.nodes.forEach((node, index) => {
            const x = `n${index}_x`;
            const y = `n${index}_y`;
            nodeVars.set(node.id, { x, y });
            lines.push(`(declare-const ${x} Real)`);
            lines.push(`(declare-const ${y} Real)`);
        });

        const groupVars = new Map<string, { left: string; right: string; top: string; bottom: string }>();
        this.groups.forEach((group, index) => {
            if (group.nodeIds.length <= 1 || !group.sourceConstraint) {
                return;
            }
            const left = `g${index}_left`;
            const right = `g${index}_right`;
            const top = `g${index}_top`;
            const bottom = `g${index}_bottom`;
            groupVars.set(group.name, { left, right, top, bottom });
            lines.push(`(declare-const ${left} Real)`);
            lines.push(`(declare-const ${right} Real)`);
            lines.push(`(declare-const ${top} Real)`);
            lines.push(`(declare-const ${bottom} Real)`);
        });

        for (const group of this.groups) {
            if (group.nodeIds.length <= 1 || !group.sourceConstraint) {
                continue;
            }
            const bbox = groupVars.get(group.name);
            if (!bbox) {
                continue;
            }

            for (const nodeId of group.nodeIds) {
                const vars = nodeVars.get(nodeId);
                if (!vars) {
                    continue;
                }
                lines.push(`(assert (>= ${vars.x} ${bbox.left}))`);
                lines.push(`(assert (<= ${vars.x} ${bbox.right}))`);
                lines.push(`(assert (>= ${vars.y} ${bbox.top}))`);
                lines.push(`(assert (<= ${vars.y} ${bbox.bottom}))`);
            }
        }

        const coreEntries = new Map<string, CoreEntry>();
        let counter = 0;

        const addTrackedConstraint = (expr: string, constraints: LayoutConstraint[], sourceConstraint: SourceConstraint, type: 'constraint' | 'disjunction') => {
            const name = `core_${type}_${counter++}`;
            lines.push(`(assert (! ${expr} :named ${name}))`);
            coreEntries.set(name, { name, type, sourceConstraint, constraints });
        };

        for (const constraint of this.layout.constraints) {
            const expr = this.constraintToSmtlib(constraint, nodeVars, groupVars);
            if (!expr) {
                continue;
            }
            addTrackedConstraint(expr, [constraint], constraint.sourceConstraint, 'constraint');
        }

        this.disjunctiveConstraints.forEach((disjunction, index) => {
            const selectorNames: string[] = [];

            disjunction.alternatives.forEach((alternative, altIndex) => {
                const selector = `d${index}_alt${altIndex}`;
                selectorNames.push(selector);
                lines.push(`(declare-const ${selector} Bool)`);

                const exprs = alternative
                    .map(constraint => this.constraintToSmtlib(constraint, nodeVars, groupVars))
                    .filter((expr): expr is string => Boolean(expr));

                if (exprs.length === 0) {
                    return;
                }

                const altExpr = exprs.length === 1 ? exprs[0] : `(and ${exprs.join(' ')})`;
                lines.push(`(assert (=> ${selector} ${altExpr}))`);
            });

            if (selectorNames.length > 0) {
                const orExpr = `(or ${selectorNames.join(' ')})`;
                const flattened = disjunction.alternatives.flat();
                addTrackedConstraint(orExpr, flattened, disjunction.sourceConstraint, 'disjunction');
            }
        });

        return { smtlib: lines.join('\n'), coreEntries };
    }

    private constraintToSmtlib(
        constraint: LayoutConstraint,
        nodeVars: Map<string, { x: string; y: string }>,
        groupVars: Map<string, { left: string; right: string; top: string; bottom: string }>
    ): string | null {
        if (isTopConstraint(constraint)) {
            const topVars = nodeVars.get(constraint.top.id);
            const bottomVars = nodeVars.get(constraint.bottom.id);
            if (!topVars || !bottomVars) {
                return null;
            }
            const minDistance = this.formatNumber(constraint.top.height);
            return `(<= (+ ${topVars.y} ${minDistance}) ${bottomVars.y})`;
        }

        if (isLeftConstraint(constraint)) {
            const leftVars = nodeVars.get(constraint.left.id);
            const rightVars = nodeVars.get(constraint.right.id);
            if (!leftVars || !rightVars) {
                return null;
            }
            const minDistance = this.formatNumber(constraint.left.width);
            return `(<= (+ ${leftVars.x} ${minDistance}) ${rightVars.x})`;
        }

        if (isAlignmentConstraint(constraint)) {
            const node1Vars = nodeVars.get(constraint.node1.id);
            const node2Vars = nodeVars.get(constraint.node2.id);
            if (!node1Vars || !node2Vars) {
                return null;
            }
            const axisVar = constraint.axis === 'x' ? 'x' : 'y';
            return `(= ${node1Vars[axisVar]} ${node2Vars[axisVar]})`;
        }

        if (isBoundingBoxConstraint(constraint)) {
            const nodeVarsForConstraint = nodeVars.get(constraint.node.id);
            const bbox = groupVars.get(constraint.group.name);
            if (!nodeVarsForConstraint || !bbox) {
                return null;
            }
            const padding = this.formatNumber(constraint.minDistance);
            switch (constraint.side) {
                case 'left':
                    return `(<= (+ ${nodeVarsForConstraint.x} ${padding}) ${bbox.left})`;
                case 'right':
                    return `(>= ${nodeVarsForConstraint.x} (+ ${bbox.right} ${padding}))`;
                case 'top':
                    return `(<= (+ ${nodeVarsForConstraint.y} ${padding}) ${bbox.top})`;
                case 'bottom':
                    return `(>= ${nodeVarsForConstraint.y} (+ ${bbox.bottom} ${padding}))`;
                default:
                    return null;
            }
        }

        if (isGroupBoundaryConstraint(constraint)) {
            const bboxA = groupVars.get(constraint.groupA.name);
            const bboxB = groupVars.get(constraint.groupB.name);
            if (!bboxA || !bboxB) {
                return null;
            }
            const padding = this.formatNumber(constraint.minDistance);
            switch (constraint.side) {
                case 'left':
                    return `(<= (+ ${bboxA.right} ${padding}) ${bboxB.left})`;
                case 'right':
                    return `(<= (+ ${bboxB.right} ${padding}) ${bboxA.left})`;
                case 'top':
                    return `(<= (+ ${bboxA.bottom} ${padding}) ${bboxB.top})`;
                case 'bottom':
                    return `(<= (+ ${bboxB.bottom} ${padding}) ${bboxA.top})`;
                default:
                    return null;
            }
        }

        return null;
    }

    private parseUnsatCore(output: string): string[] {
        const lines = output.trim().split(/\r?\n/);
        const coreLine = lines.find(line => line.startsWith('(')) ?? '';
        const matches = coreLine.match(/[a-zA-Z][a-zA-Z0-9_]*/g);
        return matches ?? [];
    }

    private defaultSolver(): string {
        throw new Error('No SMT solver configured. Provide a runSolver callback to execute Z3 or MiniZinc.');
    }

    private runZ3(input: string): string {
        try {
            return this.ensureSyncResult(this.runSolver(input));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to run SMT solver: ${message}`);
        }
    }

    private async runSolverAsync(input: string): Promise<string> {
        try {
            return await this.runSolver(input);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to run SMT solver: ${message}`);
        }
    }

    private ensureSyncResult(result: string | Promise<string>): string {
        if (this.isPromiseLike(result)) {
            throw new Error('Async SMT solver provided. Use validateConstraintsAsync instead.');
        }
        return result;
    }

    private isPromiseLike(value: string | Promise<string>): value is Promise<string> {
        return typeof (value as Promise<string>)?.then === 'function';
    }

    private formatNumber(value: number): string {
        return Number.isInteger(value) ? `${value}` : value.toString();
    }

    private isSubGroup(groupA: LayoutGroup, groupB: LayoutGroup): boolean {
        return groupA.nodeIds.every(id => groupB.nodeIds.includes(id));
    }

    private groupIntersection(groupA: LayoutGroup, groupB: LayoutGroup): string[] {
        const groupBNodes = new Set(groupB.nodeIds);
        return groupA.nodeIds.filter(id => groupBNodes.has(id));
    }

    private resolveCoreConstraints(output: string, coreEntries: Map<string, CoreEntry>): CoreEntry[] {
        const coreNames = this.parseUnsatCore(output);
        const coreConstraints = coreNames
            .map(name => coreEntries.get(name))
            .filter((entry): entry is CoreEntry => Boolean(entry));

        if (coreConstraints.length === 0) {
            throw new Error('Z3 reported UNSAT but no core constraints were returned.');
        }

        return coreConstraints;
    }

    private buildConstraintError(coreConstraints: CoreEntry[]): ConstraintError {
        const minimalConflictingSet = new Map<SourceConstraint, LayoutConstraint[]>();
        const minimalConflictingMessages = new Map<string, string[]>();

        for (const entry of coreConstraints) {
            const sourceConstraint = entry.sourceConstraint;
            if (!minimalConflictingSet.has(sourceConstraint)) {
                minimalConflictingSet.set(sourceConstraint, []);
            }
            if (!minimalConflictingMessages.has(sourceConstraint.toHTML())) {
                minimalConflictingMessages.set(sourceConstraint.toHTML(), []);
            }

            const existing = minimalConflictingSet.get(sourceConstraint)!;
            for (const constraint of entry.constraints) {
                existing.push(constraint);
                minimalConflictingMessages.get(sourceConstraint.toHTML())!.push(orientationConstraintToString(constraint));
            }
        }

        const firstConstraint = coreConstraints[0].constraints[0];
        const message = firstConstraint
            ? `Constraint "${orientationConstraintToString(firstConstraint)}" conflicts with existing constraints`
            : 'Constraint set is unsatisfiable.';

        return {
            name: 'PositionalConstraintError',
            type: 'positional-conflict',
            message,
            conflictingConstraint: firstConstraint ?? this.layout.constraints[0],
            conflictingSourceConstraint: coreConstraints[0].sourceConstraint,
            minimalConflictingSet,
            errorMessages: {
                conflictingConstraint: firstConstraint ? orientationConstraintToString(firstConstraint) : 'Unsatisfiable constraint set',
                conflictingSourceConstraint: coreConstraints[0].sourceConstraint.toHTML(),
                minimalConflictingConstraints: minimalConflictingMessages
            }
        };
    }
}

const SUPPORTED_SMTLIB_PREFIXES = [
    '(declare-const',
    '(declare-fun',
    '(declare-sort',
    '(define-fun',
    '(assert',
    '(set-logic',
    '(set-option'
];

export async function createZ3SolverRunner(): Promise<(input: string) => Promise<string>> {
    const z3Module = await import('z3-solver');
    const init = (z3Module as any).init ?? (z3Module as any).default?.init;
    if (!init) {
        throw new Error('z3-solver did not expose an init() function.');
    }

    const { Context } = await init();
    const ctx = Context('main');
    return async (input: string) => {
        const wantsCore = input.includes('(get-unsat-core)');
        const solver = new ctx.Solver();
        const filtered = input
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => SUPPORTED_SMTLIB_PREFIXES.some(prefix => line.startsWith(prefix)));
        solver.fromString(filtered.join('\n'));

        const status = solver.check();
        const statusText = status?.toString ? status.toString() : String(status);

        if (!wantsCore || statusText !== 'unsat') {
            return statusText;
        }

        if (typeof solver.getUnsatCore !== 'function') {
            return `${statusText}\n()`;
        }

        const core = solver.getUnsatCore();
        const coreLine = Array.isArray(core)
            ? `(${core.map(item => item.toString()).join(' ')})`
            : core?.toString?.() ?? '()';

        return `${statusText}\n${coreLine}`;
    };
}

export { SmtlibConstraintValidator };
