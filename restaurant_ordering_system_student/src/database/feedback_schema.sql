-- =============================================================================
-- feedback_schema.sql
-- Run against restaurant_db AFTER restaurant_db_restore.sql has been loaded.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS on every object.
--
-- DESIGN DECISIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. feedback.order_item_id (FK → sale_order_item)
--    Each feedback entry is tied to a specific order_item rather than just
--    (member_id, product_id).  This ensures:
--      • The member genuinely ordered that product (enforced by the FK itself).
--      • create_feedback can verify COMPLETED order status via a JOIN.
--      • One feedback per (member, product) is still enforced by the UNIQUE
--        constraint on (member_id, order_item_id), because order_item rows are
--        unique per (order, product).  A separate DB-level guard prevents two
--        rows with the same member_id pointing to different order_items for the
--        same product — that check is done inside create_feedback procedure.
--
-- 2. feedback.member_id (FK → member)
--    Stored directly so ownership lookups are a simple equality check without
--    an extra JOIN through sale_order_item → sale_order.
--
-- 3. feedback.rating  CHECK (1–5)
--    Domain constraint enforced at the DB level, redundantly validated in the
--    create_feedback / update_feedback procedures.
--
-- 4. feedback_response (separate table, not "response")
--    Named feedback_response to avoid collision with SQL reserved words and
--    to make the relationship self-documenting.
--    ON DELETE CASCADE: when a feedback row is deleted all its responses are
--    automatically removed — no orphaned response rows possible.
--
-- 5. updated_at column on feedback
--    NULL until the row is first edited.  The update_feedback procedure sets
--    it via CURRENT_TIMESTAMP on every UPDATE.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Table: feedback
-- Stores one review per member per product (enforced in create_feedback proc).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id    SERIAL       PRIMARY KEY,
    order_item_id  INTEGER      NOT NULL
                                REFERENCES sale_order_item(order_item_id)
                                ON DELETE CASCADE,
    member_id      INTEGER      NOT NULL
                                REFERENCES member(member_id)
                                ON DELETE CASCADE,
    rating         INTEGER      NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment        TEXT         NOT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    -- NULL until first edit
);


-- -----------------------------------------------------------------------------
-- Table: feedback_response
-- Stores responses to a feedback entry from other members (not the author).
-- Responses cascade-delete when their parent feedback is removed.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_response (
    response_id    SERIAL       PRIMARY KEY,
    feedback_id    INTEGER      NOT NULL
                                REFERENCES feedback(feedback_id)
                                ON DELETE CASCADE,
    member_id      INTEGER      NOT NULL
                                REFERENCES member(member_id)
                                ON DELETE CASCADE,
    response_text  TEXT         NOT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
