document.addEventListener("DOMContentLoaded", () => {
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

  let sleepChart = null;
  let bmiChart = null;
  let caloriesChart = null;
  let macroChart = null;

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

  async function fetchNutritionLogs() {
    try {
      const response = await fetch(API_BASE_URL + "/api/nutrition", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token"),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch nutrition logs");
      return await response.json();
    } catch (error) {
      console.error(error);
      return { nutritionLogs: [] };
    }
  }

  function renderSleepChart(sleepLogs) {
    const ctx = document.getElementById("sleepChart").getContext("2d");
const labels = sleepLogs.map(log => new Date(log.date).toISOString().split('T')[0]);
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

  function renderCaloriesChart(nutritionLogs) {
    const ctx = document.getElementById("caloriesChart").getContext("2d");

    // Group by date and sum calories
    const dailyCalories = {};
    nutritionLogs.forEach(log => {
      const date = new Date(log.date).toISOString().split('T')[0];
      dailyCalories[date] = (dailyCalories[date] || 0) + log.calories;
    });

    const labels = Object.keys(dailyCalories).sort();
    const data = labels.map(date => dailyCalories[date]);

    if (caloriesChart) {
      caloriesChart.destroy();
    }

    caloriesChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Daily Calories",
          data: data,
          borderColor: "rgba(255, 159, 64, 1)",
          backgroundColor: "rgba(255, 159, 64, 0.2)",
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
            title: {
              display: true,
              text: "Calories"
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

  function renderMacroChart(nutritionLogs) {
    const ctx = document.getElementById("macroChart").getContext("2d");

    // Sum all macros
    const totalMacros = nutritionLogs.reduce((acc, log) => {
      acc.protein += log.protein || 0;
      acc.carbs += log.carbs || 0;
      acc.fats += log.fats || 0;
      return acc;
    }, { protein: 0, carbs: 0, fats: 0 });

    if (macroChart) {
      macroChart.destroy();
    }

    macroChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Protein", "Carbs", "Fats"],
        datasets: [{
          data: [totalMacros.protein, totalMacros.carbs, totalMacros.fats],
          backgroundColor: [
            "rgba(54, 162, 235, 0.7)",
            "rgba(255, 205, 86, 0.7)",
            "rgba(255, 99, 132, 0.7)"
          ],
          borderColor: [
            "rgba(54, 162, 235, 1)",
            "rgba(255, 205, 86, 1)",
            "rgba(255, 99, 132, 1)"
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: ${value}g`;
              }
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

    const nutritionData = await fetchNutritionLogs();
    const nutritionLogs = nutritionData.nutritionLogs || [];
    renderCaloriesChart(nutritionLogs);
    renderMacroChart(nutritionLogs);
  }

  init();
});
