// backend/clear_enrollments.js
require('dotenv').config();
const mongoose = require('mongoose');

// --- 1. DEFINE SCHEMA (Must match courses.js) ---
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  progress: [{ type: mongoose.Schema.Types.ObjectId }]
}, { timestamps: true });

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

// --- 2. CLEAR DATA ---
const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🔌 Connected to MongoDB...");

        const result = await Enrollment.deleteMany({});
        console.log(`✅ Successfully deleted ${result.deletedCount} enrollment records.`);
        console.log("   You can now re-enroll in courses.");
        
        mongoose.connection.close();
    } catch (err) {
        console.error("❌ Error:", err);
        mongoose.connection.close();
    }
};

seed();