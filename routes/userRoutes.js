const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../utils/cloudinary');



// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', protect, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'coverPhoto', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('PROFILE UPDATE REQUEST:', { body: req.body, files: req.files ? 'Files present' : 'No files' });
    const { name, headline, location, about } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      console.error('PROFILE UPDATE ERROR: User not found in DB for ID:', req.user._id);
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (headline) user.headline = headline;
    if (location) user.location = location;
    if (about) user.about = about;
    
    if (req.files) {
      if (req.files.avatar) {
        user.avatar = req.files.avatar[0].path;
        console.log('AVATAR UPLOAD SUCCESS:', req.files.avatar[0].path);
      }
      if (req.files.coverPhoto) {
        user.coverPhoto = req.files.coverPhoto[0].path;
        console.log('COVER PHOTO UPLOAD SUCCESS:', req.files.coverPhoto[0].path);
      }
    }

    const updatedUser = await user.save();
    console.log('PROFILE UPDATE SUCCESS:', updatedUser._id);
    res.json(updatedUser);
  } catch (error) {
    console.error('PROFILE UPDATE CRITICAL ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Connect/Follow user
// @route   POST /api/users/connect/:id
// @access  Private
router.post('/connect/:id', protect, async (req, res) => {
  try {
    const userToConnect = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user._id);

    if (!userToConnect) return res.status(404).json({ message: 'User not found' });
    if (userToConnect._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ message: 'Cannot connect with yourself' });
    }

    const isConnected = currentUser.connections.some(id => id.toString() === userToConnect._id.toString());

    if (isConnected) {
      // Unconnect
      currentUser.connections = currentUser.connections.filter(id => id.toString() !== userToConnect._id.toString());
    } else {
      // Connect
      currentUser.connections.push(userToConnect._id);
    }

    await currentUser.save();
    res.json(currentUser.connections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get suggested users to connect with
// @route   GET /api/users/suggestions
// @access  Private
router.get('/suggestions', protect, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Exclude self and already connected users safely
    const connections = currentUser.connections || [];
    const excludedIds = [currentUser._id, ...connections];
    
    const suggestions = await User.find({ 
      _id: { $nin: excludedIds } 
    }).select('name avatar headline location connections').limit(12);

    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get current user connections
// @route   GET /api/users/my-connections
// @access  Private
router.get('/my-connections', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('connections', 'name avatar headline connections');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user.connections || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
