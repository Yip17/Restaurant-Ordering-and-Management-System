-- =============================================================================
-- functions_and_stored_procedures.sql
-- Dashboard database function for the admin restaurant management dashboard.
--
-- WHY A FUNCTION (not a procedure):
--   get_sale_order_summary is a READ-ONLY operation — it retrieves and
--   aggregates data but makes no changes to the database.
--   PostgreSQL STABLE functions are appropriate for read-only queries:
--     • They return a result set that can be consumed like a table.
--     • STABLE tells the planner the function will not modify the DB and
--       returns the same result for the same args within a single query,
--       allowing query plan optimisations.
--     • Procedures (CALL) are for write operations with side-effects;
--       using one here would be semantically wrong.
--
-- AMBIGUITY NOTE (plpgsql RETURNS TABLE):
--   Output column names declared in RETURNS TABLE share the function's
--   variable scope with local table column names.  Every column reference
--   inside the body is qualified with a table alias (so.xxx, m.xxx …) so
--   plpgsql always resolves to the table column, never the output variable.
--
-- Safe to re-run: CREATE OR REPLACE.
-- Run after restaurant_db_restore.sql (base tables must exist first).
-- =============================================================================


-- =============================================================================
-- get_sale_order_summary
-- Retrieves summarised order data for the admin dashboard.
--
-- Joins: member ← sale_order ← sale_order_item → product
--
-- Supports (all combinable):
--   Filtering  — p_start_date, p_end_date (date range), p_category (product type),
--                p_status (order status: PACKING | COMPLETED | CANCELLED)
--   Sorting    — p_sort_by ('order_date'|'total_amount'|'customer_name'|'status')
--                combined with p_sort_order ('ASC'|'DESC')
--   Aggregation — product_count (COUNT of line items),
--                 products_ordered (comma-separated product names via STRING_AGG)
--
-- Passing NULL for any parameter skips that filter.
--
-- PgAdmin:
--   SELECT * FROM get_sale_order_summary(NULL, NULL, NULL, NULL, 'order_date', 'DESC');
--   SELECT * FROM get_sale_order_summary('2024-01-01','2024-12-31','Pizza',NULL,'total_amount','DESC');
--   SELECT * FROM get_sale_order_summary(NULL, NULL, NULL, 'COMPLETED', 'order_date', 'ASC');
-- =============================================================================
CREATE OR REPLACE FUNCTION get_sale_order_summary(
    p_start_date  DATE,
    p_end_date    DATE,
    p_category    VARCHAR,
    p_status      VARCHAR,
    p_sort_by     VARCHAR,
    p_sort_order  VARCHAR
)
RETURNS TABLE (
    out_order_id         INTEGER,
    out_customer_name    TEXT,
    out_order_date       TIMESTAMP,
    out_total_amount     NUMERIC,
    out_status           VARCHAR,
    out_product_count    BIGINT,
    out_products_ordered TEXT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    -- Whitelist sort column to prevent SQL injection
    v_sort_col  TEXT;
    -- Whitelist sort direction
    v_sort_dir  TEXT;
    -- Dynamic query string
    v_sql       TEXT;
BEGIN
    -- ── Validate / whitelist sort column ─────────────────────────────────
    v_sort_col := CASE p_sort_by
        WHEN 'total_amount'  THEN 'so.total_amount'
        WHEN 'customer_name' THEN 'customer_name'
        WHEN 'status'        THEN 'so.status'
        ELSE                      'so.order_date'   -- default
    END;

    -- ── Validate / whitelist sort direction ──────────────────────────────
    v_sort_dir := CASE UPPER(p_sort_order)
        WHEN 'ASC' THEN 'ASC'
        ELSE            'DESC'                       -- default
    END;

    -- ── Validate status value if provided ────────────────────────────────
    IF p_status IS NOT NULL AND p_status NOT IN ('PACKING', 'COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be PACKING, COMPLETED, or CANCELLED.';
    END IF;

    -- ── Build and execute dynamic SQL ────────────────────────────────────
    -- Dynamic ORDER BY is the only safe reason to use dynamic SQL here.
    -- All filter values are still passed as bind parameters ($1-$4) to
    -- prevent any injection through the filter inputs.
    v_sql := '
        SELECT
            so.order_id,
            m.first_name || '' '' || m.last_name   AS customer_name,
            so.order_date,
            so.total_amount,
            so.status,
            COUNT(soi.order_item_id)::BIGINT        AS product_count,
            STRING_AGG(p.name, '', '' ORDER BY p.name) AS products_ordered
        FROM sale_order so
        JOIN member          m   ON m.member_id   = so.member_id
        JOIN sale_order_item soi ON soi.order_id  = so.order_id
        JOIN product         p   ON p.product_id  = soi.product_id
        WHERE ($1::DATE IS NULL OR DATE(so.order_date) >= $1::DATE)
          AND ($2::DATE IS NULL OR DATE(so.order_date) <= $2::DATE)
          AND ($3        IS NULL OR p.category           = $3)
          AND ($4        IS NULL OR so.status            = $4)
        GROUP BY so.order_id, m.first_name, m.last_name,
                 so.order_date, so.total_amount, so.status
        ORDER BY ' || v_sort_col || ' ' || v_sort_dir;

    RETURN QUERY EXECUTE v_sql
        USING p_start_date, p_end_date, p_category, p_status;
END;
$$;
