-- =============================================================================
-- functions_and_stored_procedures.sql
-- Dashboard database function for the admin restaurant management dashboard.
-- =============================================================================


-- =============================================================================
-- DASHBOARD FEATURE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_sale_order_summary
-- Retrieves summarised order data for the admin dashboard.
-- -----------------------------------------------------------------------------
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
    v_sort_col  TEXT;
    v_sort_dir  TEXT;
    v_sql       TEXT;
BEGIN
    v_sort_col := CASE p_sort_by
        WHEN 'total_amount'  THEN 'so.total_amount'
        WHEN 'customer_name' THEN 'customer_name'
        WHEN 'status'        THEN 'so.status'
        ELSE 'so.order_date'
    END;

    v_sort_dir := CASE UPPER(p_sort_order)
        WHEN 'ASC' THEN 'ASC'
        ELSE 'DESC'
    END;

    IF p_status IS NOT NULL AND p_status NOT IN ('PACKING', 'COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be PACKING, COMPLETED, or CANCELLED.';
    END IF;

    v_sql := '
        SELECT
            so.order_id,
            m.first_name || '' '' || m.last_name AS customer_name,
            so.order_date,
            so.total_amount,
            so.status,
            COUNT(soi.order_item_id)::BIGINT AS product_count,
            STRING_AGG(p.name, '', '' ORDER BY p.name) AS products_ordered
        FROM sale_order so
        JOIN member m ON m.member_id = so.member_id
        JOIN sale_order_item soi ON soi.order_id = so.order_id
        JOIN product p ON p.product_id = soi.product_id
        WHERE ($1 IS NULL OR DATE(so.order_date) >= $1)
          AND ($2 IS NULL OR DATE(so.order_date) <= $2)
          AND ($3 IS NULL OR p.category = $3)
          AND ($4 IS NULL OR so.status = $4)
        GROUP BY so.order_id, m.first_name, m.last_name, so.order_date, so.total_amount, so.status
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
-- PRODUCT FEATURE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_products
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
    UPDATE product p
    SET is_available = p_is_available
    WHERE p.product_id = p_product_id
    RETURNING p.product_id, p.name, p.category, p.is_available
    INTO p_out_id, p_out_name, p_out_category, p_out_available;
END;
$$;


-- =============================================================================
-- SALE ORDER FEATURE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- check_order_ownership
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_order_ownership(
    p_order_id  INTEGER,
    p_member_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM sale_order so
        WHERE so.order_id = p_order_id
          AND so.member_id = p_member_id
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- place_order
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE place_order(
    IN  p_member_id        INTEGER,
    IN  p_product_id       INTEGER,
    IN  p_quantity         INTEGER,
    IN  p_delivery_address TEXT,
    OUT p_order_id         INTEGER,
    OUT p_order_item_id    INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
    v_unit_price NUMERIC;
BEGIN
    SELECT p.price INTO v_unit_price
    FROM product p
    WHERE p.product_id = p_product_id;

    INSERT INTO sale_order (member_id, total_amount, status, delivery_address)
    VALUES (p_member_id, v_unit_price * p_quantity, 'PACKING', p_delivery_address)
    RETURNING order_id INTO p_order_id;

    INSERT INTO sale_order_item (order_id, product_id, quantity, unit_price, subtotal)
    VALUES (p_order_id, p_product_id, p_quantity, v_unit_price, v_unit_price * p_quantity)
    RETURNING order_item_id INTO p_order_item_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- update_order_status
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE update_order_status(
    IN p_order_id INTEGER,
    IN p_status   VARCHAR
)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE sale_order
    SET status = p_status
    WHERE order_id = p_order_id;
END;
$$;


-- =============================================================================
-- FEEDBACK FEATURE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_feedback
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE create_feedback(
    IN  p_member_id     INTEGER,
    IN  p_order_item_id INTEGER,
    IN  p_rating        INTEGER,
    IN  p_comment       TEXT,
    OUT p_feedback_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO feedback (order_item_id, member_id, rating, comment)
    VALUES (p_order_item_id, p_member_id, p_rating, p_comment)
    RETURNING feedback_id INTO p_feedback_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- update_feedback
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE update_feedback(
    IN p_feedback_id INTEGER,
    IN p_member_id   INTEGER,
    IN p_rating      INTEGER,
    IN p_comment     TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE feedback
    SET rating = p_rating,
        comment = p_comment
    WHERE feedback_id = p_feedback_id
      AND member_id = p_member_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- delete_feedback
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE delete_feedback(
    IN p_feedback_id INTEGER,
    IN p_member_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM feedback
    WHERE feedback_id = p_feedback_id
      AND member_id = p_member_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_feedback
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
    RETURN QUERY
    SELECT f.feedback_id, f.order_item_id, soi.product_id, p.name,
           f.rating, f.comment, f.created_at, f.updated_at
    FROM feedback f
    JOIN sale_order_item soi ON soi.order_item_id = f.order_item_id
    JOIN product p ON p.product_id = soi.product_id
    WHERE f.member_id = p_member_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_feedback_by_product
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
    RETURN QUERY
    SELECT f.feedback_id, f.member_id, f.order_item_id,
           soi.product_id, f.rating, f.comment,
           f.created_at, f.updated_at, m.username
    FROM feedback f
    JOIN sale_order_item soi ON soi.order_item_id = f.order_item_id
    JOIN member m ON m.member_id = f.member_id
    WHERE soi.product_id = p_product_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_feedback_by_id
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
    JOIN member m ON m.member_id = f.member_id
    WHERE f.feedback_id = p_feedback_id;
END;
$$;


-- =============================================================================
-- RESPONSE FEATURE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_response
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE create_response(
    IN  p_feedback_id   INTEGER,
    IN  p_member_id     INTEGER,
    IN  p_response_text TEXT,
    OUT p_response_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO feedback_response (feedback_id, member_id, response_text)
    VALUES (p_feedback_id, p_member_id, p_response_text)
    RETURNING response_id INTO p_response_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- delete_response
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE delete_response(
    IN p_response_id INTEGER,
    IN p_member_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM feedback_response
    WHERE response_id = p_response_id
      AND member_id = p_member_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_response
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
    RETURN QUERY
    SELECT fr.response_id, fr.feedback_id, fr.member_id,
           fr.response_text, fr.created_at, m.username
    FROM feedback_response fr
    JOIN member m ON m.member_id = fr.member_id
    WHERE fr.feedback_id = p_feedback_id;
END;
$$;


-- =============================================================================
-- HELPER FUNCTIONS
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
-- PgAdmin: SELECT feedback_exists_for_order_item(5, 2);
CREATE OR REPLACE FUNCTION feedback_exists_for_order_item(
    p_order_item_id INTEGER,
    p_member_id     INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM feedback f
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
        SELECT 1
        FROM feedback f
        WHERE f.feedback_id = p_feedback_id
          AND f.member_id    = p_member_id
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
        SELECT 1
        FROM feedback_response fr
        WHERE fr.response_id = p_response_id
          AND fr.member_id    = p_member_id
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
    FROM feedback f
    WHERE f.feedback_id = p_feedback_id;

    RETURN v_member_id;
END;
$$;


-- Returns order summary for the admin dashboard with optional filters.
-- Pass NULL to skip a filter.
-- PgAdmin:
--   SELECT * FROM get_order_summary(NULL, NULL, NULL);
--   SELECT * FROM get_order_summary('2024-01-01'::date, '2024-12-31'::date, 'Pizza');
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
               so.order_date,
               so.total_amount,
               so.status,
               COUNT(soi.order_item_id)::BIGINT,
               STRING_AGG(p.name, ', ')
        FROM sale_order so
        JOIN member m ON m.member_id = so.member_id
        JOIN sale_order_item soi ON soi.order_id = so.order_id
        JOIN product p ON p.product_id = soi.product_id
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