document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "http://localhost:5000";
  const lastSleepHoursDisplay = document.getElementById("lastSleepHoursDisplay");

  async function fetchLastSleepLog() {
    try {
      const response = await fetch(
        API_BASE_URL + "/api/sleep?sortBy=date&order=desc&limit=1",
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + localStorage.getItem("token"),
          },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch sleep logs");
      const sleepLogs = await response.json();
      if (sleepLogs.length > 0) {
        const lastLogDate = new Date(sleepLogs[0].date)
          .toISOString()
          .split("T")[0];
        lastSleepHoursDisplay.textContent = "Last Log: " + lastLogDate;
      } else {
        lastSleepHoursDisplay.textContent = "Last Log: Not logged";
      }
    } catch (error) {
      console.error(error);
      lastSleepHoursDisplay.textContent = "Last Log: Error loading";
    }
  }

  fetchLastSleepLog();
});
