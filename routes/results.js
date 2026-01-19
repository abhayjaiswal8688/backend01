// backend/routes/results.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- 1. DEFINE RESULT SCHEMA ---
// This schema stores the specific answers (and reasoning) a student gave
const resultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  testTitle: { type: String, required: true },
  category: { type: String },
  
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  percentage: { type: Number, required: true },
  
  // NEW: Detailed Responses Array
  responses: [{
      questionText: String,
      selectedOptionIndices: [Number], // Supports Multiple Choice
      reasoning: String,               // Stores the student's "Why"
      isCorrect: Boolean
  }]
}, { timestamps: true });

const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);

// --- 2. ROUTES ---

// SAVE RESULT (Student submits a test)
router.post('/', async (req, res) => {
  const { userId, testId, testTitle, category, score, totalQuestions, percentage, responses } = req.body;
  try {
    const newResult = new Result({
      userId,
      testId,
      testTitle,
      category,
      score,
      totalQuestions,
      percentage,
      responses // <--- Saving the detailed array
    });
    await newResult.save();
    res.status(201).json(newResult);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET USER RESULTS (For Student Dashboard / Profile)
router.get('/user/:userId', async (req, res) => {
  try {
    const results = await Result.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL RESULTS (For Admin Analytics)
router.get('/', async (req, res) => {
    try {
        const results = await Result.find()
            .populate('userId', 'name email') // Get Student Name
            .sort({ createdAt: -1 });
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;