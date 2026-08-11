// controllers/promotionController.js — admin CRUD for discount rules

const prisma = require('../config/prisma');

const DISCOUNT_TYPES = ['QUANTITY_PRODUCT', 'CART_VALUE', 'DELIVERY_TIERED'];

class PromotionController {

    static async list(req, res) {
        try {
            const rules = await prisma.discountRule.findMany({
                include: { product: { select: { productId: true, name: true } } },
                orderBy: [{ discountType: 'asc' }, { thresholdValue: 'asc' }]
            });
            return res.json({ success: true, rules });
        } catch (err) {
            console.error('promotionController.list error:', err);
            return res.status(500).json({ success: false, message: 'Failed to load promotions.' });
        }
    }

    static async listProducts(req, res) {
        try {
            const products = await prisma.product.findMany({
                select:  { productId: true, name: true },
                orderBy: { name: 'asc' }
            });
            return res.json({ success: true, products });
        } catch (err) {
            console.error('promotionController.listProducts error:', err);
            return res.status(500).json({ success: false, message: 'Failed to load products.' });
        }
    }

    static async create(req, res) {
        try {
            const { discountType, thresholdValue, discountPercent, deliveryFee, productId, description, isActive } = req.body;

            if (!DISCOUNT_TYPES.includes(discountType)) {
                return res.status(400).json({ success: false, message: 'Invalid discount type.' });
            }
            if (thresholdValue === undefined || thresholdValue === null || Number(thresholdValue) < 0) {
                return res.status(400).json({ success: false, message: 'Threshold must be 0 or greater.' });
            }

            if (discountType === 'QUANTITY_PRODUCT') {
                if (!productId) {
                    return res.status(400).json({ success: false, message: 'Product is required.' });
                }
                if (!discountPercent || Number(discountPercent) <= 0 || Number(discountPercent) > 100) {
                    return res.status(400).json({ success: false, message: 'Discount % must be between 1 and 100.' });
                }
                const existing = await prisma.discountRule.findFirst({
                    where: { discountType: 'QUANTITY_PRODUCT', productId: parseInt(productId) }
                });
                if (existing) {
                    return res.status(400).json({
                        success: false,
                        message: 'This product already has a product discount. Edit or delete it first.'
                    });
                }
            }

            if (discountType === 'CART_VALUE') {
                if (Number(thresholdValue) < 1) {
                    return res.status(400).json({ success: false, message: 'Threshold must be at least $1.' });
                }
                if (!discountPercent || Number(discountPercent) <= 0 || Number(discountPercent) > 100) {
                    return res.status(400).json({ success: false, message: 'Discount % must be between 1 and 100.' });
                }
            }

            if (discountType === 'DELIVERY_TIERED') {
                if (deliveryFee === undefined || deliveryFee === null || Number(deliveryFee) < 0) {
                    return res.status(400).json({ success: false, message: 'Delivery fee must be 0 or greater.' });
                }
            }

            const rule = await prisma.discountRule.create({
                data: {
                    discountType,
                    thresholdValue:  parseFloat(thresholdValue),
                    discountPercent: discountType === 'DELIVERY_TIERED' ? 0 : parseFloat(discountPercent || 0),
                    deliveryFee:     discountType === 'DELIVERY_TIERED' ? parseFloat(deliveryFee) : 0,
                    productId:       discountType === 'QUANTITY_PRODUCT' ? parseInt(productId) : null,
                    isActive:        isActive !== undefined ? Boolean(isActive) : true,
                    description:     description?.trim() || null
                },
                include: { product: { select: { productId: true, name: true } } }
            });

            return res.status(201).json({ success: true, rule });
        } catch (err) {
            console.error('promotionController.create error:', err);
            return res.status(500).json({ success: false, message: 'Failed to create promotion.' });
        }
    }

    static async update(req, res) {
        try {
            const ruleId = parseInt(req.params.id);
            const { thresholdValue, discountPercent, deliveryFee, description, isActive } = req.body;

            if (isNaN(ruleId)) {
                return res.status(400).json({ success: false, message: 'Invalid rule ID.' });
            }

            const existing = await prisma.discountRule.findUnique({ where: { ruleId } });
            if (!existing) {
                return res.status(404).json({ success: false, message: 'Promotion not found.' });
            }

            const data = {};

            if (thresholdValue !== undefined) {
                if (Number(thresholdValue) < 0) {
                    return res.status(400).json({ success: false, message: 'Threshold must be 0 or greater.' });
                }
                data.thresholdValue = parseFloat(thresholdValue);
            }
            if (discountPercent !== undefined && existing.discountType !== 'DELIVERY_TIERED') {
                if (Number(discountPercent) <= 0 || Number(discountPercent) > 100) {
                    return res.status(400).json({ success: false, message: 'Discount % must be between 1 and 100.' });
                }
                data.discountPercent = parseFloat(discountPercent);
            }
            if (deliveryFee !== undefined && existing.discountType === 'DELIVERY_TIERED') {
                if (Number(deliveryFee) < 0) {
                    return res.status(400).json({ success: false, message: 'Delivery fee must be 0 or greater.' });
                }
                data.deliveryFee = parseFloat(deliveryFee);
            }
            if (description !== undefined) data.description = description?.trim() || null;
            if (isActive !== undefined)    data.isActive = Boolean(isActive);

            const updated = await prisma.discountRule.update({
                where:   { ruleId },
                data,
                include: { product: { select: { productId: true, name: true } } }
            });

            return res.json({ success: true, rule: updated });
        } catch (err) {
            console.error('promotionController.update error:', err);
            return res.status(500).json({ success: false, message: 'Failed to update promotion.' });
        }
    }

    static async remove(req, res) {
        try {
            const ruleId = parseInt(req.params.id);
            if (isNaN(ruleId)) {
                return res.status(400).json({ success: false, message: 'Invalid rule ID.' });
            }

            const existing = await prisma.discountRule.findUnique({ where: { ruleId } });
            if (!existing) {
                return res.status(404).json({ success: false, message: 'Promotion not found.' });
            }

            await prisma.discountRule.delete({ where: { ruleId } });
            return res.json({ success: true });
        } catch (err) {
            console.error('promotionController.remove error:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete promotion.' });
        }
    }
}

module.exports = PromotionController;
