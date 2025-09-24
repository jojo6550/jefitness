document.addEventListener('DOMContentLoaded', () => {
    const dailyPlanForm = document.getElementById('dailyPlanForm');
    const planDaySelect = document.getElementById('planDay');
    const planTitleInput = document.getElementById('planTitle');
    const planNotesInput = document.getElementById('planNotes');
    const weeklyScheduleDisplay = document.getElementById('weeklyScheduleDisplay');

    let schedule = {
        lastReset: new Date().toISOString(),
        plans: []
    };

    const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Fetch the user's schedule from backend
    async function fetchSchedule() {
        try {
            const res = await fetch('/api/auth/schedule', {
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.lastReset && data.plans) {
                    schedule = data;
                    checkReset();
                    renderSchedule();
                }
            } else {
                console.error('Failed to fetch schedule');
            }
        } catch (err) {
            console.error('Error fetching schedule:', err);
        }
    }

    // Check if 7 days have passed since last reset
    function checkReset() {
        const lastResetDate = new Date(schedule.lastReset);
        const now = new Date();
        const diffTime = now - lastResetDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays >= 7) {
            schedule.plans = [];
            schedule.lastReset = now.toISOString();
            saveSchedule();
        }
    }

    // Save the schedule to backend
    async function saveSchedule() {
        try {
            const res = await fetch('/api/auth/schedule', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ schedule })
            });
            if (!res.ok) {
                console.error('Failed to save schedule');
            }
        } catch (err) {
            console.error('Error saving schedule:', err);
        }
    }

    // Update the day options in the select dropdown based on current schedule
    function updateDayOptions() {
        const usedDays = schedule.plans.map(p => p.day);
        planDaySelect.innerHTML = '<option value="">Choose...</option>';
        allDays.forEach(day => {
            if (!usedDays.includes(day)) {
                planDaySelect.innerHTML += `<option value="${day}">${capitalize(day)}</option>`;
            }
        });
    }

    // Render the schedule in the display area with edit and delete buttons
    function renderSchedule() {
        if (schedule.plans.length === 0) {
            weeklyScheduleDisplay.innerHTML = '<div class="text-muted text-center py-3">No plans set for this week.</div>';
            updateDayOptions();
            return;
        }
        let html = '<ul class="list-group">';
        schedule.plans.forEach((plan, index) => {
            const titles = plan.planTitles.join(' and ');
            html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${capitalize(plan.day)}</strong>: ${titles}
                            ${plan.notes ? `<br><small>${plan.notes}</small>` : ''}
                        </div>
                        <div>
                            <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-index="${index}">Edit</button>
                            <button class="btn btn-sm btn-outline-danger" data-action="delete" data-index="${index}">Delete</button>
                        </div>
                    </li>`;
        });
        html += '</ul>';
        weeklyScheduleDisplay.innerHTML = html;
        updateDayOptions();

        // Attach event listeners for edit and delete buttons
        document.querySelectorAll('button[data-action="edit"]').forEach(button => {
            button.addEventListener('click', () => {
                const idx = parseInt(button.getAttribute('data-index'));
                editPlan(idx);
            });
        });
        document.querySelectorAll('button[data-action="delete"]').forEach(button => {
            button.addEventListener('click', () => {
                const idx = parseInt(button.getAttribute('data-index'));
                deletePlan(idx);
            });
        });
    }

    // Capitalize first letter helper
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Edit a plan: populate form with existing data and remove plan from schedule temporarily
    function editPlan(index) {
        const plan = schedule.plans[index];
        planDaySelect.value = plan.day;
        planTitleInput.value = plan.planTitles.join(' and ');
        planNotesInput.value = plan.notes || '';

        // Remove the plan from schedule to allow update
        schedule.plans.splice(index, 1);
        renderSchedule();
    }

    // Delete a plan from schedule
    async function deletePlan(index) {
        if (!confirm('Are you sure you want to delete this plan?')) return;
        schedule.plans.splice(index, 1);
        await saveSchedule();
        renderSchedule();
    }

    // Handle form submission
    dailyPlanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const day = planDaySelect.value;
        const title = planTitleInput.value.trim();
        const notes = planNotesInput.value.trim();

        if (!day || !title) {
            alert('Please select a day and enter a plan title.');
            return;
        }

        // Check if day already has a plan (should not happen due to dropdown update)
        const existingPlanIndex = schedule.plans.findIndex(p => p.day === day);
        if (existingPlanIndex !== -1) {
            // Combine plan titles if not already included
            const existingPlan = schedule.plans[existingPlanIndex];
            if (!existingPlan.planTitles.includes(title)) {
                existingPlan.planTitles.push(title);
                if (notes) {
                    existingPlan.notes = existingPlan.notes ? existingPlan.notes + ' | ' + notes : notes;
                }
            }
        } else {
            // Add new plan for the day
            schedule.plans.push({
                day,
                planTitles: [title],
                notes: notes || ''
            });
        }

        await saveSchedule();
        renderSchedule();

        // Reset form
        dailyPlanForm.reset();
    });

    // Initial fetch and render
    fetchSchedule();
});
