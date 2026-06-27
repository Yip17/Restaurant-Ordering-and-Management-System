-- =============================================================================
-- functions_and_stored_procedures.sql
-- =============================================================================
-- All SQL functions and stored procedures for the restaurant ordering system.
-- Safe to re-run: every object uses CREATE OR REPLACE.
--
-- Schema reference (verified against live DB):
--   member            : member_id, username, email, password_hash, first_name, last_name, created_at
--   member_role       : member_id, role  ('ADMIN' | 'USER')
--   product           : product_id, name, description, price, category, is_available, created_at
--   sale_order        : order_id, member_id, order_date, total_amount, status, delivery_address
--                       status CHECK: 'COMPLETED' | 'CANCELLED' | 'PACKING'
--   sale_order_item   : order_item_id, order_id, product_id, quantity, unit_price, subtotal
--   feedback          : feedback_id, order_item_id (FK→sale_order_item), member_id,
--                       rating (1-5), comment (NOT NULL), created_at, updated_at
--                       UNIQUE (order_item_id)
--   feedback_response : response_id, feedback_id, member_id, response_text, created_at
--
-- product_id is reached through: feedback → sale_order_item → product
--
-- ERROR CONVENTION:
--   All procedures RAISE EXCEPTION with ERRCODE 'P0001' (raise_exception).
--   MESSAGE is a JSON string: {"status": <http_code>, "message": "<text>"}
--   Node models parse this and forward the message to the API response.
--   PgAdmin users will see the full JSON error detail directly.
--
-- Run order: feedback_schema.sql first (creates tables), then this file.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- HELPER: raise a structured error readable by both the app and PgAdmin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION raise_error(p_status INTEGER, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = format('{"status":%s,"message":"%s"}', p_status, replace(p_message, '"', '\"'));
END;
$$;


-- =============================================================================
-- SECTION 1: ORDER FUNCTIONS & PROCEDURES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- get_member_orders(p_member_id)
-- Returns all orders for a member with aggregated item details.
-- Called by: SaleOrder.findByMemberId
-- PgAdmin:   SELECT * FROM get_member_orders(2);
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_member_orders(p_member_id INTEGER)
RETURNS TABLE (
    order_id         INTEGER,
    order_date       TIMESTAMP,
    total_amount     NUMERIC,
    status           VARCHAR,
    delivery_address TEXT,
    items            JSON
)
LANGUAGE sql STABLE AS $$
    SELECT
        so.order_id,
        so.order_date,
        so.total_amount,
        so.status,
        so.delivery_address,
        json_agg(
            json_build_object(
                'order_item_id', soi.order_item_id,
                'product_id',    soi.product_id,
                'product_name',  p.name,
                'quantity',      soi.quantity,
                'unit_price',    soi.unit_price,
                'subtotal',      soi.subtotal
            ) ORDER BY soi.order_item_id
        ) AS items
    FROM sale_order so
    JOIN sale_order_item soi ON soi.order_id  = so.order_id
    JOIN product p           ON p.product_id  = soi.product_id
    WHERE so.member_id = p_member_id
    GROUP BY so.order_id
    ORDER BY so.order_date DESC;
$$;


-- ---------------------------------------------------------------------------
-- place_order(p_member_id, p_product_id, p_quantity, p_delivery_address)
-- Validates, creates a sale_order + sale_order_item in one transaction.
-- Returns the new order_id.
-- Raises P0001 if product not found/unavailable, quantity < 1, or address empty.
-- Called by: SaleOrder.create
-- PgAdmin:   SELECT place_order(2, 1, 2, '123 Main Street');
-