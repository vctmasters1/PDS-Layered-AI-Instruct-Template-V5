// ============================================================================
// PipeDream Marketplace - Main Coordinator
// This file handles page initialization and coordinates between modules
// ============================================================================
// ============================================================================
// MOBILE NAVIGATION
// ============================================================================

/**
 * Toggle mobile hamburger menu
 */
function toggleMobileNav() {
    const nav = document.getElementById('navCollapsible');
    if (nav) {
        nav.classList.toggle('open');
    }
}

/**
 * Close mobile nav (call after navigation actions)
 */
function closeMobileNav() {
    const nav = document.getElementById('navCollapsible');
    if (nav) {
        nav.classList.remove('open');
    }
}

// Close mobile nav when clicking outside
document.addEventListener('click', function(e) {
    const navbar = document.getElementById('mainNavbar');
    const nav = document.getElementById('navCollapsible');
    if (nav && nav.classList.contains('open') && !navbar.contains(e.target)) {
        nav.classList.remove('open');
    }
});

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 * @param {number} duration - Duration in ms (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    // Remove any existing toast
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.textContent = message;
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8',
    };
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        padding: '12px 24px',
        borderRadius: '6px',
        color: type === 'warning' ? '#333' : '#fff',
        backgroundColor: colors[type] || colors.info,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        zIndex: '99999',
        fontSize: '14px',
        fontWeight: '500',
        opacity: '0',
        transition: 'opacity 0.3s ease',
        maxWidth: '400px',
    });
    document.body.appendChild(toast);
    // Trigger fade-in
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    // Auto-remove
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Make globally available for all modules
window.showToast = showToast;

// Session tracking for mission statement modal
const SESSION_MISSION_KEY = 'pipedream_mission_shown_session';

/**
 * Show mission statement modal
 * @param {boolean} autoTriggered - If true, only shows once per session (for auto-popup on load)
 */
function showMissionStatementModal(autoTriggered) {
    // If auto-triggered (page load), only show once per session
    if (autoTriggered && sessionStorage.getItem(SESSION_MISSION_KEY)) {
        return;
    }
    
    const modal = document.getElementById('missionStatementModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        
        // Mark as shown for this session
        sessionStorage.setItem(SESSION_MISSION_KEY, 'true');
    }
}

/**
 * Close mission statement modal
 */
