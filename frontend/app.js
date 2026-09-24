async function loadDashboard() {
  const response = await fetch('/api/dashboard');
  const payload = await response.json();

  document.getElementById('total-schools').textContent = payload.summary.totalSchools;
  document.getElementById('average-aqi').textContent = payload.summary.averageAqi;
  document.getElementById('active-alerts').textContent = payload.summary.activeAlerts;
  document.getElementById('critical-schools').textContent = payload.summary.criticalSchools;

  const list = document.getElementById('school-list');
  list.innerHTML = payload.schools
    .map((school) => `
      <div class="school-row">
        <div class="school-meta">
          <strong>${school.name}</strong>
          <small>${school.zone}</small>
        </div>
        <div class="school-aqi">${school.aqi}</div>
        <span class="badge ${school.severity}">${school.severity}</span>
        <div>${school.childrenExposed} children</div>
      </div>
    `)
    .join('');

  const recommendationsEl = document.getElementById('recommendations');
  const recommendationResponse = await fetch('/api/recommendations');
  const recommendations = await recommendationResponse.json();

  recommendationsEl.innerHTML = recommendations
    .map(
      (item) => `
        <li>
          <span class="priority">${item.priority}</span>
          <h3>${item.title}</h3>
          <p>${item.detail}</p>
        </li>
      `
    )
    .join('');
}

loadDashboard();
