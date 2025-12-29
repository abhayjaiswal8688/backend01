const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ---------------------------------------------------------
// 1. RETRIEVE MODELS hhh
// ---------------------------------------------------------
const Post = mongoose.model('Post');
const User = mongoose.model('User');

// ---------------------------------------------------------
// 2. GET POSTS (Matches Frontend: GET /api/community/posts)
// ---------------------------------------------------------
router.get('/posts', async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('author', 'name email role') 
            .populate('comments.author', 'name')   
            .sort({ createdAt: -1 });              
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 3. CREATE POST (Matches Frontend: POST /api/community/posts)
// ---------------------------------------------------------
router.post('/posts', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Content is required' });

        // Ensure req.userId exists (Middleware must be working)
        if (!req.userId) return res.status(401).json({ error: 'User not authenticated' });

        const newPost = new Post({
            content,
            author: req.userId 
        });

        await newPost.save();
        await newPost.populate('author', 'name role');
        
        res.status(201).json(newPost);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 4. UPVOTE (Matches Frontend: PUT /api/community/posts/:id/upvote)
// ---------------------------------------------------------
// Notice we added '/posts/' to the path to match frontend
router.put('/posts/:id/upvote', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const index = post.upvotes.indexOf(req.userId);

        if (index === -1) {
            post.upvotes.push(req.userId);
        } else {
            post.upvotes.splice(index, 1);
        }

        await post.save();
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 5. ADD COMMENT (Matches Frontend: POST /api/community/posts/:id/comments)
// ---------------------------------------------------------
// Changed path from '/:id/comment' to '/posts/:id/comments' (plural)
router.post('/posts/:id/comments', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Comment text is required' });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const newComment = {
            text,
            author: req.userId
        };

        post.comments.push(newComment);
        await post.save();
        
        await post.populate('comments.author', 'name');
        
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 6. DELETE COMMENT (Matches: DELETE /api/community/posts/:id/comments/:commentId)
// ---------------------------------------------------------
router.delete('/posts/:id/comments/:commentId', async (req, res) => {
    try {
        const { id, commentId } = req.params;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        const currentUser = await User.findById(req.userId);
        
        // Safety check if currentUser is not found (deleted user?)
        if (!currentUser) return res.status(404).json({ error: 'User record not found' });

        const isAuthor = comment.author.toString() === req.userId;
        const isAdmin = currentUser.role === 'admin';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        comment.deleteOne();
        await post.save();

        res.json({ message: 'Comment deleted successfully', post });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 7. DELETE POST (Matches: DELETE /api/community/posts/:id)
// ---------------------------------------------------------
router.delete('/posts/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const currentUser = await User.findById(req.userId);
        if (!currentUser) return res.status(404).json({ error: 'User record not found' });

        const isAuthor = post.author.toString() === req.userId;
        const isAdmin = currentUser.role === 'admin';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await Post.findByIdAndDelete(req.params.id);
        res.json({ message: 'Post deleted successfully', postId: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;