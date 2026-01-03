document.addEventListener('DOMContentLoaded', function () {
    const trainerForm = document.getElementById('trainerQuestionnaire');
    
    if (trainerForm) {
        trainerForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const goal = document.getElementById('primaryGoal').value;
            const level = document.getElementById('experienceLevel').value;

            let suggestedTrainer = '';
            let trainerImage = '';
            let trainerBio = '';
            let specialties = '';

            if (goal === 'strength') {
                suggestedTrainer = 'Jamol Elliot';
                trainerImage = './images/logo.jpg';
                trainerBio = 'Jamol specializes in strength training and will help you build muscle and increase your performance.';
                specialties = 'Strength Training, Weight Loss, Functional Fitness';
            } else if (goal === 'massage') {
                suggestedTrainer = 'Jermaine Ritchie';
                trainerImage = './images/logo.jpg';
                trainerBio = 'Jermaine is an expert in massage therapy and will help you recover and relax.';
                specialties = 'Massage Therapy, Weight Loss, Muscle Relaxation';
            } else if (goal === 'weight-loss') {
                suggestedTrainer = 'Jamol Elliot';
                trainerImage = './images/logo.jpg';
                trainerBio = 'Jamol has extensive experience in weight loss programs and will guide you to sustainable results.';
                specialties = 'Strength Training, Weight Loss, Functional Fitness';
            }

            const suggestionHTML = `
                <img src="${trainerImage}" alt="${suggestedTrainer}" class="rounded-circle mb-3 trainer-image-circle">
                <h4 class="fw-bold">${suggestedTrainer}</h4>
                <p class="text-muted mb-3">${trainerBio}</p>
                <div class="mb-3">
                    <strong>Specialties:</strong> ${specialties}
                </div>
                <p>Based on your goal of ${goal.replace('-', ' ')} and ${level} experience level, we recommend ${suggestedTrainer} as your trainer.</p>
            `;

            document.getElementById('trainerSuggestion').innerHTML = suggestionHTML;

            const modalElement = document.getElementById('trainerModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        });
    }
});