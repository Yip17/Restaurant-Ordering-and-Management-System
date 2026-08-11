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
    out_password_hash VARCHAR,
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
-- Returns a single product by ID.
--
-- Validates:
--   • product exists
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
    -- Validate product exists
    IF NOT EXISTS (SELECT 1 FROM product p WHERE p.product_id = p_product_id) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist.', p_product_id;
    END IF;

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
-- Toggles a product's is_available flag. Admin-only (enforced in the route).
--
-- Validates:
--   • product exists
--
-- OUT parameters return the updated product row so the caller does not need
-- a separate SELECT.
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
    -- Validate product exists
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
-- SALE ORDER FEATURE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_order_by_id
-- Returns a single order by ID with all its order items as a JSON array.
-- Used after placing an order or updating order status to fetch the complete result.
--
-- Validates:
--   • order exists
--
-- PgAdmin: SELECT * FROM get_order_by_id(1);
-- App:     SELECT * FROM get_order_by_id($1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_order_by_id(p_order_id INTEGER)
RETURNS TABLE (
    order_id INTEGER,
    order_date TIMESTAMP,
    total_amount NUMERIC,
    status VARCHAR,
    delivery_address TEXT,
    items JSON
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    -- Validate order exists
    IF NOT EXISTS (SELECT 1 FROM sale_order so WHERE so.order_id = p_order_id) THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
    END IF;

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
    WHERE so.order_id = p_order_id
    GROUP BY
        so.order_id,
        so.order_date,
        so.total_amount,
        so.status,
        so.delivery_address;
END;
$$;


-- -----------------------------------------------------------------------------
-- check_order_ownership
-- Returns TRUE if the order belongs to the specified member.
-- Used for authorization checks before allowing order status updates.
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
        SELECT 1
        FROM sale_order so
        WHERE so.order_id = p_order_id
          AND so.member_id = p_member_id
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- place_order
-- Places a new order for a member.
--
-- Validates:
--   • member exists
--   • product exists and is available (is_available = true)
--   • quantity is at least 1
--   • delivery address is not blank
--
-- OUT p_order_id      — ID of the newly created sale_order row.
-- OUT p_order_item_id — ID of the newly created sale_order_item row.
--
-- PgAdmin: CALL place_order(2, 1, 2, '123 Main St', NULL, NULL);
-- App:     CALL place_order($1, $2, $3, $4, NULL, NULL)
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
    v_unit_price  NUMERIC;
    v_is_available BOOLEAN;
BEGIN
    -- Validate member exists
    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    -- Validate product exists and is available
    SELECT p.price, p.is_available
      INTO v_unit_price, v_is_available
      FROM product p
     WHERE p.product_id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist or is unavailable.', p_product_id;
    END IF;

    IF v_is_available IS FALSE THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist or is unavailable.', p_product_id;
    END IF;

    -- Validate quantity
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Quantity must be at least 1.';
    END IF;

    -- Validate delivery address
    IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
        RAISE EXCEPTION 'BLANK_ADDRESS: Delivery address cannot be empty.';
    END IF;

    INSERT INTO sale_order (member_id, total_amount, status, delivery_address)
    VALUES (p_member_id, v_unit_price * p_quantity, 'PACKING', TRIM(p_delivery_address))
    RETURNING order_id INTO p_order_id;

    INSERT INTO sale_order_item (order_id, product_id, quantity, unit_price, subtotal)
    VALUES (p_order_id, p_product_id, p_quantity, v_unit_price, v_unit_price * p_quantity)
    RETURNING order_item_id INTO p_order_item_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- place_orders
-- Processes all items in a member's cart into a single sale order.
--
-- Transaction handling:
--   Each cart item runs inside a subtransaction (BEGIN…EXCEPTION block).
--   Available items complete and persist; unavailable items raise NO_DATA_FOUND
--   via STRICT select, rolling back only that subtransaction while previously
--   processed items are preserved in the outer transaction.
--
-- Validates:
--   • member exists
--   • cart exists for member
--   • delivery address is not blank
--
-- OUT p_order_id        — ID of the created sale_order, or NULL if none.
-- OUT p_processed_count — number of cart items converted to order items.
-- OUT p_skipped_count   — number of cart items skipped (unavailable).
--
-- PgAdmin: CALL place_orders(2, '123 Main St', NULL, NULL, NULL);
-- App:     CALL place_orders($1, $2, NULL, NULL, NULL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE place_orders(
    IN  p_member_id        INTEGER,
    IN  p_delivery_address TEXT,
    OUT p_order_id         INTEGER,
    OUT p_processed_count  INTEGER,
    OUT p_skipped_count    INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
    v_cart_id    INTEGER;
    v_item       RECORD;
    v_unit_price NUMERIC;
    v_subtotal   NUMERIC;
BEGIN
    p_order_id        := NULL;
    p_processed_count := 0;
    p_skipped_count   := 0;

    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
        RAISE EXCEPTION 'BLANK_ADDRESS: Delivery address cannot be empty.';
    END IF;

    SELECT c.cart_id INTO v_cart_id
      FROM cart c
     WHERE c.member_id = p_member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CART_NOT_FOUND: Cart not found for member %.', p_member_id;
    END IF;

    FOR v_item IN
        SELECT ci.cart_item_id, ci.product_id, ci.quantity
          FROM cart_item ci
         WHERE ci.cart_id = v_cart_id
         ORDER BY ci.cart_item_id
    LOOP
        BEGIN
            -- STRICT select raises NO_DATA_FOUND when product is missing or unavailable
            -- Process this cart item.
            -- This BEGIN ... EXCEPTION block acts as a subtransaction.
            -- If an exception occurs, PostgreSQL automatically rolls back
            -- all changes made inside this block.
            SELECT p.price
              INTO STRICT v_unit_price
              FROM product p
             WHERE p.product_id = v_item.product_id
               AND COALESCE(p.is_available, FALSE) IS TRUE;

            v_subtotal := v_unit_price * v_item.quantity;

            IF p_order_id IS NULL THEN
                INSERT INTO sale_order (member_id, total_amount, status, delivery_address)
                VALUES (p_member_id, v_subtotal, 'PACKING', TRIM(p_delivery_address))
                RETURNING order_id INTO p_order_id;
            ELSE
                UPDATE sale_order
                   SET total_amount = total_amount + v_subtotal
                 WHERE order_id = p_order_id;
            END IF;

            INSERT INTO sale_order_item (order_id, product_id, quantity, unit_price, subtotal)
            VALUES (p_order_id, v_item.product_id, v_item.quantity, v_unit_price, v_subtotal);

            DELETE FROM cart_item WHERE cart_item_id = v_item.cart_item_id;

            p_processed_count := p_processed_count + 1;

        EXCEPTION
            WHEN NO_DATA_FOUND THEN
            -- The item is unavailable.
            -- PostgreSQL has automatically rolled back this item's
            -- changes. The item therefore remains in the cart.
            --
            -- Previously successful cart items are NOT rolled back
            -- because they were processed in earlier completed blocks.
                p_skipped_count := p_skipped_count + 1;
        END;
    END LOOP;
END;
$$;


-- -----------------------------------------------------------------------------
-- update_order_status
-- Updates the status of an existing order.
--
-- Validates:
--   • order exists
--   • status is one of the allowed values: PACKING, COMPLETED, CANCELLED
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
    -- Validate order exists
    IF NOT EXISTS (SELECT 1 FROM sale_order so WHERE so.order_id = p_order_id) THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
    END IF;

    -- Validate status value
    IF p_status IS NULL OR p_status NOT IN ('PACKING', 'COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be PACKING, COMPLETED, or CANCELLED.';
    END IF;

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
-- Creates a new feedback entry for a specific order item.
--
-- Validates:
--   • member exists
--   • order_item exists, belongs to the member, and its order is COMPLETED
--   • rating is between 1 and 5
--   • comment is not blank
--   • no feedback already exists for this order_item from this member
--
-- OUT p_feedback_id — ID of the newly created row.
--
-- PgAdmin: CALL create_feedback(2, 3, 5, 'Great food!', NULL);
-- App:     CALL create_feedback($1, $2, $3, $4, $5)  with NULL as 5th arg
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
    -- Validate member exists
    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    -- Validate order item exists, belongs to this member, and order is COMPLETED
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

    -- Validate rating range
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'INVALID_RATING: Rating must be between 1 and 5.';
    END IF;

    -- Validate comment is not blank
    IF p_comment IS NULL OR TRIM(p_comment) = '' THEN
        RAISE EXCEPTION 'BLANK_COMMENT: Comment cannot be empty.';
    END IF;

    -- Prevent duplicate feedback for the same order item
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
--   • member owns the feedback (ACCESS_DENIED if not)
--   • rating is between 1 and 5
--   • comment is not blank
--
-- Also sets updated_at to CURRENT_TIMESTAMP on every successful update.
--
-- PgAdmin: CALL update_feedback(1, 2, 4, 'Updated comment.');
-- App:     CALL update_feedback($1, $2, $3, $4)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE update_feedback(
    IN p_feedback_id INTEGER,
    IN p_member_id   INTEGER,
    IN p_rating      INTEGER,
    IN p_comment     TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    -- Validate feedback exists
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    -- Validate ownership
    IF NOT EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You can only edit your own feedback.';
    END IF;

    -- Validate rating range
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'INVALID_RATING: Rating must be between 1 and 5.';
    END IF;

    -- Validate comment is not blank
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
-- Deletes the member's own feedback. Responses cascade via FK ON DELETE CASCADE.
--
-- Validates:
--   • feedback exists
--   • member owns the feedback (ACCESS_DENIED if not)
--
-- PgAdmin: CALL delete_feedback(1, 2);
-- App:     CALL delete_feedback($1, $2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE delete_feedback(
    IN p_feedback_id INTEGER,
    IN p_member_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    -- Validate feedback exists
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    -- Validate ownership
    IF NOT EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You can only delete your own feedback.';
    END IF;

    DELETE FROM feedback f WHERE f.feedback_id = p_feedback_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_feedback
-- Returns all feedback submitted by a specific member, with product name.
-- Named get_feedback as required by the task spec.
--
-- Validates:
--   • member exists
--
-- PgAdmin: SELECT * FROM get_feedback(2);
-- App:     SELECT * FROM get_feedback($1)
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
    SELECT f.feedback_id, f.order_item_id, soi.product_id, p.name,
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
-- Returns an empty result set if no feedback exists (not an error).
--
-- Validates:
--   • product exists
--
-- PgAdmin: SELECT * FROM get_feedback_by_product(1);
-- App:     SELECT * FROM get_feedback_by_product($1)
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
-- Returns a single feedback entry by ID with product and member details.
--
-- Validates:
--   • feedback exists
--
-- PgAdmin: SELECT * FROM get_feedback_by_id(1);
-- App:     SELECT * FROM get_feedback_by_id($1)
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
    -- Validate feedback exists
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

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
-- Creates a response to a feedback entry.
--
-- Validates:
--   • feedback exists
--   • member exists
--   • response text is not blank
--   • member is NOT the feedback author (cannot respond to own feedback)
--
-- OUT p_response_id — ID of the newly created row.
--
-- PgAdmin: CALL create_response(1, 3, 'Thanks for the review!', NULL);
-- App:     CALL create_response($1, $2, $3, $4)  with NULL as 4th arg
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE create_response(
    IN  p_feedback_id   INTEGER,
    IN  p_member_id     INTEGER,
    IN  p_response_text TEXT,
    OUT p_response_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    -- Validate feedback exists
    IF NOT EXISTS (SELECT 1 FROM feedback f WHERE f.feedback_id = p_feedback_id) THEN
        RAISE EXCEPTION 'FEEDBACK_NOT_FOUND: Feedback % does not exist.', p_feedback_id;
    END IF;

    -- Validate member exists
    IF NOT EXISTS (SELECT 1 FROM member m WHERE m.member_id = p_member_id) THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Member % does not exist.', p_member_id;
    END IF;

    -- Validate response text is not blank
    IF p_response_text IS NULL OR TRIM(p_response_text) = '' THEN
        RAISE EXCEPTION 'BLANK_RESPONSE: Response text cannot be empty.';
    END IF;

    -- Prevent feedback owner from giving the FIRST response to their own feedback
    -- After someone else has responded, the owner can reply
    IF EXISTS (
        SELECT 1 FROM feedback f
         WHERE f.feedback_id = p_feedback_id AND f.member_id = p_member_id
    ) THEN
        -- This member is the feedback owner
        -- Check if there are any existing responses
        IF NOT EXISTS (
            SELECT 1 FROM feedback_response fr
             WHERE fr.feedback_id = p_feedback_id
        ) THEN
            -- No responses yet, so feedback owner cannot be the first to respond
            RAISE EXCEPTION 'ACCESS_DENIED: You cannot give the first response to your own feedback.';
        END IF;
        -- If we reach here, there are existing responses, so the owner can reply
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
--   • member owns the response (ACCESS_DENIED if not)
--
-- PgAdmin: CALL delete_response(1, 3);
-- App:     CALL delete_response($1, $2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE delete_response(
    IN p_response_id INTEGER,
    IN p_member_id   INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    -- Validate response exists
    IF NOT EXISTS (
        SELECT 1 FROM feedback_response fr WHERE fr.response_id = p_response_id
    ) THEN
        RAISE EXCEPTION 'RESPONSE_NOT_FOUND: Response % does not exist.', p_response_id;
    END IF;

    -- Validate ownership
    IF NOT EXISTS (
        SELECT 1 FROM feedback_response fr
         WHERE fr.response_id = p_response_id AND fr.member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: You can only delete your own responses.';
    END IF;

    DELETE FROM feedback_response fr WHERE fr.response_id = p_response_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_response
-- Returns all responses for a feedback entry, with member username.
-- Named get_response as required by the task spec.
--
-- Validates:
--   • feedback exists
--
-- PgAdmin: SELECT * FROM get_response(1);
-- App:     SELECT * FROM get_response($1)
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
-- HELPER FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_order_item_status
-- Returns the status of the order containing the specified order item,
-- but ONLY if the order item belongs to the specified member.
-- Returns NULL if the order item doesn't exist or doesn't belong to the member.
--
-- Used by FeedbackController to check if a member can submit feedback
-- for a specific order item (must be COMPLETED and owned by them).
--
-- PgAdmin: SELECT get_order_item_status(3, 2);
-- App:     SELECT get_order_item_status($1, $2) AS status
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_order_item_status(
    p_order_item_id INTEGER,
    p_member_id     INTEGER
)
RETURNS VARCHAR
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    SELECT so.status INTO v_status
      FROM sale_order_item soi
      JOIN sale_order so ON so.order_id = soi.order_id
     WHERE soi.order_item_id = p_order_item_id
       AND so.member_id = p_member_id;
    
    RETURN v_status;  -- Returns NULL if not found or not owned by member
END;
$$;


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

