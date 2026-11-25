// Build a parameterised dynamic UPDATE SET clause from a column map and a
// partial data object. Replaces the hand-rolled `fields.push(...$n)` builders
// that were duplicated across the route files.
//
//   const { assignments, values } = buildUpdate(
//     { jobTitle: "job_title", company: "company" },
//     { company: "Acme" },
//   );
//   // assignments === ["company = $1"], values === ["Acme"]
//
// Keys whose value is `undefined` are skipped. `values` are positional starting
// at $1; callers append their WHERE parameters after these and reference them at
// `$${values.length + 1}` etc. Only columns present in `columnMap` are emitted,
// so caller-controlled keys can never inject arbitrary column names.
export function buildUpdate<K extends string>(
  columnMap: Record<K, string>,
  data: Partial<Record<K, unknown>>,
): { assignments: string[]; values: unknown[] } {
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(columnMap) as K[]) {
    const value = data[key];
    if (value === undefined) continue;
    values.push(value);
    assignments.push(`${columnMap[key]} = $${values.length}`);
  }
  return { assignments, values };
}
