-- =============================================================================
-- feedback_functions.sql
-- ALL objects use LANGUAGE plpgsql as required.
--
-- WHY PROCEDURES vs FUNCTIONS:
--
--   STORED PROCEDURES (CREATE PROCEDURE / CALL):
--     Used for write operations: CREATE, UPDATE, DELETE.
--     Reasons:
--       1. They support INOUT/OUT parameters for returning generated IDs.
--       2. They can contain full transaction control (COMMIT/ROLLBACK) if needed.
--       3. Semantically correct — a procedure "does something" with side effects.
--       4. Validation failures raise EXCEPTION, rolling back the operation.
--     Procedures: create_feedback, update_feedback, delete_feedback,
--                 create_response, delete_response
--
--   STORED FUNCTIONS (CREATE FUNCTION / SELECT * FROM):
--     Used for read operations: SELECT / helper boolean checks.
--     Reasons:
--       1. Functions return a value or a result set — they "compute something".
--       2. Can be used inline in SQL (e.g. WHERE, SELECT list, JOIN).
--       3. STABLE keyword lets the query planner cache results within a query.
--       4. Cannot have side effects (INSERT/UPDATE/DELETE not allowed in STABLE).
--     Functions: get_feedback, get_feedback_by_product, get_feedback_by_id,
--                get_response, has_completed_order_for_product,
--                get_completed_order_item_id, feedback_exists_for_member_product,
--                is_feedback_owner, is_response_owner, get_feedback_author_id,
--                get_order_summary
--
-- AMBIGUITY FIX (plpgsql RETURNS TABLE):
--     When a plpgsql function declares RETURNS TABLE(feedback_id INTEGER, ...),
--     the output column name "feedback_id" enters the function's variable scope.
--     Any bare reference to "feedback_id" inside the body is then ambiguous
--     (table column vs output variable). Fix: qualify every column reference
--     with its table alias (e.g. f.feedback_id, soi.product_id) so plpgsql
--     always resolves to the table column, never the output variable.
--
-- Safe to re-run: CREATE OR REPLACE on every object.
-- Run after feedback_schema.sql (tables must exist first).
-- =============================================================================


