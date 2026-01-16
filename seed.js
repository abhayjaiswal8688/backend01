// backend/seed_test.js
require('dotenv').config();
const mongoose = require('mongoose');

// --- 1. DEFINE SCHEMAS (Matches routes/tests.js) ---
const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  type: { type: String, enum: ['single', 'multiple'], default: 'single' },
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

// --- 2. SAMPLE DATA ---
const multiChoiceTest = {
    title: "Clinical Reasoning & Diagnostics",
    duration: "20 mins",
    icon: "research", // Matches one of your icon types
    category: "Diagnostics",
    orderIndex: 99,
    questions: [
        // QUESTION 1: Multiple Choice (Multiple Correct)
        {
            questionText: "Which of the following are common symptoms of localized inflammation? (Select all that apply)",
            type: "multiple",
            options: [
                "Redness (Rubor)", 
                "Decreased body temperature", 
                "Swelling (Tumor)", 
                "Heat (Calor)",
                "Extreme Euphoria"
            ],
            correctOptionIndices: [0, 2, 3] // Redness, Swelling, Heat
        },
        // QUESTION 2: Single Choice (Standard)
        {
            questionText: "What is the normal range for a resting heart rate in adults?",
            type: "single",
            options: [
                "40-60 bpm",
                "60-100 bpm",
                "100-120 bpm",
                "120-140 bpm"
            ],
            correctOptionIndices: [1]
        },
        // QUESTION 3: Multiple Choice (Multiple Correct)
        {
            questionText: "Select the fat-soluble vitamins from the list below.",
            type: "multiple",
            options: [
                "Vitamin C",
                "Vitamin A",
                "Vitamin B12",
                "Vitamin D",
                "Vitamin K"
            ],
            correctOptionIndices: [1, 3, 4] // A, D, K (E is missing but implied fat soluble)
        }
    ]
};

// --- 3. RUN SCRIPT ---
const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🔌 Connected to MongoDB...");

        await Test.create(multiChoiceTest);
        console.log("✅ Multi-Choice Test Added Successfully!");
        
        mongoose.connection.close();
    } catch (err) {
        console.error("❌ Error:", err);
        mongoose.connection.close();
    }
};

seed();