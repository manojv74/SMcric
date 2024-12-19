from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Sample team data
TEAMS = [
    {"name": "India", "icon": "🇮🇳"},
    {"name": "Australia", "icon": "🇦🇺"},
    {"name": "England", "icon": "🇬🇧"},
    {"name": "Pakistan", "icon": "🇵🇰"},
]

# Corrected indentation for the 'City' variable
City = ['Mumbai', 'Delhi', 'Chennai']

@app.route('/')
def home():
    teams = TEAMS  # Sample teams
    # Sample cities
    return render_template('home.html')


@app.route('/predict', methods=['GET', 'POST'])
def predict():
    if request.method == 'POST':
        data = request.json
        team1 = data.get('team1')
        team2 = data.get('team2')

        # Mock probabilities
        probabilities = {
            team1: 65,
            team2: 35
        }
        return jsonify(probabilities)
    
    # Render the prediction page for GET requests
    return render_template('predict.html', teams=TEAMS, cities=City)


if __name__ == "__main__":
    app.run(debug=True)
