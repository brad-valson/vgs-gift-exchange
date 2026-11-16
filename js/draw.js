// js/draw.js

const urlParams = new URLSearchParams(window.location.search);
const secretToken = urlParams.get('token');

const groupHeader = document.getElementById('groupHeader');
const errorBox = document.getElementById('errorBox');
const verifySection = document.getElementById('verifySection');
const revealSection = document.getElementById('revealSection');

let currentParticipant = null;
let currentGroup = null;

async function initDrawPage() {
    if (!secretToken) {
        groupHeader.style.display = 'none';
        errorBox.style.display = 'block';
        return;
    }

    try {
        // 1. Fetch participant by secret_token
        const { data: participant, error: pError } = await supabaseClient
            .from('participants')
            .select('*')
            .eq('secret_token', secretToken)
            .single();

        if (pError || !participant) {
            throw new Error('Participant not found');
        }
        currentParticipant = participant;

        // 2. Fetch group details
        const { data: group, error: gError } = await supabaseClient
            .from('groups')
            .select('*')
            .eq('id', participant.group_id)
            .single();

        if (gError || !group) {
            throw new Error('Group not found');
        }
        currentGroup = group;

        groupHeader.textContent = `${group.name}${group.budget ? ' • Budget: ' + group.budget : ''}`;

        // 3. Check if email is already verified
        if (participant.email_verified) {
            await showRevealScreen();
        } else {
            showVerificationScreen();
        }

    } catch (err) {
        groupHeader.style.display = 'none';
        errorBox.style.display = 'block';
    }
}

function showVerificationScreen() {
    document.getElementById('verifyParticipantName').textContent = currentParticipant.name;
    document.getElementById('verifyParticipantEmail').textContent = currentParticipant.email;
    verifySection.style.display = 'block';
}

// Send 6-digit OTP via Supabase Auth
document.getElementById('sendCodeBtn').addEventListener('click', async () => {
    const sendBtn = document.getElementById('sendCodeBtn');
    sendBtn.textContent = 'Sending code...';
    sendBtn.disabled = true;

    const { error } = await supabaseClient.auth.signInWithOtp({
        email: currentParticipant.email,
        options: {
            shouldCreateUser: true
        }
    });

    if (error) {
        alert('Error sending verification email: ' + error.message);
        sendBtn.textContent = '📧 Send 6-Digit Verification Code';
        sendBtn.disabled = false;
    } else {
        alert(`A 6-digit verification code has been sent to ${currentParticipant.email}. Check your inbox (and spam folder)!`);
        sendBtn.textContent = 'Resend Verification Code';
        sendBtn.disabled = false;
        document.getElementById('otpInputGroup').style.display = 'block';
    }
});

// Verify 6-digit OTP
document.getElementById('verifyCodeBtn').addEventListener('click', async () => {
    const otpCode = document.getElementById('otpCode').value.trim();
    const verifyBtn = document.getElementById('verifyCodeBtn');

    if (otpCode.length < 6) {
        alert('Please enter the 6-digit code from your email.');
        return;
    }

    verifyBtn.textContent = 'Verifying...';
    verifyBtn.disabled = true;

    const { error } = await supabaseClient.auth.verifyOtp({
        email: currentParticipant.email,
        token: otpCode,
        type: 'email'
    });

    if (error) {
        alert('Invalid or expired code: ' + error.message);
        verifyBtn.textContent = '✅ Verify & Reveal My Match';
        verifyBtn.disabled = false;
        return;
    }

    // Mark participant as verified in database so future visits open immediately
    await supabaseClient
        .from('participants')
        .update({ email_verified: true })
        .eq('id', currentParticipant.id);

    currentParticipant.email_verified = true;
    verifySection.style.display = 'none';
    await showRevealScreen();
});

async function showRevealScreen() {
    // Fetch the matched recipient's name and wishlist
    const { data: recipient, error } = await supabaseClient
        .from('participants')
        .select('name, wishlist')
        .eq('id', currentParticipant.recipient_id)
        .single();

    if (error || !recipient) {
        alert('Could not load your match details. Please contact the organizer.');
        return;
    }

    document.getElementById('giverName').textContent = currentParticipant.name;
    document.getElementById('recipientName').textContent = `🎅 ${recipient.name}`;
    
    if (currentGroup.budget) {
        document.getElementById('budgetDisplay').textContent = `Suggested Gift Budget: ${currentGroup.budget}`;
    }

    document.getElementById('recipientWishlistLabel').textContent = `${recipient.name}'s Wishlist:`;
    if (recipient.wishlist && recipient.wishlist.trim() !== '') {
        document.getElementById('recipientWishlist').textContent = recipient.wishlist;
    }

    document.getElementById('myWishlist').value = currentParticipant.wishlist || '';
    revealSection.style.display = 'block';
}

// Save participant's own wishlist
document.getElementById('saveWishlistBtn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveWishlistBtn');
    const newWishlist = document.getElementById('myWishlist').value.trim();

    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    const { error } = await supabaseClient
        .from('participants')
        .update({ wishlist: newWishlist })
        .eq('id', currentParticipant.id);

    if (error) {
        alert('Error saving wishlist: ' + error.message);
    } else {
        alert('Your wishlist has been saved! Your Secret Santa can now see it.');
    }

    saveBtn.textContent = '💾 Save My Wishlist';
    saveBtn.disabled = false;
});

// Start initialization
initDrawPage();