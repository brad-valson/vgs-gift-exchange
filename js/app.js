// js/app.js

const participantsContainer = document.getElementById('participantsList');
const addRowBtn = document.getElementById('addRowBtn');
const groupForm = document.getElementById('groupForm');
const resultSection = document.getElementById('resultSection');

// Add a participant row with a dynamic exclusion dropdown
function addParticipantRow(name = '', email = '', selectedExclude = '') {
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `
        <input type="text" placeholder="Participant Name" class="p-name" value="${name}" required>
        <input type="email" placeholder="Email Address" class="p-email" value="${email}" required>
        <select class="p-exclude">
            <option value="">-- No Exclusion --</option>
        </select>
        <button type="button" class="btn-danger remove-row" title="Remove">✕</button>
    `;
    
    // Listen for name changes to update dropdowns globally
    row.querySelector('.p-name').addEventListener('input', updateAllDropdowns);

    row.querySelector('.remove-row').addEventListener('click', () => {
        if (participantsContainer.children.length > 3) {
            row.remove();
            updateAllDropdowns();
        } else {
            alert('A Secret Santa exchange requires at least 3 participants.');
        }
    });

    participantsContainer.appendChild(row);
    updateAllDropdowns();
    
    // If loading an initial value, set it after options populate
    if (selectedExclude) {
        row.querySelector('.p-exclude').value = selectedExclude;
    }
}

// Dynamically refresh every exclusion dropdown based on current names entered
function updateAllDropdowns() {
    const rows = document.querySelectorAll('.participant-row');
    const allNames = [];

    // 1. Gather all non-empty names
    rows.forEach(row => {
        const nameVal = row.querySelector('.p-name').value.trim();
        if (nameVal) allNames.push(nameVal);
    });

    // 2. Update each row's dropdown options
    rows.forEach(row => {
        const select = row.querySelector('.p-exclude');
        const currentVal = select.value; // Remember what was selected
        const currentName = row.querySelector('.p-name').value.trim();

        // Clear existing options except default
        select.innerHTML = '<option value="">-- No Exclusion --</option>';

        // Populate with other participants' names
        allNames.forEach(n => {
            // Optional: Don't let someone exclude themselves
            if (n.toLowerCase() !== currentName.toLowerCase()) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = `Exclude: ${n}`;
                select.appendChild(opt);
            }
        });

        // Restore previous selection if it still exists
        select.value = currentVal;
    });
}

// Initialize with 3 default rows
for (let i = 0; i < 3; i++) {
    addParticipantRow();
}

addRowBtn.addEventListener('click', () => addParticipantRow());

// Secret Santa Matching Algorithm (Derangement with exclusion support)
function shuffleAndMatch(participants) {
    let shuffled = [...participants];
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
        attempts++;
        // Fisher-Yates shuffle
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        let valid = true;
        for (let i = 0; i < participants.length; i++) {
            const giver = participants[i];
            const recipient = shuffled[i];

            // Rule 1: Can't draw yourself
            if (giver.email === recipient.email) {
                valid = false;
                break;
            }
            // Rule 2: Respect exclusion
            if (giver.excluded_name && giver.excluded_name.trim().toLowerCase() === recipient.name.trim().toLowerCase()) {
                valid = false;
                break;
            }
        }

        if (valid) {
            return shuffled;
        }
    }

    return null;
}

