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
    '12-week-strength-program': {
        title: '12 Week Strength Programme',
        description: 'By Jamin Johnson – A 12-week phased program to build real strength, lose fat slowly, and avoid CNS burnout with structured progression.',
        price: 129.99,
        duration: '12 weeks',
        level: 'Advanced',
        frequency: '5 Days/Week',
        sessionLength: '60-90 min/session',
        slug: '12-week-strength-program'
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
        let res = await fetch(`${baseUrl}/api/programs/${programData.slug}`);
        
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
            const res = await fetch(`${baseUrl}/api/cart`, {
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