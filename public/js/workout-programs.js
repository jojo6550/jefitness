// Program data mapping
const programData = {
    'upper-lower-back-program': {
        title: 'Upper & Lower Back Program',
        description: 'A targeted program designed to strengthen and mobilize your entire back, improving posture and reducing discomfort.',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '1-2 Days/Week',
        sessionLength: '30-45 min/session',
        slug: 'upper-lower-back-program'
    },
    'full-body-mobility': {
        title: 'Full Body Mobility Drills',
        description: 'Improve posture, flexibility, and joint function from head to toe with these essential mobility drills.',
        price: 79.99,
        duration: '6 weeks',
        level: 'Intermediate',
        frequency: '3-5 Days/Week',
        sessionLength: '20-30 min/session',
        slug: 'full-body-mobility'
    },
    '8-week-eds-safe-strength-fat-loss-program': {
        title: '8-Week EDS-Safe Strength & Fat Loss Program',
        description: 'An 8-week program designed for females with EDS (Ehlers-Danlos Syndrome) and limited equipment, focusing on joint stability, fat loss, and muscle preservation through controlled, low-impact exercises.',
        price: 60.00,
        duration: '8 weeks',
        level: 'Intermediate',
        frequency: '5 Days/Week',
        sessionLength: '45-60 min/session',
        slug: '8-week-eds-safe-strength-fat-loss-program'
    },
    '9-week-phased-strength-program': {
        title: '9-Week Phased Strength Program',
        description: 'A 9-week phased program that respects fatigue, motor learning, and strength carryover to SBD (Squat, Bench, Deadlift). Includes hypertrophy, strength, and power phases for optimal progression.',
        price: 50.00,
        duration: '9 weeks',
        level: 'Advanced',
        frequency: '4 Days/Week',
        sessionLength: '60-90 min/session',
        slug: '9-week-phased-strength-program'
    }

};

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const baseUrl = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

// Add to cart function
async function addToCart(programSlug) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = './login.html';
        return;
    }

    const program = programData[programSlug];
    
    if (!program) {
        console.error('Program not found');
        return;
    }

    try {
        // First, check if program exists in database, if not create it
        let programId = await getOrCreateProgram(program);

        // Add to cart
        const res = await fetch(`${baseUrl}/api/cart/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                programId: programId,
                quantity: 1
            })
        });

        if (!res.ok) {
            throw new Error('Failed to add to cart');
        }

        const cart = await res.json();

        // Update cart badge
        updateCartBadge(cart.items.length);

        // Show success toast
        const toastEl = document.getElementById('addToCartToast');
        const toast = new bootstrap.Toast(toastEl);
        toast.show();

    } catch (err) {
        console.error(err);
        alert('Error adding to cart. Please try again.');
    }
}

// Get or create program in database
async function getOrCreateProgram(programData) {
    const token = localStorage.getItem('token');

    try {
        // Try to get program by slug
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        let res = await fetch(`${baseUrl}/api/v1/programs/${programData.slug}`, {
            headers: headers
        });

        if (res.ok) {
            const program = await res.json();
            return program._id;
        }

        // If program doesn't exist, create it (requires admin)
        // For now, we'll store a temporary ID
        // In production, programs should be pre-seeded in the database
        console.warn('Program not found in database. Please seed programs.');

        // Return a mock ID for development
        return 'temp-' + programData.slug;

    } catch (err) {
        console.error('Error getting program:', err);
        throw err;
    }
}

// Update cart badge
function updateCartBadge(count) {
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// Load cart count on page load
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    
    if (token) {
        try {
            const res = await fetch(`${baseUrl}/api/v1/cart`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const cart = await res.json();
                updateCartBadge(cart.items.length);
            }
        } catch (err) {
            console.error('Error loading cart count:', err);
        }
    }

    // Add event listeners to all "Add to Cart" buttons
    document.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const programSlug = e.currentTarget.dataset.program;
            addToCart(programSlug);
        });
    });
});