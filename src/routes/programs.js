const express = require('express');
const router = express.Router();
const Program = require('../models/Program');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const stripeService = require('../services/stripe');

/**
 * GET /api/v1/programs
 * Get all active programs with Stripe pricing
 */
router.get('/', async (req, res) => {
  try {
    const { search, tags } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    // Add search filter
    if (search) {
      query.$text = { $search: search };
    }
    
    // Add tag filter
    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }
    
    const programs = await Program.find(query).sort({ createdAt: -1 });
    
    // Fetch Stripe pricing for each program
    const programsWithPricing = await Promise.all(
      programs.map(async (program) => {
        try {
          const product = await stripeService.getProduct(program.stripeProductId);
          const oneTimePrice = product.prices.find(p => p.type === 'one_time') || product.prices[0];
          
          return {
            _id: program._id,
            title: program.title,
            slug: program.slug,
            author: program.author,
            goals: program.goals,
            description: program.description,
            tags: program.tags,
            difficulty: program.difficulty,
            duration: program.duration,
            imageUrl: program.imageUrl,
            features: program.features,
            stripeProductId: program.stripeProductId,
            stripePriceId: program.stripePriceId,
            price: oneTimePrice ? {
              id: oneTimePrice.id,
              amount: oneTimePrice.amount,
              currency: oneTimePrice.currency,
              formatted: `$${(oneTimePrice.amount / 100).toFixed(2)}`
            } : null,
            createdAt: program.createdAt
          };
        } catch (error) {
          console.error(`Error fetching price for program ${program._id}:`, error.message);
          return {
            _id: program._id,
            title: program.title,
            slug: program.slug,
            author: program.author,
            goals: program.goals,
            description: program.description,
            tags: program.tags,
            difficulty: program.difficulty,
            duration: program.duration,
            imageUrl: program.imageUrl,
            features: program.features,
            stripeProductId: program.stripeProductId,
            stripePriceId: program.stripePriceId,
            price: null,
            createdAt: program.createdAt
          };
        }
      })
    );
    
    res.json({
      success: true,
      programs: programsWithPricing
    });
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch programs'
    });
  }
});

/**
 * GET /api/v1/programs/:id
 * Get single program details with Stripe pricing
 */
router.get('/:id', async (req, res) => {
  try {
    const program = await Program.findById(req.params.id);
    
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }
    
    // Fetch Stripe pricing
    let priceInfo = null;
    try {
      const product = await stripeService.getProduct(program.stripeProductId);
      const oneTimePrice = product.prices.find(p => p.type === 'one_time') || product.prices[0];
      
      if (oneTimePrice) {
        priceInfo = {
          id: oneTimePrice.id,
          amount: oneTimePrice.amount,
          currency: oneTimePrice.currency,
          formatted: `$${(oneTimePrice.amount / 100).toFixed(2)}`
        };
      }
    } catch (error) {
      console.error(`Error fetching price for program ${program._id}:`, error.message);
    }
    
    res.json({
      success: true,
      program: {
        _id: program._id,
        title: program.title,
        slug: program.slug,
        author: program.author,
        goals: program.goals,
        description: program.description,
        tags: program.tags,
        difficulty: program.difficulty,
        duration: program.duration,
        imageUrl: program.imageUrl,
        features: program.features,
        stripeProductId: program.stripeProductId,
        stripePriceId: program.stripePriceId,
        price: priceInfo,
        createdAt: program.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching program:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch program'
    });
  }
});

/**
 * POST /api/v1/programs/checkout
 * Create Stripe checkout session for a program
 */
router.post('/checkout', auth, async (req, res) => {
  try {
    const { programId } = req.body;
    
    if (!programId) {
      return res.status(400).json({
        success: false,
        error: 'Program ID is required'
      });
    }
    
    // Get program details
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({
        success: false,
        error: 'Program not found'
      });
    }
    
    // Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user already purchased this program
    const alreadyPurchased = user.purchasedPrograms.some(
      p => p.programId.toString() === programId
    );
    
    if (alreadyPurchased) {
      return res.status(400).json({
        success: false,
        error: 'You have already purchased this program'
      });
    }
    
    // Create or get Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripeService.createOrRetrieveCustomer(
        user.email,
        null,
        { userId: user._id.toString() }
      );
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }
    
    // Create checkout session
    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:5500'}/pages/my-programs.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:5500'}/pages/program-marketplace.html`;
    
    const session = await stripeService.getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price: program.stripePriceId,
        quantity: 1
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      metadata: {
        programId: program._id.toString(),
        programSlug: program.slug,
        userId: user._id.toString(),
        type: 'program_purchase'
      }
    });
    
    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

/**
 * GET /api/v1/programs/user/my-programs
 * Get all programs purchased by the authenticated user
 */
router.get('/user/my-programs', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('purchasedPrograms.programId');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Filter out any null program references (in case program was deleted)
    const validPrograms = user.purchasedPrograms.filter(p => p.programId);
    
    const programs = validPrograms.map(p => ({
      _id: p.programId._id,
      title: p.programId.title,
      slug: p.programId.slug,
      author: p.programId.author,
      goals: p.programId.goals,
      description: p.programId.description,
      tags: p.programId.tags,
      difficulty: p.programId.difficulty,
      duration: p.programId.duration,
      imageUrl: p.programId.imageUrl,
      features: p.programId.features,
      purchasedAt: p.purchasedAt,
      amountPaid: p.amountPaid
    }));
    
    res.json({
      success: true,
      programs
    });
  } catch (error) {
    console.error('Error fetching user programs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch your programs'
    });
  }
});

module.exports = router;