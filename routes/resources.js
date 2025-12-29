// backend/routes/resources.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// --- 1. DEFINE SCHEMA ---
const resourceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['video', 'article', 'book'], default: 'video' },
    url: { type: String, required: true },
    description: String,
    category: { type: String, default: 'General' },
    orderIndex: { type: Number, default: 0 } // For reordering
}, { timestamps: true });

const Resource = mongoose.model('Resource', resourceSchema);

// --- 2. MIDDLEWARE ---
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(403).json({ message: "Token missing" });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ message: "Admin access required" });
        req.userId = decoded.id;
        next();
    } catch (err) { return res.status(401).json({ message: "Invalid token" }); }
};

// --- 3. ROUTES ---

// GET /api/resources - Sorted by orderIndex
router.get('/', async (req, res) => {
    try {
        const resources = await Resource.find().sort({ orderIndex: 1 });
        res.json(resources);
    } catch (error) { res.status(500).json({ message: "Error fetching resources." }); }
});

// GET /api/resources/:id - Get Single (For Editing)
router.get('/:id', async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ message: "Resource not found" });
        res.json(resource);
    } catch (error) { res.status(500).json({ message: "Error fetching resource." }); }
});

// POST /api/resources - Create New
router.post('/', verifyAdmin, async (req, res) => {
    try {
        const lastResource = await Resource.findOne().sort('-orderIndex');
        const newOrderIndex = lastResource ? lastResource.orderIndex + 1 : 0;

        const newResource = new Resource({
            ...req.body,
            orderIndex: newOrderIndex
        });
        await newResource.save();
        res.status(201).json(newResource);
    } catch (error) { res.status(500).json({ message: "Error adding resource." }); }
});

// PUT /api/resources/reorder - Batch Reorder
router.put('/reorder', verifyAdmin, async (req, res) => {
    const { resourceIds } = req.body;
    try {
        const updates = resourceIds.map((id, index) => {
            return Resource.findByIdAndUpdate(id, { orderIndex: index });
        });
        await Promise.all(updates);
        res.json({ message: "Order updated successfully" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/resources/:id - Update Single
router.put('/:id', verifyAdmin, async (req, res) => {
    try {
        const updatedResource = await Resource.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedResource);
    } catch (error) { res.status(500).json({ message: "Error updating resource." }); }
});

// DELETE /api/resources/:id
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        await Resource.findByIdAndDelete(req.params.id);
        res.json({ message: "Resource deleted." });
    } catch (error) { res.status(500).json({ message: "Error deleting resource." }); }
});

module.exports = router;