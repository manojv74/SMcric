document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('prediction-form');
  const button = document.getElementById('predict-button');
  const summary = document.getElementById('error-summary');
  const team1 = document.getElementById('team1');
  const team2 = document.getElementById('team2');
  const city = document.getElementById('city');
  const tossWinner = document.getElementById('toss_winner');
  let submitting = false;

  // Keep the public form focused on supported Indian IPL host cities.
  // Every value must also exist in output2.csv so mn.py can encode it.
  const SUPPORTED_CITIES = new Set([
    'Ahmedabad',
    'Bengaluru',
    'Chennai',
    'Delhi',
    'Dharamsala',
    'Guwahati',
    'Hyderabad',
    'Jaipur',
    'Kolkata',
    'Lucknow',
    'Mumbai',
    'Visakhapatnam',
  ]);

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
    document.querySelectorAll('.field-error').forEach(item => { item.textContent = ''; });
    document.querySelectorAll('.invalid').forEach(item => {
      item.classList.remove('invalid');
      item.removeAttribute('aria-invalid');
    });
  }

  function showFieldErrors(fields = {}) {
    Object.entries(fields || {}).forEach(([name, message]) => {
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
    const overs = Number(document.getElementById('remaining_overs').value);
    document.getElementById('rrr-preview').textContent = runs >= 0 && overs > 0 ? (runs / overs).toFixed(2) : '—';
  }

  async function loadOptions() {
    try {
      const response = await fetch('/dropdown_data', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Dropdown data unavailable');
      (data.team1 || []).forEach(team => team1.appendChild(option(team.name)));
      (data.team2 || []).forEach(team => team2.appendChild(option(team.name)));
      (data.cities || [])
        .filter(name => SUPPORTED_CITIES.has(name))
        .sort((left, right) => left.localeCompare(right))
        .forEach(name => city.appendChild(option(name)));

      if (team1.options.length === 1 || team2.options.length === 1 || city.options.length === 1) {
        throw new Error('Teams or supported cities are unavailable.');
      }
    } catch (error) {
      showSummary(error.message || 'Could not load teams and cities.');
      button.disabled = true;
    }
  }

  function clientValidation(values) {
    const fields = {};
    ['team1', 'team2', 'city', 'toss_winner', 'toss_decision'].forEach(key => {
      if (!values[key]) fields[key] = 'This field is required.';
    });
    if (values.team1 && values.team1 === values.team2) fields.team2 = 'Choose a different team.';
    if (values.toss_winner && ![values.team1, values.team2].includes(values.toss_winner)) fields.toss_winner = 'Choose one of the selected teams.';
    if (!Number.isInteger(values.target_runs) || values.target_runs <= 0) fields.target_runs = 'Enter a target greater than zero.';
    if (!Number.isInteger(values.required_runs) || values.required_runs < 0) fields.required_runs = 'Enter zero or more runs.';
    if (values.required_runs > values.target_runs) fields.required_runs = 'Required runs cannot exceed the target.';
    if (!Number.isFinite(values.remaining_overs) || values.remaining_overs <= 0 || values.remaining_overs > 20) fields.remaining_overs = 'Enter remaining overs from 0.01 to 20.';
    if (!Number.isInteger(values.wickets_lost) || values.wickets_lost < 0 || values.wickets_lost > 10) fields.wickets_lost = 'Enter 0 to 10 wickets lost.';
    return fields;
  }

  function valuesFromForm() {
    const values = Object.fromEntries(new FormData(form));
    ['target_runs', 'required_runs', 'remaining_overs', 'wickets_lost'].forEach(key => {
      values[key] = Number(values[key]);
    });
    return values;
  }

  function backendPayload(values) {
    return {
      team1: values.team1,
      team2: values.team2,
      city: values.city,
      toss_winner: values.toss_winner,
      toss_decision: values.toss_decision,
      target_runs: values.target_runs,
      required_runs: values.required_runs,
      remaining_overs: values.remaining_overs,
      wickets_lost: values.wickets_lost,
    };
  }

  function renderResult(data, values) {
    const team1Probability = Number(data.team1_win_probability);
    const team2Probability = Number(data.team2_win_probability);
    if (!Number.isFinite(team1Probability) || !Number.isFinite(team2Probability)) {
      throw new Error('The server returned an invalid prediction.');
    }

    const predictedWinner = team1Probability >= team2Probability ? data.team1 : data.team2;
    const requiredRate = values.required_runs / values.remaining_overs;
    document.getElementById('empty-result').hidden = true;
    document.getElementById('prediction-result').hidden = false;
    document.getElementById('result-status').textContent = 'Estimate calculated from the supplied scenario.';
    document.getElementById('team1-result').textContent = data.team1;
    document.getElementById('team2-result').textContent = data.team2;
    document.getElementById('team1-badge').textContent = initials(data.team1);
    document.getElementById('team2-badge').textContent = initials(data.team2);
    document.getElementById('team1-probability').textContent = `${team1Probability.toFixed(2)}%`;
    document.getElementById('team2-probability').textContent = `${team2Probability.toFixed(2)}%`;
    document.getElementById('probability-bar').style.width = `${Math.max(0, Math.min(100, team1Probability))}%`;
    document.getElementById('predicted-winner').textContent = predictedWinner;
    document.getElementById('context-runs').textContent = `${values.required_runs} runs`;
    document.getElementById('context-overs').textContent = `${values.remaining_overs} overs`;
    document.getElementById('context-wickets-lost').textContent = `${values.wickets_lost}`;
    document.getElementById('context-rrr').textContent = requiredRate.toFixed(2);
    document.getElementById('model-version').textContent = 'SMcric';
    document.getElementById('latency').textContent = 'Complete';
    document.getElementById('disclaimer').textContent = 'This is an estimate, not a guaranteed outcome.';
    document.getElementById('result-card').focus({ preventScroll: true });
    document.getElementById('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  team1.addEventListener('change', updateTossOptions);
  team2.addEventListener('change', updateTossOptions);
  document.getElementById('required_runs').addEventListener('input', updateRequiredRate);
  document.getElementById('remaining_overs').addEventListener('input', updateRequiredRate);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    clearErrors();
    const values = valuesFromForm();
    const fields = clientValidation(values);
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
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('/predict/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(backendPayload(values)),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.message || data.error || 'Prediction failed.');
      renderResult(data, values);
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
