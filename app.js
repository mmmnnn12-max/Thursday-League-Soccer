async function loadData() {
  const res = await fetch("matches.json", { cache: "no-store" });
  if (!res.ok) throw new Error("matches.json을 불러오지 못했어요.");
  return await res.json();
}

function computeStandings(data) {
  const { teams, rules, matches } = data;
  const table = {};
  teams.forEach(t => table[t] = { team: t, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, PTS:0 });

  for (const m of matches) {
    if (m.hg === null || m.ag === null) continue;

    const H = table[m.home], A = table[m.away];
    H.P++; A.P++;
    H.GF += m.hg; H.GA += m.ag;
    A.GF += m.ag; A.GA += m.hg;

    if (m.hg > m.ag) { H.W++; A.L++; H.PTS += rules.win; }
    else if (m.hg < m.ag) { A.W++; H.L++; A.PTS += rules.win; }
    else { H.D++; A.D++; H.PTS += rules.draw; A.PTS += rules.draw; }
  }

  Object.values(table).forEach(r => r.GD = r.GF - r.GA);

  // 승점 → 득실차 → 다득점 → 이름
  return Object.values(table).sort((a,b) =>
    (b.PTS - a.PTS) || (b.GD - a.GD) || (b.GF - a.GF) || a.team.localeCompare(b.team, "ko")
  );
}

function computeTeamGoals(data) {
  const goals = {};
  data.teams.forEach(t => goals[t] = 0);
  for (const m of data.matches) {
    if (m.hg === null || m.ag === null) continue;
    goals[m.home] += m.hg;
    goals[m.away] += m.ag;
  }
  return Object.entries(goals)
    .map(([team, gf]) => ({ team, gf }))
    .sort((a,b) => (b.gf - a.gf) || a.team.localeCompare(b.team, "ko"));
}

function el(tag, attrs={}, children=[]) {
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

function renderStandings(container, standings) {
  const table = el("table", { class: "table" });
  const thead = el("thead");
  const headRow = el("tr");
  ["순위","팀","경기","승","무","패","득점","실점","득실","승점"].forEach(h => headRow.appendChild(el("th", { text: h })));
  thead.appendChild(headRow);

  const tbody = el("tbody");
  standings.forEach((r, i) => {
    const tr = el("tr");
    [i+1, r.team, r.P, r.W, r.D, r.L, r.GF, r.GA, r.GD, r.PTS].forEach(v => tr.appendChild(el("td", { text: String(v) })));
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function renderSchedule(container, data) {
  const groups = {};
  data.matches.forEach(m => {
    if (!groups[m.round]) groups[m.round] = [];
    groups[m.round].push(m);
  });

  container.innerHTML = "";
  Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).forEach(round => {
    const card = el("div", { class: "card" });
    card.appendChild(el("h2", { text: `Round ${round}` }));

    const list = el("div", { class: "matchList" });
    for (const m of groups[round]) {
      const score = (m.hg === null || m.ag === null) ? "미정" : `${m.hg} : ${m.ag}`;
      const date = (m.date && m.date.trim()) ? ` · ${m.date}` : "";
      list.appendChild(el("div", { class: "matchRow" }, [
        el("div", { class: "matchTeams", text: `${m.home} vs ${m.away}` }),
        el("div", { class: "matchMeta", text: `${score}${date}` })
      ]));
    }

    card.appendChild(list);
    container.appendChild(card);
  });
}

function renderTeamGoals(container, rows) {
  const table = el("table", { class: "table" });
  const thead = el("thead");
  const headRow = el("tr");
  ["순위","팀","총 득점"].forEach(h => headRow.appendChild(el("th", { text: h })));
  thead.appendChild(headRow);

  const tbody = el("tbody");
  rows.forEach((r, i) => {
    const tr = el("tr");
    [i+1, r.team, r.gf].forEach(v => tr.appendChild(el("td", { text: String(v) })));
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

async function boot() {
  const page = document.body.dataset.page;
  const data = await loadData();

  if (page === "standings") {
    const standings = computeStandings(data);
    renderStandings(document.querySelector("#standings"), standings);
    renderSchedule(document.querySelector("#miniSchedule"), data);
  }

  if (page === "schedule") {
    renderSchedule(document.querySelector("#schedule"), data);
  }

  if (page === "admin") {
    // admin은 'JSON 생성/복사' 기능만 (정적 사이트에서는 서버 파일을 직접 수정할 수 없음)
    const area = document.querySelector("#jsonOut");
    area.value = JSON.stringify(data, null, 2);

    document.querySelector("#btnCopy").onclick = async () => {
      await navigator.clipboard.writeText(area.value);
      alert("JSON을 클립보드에 복사했어. 이제 GitHub의 matches.json에 붙여넣으면 끝!");
    };

    document.querySelector("#btnDownload").onclick = () => {
      const blob = new Blob([area.value], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "matches.json";
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }

  if (page === "stats") {
    const rows = computeTeamGoals(data);
    renderTeamGoals(document.querySelector("#teamGoals"), rows);
  }
}

window.addEventListener("DOMContentLoaded", boot);
