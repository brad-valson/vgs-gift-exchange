// js/admin.js

const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('group_id');

async function initAdminDashboard() {
    if (!groupId) {
        document.getElementById('groupTitle').textContent = '❌ Error: No Group ID provided in URL.';
        return;
    }

    try {
        // 1. Fetch Group Details
        const { data: group, error: gError } = await supabaseClient
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (gError || !group) throw new Error('Group not found');

        document.getElementById('groupTitle').textContent = `${group.name} ${group.budget ? '• Budget: ' + group.budget : ''}`;

        // 2. Fetch all participants for this group
        const { data: participants, error: pError } = await supabaseClient
            .from('participants')
            .select('*')
            .eq('group_id', groupId);

        if (pError) throw pError;

        // 3. Calculate Stats
        const total = participants.length;
        const verifiedCount = participants.filter(p => p.email_verified).length;
        const wishlistCount = participants.filter(p => p.wishlist && p.wishlist.trim() !== '').length;

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statVerified').textContent = `${verifiedCount} / ${total}`;
        document.getElementById('statWishlists').textContent = `${wishlistCount} / ${total}`;

        // 4. Render Table
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

initAdminDashboard();