// Handle Form Submission
groupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.textContent = 'Generating Matches...';
    submitBtn.disabled = true;

    const groupName = document.getElementById('groupName').value.trim();
    const organizerEmail = document.getElementById('organizerEmail').value.trim();
    const budget = document.getElementById('budget').value.trim();

    const rowElements = document.querySelectorAll('.participant-row');
    const participantsData = [];

    rowElements.forEach(row => {
        participantsData.push({
            name: row.querySelector('.p-name').value.trim(),
            email: row.querySelector('.p-email').value.trim(),
            excluded_name: row.querySelector('.p-exclude').value.trim()
        });
    });

    if (participantsData.length < 3) {
        alert('Please add at least 3 participants.');
        submitBtn.textContent = '🚀 Run Secret Santa & Generate Links';
        submitBtn.disabled = false;
        return;
    }

    const recipients = shuffleAndMatch(participantsData);
    if (!recipients) {
        alert('Could not find a valid pairing with the current exclusions. Try adjusting some exclusion rules and try again.');
        submitBtn.textContent = '🚀 Run Secret Santa & Generate Links';
        submitBtn.disabled = false;
        return;
    }

    try {
        // 1. Insert Group into Supabase
        const { data: groupData, error: groupError } = await supabaseClient
            .from('groups')
            .insert([{ name: groupName, organizer_email: organizerEmail, budget: budget, is_drawn: true }])
            .select()
            .single();

        if (groupError) throw groupError;
        const groupId = groupData.id;

        // 2. Insert Participants
        let insertedParticipants = [];
        for (let p of participantsData) {
            const { data, error } = await supabaseClient
                .from('participants')
                .insert([{
                    group_id: groupId,
                    name: p.name,
                    email: p.email,
                    excluded_name: p.excluded_name
                }])
                .select()
                .single();

            if (error) throw error;
            insertedParticipants.push(data);
        }

        // 3. Map recipients & update recipient_id
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        let finalOutputLinks = [];

        for (let i = 0; i < insertedParticipants.length; i++) {
            const giver = insertedParticipants[i];
            const matchedRecipientName = recipients[i].name;
            const recipientObj = insertedParticipants.find(p => p.name.toLowerCase() === matchedRecipientName.toLowerCase());

            const { error: updateError } = await supabaseClient
                .from('participants')
                .update({ recipient_id: recipientObj.id })
                .eq('id', giver.id);

            if (updateError) throw updateError;

            const secretLink = `${baseUrl}draw.html?token=${giver.secret_token}`;

            finalOutputLinks.push({
                name: giver.name,
                email: giver.email,
                link: secretLink
            });
        }

        // 4. Display Success, Admin Dashboard Link & Participant Links
        const adminUrl = `${baseUrl}admin.html?group_id=${groupId}`;

        groupForm.style.display = 'none';
        let linksHtml = `
            <div class="links-container">
                <h2>🎉 Draw Complete!</h2>
                <div style="background: #e8f5e9; border: 1px solid #c8e6c9; padding: 15px; border-radius: 8px; margin: 15px 0 20px 0; text-align: center;">
                    <p style="margin-bottom: 8px; font-weight: bold; color: #2e7d32;">📊 Organizer Admin Dashboard:</p>
                    <a href="${adminUrl}" target="_blank" class="btn" style="display: inline-block; width: auto; text-decoration: none; padding: 8px 16px; font-size: 0.9rem;">Open Live Admin Dashboard ↗</a>
                    <p style="font-size: 0.75rem; color: #666; margin-top: 6px;">Bookmark this link to check verification stats and wishlist updates anytime!</p>
                </div>
                <p style="margin: 10px 0 20px 0; font-size: 0.95rem;">
                    The Secret Santa pairs have been locked in securely. Copy and send each person their private link below:
                </p>
        `;

        finalOutputLinks.forEach(item => {
            linksHtml += `
                <div class="link-item">
                    <div>
                        <strong>${item.name}</strong> <span style="color:#6c757d; font-size:0.85rem;">(${item.email})</span>
                    </div>
                    <div>
                        <button class="btn" style="padding: 6px 12px; font-size: 0.85rem;" onclick="navigator.clipboard.writeText('${item.link}'); alert('Copied link for ${item.name}!');">Copy Link</button>
                    </div>
                </div>
                <div style="font-size: 0.8rem; color: #555; margin-top: 4px; word-break: break-all;">${item.link}</div>
                <hr style="margin: 10px 0; border: 0; border-top: 1px dashed #c8e6c9;">
            `;
        });

        linksHtml += `</div>`;
        resultSection.innerHTML = linksHtml;
        resultSection.style.display = 'block';

    } catch (err) {
        alert('Error saving group: ' + err.message);
        submitBtn.textContent = '🚀 Run Secret Santa & Generate Links';
        submitBtn.disabled = false;
    }
});