/**
 * Fetches ALL rows from a Supabase query by paginating with .range().
 * Bypasses PostgREST default 1000-row limit.
 *
 * @param queryBuilder - A Supabase query builder (before .range()/.limit())
 * @param pageSize - Number of rows per page (max 1000 for PostgREST)
 * @returns All rows concatenated
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  queryBuilder: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryBuilder.range(
      offset,
      offset + pageSize - 1
    );

    if (error) {
      console.error("[paginate] Error fetching rows:", error.message);
      break;
    }

    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < pageSize) break;

    offset += pageSize;
  }

  return allRows;
}
