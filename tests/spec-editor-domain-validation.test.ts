import { describe, it, expect } from 'vitest';
import {
  SpecDocument,
  validateAgainstDomain,
  extractSelectorIdentifiers,
  newId,
} from '../src/spec-editor';
import type {
  DomainSchema,
  SpecItem,
  SpecDocumentState,
  Diagnostic,
} from '../src/spec-editor';

const DOMAIN: DomainSchema = {
  types: [
    { name: 'Node', atoms: ['N0', 'N1', 'N2'] },
    { name: 'Person', atoms: ['Alice', 'Bob'] },
  ],
  relations: [
    { name: 'edges', arity: 2, typeSignature: ['Node', 'Node'] },
    { name: 'parent', arity: 2, typeSignature: ['Person', 'Person'] },
    { name: 'knows', arity: 2, typeSignature: ['Person', 'Person'] },
  ],
};

function constraint(type: string, params: Record<string, unknown>): SpecItem {
  return { id: newId(), kind: 'constraint', type, params };
}

function directive(type: string, params: Record<string, unknown>): SpecItem {
  return { id: newId(), kind: 'directive', type, params };
}

function stateOf(items: SpecItem[]): SpecDocumentState {
  return {
    constraints: items.filter((i) => i.kind === 'constraint'),
    directives: items.filter((i) => i.kind === 'directive'),
  };
}

function messages(diags: Diagnostic[]): string[] {
  return diags.map((d) => d.message);
}

describe('validateAgainstDomain — relationName fields', () => {
  it('warns when a hideField relation is not in the domain', () => {
    const item = directive('hideField', { field: 'spouse' });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].source).toBe('domain');
    expect(diags[0].itemId).toBe(item.id);
    expect(diags[0].fieldKey).toBe('field');
    expect(diags[0].message).toMatch(/Relation "spouse" is not in this instance/);
  });

  it('does not warn when the relation is known', () => {
    const item = directive('hideField', { field: 'parent' });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    expect(diags).toHaveLength(0);
  });
});

describe('validateAgainstDomain — typeName fields', () => {
  it('warns when a relationName/typeName value is unknown', () => {
    // groupfield.field is a relationName; build a synthetic typeName check via
    // a directive carrying a typeName-kind field. The registry's only typeName
    // surface today is none, so we exercise the rule directly through the
    // selector path; here we assert relationName behaviour and rely on the
    // selector identifier tests for type-name coverage.
    const item = directive('hideField', { field: 'Node' });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    // 'Node' is a type, not a relation, so it is NOT a known relation → warns.
    expect(messages(diags)).toEqual([
      'Relation "Node" is not in this instance.',
    ]);
  });
});

describe('validateAgainstDomain — selector fields', () => {
  it('does not warn on selectors that reference only known names', () => {
    const item = constraint('orientation', {
      selector: 'parent',
      directions: ['left'],
    });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    expect(diags).toHaveLength(0);
  });

  it('warns on an unknown identifier in a selector', () => {
    const item = constraint('orientation', {
      selector: 'sibling',
      directions: ['left'],
    });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toMatch(/"sibling" is not a type, relation, or atom/);
    expect(diags[0].fieldKey).toBe('selector');
  });

  it('treats type names, relation names, and atom names as known', () => {
    const item = constraint('orientation', {
      selector: 'Node.edges + Person & Alice',
      directions: ['left'],
    });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    expect(diags).toHaveLength(0);
  });

  it('flags each distinct unknown identifier once', () => {
    const item = constraint('orientation', {
      selector: 'foo.bar + foo',
      directions: ['left'],
    });
    const diags = validateAgainstDomain(stateOf([item]), DOMAIN);
    // foo and bar — foo only once.
    expect(messages(diags).sort()).toEqual([
      '"bar" is not a type, relation, or atom in this instance.',
      '"foo" is not a type, relation, or atom in this instance.',
    ]);
  });
});

describe('extractSelectorIdentifiers — positive cases', () => {
  it('pulls identifiers out of a join expression', () => {
    expect(extractSelectorIdentifiers('Node.edges')).toEqual(['Node', 'edges']);
  });

  it('pulls identifiers across set operators', () => {
    expect(extractSelectorIdentifiers('parent + knows - edges')).toEqual([
      'parent',
      'knows',
      'edges',
    ]);
  });

  it('handles closures and transpose', () => {
    expect(extractSelectorIdentifiers('^edges + ~parent')).toEqual([
      'edges',
      'parent',
    ]);
  });
});

describe('extractSelectorIdentifiers — negative cases (must NOT flag)', () => {
  it('excludes language keywords and built-in values', () => {
    const ids = extractSelectorIdentifiers('univ + iden + none - Int');
    expect(ids).toEqual([]);
  });

  it('excludes quantifier-bound variables', () => {
    // `n` is bound by the quantifier; only the real names should remain.
    const ids = extractSelectorIdentifiers('all n : Node | n.edges');
    expect(ids).toEqual(['Node', 'edges']);
    expect(ids).not.toContain('n');
  });

  it('excludes multiple bound variables in one decl', () => {
    const ids = extractSelectorIdentifiers('some x, y : Person | x.parent = y');
    expect(ids.sort()).toEqual(['Person', 'parent']);
    expect(ids).not.toContain('x');
    expect(ids).not.toContain('y');
  });

  it('excludes let-bound variables', () => {
    const ids = extractSelectorIdentifiers('let a = Node.edges | a + a');
    expect(ids).toEqual(['Node', 'edges']);
    expect(ids).not.toContain('a');
  });

  it('excludes numbers and quoted strings', () => {
    const ids = extractSelectorIdentifiers('#edges = 3 and "hello world"');
    // 'and' is a keyword, 3 and the string are not identifiers, edges remains.
    expect(ids).toEqual(['edges']);
  });

  it('excludes contents of line comments', () => {
    const ids = extractSelectorIdentifiers('edges // sibling parent\n');
    expect(ids).toEqual(['edges']);
  });

  it('returns nothing for empty / whitespace selectors', () => {
    expect(extractSelectorIdentifiers('')).toEqual([]);
    expect(extractSelectorIdentifiers('   ')).toEqual([]);
  });
});

describe('SpecDocument.validate(domain?) wiring', () => {
  it('produces NO domain diagnostics when no domain is given', () => {
    const doc = SpecDocument.fromYaml(
      'constraints:\n  - orientation:\n      selector: nope\n      directions: [left]\n',
    );
    const diags = doc.validate();
    expect(diags.every((d) => d.source !== 'domain')).toBe(true);
  });

  it('appends domain warnings when a domain is given', () => {
    const doc = SpecDocument.fromYaml(
      'constraints:\n  - orientation:\n      selector: nope\n      directions: [left]\n',
    );
    const diags = doc.validate(DOMAIN);
    const domainDiags = diags.filter((d) => d.source === 'domain');
    expect(domainDiags).toHaveLength(1);
    expect(domainDiags[0].message).toMatch(/"nope" is not a type, relation, or atom/);
  });

  it('still produces structural diagnostics alongside domain ones', () => {
    // Missing required selector → structural error; plus domain has nothing to
    // flag here. Confirms both sources coexist.
    const doc = SpecDocument.fromYaml(
      'constraints:\n  - orientation:\n      directions: [left]\n',
    );
    const diags = doc.validate(DOMAIN);
    expect(diags.some((d) => d.source === 'structure')).toBe(true);
  });
});
