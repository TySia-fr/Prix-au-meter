/**
 * All SQL used by the app lives here as named constants so the benchmark
 * script (scripts/bench.ts) runs EXPLAIN ANALYZE on exactly the same queries.
 */
export const SQL = {
  streetsInBbox: `
    SELECT street_key, street_name, commune_code, n, median, p25, p75, geom[0] AS lon, geom[1] AS lat
    FROM mv_street_stats
    WHERE geom <@ box(point($1, $2), point($3, $4))
    ORDER BY n DESC
    LIMIT $5`,
  // Limit first, join names after: the planner cannot estimate `<@ box`
  // selectivity, so joining before the top-N sort would join every commune.
  communesInBbox: `
    SELECT a.code, c.name, a.n, a.median, a.p25, a.p75, a.lon, a.lat
    FROM (
      SELECT code, n, median, p25, p75, geom[0] AS lon, geom[1] AS lat
      FROM mv_area_stats
      WHERE level = 'commune' AND property_type = 'ALL' AND geom <@ box(point($1, $2), point($3, $4))
      ORDER BY n DESC
      LIMIT $5
    ) a
    JOIN commune c ON c.code = a.code
    ORDER BY a.n DESC`,
  // KNN on the GiST trigram index: top-$2 by word-similarity distance, per table.
  // The search term is an inline expression (not a CTE) so the planner can use
  // the index for ORDER BY ... <<-> ... and stop after LIMIT rows.
  searchAreas: `
    WITH iris_hits AS (
      SELECT i.code, i.name, i.commune_code, lower(f_unaccent($1::text)) <<-> lower(f_unaccent(i.name)) AS dist
      FROM iris i
      WHERE lower(f_unaccent($1::text)) <% lower(f_unaccent(i.name))
      ORDER BY lower(f_unaccent(i.name)) <->> lower(f_unaccent($1::text))
      LIMIT $2
    ),
    commune_hits AS (
      SELECT c.code, c.name, lower(f_unaccent($1::text)) <<-> lower(f_unaccent(c.name)) AS dist
      FROM commune c
      WHERE lower(f_unaccent($1::text)) <% lower(f_unaccent(c.name))
      ORDER BY lower(f_unaccent(c.name)) <->> lower(f_unaccent($1::text))
      LIMIT $2
    )
    SELECT * FROM (
      SELECT 'iris' AS level, h.code, h.name, c.name AS commune_name, h.dist
      FROM iris_hits h JOIN commune c ON c.code = h.commune_code
      UNION ALL
      SELECT 'commune', code, name, NULL, dist FROM commune_hits
    ) r
    ORDER BY dist, level DESC, name
    LIMIT $2`,
  trend: `
    SELECT year, property_type, n, median, p25, p75
    FROM mv_area_year_stats
    WHERE level = $1 AND code = $2
    ORDER BY year, property_type`,
  areaSummary: `
    SELECT a.property_type, a.n, a.median, a.p25, a.p75, a.geom[0] AS lon, a.geom[1] AS lat
    FROM mv_area_stats a
    WHERE a.level = $1 AND a.code = $2`,
  streetDetail: `
    SELECT street_key, street_name, commune_code, iris_code, n, median, p25, p75, geom[0] AS lon, geom[1] AS lat
    FROM mv_street_stats WHERE street_key = $1`,
  period: `SELECT year_from, year_to FROM v_period`,
  dataSource: `SELECT source, finished_at FROM import_run WHERE status = 'done' ORDER BY finished_at DESC LIMIT 1`,
} as const;
