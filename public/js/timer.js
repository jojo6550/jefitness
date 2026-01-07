document.addEventListener('DOMContentLoaded', function() {
    // --- Timer Elements ---
    const timerDisplay = document.getElementById('timerDisplay');
    const startPauseBtn = document.getElementById('startPauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const presetButtons = document.querySelectorAll('.timer-presets button');

    // Add ripple effect to buttons
    if (startPauseBtn) startPauseBtn.classList.add('btn-ripple');
    if (resetBtn) resetBtn.classList.add('btn-ripple');
    presetButtons.forEach(btn => btn.classList.add('btn-ripple'));

    // Custom Alert Modal elements
    const customAlertModal = new bootstrap.Modal(document.getElementById('customAlertModal'));
    const customAlertModalBody = document.getElementById('customAlertModalBody');

    // --- Tone.js Setup ---
    // Create a simple synth (oscillator + envelope) for the main beep (not used for alarm now, but kept if needed elsewhere)
    const synth = new Tone.Synth().toDestination();

    // Create a separate synth for the whistle alarm sound
    const whistleSynth = new Tone.Synth({
        oscillator: {
            type: "sine" // Sine wave for a cleaner, whistle-like tone
        },
        envelope: {
            attack: 0.01,   // Very fast attack
            decay: 0.1,    // Quick decay
            sustain: 0.05, // Short sustain
            release: 0.1   // Quick release
        }
    }).toDestination();

    let whistleInterval; // To store the interval ID for the rapid beeps

    // Function to play a whistle-like alarm rapidly for about 5 seconds
    function playWhistleAlarm() {
        let duration = 5000; // Total duration of the alarm (5 seconds)
        let beepDuration = 200; // Duration of each individual beep in milliseconds
        let beepInterval = 300; // Interval between the start of each beep in milliseconds
        let beepCount = 0;
        let maxBeeps = Math.floor(duration / beepInterval); // Calculate how many beeps in total

        // Clear any existing whistle alarm interval to prevent overlapping alarms
        if (whistleInterval) {
            clearInterval(whistleInterval);
        }

        whistleInterval = setInterval(() => {
            if (beepCount < maxBeeps) {
                // Play a high-pitched note (e.g., C6 or D6) for the whistle sound
                whistleSynth.triggerAttackRelease("C6", `${beepDuration / 1000}s`); // Convert ms to seconds for Tone.js
                beepCount++;
            } else {
                clearInterval(whistleInterval); // Stop the alarm after the calculated duration
            }
        }, beepInterval);
    }

    // Function to play the alarm sound (now calls the whistle alarm)
    function playBeep() {
        playWhistleAlarm();
    }

    // Function to show custom alert modal
    function showCustomAlert(message) {
        customAlertModalBody.textContent = message;
        customAlertModal.show();
    }

    // --- Timer Variables ---
    let timerInterval; // Stores the setInterval ID for the main timer countdown
    let timeLeft = 0; // Time in seconds
    let totalTime = 0; // Total time set for the timer in seconds
    let isRunning = false;

    // --- Helper Functions ---

    // Formats seconds into MM:SS format
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(remainingSeconds).padStart(2, '0');
        return `${formattedMinutes}:${formattedSeconds}`;
    }
    
    // Get the progress ring circle element
    const timerRingProgress = document.querySelector('.timer-ring-progress');

    // Updates the timer display and progress ring
    function updateDisplay() {
        timerDisplay.textContent = formatTime(timeLeft);
        if (timeLeft > 0 && totalTime > 0) {
            const progress = timeLeft / totalTime;
            const dashoffset = 439.82 * progress;
            timerRingProgress.style.strokeDashoffset = dashoffset;
        } else {
            timerRingProgress.style.strokeDashoffset = 439.82;
        }
    }

    // --- Timer Core Logic ---

    function startTimer() {
        // Before starting, ensure Tone.js context is active (important for mobile browsers)
        // This needs to be triggered by a user gesture (like a button click)
        if (Tone.context.state !== 'running') {
            Tone.start();
        }

        if (isRunning) return; // Prevent multiple intervals
        isRunning = true;
        startPauseBtn.innerHTML = '<i class="bi bi-pause-fill me-2"></i>Pause';
        startPauseBtn.classList.remove('btn-primary');
        startPauseBtn.classList.add('btn-warning');

        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateDisplay();
            } else {
                // Timer finished
                clearInterval(timerInterval);
                isRunning = false;
                startPauseBtn.innerHTML = '<i class="bi bi-play-fill me-2"></i>Start';
                startPauseBtn.classList.remove('btn-warning');
                startPauseBtn.classList.add('btn-primary');
                playBeep(); // Play the whistle alarm sound
                showCustomAlert("Time's up! Rest or next set!"); // Use custom alert
            }
        }, 1000); // Update every second
    }

    function pauseTimer() {
        clearInterval(timerInterval);
        // Also clear the whistle alarm if it's currently playing
        if (whistleInterval) {
            clearInterval(whistleInterval);
        }
        isRunning = false;
        startPauseBtn.innerHTML = '<i class="bi bi-play-fill me-2"></i>Start';
        startPauseBtn.classList.remove('btn-warning');
        startPauseBtn.classList.add('btn-primary');
    }

    function resetTimer() {
        pauseTimer(); // Stop if running and clear any active alarm
        timeLeft = 0; // Reset time
        updateDisplay();
    }

    function setTimer(minutes, seconds) {
        pauseTimer(); // Pause current timer and clear any active alarm
        timeLeft = (minutes * 60) + seconds;
        totalTime = timeLeft;
        updateDisplay();
    }

    // --- Event Listeners ---

    if (startPauseBtn) {
        startPauseBtn.addEventListener('click', () => {
            if (isRunning) {
                pauseTimer();
            } else {
                if (timeLeft === 0) {
                    showCustomAlert("Please set a time or select a preset before starting.");
                    return;
                }
                startTimer();
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetTimer);
    }

    if (presetButtons) {
        presetButtons.forEach(button => {
            button.addEventListener('click', function() {
                const minutes = parseInt(this.dataset.minutes);
                const seconds = parseInt(this.dataset.seconds);
                setTimer(minutes, seconds);
            });
        });
    }

    // Custom time input elements
    const customMinutesInput = document.getElementById('customMinutes');
    const customSecondsInput = document.getElementById('customSeconds');
    const setCustomTimeBtn = document.getElementById('setCustomTimeBtn');

    if (setCustomTimeBtn) {
        setCustomTimeBtn.addEventListener('click', () => {
            let minutes = parseInt(customMinutesInput.value);
            let seconds = parseInt(customSecondsInput.value);

            if (isNaN(minutes) || minutes < 0 || minutes > 59) {
                showCustomAlert("Please enter a valid number of minutes (0-59).");
                return;
            }
            if (isNaN(seconds) || seconds < 0 || seconds > 59) {
                showCustomAlert("Please enter a valid number of seconds (0-59).");
                return;
            }
            if (minutes === 0 && seconds === 0) {
                showCustomAlert("Please enter a time greater than 0.");
                return;
            }

            setTimer(minutes, seconds);
        });
    }

    // --- Initial Setup ---
    updateDisplay(); // Set initial display to 00:00
});
``