// js/admin.js

const urlParams = new URLSearchParams(window.location.search);
const urlGroupId = urlParams.get('group_id');

const authSection = document.getElementById('authSection');
const dashboardSection = document.getElementById('dashboardSection');
const logoutBtn = document.getElementById('logoutBtn');
const groupSelector = document.getElementById('groupSelector');
const groupSelectorWrapper = document.getElementById('groupSelectorWrapper');

async function initAdminPage() {
    // 1. If a direct ?group_id= link is used, load that group directly
    if (urlGroupId) {
        authSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        await loadGroupDashboard(urlGroupId);
        return;
    }

    // 2. Otherwise check if organizer is logged in via Supabase Auth
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session && session.user) {
        await showOrganizerGroups(session.user.email);
    } else {
        authSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }
}

// Sign In with Email + Password
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const loginBtn = document.getElementById('loginBtn');

    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        alert('Login failed: ' + error.message);
        loginBtn.textContent = '🔐 Sign In to Dashboard';
        loginBtn.disabled = false;
        return;
    }

    await showOrganizerGroups(data.user.email);
});

// First-time Organizer Registration
document.getElementById('registerBtn').addEventListener('click', async () => {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (!email || password.length < 6) {
        alert('Please enter your Organizer Email and a password (at least 6 characters) first.');
        return;
    }

    const regBtn = document.getElementById('registerBtn');
    regBtn.textContent = 'Creating account...';
    regBtn.disabled = true;

    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        alert('Registration error: ' + error.message);
    } else if (data.session) {
        alert('Organizer account created! Loading your dashboard...');
        await showOrganizerGroups(data.user.email);
    } else {
        alert('Account created! Please check your email to confirm your address, then sign in.');
    }

    regBtn.textContent = '✨ First Time? Create Organizer Password';
    regBtn.disabled = false;
});

// Sign Out
logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'admin.html';
});

// Fetch all groups created by this organizer_email
async function showOrganizerGroups(organizerEmail) {
    authSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    logoutBtn.style.display = 'inline-block';

    const { data: groups, error } = await supabaseClient
        .from('groups')
        .select('*')
        .ilike('organizer_email', organizerEmail)
        .order('created_at', { ascending: false });

    if (error || !groups || groups.length === 0) {
        document.getElementById('groupTitle').textContent = `No gift exchanges found for ${organizerEmail}`;
        document.getElementById('participantTableContainer').innerHTML = 
            '<p>Create a new exchange using this email address to manage it here!</p>';
        return;
    }

    // Populate dropdown if organizer has multiple exchanges
    if (groups.length > 1) {
        groupSelector.innerHTML = '';
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = `${g.name}${g.budget ? ' (Budget: ' + g.budget + ')' : ''}`;
            groupSelector.appendChild(opt);
        });
        groupSelectorWrapper.style.display = 'block';
        groupSelector.onchange = () => loadGroupDashboard(groupSelector.value);
    }

    // Load the most recent group first
    await loadGroupDashboard(groups[0].id);
}

// Render stats and participant table for a specific group ID
async function loadGroupDashboard(groupId) {
    try {
        const { data: group, error: gError } = await supabaseClient
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (gError || !group) throw new Error('Group not found');

        document.getElementById('groupTitle').textContent = `${group.name}${group.budget ? ' • Budget: ' + group.budget : ''}`;

        const { data: participants, error: pError } = await supabaseClient
            .from('participants')
            .select('*')
            .eq('group_id', groupId);

        if (pError) throw pError;

        const total = participants.length;
        const verifiedCount = participants.filter(p => p.email_verified).length;
        const wishlistCount = participants.filter(p => p.wishlist && p.wishlist.trim() !== '').length;

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statVerified').textContent = `${verifiedCount} / ${total}`;
        document.getElementById('statWishlists').textContent = `${wishlistCount} / ${total}`;

        const container = document.getElementById('participantTableContainer');
        if (total === 0) {
            container.innerHTML = '<p>No participants found for this group.</p>';
            return;
        }

        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

        let html = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); color: #555;">
                            <th style="padding: 10px;">Name</th>
                            <th style="padding: 10px;">Email</th>
                            <th style="padding: 10px; text-align: center;">Email Verified</th>
                            <th style="padding: 10px; text-align: center;">Wishlist Status</th>
                            <th style="padding: 10px; text-align: center;">Secret Link</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        participants.forEach(p => {
            const secretLink = `${baseUrl}draw.html?token=${p.secret_token}`;
            const isVerified = p.email_verified 
                ? '<span style="color: #2e7d32; font-weight: bold;">✔ Verified</span>' 
                : '<span style="color: #e65100;">⏳ Pending</span>';
            const hasWishlist = p.wishlist && p.wishlist.trim() !== '' 
                ? '<span style="color: #2e7d32;">Filled</span>' 
                : '<span style="color: #888;">Empty</span>';

            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px 10px; font-weight: 500;">${p.name}</td>
                    <td style="padding: 12px 10px; color: #555;">${p.email}</td>
                    <td style="padding: 12px 10px; text-align: center;">${isVerified}</td>
                    <td style="padding: 12px 10px; text-align: center;">${hasWishlist}</td>
                    <td style="padding: 12px 10px; text-align: center;">
                        <button class="btn" style="padding: 5px 10px; font-size: 0.8rem;" onclick="navigator.clipboard.writeText('${secretLink}'); alert('Copied link for ${p.name}!');">Copy Link</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

    } catch (err) {
        document.getElementById('groupTitle').textContent = 'Error loading dashboard data.';
        console.error(err);
    }
}

initAdminPage();