function closeMissionStatementModal() {
    const modal = document.getElementById('missionStatementModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show fee structure disclosure modal and load current fees
 */
async function showFeeStructureModal() {
    const modal = document.getElementById('feeStructureModal');
    if (!modal) return;
    
    // Load current fees from backend
    try {
        const response = await fetch('/v1/admin/settings');
        if (response.ok) {
            const data = await response.json();
            const settings = data.settings;
            
            // Update modal with current values
            document.getElementById('feeUpfrontPercent').textContent = settings.paymentUpfrontPercent || 40;
            document.getElementById('feeShippingPercent').textContent = settings.paymentShippingPercent || 30;
            document.getElementById('feeDeliveryPercent').textContent = settings.paymentDeliveryPercent || 30;
            document.getElementById('feePlatformPercent').textContent = settings.platformFeePercent || 10;
            document.getElementById('feePostingAmount').textContent = (settings.postingFeePerRequest || 1.00).toFixed(2);
            document.getElementById('feeTaxPercent').textContent = settings.salesTaxWithholdingPercent || 0;
        }
    } catch (error) {
        console.warn('Could not load current fees:', error);
    }
    
    modal.classList.add('show');
    modal.style.display = 'flex';
}

/**
 * Close fee structure modal
 */
function closeFeeStructureModal() {
    const modal = document.getElementById('feeStructureModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show legal disclaimer modal
 */
function showDisclaimerModal() {
    const modal = document.getElementById('disclaimerModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

/**
 * Close legal disclaimer modal
 */
function closeDisclaimerModal() {
    const modal = document.getElementById('disclaimerModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show Terms of Service modal
 */
function showTermsModal() {
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

/**
 * Close Terms of Service modal
 */
function closeTermsModal() {
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show Privacy Policy modal
 */
function showPrivacyPolicyModal() {
    const modal = document.getElementById('privacyPolicyModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

/**
 * Close Privacy Policy modal
 */
function closePrivacyPolicyModal() {
    const modal = document.getElementById('privacyPolicyModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show Rules & Regulations modal
 */
function showRulesModal() {
    const modal = document.getElementById('rulesModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

/**
 * Close Rules & Regulations modal
 */
function closeRulesModal() {
    const modal = document.getElementById('rulesModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show Disputes & Appeals modal
 */
function showDisputesModal() {
    const modal = document.getElementById('disputesModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

/**
 * Close Disputes & Appeals modal
 */
function closeDisputesModal() {
    const modal = document.getElementById('disputesModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

/**
 * Show Report modal  
 * @param {string} entityType - 'user', 'product', 'message', 'bulletin_card'
 * @param {string} entityId - ID of the entity being reported
 * @param {string} reportedUserId - ID of the user being reported (optional)
 */
function showReportModal(entityType, entityId, reportedUserId) {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    
    document.getElementById('reportEntityType').value = entityType || '';
    document.getElementById('reportEntityId').value = entityId || '';
    document.getElementById('reportedUserId').value = reportedUserId || '';
    document.getElementById('reportCategory').value = '';
    document.getElementById('reportDescription').value = '';
    document.getElementById('reportCharCount').textContent = '0';
    document.getElementById('reportSubmitBtn').disabled = false;
    document.getElementById('reportSubmitBtn').textContent = 'Submit Report';
    
    modal.classList.add('show');
    modal.style.display = 'flex';
}

/**
 * Close Report modal
 */
function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

// Report form character counter
document.addEventListener('DOMContentLoaded', function() {
    const descField = document.getElementById('reportDescription');
    const charCount = document.getElementById('reportCharCount');
    if (descField && charCount) {
        descField.addEventListener('input', () => {
            charCount.textContent = descField.value.length;
        });
    }

    // Report form submission
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const token = localStorage.getItem('pds_token');
            if (!token) {
                alert('You must be logged in to submit a report.');
                return;
            }

            const category = document.getElementById('reportCategory').value;
            const description = document.getElementById('reportDescription').value;
            const entityType = document.getElementById('reportEntityType').value;
            const entityId = document.getElementById('reportEntityId').value;
            const reportedUserId = document.getElementById('reportedUserId').value;

            if (!category) {
                alert('Please select a report category.');
                return;
            }
            if (!description || description.trim().length < 10) {
                alert('Please provide a detailed explanation (at least 10 characters).');
                return;
            }

            const submitBtn = document.getElementById('reportSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            try {
                const body = {
                    category,
                    description: description.trim(),
                    entityType,
                };
                if (entityId) body.entityId = entityId;
                if (reportedUserId) body.reportedUserId = reportedUserId;

                const res = await fetch('/v1/reports', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify(body),
                });

                const data = await res.json();
                if (res.ok) {
                    alert('Report submitted successfully. Our team will review it shortly.');
                    closeReportModal();
                } else {
                    alert(data.error || 'Failed to submit report. Please try again.');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Report';
                }
            } catch (err) {
                console.error('Report submission error:', err);
                alert('Network error. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Report';
            }
        });
    }
});

/**
 * Navigate to homepage
 */
function goToHomepage() {
    showSection('marketplace-section');
    window.scrollTo(0, 0);
}

// Close mission modal when clicking outside
document.addEventListener('click', (e) => {
    const missionModal = document.getElementById('missionStatementModal');
    if (missionModal && e.target === missionModal) {
        closeMissionStatementModal();
    }
    
    const disclaimerModal = document.getElementById('disclaimerModal');
    if (disclaimerModal && e.target === disclaimerModal) {
        closeDisclaimerModal();
    }
    
    const privacyModal = document.getElementById('privacyPolicyModal');
    if (privacyModal && e.target === privacyModal) {
        closePrivacyPolicyModal();
    }
    
    const rulesModalEl = document.getElementById('rulesModal');
    if (rulesModalEl && e.target === rulesModalEl) {
        closeRulesModal();
    }
    
    const disputesModalEl = document.getElementById('disputesModal');
    if (disputesModalEl && e.target === disputesModalEl) {
        closeDisputesModal();
    }
    
    const reportModalEl = document.getElementById('reportModal');
    if (reportModalEl && e.target === reportModalEl) {
        closeReportModal();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize location (cookie → geolocation → default)
    try {
        if (typeof initLocation === 'function') initLocation();
    } catch (e) {
        console.error('Error initializing location:', e);
    }
    
    // Update auth UI based on current login state
    try {
        updateAuthUI();
    } catch (e) {
        console.error('Error updating auth UI:', e);
    }

    // Handle SPA routes from URL (e.g. /reset-password?token=xxx from email links)
    try {
        const urlPath = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        if (urlPath === '/reset-password') {
            const token = urlParams.get('token');
            showResetPasswordModal();
            if (token) {
                // Skip step 1, go directly to step 2 with token pre-filled
                document.getElementById('resetStep1').style.display = 'none';
                document.getElementById('resetStep2').style.display = 'block';
                document.getElementById('resetToken').value = token;
            }
            // Clean the URL so it doesn't re-trigger on refresh after completion
            window.history.replaceState({}, '', '/');
        }
    } catch (e) {
        console.error('Error handling URL route:', e);
    }
    
    // Show mission statement modal once per session (auto-triggered)
    try {
        showMissionStatementModal(true);
    } catch (e) {
        console.error('Error showing mission statement:', e);
    }
    
    // Fetch marketplace data from API, then render
    setTimeout(async function() {
        // Load designers and producers from API first
        try {
            if (typeof fetchAllMarketplaceData === 'function') {
                await fetchAllMarketplaceData();
            }
        } catch (e) {
            console.warn('Error fetching marketplace data:', e);
        }

        try {
            renderProducts();
        } catch (e) {
            console.error('Error in renderProducts:', e);
        }
        
        try {
            renderDesigners();
        } catch (e) {
            console.error('Error in renderDesigners:', e);
        }
        
        try {
            renderProducers();
        } catch (e) {
            console.error('Error in renderProducers:', e);
        }
    }, 300);
});

// Tab navigation handler
function showTab(tabName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section
    const section = document.getElementById(tabName + '-section');
    if (section) {
        section.classList.add('active');
    }
    
    // Mark clicked button as active (only if button exists)
    const currentButton = event.target.closest('.main-tab-btn');
    if (currentButton) {
        currentButton.classList.add('active');
    }
    
    // Trigger rendering
    if (tabName === 'marketplace') {
        renderProducts();
    } else if (tabName === 'designers') {
        renderDesigners();
    } else if (tabName === 'producers') {
        renderProducers();
    } else if (tabName === 'map') {
        const existingMap = typeof getMapInstance === 'function' ? getMapInstance() : null;
        if (!existingMap) {
            setupMap();
        }
    }
}

// Section navigation handler
function showSection(sectionName) {
    // Close mobile nav on section change
    closeMobileNav();
    
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    // Main navbar is always visible (simplified navigation at top)
    const mainNavbar = document.getElementById('mainNavbar');
    if (mainNavbar) {
        mainNavbar.style.display = 'block';
    }
    
    // Hide marketplace tabs by default
    const marketplaceTabs = document.getElementById('marketplaceTabs');
    if (marketplaceTabs) marketplaceTabs.style.display = 'none';
    
    // Marketplace section IDs that should show tabs
    const marketplaceSectionIds = ['marketplace-section', 'materials-section', 'designers-section', 'producers-section', 'custom-projects-section', 'gizmos-section', 'authors-section', 'bulletin-board-section', 'map-section'];
    
    // Show marketplace tabs for all marketplace sections
    if (marketplaceSectionIds.includes(sectionName)) {
        if (marketplaceTabs) marketplaceTabs.style.display = 'flex';
        
        // Update active tab button
        document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
        const tabButtonMap = {
            'marketplace-section': 0,
            'materials-section': 1,
            'designers-section': 2,
            'producers-section': 3,
            'custom-projects-section': 4,
            'gizmos-section': 5,
            'authors-section': 6,
            'bulletin-board-section': 7,
            'map-section': 8
        };
        const tabIndex = tabButtonMap[sectionName];
        const activeBtn = document.querySelectorAll('.main-tab-btn')[tabIndex];
        if (activeBtn) activeBtn.classList.add('active');
    }
    
    // Show selected section
    const section = document.getElementById(sectionName);
    if (section) {
        section.classList.add('active');
        section.style.display = 'block';
        
        // Load content for specific sections
        if (sectionName === 'dashboard-section') {
            loadDashboard();
            // Set up the sidebar and show first tab
            showDashboardTab('orders');
        } else if (sectionName === 'account-settings-section') {
            // Show profile tab by default
            showSettingsTab('profile');
            loadProfileData();
        } else if (sectionName === 'map-section') {
            // Initialize map when map section is shown
            setTimeout(() => {
                if (typeof setupMap === 'function') {
                    const existingMap = typeof getMapInstance === 'function' ? getMapInstance() : null;
                    if (!existingMap) {
                        setupMap();
                    } else {
                        existingMap.invalidateSize();
                    }
                }
            }, 100);
        } else if (sectionName === 'marketplace-section') {
            // Re-render products when switching to this tab
            if (typeof renderProducts === 'function') renderProducts();
        } else if (sectionName === 'designers-section') {
            // Ensure designer cards are rendered (fetch + render)
            if (typeof fetchDesignersFromAPI === 'function') {
                fetchDesignersFromAPI().then(() => {
                    if (typeof renderDesigners === 'function') renderDesigners();
                });
            } else if (typeof renderDesigners === 'function') {
                renderDesigners();
            }
        } else if (sectionName === 'producers-section') {
            // Ensure producer cards are rendered (fetch + render)
            if (typeof fetchProducersFromAPI === 'function') {
                fetchProducersFromAPI().then(() => {
                    if (typeof renderProducers === 'function') renderProducers();
                });
            } else if (typeof renderProducers === 'function') {
                renderProducers();
            }
        } else if (sectionName === 'bulletin-board-section') {
            loadBulletinBoard(1);
        } else if (sectionName === 'custom-projects-section') {
            loadPublicCustomProjects();
        } else if (sectionName === 'gizmos-section') {
            loadGizmos();
        }
    }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Show login modal
 */
function showLoginModal() {
    closeMobileNav();
    document.getElementById('loginModal').classList.add('show');
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginForm').reset();
}

/**
 * Close login modal
 */
function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('show');
}

/**
 * Show signup modal
 */
function showSignupModal() {
    closeMobileNav();
    document.getElementById('signupModal').classList.add('show');
    document.getElementById('signupError').style.display = 'none';
    // Reset wizard to step 1
    resetSignupWizard();
    const step1Form = document.getElementById('signupStep1Form');
    if (step1Form) step1Form.reset();
}

/**
 * Close signup modal
 */
function closeSignupModal() {
    document.getElementById('signupModal').classList.remove('show');
    resetSignupWizard();
}

/**
 * Show password reset modal
 */
function showResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.getElementById('resetStep1').style.display = 'block';
    document.getElementById('resetStep2').style.display = 'none';
    document.getElementById('resetError').style.display = 'none';
    document.getElementById('resetSuccess').style.display = 'none';
}

/**
 * Close password reset modal
 */
function closeResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    modal.classList.remove('show');
    modal.style.display = 'none';
}

/**
 * Handle password reset request (Step 1)
 */
async function handleRequestReset() {
    const email = document.getElementById('resetEmail').value;
    const errorDiv = document.getElementById('resetError');
    const successDiv = document.getElementById('resetSuccess');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (!email) {
        errorDiv.textContent = 'Please enter your email address.';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/v1/auth/request-password-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        successDiv.textContent = data.message || 'If that email exists, a reset link has been sent.';
        successDiv.style.display = 'block';
        
        // If in dev/test mode and token is returned, auto-fill step 2
        if (data.resetToken) {
            document.getElementById('resetToken').value = data.resetToken;
            setTimeout(() => {
                document.getElementById('resetStep1').style.display = 'none';
                document.getElementById('resetStep2').style.display = 'block';
            }, 1500);
        }
    } catch (error) {
        errorDiv.textContent = 'Failed to send reset request. Please try again.';
        errorDiv.style.display = 'block';
    }
}

/**
 * Handle password reset with token (Step 2)
 */
async function handleResetPassword() {
    const token = document.getElementById('resetToken').value;
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetNewPasswordConfirm').value;
    const errorDiv = document.getElementById('resetStep2Error');
    const successDiv = document.getElementById('resetStep2Success');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (!token) {
        errorDiv.textContent = 'Reset token is required.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match.';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/v1/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            errorDiv.textContent = data.error || 'Failed to reset password.';
            errorDiv.style.display = 'block';
            return;
        }
        
        successDiv.textContent = 'Password reset successfully! You can now sign in.';
        successDiv.style.display = 'block';
        
        setTimeout(() => {
            closeResetPasswordModal();
            showLoginModal();
        }, 2000);
    } catch (error) {
        errorDiv.textContent = 'Failed to reset password. Please try again.';
        errorDiv.style.display = 'block';
    }
}

/**
 * Handle user login
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    try {
        errorDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
        
        await authService.login(email, password);
        
        closeLoginModal();
        updateAuthUI();
        showSection('marketplace');
        alert('✓ Welcome! You are now signed in.');
    } catch (error) {
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
    }
}

// --- Stripe Elements Setup for Signup ---
let stripeInstance = null;
let stripeCardElement = null;

function initStripeElements() {
    if (stripeInstance) return; // already initialized
    // Fetch publishable key from server config
    fetch('/v1/payments/config')
        .then(r => r.json())
        .then(data => {
            stripeInstance = Stripe(data.publishableKey);
            const elements = stripeInstance.elements();
            stripeCardElement = elements.create('card', {
                style: {
                    base: {
                        fontSize: '16px',
                        color: '#32325d',
                        '::placeholder': { color: '#aab7c4' }
                    },
                    invalid: { color: '#fa755a' }
                }
            });
        })
        .catch(err => {
            console.error('Failed to load Stripe config:', err);
        });
}

// Mount Stripe card element when signup modal opens
function mountStripeCard() {
    if (!stripeInstance) initStripeElements();
    const container = document.getElementById('stripe-card-element');
    if (stripeCardElement && container && !container.hasChildNodes()) {
        stripeCardElement.mount('#stripe-card-element');
    }
}

// Mount Stripe card element as soon as DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Try to mount immediately
    mountStripeCard();
    // Watch only the signup modal for Stripe card element insertion
    const signupModal = document.getElementById('signupModal');
    if (signupModal) {
        const observer = new MutationObserver(() => {
            const container = document.getElementById('stripe-card-element');
            if (container && !container.hasChildNodes()) {
                mountStripeCard();
                observer.disconnect(); // Stop watching after successful mount
            }
        });
        observer.observe(signupModal, { childList: true, subtree: true });
    }
});

/**
 * 3-Step Signup Wizard
 * Step 1: Account details → send email verification code
 * Step 2: Enter 6-digit code → verify email
 * Step 3: Credit card → $1 charge → create account
 */

// Signup wizard state
let signupWizardState = {
    step: 1,
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roles: [],
    emailVerificationId: null,
    city: '',
    state: '',
    zip: '',
};

function resetSignupWizard() {
    signupWizardState = { step: 1, email: '', password: '', firstName: '', lastName: '', roles: [], emailVerificationId: null, city: '', state: '', zip: '' };
    goToSignupStep(1);
}

function goToSignupStep(step) {
    signupWizardState.step = step;
    document.getElementById('signupStep1Form').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('signupStep2Form').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('signupStep3Form').style.display = step === 3 ? 'block' : 'none';
    document.getElementById('signupError').style.display = 'none';
    
    // Update step dots
    document.querySelectorAll('.signup-step-dot').forEach(dot => {
        const dotStep = parseInt(dot.dataset.step);
        dot.style.background = dotStep <= step ? 'var(--primary)' : 'var(--border)';
    });

    // Mount Stripe card element when entering step 3
    if (step === 3) {
        setTimeout(() => mountStripeCard(), 100);
    }
}

/**
 * Step 1: Validate form + send verification code
 */
async function handleSignupStep1(event) {
    event.preventDefault();
    
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const firstName = document.getElementById('signupFirstName').value.trim();
    const lastName = document.getElementById('signupLastName').value.trim();
    const roleCheckboxes = document.querySelectorAll('#signupStep1Form input[name="roles"]:checked');
    
    const errorDiv = document.getElementById('signupError');
    const roleErrorDiv = document.getElementById('signupRoleError');
    const submitBtn = document.getElementById('signupStep1Btn');
    
    try {
        // Validation
        if (password !== passwordConfirm) {
            errorDiv.textContent = 'Passwords do not match.';
            errorDiv.style.display = 'block';
            return;
        }
        if (password.length < 8) {
            errorDiv.textContent = 'Password must be at least 8 characters.';
            errorDiv.style.display = 'block';
            return;
        }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            errorDiv.textContent = 'Password must contain at least one uppercase letter, one lowercase letter, and one number.';
            errorDiv.style.display = 'block';
            return;
        }
        if (roleCheckboxes.length === 0) {
            roleErrorDiv.style.display = 'block';
            return;
        }
        
        errorDiv.style.display = 'none';
        roleErrorDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending code...';
        
        // Send verification code
        const res = await fetch('/v1/auth/send-verification-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
        
        // Save wizard state
        signupWizardState.email = email;
        signupWizardState.password = password;
        signupWizardState.firstName = firstName;
        signupWizardState.lastName = lastName;
        signupWizardState.roles = Array.from(roleCheckboxes).map(cb => cb.value);
        signupWizardState.city = document.getElementById('signupCity').value.trim();
        signupWizardState.state = document.getElementById('signupState').value;
        signupWizardState.zip = document.getElementById('signupZip').value.trim();
        
        // Dev mode: auto-fill code
        if (data.code) {
            setTimeout(() => {
                document.getElementById('signupVerifyCode').value = data.code;
            }, 500);
        }
        
        // Show step 2
        document.getElementById('signupVerifyEmailDisplay').textContent = email;
        goToSignupStep(2);
        
    } catch (error) {
        errorDiv.textContent = error.message || 'Failed to send verification code.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Verification Code';
    }
}

/**
 * Step 2: Verify the 6-digit code
 */
async function handleSignupStep2(event) {
    event.preventDefault();
    
    const code = document.getElementById('signupVerifyCode').value.trim();
    const errorDiv = document.getElementById('signupError');
    const submitBtn = document.getElementById('signupStep2Btn');
    
    try {
        if (!code || code.length !== 6) {
            errorDiv.textContent = 'Please enter the 6-digit code.';
            errorDiv.style.display = 'block';
            return;
        }
        
        errorDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';
        
        const res = await fetch('/v1/auth/verify-email-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: signupWizardState.email, code })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verification failed');
        
        signupWizardState.emailVerificationId = data.emailVerificationId;
        
        // Show step 3
        document.getElementById('signupVerifiedEmailDisplay').textContent = signupWizardState.email;
        goToSignupStep(3);
        
    } catch (error) {
        errorDiv.textContent = error.message || 'Verification failed.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify Email';
    }
}

/**
 * Step 3: Card verification + $1 charge + create account
 */
async function handleSignupStep3(event) {
    event.preventDefault();
    
    const errorDiv = document.getElementById('signupError');
    const cardErrorDiv = document.getElementById('card-errors');
    const submitBtn = document.getElementById('signupStep3Btn');
    
    try {
        errorDiv.style.display = 'none';
        if (cardErrorDiv) cardErrorDiv.textContent = '';
        
        if (!stripeInstance || !stripeCardElement) {
            throw new Error('Payment system not loaded. Please refresh and try again.');
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying card...';
        
        // 1. Create a SetupIntent on the backend
        const setupRes = await fetch('/v1/payments/create-setup-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: signupWizardState.email, 
                firstName: signupWizardState.firstName, 
                lastName: signupWizardState.lastName 
            })
        });
        
        if (!setupRes.ok) {
            const err = await setupRes.json();
            throw new Error(err.error || 'Failed to initialize payment setup');
        }
        
        const { clientSecret, customerId } = await setupRes.json();
        
        // 2. Confirm card setup with Stripe
        const { error: stripeError, setupIntent } = await stripeInstance.confirmCardSetup(clientSecret, {
            payment_method: {
                card: stripeCardElement,
                billing_details: {
                    name: `${signupWizardState.firstName} ${signupWizardState.lastName}`.trim(),
                    email: signupWizardState.email
                }
            }
        });
        
        if (stripeError) {
            if (cardErrorDiv) cardErrorDiv.textContent = stripeError.message;
            throw new Error(stripeError.message);
        }
        
        if (setupIntent.status !== 'succeeded') {
            throw new Error('Card verification failed. Please try again.');
        }
        
        // 3. Charge $1.00 verification fee
        submitBtn.textContent = 'Processing $1.00 verification...';
        
        const chargeRes = await fetch('/v1/payments/signup-charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId, email: signupWizardState.email })
        });
        
        if (!chargeRes.ok) {
            const err = await chargeRes.json();
            throw new Error(err.error || 'Verification charge failed. Please try a different card.');
        }
        
        // 4. Create the account
        submitBtn.textContent = 'Creating account...';
        
        await authService.register({
            email: signupWizardState.email,
            password: signupWizardState.password,
            firstName: signupWizardState.firstName,
            lastName: signupWizardState.lastName,
            roles: signupWizardState.roles,
            stripeCustomerId: customerId,
            emailVerificationId: signupWizardState.emailVerificationId,
            city: signupWizardState.city,
            state: signupWizardState.state,
            zipCode: signupWizardState.zip,
        });
        
        closeSignupModal();
        updateAuthUI();
        showSection('marketplace');
        alert('✓ Account created successfully! Welcome to PipeDream Marketplace.');
    } catch (error) {
        errorDiv.textContent = error.message || 'Signup failed. Please try again.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account ($1.00)';
    }
}

/**
 * Resend verification code
 */
async function resendVerificationCode(event) {
    if (event) event.preventDefault();
    const errorDiv = document.getElementById('signupError');
    
    try {
        const res = await fetch('/v1/auth/send-verification-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: signupWizardState.email })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to resend code');
        
        // Clear old code from input so user knows to enter the new one
        const codeInput = document.getElementById('signupVerifyCode');
        if (codeInput) codeInput.value = '';
        
        // Dev mode: auto-fill code
        if (data.code) {
            if (codeInput) codeInput.value = data.code;
        }
        
        errorDiv.textContent = '✓ New code sent! Check your email for the new 6-digit code.';
        errorDiv.style.color = 'var(--success, green)';
        errorDiv.style.display = 'block';
        setTimeout(() => { 
            errorDiv.style.display = 'none'; 
            errorDiv.style.color = 'var(--danger)'; 
        }, 5000);
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
}

/**
 * Handle user logout
 */
async function handleLogout() {
    if (confirm('Are you sure you want to sign out?')) {
        await authService.logout();
        updateAuthUI();
        closeUserMenu();
        showSection('marketplace');
        alert('✓ You have been signed out.');
    }
}

/**
 * Update authentication UI based on login state
 */
function updateAuthUI() {
    const authLoggedOut = document.getElementById('authLoggedOut');
    const authLoggedIn = document.getElementById('authLoggedIn');
    const userDisplayName = document.getElementById('userDisplayName');
    const userDisplayNameSmall = document.getElementById('userDisplayNameSmall');
    const cartBtn = document.getElementById('cartBtn');
    
    if (authService.isAuthenticated()) {
        const user = authService.getUser();
        authLoggedOut.style.display = 'none';
        authLoggedIn.style.display = 'flex';
        if (cartBtn) cartBtn.style.display = '';
        const displayName = user.firstName || user.email;
        userDisplayName.textContent = displayName;

        // Connect WebSocket for real-time messaging & notifications
        if (window.wsClient) window.wsClient.connect();
        if (userDisplayNameSmall) {
            userDisplayNameSmall.textContent = displayName;
        }
        loadDashboard();
    } else {
        authLoggedOut.style.display = 'flex';
        authLoggedIn.style.display = 'none';
        if (cartBtn) cartBtn.style.display = 'none';

        // Disconnect WebSocket on logout
        if (window.wsClient) window.wsClient.disconnect();
    }
}

/**
 * Toggle user dropdown menu
 */
function toggleUserMenu() {
    const userDropdown = document.getElementById('userDropdown');
    const isVisible = userDropdown.style.display === 'block';
    userDropdown.style.display = isVisible ? 'none' : 'block';
}

/**
 * Close user dropdown menu
 */
function closeUserMenu() {
    document.getElementById('userDropdown').style.display = 'none';
}

/**
 * Toggle user dropdown menu in account navbar
 */
function toggleUserMenuInAccount() {
    const userDropdown = document.getElementById('userDropdownAccount');
    const isVisible = userDropdown.style.display === 'block';
    userDropdown.style.display = isVisible ? 'none' : 'block';
}

/**
 * Close user dropdown menu in account navbar
 */
function closeUserMenuInAccount() {
    document.getElementById('userDropdownAccount').style.display = 'none';
}

/**
 * Contact Us Modal Functions
 */

let contactCaptchaAnswer = 0;  // Store the correct answer

function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let answer;
    if (operation === '+') {
        answer = num1 + num2;
    } else if (operation === '-') {
        answer = num1 - num2;
    } else {
        answer = num1 * num2;
    }
    
    contactCaptchaAnswer = answer;
    const questionEl = document.getElementById('captchaQuestion');
    if (questionEl) {
        questionEl.textContent = `What is ${num1} ${operation} ${num2}?`;
    }
}

function showContactUsModal() {
    const modal = document.getElementById('contactUsModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        generateCaptcha();
        
        // Clear form
        document.getElementById('contactForm').reset();
        document.getElementById('contactError').style.display = 'none';
        document.getElementById('contactSuccess').style.display = 'none';
        
        // Pre-fill email if user is logged in
        const authService = window.authService;
        if (authService && authService.user && authService.user.email) {
            document.getElementById('contactEmail').value = authService.user.email;
            document.getElementById('contactName').value = authService.user.firstName + ' ' + authService.user.lastName;
        }
    }
}

function closeContactUsModal() {
    const modal = document.getElementById('contactUsModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

function handleContactSubmit(event) {
    event.preventDefault();
    
    const captchaInput = parseInt(document.getElementById('captchaAnswer').value);
    const errorEl = document.getElementById('contactError');
    const successEl = document.getElementById('contactSuccess');
    
    // Verify CAPTCHA
    if (captchaInput !== contactCaptchaAnswer) {
        errorEl.textContent = '❌ Incorrect answer to the security question. Please try again.';
        errorEl.style.display = 'block';
        generateCaptcha();
        document.getElementById('captchaAnswer').value = '';
        return;
    }
    
    // Gather form data
    const formData = {
        name: document.getElementById('contactName').value,
        email: document.getElementById('contactEmail').value,
        subject: document.getElementById('contactSubject').value,
        message: document.getElementById('contactMessage').value,
        timestamp: new Date().toISOString()
    };
    
    // In production, this would send to backend API
    // For now, we'll log it and show a success message
    // Simulate sending email
    // In real implementation, call: POST /api/contact or similar
    errorEl.style.display = 'none';
    successEl.style.display = 'block';
    
    // Clear form
    document.getElementById('contactForm').reset();
    generateCaptcha();
    
    // Close modal after 2 seconds
    setTimeout(() => {
        closeContactUsModal();
    }, 2000);
}

// Close contact modal when clicking outside
document.addEventListener('click', (e) => {
    const contactModal = document.getElementById('contactUsModal');
    if (contactModal && e.target === contactModal) {
        closeContactUsModal();
    }
});


document.addEventListener('click', (e) => {
    const userMenu = document.getElementById('authLoggedIn');
    const userDropdown = document.getElementById('userDropdown');
    const profileBtn = document.querySelector('.user-profile-btn');
    
    if (userMenu && userDropdown && profileBtn) {
        // Only close if click is outside the user menu
        if (!userMenu.contains(e.target)) {
            userDropdown.style.display = 'none';
        }
    }
    
    // Also close account navbar dropdown
    const userDropdownAccount = document.getElementById('userDropdownAccount');
    const userProfileBtnSmall = document.querySelector('.user-profile-btn-small');
    if (userDropdownAccount && userProfileBtnSmall) {
        if (!userProfileBtnSmall.contains(e.target) && !userDropdownAccount.contains(e.target)) {
            userDropdownAccount.style.display = 'none';
        }
    }
});

// Prevent dropdown links from closing immediately
document.addEventListener('DOMContentLoaded', function() {
    const dropdownLinks = document.querySelectorAll('.user-dropdown a');
    dropdownLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Allow default behavior to happen but don't prevent it
        });
    });
});

/**
 * Handle profile update
 */
async function handleProfileUpdate(event) {
    event.preventDefault();
    
    const firstName = document.getElementById('settingsFirstName').value;
    const lastName = document.getElementById('settingsLastName').value;
    const phone = document.getElementById('settingsPhone').value;
    const errorDiv = document.getElementById('profileError');
    const successDiv = document.getElementById('profileSuccess');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    try {
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        
        await authService.updateProfile({
            firstName,
            lastName,
            phone: phone || undefined
        });
        
        successDiv.style.display = 'block';
        setTimeout(() => successDiv.style.display = 'none', 5000);
    } catch (error) {
        errorDiv.textContent = error.message || 'Failed to update profile.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
    }
}

/**
 * Handle password change
 */
async function handlePasswordChange(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    const errorDiv = document.getElementById('passwordError');
    const successDiv = document.getElementById('passwordSuccess');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    try {
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'New passwords do not match.';
            errorDiv.style.display = 'block';
            return;
        }
        
        if (newPassword.length < 8) {
            errorDiv.textContent = 'New password must be at least 8 characters.';
            errorDiv.style.display = 'block';
            return;
        }
        
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Changing password...';
        
        await authService.changePassword(currentPassword, newPassword);
        
        successDiv.style.display = 'block';
        document.getElementById('passwordForm').reset();
        setTimeout(() => successDiv.style.display = 'none', 5000);
    } catch (error) {
        errorDiv.textContent = error.message || 'Failed to change password.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Change Password';
    }
}

/**
 * Load dashboard data
 */
async function loadDashboard() {
    if (!authService.isAuthenticated()) {
        return;
    }
    
    const user = authService.getUser();
    const welcomeEl = document.getElementById('dashboardWelcome');
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome back, ${user.firstName}!`;
    }
    
    // Load profile settings
    const accountIdField = document.getElementById('settingsAccountId');
    if (accountIdField) accountIdField.value = user.id || '';
    document.getElementById('settingsEmail').value = user.email || '';
    document.getElementById('settingsFirstName').value = user.firstName || '';
    document.getElementById('settingsLastName').value = user.lastName || '';
    document.getElementById('settingsPhone').value = user.phone || '';
    
    // Show products tab for designers
    const productsTabBtn = document.getElementById('productsTabBtn');
    if (productsTabBtn && user.role === 'designer') {
        productsTabBtn.style.display = 'block';
    }
    
    // Show materials/gizmos tabs based on registered services
    const regServices = JSON.parse(localStorage.getItem('registeredServices') || '{}');
    const myMaterialsTabBtn = document.getElementById('myMaterialsTabBtn');
    if (myMaterialsTabBtn && regServices.materials) {
        myMaterialsTabBtn.style.display = 'block';
    }
    const myGizmosTabBtn = document.getElementById('myGizmosTabBtn');
    if (myGizmosTabBtn && regServices.gizmo) {
        myGizmosTabBtn.style.display = 'block';
    }
    // Also show products tab if designer is registered
    if (productsTabBtn && regServices.designer) {
        productsTabBtn.style.display = 'block';
    }
    
    // Show "My Listings" section header if any listing tab is visible
    const listingsSection = document.getElementById('listingsSection');
    if (listingsSection) {
        const anyListingVisible = (productsTabBtn && productsTabBtn.style.display !== 'none') ||
            (myMaterialsTabBtn && myMaterialsTabBtn.style.display !== 'none') ||
            (myGizmosTabBtn && myGizmosTabBtn.style.display !== 'none');
        listingsSection.style.display = anyListingVisible ? 'block' : 'none';
    }
    
    // Show producer queue tabs for producers
    const producerQueueTabBtn = document.getElementById('producerQueueTabBtn');
    const myBidsTabBtn = document.getElementById('myBidsTabBtn');
    if (user.role === 'producer') {
        if (producerQueueTabBtn) producerQueueTabBtn.style.display = 'block';
        if (myBidsTabBtn) myBidsTabBtn.style.display = 'block';
    }
    
    // Show admin dashboard for admins
    const adminTabBtn = document.getElementById('adminTabBtn');
    if (adminTabBtn && (user.role === 'admin' || user.isStaff)) {
        adminTabBtn.style.display = 'block';
    }
    
    // Show sales history for designers/producers/anyone with registered services
    const salesHistoryTabBtn = document.getElementById('salesHistoryTabBtn');
    if (salesHistoryTabBtn) {
        const isSeller = user.role === 'designer' || user.role === 'producer' || regServices.designer || regServices.producer || regServices.materials || regServices.gizmo;
        if (isSeller) salesHistoryTabBtn.style.display = 'block';
    }
    
    // Load orders and Requests for Bid
    loadPurchaseHistory();
    loadInProcessOrders();
    loadActiveRFBs();
    loadMyBids();
}

/**
 * Load purchase history from API
 */
async function loadPurchaseHistory() {
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    try {
        const response = await apiFetch('/v1/orders?status=delivered,completed,cancelled,refunded');
        if (response.ok) {
            const data = await response.json();
            const orders = data.orders || [];
            if (orders.length === 0) {
                ordersList.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No purchase history yet</td></tr>';
            } else {
                ordersList.innerHTML = orders.map(order => `
                    <tr>
                        <td>${escapeHtml(order.orderNumber || order.id)}</td>
                        <td>${escapeHtml(order.productName || 'Order')}</td>
                        <td>${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}</td>
                        <td>$${parseFloat(order.totalAmount || 0).toFixed(2)}</td>
                        <td><span style="color: ${order.status === 'delivered' || order.status === 'completed' ? 'var(--success)' : 'var(--text-secondary)'};">${order.status === 'delivered' || order.status === 'completed' ? '✓' : '•'} ${escapeHtml(order.status || 'Unknown')}</span></td>
                    </tr>
                `).join('');
            }
        } else {
            ordersList.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No purchase history yet</td></tr>';
        }
    } catch (err) {
        console.warn('Failed to load purchase history:', err.message);
        ordersList.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No purchase history yet</td></tr>';
    }
}

/**
 * Load in-process orders from API
 */
async function loadInProcessOrders() {
    const inprocessList = document.getElementById('inprocessList');
    if (!inprocessList) return;
    try {
        const response = await apiFetch('/v1/orders?status=in_progress,production,shipped');
        if (response.ok) {
            const data = await response.json();
            const orders = data.orders || data || [];
            if (orders.length === 0) {
                inprocessList.innerHTML = '<div style="text-align: center; padding: 20px; grid-column: 1/-1;">No orders in process</div>';
            } else {
                inprocessList.innerHTML = orders.map(order => `
                    <div class="project-card">
                        <h4>${escapeHtml(order.items?.[0]?.productName || 'Order')}</h4>
                        <p>Status: ${escapeHtml(order.status || 'In Progress')}</p>
                        <p>Placed: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}</p>
                    </div>
                `).join('');
            }
        } else {
            inprocessList.innerHTML = '<div style="text-align: center; padding: 20px; grid-column: 1/-1;">No orders in process</div>';
        }
    } catch (err) {
        console.warn('Failed to load in-process orders:', err.message);
        inprocessList.innerHTML = '<div style="text-align: center; padding: 20px; grid-column: 1/-1;">No orders in process</div>';
    }
}

/**
 * Load active Requests for Bid from API
 */
async function loadActiveRFBs() {
    const rfbsList = document.getElementById('rfbsList');
    if (!rfbsList) return;
    try {
        const response = await apiFetch('/v1/orders/my-rfbs');
        if (response.ok) {
            const data = await response.json();
            const projects = data.projects || [];
            if (projects.length === 0) {
                rfbsList.innerHTML = `<div style="text-align: center; padding: 20px; grid-column: 1/-1;">
                    <p style="color: var(--text-secondary); margin-bottom: 12px;">No custom projects yet</p>
                    <button class="btn-primary" onclick="postNewProject()">➕ Create New Request for Bids</button>
                </div>`;
            } else {
                rfbsList.innerHTML = projects.map(p => `
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4 style="margin: 0;">${escapeHtml(p.title)}</h4>
                            <span class="badge badge-${p.status}">${p.status}</span>
                        </div>
                        <p style="color: var(--text-secondary); margin: 8px 0; font-size: 14px;">${escapeHtml(p.description).substring(0, 200)}${p.description.length > 200 ? '...' : ''}</p>
                        <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-secondary);">
                            <span>💰 Budget: $${parseFloat(p.budget).toFixed(2)}</span>
                            <span>📅 ${new Date(p.createdAt).toLocaleDateString()}</span>
                            <span>#${p.orderNumber}</span>
                        </div>
                    </div>
                `).join('') + `<div style="text-align: center; padding: 12px;"><button class="btn-primary" onclick="postNewProject()">➕ Create New Request for Bids</button></div>`;
            }
        } else {
            rfbsList.innerHTML = `<div style="text-align: center; padding: 20px; grid-column: 1/-1;">
                <p style="color: var(--text-secondary); margin-bottom: 12px;">No custom projects yet</p>
                <button class="btn-primary" onclick="postNewProject()">➕ Create New Request for Bids</button>
            </div>`;
        }
    } catch (err) {
        console.warn('Failed to load RFBs:', err.message);
        rfbsList.innerHTML = '<div style="text-align: center; padding: 20px; grid-column: 1/-1;">No custom projects yet</div>';
    }
}

/**
 * Load user's bids from API
 */
async function loadMyBids() {
    const bidsList = document.getElementById('bidsList');
    if (!bidsList) return;
    try {
        const response = await apiFetch('/v1/bids/my-bids');
        if (response.ok) {
            const data = await response.json();
            const bids = data.bids || [];
            if (bids.length === 0) {
                bidsList.innerHTML = '<div style="text-align: center; padding: 40px; background: var(--bg-secondary); border-radius: 8px;"><p style="color: var(--text-secondary);">No bids yet</p></div>';
            } else {
                bidsList.innerHTML = bids.filter(b => !b.archived).map(bid => {
                    const statusColors = { pending: 'var(--warning)', accepted: 'var(--success)', rejected: 'var(--danger)', in_production: 'var(--info, #3b82f6)', ready_to_ship: '#8b5cf6', shipped: '#06b6d4', delivered: 'var(--success)', completed: 'var(--success)' };
                    const statusColor = statusColors[bid.status] || 'var(--text-secondary)';
                    const progress = bid.progressPercent || 0;
                    const progressLabels = { 0: 'Not Started', 20: 'In Production', 40: 'Progressing', 60: 'Ready to Ship', 80: 'Shipped', 100: 'Delivered' };
                    const progressLabel = progressLabels[progress] || `${progress}%`;

                    let progressUI = '';
                    if (['accepted','in_production','ready_to_ship','shipped','delivered','completed'].includes(bid.status)) {
                        progressUI = `
                            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <strong style="font-size: 13px;">Progress: ${progressLabel}</strong>
                                    <span style="font-size: 12px; color: var(--text-secondary);">${progress}%</span>
                                </div>
                                <div style="background: var(--bg-tertiary, #e5e7eb); border-radius: 8px; height: 8px; overflow: hidden;">
                                    <div style="background: ${statusColor}; height: 100%; width: ${progress}%; transition: width 0.3s;"></div>
                                </div>
                                ${bid.progressNote ? `<p style="font-size: 12px; color: var(--text-secondary); margin-top: 6px; font-style: italic;">"${escapeHtml(bid.progressNote)}"</p>` : ''}
                                <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                                    ${[20,40,60,80,100].map(pct => `<button class="btn-small ${progress >= pct ? 'btn-success' : ''}" onclick="updateBidProgress('${bid.id}', ${pct})" style="font-size: 11px; padding: 4px 8px;" title="${progressLabels[pct]}">${pct}%</button>`).join('')}
                                    <button class="btn-small" onclick="promptBidProgressNote('${bid.id}')" style="font-size: 11px; padding: 4px 8px;" title="Add a status note">📝 Note</button>
                                </div>
                            </div>`;
                    }

                    return `
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <h4 style="margin: 0;">${escapeHtml(bid.order?.orderNumber || 'Order')}</h4>
                                <span style="font-size: 13px; color: var(--text-secondary);">Producer: ${escapeHtml(bid.producerName || 'Unknown')}</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="background: ${statusColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${bid.status.replace(/_/g, ' ').toUpperCase()}</span>
                                <button class="btn-small" onclick="archiveBid('${bid.id}')" title="Archive this bid" style="font-size: 11px; padding: 4px 8px;">📦 Archive</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 16px; margin-top: 10px; font-size: 13px; color: var(--text-secondary); flex-wrap: wrap;">
                            <span>💰 Quoted: $${parseFloat(bid.quotedPrice).toFixed(2)}</span>
                            <span>📅 Lead: ${bid.leadTimeDays} days</span>
                            <span>🕐 ${new Date(bid.createdAt).toLocaleDateString()}</span>
                            ${bid.expiresAt ? `<span>⏰ Expires: ${new Date(bid.expiresAt).toLocaleDateString()}</span>` : ''}
                        </div>
                        ${bid.message ? `<p style="margin-top: 8px; font-size: 13px; padding: 8px; background: var(--bg-tertiary, #f3f4f6); border-radius: 6px;">"${escapeHtml(bid.message)}"</p>` : ''}
                        ${progressUI}
                    </div>`;
                }).join('');
            }
        } else {
            bidsList.innerHTML = '<div style="text-align: center; padding: 40px; background: var(--bg-secondary); border-radius: 8px;"><p style="color: var(--text-secondary);">No bids yet</p></div>';
        }
    } catch (err) {
        console.warn('Failed to load bids:', err.message);
        bidsList.innerHTML = '<div style="text-align: center; padding: 40px; background: var(--bg-secondary); border-radius: 8px;"><p style="color: var(--text-secondary);">No bids yet</p></div>';
    }
}

// Bid progress update helper
async function updateBidProgress(bidId, percent) {
    try {
        const resp = await apiFetch(`/v1/bids/${bidId}/progress`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progressPercent: percent }),
        });
        if (!resp.ok) {
            const d = await resp.json();
            alert(d.error || 'Failed to update progress');
            return;
        }
        loadMyBids(); // Refresh
    } catch (err) {
        alert('Failed to update progress: ' + err.message);
    }
}

// Prompt for progress note
function promptBidProgressNote(bidId) {
    const note = prompt('Enter a status update note:');
    if (note === null) return;
    apiFetch(`/v1/bids/${bidId}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPercent: 20, progressNote: note }),
    }).then(resp => {
        if (resp.ok) loadMyBids();
        else resp.json().then(d => alert(d.error || 'Failed'));
    }).catch(err => alert(err.message));
}

// Archive bid
async function archiveBid(bidId) {
    try {
        const resp = await apiFetch(`/v1/bids/${bidId}/archive`, { method: 'PATCH' });
        if (resp.ok) {
            if (typeof showToast === 'function') showToast('Bid archived', 'success');
            loadMyBids();
        } else {
            const d = await resp.json();
            alert(d.error || 'Failed to archive');
        }
    } catch (err) {
        alert('Failed to archive: ' + err.message);
    }
}

/**
 * Show dashboard tab
 */
function showDashboardTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.dashboard-tab').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Remove active class from all sidebar items
    document.querySelectorAll('.account-sidebar .sidebar-nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const tabEl = document.getElementById(tabName + 'Tab');
    if (tabEl) {
        tabEl.style.display = 'block';
    }
    
    // Mark sidebar item as active by data-tab attribute
    const activeSidebarItem = document.querySelector(`.account-sidebar .sidebar-nav-item[data-tab="${tabName}"]`);
    if (activeSidebarItem) {
        activeSidebarItem.classList.add('active');
    }
    
    // Load data for specific tabs
    if (tabName === 'bids') {
        loadUserBids();
    } else if (tabName === 'salesHistory') {
        loadSalesHistory();
    } else if (tabName === 'products') {
        productsModule.loadProducts();
    } else if (tabName === 'myMaterials') {
        loadMyMaterials();
    } else if (tabName === 'myGizmos') {
        loadMyGizmos();
    } else if (tabName === 'producerQueue') {
        producerQueueModule.loadAvailableOrders();
    } else if (tabName === 'myBids') {
        producerQueueModule.loadMyBids();
    } else if (tabName === 'messaging') {
        messagingModule.displayConversations();
        messagingModule.loadFeeSummary();
    } else if (tabName === 'search') {
        searchModule.initSearchModule();
        searchModule.populateCapabilityFilters('designer');
        searchModule.displayRecommendations();
    } else if (tabName === 'notifications') {
        notificationsModule.displayNotifications();
        notificationsModule.loadUnreadCount();
    } else if (tabName === 'admin') {
        adminModule.loadAdminDashboard();
    }
}


/**
 * Display favorites modal
 */
function displayFavoritesModal() {
    const modal = document.getElementById('favoritesModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Close modal when clicking outside
 */
document.addEventListener('DOMContentLoaded', function() {
    const favoriteModal = document.getElementById('favoritesModal');
    const savedSearchModal = document.getElementById('savedSearchesModal');
    
    if (favoriteModal) {
        favoriteModal.addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    }
    
    if (savedSearchModal) {
        savedSearchModal.addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    }
});

// Modal helper functions
function closeModal() {
    const modal = document.getElementById('businessModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * Update product price when producer is changed
 * @param {Event} event - The change event from dropdown
 * @param {number} productId - The product ID
 */
function updateProductPrice(event, productId) {
    const selectedIndex = parseInt(event.target.value);
    const product = mockProducts.find(p => p.id === productId);
    
    if (!product || !product.biddingProducers) return;
    
    // Get the selected producer
    const selectedProducer = product.biddingProducers[selectedIndex];
    product.selectedProducer = selectedProducer;
    product.totalPrice = product.designFee + selectedProducer.quote;
    
    // Update the price display
    const productBody = document.querySelector(`[data-product-id="${productId}"]`);
    if (productBody) {
        // Update price
        const priceElement = productBody.querySelector('.product-price');
        if (priceElement) {
            priceElement.textContent = `$${product.totalPrice.toFixed(2)}`;
        }
        
        // Update price breakdown
        const breakdown = productBody.querySelector('.price-breakdown');
        if (breakdown) {
            breakdown.textContent = `Design: $${product.designFee.toFixed(2)} + Production: $${selectedProducer.quote.toFixed(2)}`;
        }
        
        // Update the cart button
        const cartBtn = productBody.querySelector('.btn-primary');
        if (cartBtn) {
            cartBtn.setAttribute('onclick', `addToCart(${productId}, '${product.name}', ${product.totalPrice})`);
            cartBtn.dataset.price = product.totalPrice;
        }
    }
}

/**
 * Post a new custom project Request for Bid
 */
function postNewProject() {
    if (typeof requireAuth === 'function' && !requireAuth('post a project request')) return;
    
    // Build and show a modal form for creating a custom project RFB
    const existingModal = document.getElementById('rfbCreateModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'rfbCreateModal';
    modal.className = 'modal show';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close" onclick="document.getElementById('rfbCreateModal').remove()">&times;</span>
            <h2>📋 Create New Request for Bids</h2>
            <p style="color: var(--text-secondary); margin-bottom: 16px;">Post your custom project. Producers will submit bids. <strong>Posting fee: $1.00</strong></p>
            <form id="rfbForm" style="display: flex; flex-direction: column; gap: 14px;">
                <div>
                    <label style="font-weight: 600;">Project Title *</label>
                    <input type="text" id="rfbTitle" required placeholder="e.g. Custom PCB Assembly" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                </div>
                <div>
                    <label style="font-weight: 600;">Description *</label>
                    <textarea id="rfbDescription" required rows="4" placeholder="Describe your project, materials, specifications..." style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;"></textarea>
                </div>
                <div style="display: flex; gap: 12px;">
                    <div style="flex: 1;">
                        <label style="font-weight: 600;">Budget ($) *</label>
                        <input type="number" id="rfbBudget" required min="1" step="0.01" placeholder="500.00" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-weight: 600;">Deadline</label>
                        <input type="date" id="rfbDeadline" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                    </div>
                </div>
                <div>
                    <label style="font-weight: 600;">Skills Needed for This Project</label>
                    <div id="rfbSkillsCheckboxes" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; font-size: 13px;">
                        <label><input type="checkbox" name="rfbSkill" value="3D Printing"> 🖨️ 3D Printing</label>
                        <label><input type="checkbox" name="rfbSkill" value="CNC Machining"> ⚙️ CNC Machining</label>
                        <label><input type="checkbox" name="rfbSkill" value="Laser Cutting"> 🔆 Laser Cutting</label>
                        <label><input type="checkbox" name="rfbSkill" value="Welding"> 🔥 Welding</label>
                        <label><input type="checkbox" name="rfbSkill" value="Woodworking"> 🪵 Woodworking</label>
                        <label><input type="checkbox" name="rfbSkill" value="Electronics"> 🔌 Electronics</label>
                        <label><input type="checkbox" name="rfbSkill" value="PCB Design"> 🟢 PCB Design</label>
                        <label><input type="checkbox" name="rfbSkill" value="Sewing/Textile"> 🧵 Sewing/Textile</label>
                        <label><input type="checkbox" name="rfbSkill" value="Metalwork"> 🔩 Metalwork</label>
                        <label><input type="checkbox" name="rfbSkill" value="Graphic Design"> 🎨 Graphic Design</label>
                        <label><input type="checkbox" name="rfbSkill" value="CAD/3D Modeling"> 📐 CAD/3D Modeling</label>
                        <label><input type="checkbox" name="rfbSkill" value="Brewing/Fermentation"> 🍺 Brewing</label>
                    </div>
                    <input type="text" id="rfbCapabilities" placeholder="Other skills needed (comma-separated)" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-top: 8px;">
                </div>
                <div id="rfbError" style="color: var(--danger); display: none;"></div>
                <div style="display: flex; gap: 10px; margin-top: 8px;">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('rfbCreateModal').remove()" style="flex: 1;">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex: 1;">Post Request ($1.00 fee)</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('rfbForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('rfbError');
        errEl.style.display = 'none';
        try {
            // Collect checked skills + any typed extras
            const checkedSkills = Array.from(document.querySelectorAll('input[name="rfbSkill"]:checked')).map(cb => cb.value);
            const typedExtras = document.getElementById('rfbCapabilities').value.split(',').map(s => s.trim()).filter(Boolean);
            const allCapabilities = [...new Set([...checkedSkills, ...typedExtras])];

            const body = {
                title: document.getElementById('rfbTitle').value.trim(),
                description: document.getElementById('rfbDescription').value.trim(),
                budget: parseFloat(document.getElementById('rfbBudget').value),
                deadline: document.getElementById('rfbDeadline').value || null,
                requiredCapabilities: allCapabilities,
            };
            const resp = await apiFetch('/v1/orders/custom-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const d = await resp.json();
                throw new Error(d.error || 'Failed to create');
            }
            document.getElementById('rfbCreateModal').remove();
            if (typeof showToast === 'function') showToast('Request for Bids posted successfully!', 'success');
            loadActiveRFBs();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        }
    });
}

/**
 * View full details of a custom project and all bids
 * @param {number} projectId - The project ID
 */
function viewProjectDetails(projectId) {
    const project = mockCustomProjects.find(p => p.id === projectId);
    if (!project) return;
    
    const bidCount = project.bids.length;
    let bidsDisplay = '';
    
    if (bidCount >= 5) {
        const averageBid = project.bids.reduce((sum, bid) => sum + bid.amount, 0) / bidCount;
        bidsDisplay = `📊 Average Bid: $${averageBid.toFixed(2)} (based on ${bidCount} bids)`;
    } else {
        bidsDisplay = `Bids received: ${bidCount}/5 - Amounts hidden until 5 bids reached`;
    }
    
    alert(`Project: ${project.title}\n\n${bidsDisplay}\n\nBidders: ${project.bids.map(b => b.bidderName).join(', ')}`);
}

/**
 * Place a bid on a custom project
 * @param {number} projectId - The project ID
 */
function placeBid(projectId) {
    const project = mockCustomProjects.find(p => p.id === projectId);
    if (!project) return;
    
    alert(`✓ Bid placed for: ${project.title}\n\nBids will be displayed once 5 or more bids are received.`);
}

// ============================================================================
// ACCOUNT SETTINGS TAB FUNCTIONS
// ============================================================================

/**
 * Show specific settings tab
 */
function showSettingsTab(tabName) {
    // Hide all account tabs
    document.querySelectorAll('.settings-tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });
    
    // Remove active class from all sidebar items
    document.querySelectorAll('.account-sidebar .sidebar-nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const tabElement = document.getElementById(tabName + 'Tab');
    if (tabElement) {
        tabElement.classList.add('active');
        tabElement.style.display = 'block';
    }
    
    // Mark sidebar item as active by data-tab attribute
    const activeSidebarItem = document.querySelector(`.account-sidebar .sidebar-nav-item[data-tab="${tabName}"]`);
    if (activeSidebarItem) {
        activeSidebarItem.classList.add('active');
    }

    // Load portfolio gallery when switching to a service tab
    const serviceTabTypes = { designer: 'designer', producer: 'producer', materials: 'materials', authorBooks: 'author', gizmoServices: 'gizmo' };
    if (serviceTabTypes[tabName]) {
        loadPortfolioGallery(serviceTabTypes[tabName]);
    }
}

/**
 * Update the active account navbar tab button
 */
function updateAccountTabButtons(tabType) {
    const buttons = document.querySelectorAll('.account-tabs .account-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (tabType === 'dashboard') {
        buttons[0].classList.add('active');
    } else if (tabType === 'settings') {
        buttons[1].classList.add('active');
    }
}

/**
 * Toggle billing address form based on checkbox
 */
function toggleBillingForm() {
    const checkbox = document.getElementById('billingSameAsShipping');
    const billingFieldset = document.getElementById('billingAddressFieldset');
    const billingInputs = billingFieldset.querySelectorAll('input');
    
    if (checkbox.checked) {
        // Disable billing form and copy shipping values
        billingInputs.forEach(input => {
            input.disabled = true;
            input.required = false;
        });
        copyShippingToBilling();
    } else {
        // Enable billing form
        billingInputs.forEach(input => {
            input.disabled = false;
            input.required = true;
        });
    }
}

/**
 * Copy shipping address to billing address fields
 */
function copyShippingToBilling() {
    document.getElementById('billingStreet').value = document.getElementById('shippingStreet').value;
    document.getElementById('billingCity').value = document.getElementById('shippingCity').value;
    document.getElementById('billingState').value = document.getElementById('shippingState').value;
    document.getElementById('billingZip').value = document.getElementById('shippingZip').value;
    document.getElementById('billingCountry').value = document.getElementById('shippingCountry').value;
}

/**
 * Handle address update - integrates with API backend
 */
async function handleAddressUpdate(event) {
    event.preventDefault();
    const form = event.target;
    const errorEl = document.getElementById('addressError');
    const successEl = document.getElementById('addressSuccess');
    
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    try {
        // Validate shipping address
        const shippingName = document.getElementById('shippingName').value.trim();
        const shippingStreet = document.getElementById('shippingStreet').value.trim();
        const shippingCity = document.getElementById('shippingCity').value.trim();
        const shippingState = document.getElementById('shippingState').value.trim();
        const shippingZip = document.getElementById('shippingZip').value.trim();
        const shippingCountry = document.getElementById('shippingCountry').value.trim();
        
        if (!shippingName || !shippingStreet || !shippingCity || !shippingState || !shippingZip || !shippingCountry) {
            throw new Error('Please complete all shipping address fields');
        }
        
        const billingSameAsShipping = document.getElementById('billingSameAsShipping').checked;
        let billingName = document.getElementById('billingName').value.trim();
        let billingStreet = document.getElementById('billingStreet').value.trim();
        let billingCity = document.getElementById('billingCity').value.trim();
        let billingState = document.getElementById('billingState').value.trim();
        let billingZip = document.getElementById('billingZip').value.trim();
        let billingCountry = document.getElementById('billingCountry').value.trim();
        
        // If billing same as shipping, validate billing fields are not empty
        if (!billingSameAsShipping) {
            if (!billingStreet || !billingCity || !billingState || !billingZip || !billingCountry) {
                throw new Error('Please complete all billing address fields or check "billing same as shipping"');
            }
        } else {
            // Copy shipping to billing if checkbox is checked
            billingName = shippingName;
            billingStreet = shippingStreet;
            billingCity = shippingCity;
            billingState = shippingState;
            billingZip = shippingZip;
            billingCountry = shippingCountry;
        }
        
        // Prepare data for backend
        const addressData = {
            shippingName,
            shippingStreet,
            shippingCity,
            shippingState,
            shippingZip,
            shippingCountry,
            billingName,
            billingStreet,
            billingCity,
            billingState,
            billingZip,
            billingCountry,
            billingSameAsShipping,
        };
        
        // Send to backend
        const token = localStorage.getItem('pds_token');
        if (!token) {
            throw new Error('Not authenticated. Please log in.');
        }
        
        const response = await fetch('/v1/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(addressData),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update addresses');
        }
        
        const result = await response.json();
        
        // Update local user data
        if (authService.currentUser) {
            authService.currentUser = { ...authService.currentUser, ...addressData };
        }
        
        successEl.style.display = 'block';
        
        // Hide success message after 3 seconds
        setTimeout(() => {
            successEl.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        errorEl.textContent = error.message || 'Failed to update addresses';
        errorEl.style.display = 'block';
    }
}


/**
 * Handle designer services update
 */
async function handleDesignerUpdate(event) {
    event.preventDefault();
    const form = event.target;
    const errorEl = document.getElementById('designerError');
    const successEl = document.getElementById('designerSuccess');
    
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    try {
        // Collect selected capabilities
        const selectedCapabilities = Array.from(
            document.querySelectorAll('input[name="designer_capabilities"]:checked')
        ).map(cb => cb.value);
        
        const designer = {
            portfolio: document.getElementById('designerPortfolio').value,
            capabilities: selectedCapabilities,
            specialties: document.getElementById('designerSpecialties').value,
            experience: parseInt(document.getElementById('designerExperience').value) || 0,
            hourlyRate: parseFloat(document.getElementById('designerRate').value) || 0,
        };

        const response = await apiFetch('/v1/auth/me/designer', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(designer),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save');
        }

        successEl.textContent = 'Designer profile saved successfully!';
        successEl.style.display = 'block';
        setTimeout(() => { successEl.style.display = 'none'; }, 3000);
    } catch (error) {
        errorEl.textContent = error.message || 'Failed to update designer profile';
        errorEl.style.display = 'block';
    }
}

/**
 * Handle producer services update
 */
async function handleProducerUpdate(event) {
    event.preventDefault();
    const form = event.target;
    const errorEl = document.getElementById('producerError');
    const successEl = document.getElementById('producerSuccess');
    
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    try {
        // Collect selected capabilities
        const selectedCapabilities = Array.from(
            document.querySelectorAll('input[name="producer_capabilities"]:checked')
        ).map(cb => cb.value);
        
        const producer = {
            specialties: document.getElementById('producerSpecialties').value,
            capabilities: selectedCapabilities,
            minBatch: parseInt(document.getElementById('producerMinBatch').value) || 1,
            capacity: document.getElementById('producerCapacity').value,
            leadTime: parseInt(document.getElementById('producerLeadTime').value) || 30,
            certifications: document.getElementById('producerCertifications').value,
        };

        const response = await apiFetch('/v1/auth/me/producer', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(producer),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save');
        }

        successEl.textContent = 'Producer profile saved successfully!';
        successEl.style.display = 'block';
        setTimeout(() => { successEl.style.display = 'none'; }, 3000);
    } catch (error) {
        errorEl.textContent = error.message || 'Failed to update producer profile';
        errorEl.style.display = 'block';
    }
}

/**
 * Load profile data into settings form — fetches fresh data from API
 */
async function loadProfileData() {
    if (!authService.currentUser) return;
    
    // Fetch full profile from API (login response doesn't include addresses)
    let user = authService.currentUser;
    try {
        const resp = await apiFetch('/v1/auth/me');
        if (resp.ok) {
            const data = await resp.json();
            if (data.user) {
                user = data.user;
                // Update cached user with full data
                authService.currentUser = { ...authService.currentUser, ...user };
                authService.saveToStorage();
            }
        }
    } catch (err) {
        console.warn('Failed to fetch profile from API, using cached data:', err.message);
    }
    
    // Load basic profile
    const accountIdField = document.getElementById('settingsAccountId');
    if (accountIdField) accountIdField.value = user.id || '';
    document.getElementById('settingsEmail').value = user.email || '';
    document.getElementById('settingsFirstName').value = user.firstName || '';
    document.getElementById('settingsLastName').value = user.lastName || '';
    document.getElementById('settingsPhone').value = user.phone || '';
    
    // Load shipping address
    const shippingNameEl = document.getElementById('shippingName');
    if (shippingNameEl) shippingNameEl.value = user.shippingName || `${user.firstName || ''} ${user.lastName || ''}`.trim();
    document.getElementById('shippingStreet').value = user.shippingStreet || '';
    document.getElementById('shippingCity').value = user.shippingCity || '';
    document.getElementById('shippingState').value = user.shippingState || '';
    document.getElementById('shippingZip').value = user.shippingZip || '';
    document.getElementById('shippingCountry').value = user.shippingCountry || '';
    
    // Load billing address
    const billingSameAsShipping = user.billingSameAsShipping || false;
    document.getElementById('billingSameAsShipping').checked = billingSameAsShipping;
    
    const billingNameEl = document.getElementById('billingName');
    if (billingNameEl) billingNameEl.value = user.billingName || '';
    document.getElementById('billingStreet').value = user.billingStreet || '';
    document.getElementById('billingCity').value = user.billingCity || '';
    document.getElementById('billingState').value = user.billingState || '';
    document.getElementById('billingZip').value = user.billingZip || '';
    document.getElementById('billingCountry').value = user.billingCountry || '';
    
    // Apply toggle state
    toggleBillingForm();

    // Load designer profile + capabilities
    loadDesignerProfile();
    // Load producer profile + capabilities
    loadProducerProfile();
    // Load registered services checkboxes
    loadRegisteredServices();
    // Load business identity
    loadBusinessIdentity();
    // Load other service profiles
    loadMaterialsProfile();
    loadAuthorBooksProfile();
    loadGizmoServicesProfile();
}

/**
 * Load business identity from the user profile (already fetched by loadProfileData)
 */
function loadBusinessIdentity() {
    const user = authService.currentUser;
    if (!user) return;
    
    const nameEl = document.getElementById('bizDisplayName');
    if (nameEl) nameEl.value = user.businessName || '';
    const addrEl = document.getElementById('bizAddress');
    if (addrEl) addrEl.value = user.businessAddress || '';
    const cityEl = document.getElementById('bizCity');
    if (cityEl) cityEl.value = user.businessCity || '';
    const stateEl = document.getElementById('bizState');
    if (stateEl) stateEl.value = user.businessState || '';
    const zipEl = document.getElementById('bizZip');
    if (zipEl) zipEl.value = user.businessZip || '';
    
    // Show geocode status if coordinates are present
    const statusEl = document.getElementById('bizGeoStatus');
    if (statusEl && user.businessLatitude && user.businessLongitude) {
        statusEl.textContent = `📍 Coordinates resolved: ${parseFloat(user.businessLatitude).toFixed(4)}, ${parseFloat(user.businessLongitude).toFixed(4)}`;
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--success)';
    }
}

/**
 * Handle business identity save — stored on User, propagated to all service profiles
 */
async function handleBusinessIdentityUpdate(event) {
    event.preventDefault();
    const errorEl = document.getElementById('bizIdError');
    const successEl = document.getElementById('bizIdSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    try {
        const businessName = document.getElementById('bizDisplayName').value.trim();
        const businessAddress = document.getElementById('bizAddress').value.trim();
        const businessCity = document.getElementById('bizCity').value.trim();
        const businessState = document.getElementById('bizState').value.trim();
        const businessZip = document.getElementById('bizZip').value.trim();

        if (!businessName) {
            throw new Error('Please enter a display name');
        }
        if (!businessZip || businessZip.length !== 5) {
            throw new Error('Please enter a valid 5-digit ZIP code');
        }

        const response = await apiFetch('/v1/auth/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessName, businessAddress, businessCity, businessState, businessZip }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save');
        }

        const data = await response.json();
        if (data.user) {
            authService.currentUser = { ...authService.currentUser, ...data.user };
            authService.saveToStorage();
            // Update the city/state fields if they were auto-filled from ZIP
            const cityEl = document.getElementById('bizCity');
            if (cityEl && data.user.businessCity) cityEl.value = data.user.businessCity;
            const stateEl = document.getElementById('bizState');
            if (stateEl && data.user.businessState) stateEl.value = data.user.businessState;
            // Show coordinate status
            const statusEl = document.getElementById('bizGeoStatus');
            if (statusEl && data.user.businessLatitude && data.user.businessLongitude) {
                statusEl.textContent = `📍 Coordinates resolved: ${parseFloat(data.user.businessLatitude).toFixed(4)}, ${parseFloat(data.user.businessLongitude).toFixed(4)}`;
                statusEl.style.display = 'block';
                statusEl.style.color = 'var(--success)';
            }
        }

        successEl.innerHTML = '<strong>✓ Business identity updated</strong> — this will appear on all your marketplace cards.';
        successEl.style.display = 'block';
        setTimeout(() => { successEl.style.display = 'none'; }, 4000);
    } catch (error) {
        errorEl.textContent = error.message || 'Failed to update business identity';
        errorEl.style.display = 'block';
    }
}

/**
 * Load designer profile data from API and populate checkboxes
 */
async function loadDesignerProfile() {
    try {
        const resp = await apiFetch('/v1/auth/me/designer');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data.designer) return;
        const d = data.designer;
        
        const portfolioEl = document.getElementById('designerPortfolio');
        if (portfolioEl) portfolioEl.value = d.portfolio || '';
        const specEl = document.getElementById('designerSpecialties');
        if (specEl) specEl.value = d.specialties || '';
        const expEl = document.getElementById('designerExperience');
        if (expEl) expEl.value = d.experience || '';
        const rateEl = document.getElementById('designerRate');
        if (rateEl) rateEl.value = d.hourlyRate || '';
        
        // Check capability checkboxes
        const caps = d.capabilities || [];
        document.querySelectorAll('input[name="designer_capabilities"]').forEach(cb => {
            cb.checked = caps.includes(cb.value);
        });
    } catch (err) {
        console.warn('Failed to load designer profile:', err.message);
    }
}

/**
 * Load producer profile data from API and populate checkboxes
 */
async function loadProducerProfile() {
    try {
        const resp = await apiFetch('/v1/auth/me/producer');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data.producer) return;
        const p = data.producer;
        
        const specEl = document.getElementById('producerSpecialties');
        if (specEl) specEl.value = p.specialties || '';
        const minBatchEl = document.getElementById('producerMinBatch');
        if (minBatchEl) minBatchEl.value = p.minBatch || '';
        const capEl = document.getElementById('producerCapacity');
        if (capEl) capEl.value = p.capacity || '';
        const leadEl = document.getElementById('producerLeadTime');
        if (leadEl) leadEl.value = p.leadTime || '';
        const certEl = document.getElementById('producerCertifications');
        if (certEl) certEl.value = p.certifications || '';
        
        // Check capability checkboxes
        const caps = p.capabilities || [];
        document.querySelectorAll('input[name="producer_capabilities"]').forEach(cb => {
            cb.checked = caps.includes(cb.value);
        });
    } catch (err) {
        console.warn('Failed to load producer profile:', err.message);
    }
}


// Module references:
// - js/data.js: mockDesigners, mockProducers, mockProducts, buyerLocation
// - js/utils.js: calculateDistance, formatPrice, generateStars, parseLocation, isInViewport, debounce, escapeHtml
// - js/search.js: searchProducts, searchDesigners, searchProducers, filterByCategory, sortProducersBy
// - js/render.js: renderProducts, renderDesigners, renderProducers, and related functions
// - js/ui.js: UI interactions like setupMap, updateLocation, contactBusiness, addToCart, requestBids

/**
 * ============================================================================
 * BID MANAGEMENT FUNCTIONS - Payment Terms, Acceptance, Milestones, Disputes
 * ============================================================================
 */

let currentBidIdForDispute = null; // Track which bid we're filing a dispute for
let paymentTerms = {
  upfrontPercent: 40,
  shippingPercent: 30,
  deliveryPercent: 30,
}; // Cached payment terms

/**
 * Load payment terms from backend
 */
async function loadPaymentTerms() {
  try {
    const response = await fetch('/v1/bids/settings');
    if (response.ok) {
      const data = await response.json();
      paymentTerms = {
        upfrontPercent: data.settings.paymentUpfrontPercent,
        shippingPercent: data.settings.paymentShippingPercent,
        deliveryPercent: data.settings.paymentDeliveryPercent,
      };
    }
  } catch (error) {
    console.warn('Could not load payment terms:', error);
    // Use defaults
  }
}

/**
 * Display bid details with payment milestones and dispute option
 */
function showBidDetailsModal(bid) {
  const modal = document.getElementById('bidDetailsModal');
  const content = document.getElementById('bidDetailsContent');

  const statusColor = {
    pending: 'var(--warning)',
    accepted: 'var(--info)',
    in_production: 'var(--info)',
    ready_to_ship: 'var(--info)',
    shipped: 'var(--info)',
    delivered: 'var(--secondary)',
    completed: 'var(--secondary)',
    disputed: 'var(--danger)',
  };

  const statusEmoji = {
    pending: '⏳',
    accepted: '✅',
    in_production: '⚙️',
    ready_to_ship: '📦',
    shipped: '🚚',
    delivered: '📥',
    completed: '🎉',
    disputed: '⚠️',
  };

  let html = `
    <h2>Bid Details</h2>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
      <div>
        <p style="color: var(--text-secondary); font-size: 12px; text-transform: uppercase;">Status</p>
        <p style="font-size: 18px; margin: 0;">
          <span style="color: ${statusColor[bid.status] || 'var(--primary)'};">
            ${statusEmoji[bid.status] || '•'} ${bid.status.replace(/_/g, ' ').toUpperCase()}
          </span>
        </p>
      </div>
      <div>
        <p style="color: var(--text-secondary); font-size: 12px; text-transform: uppercase;">Price</p>
        <p style="font-size: 18px; margin: 0; font-weight: 600;">$${bid.quotedPrice?.toFixed(2) || '0.00'}</p>
      </div>
    </div>

    ${bid.status === 'accepted' || bid.status.includes('production') || bid.status.includes('ship') || bid.status.includes('deliver') ? `
      <div style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h4 style="margin-top: 0;">💳 Payment Terms</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; font-size: 13px;">
          <div style="text-align: center;">
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">Upfront</p>
            <p style="font-weight: 600; font-size: 16px; margin: 0;">${paymentTerms.upfrontPercent}%</p>
            <p style="color: var(--text-secondary); margin: 5px 0 0 0;">$${(bid.quotedPrice * paymentTerms.upfrontPercent / 100).toFixed(2)}</p>
          </div>
          <div style="text-align: center;">
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">To Ship</p>
            <p style="font-weight: 600; font-size: 16px; margin: 0;">${paymentTerms.shippingPercent}%</p>
            <p style="color: var(--text-secondary); margin: 5px 0 0 0;">$${(bid.quotedPrice * paymentTerms.shippingPercent / 100).toFixed(2)}</p>
          </div>
          <div style="text-align: center;">
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">Delivery</p>
            <p style="font-weight: 600; font-size: 16px; margin: 0;">${paymentTerms.deliveryPercent}%</p>
            <p style="color: var(--text-secondary); margin: 5px 0 0 0;">$${(bid.quotedPrice * paymentTerms.deliveryPercent / 100).toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h4 style="margin-top: 0;">📅 Timeline</h4>
        <div style="display: grid; gap: 10px; font-size: 13px;">
          ${bid.productionStartDate ? `<p><strong>Production Started:</strong> ${new Date(bid.productionStartDate).toLocaleDateString()}</p>` : ''}
          ${bid.expectedShipDate ? `<p><strong>Expected to Ship:</strong> ${new Date(bid.expectedShipDate).toLocaleDateString()}</p>` : ''}
          ${bid.actualShipDate ? `<p><strong>Actually Shipped:</strong> ${new Date(bid.actualShipDate).toLocaleDateString()}</p>` : ''}
          ${bid.buyerConfirmedDelivery ? `<p><strong>✅ Delivered & Confirmed</strong></p>` : ''}
        </div>
      </div>
    ` : ''}

    <div style="display: flex; gap: 10px;">
      ${bid.status === 'accepted' || bid.status.includes('production') || bid.status.includes('ship') ? `
        <button class="btn-danger" onclick="openDisputeModal('${bid.id}')" style="flex: 1;">
          ⚠️ File Dispute
        </button>
      ` : ''}
      <button class="btn-secondary" onclick="closeBidDetailsModal()" style="flex: 1;">Close</button>
    </div>
  `;

  content.innerHTML = html;
  modal.style.display = 'flex';
}

/**
 * Close bid details modal
 */
function closeBidDetailsModal() {
  document.getElementById('bidDetailsModal').style.display = 'none';
}

/**
 * Open dispute filing modal
 */
function openDisputeModal(bidId) {
  currentBidIdForDispute = bidId;
  document.getElementById('disputeModal').style.display = 'flex';
  document.getElementById('disputeForm').reset();
}

/**
 * Close dispute modal
 */
function closeDisputeModal() {
  document.getElementById('disputeModal').style.display = 'none';
  currentBidIdForDispute = null;
}

/**
 * File a dispute
 */
async function handleFileDispute(event) {
  event.preventDefault();

  if (!currentBidIdForDispute) {
    alert('No bid selected');
    return;
  }

  const failureType = document.getElementById('disputeFailureType').value;
  const description = document.getElementById('disputeDescription').value;
  const claimedAmount = parseFloat(document.getElementById('disputeAmount').value);
  const evidence = document.getElementById('disputeEvidence').value.split('\n').filter(e => e.trim());

  const errorEl = document.getElementById('disputeError');

  try {
    const token = localStorage.getItem('pds_token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `/v1/bids/${currentBidIdForDispute}/disputes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          failureType,
          description,
          claimedAmount,
          evidence,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to file dispute');
    }

    alert('✅ Dispute filed successfully. An admin will review it shortly.');
    closeDisputeModal();
    // Reload bids
    loadUserBids();
  } catch (error) {
    errorEl.textContent = error.message || 'Failed to file dispute';
    errorEl.style.display = 'block';
  }
}

/**
 * Load and display user's bids
 */
async function loadUserBids() {
  const bidsList = document.getElementById('bidsList');

  try {
    const token = localStorage.getItem('pds_token');
    if (!token) {
      bidsList.innerHTML = '<div style="padding: 20px; text-align: center;">Please log in to view bids</div>';
      return;
    }

    // Fetch payment terms
    await loadPaymentTerms();

    // Fetch bids from API
    const response = await fetch('/v1/bids/my-bids', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    let bids = [];
    if (response.ok) {
      const data = await response.json();
      bids = data.bids || [];
    }

    if (!bids || bids.length === 0) {
      bidsList.innerHTML = '<div style="padding: 40px; text-align: center; background: var(--bg-secondary); border-radius: 8px;"><p style="color: var(--text-secondary);">No bids yet</p></div>';
      return;
    }

    bidsList.innerHTML = bids
      .map(
        (bid) => `
      <div style="border: 1px solid var(--border); border-radius: 8px; padding: 20px; background: var(--bg-secondary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px; font-size: 13px;">
          <div>
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">Price</p>
            <p style="font-weight: 600; margin: 0;">$${parseFloat(bid.quotedPrice || 0).toFixed(2)}</p>
          </div>
          <div>
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">Lead Time</p>
            <p style="font-weight: 600; margin: 0;">${bid.leadTimeDays || 'N/A'} days</p>
          </div>
          <div>
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">Status</p>
            <p style="font-weight: 600; margin: 0; color: var(--primary);">${(bid.status || 'unknown').replace(/_/g, ' ').toUpperCase()}</p>
          </div>
          <div>
            <p style="color: var(--text-secondary); margin: 0 0 5px 0;">Date</p>
            <p style="font-weight: 600; margin: 0;">${bid.createdAt ? new Date(bid.createdAt).toLocaleDateString() : 'N/A'}</p>
          </div>
        </div>

        <p style="color: var(--text-secondary); font-size: 12px; margin: 10px 0;">${escapeHtml(bid.message || bid.order?.orderNumber || '')}</p>

        <button class="btn-primary" onclick='showBidDetailsModal(${JSON.stringify(bid).replace(/'/g, "&#39;")})' style="width: 100%; margin-top: 10px;">
          View Details & Payment Terms
        </button>
      </div>
    `
      )
      .join('');
  } catch (error) {
    console.error('Error loading bids:', error);
    bidsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Error loading bids</div>';
  }
}

// Load bids when dashboard is displayed
window.addEventListener('bidsDashboardReady', loadUserBids);

/* 
   REFACTORED MODULES:
   ==================
   The original 1057-line monolithic code has been separated into modular files:
   
   - js/data.js: All mock data (mockDesigners, mockProducers, mockProducts, buyerLocation)
   - js/utils.js: Utility functions (calculateDistance, formatPrice, etc.)
   - js/search.js: Search and filter logic
   - js/render.js: All rendering functions for products, designers, producers
   - js/ui.js: UI interactions, maps, modals
   
   The original app.js backup is saved at: .old/app.js.bak
   
   See index.html for script import order.
   See each js/*.js file for detailed documentation.
*/

// ============================================================================
// PUBLIC CUSTOM PROJECTS GRID (browse RFBs on Custom Projects tab)
// ============================================================================

async function loadPublicCustomProjects() {
    const grid = document.getElementById('customProjectsGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">Loading projects...</p>';

    try {
        const resp = await apiFetch('/v1/orders/custom-projects');
        if (!resp.ok) throw new Error('Failed to load');
        const data = await resp.json();
        const projects = data.projects || [];

        if (projects.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">📋</div>
                    <h4>No Active Requests for Bids</h4>
                    <p style="color: var(--text-secondary); margin-top: 10px;">Be the first to post a custom project request!</p>
                </div>`;
            return;
        }

        grid.innerHTML = projects.map(p => {
            let meta = {};
            try { meta = typeof p.notes === 'string' ? JSON.parse(p.notes) : (p.notes || {}); } catch(e) {}
            const title = meta.title || p.orderNumber || 'Untitled Project';
            const desc = meta.description || 'No description provided';
            const budget = p.totalAmount ? `$${parseFloat(p.totalAmount).toFixed(2)}` : 'TBD';
            const skills = meta.requiredCapabilities || [];
            const deadline = meta.deadline ? new Date(meta.deadline).toLocaleDateString() : null;
            return `
                <div class="product-card" style="padding: 20px;">
                    <h4 style="margin-bottom: 8px;">📋 ${escapeHtml(title)}</h4>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">${escapeHtml(desc.substring(0, 200))}${desc.length > 200 ? '...' : ''}</p>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
                        <span style="background: var(--bg-secondary); padding: 4px 10px; border-radius: 12px; font-size: 12px;">💰 Budget: ${budget}</span>
                        ${deadline ? `<span style="background: var(--bg-secondary); padding: 4px 10px; border-radius: 12px; font-size: 12px;">📅 ${deadline}</span>` : ''}
                    </div>
                    ${skills.length ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${skills.map(s => `<span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
                </div>`;
        }).join('');
    } catch (err) {
        console.error('Load public custom projects error:', err);
        grid.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">Could not load projects. Try again later.</p>';
    }
}

// ============================================================================
// GIZMOS SECTION
// ============================================================================

async function loadGizmos() {
    const grid = document.getElementById('gizmosGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">Loading gizmos...</p>';

    try {
        // Fetch products filtered by gizmos category
        const resp = await apiFetch('/v1/search/products?category=gizmos&limit=50');
        if (!resp.ok) throw new Error('Failed to load');
        const data = await resp.json();
        const items = data.results || data.products || [];

        if (items.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">🔧</div>
                    <h4>No Gizmos Listed Yet</h4>
                    <p style="color: var(--text-secondary); margin-top: 10px;">DIY electronics, IoT devices, robotics kits, and maker hardware will appear here.</p>
                    <p style="color: var(--text-secondary); margin-top: 5px;">Designers and producers can list gizmos from their dashboard.</p>
                </div>`;
            return;
        }

        grid.innerHTML = items.map(item => `
            <div class="product-card" onclick="viewProductPage(${item.id})" style="cursor: pointer;">
                <div style="height: 180px; background: var(--bg-secondary); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 48px; margin-bottom: 12px;">🔧</div>
                <h4>${escapeHtml(item.name || 'Untitled')}</h4>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 6px 0;">${escapeHtml((item.description || '').substring(0, 100))}</p>
                <p style="font-weight: 700; color: var(--primary);">$${parseFloat(item.price || 0).toFixed(2)}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load gizmos error:', err);
        grid.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">Could not load gizmos.</p>';
    }
}

function searchGizmos() {
    const query = document.getElementById('gizmosSearchInput')?.value?.trim();
    // Re-load with search filter — for now, filter client-side from loaded data
    loadGizmos();
}

function filterGizmos() {
    loadGizmos();
}

// ============================================================
// Sales History (seller-side view of orders)
// ============================================================

async function loadSalesHistory() {
    const salesList = document.getElementById('salesList');
    const salesCount = document.getElementById('salesCount');
    if (!salesList) return;
    
    salesList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">Loading sales...</td></tr>';
    
    try {
        const response = await apiFetch('/v1/orders/sales');
        if (!response.ok) {
            salesList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">Could not load sales history.</td></tr>';
            return;
        }
        
        const data = await response.json();
        const sales = data.sales || [];
        
        if (salesCount) salesCount.textContent = `${sales.length} sale${sales.length !== 1 ? 's' : ''}`;
        
        if (sales.length === 0) {
            salesList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">No sales yet. Once customers purchase your products, materials, or gizmos they will appear here.</td></tr>';
            return;
        }
        
        salesList.innerHTML = sales.map(sale => {
            const date = new Date(sale.createdAt).toLocaleDateString();
            const itemsSummary = (sale.items || []).map(i => `${i.productName} (×${i.quantity})`).join(', ') || 'N/A';
            const buyerName = sale.buyer?.name || 'Unknown';
            const buyerEmail = sale.buyer?.email || '';
            const statusColor = {
                'delivered': 'var(--success)',
                'shipped': 'var(--info, #3b82f6)',
                'in_production': 'var(--warning)',
                'pending': 'var(--text-secondary)',
                'cancelled': 'var(--danger)',
                'disputed': 'var(--danger)',
            }[sale.status] || 'var(--text-secondary)';
            const statusLabel = (sale.status || 'pending').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const paymentBadge = sale.paymentReceived 
                ? '<span style="background: var(--success); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px;">Paid</span>' 
                : '<span style="background: var(--warning); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px;">Unpaid</span>';
            
            return `
                <tr>
                    <td style="font-weight: 600;">${escapeHtml(sale.orderNumber || sale.id.substring(0, 8))}</td>
                    <td>
                        <div style="font-weight: 500;">${escapeHtml(buyerName)}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(buyerEmail)}</div>
                    </td>
                    <td style="font-size: 13px;">${escapeHtml(itemsSummary)}</td>
                    <td style="font-weight: 700;">$${parseFloat(sale.totalAmount || 0).toFixed(2)}${paymentBadge}</td>
                    <td>${date}</td>
                    <td><span style="color: ${statusColor}; font-weight: 500;">${statusLabel}</span></td>
                </tr>`;
        }).join('');
    } catch (err) {
        console.error('Load sales history error:', err);
        salesList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">Error loading sales history.</td></tr>';
    }
}

// ============================================================
// Registered Services (stored in localStorage + user metadata)
// ============================================================

async function saveRegisteredServices() {
    const services = {
        designer: document.getElementById('regDesigner')?.checked || false,
        producer: document.getElementById('regProducer')?.checked || false,
        materials: document.getElementById('regMaterials')?.checked || false,
        author: document.getElementById('regAuthor')?.checked || false,
        gizmo: document.getElementById('regGizmo')?.checked || false,
    };
    
    // Persist to backend (controls marketplace listing visibility)
    try {
        const resp = await apiFetch('/v1/auth/me/registered-services', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(services),
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Failed to save');
        }
    } catch (err) {
        console.warn('Failed to save registered services to backend:', err.message);
    }
    
    // Also cache in localStorage for immediate UI updates on next load
    localStorage.setItem('registeredServices', JSON.stringify(services));
    
    // Show/hide relevant dashboard sidebar items immediately
    const productsTabBtn = document.getElementById('productsTabBtn');
    if (productsTabBtn) productsTabBtn.style.display = services.designer ? 'block' : 'none';
    const myMaterialsTabBtn = document.getElementById('myMaterialsTabBtn');
    if (myMaterialsTabBtn) myMaterialsTabBtn.style.display = services.materials ? 'block' : 'none';
    const myGizmosTabBtn = document.getElementById('myGizmosTabBtn');
    if (myGizmosTabBtn) myGizmosTabBtn.style.display = services.gizmo ? 'block' : 'none';
    
    // Show/hide listings section header
    const listingsSection = document.getElementById('listingsSection');
    if (listingsSection) {
        listingsSection.style.display = (services.designer || services.materials || services.gizmo) ? 'block' : 'none';
    }
    
    // Show/hide sales history
    const salesHistoryTabBtn = document.getElementById('salesHistoryTabBtn');
    if (salesHistoryTabBtn) {
        salesHistoryTabBtn.style.display = (services.designer || services.producer || services.materials || services.gizmo) ? 'block' : 'none';
    }
    
    showToast('Registered services updated', 'success');
}

async function loadRegisteredServices() {
    // Try loading from backend first; fall back to localStorage
    let services = {};
    try {
        const resp = await apiFetch('/v1/auth/me/registered-services');
        if (resp.ok) {
            const data = await resp.json();
            services = data.services || {};
            // Sync localStorage
            localStorage.setItem('registeredServices', JSON.stringify(services));
        } else {
            services = JSON.parse(localStorage.getItem('registeredServices') || '{}');
        }
    } catch (err) {
        services = JSON.parse(localStorage.getItem('registeredServices') || '{}');
    }
    
    const regDesigner = document.getElementById('regDesigner');
    const regProducer = document.getElementById('regProducer');
    const regMaterials = document.getElementById('regMaterials');
    const regAuthor = document.getElementById('regAuthor');
    const regGizmo = document.getElementById('regGizmo');
    
    if (regDesigner) regDesigner.checked = services.designer || false;
    if (regProducer) regProducer.checked = services.producer || false;
    if (regMaterials) regMaterials.checked = services.materials || false;
    if (regAuthor) regAuthor.checked = services.author || false;
    if (regGizmo) regGizmo.checked = services.gizmo || false;
}

// ============================================================
// Material Services Profile (Settings Tab)
// ============================================================

function loadMaterialsProfile() {
    const saved = JSON.parse(localStorage.getItem('materialsProfile') || '{}');
    
    // Restore checkboxes
    document.querySelectorAll('input[name="material_types"]').forEach(cb => {
        cb.checked = (saved.materialTypes || []).includes(cb.value);
    });
    
    const descEl = document.getElementById('materialsDescription');
    if (descEl) descEl.value = saved.description || '';
    const minOrderEl = document.getElementById('materialsMinOrder');
    if (minOrderEl) minOrderEl.value = saved.minOrder || '';
    const leadTimeEl = document.getElementById('materialsLeadTime');
    if (leadTimeEl) leadTimeEl.value = saved.leadTime || '';
}

function handleMaterialsUpdate(event) {
    event.preventDefault();
    
    const materialTypes = [];
    document.querySelectorAll('input[name="material_types"]:checked').forEach(cb => materialTypes.push(cb.value));
    
    const profile = {
        materialTypes,
        description: document.getElementById('materialsDescription')?.value || '',
        minOrder: document.getElementById('materialsMinOrder')?.value || '',
        leadTime: document.getElementById('materialsLeadTime')?.value || '',
    };
    
    localStorage.setItem('materialsProfile', JSON.stringify(profile));
    
    const successEl = document.getElementById('materialsSuccess');
    if (successEl) {
        successEl.style.display = 'block';
        setTimeout(() => successEl.style.display = 'none', 3000);
    }
    showToast('Material services saved', 'success');
}

// ============================================================
// Author/Books Services Profile (Settings Tab)
// ============================================================

function loadAuthorBooksProfile() {
    const saved = JSON.parse(localStorage.getItem('authorBooksProfile') || '{}');
    
    document.querySelectorAll('input[name="author_types"]').forEach(cb => {
        cb.checked = (saved.authorTypes || []).includes(cb.value);
    });
    
    const bioEl = document.getElementById('authorBio');
    if (bioEl) bioEl.value = saved.bio || '';
    const websiteEl = document.getElementById('authorWebsite');
    if (websiteEl) websiteEl.value = saved.website || '';
    const publisherEl = document.getElementById('authorPublisher');
    if (publisherEl) publisherEl.value = saved.publisher || '';
}

function handleAuthorBooksUpdate(event) {
    event.preventDefault();
    
    const authorTypes = [];
    document.querySelectorAll('input[name="author_types"]:checked').forEach(cb => authorTypes.push(cb.value));
    
    const profile = {
        authorTypes,
        bio: document.getElementById('authorBio')?.value || '',
        website: document.getElementById('authorWebsite')?.value || '',
        publisher: document.getElementById('authorPublisher')?.value || '',
    };
    
    localStorage.setItem('authorBooksProfile', JSON.stringify(profile));
    
    const successEl = document.getElementById('authorBooksSuccess');
    if (successEl) {
        successEl.style.display = 'block';
        setTimeout(() => successEl.style.display = 'none', 3000);
    }
    showToast('Author profile saved', 'success');
}

// ============================================================
// Gizmo Services Profile (Settings Tab)
// ============================================================

function loadGizmoServicesProfile() {
    const saved = JSON.parse(localStorage.getItem('gizmoServicesProfile') || '{}');
    
    document.querySelectorAll('input[name="gizmo_capabilities"]').forEach(cb => {
        cb.checked = (saved.capabilities || []).includes(cb.value);
    });
    
    const descEl = document.getElementById('gizmoDescription');
    if (descEl) descEl.value = saved.description || '';
    const leadTimeEl = document.getElementById('gizmoLeadTime');
    if (leadTimeEl) leadTimeEl.value = saved.leadTime || '';
    const minBudgetEl = document.getElementById('gizmoMinBudget');
    if (minBudgetEl) minBudgetEl.value = saved.minBudget || '';
}

function handleGizmoServicesUpdate(event) {
    event.preventDefault();
    
    const capabilities = [];
    document.querySelectorAll('input[name="gizmo_capabilities"]:checked').forEach(cb => capabilities.push(cb.value));
    
    const profile = {
        capabilities,
        description: document.getElementById('gizmoDescription')?.value || '',
        leadTime: document.getElementById('gizmoLeadTime')?.value || '',
        minBudget: document.getElementById('gizmoMinBudget')?.value || '',
    };
    
    localStorage.setItem('gizmoServicesProfile', JSON.stringify(profile));
    
    const successEl = document.getElementById('gizmoServicesSuccess');
    if (successEl) {
        successEl.style.display = 'block';
        setTimeout(() => successEl.style.display = 'none', 3000);
    }
    showToast('Gizmo services saved', 'success');
}

// ============================================================
// My Materials Listing Management (Dashboard Tab)
// ============================================================

async function loadMyMaterials() {
    const container = document.getElementById('myMaterialsList');
    if (!container) return;
    
    try {
        const response = await apiFetch('/v1/products?category=materials');
        if (!response.ok) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">Could not load materials.</p></div>';
            return;
        }
        
        const data = await response.json();
        const materials = data.products || [];
        
        // Update count
        const activeCount = materials.filter(m => m.active).length;
        const countEl = document.getElementById('materialListingCount');
        if (countEl) countEl.textContent = `${activeCount} / 50 active listings`;
        
        if (materials.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">No materials listed yet. <button class="btn-primary" onclick="openMaterialModal()">List Your First Material</button></p></div>';
            return;
        }
        
        container.innerHTML = materials.map(m => renderListingCard(m, 'material')).join('');
    } catch (err) {
        console.error('Error loading materials:', err);
        container.innerHTML = '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">Error loading materials.</p></div>';
    }
}

function openMaterialModal(existing) {
    openListingModal('material', existing);
}

// ============================================================
// My Gizmos Listing Management (Dashboard Tab)
// ============================================================

async function loadMyGizmos() {
    const container = document.getElementById('myGizmosList');
    if (!container) return;
    
    try {
        const response = await apiFetch('/v1/products?category=gizmos');
        if (!response.ok) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">Could not load gizmos.</p></div>';
            return;
        }
        
        const data = await response.json();
        const gizmos = data.products || [];
        
        // Update count
        const activeCount = gizmos.filter(g => g.active).length;
        const countEl = document.getElementById('gizmoListingCount');
        if (countEl) countEl.textContent = `${activeCount} / 50 active listings`;
        
        if (gizmos.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">No gizmos listed yet. <button class="btn-primary" onclick="openGizmoModal()">List Your First Gizmo</button></p></div>';
            return;
        }
        
        container.innerHTML = gizmos.map(g => renderListingCard(g, 'gizmo')).join('');
    } catch (err) {
        console.error('Error loading gizmos:', err);
        container.innerHTML = '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">Error loading gizmos.</p></div>';
    }
}

function openGizmoModal(existing) {
    openListingModal('gizmo', existing);
}

// ============================================================
// Shared Listing Card Renderer & Modal
// ============================================================

function renderListingCard(item, type) {
    const emoji = type === 'material' ? '🧱' : '🔧';
    const statusBadge = item.active
        ? '<span style="background: var(--success); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Published</span>'
        : '<span style="background: var(--warning); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Draft</span>';
    
    return `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <h4 style="margin: 0;">${emoji} ${escapeHtml(item.name || 'Untitled')}</h4>
                    <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 0;">${escapeHtml((item.description || '').substring(0, 100))}</p>
                </div>
                ${statusBadge}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; color: var(--primary);">$${parseFloat(item.price || 0).toFixed(2)}</span>
                <span style="font-size: 12px; color: var(--text-secondary);">${item.category || type}</span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn-small" onclick="openListingModal('${type}', ${JSON.stringify(item).replace(/"/g, '&quot;')})">✏️ Edit</button>
                <button class="btn-small" onclick="toggleListingActive(${item.id},'${type}')" style="background: var(--bg-primary); border: 1px solid var(--border);">
                    ${item.active ? '👁️ Unpublish' : '📢 Publish'}
                </button>
                <button class="btn-small" onclick="deleteListing(${item.id}, '${type}')" style="background: var(--danger); color: white;">🗑️ Archive</button>
            </div>
        </div>`;
}

function openListingModal(type, existing) {
    const emoji = type === 'material' ? '🧱' : '🔧';
    const label = type === 'material' ? 'Material' : 'Gizmo';
    const category = type === 'material' ? 'materials' : 'gizmos';
    const isEdit = existing && existing.id;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'listingModal';
    modal.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;';
    
    modal.innerHTML = `
        <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; padding: 30px; max-width: 550px; width: 90%; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${emoji} ${isEdit ? 'Edit' : 'New'} ${label} Listing</h3>
                <button onclick="closeListingModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-primary);">&times;</button>
            </div>
            <form onsubmit="handleListingSave(event, '${type}', ${isEdit ? existing.id : 'null'})">
                <div class="form-group">
                    <label>Name *</label>
                    <input type="text" id="listingName" value="${escapeHtml(existing?.name || '')}" required>
                </div>
                <div class="form-group">
                    <label>Description *</label>
                    <textarea id="listingDescription" rows="3" required>${escapeHtml(existing?.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>SKU *</label>
                    <input type="text" id="listingSku" value="${escapeHtml(existing?.sku || '')}" required>
                </div>
                <div class="form-group">
                    <label>Price ($) *</label>
                    <input type="number" id="listingPrice" min="0" step="0.01" value="${existing?.price || ''}" required>
                </div>
                <div class="form-group">
                    <label>Stock Quantity</label>
                    <input type="number" id="listingStock" min="0" value="${existing?.stock || '0'}">
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="submit" class="btn-primary" style="flex:1;">${isEdit ? 'Update' : 'Create'} ${label}</button>
                    <button type="button" class="btn-secondary" onclick="closeListingModal()" style="flex:1;">Cancel</button>
                </div>
            </form>
        </div>`;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeListingModal(); });
}

function closeListingModal() {
    const modal = document.getElementById('listingModal');
    if (modal) modal.remove();
}

async function handleListingSave(event, type, existingId) {
    event.preventDefault();
    const category = type === 'material' ? 'materials' : 'gizmos';
    
    const payload = {
        name: document.getElementById('listingName').value,
        description: document.getElementById('listingDescription').value,
        sku: document.getElementById('listingSku').value,
        price: parseFloat(document.getElementById('listingPrice').value),
        category: category,
        stock: parseInt(document.getElementById('listingStock').value) || 0,
        fulfilledBy: 'self',
    };
    
    try {
        let response;
        if (existingId) {
            response = await apiFetch(`/v1/products/${existingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await apiFetch('/v1/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save listing');
        }
        
        showToast(`${type === 'material' ? 'Material' : 'Gizmo'} ${existingId ? 'updated' : 'created'} successfully!`, 'success');
        closeListingModal();
        if (type === 'material') loadMyMaterials();
        else loadMyGizmos();
    } catch (err) {
        showToast(err.message || 'Failed to save listing', 'error');
    }
}

async function toggleListingActive(id, type) {
    try {
        const response = await apiFetch(`/v1/products/${id}/toggle`, { method: 'PATCH' });
        if (!response.ok) throw new Error('Failed to toggle listing');
        const data = await response.json();
        showToast(data.message, 'success');
        if (type === 'material') loadMyMaterials();
        else loadMyGizmos();
    } catch (err) {
        showToast('Failed to toggle listing visibility', 'error');
    }
}

async function deleteListing(id, type) {
    const label = type === 'material' ? 'material' : 'gizmo';
    if (!confirm(`Archive this ${label} listing? It will be removed from the marketplace but preserved in your records.`)) return;
    
    try {
        const response = await apiFetch(`/v1/products/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to archive listing');
        showToast(`${label.charAt(0).toUpperCase() + label.slice(1)} archived successfully`, 'success');
        if (type === 'material') loadMyMaterials();
        else loadMyGizmos();
    } catch (err) {
        showToast('Failed to archive listing', 'error');
    }
}

// ============================================================================
// PORTFOLIO GALLERY FUNCTIONS
// ============================================================================

/**
 * Load portfolio images for a service tab
 */
async function loadPortfolioGallery(serviceType) {
    const grid = document.getElementById(`${serviceType}PortfolioGrid`);
    const countEl = document.getElementById(`${serviceType}PortfolioCount`);
    if (!grid) return;

    try {
        const token = localStorage.getItem('pds_token');
        if (!token) return;

        // Get current user ID from JWT
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userId = payload.userId || payload.id;
        if (!userId) return;

        const resp = await apiFetch(`/v1/portfolio/${userId}?serviceType=${serviceType}`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (countEl) countEl.textContent = `${data.count} / 50 images`;
        renderPortfolioGrid(grid, data.images, serviceType, true);
    } catch (err) {
        console.warn('Failed to load portfolio:', err.message);
    }
}

/**
 * Render portfolio grid (editable or read-only)
 */
function renderPortfolioGrid(grid, images, serviceType, editable) {
    if (!images || images.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No images uploaded yet. Drag and drop above to add your first project photo!</p>';
        return;
    }

    grid.innerHTML = images.map((img, idx) => `
        <div class="portfolio-item" data-id="${img.id}" draggable="${editable}">
            <img src="${img.imageUrl}" alt="${escapeHtml(img.caption || 'Portfolio image')}" loading="lazy" onclick="showPortfolioLightbox('${img.imageUrl}', '${escapeHtml(img.caption || '')}')">
            ${img.caption ? `<div class="portfolio-caption">${escapeHtml(img.caption)}</div>` : ''}
            ${editable ? `
                <div class="portfolio-item-actions">
                    <button class="portfolio-caption-btn" onclick="editPortfolioCaption('${img.id}', '${serviceType}')" title="Edit caption">✏️</button>
                    <button class="portfolio-delete-btn" onclick="deletePortfolioImage('${img.id}', '${serviceType}')" title="Delete image">🗑️</button>
                </div>
            ` : ''}
        </div>
    `).join('');

    // Set up drag-and-drop reordering if editable
    if (editable) {
        setupPortfolioDragReorder(grid, serviceType);
    }
}

/**
 * Handle drag over for portfolio dropzone
 */
function handlePortfolioDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

/**
 * Handle drag leave for portfolio dropzone
 */
function handlePortfolioDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

/**
 * Handle file drop on portfolio dropzone
 */
function handlePortfolioDrop(event, serviceType) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        uploadPortfolioImages(files, serviceType);
    }
}

/**
 * Handle file input change for portfolio
 */
function handlePortfolioFileSelect(event, serviceType) {
    const files = event.target.files;
    if (files.length > 0) {
        uploadPortfolioImages(files, serviceType);
    }
    event.target.value = ''; // Reset for re-upload of same files
}

/**
 * Upload portfolio images via API
 */
async function uploadPortfolioImages(files, serviceType) {
    const fileArray = Array.from(files);
    if (fileArray.length > 10) {
        showToast('Maximum 10 images per upload', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('serviceType', serviceType);
    fileArray.forEach(file => formData.append('images', file));

    const dropzone = document.getElementById(`${serviceType}Dropzone`);
    if (dropzone) {
        dropzone.querySelector('.dropzone-content').innerHTML = '<span style="font-size: 32px;">⏳</span><p>Uploading...</p>';
    }

    try {
        const token = localStorage.getItem('pds_token');
        const resp = await fetch('/v1/portfolio/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Upload failed');
        }

        const data = await resp.json();
        showToast(`${data.count} image(s) uploaded successfully!`, 'success');
        loadPortfolioGallery(serviceType);
    } catch (err) {
        showToast(err.message || 'Failed to upload images', 'error');
    } finally {
        if (dropzone) {
            dropzone.querySelector('.dropzone-content').innerHTML = `
                <span style="font-size: 32px;">📁</span>
                <p>Drag & drop images here or click to browse</p>
                <span class="dropzone-hint">JPEG, PNG, WebP, GIF — Max 10MB each</span>
            `;
        }
    }
}

/**
 * Delete a portfolio image
 */
async function deletePortfolioImage(imageId, serviceType) {
    if (!confirm('Delete this portfolio image?')) return;

    try {
        const resp = await apiFetch(`/v1/portfolio/${imageId}`, { method: 'DELETE' });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Delete failed');
        }
        showToast('Image deleted', 'success');
        loadPortfolioGallery(serviceType);
    } catch (err) {
        showToast(err.message || 'Failed to delete image', 'error');
    }
}

/**
 * Edit caption for a portfolio image
 */
async function editPortfolioCaption(imageId, serviceType) {
    const caption = prompt('Enter a caption for this image (max 200 chars):');
    if (caption === null) return; // cancelled

    try {
        const resp = await apiFetch(`/v1/portfolio/${imageId}/caption`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption: caption.substring(0, 200) }),
        });
        if (!resp.ok) throw new Error('Failed to update caption');
        loadPortfolioGallery(serviceType);
    } catch (err) {
        showToast('Failed to update caption', 'error');
    }
}

/**
 * Set up drag-and-drop reordering within portfolio grid
 */
function setupPortfolioDragReorder(grid, serviceType) {
    let draggedItem = null;

    grid.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.portfolio-item');
        if (!item) return;
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    grid.addEventListener('dragend', (e) => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
        grid.querySelectorAll('.portfolio-item').forEach(item => item.classList.remove('drag-over'));
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const item = e.target.closest('.portfolio-item');
        if (!item || item === draggedItem) return;
        item.classList.add('drag-over');
    });

    grid.addEventListener('dragleave', (e) => {
        const item = e.target.closest('.portfolio-item');
        if (item) item.classList.remove('drag-over');
    });

    grid.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.portfolio-item');
        if (!target || target === draggedItem || !draggedItem) return;

        // Reorder DOM
        const items = [...grid.querySelectorAll('.portfolio-item')];
        const fromIdx = items.indexOf(draggedItem);
        const toIdx = items.indexOf(target);

        if (fromIdx < toIdx) {
            target.after(draggedItem);
        } else {
            target.before(draggedItem);
        }

        // Save new order to API
        const newOrder = [...grid.querySelectorAll('.portfolio-item')].map(el => el.dataset.id);
        savePortfolioOrder(newOrder);
    });
}

/**
 * Save portfolio reorder to API
 */
async function savePortfolioOrder(imageIds) {
    try {
        const resp = await apiFetch('/v1/portfolio/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageIds }),
        });
        if (!resp.ok) throw new Error('Reorder failed');
    } catch (err) {
        showToast('Failed to save image order', 'error');
    }
}

/**
 * Show lightbox for portfolio image
 */
function showPortfolioLightbox(imageUrl, caption) {
    const existing = document.getElementById('portfolioLightbox');
    if (existing) existing.remove();

    const lightbox = document.createElement('div');
    lightbox.id = 'portfolioLightbox';
    lightbox.className = 'portfolio-lightbox';
    lightbox.onclick = (e) => { if (e.target === lightbox) lightbox.remove(); };
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <button class="lightbox-close" onclick="document.getElementById('portfolioLightbox').remove()">✕</button>
            <img src="${imageUrl}" alt="${escapeHtml(caption)}">
            ${caption ? `<p class="lightbox-caption">${escapeHtml(caption)}</p>` : ''}
        </div>
    `;
    document.body.appendChild(lightbox);
}


// ============================================================================
// PUBLIC PROFILE PAGE FUNCTIONS
// ============================================================================

let currentProfileData = null;

/**
 * Load and display a public profile page
 * Called when URL hash matches #profile/:userId/:serviceType
 */
async function loadPublicProfile(userId, serviceType) {
    try {
        // Show the profile section
        document.querySelectorAll('.section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
        const profileSection = document.getElementById('public-profile-section');
        if (profileSection) { profileSection.classList.add('active'); profileSection.style.display = 'block'; }

        // Hide marketplace tabs
        const tabs = document.getElementById('marketplaceTabs');
        if (tabs) tabs.style.display = 'none';

        const resp = await fetch(`/v1/portfolio/profile/${userId}`);
        if (!resp.ok) throw new Error('Profile not found');
        const data = await resp.json();
        currentProfileData = data;

        // Render header
        document.getElementById('profileAvatar').textContent = data.user.profileImage ? '' : '👤';
        const avatarEl = document.getElementById('profileAvatar');
        if (data.user.profileImage) {
            avatarEl.style.backgroundImage = `url(${data.user.profileImage})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.textContent = '';
        }

        const userName = data.user.businessName || `${data.user.firstName} ${data.user.lastName}`;
        document.getElementById('profileName').textContent = userName;

        // Location
        const location = data.designer?.location || data.producer?.location || '';
        document.getElementById('profileLocation').textContent = location ? `📍 ${location}` : '';

        // Tagline / description
        const desc = data.designer?.description || data.producer?.description || '';
        document.getElementById('profileTagline').textContent = desc.substring(0, 120);

        // Rating
        const ratingData = data.designer || data.producer;
        if (ratingData && ratingData.rating) {
            document.getElementById('profileRating').innerHTML = `
                <span class="rating-stars">${generateStars(ratingData.rating)} ${ratingData.rating.toFixed(1)}</span>
                <span style="color: var(--text-secondary); font-size: 13px;">(${ratingData.reviewCount || 0} reviews)</span>
            `;
        }

        // Service badges
        const badges = [];
        if (data.user.services.designer) badges.push('🎨 Designer');
        if (data.user.services.producer) badges.push('🏭 Producer');
        if (data.user.services.materials) badges.push('🧱 Materials');
        if (data.user.services.author) badges.push('📚 Author');
        if (data.user.services.gizmo) badges.push('🔧 Gizmo');
        document.getElementById('profileBadges').innerHTML = badges.map(b => `<span class="profile-badge">${b}</span>`).join('');

        // Contact button
        const contactBtn = document.getElementById('profileContactBtn');
        contactBtn.style.display = 'inline-block';
        contactBtn.onclick = () => contactBusiness(userId, userName);

        // Website button
        const website = data.designer?.website || data.producer?.website;
        const websiteBtn = document.getElementById('profileWebsiteBtn');
        if (website) {
            websiteBtn.style.display = 'inline-block';
            websiteBtn.onclick = () => window.open(website, '_blank', 'noopener');
        } else {
            websiteBtn.style.display = 'none';
        }

        // Overview tab
        renderProfileOverview(data, serviceType);
        // Portfolio tab
        renderProfilePortfolio(data.portfolio);
        // Products tab
        renderProfileProducts(data.products);
        // Reviews tab
        renderProfileReviews(data.reviews);

        // Default to overview tab
        switchProfileTab('overview');

    } catch (err) {
        console.error('Failed to load profile:', err);
        const profileSection = document.getElementById('public-profile-section');
        if (profileSection) {
            profileSection.innerHTML = `<div style="text-align: center; padding: 60px;"><h3>Profile Not Found</h3><p style="color: var(--text-secondary); margin-top: 10px;">This user profile could not be loaded.</p><button class="btn-secondary" onclick="history.back()" style="margin-top: 20px;">← Go Back</button></div>`;
        }
    }
}

/**
 * Render profile overview tab
 */
function renderProfileOverview(data, serviceType) {
    // Description
    const desc = data.designer?.description || data.producer?.description || 'No description provided.';
    document.getElementById('profileDescription').textContent = desc;

    // Stats
    const statsEl = document.getElementById('profileStats');
    const ratingData = serviceType === 'producer' ? data.producer : data.designer;
    if (ratingData) {
        const salesLabel = serviceType === 'producer' ? 'Orders Fulfilled' : 'Sales';
        const salesValue = ratingData.totalSales || ratingData.totalOrdersFulfilled || 0;
        statsEl.innerHTML = `
            <div class="profile-stat">
                <span class="stat-value">${ratingData.rating ? ratingData.rating.toFixed(1) : 'N/A'}</span>
                <span class="stat-label">Rating</span>
            </div>
            <div class="profile-stat">
                <span class="stat-value">${ratingData.reviewCount || 0}</span>
                <span class="stat-label">Reviews</span>
            </div>
            <div class="profile-stat">
                <span class="stat-value">${salesValue}</span>
                <span class="stat-label">${salesLabel}</span>
            </div>
            <div class="profile-stat">
                <span class="stat-value">${ratingData.averageLeadTime || '?'}</span>
                <span class="stat-label">Avg Lead Time (days)</span>
            </div>
        `;
    } else {
        statsEl.innerHTML = '<p style="color: var(--text-secondary);">No stats available</p>';
    }

    // Capabilities - producer has materialTypes/productTypes, designer doesn't have separate caps
    const capsEl = document.getElementById('profileCapabilities');
    if (data.producer && (data.producer.materialTypes || data.producer.productTypes)) {
        const allCaps = [...(data.producer.materialTypes || []), ...(data.producer.productTypes || [])];
        if (allCaps.length > 0) {
            capsEl.innerHTML = allCaps.map(c =>
                `<span class="capability-tag">${c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>`
            ).join('');
        } else {
            capsEl.innerHTML = '<p style="color: var(--text-secondary);">No capabilities listed</p>';
        }
    } else {
        capsEl.innerHTML = '<p style="color: var(--text-secondary);">No capabilities listed</p>';
    }

    // Details
    const detailsEl = document.getElementById('profileDetails');
    const details = [];

    if (ratingData?.availability) details.push(`<strong>Availability:</strong> ${ratingData.availability}`);
    if (data.producer?.minBatchSize) details.push(`<strong>Min Batch Size:</strong> ${data.producer.minBatchSize}`);
    if (data.user.memberSince) details.push(`<strong>Member Since:</strong> ${new Date(data.user.memberSince).toLocaleDateString()}`);
    if (ratingData?.verified) details.push(`<strong>Verified:</strong> ✓ Yes`);

    detailsEl.innerHTML = details.length > 0
        ? details.map(d => `<p style="margin-bottom: 8px;">${d}</p>`).join('')
        : '<p style="color: var(--text-secondary);">No additional details</p>';
}

/**
 * Render profile portfolio tab
 */
function renderProfilePortfolio(portfolio) {
    const grid = document.getElementById('profilePortfolioGrid');
    if (!portfolio || portfolio.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No past projects uploaded yet.</p>';
        return;
    }

    grid.innerHTML = portfolio.map(img => `
        <div class="portfolio-item">
            <img src="${img.imageUrl}" alt="${escapeHtml(img.caption || 'Portfolio image')}" loading="lazy" onclick="showPortfolioLightbox('${img.imageUrl}', '${escapeHtml(img.caption || '')}')">
            ${img.caption ? `<div class="portfolio-caption">${escapeHtml(img.caption)}</div>` : ''}
            ${img.serviceType ? `<span class="portfolio-service-badge">${img.serviceType}</span>` : ''}
        </div>
    `).join('');
}

/**
 * Render profile products tab
 */
function renderProfileProducts(products) {
    const grid = document.getElementById('profileProductsGrid');
    if (!products || products.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No products listed yet.</p>';
        return;
    }

    grid.innerHTML = products.map(p => `
        <div class="product-card" onclick="goToProductPage('${p.id}')" style="cursor: pointer;">
            <div class="product-image-carousel">
                <div class="carousel-images">
                    <img src="${p.images && p.images[0] ? p.images[0] : '/uploads/placeholder.webp'}" alt="${escapeHtml(p.name)}" class="carousel-img active">
                </div>
            </div>
            <h3>${escapeHtml(p.name)}</h3>
            <p style="color: var(--text-secondary); font-size: 14px;">${escapeHtml((p.description || '').substring(0, 100))}</p>
            <div class="product-price" style="margin-top: 8px; font-weight: bold; color: var(--primary);">$${(p.price || 0).toFixed(2)}</div>
        </div>
    `).join('');
}

/**
 * Render profile reviews tab
 */
function renderProfileReviews(reviews) {
    const list = document.getElementById('profileReviewsList');
    if (!reviews || reviews.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No reviews yet.</p>';
        return;
    }

    list.innerHTML = reviews.map(r => `
        <div class="review-card">
            <div class="review-header">
                <span class="review-stars">${generateStars(r.rating)} ${r.rating}</span>
                ${r.verified ? '<span class="verified-badge">✓ Verified Purchase</span>' : ''}
                <span class="review-date">${new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <p class="review-comment">${escapeHtml(r.comment || '')}</p>
            <p class="review-author">— ${escapeHtml(r.reviewerName)}</p>
        </div>
    `).join('');
}

/**
 * Switch between profile tabs
 */
function switchProfileTab(tabName) {
    // Hide all profile tab contents
    document.querySelectorAll('.profile-tab-content').forEach(t => {
        t.classList.remove('active');
        t.style.display = 'none';
    });
    // Remove active from all tab buttons
    document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));

    // Show selected tab
    const tab = document.getElementById(`profileTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (tab) { tab.classList.add('active'); tab.style.display = 'block'; }

    // Mark button as active
    const buttons = document.querySelectorAll('.profile-tab-btn');
    const tabMap = { overview: 0, portfolio: 1, products: 2, reviews: 3 };
    if (buttons[tabMap[tabName]]) buttons[tabMap[tabName]].classList.add('active');
}

/**
 * Handle hash-based routing for profile pages
 */
function checkProfileRoute() {
    const hash = window.location.hash;
    const match = hash.match(/^#profile\/([a-f0-9-]+)\/?(designer|producer|materials|author|gizmo)?$/i);
    if (match) {
        loadPublicProfile(match[1], match[2] || 'designer');
        return true;
    }
    return false;
}

// Listen for hash changes to handle profile navigation
window.addEventListener('hashchange', () => {
    checkProfileRoute();
});

// Check on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => checkProfileRoute(), 500);
});


// --- Vite module exports (attach to window for HTML event handler compat) ---
window.goToHomepage = goToHomepage;
window.toggleMobileNav = toggleMobileNav;
window.closeMobileNav = closeMobileNav;
window.showMissionStatementModal = showMissionStatementModal;
window.closeMissionStatementModal = closeMissionStatementModal;
window.showFeeStructureModal = showFeeStructureModal;
window.closeFeeStructureModal = closeFeeStructureModal;
window.showDisclaimerModal = showDisclaimerModal;
window.closeDisclaimerModal = closeDisclaimerModal;
window.showTermsModal = showTermsModal;
window.closeTermsModal = closeTermsModal;
window.showPrivacyPolicyModal = showPrivacyPolicyModal;
window.closePrivacyPolicyModal = closePrivacyPolicyModal;
window.showRulesModal = showRulesModal;
window.closeRulesModal = closeRulesModal;
window.showDisputesModal = showDisputesModal;
window.closeDisputesModal = closeDisputesModal;
window.showReportModal = showReportModal;
window.closeReportModal = closeReportModal;
window.showSection = showSection;
window.showTab = showTab;
window.showLoginModal = showLoginModal;
window.closeLoginModal = closeLoginModal;
window.showSignupModal = showSignupModal;
window.closeSignupModal = closeSignupModal;
window.showResetPasswordModal = showResetPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.handleRequestReset = handleRequestReset;
window.handleResetPassword = handleResetPassword;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleSignupStep1 = handleSignupStep1;
window.handleSignupStep2 = handleSignupStep2;
window.handleSignupStep3 = handleSignupStep3;
window.goToSignupStep = goToSignupStep;
window.resendVerificationCode = resendVerificationCode;
window.toggleUserMenu = toggleUserMenu;
window.closeUserMenu = closeUserMenu;
window.toggleUserMenuInAccount = toggleUserMenuInAccount;
window.closeUserMenuInAccount = closeUserMenuInAccount;
window.updateAuthUI = updateAuthUI;
window.showContactUsModal = showContactUsModal;
window.closeContactUsModal = closeContactUsModal;
window.handleContactSubmit = handleContactSubmit;
window.showDashboardTab = showDashboardTab;
window.showSettingsTab = showSettingsTab;
window.handleProfileUpdate = handleProfileUpdate;
window.handlePasswordChange = handlePasswordChange;
window.handleAddressUpdate = handleAddressUpdate;
window.toggleBillingForm = toggleBillingForm;
window.handleBusinessIdentityUpdate = handleBusinessIdentityUpdate;
window.handleDesignerUpdate = handleDesignerUpdate;
window.handleProducerUpdate = handleProducerUpdate;
window.postNewProject = postNewProject;
window.loadPublicCustomProjects = loadPublicCustomProjects;
window.loadGizmos = loadGizmos;
window.searchGizmos = searchGizmos;
window.filterGizmos = filterGizmos;
window.displayFavoritesModal = displayFavoritesModal;
window.closeModal = closeModal;
window.closeBidDetailsModal = closeBidDetailsModal;
window.closeDisputeModal = closeDisputeModal;
window.handleFileDispute = handleFileDispute;
window.showBidDetailsModal = showBidDetailsModal;
window.openDisputeModal = openDisputeModal;
window.loadUserBids = loadUserBids;
window.loadDashboard = loadDashboard;
window.loadProfileData = loadProfileData;
window.copyShippingToBilling = copyShippingToBilling;
window.updateProductPrice = updateProductPrice;
window.generateCaptcha = generateCaptcha;
window.saveRegisteredServices = saveRegisteredServices;
window.loadRegisteredServices = loadRegisteredServices;
window.handleMaterialsUpdate = handleMaterialsUpdate;
window.handleAuthorBooksUpdate = handleAuthorBooksUpdate;
window.handleGizmoServicesUpdate = handleGizmoServicesUpdate;
window.loadMyMaterials = loadMyMaterials;
window.loadMyGizmos = loadMyGizmos;
window.handlePortfolioDragOver = handlePortfolioDragOver;
window.handlePortfolioDragLeave = handlePortfolioDragLeave;
window.handlePortfolioDrop = handlePortfolioDrop;
window.handlePortfolioFileSelect = handlePortfolioFileSelect;
window.deletePortfolioImage = deletePortfolioImage;
window.editPortfolioCaption = editPortfolioCaption;
window.showPortfolioLightbox = showPortfolioLightbox;
window.loadPortfolioGallery = loadPortfolioGallery;
window.switchProfileTab = switchProfileTab;
window.profileContactUser = function() { if (currentProfileData) contactBusiness(currentProfileData.user.id, currentProfileData.user.firstName); };
window.profileVisitWebsite = function() { const w = currentProfileData?.designer?.website || currentProfileData?.producer?.website; if (w) window.open(w, '_blank', 'noopener'); };
window.openMaterialModal = openMaterialModal;
window.openGizmoModal = openGizmoModal;
window.openListingModal = openListingModal;
window.closeListingModal = closeListingModal;
window.handleListingSave = handleListingSave;
window.toggleListingActive = toggleListingActive;
window.deleteListing = deleteListing;
window.loadSalesHistory = loadSalesHistory;
window.togglePasswordVisibility = togglePasswordVisibility;

/**
 * Toggle password field between visible text and hidden dots.
 * Called by the 👁 button next to each password input.
 */
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.textContent = isPassword ? '🙈' : '👁';
    btn.title = isPassword ? 'Hide password' : 'Show password';
}
