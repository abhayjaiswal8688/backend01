// backend/routes/results.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- SCHEMA DEFINITION ---
const resultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Link to student
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true }, // Link to test
  
  // Denormalized Data (Saves CPU on reads)
  testTitle: { type: String, required: true },
  category: { type: String },
  
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  percentage: { type: Number, required: true },
  
  // Optional: Store strictly what is needed for review (e.g., just wrong answers) to save space
  // For now, we keep it simple.
}, { timestamps: true });

// Create Compound Index: Fast lookups for "Student's history" and "Test Leaderboards"
resultSchema.index({ userId: 1, createdAt: -1 }); 
resultSchema.index({ testId: 1, score: -1 });

const Result = mongoose.model('Result', resultSchema);

// --- ROUTES ---

// 1. SAVE RESULT (Called when quiz ends)
router.post('/', async (req, res) => {
  try {
    const { userId, testId, testTitle, category, score, totalQuestions } = req.body;
    
    const percentage = Math.round((score / totalQuestions) * 100);

    const newResult = new Result({
      userId,
      testId,
      testTitle,
      category,
      score,
      totalQuestions,
      percentage
    });

    await newResult.save();
    res.status(201).json(newResult);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. GET STUDENT HISTORY (For Profile Page)
router.get('/user/:userId', async (req, res) => {
  try {
    const history = await Result.find({ userId: req.params.userId })
                                .sort({ createdAt: -1 })
                                .limit(50); // Optimization: Limit to last 50 attempts
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. GET ADMIN ANALYTICS (All results)
router.get('/admin/all', async (req, res) => {
  try {
    // Populate user name so Admin knows who took the test
    // Note: You need a User model for this populate to work effectively
    const allResults = await Result.find()
                                   .sort({ createdAt: -1 })
                                   .limit(100)
                                   .populate('userId', 'name email'); // Assuming User model has these fields
    res.json(allResults);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;