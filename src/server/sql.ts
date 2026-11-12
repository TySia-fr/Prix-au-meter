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
  communesInBbox: `
    SELECT a.code, c.name, a.n, a.median, a.p25, a.p75, a.geom[0] AS lon, a.geom[1] AS lat
    FROM mv_area_stats a JOIN commune c ON c.code = a.code
    WHERE a.level = 'commune' AND a.property_type = 'ALL' AND a.geom <@ box(point($1, $2), point($3, $4))
    ORDER BY a.n DESC
    LIMIT $5`,
  searchAreas: `
    WITH q AS (SELECT lower(f_unaccent($1)) AS t)
    SELECT * FROM (
      SELECT 'iris' AS level, i.code, i.name, c.name AS commune_name, similarity(lower(f_unaccent(i.name)), q.t) AS score
      FROM iris i JOIN commune c ON c.code = i.commune_code, q
      WHERE lower(f_unaccent(i.name)) % q.t OR lower(f_unaccent(i.name)) LIKE q.t || '%'
      UNION ALL
      SELECT 'commune', c.code, c.name, NULL, similarity(lower(f_unaccent(c.name)), q.t)
      FROM commune c, q
      WHERE lower(f_unaccent(c.name)) % q.t OR lower(f_unaccent(c.name)) LIKE q.t || '%'
    ) r
    ORDER BY score DESC, name
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
