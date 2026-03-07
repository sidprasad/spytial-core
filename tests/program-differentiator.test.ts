import { describe, it, expect } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { findProgramDiffWitness } from '../src/synthesis/program-differentiator';

function makeSchema(): JSONDataInstance {
  return new JSONDataInstance({
    atoms: [
      { id: 'p1', type: 'Person', label: 'p1', labels: [] },
      { id: 'p2', type: 'Person', label: 'p2', labels: [] },
    ],
    relations: [
      {
        id: 'friends',
        name: 'friends',
        types: ['Person', 'Person'],
        tuples: [
          { atoms: ['p1', 'p2'], types: ['Person', 'Person'] },
        ],
      },
    ],
    types: [
      { id: 'Person', types: ['Person'], atoms: ['p1', 'p2'], isBuiltin: false },
    ],
  });
}

describe('findProgramDiffWitness', () => {
  it('finds a witness instance when programs use different selectors', () => {
    const schema = makeSchema();

    const programA = `
constraints:
  - orientation:
      selector: Person
      directions: [right]
`;

    const programB = `
constraints:
  - orientation:
      selector: friends
      directions: [right]
`;

    const witness = findProgramDiffWitness(schema, programA, programB);

    expect(witness).not.toBeNull();
    expect(witness!.manifests.programA).not.toBe(witness!.manifests.programB);
    expect(witness!.instance.getAtoms().length).toBeGreaterThan(0);
  });

  it('returns null when there are no selectors to compare', () => {
    const schema = makeSchema();
    const witness = findProgramDiffWitness(schema, '', '');
    expect(witness).toBeNull();
  });
});
