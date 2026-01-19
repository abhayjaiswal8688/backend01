// backend/routes/courses.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- 1. SCHEMAS ---

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['video', 'text', 'quiz'], default: 'video' },
  contentUrl: { type: String }, 
  textContent: { type: String }, 
  duration: { type: String, default: '10 mins' },
  isFree: { type: Boolean, default: false },
  questions: [{
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctOptionIndices: [{ type: Number, required: true }], 
    type: { type: String, enum: ['single', 'multiple'], default: 'single' },
    // ADDED: Flag to require student reasoning
    requiresReasoning: { type: Boolean, default: false }
  }]
});

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  lessons: [lessonSchema]
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  thumbnail: { type: String, default: '' },
  category: { type: String, default: 'General' },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  isPublic: { type: Boolean, default: false }, 
  modules: [moduleSchema],
  enrolledCount: { type: Number, default: 0 },
  orderIndex: { type: Number, default: 0 } 
}, { timestamps: true });

// ENROLLMENT SCHEMA
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  
  // 1. Completed Lessons (IDs)
  progress: [{ type: mongoose.Schema.Types.ObjectId }], 
  
  // 2. Quiz Scores & Responses
  quizScores: [{
      lessonId: { type: mongoose.Schema.Types.ObjectId },
      score: Number,
      totalQuestions: Number,
      percentage: Number,
      passed: Boolean,
      attemptedAt: { type: Date, default: Date.now },
      // ADDED: Detailed User Responses
      responses: [{
          questionText: String,
          selectedOptionIndices: [Number],
          reasoning: String,
          isCorrect: Boolean
      }]
  }],

  // 3. Calculated Progress Metrics
  courseProgress: { type: Number, default: 0 }, 
  moduleProgress: [{
      moduleId: { type: mongoose.Schema.Types.ObjectId },
      completedCount: Number,
      totalCount: Number,
      percentage: Number
  }],
  
  lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);

// --- ROUTES ---

// 1. GET ALL (Public)
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find()
      .select('-modules.lessons.textContent -modules.lessons.questions') 
      .sort({ orderIndex: 1 });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. REORDER COURSES
