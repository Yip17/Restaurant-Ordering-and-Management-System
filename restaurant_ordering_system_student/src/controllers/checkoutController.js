// src/controllers/checkoutController.js

const { getCartItems }                     = require('../models/Checkout');
const { getActiveRules, calculateSummary } = require('../models/DiscountEngine');
const SaleOrder                            = require('../models/SaleOrder');

class CheckoutController {

    // GET /checkout/summary?deliveryMethod=delivery|pickup
    static async getSummary(req, res) {
        try {
            const memberId       = req.session.userId;
            const deliveryMethod = req.query.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';

            const cartItems = await getCartItems(memberId);
            const summary   = await calculateSummary(cartItems, deliveryMethod);

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
    static async getAvailableDiscounts(req, res) {
        try {
            const rules = await getActiveRules();

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

            const cartDiscounts = rules
                .filter(r => r.discountType === 'CART_VALUE')
                .map(r => ({
                    ruleId:      r.ruleId,
                    description: r.description,
                    threshold:   parseFloat(r.thresholdValue),
                    percent:     parseFloat(r.discountPercent)
                }))
                .sort((a, b) => a.threshold - b.threshold);

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
    static async placeOrders(req, res) {
        try {
            const memberId        = req.session.userId;
            const deliveryMethod  = req.body.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';
            const deliveryAddress = deliveryMethod === 'pickup'
                ? 'Self-Collect'
                : (req.body.delivery_address || '').trim();

            if (deliveryMethod === 'delivery' && !deliveryAddress) {
                return res.status(400).json({ success: false, message: 'Delivery address is required.' });
            }

            // Read cart and split available vs unavailable
            const cartItems        = await getCartItems(memberId);
            const availableItems   = cartItems.filter(i => i.product.isAvailable);
            const unavailableItems = cartItems.filter(i => !i.product.isAvailable);

            if (availableItems.length === 0) {
                return res.status(400).json({
                    success:      false,
                    message:      'None of your cart items are currently available.',
                    skippedCount: unavailableItems.length,
                    skippedNames: unavailableItems.map(i => i.product.name)
                });
            }

            // Calculate discounts on available items only
            const summary = await calculateSummary(availableItems, deliveryMethod);

            // Call stored procedure — creates order, inserts order items, removes available cart items
            const result = await SaleOrder.placeOrdersFromCart({ memberId, deliveryAddress });

            if (result.processedCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No orders were created. Items may have become unavailable.'
                });
            }

            // Overwrite raw total with discounted grand total
            await SaleOrder.updateTotalAmount(result.orderId, summary.grandTotal);

            return res.status(201).json({
                success:        true,
                processedCount: result.processedCount,
                skippedCount:   result.skippedCount,
                skippedNames:   unavailableItems.map(i => i.product.name),
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
