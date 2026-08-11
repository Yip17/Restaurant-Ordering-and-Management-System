// src/controllers/checkoutController.js

const { getCheckoutSummary } = require('../models/Checkout');
const { getActiveRules }     = require('../models/DiscountEngine');

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
}

module.exports = CheckoutController;
