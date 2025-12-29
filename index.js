// backend/index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 
const nodemailer = require('nodemailer');
const { InferenceClient } = require("@huggingface/inference");

const app = express();
const PORT = process.env.PORT || 3001;
const hf = new InferenceClient(process.env.HF_TOKEN);

app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- MODELS ---
const userSchema = new mongoose.Schema({ 
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, 
    role: { type: String, enum: ['student', 'admin'], default: 'student' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const postSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
      text: { type: String, required: true },
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });
const Post = mongoose.model('Post', postSchema);

const threadSchema = new mongoose.Schema({ 
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    title: String, 
    body: String, 
    tags: [String], 
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
    status: { type: String, default: 'open' }
}, { timestamps: true });
const Thread = mongoose.model('Thread', threadSchema);

// --- IMPORT ROUTERS ---
const testRoutes = require('./routes/tests'); 
const communityRoutes = require('./routes/community');
const resourceRoutes = require('./routes/resources'); // <--- NEW IMPORT

// --- AUTH MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ message: "Authentication token missing or invalid." });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id || decoded.userId; 
        next();
    } catch (err) {
        res.status(403).json({ message: "Invalid token." });
    }
};

// --- USE ROUTERS ---
app.use('/api/tests', testRoutes);
app.use('/api/community', authMiddleware, communityRoutes);
app.use('/api/resources', resourceRoutes); // <--- NEW ROUTE USE

// --- AUTH & OTHER ROUTES (unchanged) ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!email.endsWith('@gmail.com')) return res.status(400).json({ message: "Only Gmail accounts are allowed." });
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists." });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const verificationToken = jwt.sign({ name, email, password: hashedPassword }, process.env.JWT_SECRET, { expiresIn: '15m' });

        const verificationUrl = `${process.env.BASE_URL}/api/auth/verify-email?token=${verificationToken}`;
        await transporter.sendMail({
            from: `"Brain Help" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Verify Your Email",
            html: `<a href="${verificationUrl}">Verify Email</a>`
        });
        res.status(200).json({ message: "Verification email sent!" });
    } catch (error) {
        res.status(500).json({ message: "Error during registration." });
    }
});

app.get('/api/auth/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send("Token missing.");
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const existingUser = await User.findOne({ email: decoded.email });
        if (existingUser) return res.send("Account already verified.");
        const newUser = new User({ name: decoded.name, email: decoded.email, password: decoded.password });
        await newUser.save();
        res.send("Email Verified! You can now login.");
    } catch (error) {
        res.status(400).send("Invalid or expired link.");
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Invalid credentials." });
        
        // Include role in token
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (error) {
        res.status(500).json({ message: "Server error." });
    }
});

app.get('/api/users/me', authMiddleware, async (req, res) => {
    const user = await User.findById(req.userId).select('-password');
    res.json(user || {});
});

// Startup
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log('MongoDB connected.');
}).catch(err => console.error(err));
// Add this simple route to test if the server is up
app.get('/', (req, res) => {
    res.send("Backend is running successfully!");
});
module.exports = app;
