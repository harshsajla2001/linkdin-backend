const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { upload } = require('../utils/cloudinary');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/posts
// @desc    Get all posts
// @access  Public
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'name avatar headline')
      .populate('comments.user', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/posts
// @desc    Create a post
// @access  Private (though userId is currently in body)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { content, userId } = req.body;
    let imageUrl = '';
    
    if (req.file) {
      imageUrl = req.file.path;
    }

    const post = await Post.create({
      user: userId,
      content,
      image: imageUrl
    });

    const populatedPost = await Post.findById(post._id).populate('user', 'name avatar headline');
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('SERVER ERROR during post creation:', error);
    res.status(500).json({ 
      message: 'Server error during post creation', 
      error: error.message
    });
  }
});

// @route   PUT /api/posts/:id/like
// @desc    Like/Unlike a post
// @access  Private
router.put('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      console.log(`LIKE ERROR: Post with ID ${req.params.id} not found`);
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(req.user._id);

    if (likeIndex === -1) {
      // Like
      post.likes.push(req.user._id);
    } else {
      // Unlike
      post.likes.splice(likeIndex, 1);
    }

    await post.save();
    res.json(post.likes);
  } catch (error) {
    console.error('LIKE ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/posts/:id/comment
// @desc    Comment on a post
// @access  Private
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text is required' });

    const post = await Post.findById(req.params.id);
    if (!post) {
      console.log(`COMMENT ERROR: Post with ID ${req.params.id} not found`);
      return res.status(404).json({ message: 'Post not found' });
    }

    const newComment = {
      user: req.user._id,
      text,
      date: Date.now()
    };

    post.comments.push(newComment);
    await post.save();

    const populatedPost = await Post.findById(post._id).populate('comments.user', 'name avatar');
    res.json(populatedPost.comments);
  } catch (error) {
    console.error('COMMENT ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
