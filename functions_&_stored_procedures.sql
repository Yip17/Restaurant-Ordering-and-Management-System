--
-- PostgreSQL database dump
--

\restrict vsdkgLGRbhEGalKa3QxJIhLELMUq1ei1Dyae6dtSIaBiVAkLCDu6iHcmXtgxh0n

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

-- Started on 2026-08-14 14:21:55

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 269 (class 1255 OID 58449)
-- Name: check_order_ownership(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_order_ownership(p_order_id integer, p_member_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM sale_order so
        WHERE so.order_id = p_order_id
          AND so.member_id = p_member_id
    );
END;
$$;


--
-- TOC entry 272 (class 1255 OID 58443)
-- Name: create_feedback(integer, integer, integer, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.create_feedback(IN p_member_id integer, IN p_order_item_id integer, IN p_rating integer, IN p_comment text, OUT p_feedback_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 264 (class 1255 OID 58420)
-- Name: create_response(integer, integer, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.create_response(IN p_feedback_id integer, IN p_member_id integer, IN p_response_text text, OUT p_response_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 255 (class 1255 OID 58416)
-- Name: delete_feedback(integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.delete_feedback(IN p_feedback_id integer, IN p_member_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 273 (class 1255 OID 58421)
-- Name: delete_response(integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.delete_response(IN p_response_id integer, IN p_member_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 262 (class 1255 OID 58425)
-- Name: feedback_exists_for_member_product(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedback_exists_for_member_product(p_member_id integer, p_product_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
          FROM feedback f
          JOIN sale_order_item soi ON soi.order_item_id = f.order_item_id
         WHERE f.member_id   = p_member_id
           AND soi.product_id = p_product_id
    );
END;
$$;


--
-- TOC entry 263 (class 1255 OID 58444)
-- Name: feedback_exists_for_order_item(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedback_exists_for_order_item(p_order_item_id integer, p_member_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM feedback f
        WHERE f.order_item_id = p_order_item_id
          AND f.member_id     = p_member_id
    );
END;
$$;


--
-- TOC entry 268 (class 1255 OID 58424)
-- Name: get_completed_order_item_id(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_completed_order_item_id(p_member_id integer, p_product_id integer) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 261 (class 1255 OID 58435)
-- Name: get_feedback(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feedback(p_member_id integer) RETURNS TABLE(out_feedback_id integer, out_order_item_id integer, out_product_id integer, out_product_name character varying, out_rating integer, out_comment text, out_created_at timestamp without time zone, out_updated_at timestamp without time zone)
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 256 (class 1255 OID 58428)
-- Name: get_feedback_author_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feedback_author_id(p_feedback_id integer) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_member_id INTEGER;
BEGIN
    SELECT f.member_id INTO v_member_id
    FROM feedback f
    WHERE f.feedback_id = p_feedback_id;

    RETURN v_member_id;
END;
$$;


--
-- TOC entry 278 (class 1255 OID 58437)
-- Name: get_feedback_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feedback_by_id(p_feedback_id integer) RETURNS TABLE(out_feedback_id integer, out_member_id integer, out_order_item_id integer, out_product_id integer, out_rating integer, out_comment text, out_created_at timestamp without time zone, out_updated_at timestamp without time zone, out_username character varying)
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 257 (class 1255 OID 58436)
-- Name: get_feedback_by_product(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feedback_by_product(p_product_id integer) RETURNS TABLE(out_feedback_id integer, out_member_id integer, out_order_item_id integer, out_product_id integer, out_rating integer, out_comment text, out_created_at timestamp without time zone, out_updated_at timestamp without time zone, out_username character varying)
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 274 (class 1255 OID 66386)
-- Name: get_member_by_email(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_member_by_email(p_email character varying) RETURNS TABLE(out_member_id integer, out_username character varying, out_password_hash character varying, out_role character varying)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
        SELECT m.member_id, m.username, m.password_hash, mr.role
        FROM member m
        JOIN member_role mr ON mr.member_id = m.member_id
        WHERE m.email = p_email
        LIMIT 1;
END;
$$;


--
-- TOC entry 280 (class 1255 OID 58442)
-- Name: get_member_orders(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_member_orders(p_member_id integer) RETURNS TABLE(order_id integer, order_date timestamp without time zone, total_amount numeric, status character varying, delivery_address text, items json)
    LANGUAGE plpgsql STABLE
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


--
-- TOC entry 277 (class 1255 OID 58450)
-- Name: get_order_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_by_id(p_order_id integer) RETURNS TABLE(order_id integer, order_date timestamp without time zone, total_amount numeric, status character varying, delivery_address text, items json)
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 266 (class 1255 OID 58451)
-- Name: get_order_item_status(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_item_status(p_order_item_id integer, p_member_id integer) RETURNS character varying
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 259 (class 1255 OID 58457)
-- Name: get_product_by_category(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_by_category(p_category character varying) RETURNS TABLE(out_product_id integer, out_name character varying, out_description text, out_price numeric, out_category character varying, out_is_available boolean)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
        SELECT p.product_id, p.name, p.description, p.price, p.category, p.is_available
        FROM product p
        WHERE p.category = p_category
        LIMIT 1;
END;
$$;


--
-- TOC entry 253 (class 1255 OID 58455)
-- Name: get_product_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_by_id(p_product_id integer) RETURNS TABLE(out_product_id integer, out_name character varying, out_description text, out_price numeric, out_category character varying, out_is_available boolean)
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 258 (class 1255 OID 58456)
-- Name: get_product_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_categories() RETURNS TABLE(out_category character varying)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
        SELECT DISTINCT p.category
        FROM product p
        WHERE p.category IS NOT NULL
        ORDER BY p.category;
END;
$$;


--
-- TOC entry 252 (class 1255 OID 58454)
-- Name: get_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_products() RETURNS TABLE(out_product_id integer, out_name character varying, out_description text, out_price numeric, out_category character varying, out_is_available boolean)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
        SELECT p.product_id, p.name, p.description, p.price, p.category, p.is_available
        FROM product p
        WHERE p.is_available = true
        ORDER BY p.name;
END;
$$;


--
-- TOC entry 279 (class 1255 OID 58440)
-- Name: get_response(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_response(p_feedback_id integer) RETURNS TABLE(out_response_id integer, out_feedback_id integer, out_member_id integer, out_response_text text, out_created_at timestamp without time zone, out_username character varying)
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 276 (class 1255 OID 58464)
-- Name: get_sale_order_summary(date, date, character varying, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sale_order_summary(p_start_date date, p_end_date date, p_category character varying, p_status character varying, p_sort_by character varying, p_sort_order character varying) RETURNS TABLE(out_order_id integer, out_customer_name text, out_order_date timestamp without time zone, out_total_amount numeric, out_status character varying, out_product_count bigint, out_products_ordered text)
    LANGUAGE plpgsql STABLE
    AS $_$
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
$_$;


--
-- TOC entry 267 (class 1255 OID 58423)
-- Name: has_completed_order_for_product(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_completed_order_for_product(p_member_id integer, p_product_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- TOC entry 239 (class 1255 OID 58426)
-- Name: is_feedback_owner(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_feedback_owner(p_feedback_id integer, p_member_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM feedback f
        WHERE f.feedback_id = p_feedback_id
          AND f.member_id    = p_member_id
    );
END;
$$;


--
-- TOC entry 271 (class 1255 OID 58427)
-- Name: is_response_owner(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_response_owner(p_response_id integer, p_member_id integer) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM feedback_response fr
        WHERE fr.response_id = p_response_id
          AND fr.member_id    = p_member_id
    );
END;
$$;


--
-- TOC entry 275 (class 1255 OID 58447)
-- Name: place_order(integer, integer, integer, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.place_order(IN p_member_id integer, IN p_product_id integer, IN p_quantity integer, IN p_delivery_address text, OUT p_order_id integer, OUT p_order_item_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 281 (class 1255 OID 116305)
-- Name: place_orders(integer, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.place_orders(IN p_member_id integer, IN p_delivery_address text, OUT p_order_id integer, OUT p_processed_count integer, OUT p_skipped_count integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 251 (class 1255 OID 58453)
-- Name: register_member(character varying, character varying, text, character varying, character varying, character varying); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.register_member(IN p_username character varying, IN p_email character varying, IN p_password_hash text, IN p_first_name character varying, IN p_last_name character varying, IN p_role character varying, OUT p_member_id integer)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 265 (class 1255 OID 58446)
-- Name: register_member(character varying, character varying, character varying, character varying, character varying, character varying); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.register_member(IN p_username character varying, IN p_email character varying, IN p_password_hash character varying, IN p_first_name character varying, IN p_last_name character varying, IN p_role character varying, OUT p_member_id integer)
    LANGUAGE plpgsql
    AS $$
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
    VALUES (p_member_id, COALESCE(p_role, 'USER'));
END;
$$;


--
-- TOC entry 254 (class 1255 OID 58415)
-- Name: update_feedback(integer, integer, integer, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.update_feedback(IN p_feedback_id integer, IN p_member_id integer, IN p_rating integer, IN p_comment text)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 270 (class 1255 OID 58448)
-- Name: update_order_status(integer, character varying); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.update_order_status(IN p_order_id integer, IN p_status character varying)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 260 (class 1255 OID 58458)
-- Name: update_product_availability(integer, boolean); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.update_product_availability(IN p_product_id integer, IN p_is_available boolean, OUT p_out_id integer, OUT p_out_name character varying, OUT p_out_category character varying, OUT p_out_available boolean)
    LANGUAGE plpgsql
    AS $$
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


--
-- TOC entry 232 (class 1259 OID 74609)
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- TOC entry 234 (class 1259 OID 107757)
-- Name: cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart (
    cart_id integer NOT NULL,
    member_id integer NOT NULL,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- TOC entry 233 (class 1259 OID 107756)
-- Name: cart_cart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cart_cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5064 (class 0 OID 0)
-- Dependencies: 233
-- Name: cart_cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cart_cart_id_seq OWNED BY public.cart.cart_id;


--
-- TOC entry 236 (class 1259 OID 107766)
-- Name: cart_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_item (
    cart_item_id integer NOT NULL,
    cart_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT cart_item_quantity_check CHECK ((quantity > 0))
);


--
-- TOC entry 235 (class 1259 OID 107765)
-- Name: cart_item_cart_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cart_item_cart_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5065 (class 0 OID 0)
-- Dependencies: 235
-- Name: cart_item_cart_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cart_item_cart_item_id_seq OWNED BY public.cart_item.cart_item_id;


--
-- TOC entry 238 (class 1259 OID 107795)
-- Name: discount_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_rule (
    rule_id integer NOT NULL,
    discount_type character varying(30) NOT NULL,
    threshold_value numeric(10,2) DEFAULT 0 NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    product_id integer,
    is_active boolean DEFAULT true NOT NULL,
    description character varying(255),
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer
);


--
-- TOC entry 237 (class 1259 OID 107794)
-- Name: discount_rule_rule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discount_rule_rule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5066 (class 0 OID 0)
-- Dependencies: 237
-- Name: discount_rule_rule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discount_rule_rule_id_seq OWNED BY public.discount_rule.rule_id;


--
-- TOC entry 227 (class 1259 OID 58291)
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    feedback_id integer NOT NULL,
    order_item_id integer NOT NULL,
    member_id integer NOT NULL,
    rating integer NOT NULL,
    comment text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- TOC entry 226 (class 1259 OID 58290)
-- Name: feedback_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5067 (class 0 OID 0)
-- Dependencies: 226
-- Name: feedback_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_feedback_id_seq OWNED BY public.feedback.feedback_id;


--
-- TOC entry 229 (class 1259 OID 58315)
-- Name: feedback_response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_response (
    response_id integer NOT NULL,
    feedback_id integer NOT NULL,
    member_id integer NOT NULL,
    response_text text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- TOC entry 228 (class 1259 OID 58314)
-- Name: feedback_response_response_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_response_response_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5068 (class 0 OID 0)
-- Dependencies: 228
-- Name: feedback_response_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_response_response_id_seq OWNED BY public.feedback_response.response_id;


--
-- TOC entry 217 (class 1259 OID 24643)
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    member_id integer NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 218 (class 1259 OID 24649)
-- Name: member_member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5069 (class 0 OID 0)
-- Dependencies: 218
-- Name: member_member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_member_id_seq OWNED BY public.member.member_id;


--
-- TOC entry 219 (class 1259 OID 24650)
-- Name: member_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_role (
    member_id integer NOT NULL,
    role character varying(20) NOT NULL,
    CONSTRAINT member_role_role_check CHECK (((role)::text = ANY (ARRAY[('ADMIN'::character varying)::text, ('USER'::character varying)::text])))
);


--
-- TOC entry 220 (class 1259 OID 24654)
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    product_id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    category character varying(50),
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 221 (class 1259 OID 24661)
-- Name: product_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5070 (class 0 OID 0)
-- Dependencies: 221
-- Name: product_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_product_id_seq OWNED BY public.product.product_id;


--
-- TOC entry 231 (class 1259 OID 58376)
-- Name: response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response (
    response_id integer NOT NULL,
    feedback_id integer NOT NULL,
    member_id integer NOT NULL,
    response_text text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 230 (class 1259 OID 58375)
-- Name: response_response_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.response_response_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5071 (class 0 OID 0)
-- Dependencies: 230
-- Name: response_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.response_response_id_seq OWNED BY public.response.response_id;


--
-- TOC entry 222 (class 1259 OID 24662)
-- Name: sale_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_order (
    order_id integer NOT NULL,
    member_id integer,
    order_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total_amount numeric(10,2) NOT NULL,
    status character varying(20) NOT NULL,
    delivery_address text,
    CONSTRAINT sale_order_status_check CHECK (((status)::text = ANY (ARRAY[('COMPLETED'::character varying)::text, ('CANCELLED'::character varying)::text, ('PACKING'::character varying)::text])))
);


--
-- TOC entry 223 (class 1259 OID 24669)
-- Name: sale_order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_order_item (
    order_item_id integer NOT NULL,
    order_id integer,
    product_id integer,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    CONSTRAINT sale_order_item_quantity_check CHECK ((quantity > 0))
);


--
-- TOC entry 224 (class 1259 OID 24673)
-- Name: sale_order_item_order_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_order_item_order_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5072 (class 0 OID 0)
-- Dependencies: 224
-- Name: sale_order_item_order_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_order_item_order_item_id_seq OWNED BY public.sale_order_item.order_item_id;


--
-- TOC entry 225 (class 1259 OID 24674)
-- Name: sale_order_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_order_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5073 (class 0 OID 0)
-- Dependencies: 225
-- Name: sale_order_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_order_order_id_seq OWNED BY public.sale_order.order_id;


--
-- TOC entry 4844 (class 2604 OID 107760)
-- Name: cart cart_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart ALTER COLUMN cart_id SET DEFAULT nextval('public.cart_cart_id_seq'::regclass);


--
-- TOC entry 4847 (class 2604 OID 107769)
-- Name: cart_item cart_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item ALTER COLUMN cart_item_id SET DEFAULT nextval('public.cart_item_cart_item_id_seq'::regclass);


--
-- TOC entry 4850 (class 2604 OID 107798)
-- Name: discount_rule rule_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule ALTER COLUMN rule_id SET DEFAULT nextval('public.discount_rule_rule_id_seq'::regclass);


--
-- TOC entry 4835 (class 2604 OID 58294)
-- Name: feedback feedback_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN feedback_id SET DEFAULT nextval('public.feedback_feedback_id_seq'::regclass);


--
-- TOC entry 4838 (class 2604 OID 58318)
-- Name: feedback_response response_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_response ALTER COLUMN response_id SET DEFAULT nextval('public.feedback_response_response_id_seq'::regclass);


--
-- TOC entry 4827 (class 2604 OID 24675)
-- Name: member member_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member ALTER COLUMN member_id SET DEFAULT nextval('public.member_member_id_seq'::regclass);


--
-- TOC entry 4829 (class 2604 OID 24676)
-- Name: product product_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product ALTER COLUMN product_id SET DEFAULT nextval('public.product_product_id_seq'::regclass);


--
-- TOC entry 4840 (class 2604 OID 58379)
-- Name: response response_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response ALTER COLUMN response_id SET DEFAULT nextval('public.response_response_id_seq'::regclass);


--
-- TOC entry 4832 (class 2604 OID 24677)
-- Name: sale_order order_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order ALTER COLUMN order_id SET DEFAULT nextval('public.sale_order_order_id_seq'::regclass);


--
-- TOC entry 4834 (class 2604 OID 24678)
-- Name: sale_order_item order_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_item ALTER COLUMN order_item_id SET DEFAULT nextval('public.sale_order_item_order_item_id_seq'::regclass);


--
-- TOC entry 4888 (class 2606 OID 74617)
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4894 (class 2606 OID 107773)
-- Name: cart_item cart_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_pkey PRIMARY KEY (cart_item_id);


--
-- TOC entry 4891 (class 2606 OID 107764)
-- Name: cart cart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_pkey PRIMARY KEY (cart_id);


--
-- TOC entry 4898 (class 2606 OID 107805)
-- Name: discount_rule discount_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule
    ADD CONSTRAINT discount_rule_pkey PRIMARY KEY (rule_id);


--
-- TOC entry 4876 (class 2606 OID 58303)
-- Name: feedback feedback_order_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_order_item_id_key UNIQUE (order_item_id);


--
-- TOC entry 4878 (class 2606 OID 58301)
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (feedback_id);


--
-- TOC entry 4882 (class 2606 OID 58323)
-- Name: feedback_response feedback_response_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_response
    ADD CONSTRAINT feedback_response_pkey PRIMARY KEY (response_id);


--
-- TOC entry 4862 (class 2606 OID 24680)
-- Name: member member_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_email_key UNIQUE (email);


--
-- TOC entry 4864 (class 2606 OID 24682)
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (member_id);


--
-- TOC entry 4868 (class 2606 OID 24684)
-- Name: member_role member_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_role
    ADD CONSTRAINT member_role_pkey PRIMARY KEY (member_id, role);


--
-- TOC entry 4866 (class 2606 OID 24686)
-- Name: member member_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_username_key UNIQUE (username);


--
-- TOC entry 4870 (class 2606 OID 24688)
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (product_id);


--
-- TOC entry 4886 (class 2606 OID 58384)
-- Name: response response_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response
    ADD CONSTRAINT response_pkey PRIMARY KEY (response_id);


--
-- TOC entry 4874 (class 2606 OID 24690)
-- Name: sale_order_item sale_order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_item
    ADD CONSTRAINT sale_order_item_pkey PRIMARY KEY (order_item_id);


--
-- TOC entry 4872 (class 2606 OID 24692)
-- Name: sale_order sale_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_pkey PRIMARY KEY (order_id);


--
-- TOC entry 4892 (class 1259 OID 107777)
-- Name: cart_item_cart_id_product_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cart_item_cart_id_product_id_key ON public.cart_item USING btree (cart_id, product_id);


--
-- TOC entry 4889 (class 1259 OID 107774)
-- Name: cart_member_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cart_member_id_key ON public.cart USING btree (member_id);


--
-- TOC entry 4895 (class 1259 OID 107775)
-- Name: idx_cart_item_cart; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_item_cart ON public.cart_item USING btree (cart_id);


--
-- TOC entry 4896 (class 1259 OID 107776)
-- Name: idx_cart_item_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_item_product ON public.cart_item USING btree (product_id);


--
-- TOC entry 4879 (class 1259 OID 58334)
-- Name: idx_feedback_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_member ON public.feedback USING btree (member_id);


--
-- TOC entry 4880 (class 1259 OID 58335)
-- Name: idx_feedback_order_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_order_item ON public.feedback USING btree (order_item_id);


--
-- TOC entry 4883 (class 1259 OID 58336)
-- Name: idx_response_feedback; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_feedback ON public.feedback_response USING btree (feedback_id);


--
-- TOC entry 4884 (class 1259 OID 58337)
-- Name: idx_response_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_member ON public.feedback_response USING btree (member_id);


--
-- TOC entry 4910 (class 2606 OID 107783)
-- Name: cart_item cart_item_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.cart(cart_id) ON DELETE CASCADE;


--
-- TOC entry 4911 (class 2606 OID 107788)
-- Name: cart_item cart_item_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(product_id);


--
-- TOC entry 4909 (class 2606 OID 107778)
-- Name: cart cart_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id) ON DELETE CASCADE;


--
-- TOC entry 4912 (class 2606 OID 118188)
-- Name: discount_rule discount_rule_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule
    ADD CONSTRAINT discount_rule_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.member(member_id) ON DELETE SET NULL;


--
-- TOC entry 4913 (class 2606 OID 107806)
-- Name: discount_rule discount_rule_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule
    ADD CONSTRAINT discount_rule_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(product_id) ON DELETE SET NULL;


--
-- TOC entry 4903 (class 2606 OID 58309)
-- Name: feedback fk_feedback_member; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT fk_feedback_member FOREIGN KEY (member_id) REFERENCES public.member(member_id) ON DELETE CASCADE;


--
-- TOC entry 4904 (class 2606 OID 58304)
-- Name: feedback fk_feedback_order_item; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT fk_feedback_order_item FOREIGN KEY (order_item_id) REFERENCES public.sale_order_item(order_item_id) ON DELETE CASCADE;


--
-- TOC entry 4905 (class 2606 OID 58324)
-- Name: feedback_response fk_response_feedback; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_response
    ADD CONSTRAINT fk_response_feedback FOREIGN KEY (feedback_id) REFERENCES public.feedback(feedback_id) ON DELETE CASCADE;


--
-- TOC entry 4906 (class 2606 OID 58329)
-- Name: feedback_response fk_response_member; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_response
    ADD CONSTRAINT fk_response_member FOREIGN KEY (member_id) REFERENCES public.member(member_id) ON DELETE CASCADE;


--
-- TOC entry 4899 (class 2606 OID 24693)
-- Name: member_role member_role_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_role
    ADD CONSTRAINT member_role_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- TOC entry 4907 (class 2606 OID 58385)
-- Name: response response_feedback_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response
    ADD CONSTRAINT response_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.feedback(feedback_id) ON DELETE CASCADE;


--
-- TOC entry 4908 (class 2606 OID 58390)
-- Name: response response_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response
    ADD CONSTRAINT response_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- TOC entry 4901 (class 2606 OID 24698)
-- Name: sale_order_item sale_order_item_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_item
    ADD CONSTRAINT sale_order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sale_order(order_id);


--
-- TOC entry 4902 (class 2606 OID 24703)
-- Name: sale_order_item sale_order_item_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_item
    ADD CONSTRAINT sale_order_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(product_id);


--
-- TOC entry 4900 (class 2606 OID 24708)
-- Name: sale_order sale_order_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id);


-- Completed on 2026-08-14 14:21:56

--
-- PostgreSQL database dump complete
--

\unrestrict vsdkgLGRbhEGalKa3QxJIhLELMUq1ei1Dyae6dtSIaBiVAkLCDu6iHcmXtgxh0n

