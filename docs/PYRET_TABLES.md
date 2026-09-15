# Pyret table reconstruction

Table support preserves ordered column names, ordered rows, duplicate row
occurrences, and supported cell values through atoms and relations alone. This
is a stronger contract than Pyret's `<table>` inspection marker. The marker's
acceptance case remains `skeleton/table`; separately named structural and
behavior checks verify the contents.

## Relational representation

For `table: name, score row: "Ada", 7 row: "Ada", 7 end`:

```text
column(t, i0, name)
column(t, i1, score)
row(t, i0, ada, seven)
row(t, i1, ada, seven)
```

Here `t` is a `Table` atom; `i0` and `i1` are `Index` atoms labelled `0` and
`1`. `name`, `score`, and `ada` are `String` atoms with the corresponding
labels; `seven` is a `Number` atom labelled `7`. Tuple endpoints are atom IDs.
Atom IDs, relation IDs, and structured display labels are not decoded.
Constructor-field IDs retain their established v6 meaning.

- `column(Table, Index, String)` records header positions and names.
- `row(Table, Index, PyretObject, ...)` records each row occurrence and its cells.
  There is one relation record per width, with distinct opaque IDs and the same
  lookup name `row`. Cell columns accept any supported value type.
- Empty tables retain their header tuples. Zero-column rows are binary
  `row(table, index)` tuples. Counts follow from the tuples.
- Reification takes the selected table's ID as an argument when the root cannot
  be inferred uniquely. No root marker, counts, header list, or original source
  is stored as metadata.

Positions must be dense from zero, column names unique, and row widths equal to
the number of columns. Conflicting positions, malformed headers, dangling cell
references, and unsupported cells produce errors. Exact duplicate relation facts
are idempotent; distinct row occurrences need distinct positions.

To reorder rows, change their position endpoints. To reorder columns, change
the column positions and permute the corresponding cell columns in every row.
Index atoms may be shared across tables, rows, and columns: changing an Index
label affects every tuple that uses it. Replace endpoints for a local edit.

## Reconstruction and boundaries

The relationalizer reads full runtime table storage, including rows beyond the
printer's 1,000-row display limit. The structural reifier reconstructs cells
through its shared object memo. Source reification uses table literals where
possible, public `table-from-columns` constructors for string-named columns,
and `empty-table` with empty-row additions for zero columns. Supply
`include tables` and any cell-specific imports or data declarations **after**
reification, in the evaluation environment.

Shared cell identity and the existing supported reference/mutable-dictionary
cycles are preserved through graph construction. Table contents cannot expand
the existing reference construction subset: a reference still needs a reachable
mutable constructor field that can allocate it. Direct immutable cycles are
rejected. Standalone Pyret `Row` wrappers and function cells are outside this
support; table row occurrences do not have separate Row-object identity.

Source column annotations are initial checks, not retained constraints on the
runtime table. Source expressions, loading history, sanitizers, and display
formatting are not reconstructed. Cells retain the support and limitations of
their respective value kinds.

## Migration for queries and diagrams

This changes the earlier `row(cell0, cell1, ...)` shape and the earlier runtime
`table` atom type. Table atoms now have the stable type `Table`.

Use `Index.(t.row)` for a selected table's cell-only relation, or
`Index.(Table.row)` across tables. For a two-column flight table, this gives the
original `(origin, destination)` edges. For example:

```yaml
directives:
  - inferredEdge:
      name: flight
      selector: Index.(Table.row)
```

Retarget existing selectors to the projection. For diagrams that should show
only cell edges, also hide the structural table/header/position nodes and edges
using the existing visibility directives. The projection is a set view:
identical cell tuples collapse after projecting away row positions, while the
authoritative `row` relation retains every occurrence. No second writable copy
of row data is stored.

Old serialized table data omitted headers, positions, and some cells; those
facts cannot be recovered. Relationalize the live value again to obtain the new
representation. This is a data-contract change to account for when releasing
and updating pinned consumers; this change does not itself update IDE assets.

## Verification

`tests/pyret/pyret-table-fidelity.test.ts` covers serialized reconstruction,
independently authored and edited relations, invalid data, schema signatures,
query projections, and an airport-diagram layout using projected rows.

```sh
node --import tsx scripts/check-pyret-value-fidelity.mjs /path/to/built/pyret-lang
```

The runtime script clears caches and renames IDs before reification. Its
separate `table contents and behavior` check block compares ordered headers and
rows through public accessors, including nested tables, and tests shared-cell
mutation, cycles, and table operations. The original inspection checks remain
separate. This supplements the browser acceptance harness; it does not promote
the IDE tracker's pending cases or establish that the IDE's pinned core assets
have been updated. See [core #599](https://github.com/sidprasad/spytial-core/issues/599)
and [IDE acceptance tracker #8](https://github.com/sidprasad/spyret-ide/issues/8).
