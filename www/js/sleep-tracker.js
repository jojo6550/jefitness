document.addEventListener('DOMContentLoaded', () => {
// Determine the base URL
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';
  const sleepLogForm = document.getElementById('sleepLogFormPage');
  const sleepHoursInput = document.getElementById('sleepHoursInputPage');
  const sleepHistoryList = document.getElementById('sleepHistoryList');
  const formMessage = document.getElementById('formMessage');

  let sleepLogs = [];
  let sortBy = 'date';
  let sortOrder = 'desc';

  function showMessage(message, type = 'success') {
    formMessage.textContent = message;
    formMessage.className = 'alert alert-' + type;
    formMessage.classList.remove('d-none');
    setTimeout(() => {
      formMessage.classList.add('d-none');
    }, 5000);
  }

  async function fetchSleepLogs() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sleep?sortBy=${sortBy}&order=${sortOrder}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('token')
        }
      });
      if (!response.ok) throw new Error('Failed to fetch sleep logs');
      sleepLogs = await response.json();
      renderSleepTable();
    } catch (error) {
      sleepHistoryList.innerHTML = '<div class="text-danger text-center py-3">Error loading sleep history.</div>';
      console.error(error);
    }
  }

  function renderSleepTable() {
    if (sleepLogs.length === 0) {
      sleepHistoryList.innerHTML = '<div class="text-muted text-center py-3">No sleep logs found.</div>';
      return;
    }

    let tableHtml = `
      <table class="table table-striped table-hover">
        <thead>
          <tr>
            <th scope="col" style="cursor:pointer" id="thDate">Date <i class="bi bi-arrow-down-up"></i></th>
            <th scope="col" style="cursor:pointer" id="thHours">Hours Slept <i class="bi bi-arrow-down-up"></i></th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    sleepLogs.forEach(log => {
      // Fix date offset by using UTC date string
      const dateStr = new Date(log.date).toISOString().split('T')[0];
      tableHtml += `
        <tr data-id="${log._id}">
          <td class="date-cell">${dateStr}</td>
          <td class="hours-cell">${log.hoursSlept}</td>
          <td>
          <button class="btn btn-sm btn-primary btn-edit">Edit</button>
          <!-- Delete button removed as per user request -->
          </td>
        </tr>
      `;
    });

    tableHtml += '</tbody></table>';
    sleepHistoryList.innerHTML = tableHtml;

    document.getElementById('thDate').addEventListener('click', () => {
      if (sortBy === 'date') {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy = 'date';
        sortOrder = 'asc';
      }
      fetchSleepLogs();
    });

    document.getElementById('thHours').addEventListener('click', () => {
      if (sortBy === 'hoursSlept') {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy = 'hoursSlept';
        sortOrder = 'asc';
      }
      fetchSleepLogs();
    });

    document.querySelectorAll('.btn-edit').forEach(button => {
      button.addEventListener('click', handleEdit);
    });
    // Delete button event listeners removed as delete feature is removed
  }

  sleepLogForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hours = parseFloat(sleepHoursInput.value);
    if (isNaN(hours) || hours < 0 || hours > 24) {
      showMessage('Please enter a valid number of hours between 0 and 24.', 'danger');
      return;
    }

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    // Check if a log for today exists
    const existingLog = sleepLogs.find(log => new Date(log.date).toISOString().split('T')[0] === dateStr);

    try {
      let response;
      if (existingLog) {
        // Update existing log
        response = await fetch(`${API_BASE_URL}/api/sleep/${existingLog._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('token')
          },
          body: JSON.stringify({ date: dateStr, hoursSlept: hours })
        });
      } else {
        // Create new log
        response = await fetch(`${API_BASE_URL}/api/sleep`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('token')
          },
          body: JSON.stringify({ date: dateStr, hoursSlept: hours })
        });
      }
      if (!response.ok) throw new Error('Failed to log sleep');
      sleepHoursInput.value = '';
      showMessage('Sleep logged successfully.');
      await fetchSleepLogs();
    } catch (error) {
      showMessage('Error logging sleep. Please try again.', 'danger');
      console.error(error);
    }
  });

  function handleEdit(event) {
    const row = event.target.closest('tr');
    const id = row.dataset.id;
    const dateCell = row.querySelector('.date-cell');
    const hoursCell = row.querySelector('.hours-cell');

    const dateValue = new Date(dateCell.textContent).toISOString().split('T')[0];
    dateCell.innerHTML = `<input type="date" class="form-control form-control-sm" value="${dateValue}">`;
    hoursCell.innerHTML = `<input type="number" class="form-control form-control-sm" min="0" max="24" step="0.5" value="${hoursCell.textContent}">`;

    const actionsCell = row.querySelector('td:last-child');
    actionsCell.innerHTML = `
      <button class="btn btn-sm btn-success btn-save">Save</button>
      <button class="btn btn-sm btn-secondary btn-cancel">Cancel</button>
    `;

    actionsCell.querySelector('.btn-save').addEventListener('click', () => saveEdit(id, row));
    actionsCell.querySelector('.btn-cancel').addEventListener('click', () => fetchSleepLogs());
  }

  async function saveEdit(id, row) {
    const dateInput = row.querySelector('input[type="date"]');
    const hoursInput = row.querySelector('input[type="number"]');
    const date = dateInput.value;
    const hours = parseFloat(hoursInput.value);

    if (!date) {
      showMessage('Please select a valid date.', 'danger');
      return;
    }
    if (isNaN(hours) || hours < 0 || hours > 24) {
      showMessage('Please enter a valid number of hours between 0 and 24.', 'danger');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/sleep/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('token')
        },
        body: JSON.stringify({ date, hoursSlept: hours })
      });
      if (!response.ok) throw new Error('Failed to update sleep log');
      showMessage('Sleep log updated successfully.');
      await fetchSleepLogs();
    } catch (error) {
      showMessage('Error updating sleep log. Please try again.', 'danger');
      console.error(error);
    }
  }

  // Delete feature removed as per user request

  fetchSleepLogs();
});
