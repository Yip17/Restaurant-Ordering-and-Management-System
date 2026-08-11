// src/controllers/checkoutController.js

const { getCheckoutSummary } = require('../models/Checkout');
const { getActiveRules }     = require('../models/DiscountEngine');
const SaleOrder                = require('../models/SaleOrder');

class CheckoutController {

    // GET /checkout/summary?deliveryMethod=delivery|pickup
    static async getSummary(req, res) {
        try {
            const memberId       = req.session.userId;
            const deliveryMethod = req.query.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';

            const { cartItems, summary } = await getCheckoutSummary(memberId, deliveryMethod);

            // Shape items for the frontend
            const items = cartItems.map(item => ({
                cartItemId:  item.cartItemId,
                productId:   item.productId,
                productName: item.product.name,
                category:    item.product.category || '',
                unitPrice:   parseFloat(item.product.price).toFixed(2),
                quantity:    item.quantity,
                subtotal:    (parseFloat(item.product.price) * item.quantity).toFixed(2)
            }));

            return res.json({ success: true, items, summary, deliveryMethod });

        } catch (err) {
            console.error('checkoutController.getSummary error:', err);
            if (err.message === 'Cart is empty') {
                return res.status(400).json({ success: false, message: 'Your cart is empty.' });
            }
            return res.status(500).json({ success: false, message: 'Failed to calculate checkout.' });
        }
    }

    // GET /checkout/available-discounts
    // Returns all active discount rules grouped by category for the promotions panel.
    static async getAvailableDiscounts(req, res) {
        try {
            const rules = await getActiveRules();

            // Product discounts — both specific-product and any-item
            const productDiscounts = rules
                .filter(r => r.discountType === 'QUANTITY_PRODUCT')
                .map(r => ({
                    ruleId:      r.ruleId,
                    description: r.description,
                    threshold:   parseFloat(r.thresholdValue),
                    percent:     parseFloat(r.discountPercent),
                    productId:   r.productId,
                    productName: r.product ? r.product.name : null
                }))
                .sort((a, b) => {
                    if (a.productId !== b.productId) return (a.productId || 0) - (b.productId || 0);
                    return a.threshold - b.threshold;
                });

            // Cart value discounts — tiered
            const cartDiscounts = rules
                .filter(r => r.discountType === 'CART_VALUE')
                .map(r => ({
                    ruleId:      r.ruleId,
                    description: r.description,
                    threshold:   parseFloat(r.thresholdValue),
                    percent:     parseFloat(r.discountPercent)
                }))
                .sort((a, b) => a.threshold - b.threshold);

            // Delivery tiers
            const deliveryRules = rules
                .filter(r => r.discountType === 'DELIVERY_TIERED')
                .map(r => ({
                    ruleId:      r.ruleId,
                    description: r.description,
                    threshold:   parseFloat(r.thresholdValue),
                    fee:         parseFloat(r.deliveryFee)
                }))
                .sort((a, b) => a.threshold - b.threshold);

            return res.json({ success: true, productDiscounts, cartDiscounts, deliveryRules });

        } catch (err) {
            console.error('checkoutController.getAvailableDiscounts error:', err);
            return res.status(500).json({ success: false, message: 'Failed to load discounts.' });
        }
    }

    // POST /checkout/place-orders
    // Body: { delivery_address, deliveryMethod }
    // Flow:
    //   1. Fetch cart items via Prisma to find available vs unavailable.
    //   2. Run DiscountEngine on available items only → correct grandTotal.
    //   3. Call place_orders procedure (creates order with raw totals).
    //   4. Update the order's total_amount to the discounted grandTotal.
    static async placeOrders(req, res) {
        try {
            const memberId       = req.session.userId;
            const deliveryMethod = req.body.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';
            const deliveryAddress = deliveryMethod === 'pickup' ? 'Self-Collect' : (req.body.delivery_address || '').trim();

            if (deliveryMethod === 'delivery' && !deliveryAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Delivery address is required.'
                });
            }

            // ── Step 1: get cart with product info ─────────────────────────
            const prisma = require('../config/prisma');
            const cart = await prisma.cart.findUnique({
                where:   { memberId },
                include: { cartItem: { include: { product: true }, orderBy: { createdAt: 'asc' } } }
            });

            if (!cart || cart.cartItem.length === 0) {
                return res.status(400).json({ success: false, message: 'Your cart is empty.' });
            }

            // ── Step 2: identify available items and run discount engine ───
            const availableItems   = cart.cartItem.filter(i => i.product.isAvailable);
            const unavailableItems = cart.cartItem.filter(i => !i.product.isAvailable);

            if (availableItems.length === 0) {
                return res.status(400).json({
                    success:      false,
                    message:      'None of your cart items are currently available.',
                    skippedCount: unavailableItems.length,
                    skippedNames: unavailableItems.map(i => i.product.name)
                });
            }

            // Calculate discounts on available items only — unavailable items
            // are excluded so they don't inflate the subtotal used for
            // CART_VALUE and DELIVERY_TIERED thresholds.
            const { calculateSummary } = require('../models/DiscountEngine');
            const summary = await calculateSummary(availableItems, deliveryMethod);

            // ── Step 3: call stored procedure ─────────────────────────────
            const result = await SaleOrder.placeOrdersFromCart({ memberId, deliveryAddress });

            if (result.processedCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No orders were created. Items may have become unavailable.'
                });
            }

            // ── Step 4: update order total with discounted amount ──────────
            // summary.grandTotal is already the correct discounted total
            // for all available items. Update the single order created by the procedure.
            await SaleOrder.updateTotalAmount(result.orderId, summary.grandTotal);

            const order = await SaleOrder.findById(result.orderId);

            const skippedNames = unavailableItems.map(i => i.product.name);

            return res.status(201).json({
                success:        true,
                order,
                processedCount: result.processedCount,
                skippedCount:   result.skippedCount,
                skippedNames,
                grandTotal:     summary.grandTotal,
                message: result.skippedCount > 0
                    ? `${result.processedCount} item(s) ordered. ${result.skippedCount} unavailable item(s) remain in your cart.`
                    : `All ${result.processedCount} item(s) ordered successfully.`
            });

        } catch (err) {
            console.error('checkoutController.placeOrders error:', err);
            if (err.userFacing) {
                return res.status(400).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: 'Failed to place orders.' });
        }
    }
}

module.exports = CheckoutController;
