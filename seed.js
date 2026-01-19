require('dotenv').config(); // Load environment variables
const mongoose = require('mongoose');

// --- 1. DEFINE SCHEMAS (Matches your courses.js) ---
// We redefine them here because courses.js exports a router, not the models.

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  enrolledCount: { type: Number, default: 0 },
  // ... other fields are not strictly necessary for this operation
});

const enrollmentSchema = new mongoose.Schema({
  // ... fields are not strictly necessary for deleteMany
});

// Create Models (Using the same names as courses.js to target the correct collections)
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);

// --- 2. EXECUTION FUNCTION ---

const resetEnrollments = async () => {
  try {
    // A. Connect to Database
    // Ensure you have your MONGO_URI in a .env file or replace process.env.MONGO_URI below
    const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/your_database_name';
    
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(dbUri);
    console.log('✅ Connected.');

    // B. Delete All Enrollments
    console.log('⏳ Deleting all enrollments...');
    const deleteResult = await Enrollment.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} enrollments.`);

    // C. Reset Course Enrollment Counts
    // Since we deleted enrollments, we must reset the counters on the courses
    console.log('⏳ Resetting course enrollment counts to 0...');
    const updateResult = await Course.updateMany({}, { $set: { enrolledCount: 0 } });
    console.log(`✅ Reset counts for ${updateResult.modifiedCount} courses.`);

    console.log('🎉 Cleanup complete!');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    // D. Close Connection
    await mongoose.disconnect();
    console.log('👋 Disconnected.');
    process.exit();
  }
};

// --- 3. RUN ---
resetEnrollments();