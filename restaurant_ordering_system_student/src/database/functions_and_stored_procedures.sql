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


-- =============================================================================
-- MEMBER FUNCTIONS & PROCEDURES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_member_by_email
-- Looks up a member by email for login.
-- Returns member_id, username, password_hash, and role.
-- Returns empty result set if not found (not an error — caller checks).
--
-- PgAdmin: SELECT * FROM get_member_by_email('user@example.com');
-- App:     SELECT * FROM get_member_by_email($1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_member_by_email(p_email VARCHAR)
RETURNS TABLE (
    out_member_id     INTEGER,
    out_username      VARCHAR,
    out_password_hash TEXT,
    out_role          VARCHAR
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
        SELECT m.member_id, m.username, m.password_hash, mr.role
          FROM member m
          JOIN member_role mr ON mr.member_id = m.member_id
         WHERE m.email = p_email
         LIMIT 1;
END;
$$;


-- -----------------------------------------------------------------------------
-- register_member
-- Creates a new member and assigns a role atomically.
-- Raises an error (caught by Node) if username or email is already taken.
-- OUT p_member_id — the newly created member's ID.
--
-- PgAdmin: CALL register_member('alice', 'alice@example.com', 'hashed', 'Alice', 'Smith', 'USER', NULL);
-- App:     CALL register_member($1, $2, $3, $4, $5, $6, NULL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE register_member(
    IN  p_username      VARCHAR,
    IN  p_email         VARCHAR,
    IN  p_password_hash TEXT,
    IN  p_first_name    VARCHAR,
    IN  p_last_name     VARCHAR,
    IN  p_role          VARCHAR,
    OUT p_member_id     INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM member m WHERE m.username = p_username) THEN
        RAISE EXCEPTION 'USERNAME_TAKEN: Username % is already taken.', p_username;
    END IF;

    IF EXISTS (SELECT 1 FROM member m WHERE m.email = p_email) THEN
        RAISE EXCEPTION 'EMAIL_TAKEN: Email % is already registered.', p_email;
    END IF;

    INSERT INTO member (username, email, password_hash, first_name, last_name)
    VALUES (p_username, p_email, p_password_hash, p_first_name, p_last_name)
    RETURNING member.member_id INTO p_member_id;

    INSERT INTO member_role (member_id, role)
    VALUES (p_member_id, p_role);
END;
$$;


-- =============================================================================
-- PRODUCT FUNCTIONS & PROCEDURES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_products
-- Returns all available products ordered by name.
--
-- PgAdmin: SELECT * FROM get_products();
-- App:     SELECT * FROM get_products()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_products()
RETURNS TABLE (
    out_product_id   INTEGER,
    out_name         VARCHAR,
    out_description  TEXT,
    out_price        NUMERIC,
    out_category     VARCHAR,
    out_is_available BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
        SELECT p.product_id, p.name, p.description, p.price, p.category, p.is_available
          FROM product p
         WHERE p.is_available = true
         ORDER BY p.name;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_product_by_id
-- Returns a single product by its ID.
-- Returns empty result set if not found.
--
-- PgAdmin: SELECT * FROM get_product_by_id(1);
-- App:     SELECT * FROM get_product_by_id($1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_product_by_id(p_product_id INTEGER)
RETURNS TABLE (
    out_product_id   INTEGER,
    out_name         VARCHAR,
    out_description  TEXT,
    out_price        NUMERIC,
    out_category     VARCHAR,
    out_is_available BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
        SELECT p.product_id, p.name, p.description, p.price, p.category, p.is_available
          FROM product p
         WHERE p.product_id = p_product_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_product_categories
-- Returns all distinct non-null product categories in alphabetical order.
--
-- PgAdmin: SELECT * FROM get_product_categories();
-- App:     SELECT * FROM get_product_categories()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_product_categories()
RETURNS TABLE (out_category VARCHAR)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
        SELECT DISTINCT p.category
          FROM product p
         WHERE p.category IS NOT NULL
         ORDER BY p.category;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_product_by_category
-- Returns the first product matching a category name.
-- (One representative product per category in this dataset.)
-- Returns empty result set if category not found.
--
-- PgAdmin: SELECT * FROM get_product_by_category('Pizza');
-- App:     SELECT * FROM get_product_by_category($1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_product_by_category(p_category VARCHAR)
RETURNS TABLE (
    out_product_id   INTEGER,
    out_name         VARCHAR,
    out_description  TEXT,
    out_price        NUMERIC,
    out_category     VARCHAR,
    out_is_available BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
        SELECT p.product_id, p.name, p.description, p.price, p.category, p.is_available
          FROM product p
         WHERE p.category = p_category
         LIMIT 1;
END;
$$;


-- -----------------------------------------------------------------------------
-- update_product_availability
-- Toggles is_available on a product and returns the updated row.
-- Raises an error if the product does not exist.
-- OUT columns carry the updated product row back to the caller.
--
-- PgAdmin: CALL update_product_availability(1, false, NULL, NULL, NULL, NULL);
-- App:     CALL update_product_availability($1, $2, NULL, NULL, NULL, NULL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE update_product_availability(
    IN  p_product_id    INTEGER,
    IN  p_is_available  BOOLEAN,
    OUT p_out_id        INTEGER,
    OUT p_out_name      VARCHAR,
    OUT p_out_category  VARCHAR,
    OUT p_out_available BOOLEAN
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM product p WHERE p.product_id = p_product_id) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist.', p_product_id;
    END IF;

    UPDATE product p
       SET is_available = p_is_available
     WHERE p.product_id = p_product_id
    RETURNING p.product_id, p.name, p.category, p.is_available
         INTO p_out_id, p_out_name, p_out_category, p_out_available;
END;
$$;


-- =============================================================================
-- SALE ORDER PROCEDURES & FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- place_order
-- Creates a new sale_order and a single sale_order_item atomically.
-- Validates that the product exists and is available.
-- Computes unit_price from the product table, subtotal, and total_amount.
-- OUT p_order_id — the newly created order's ID.
--
-- PgAdmin: CALL place_order(2, 1, 2, '123 Main St', NULL, NULL);
-- App:     CALL place_order($1, $2, $3, $4, NULL, NULL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE place_order(
    IN  p_member_id       INTEGER,
    IN  p_product_id      INTEGER,
    IN  p_quantity        INTEGER,
    IN  p_delivery_address TEXT,
    OUT p_order_id        INTEGER,
    OUT p_order_item_id   INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
    v_unit_price  NUMERIC;
    v_subtotal    NUMERIC;
BEGIN
    -- Validate product exists and is available
    SELECT p.price INTO v_unit_price
      FROM product p
     WHERE p.product_id = p_product_id
       AND p.is_available = true;

    IF v_unit_price IS NULL THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist or is unavailable.', p_product_id;
    END IF;

    v_subtotal := v_unit_price * p_quantity;

    -- Insert order
    INSERT INTO sale_order (member_id, total_amount, status, delivery_address)
    VALUES (p_member_id, v_subtotal, 'PACKING', p_delivery_address)
    RETURNING sale_order.order_id INTO p_order_id;

    -- Insert order item
    INSERT INTO sale_order_item (order_id, product_id, quantity, unit_price, subtotal)
    VALUES (p_order_id, p_product_id, p_quantity, v_unit_price, v_subtotal)
    RETURNING sale_order_item.order_item_id INTO p_order_item_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- update_order_status
-- Updates the status of an order.
-- Validates that the order exists and that the new status value is allowed.
--
-- PgAdmin: CALL update_order_status(1, 'COMPLETED');
-- App:     CALL update_order_status($1, $2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE update_order_status(
    IN p_order_id INTEGER,
    IN p_status   VARCHAR
)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_status NOT IN ('PACKING', 'COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be PACKING, COMPLETED, or CANCELLED.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM sale_order so WHERE so.order_id = p_order_id) THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
    END IF;

    UPDATE sale_order so
       SET status = p_status
     WHERE so.order_id = p_order_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- check_order_ownership
-- Returns TRUE if the order belongs to the specified member, FALSE otherwise.
--
-- PgAdmin: SELECT check_order_ownership(1, 2);
-- App:     SELECT check_order_ownership($1, $2) AS owned
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_order_ownership(
    p_order_id  INTEGER,
    p_member_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sale_order so
         WHERE so.order_id  = p_order_id
           AND so.member_id = p_member_id
    );
END;
$$;
