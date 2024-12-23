document.addEventListener('DOMContentLoaded', () => {
    // Fetch data for team1, team2, and cities from the backend (GET request)
    fetch('/dropdown_data', {
        method: 'GET' // Explicitly define the GET method
    })
        .then(response => response.json())
        .then(data => {
            // Populate Team 1 dropdown
            const team1Dropdown = document.getElementById('team1');
            data.team1.forEach(team => {
                const option = document.createElement('option');
                option.value = team.name;
                option.textContent = team.name;
                team1Dropdown.appendChild(option);
            });

            // Populate Team 2 dropdown
            const team2Dropdown = document.getElementById('team2');
            data.team2.forEach(team => {
                const option = document.createElement('option');
                option.value = team.name;
                option.textContent = team.name;
                team2Dropdown.appendChild(option);
            });

            // Populate City dropdown
            const cityDropdown = document.getElementById('city');
            data.cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city;
                option.textContent = city;
                cityDropdown.appendChild(option);
            });
        })
        .catch(error => {
            console.error("Error loading data:", error);
            showAlert("Error loading dropdown data. Please try again later.");
        });
});

// Function to display an alert message
function showAlert(message) {
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

// Function to update the Toss Winner options based on selected teams
function updateTossOptions() {
    const team1 = document.getElementById('team1').value;
    const team2 = document.getElementById('team2').value;
    const tossWinnerSelect = document.getElementById('toss-winner');

    // Clear previous options in Toss Winner dropdown
    tossWinnerSelect.innerHTML = `<option value="" disabled selected>Select Toss Winner</option>`;

    // Only populate if both teams are selected
    if (team1 && team2) {
        const option1 = document.createElement('option');
        option1.value = team1;
        option1.textContent = team1;

        const option2 = document.createElement('option');
        option2.value = team2;
        option2.textContent = team2;

        // Append the options for Toss Winner
        tossWinnerSelect.appendChild(option1);
        tossWinnerSelect.appendChild(option2);
    }
}

function updateMatchDetails() {
    const team1 = document.getElementById('team1').value;
    const team2 = document.getElementById('team2').value;

    if (team1 && team2) {
        fetch(`/match_score?team1=${team1}&team2=${team2}`, {
            method: 'GET' // Ensure the method is GET here
        })
            .then(response => response.json())
            .then(data => {
                const detailsBox = document.getElementById('dataBox');
                detailsBox.innerHTML = `
                    <h3>Match Details</h3>
                    <p>Toss Winner: ${data.toss_winner}</p>
                    <p>Toss Decision: ${data.toss_decision}</p>
                    <p>Result: ${data.result}</p>
                    <p>Margin: ${data.result_margin}</p>
                `;
            })
            .catch(error => {
                console.error('Error fetching match details:', error);
                showAlert('Error fetching match details. Please try again later.');
            });
    }
}

function predict() {
    const team1 = document.getElementById('team1').value;
    const team2 = document.getElementById('team2').value;
    const city = document.getElementById('city').value;
    const requiredRuns = document.getElementById('required-runs').value;
    const requiredOvers = document.getElementById('required-overs').value;
    const requiredWickets = document.getElementById('required-wickets').value;

    // Validation checks
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

    // Prepare the payload for POST request
    const predictionData = {
        team1: team1,
        team2: team2,
        city: city,
        required_runs: requiredRuns,
        required_overs: requiredOvers,
        required_wickets: requiredWickets
    };

    // Make a POST request to the server for prediction
    fetch('/predict', {
        method: 'POST',  // Ensure the method is POST
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(predictionData)  // Send data as JSON
    })
    .then(response => response.json())
    .then(data => {
        const result = data.result || "Team 1 has a higher chance of winning!";
        const probability = data.probability || 70;
        displayPrediction(result, probability, team1, team2);
    })
    .catch(error => {
        console.error('Error during prediction:', error);
        showAlert('Error making prediction. Please try again later.');
    });

    // Scroll to the win probability section
    scrollToProbabilitySection();
}


// Function to display prediction
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

// Smooth scroll to the win probability section
function scrollToProbabilitySection() {
    const winProbabilitySection = document.getElementById('win-probability');
    winProbabilitySection.scrollIntoView({
        behavior: 'smooth', // This makes the scroll smooth
        block: 'start'      // Scroll to the top of the section
    });
}
