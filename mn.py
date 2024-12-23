import requests
import logging
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import csv

app = Flask(__name__)
CORS(app)

# Read CSV Data
def read_csv_data(file_path):
    team1 = set()
    team2 = set()
    cities = set()

    try:
        with open(file_path, mode='r', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            for row in csv_reader:
                team1_name = row.get('team1')
                team2_name = row.get('team2')
                city_name = row.get('city')

                if team1_name:
                    team1.add(team1_name)
                if team2_name:
                    team2.add(team2_name)
                if city_name:
                    cities.add(city_name)
    
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return [], [], []

    return list(team1), list(team2), list(cities)

@app.route('/dropdown_data', methods=['GET'])
def dropdown_data():
    try:
        csv_file_path = r'C:\Users\manoj\fromnew\SMcric\FEHomePage\output2.csv'
        team1, team2, cities = read_csv_data(csv_file_path)

        data = {
            "team1": [{"name": team, "icon": "🏏"} for team in team1],
            "team2": [{"name": team, "icon": "🏏"} for team in team2],
            "cities": cities
        }

        return jsonify(data)

    except Exception as e:
        return jsonify({"error": "Failed to fetch dropdown data", "message": str(e)}), 500

# RapidAPI Configuration
headers = {
    'x-rapidapi-key': "b4010528d4msh2f954e0d2c08bbcp1f65aejsn4044e0015e66",
    'x-rapidapi-host': "cricbuzz-cricket.p.rapidapi.com"
}

@app.route('/live_matches')
def live_matches():
    url = "https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent"
    try:
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()  # Parse JSON response
            return jsonify(data)
        else:
            return jsonify({"error": "Failed to fetch live matches", "status_code": response.status_code}), 500
    
    except requests.exceptions.RequestException as e:
        return jsonify({"error": "An error occurred while fetching live matches", "message": str(e)}), 500

@app.route('/match_score', methods=['GET'])
def match_score():
    try:
        team1 = request.args.get('team1')
        team2 = request.args.get('team2')

        if not team1 or not team2:
            return jsonify({"error": "Missing team1 or team2 parameter"}), 400

        match_details = {
            "toss_winner": team1,
            "toss_decision": "bat",
            "result": "Team 1 wins",
            "result_margin": "10 runs"
        }

        return jsonify(match_details)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()  # Get JSON data from POST request
        team1 = data.get('team1')
        team2 = data.get('team2')

        if not team1 or not team2:
            return jsonify({"error": "Both 'team1' and 'team2' are required"}), 400

        # Simulate prediction probabilities
        probabilities = {
            team1: 60,
            team2: 35
        }

        return jsonify(probabilities)

    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/predict', methods=['GET'])
def predict_get():
    return render_template('predict.html')  # Render the template when GET request is made

@app.route('/')
def index():
    return render_template('home.html')

# Error handling for Method Not Allowed (405)
@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method Not Allowed", "message": "Please use the correct HTTP method (POST for predictions)."}), 405

if __name__ == '__main__':
    app.run(debug=True)
