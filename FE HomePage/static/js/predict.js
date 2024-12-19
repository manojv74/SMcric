function showAlert(message) {
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

function predict() {
    const team1 = document.getElementById('team1').value;
    const team2 = document.getElementById('team2').value;
    const city = document.getElementById('city').value;
    const requiredRuns = document.getElementById('required-runs').value;
    const requiredOvers = document.getElementById('required-overs').value;
    const requiredWickets = document.getElementById('required-wickets').value;

    if (!team1 || !team2 || team1 === team2) {
        showAlert('Please select two different teams.');
        return;
    }

    if (!city) {
        showAlert('Please select a city.');
        return;
    }

    if (!requiredRuns || requiredRuns <= 0) {
        showAlert('Please enter a valid number for required runs.');
        return;
    }

    if (!requiredOvers || requiredOvers <= 0) {
        showAlert('Please enter a valid number for required overs.');
        return;
    }

    if (!requiredWickets || requiredWickets < 0) {
        showAlert('Please enter a valid number for required wickets.');
        return;
    }

    // Display the win probability after validation
    displayPrediction("Team 1 has a higher chance of winning!", 70, team1, team2);
}

function displayPrediction(result, probability, team1Name, team2Name) {
    const winProbabilitySection = document.getElementById('win-probability');
    const probabilityChart = document.getElementById('probability-chart');

    // Clear previous prediction if exists
    probabilityChart.innerHTML = '';
    
    winProbabilitySection.style.display = 'block';

    // Create the smooth progress bar for probability with team names and colors
    const chartHTML = `
        <div class="probability-bar-container">
            <div class="team-name left">${team1Name}</div>
            <div class="probability-bar-background">
                <div class="probability-bar" style="width: ${probability}%;"></div>
            </div>
            <div class="team-name right">${team2Name}</div>
        </div>
        <div class="probability-text">
            <span>${probability}%</span> vs <span>${100 - probability}%</span>
        </div>`;

    probabilityChart.innerHTML = chartHTML;

    const resultText = document.createElement("p");
    resultText.textContent = result;
    resultText.style.textAlign = "center";
    resultText.style.fontWeight = "bold";
    resultText.style.color = "#333";
    winProbabilitySection.appendChild(resultText);
}