-- =============================================================================
-- FEEDBACK PROCEDURES  (write operations)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_feedback
-- Creates a new feedback entry for a specific order item.
--
-- CHANGED: now accepts p_order_item_id directly instead of p_product_id.
-- This allows one feedback per completed order item, so a member who orders
-- the same product multiple times can review each order separately.
--
-- Validates:
--   • member exists
--   • order_item exists and belongs to the member via a COMPLETED order
--   • rating is 1–5
--   • comment is not blank
--   • no feedback already exists for this specific order_item
--
-- OUT p_feedback_id — ID of the newly created row.
--
-- PgAdmin: CALL create_feedback(2, 5, 5, 'Great pizza!', NULL);
--   where 5 is an order_item_id from a completed order belonging to member 2
-- App:     CALL create_feedback($1, $2, $3, $4, $5)  with null as 5th arg
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE create_feedback(
    IN  p_member_id      INTEGER,
    IN  p_order_item_id  INTEGER,
    IN  p_rating         INTEGER,
    IN  p_comment        TEXT,
    OUT p_feedback_id    INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    -- Verify the order item exists, belongs to the member, and its order is COMPLETED
    IF NOT EXISTS (
        SELECT 1
          FROM sale_order_item soi
          JOIN sale_order so ON so.order_id = soi.order_id
         WHERE soi.order_item_id = p_order_item_id
           AND so.member_id      = p_member_id
           AND so.status         = 'COMPLETED'
    ) THEN
        RAISE EXCEPTION 'NO_COMPLETED_ORDER: You can only review items from your completed orders.';
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'INVALID_RATING: Rating must be between 1 and 5.';
    END IF;

    IF p_comment IS NULL OR TRIM(p_comment) = '' THEN
        RAISE EXCEPTION 'BLANK_COMMENT: Comment cannot be empty.';
    END IF;

    -- One feedback per order item — prevents duplicate reviews for the same order item
    IF EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.order_item_id = p_order_item_id AND f.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_REVIEWED: You have already submitted feedback for this order item.';
    END IF;

    INSERT INTO feedback (order_item_id, member_id, rating, comment)
    VALUES (p_order_item_id, p_member_id, p_rating, TRIM(p_comment))
    RETURNING feedback.feedback_id INTO p_feedback_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- update_feedback
-- Updates rating and comment on the member's own feedback.
--
-- Validates:
--   • feedback exists
--   • member owns the feedback
--   • rating is 1–5
--   • comment is not blank
--
-- PgAdmin: CALL update_feedback(1, 2, 4, 'Updated: still great!');
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE update_feedback(
    IN p_feedback_id INTEGER,
    IN p_member_id   INTEGER,
    IN p_rating      INTEGER,
    IN p_comment     TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You can only edit your own feedback.';
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'INVALID_RATING: Rating must be between 1 and 5.';
    END IF;

    IF p_comment IS NULL OR TRIM(p_comment) = '' THEN
        RAISE EXCEPTION 'BLANK_COMMENT: Comment cannot be empty.';
    END IF;

    UPDATE feedback f
       SET rating     = p_rating,
           comment    = TRIM(p_comment),
           updated_at = CURRENT_TIMESTAMP
     WHERE f.feedback_id = p_feedback_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- delete_feedback
-- Deletes the member's own feedback (responses cascade automatically).
--
-- Validates:
--   • feedback exists
--   • member owns the feedback
--
-- PgAdmin: CALL delete_feedback(1, 2);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE delete_feedback(
    IN p_feedback_id INTEGER,
    IN p_member_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You can only delete your own feedback.';
    END IF;

    DELETE FROM feedback f WHERE f.feedback_id = p_feedback_id;
END;
$$;


-- =============================================================================
-- FEEDBACK READ FUNCTIONS  (read-only, return result sets)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_feedback
-- Returns all feedback submitted by a specific member, with product name.
-- Named get_feedback as required by the task spec.
--
-- PgAdmin: SELECT * FROM get_feedback(2);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_feedback(p_member_id INTEGER)
RETURNS TABLE (
    out_feedback_id   INTEGER,
    out_order_item_id INTEGER,
    out_product_id    INTEGER,
    out_product_name  VARCHAR,
    out_rating        INTEGER,
    out_comment       TEXT,
    out_created_at    TIMESTAMP,
    out_updated_at    TIMESTAMP
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    RETURN QUERY
        SELECT f.feedback_id, f.order_item_id, soi.product_id,
               p.name,
               f.rating, f.comment, f.created_at, f.updated_at
          FROM feedback f
          JOIN sale_order_item soi ON soi.order_item_id = f.order_item_id
          JOIN product p           ON p.product_id      = soi.product_id
         WHERE f.member_id = p_member_id
         ORDER BY f.created_at DESC;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_feedback_by_product
-- Returns all feedback for a product, with member username.
-- Returns empty result set if no feedback exists (not an error).
-- Used by the feedback index page to list all reviews.
--
-- PgAdmin: SELECT * FROM get_feedback_by_product(1);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_feedback_by_product(p_product_id INTEGER)
RETURNS TABLE (
    out_feedback_id   INTEGER,
    out_member_id     INTEGER,
    out_order_item_id INTEGER,
    out_product_id    INTEGER,
    out_rating        INTEGER,
    out_comment       TEXT,
    out_created_at    TIMESTAMP,
    out_updated_at    TIMESTAMP,
    out_username      VARCHAR
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM product p WHERE p.product_id = p_product_id) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist.', p_product_id;
    END IF;

    RETURN QUERY
        SELECT f.feedback_id, f.member_id, f.order_item_id,
               soi.product_id, f.rating, f.comment,
               f.created_at, f.updated_at, m.username
          FROM feedback f
          JOIN sale_order_item soi ON soi.order_item_id = f.order_item_id
          JOIN member m            ON m.member_id       = f.member_id
         WHERE soi.product_id = p_product_id
         ORDER BY f.created_at DESC;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_feedback_by_id
-- Returns a single feedback entry by its ID, with username and product_id.
-- Returns empty result set if the feedback does not exist (not an error).
-- Used to pre-populate the edit form.
--
-- PgAdmin: SELECT * FROM get_feedback_by_id(1);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_feedback_by_id(p_feedback_id INTEGER)
RETURNS TABLE (
    out_feedback_id   INTEGER,
    out_member_id     INTEGER,
    out_order_item_id INTEGER,
    out_product_id    INTEGER,
    out_rating        INTEGER,
    out_comment       TEXT,
    out_created_at    TIMESTAMP,
    out_updated_at    TIMESTAMP,
    out_username      VARCHAR
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
        SELECT f.feedback_id, f.member_id, f.order_item_id,
               soi.product_id, f.rating, f.comment,
               f.created_at, f.updated_at, m.username
          FROM feedback f
          JOIN sale_order_item soi ON soi.order_item_id = f.order_item_id
          JOIN member m            ON m.member_id       = f.member_id
         WHERE f.feedback_id = p_feedback_id;
END;
$$;


-- =============================================================================
-- RESPONSE PROCEDURES  (write operations)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_response
-- Creates a response to a feedback entry.
--
-- Validates:
--   • feedback exists
--   • member exists
--   • response text is not blank
--   • member is NOT the feedback author
--
-- OUT p_response_id — ID of the newly created row.
--
-- PgAdmin: CALL create_response(1, 3, 'Thanks for the review!', NULL);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE create_response(
    IN  p_feedback_id   INTEGER,
    IN  p_member_id     INTEGER,
    IN  p_response_text TEXT,
    OUT p_response_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    IF p_response_text IS NULL OR TRIM(p_response_text) = '' THEN
        RAISE EXCEPTION 'BLANK_RESPONSE: Response text cannot be empty.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You cannot respond to your own feedback.';
    END IF;

    INSERT INTO feedback_response (feedback_id, member_id, response_text)
    VALUES (p_feedback_id, p_member_id, TRIM(p_response_text))
    RETURNING feedback_response.response_id INTO p_response_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- delete_response
-- Deletes a member's own response.
--
-- Validates:
--   • response exists
--   • member owns the response
--
-- PgAdmin: CALL delete_response(1, 3);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE delete_response(
    IN p_response_id INTEGER,
    IN p_member_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM feedback_response fr WHERE fr.response_id = p_response_id
    ) THEN
        RAISE EXCEPTION 'RESPONSE_NOT_FOUND: Response % does not exist.', p_response_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM feedback_response fr
         WHERE fr.response_id = p_response_id AND fr.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You can only delete your own responses.';
    END IF;

    DELETE FROM feedback_response fr WHERE fr.response_id = p_response_id;
END;
$$;


-- =============================================================================
-- RESPONSE READ FUNCTION
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_response
-- Returns all responses for a feedback entry, with member username.
-- Named get_response as required by the task spec.
--
-- PgAdmin: SELECT * FROM get_response(1);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_response(p_feedback_id INTEGER)
RETURNS TABLE (
    out_response_id   INTEGER,
    out_feedback_id   INTEGER,
    out_member_id     INTEGER,
    out_response_text TEXT,
    out_created_at    TIMESTAMP,
    out_username      VARCHAR
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    RETURN QUERY
        SELECT fr.response_id, fr.feedback_id, fr.member_id,
               fr.response_text, fr.created_at, m.username
          FROM feedback_response fr
          JOIN member m ON m.member_id = fr.member_id
         WHERE fr.feedback_id = p_feedback_id
         ORDER BY fr.created_at ASC;
END;
$$;


-- =============================================================================
-- HELPER FUNCTIONS  (boolean checks and lookups used by Node models)
-- =============================================================================

-- Returns TRUE if member has a COMPLETED order containing the product.
-- PgAdmin: SELECT has_completed_order_for_product(2, 1);
CREATE OR REPLACE FUNCTION has_completed_order_for_product(
    p_member_id  INTEGER,
    p_product_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
          FROM sale_order so
          JOIN sale_order_item soi ON soi.order_id = so.order_id
         WHERE so.member_id   = p_member_id
           AND soi.product_id = p_product_id
           AND so.status      = 'COMPLETED'
    );
END;
$$;


-- Returns the order_item_id from the member's most recent completed order for a product.
-- PgAdmin: SELECT get_completed_order_item_id(2, 1);
CREATE OR REPLACE FUNCTION get_completed_order_item_id(
    p_member_id  INTEGER,
    p_product_id INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_id INTEGER;
BEGIN
    SELECT soi.order_item_id INTO v_id
      FROM sale_order so
      JOIN sale_order_item soi ON soi.order_id = so.order_id
     WHERE so.member_id   = p_member_id
       AND soi.product_id = p_product_id
       AND so.status      = 'COMPLETED'
     ORDER BY so.order_date DESC
     LIMIT 1;
    RETURN v_id;
END;
$$;


-- Returns TRUE if the member has already reviewed this specific order item.
-- Replaces the old feedback_exists_for_member_product — eligibility is now
-- per order item, not per product, so members can review each order separately.
-- PgAdmin: SELECT feedback_exists_for_order_item(5, 2);
--   where 5 = order_item_id, 2 = member_id
CREATE OR REPLACE FUNCTION feedback_exists_for_order_item(
    p_order_item_id INTEGER,
    p_member_id     INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.order_item_id = p_order_item_id
           AND f.member_id     = p_member_id
    );
END;
$$;


-- Returns TRUE if the feedback belongs to the given member.
-- PgAdmin: SELECT is_feedback_owner(1, 2);
CREATE OR REPLACE FUNCTION is_feedback_owner(
    p_feedback_id INTEGER,
    p_member_id   INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    );
END;
$$;


-- Returns TRUE if the response belongs to the given member.
-- PgAdmin: SELECT is_response_owner(1, 3);
CREATE OR REPLACE FUNCTION is_response_owner(
    p_response_id INTEGER,
    p_member_id   INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM feedback_response fr
         WHERE fr.response_id = p_response_id AND fr.member_id = p_member_id
    );
END;
$$;


-- Returns the member_id of the feedback author.
-- PgAdmin: SELECT get_feedback_author_id(1);
CREATE OR REPLACE FUNCTION get_feedback_author_id(p_feedback_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_member_id INTEGER;
BEGIN
    SELECT f.member_id INTO v_member_id
      FROM feedback f WHERE f.feedback_id = p_feedback_id;
    RETURN v_member_id;
END;
$$;


-- Returns order summary for the admin dashboard with optional filters.
-- Pass NULL to skip a filter.
-- PgAdmin: SELECT * FROM get_order_summary(NULL, NULL, NULL);
-- PgAdmin: SELECT * FROM get_order_summary('2024-01-01'::date, '2024-12-31'::date, 'Pizza');
CREATE OR REPLACE FUNCTION get_order_summary(
    p_start_date DATE,
    p_end_date   DATE,
    p_category   VARCHAR
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
BEGIN
    RETURN QUERY
        SELECT so.order_id,
               m.first_name || ' ' || m.last_name AS customer_name,
               so.order_date, so.total_amount, so.status,
               COUNT(soi.order_item_id)::BIGINT    AS product_count,
               STRING_AGG(p.name, ', ')            AS products_ordered
          FROM sale_order so
          JOIN member m            ON m.member_id  = so.member_id
          JOIN sale_order_item soi ON soi.order_id = so.order_id
          JOIN product p           ON p.product_id = soi.product_id
         WHERE (p_start_date IS NULL OR DATE(so.order_date) >= p_start_date)
           AND (p_end_date   IS NULL OR DATE(so.order_date) <= p_end_date)
           AND (p_category   IS NULL OR p.category = p_category)
         GROUP BY so.order_id, m.first_name, m.last_name,
                  so.order_date, so.total_amount, so.status;
END;
$$;


-- Returns all orders placed by a member, including their order items
-- and product details as a JSON array.
--
-- PgAdmin:
-- SELECT * FROM get_member_orders(1);
CREATE OR REPLACE FUNCTION get_member_orders(
    p_member_id INT
)
RETURNS TABLE (
    order_id INTEGER,
    order_date TIMESTAMP,
    total_amount NUMERIC,
    status VARCHAR,
    delivery_address TEXT,
    items JSON
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        so.order_id,
        so.order_date,
        so.total_amount,
        so.status,
        so.delivery_address,
        json_agg(
            json_build_object(
                'order_item_id', soi.order_item_id,
                'product_id', soi.product_id,
                'product_name', p.name,
                'quantity', soi.quantity,
                'unit_price', soi.unit_price,
                'subtotal', soi.subtotal
            )
            ORDER BY soi.order_item_id
        ) AS items
    FROM sale_order so
    JOIN sale_order_item soi ON soi.order_id = so.order_id
    JOIN product p ON p.product_id = soi.product_id
    WHERE so.member_id = p_member_id
    GROUP BY
        so.order_id,
        so.order_date,
        so.total_amount,
        so.status,
        so.delivery_address
    ORDER BY so.order_date DESC;
END;
$$;

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

