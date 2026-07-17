document.addEventListener('DOMContentLoaded', () => {
  const scoreContainer = document.getElementById('score-container');
  const scoreMessage = document.getElementById('score-message');
  const menuButton = document.querySelector('.menu-toggle');
  const navLinks = document.getElementById('nav-links');
  const progress = document.getElementById('scroll-progress');
  const panel = document.getElementById('match-panel');

  document.getElementById('current-year').textContent = new Date().getFullYear();

  window.addEventListener('scroll', () => {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${distance ? (window.scrollY / distance) * 100 : 0}%`;
  }, { passive: true });

  if (window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('pointermove', event => {
      document.documentElement.style.setProperty('--mouse-x', `${event.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${event.clientY}px`);
    }, { passive: true });
    panel.addEventListener('pointermove', event => {
      const box = panel.getBoundingClientRect();
      const rotateY = ((event.clientX - box.left) / box.width - .5) * 8;
      const rotateX = -((event.clientY - box.top) / box.height - .5) * 8;
      panel.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    panel.addEventListener('pointerleave', () => {
      panel.style.transform = 'perspective(1000px) rotateY(-3deg) rotateX(2deg)';
    });
  }

  menuButton.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }));

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element));

  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const target = Number(entry.target.dataset.count);
      const decimals = String(target).includes('.') ? 1 : 0;
      const started = performance.now();
      const animate = now => {
        const phase = Math.min((now - started) / 1300, 1);
        const value = target * (1 - Math.pow(1 - phase, 3));
        entry.target.textContent = `${value.toFixed(decimals)}${entry.target.dataset.suffix || ''}`;
        if (phase < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      countObserver.unobserve(entry.target);
    });
  }, { threshold: .7 });
  document.querySelectorAll('[data-count]').forEach(counter => countObserver.observe(counter));

  const demoValues = [64, 58, 71, 67];
  let demoIndex = 0;
  setInterval(() => {
    demoIndex = (demoIndex + 1) % demoValues.length;
    const value = demoValues[demoIndex];
    document.getElementById('demo-probability').textContent = `${value}%`;
    document.getElementById('demo-probability-bar').style.width = `${value}%`;
  }, 3200);

  const initials = name => (name || '—').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  const inningsText = score => {
    const innings = score?.inngs1 || score?.inngs2;
    if (!innings) return 'Yet to bat';
    const wickets = innings.wickets ?? 0;
    const overs = innings.overs ?? '0';
    return `${innings.runs ?? 0}/${wickets} <small>(${overs})</small>`;
  };

  function collectMatches(payload) {
    const found = [];
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (value.matchInfo && (value.matchScore || value.matchInfo.team1)) found.push(value);
      Object.values(value).forEach(walk);
    };
    walk(payload);
    return found.filter((match, index, list) => {
      const id = match.matchInfo?.matchId;
      return list.findIndex(item => item.matchInfo?.matchId === id) === index;
    });
  }

  function renderMatches(matches) {
    scoreContainer.innerHTML = '';
    matches.slice(0, 12).forEach(match => {
      const info = match.matchInfo || {};
      const score = match.matchScore || {};
      const team1 = info.team1 || {};
      const team2 = info.team2 || {};
      const card = document.createElement('article');
      card.className = 'score-card';
      card.innerHTML = `
        <div class="card-top"><span>${info.matchDesc || info.seriesName || 'Cricket match'}</span><span class="status-dot">● ${info.state || 'Match'}</span></div>
        <div class="score-team"><div><span class="mini-avatar">${initials(team1.teamSName || team1.teamName)}</span><strong>${team1.teamSName || team1.teamName || 'Team 1'}</strong></div><strong>${inningsText(score.team1Score)}</strong></div>
        <div class="score-team"><div><span class="mini-avatar">${initials(team2.teamSName || team2.teamName)}</span><strong>${team2.teamSName || team2.teamName || 'Team 2'}</strong></div><strong>${inningsText(score.team2Score)}</strong></div>
        <p class="match-status" title="${info.status || ''}">${info.status || 'Match information will update shortly.'}</p>`;
      scoreContainer.appendChild(card);
    });
  }

  async function loadMatches() {
    try {
      const response = await fetch('/live_matches', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const matches = collectMatches(await response.json());
      if (!matches.length) throw new Error('No live matches');
      renderMatches(matches);
    } catch (error) {
      scoreContainer.innerHTML = '';
      scoreMessage.hidden = false;
      scoreMessage.textContent = 'No live matches are available right now. Check back when play begins.';
      console.warn('Live score unavailable:', error.message);
    }
  }

  const slide = direction => scoreContainer.scrollBy({ left: direction * Math.min(scoreContainer.clientWidth * .9, 360), behavior: 'smooth' });
  document.getElementById('scroll-left').addEventListener('click', () => slide(-1));
  document.getElementById('scroll-right').addEventListener('click', () => slide(1));
  loadMatches();
});
