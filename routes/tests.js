// backend/routes/tests.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- 1. DEFINE THE SCHEMA ---
const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  
  // NEW: Support for Question Types
  type: { type: String, enum: ['single', 'multiple'], default: 'single' },
  
  // NEW: Array of correct indices (Replaces old correctOptionIndex)
  correctOptionIndices: [{ type: Number, required: true }] 
});

const testSchema = new mongoose.Schema({
  title: { type: String, required: true },
  duration: { type: String, default: "15 mins" }, 
  icon: { type: String, default: "nursing" }, 
  category: { type: String, default: "General" }, 
  orderIndex: { type: Number, default: 0 }, 
  questions: [questionSchema],
}, { timestamps: true });

const Test = mongoose.model('Test', testSchema);

// --- 2. API ROUTES ---

// GET /api/tests - SORTED BY ORDER
router.get('/', async (req, res) => {
  try {
    const tests = await Test.find({}, 'title createdAt questions.length duration icon category orderIndex')
                            .sort({ orderIndex: 1 }); 
    res.json(tests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tests/:id - Get Single
router.get('/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tests - Create New
router.post('/', async (req, res) => {
  const { title, questions, duration, icon, category } = req.body; 

  try {
    const lastTest = await Test.findOne().sort('-orderIndex');
    const newOrderIndex = lastTest ? lastTest.orderIndex + 1 : 0;

    const newTest = new Test({
      title,
      questions,
      duration, 
      icon,
      category,
      orderIndex: newOrderIndex
    });

    const savedTest = await newTest.save();
    res.status(201).json(savedTest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/tests/reorder - Batch Reorder
router.put('/reorder', async (req, res) => {
    const { testIds } = req.body; 
    try {
        const updates = testIds.map((id, index) => {
            return Test.findByIdAndUpdate(id, { orderIndex: index });
        });
        await Promise.all(updates);
        res.json({ message: "Order updated successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/tests/:id - UPDATE SINGLE TEST
router.put('/:id', async (req, res) => {
    try {
        const updatedTest = await Test.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true } 
        );
        if (!updatedTest) {
            return res.status(404).json({ message: "Test not found" });
        }
        res.json(updatedTest);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE
router.delete('/:id', async (req, res) => {
    try {
        const deletedTest = await Test.findByIdAndDelete(req.params.id);
        if (!deletedTest) return res.status(404).json({ message: "Test not found" });
        res.json({ message: "Test deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;