document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('prediction-form');
  const button = document.getElementById('predict-button');
  const summary = document.getElementById('error-summary');
  const team1 = document.getElementById('team1');
  const team2 = document.getElementById('team2');
  const city = document.getElementById('city');
  const tossWinner = document.getElementById('toss_winner');
  let submitting = false;

  const initials = name => name.split(/\s+/).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  const option = value => {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = value;
    return item;
  };

  function showSummary(message) {
    summary.textContent = message;
    summary.hidden = false;
    summary.focus();
  }

  function clearErrors() {
    summary.hidden = true;
    document.querySelectorAll('.field-error').forEach(item => item.textContent = '');
    document.querySelectorAll('.invalid').forEach(item => {
      item.classList.remove('invalid');
      item.removeAttribute('aria-invalid');
    });
  }

  function showFieldErrors(fields = {}) {
    Object.entries(fields).forEach(([name, message]) => {
      const input = document.getElementById(name);
      const error = document.getElementById(`${name}-error`);
      if (input) {
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
      }
      if (error) error.textContent = message;
    });
  }

  function updateTossOptions() {
    const previous = tossWinner.value;
    tossWinner.replaceChildren(option(''));
    tossWinner.options[0].textContent = team1.value && team2.value ? 'Choose toss winner' : 'Select teams first';
    [team1.value, team2.value].filter(Boolean).forEach(name => tossWinner.appendChild(option(name)));
    tossWinner.disabled = !(team1.value && team2.value && team1.value !== team2.value);
    if ([team1.value, team2.value].includes(previous)) tossWinner.value = previous;
    document.getElementById('preview-team1').textContent = team1.value || 'Team 1';
    document.getElementById('preview-team2').textContent = team2.value || 'Team 2';
  }

  function updateRequiredRate() {
    const runs = Number(document.getElementById('required_runs').value);
    const balls = Number(document.getElementById('balls_remaining').value);
    document.getElementById('rrr-preview').textContent = runs >= 0 && balls > 0 ? (runs * 6 / balls).toFixed(2) : '—';
  }

  async function loadOptions() {
    try {
      const response = await fetch('/dropdown_data', {
        headers: { Accept: 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Dropdown data unavailable');
      }

      data.team1.forEach(team => {
        team1.appendChild(option(team.name));
      });

      data.team2.forEach(team => {
        team2.appendChild(option(team.name));
      });

      data.cities.forEach(name => {
        city.appendChild(option(name));
      });
    } catch (error) {
      showSummary(error.message || 'Could not load teams and cities.');
      button.disabled = true;
    }
  }

  
  

  function clientValidation(payload) {
    const fields = {};
    ['team1', 'team2', 'city', 'toss_winner', 'toss_decision'].forEach(key => {
      if (!payload[key]) fields[key] = 'This field is required.';
    });
    if (payload.team1 && payload.team1 === payload.team2) fields.team2 = 'Choose a different team.';
    if (payload.toss_winner && ![payload.team1, payload.team2].includes(payload.toss_winner)) fields.toss_winner = 'Choose one of the selected teams.';
    if (!Number.isInteger(payload.target_runs) || payload.target_runs <= 0) fields.target_runs = 'Enter a target greater than zero.';
    if (!Number.isInteger(payload.required_runs) || payload.required_runs < 0) fields.required_runs = 'Enter zero or more runs.';
    if (payload.required_runs > payload.target_runs) fields.required_runs = 'Required runs cannot exceed the target.';
    if (!Number.isInteger(payload.balls_remaining) || payload.balls_remaining < 1 || payload.balls_remaining > 120) fields.balls_remaining = 'Enter 1 to 120 balls.';
    if (!Number.isInteger(payload.wickets_remaining) || payload.wickets_remaining < 0 || payload.wickets_remaining > 10) fields.wickets_remaining = 'Enter 0 to 10 wickets.';
    return fields;
  }

  function payloadFromForm() {
    const values = Object.fromEntries(new FormData(form));
    ['target_runs', 'required_runs', 'balls_remaining', 'wickets_remaining'].forEach(key => values[key] = Number(values[key]));
    return values;
  }

  function renderResult(data) {
    const result = data.prediction;
    const context = data.match_context;
    document.getElementById('empty-result').hidden = true;
    document.getElementById('prediction-result').hidden = false;
    document.getElementById('result-status').textContent = 'Estimate calculated from the supplied scenario.';
    document.getElementById('team1-result').textContent = result.team1;
    document.getElementById('team2-result').textContent = result.team2;
    document.getElementById('team1-badge').textContent = initials(result.team1);
    document.getElementById('team2-badge').textContent = initials(result.team2);
    document.getElementById('team1-probability').textContent = `${result.team1_probability.toFixed(2)}%`;
    document.getElementById('team2-probability').textContent = `${result.team2_probability.toFixed(2)}%`;
    document.getElementById('probability-bar').style.width = `${result.team1_probability}%`;
    document.getElementById('predicted-winner').textContent = result.predicted_winner;
    document.getElementById('context-runs').textContent = `${context.required_runs} runs`;
    document.getElementById('context-balls').textContent = `${context.balls_remaining} balls`;
    document.getElementById('context-wickets').textContent = `${context.wickets_remaining} in hand`;
    document.getElementById('context-rrr').textContent = context.required_run_rate.toFixed(2);
    document.getElementById('model-version').textContent = data.model.version;
    document.getElementById('latency').textContent = `${data.latency_ms.toFixed(2)} ms`;
    document.getElementById('disclaimer').textContent = data.model.disclaimer;
    document.getElementById('result-card').focus({ preventScroll: true });
    document.getElementById('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  team1.addEventListener('change', updateTossOptions);
  team2.addEventListener('change', updateTossOptions);
  document.getElementById('required_runs').addEventListener('input', updateRequiredRate);
  document.getElementById('balls_remaining').addEventListener('input', updateRequiredRate);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    clearErrors();
    const payload = payloadFromForm();
    const fields = clientValidation(payload);
    if (Object.keys(fields).length) {
      showFieldErrors(fields);
      showSummary('Please correct the highlighted fields.');
      return;
    }
    submitting = true;
    button.disabled = true;
    button.classList.add('loading');
    button.querySelector('.button-label').textContent = 'Calculating…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/predict/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        showFieldErrors(data.error?.fields);
        throw new Error(data.error?.message || 'Prediction failed.');
      }
      renderResult(data);
    } catch (error) {
      showSummary(error.name === 'AbortError' ? 'The prediction timed out. Please try again.' : error.message);
    } finally {
      clearTimeout(timeout);
      submitting = false;
      button.disabled = false;
      button.classList.remove('loading');
      button.querySelector('.button-label').textContent = 'Calculate probability';
    }
  });

  loadOptions();
});
