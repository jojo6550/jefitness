document.addEventListener('DOMContentLoaded', () => {
    const calculateBmiButton = document.getElementById('calculateBmiButton');
    const heightFtInput = document.getElementById('heightFt');
    const heightInInput = document.getElementById('heightIn');
    const weightLbsInput = document.getElementById('weightLbs');
    const bmiResultDisplay = document.getElementById('bmiResult');
    const bmiCategoryDisplay = document.getElementById('bmiCategory');

    if (calculateBmiButton) {
        calculateBmiButton.addEventListener('click', calculateBMI);
    }

    function calculateBMI() {
        const heightFt = parseFloat(heightFtInput.value);
        const heightIn = parseFloat(heightInInput.value);
        const weightLbs = parseFloat(weightLbsInput.value);

        if (isNaN(heightFt) || isNaN(heightIn) || isNaN(weightLbs) || heightFt < 0 || heightIn < 0 || weightLbs < 0) {
            bmiResultDisplay.textContent = 'Invalid input';
            bmiCategoryDisplay.textContent = 'Please enter valid numbers for height and weight.';
            return;
        }

        // Convert height to inches
        const totalHeightInches = (heightFt * 12) + heightIn;

        // BMI formula: (weight in lbs / (height in inches)^2) * 703
        if (totalHeightInches > 0) {
            const bmi = (weightLbs / (totalHeightInches * totalHeightInches)) * 703;
            bmiResultDisplay.textContent = bmi.toFixed(2); // Display BMI with 2 decimal places
            bmiCategoryDisplay.textContent = getBMICategory(bmi);
        } else {
            bmiResultDisplay.textContent = 'N/A';
            bmiCategoryDisplay.textContent = 'Height cannot be zero.';
        }
    }

    function getBMICategory(bmi) {
        if (bmi < 18.5) {
            return 'Underweight';
        } else if (bmi >= 18.5 && bmi <= 24.9) {
            return 'Normal weight';
        } else if (bmi >= 25 && bmi <= 29.9) {
            return 'Overweight';
        } else {
            return 'Obesity';
        }
    }
});