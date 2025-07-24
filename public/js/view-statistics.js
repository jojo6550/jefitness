document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "http://localhost:5000";

  let sleepChart = null;
  let bmiChart = null;

  async function fetchSleepLogs() {
    try {
      const response = await fetch(API_BASE_URL + "/api/sleep?sortBy=date&order=asc", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token"),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch sleep logs");
      return await response.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async function fetchUserProfile() {
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/me", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token"),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch user profile");
      return await response.json();
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function renderSleepChart(sleepLogs) {
    const ctx = document.getElementById("sleepChart").getContext("2d");
    const labels = sleepLogs.map(log => new Date(log.date).toLocaleDateString());
    const data = sleepLogs.map(log => log.hoursSlept);

    if (sleepChart) {
      sleepChart.destroy();
    }

    sleepChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Hours Slept",
          data: data,
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 12,
            title: {
              display: true,
              text: "Hours"
            }
          },
          x: {
            title: {
              display: true,
              text: "Date"
            }
          }
        }
      }
    });
  }

  function renderBmiChart(startWeight, currentWeight) {
    const ctx = document.getElementById("bmiChart").getContext("2d");

    if (bmiChart) {
      bmiChart.destroy();
    }

    bmiChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Start Weight", "Current Weight"],
        datasets: [{
          label: "Weight (lbs)",
          data: [startWeight || 0, currentWeight || 0],
          backgroundColor: [
            "rgba(255, 99, 132, 0.7)",
            "rgba(75, 192, 192, 0.7)"
          ],
          borderColor: [
            "rgba(255, 99, 132, 1)",
            "rgba(75, 192, 192, 1)"
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Weight (lbs)"
            }
          }
        }
      }
    });
  }

  async function init() {
    const sleepLogs = await fetchSleepLogs();
    renderSleepChart(sleepLogs);

    const profile = await fetchUserProfile();
    if (profile) {
      renderBmiChart(profile.startWeight, profile.currentWeight);
    }
  }

  init();
});
