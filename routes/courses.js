// backend/routes/courses.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- 1. SCHEMAS ---

// A Lesson is a single unit of content (Video or Text)
// backend/routes/courses.js

// ... imports

// 1. UPDATED SCHEMAS

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  // Added 'quiz' to enum
  type: { type: String, enum: ['video', 'text', 'quiz'], default: 'video' },
  contentUrl: { type: String }, 
  textContent: { type: String }, 
  duration: { type: String, default: '10 mins' },
  isFree: { type: Boolean, default: false },
  
  // NEW: Embedded Quiz Questions (Only used if type === 'quiz')
  questions: [{
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }], // Array of 4 strings
    correctOptionIndex: { type: Number, required: true }
  }]
});

// A Module is a group of lessons (e.g., "Chapter 1")
const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  lessons: [lessonSchema]
});

// The Main Course Schema
const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  thumbnail: { type: String, default: '' }, // URL to an image
  category: { type: String, default: 'General' },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  
  // The Curriculum Structure
  modules: [moduleSchema],
  
  // Stats
  enrolledCount: { type: Number, default: 0 },
}, { timestamps: true });

// The Enrollment Schema (Who has access?)
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  progress: [{ type: mongoose.Schema.Types.ObjectId }] // IDs of completed lessons
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

// --- 2. MIDDLEWARE FOR AUTH ---
// (We assume you pass the token in headers, we'll decode it in index.js usually, 
// but for now we rely on the logic that req.userId is set by your main authMiddleware in index.js)

// --- 3. ROUTES ---

// === PUBLIC / STUDENT ROUTES ===

// GET ALL COURSES (Catalog)
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find().select('-modules.lessons.textContent'); // Lightweight fetch
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET SINGLE COURSE (With status check)
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('instructor', 'name');
    
    // Check if current user is enrolled (if userId is passed in query/header)
    let enrollmentStatus = null;
    let enrollment = null; // New variable to hold full data
    const userId = req.headers['x-user-id']; // We will send this from frontend
    
    if (userId) {
        const foundEnrollment = await Enrollment.findOne({ course: req.params.id, student: userId });
        if (foundEnrollment) {
            enrollmentStatus = foundEnrollment.status;
            enrollment = foundEnrollment; // Capture the full object (including progress)
        }
    }

    // UPDATED: Return 'enrollment' object so frontend can see progress
    res.json({ course, enrollmentStatus, enrollment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// REQUEST ENROLLMENT (Student clicks "Join Course")
router.post('/:id/enroll', async (req, res) => {
  const { userId } = req.body; // Sent from frontend
  try {
    const existing = await Enrollment.findOne({ course: req.params.id, student: userId });
    if (existing) return res.status(400).json({ message: "Already requested." });

    const newEnrollment = new Enrollment({
        course: req.params.id,
        student: userId,
        status: 'pending' // Default is pending approval
    });
    await newEnrollment.save();
    res.status(201).json({ message: "Request sent to Admin." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// === ADMIN ROUTES ===

// CREATE COURSE
router.post('/', async (req, res) => {
  try {
    const newCourse = new Course(req.body);
    await newCourse.save();
    res.status(201).json(newCourse);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET PENDING ENROLLMENTS
router.get('/admin/enrollments', async (req, res) => {
  try {
    const pending = await Enrollment.find({ status: 'pending' })
                                    .populate('student', 'name email')
                                    .populate('course', 'title');
    res.json(pending);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// APPROVE/REJECT STUDENT
router.put('/admin/enrollments/:id', async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'
  try {
    const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, { status }, { new: true });
    
    // If approved, increment course count
    if (status === 'approved') {
        await Course.findByIdAndUpdate(enrollment.course, { $inc: { enrolledCount: 1 } });
    }
    
    res.json(enrollment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/student/status', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']; 
    if (!userId) return res.json([]); // Return empty if no user ID
    
    // Find all enrollments for this student
    const enrollments = await Enrollment.find({ student: userId }).select('course status');
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATED ROUTE: TOGGLE LESSON PROGRESS (Complete OR Incomplete)
router.post('/:id/toggle-progress', async (req, res) => {
  const { userId, lessonId, completed } = req.body; // completed: boolean (true/false)
  try {
    const enrollment = await Enrollment.findOne({ course: req.params.id, student: userId });
    
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found." });

    // Ensure progress array exists
    if (!enrollment.progress) enrollment.progress = [];

    if (completed) {
        // Add if not present (Check as string to avoid ObjectId mismatches)
        const exists = enrollment.progress.some(id => id.toString() === lessonId);
        if (!exists) {
            enrollment.progress.push(lessonId);
        }
    } else {
        // Remove if present (Mark Incomplete)
        enrollment.progress = enrollment.progress.filter(id => id.toString() !== lessonId);
    }

    await enrollment.save();
    res.json({ message: "Progress updated", progress: enrollment.progress });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;