router.put('/reorder/all', async (req, res) => { 
    const { courseIds } = req.body;
    try {
        const updates = courseIds.map((id, index) => {
            return Course.findByIdAndUpdate(id, { orderIndex: index });
        });
        await Promise.all(updates);
        res.json({ message: "Courses reordered" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. STUDENT STATUS
router.get('/student/status', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']; 
    if (!userId) return res.json([]); 
    
    const enrollments = await Enrollment.find({ student: userId }).select('course status');
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. ADMIN ENROLLMENTS
router.get('/admin/enrollments', async (req, res) => {
    try {
      const pending = await Enrollment.find({ status: 'pending' })
        .populate('student', 'name email')
        .populate('course', 'title');
      res.json(pending);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 5. ADMIN APPROVE/REJECT
router.put('/admin/enrollments/:id', async (req, res) => {
    const { status } = req.body;
    try {
      const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, { status }, { new: true });
      if (status === 'approved') {
          await Course.findByIdAndUpdate(enrollment.course, { $inc: { enrolledCount: 1 } });
      }
      res.json(enrollment);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 6. ADMIN ANALYTICS
router.get('/admin/analytics', async (req, res) => {
    try {
        const courses = await Course.find().lean();
        
        const courseLessonCounts = {};
        courses.forEach(c => {
            const total = c.modules.reduce((acc, m) => acc + m.lessons.length, 0);
            courseLessonCounts[c._id] = total || 1; 
        });

        const enrollments = await Enrollment.find({ status: 'approved' })
            .populate('student', 'name email')
            .populate('course', 'title category thumbnail')
            .sort({ updatedAt: -1 })
            .lean();

        const analyticsData = enrollments.map(enrollment => {
            if (!enrollment.course || !enrollment.student) return null;

            const totalLessons = courseLessonCounts[enrollment.course._id] || 0;
            const completedLessons = enrollment.progress ? enrollment.progress.length : 0;
            const progressPercentage = enrollment.courseProgress || Math.round((completedLessons / totalLessons) * 100);

            return {
                _id: enrollment._id,
                studentId: enrollment.student._id, 
                studentName: enrollment.student.name,
                studentEmail: enrollment.student.email,
                courseTitle: enrollment.course.title,
                courseCategory: enrollment.course.category,
                thumbnail: enrollment.course.thumbnail,
                totalLessons,
                completedLessons,
                progressPercentage: Math.min(progressPercentage, 100), 
                lastActive: enrollment.updatedAt,
                isCompleted: progressPercentage >= 100
            };
        }).filter(item => item !== null); 

        res.json(analyticsData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 7. STUDENT MY COURSES
router.get('/student/my-courses', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const enrollments = await Enrollment.find({ student: userId })
            .populate({
                path: 'course',
                select: 'title thumbnail category modules' 
            })
            .lean();

        const enrichedEnrollments = enrollments.map(enrollment => {
            if (!enrollment.course) return null;

            const lessonTitleMap = {};
            const moduleTitleMap = {};

            if (enrollment.course.modules) {
                enrollment.course.modules.forEach(mod => {
                    moduleTitleMap[mod._id.toString()] = mod.title;
                    mod.lessons.forEach(lesson => {
                        lessonTitleMap[lesson._id.toString()] = lesson.title;
                    });
                });
            }

            const enrichedQuizScores = (enrollment.quizScores || []).map(score => ({
                ...score,
                lessonTitle: lessonTitleMap[score.lessonId.toString()] || "Unknown Lesson"
            }));

            const enrichedModuleProgress = (enrollment.moduleProgress || []).map(mp => ({
                ...mp,
                moduleTitle: moduleTitleMap[mp.moduleId.toString()] || "Unknown Module"
            }));

            const { modules, ...courseInfo } = enrollment.course;

            return {
                ...enrollment,
                course: courseInfo,
                quizScores: enrichedQuizScores,
                moduleProgress: enrichedModuleProgress
            };
        }).filter(Boolean);

        res.json(enrichedEnrollments);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// --- SPECIFIC ID ROUTES ---

// GET SINGLE
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('instructor', 'name');
    if (!course) return res.status(404).json({ message: "Course not found" });
    
    let enrollmentStatus = null;
    let enrollment = null;
    const userId = req.headers['x-user-id']; 
    if (userId) {
        const foundEnrollment = await Enrollment.findOne({ course: req.params.id, student: userId });
        if (foundEnrollment) {
            enrollmentStatus = foundEnrollment.status;
            enrollment = foundEnrollment;
        }
    }
    res.json({ course, enrollmentStatus, enrollment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE (Admin)
router.post('/', async (req, res) => {
  try {
    const lastCourse = await Course.findOne().sort('-orderIndex');
    const newOrderIndex = lastCourse ? lastCourse.orderIndex + 1 : 0;
    const newCourse = new Course({ ...req.body, orderIndex: newOrderIndex });
    await newCourse.save();
    res.status(201).json(newCourse);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// UPDATE (Admin)
router.put('/:id', async (req, res) => {
    try {
        const updatedCourse = await Course.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        res.json(updatedCourse);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE (Admin)
router.delete('/:id', async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        await Enrollment.deleteMany({ course: req.params.id });
        res.json({ message: "Course deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// NEW: UNENROLL STUDENT (Admin/User)
// Handles: DELETE /courses/:courseId/enroll/:studentId
router.delete('/:id/enroll/:studentId', async (req, res) => {
    const { id, studentId } = req.params;
    try {
        const enrollment = await Enrollment.findOneAndDelete({ course: id, student: studentId });
        if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

        if (enrollment.status === 'approved') {
            await Course.findByIdAndUpdate(id, { $inc: { enrolledCount: -1 } });
        }
        res.json({ message: "Unenrolled successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ENROLL (Student)
router.post('/:id/enroll', async (req, res) => {
    const { userId } = req.body;
    try {
      const course = await Course.findById(req.params.id);
      if (!course) return res.status(404).json({ message: "Course not found" });

      const existing = await Enrollment.findOne({ course: req.params.id, student: userId });
      if (existing) return res.status(400).json({ message: "Already enrolled/requested." });
  
      const status = course.isPublic ? 'approved' : 'pending';

      const newEnrollment = new Enrollment({ 
          course: req.params.id, 
          student: userId, 
          status: status 
      });
      await newEnrollment.save();

      if (status === 'approved') {
          await Course.findByIdAndUpdate(req.params.id, { $inc: { enrolledCount: 1 } });
      }

      res.status(201).json({ 
          message: status === 'approved' ? "Enrolled successfully!" : "Request sent.",
          status: status
      });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE LESSON PROGRESS (Student)
router.post('/:id/update-lesson-progress', async (req, res) => {
    const { userId, lessonId, moduleId, type, quizData } = req.body;
    // quizData: { score, totalQuestions, passed, responses: [...] }
    
    try {
      const course = await Course.findById(req.params.id);
      const enrollment = await Enrollment.findOne({ course: req.params.id, student: userId });
      
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found." });
      if (!course) return res.status(404).json({ message: "Course not found." });

      // 1. Mark Lesson as Completed 
      let shouldMarkComplete = true;
      if (type === 'quiz' && quizData && !quizData.passed) {
          shouldMarkComplete = false;
      }

      if (shouldMarkComplete) {
          const alreadyCompleted = enrollment.progress.some(id => id.toString() === lessonId);
          if (!alreadyCompleted) {
              enrollment.progress.push(lessonId);
          }
      }

      // 2. Handle Quiz Score & Detailed Responses
      if (type === 'quiz' && quizData) {
          // Remove previous score for this lesson
          enrollment.quizScores = enrollment.quizScores.filter(qs => qs.lessonId.toString() !== lessonId);
          
          enrollment.quizScores.push({
              lessonId,
              score: quizData.score,
              totalQuestions: quizData.totalQuestions,
              percentage: (quizData.score / quizData.totalQuestions) * 100,
              passed: quizData.passed,
              attemptedAt: new Date(),
              // SAVE USER ANSWERS
              responses: quizData.responses || [] 
          });
      }

      // 3. RECALCULATE MODULE PROGRESS
      const modulesStats = [];
      let totalCourseLessons = 0;
      let totalCourseCompleted = 0;

      course.modules.forEach(mod => {
          const modLessonIds = mod.lessons.map(l => l._id.toString());
          const modTotal = modLessonIds.length;
          const modCompleted = enrollment.progress.filter(pId => modLessonIds.includes(pId.toString())).length;
          
          modulesStats.push({
              moduleId: mod._id,
              completedCount: modCompleted,
              totalCount: modTotal,
              percentage: modTotal > 0 ? Math.round((modCompleted / modTotal) * 100) : 0
          });

          totalCourseLessons += modTotal;
          totalCourseCompleted += modCompleted;
      });

      enrollment.moduleProgress = modulesStats;
      enrollment.courseProgress = totalCourseLessons > 0 
          ? Math.round((totalCourseCompleted / totalCourseLessons) * 100) 
          : 0;

      enrollment.lastActive = new Date();
      await enrollment.save();
      
      res.json({ 
          message: "Progress updated", 
          progress: enrollment.progress,
          courseProgress: enrollment.courseProgress,
          moduleProgress: enrollment.moduleProgress,
          quizScores: enrollment.quizScores
      });

    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;