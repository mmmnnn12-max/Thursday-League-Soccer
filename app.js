
     async function loadData() {
  const res = await fetch("matches.json", { cache: "no-store" });
  if (!res.ok) throw new Error("matches.json을 불러오지 못했어요.");
  return await res.json();
}
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

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

function renderTable(container, headers, rows) {
  const table = el("table", { class: "table" });
  const thead = el("thead");
  const trh = el("tr");
  headers.forEach(h => trh.appendChild(el("th", { text: h })));
  thead.appendChild(trh);

  const tbody = el("tbody");
  rows.forEach(r => {
    const tr = el("tr");
    r.forEach(cell => tr.appendChild(el("td", { text: String(cell) })));
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);
}

function renderMobileList(container, items) {
  // PC에서도 append는 되지만, CSS에서 .mList를 숨겨두었기 때문에 “표 밑 텍스트” 문제 없음
  const list = el("div", { class: "mList" });
  items.forEach(it => {
    const card = el("div", { class: "mItem" });

    const top = el("div", { class: "mTop" }, [
      el("div", { text: it.title }),
      el("div", { text: it.badge || "" })
    ]);

    const meta = el("div", { class: "mMeta" });
    (it.kvs || []).forEach(([k,v]) => {
      meta.appendChild(el("div", { class: "kv" }, [
        el("div", { class: "k", text: k }),
        el("div", { class: "v", text: String(v) })
      ]));
    });

    card.appendChild(top);
    card.appendChild(meta);
    list.appendChild(card);
  });

  container.appendChild(list);
}

/* ------------------ Compute ------------------ */
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

function computeRemaining(data) {
  const total = data.matches.length;
  const played = data.matches.filter(m => m.hg !== null && m.ag !== null).length;
  return { total, played, remaining: total - played };
}

function computeTitleStatus(data) {
  const standings = computeStandings(data);
  const { rules } = data;
  const { remaining } = computeRemaining(data);

  if (standings.length < 2) return { text: "데이터 부족", kind: "neutral" };

  const leader = standings[0];
  const runner = standings[1];

  const left = {};
  data.teams.forEach(t => left[t] = 0);
  for (const m of data.matches) {
    if (m.hg !== null && m.ag !== null) continue;
    left[m.home]++; left[m.away]++;
  }

  const leaderMax = leader.PTS + left[leader.team] * rules.win;
  const runnerMax = runner.PTS + left[runner.team] * rules.win;

  if (leader.PTS > runnerMax) return { text: `🏆 ${leader.team} 우승 확정!`, kind: "win" };
  if (remaining === 0) return { text: `🏁 리그 종료 · 우승: ${leader.team}`, kind: "win" };
  return { text: `🔥 우승 경쟁 중 · 현재 1위: ${leader.team} (최대 ${leaderMax}점)`, kind: "hot" };
}

function computeScorers(data) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const score = new Map();

  for (const g of (data.goals || [])) {
    if (!playersById.has(g.playerId)) continue;
    score.set(g.playerId, (score.get(g.playerId) || 0) + (g.count || 0));
  }

  const rows = Array.from(score.entries()).map(([playerId, goals]) => {
    const p = playersById.get(playerId);
    return { playerId, name: p.name, team: p.team, goals };
  });

  rows.sort((a,b) =>
    (b.goals - a.goals) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );

  return rows;
}

/* ------------------ Render ------------------ */
function renderStandings(container, standings) {
  const table = el("table", { class: "table" });
  const thead = el("thead");
  const trh = el("tr");
  ["순위","팀","경기","승","무","패","득점","실점","득실","승점"].forEach(h =>
    trh.appendChild(el("th", { text: h }))
  );
  thead.appendChild(trh);

  const tbody = el("tbody");
  standings.forEach((r, i) => {
    const tr = el("tr");

    tr.appendChild(el("td", { text: String(i + 1) }));

    const teamTd = document.createElement("td");
    const a = document.createElement("a");
    a.href = `team.html?team=${encodeURIComponent(r.team)}`;
    a.className = "teamLink";
    a.innerHTML = `<span class="icon">↗</span><span>${r.team}</span>`;
    teamTd.appendChild(a);
    tr.appendChild(teamTd);

    [r.P, r.W, r.D, r.L, r.GF, r.GA, r.GD, r.PTS].forEach(v => {
      tr.appendChild(el("td", { text: String(v) }));
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);

  renderMobileList(container, standings.map((r, i) => ({
    title: `${i+1}위 · ${r.team}`,
    badge: `${r.PTS}점`,
    kvs: [
      ["경기", r.P],
      ["승/무/패", `${r.W}/${r.D}/${r.L}`],
      ["득점", r.GF],
      ["실점", r.GA],
      ["득실", r.GD],
    ]
  })));
}

function renderSchedule(container, data, opts = {}) {
  const maxRounds = opts.maxRounds ?? Infinity;

  const groups = {};
  data.matches.forEach(m => {
    if (!groups[m.round]) groups[m.round] = [];
    groups[m.round].push(m);
  });

  const rounds = Object.keys(groups).map(Number).sort((a,b)=>a-b).filter(r => r <= maxRounds);

  container.innerHTML = "";
  rounds.forEach(round => {
    const card = el("div", { class: "card" });
    card.appendChild(el("h2", { text: `Round ${round}` }));

    const list = el("div", { class: "matchList" });
    for (const m of groups[round]) {
      const score = (m.hg === null || m.ag === null) ? "미정" : `${m.hg} : ${m.ag}`;
      const date = (m.date && m.date.trim()) ? ` · ${m.date}` : "";
      const played = (m.hg !== null && m.ag !== null);

      list.appendChild(el("div", { class: "matchRow" + (played ? " played" : "") }, [
        el("div", { class: "matchTeams", text: `${m.home} vs ${m.away}` }),
        el("div", { class: "matchMeta", text: `${score}${date}` })
      ]));
    }

    card.appendChild(list);
    container.appendChild(card);
  });
}

function renderTeamGoals(container, rows) {
  renderTable(container, ["순위","팀","총 득점"], rows.map((r, i) => [i+1, r.team, r.gf]));
  renderMobileList(container, rows.map((r, i) => ({
    title: `${i+1}위 · ${r.team}`,
    badge: `${r.gf}골`,
    kvs: []
  })));
}

function renderTopScorers(container, rows) {
  if (!rows.length) {
    container.innerHTML = `<div class="small">아직 득점자가 입력되지 않았어.</div>`;
    return;
  }
  renderTable(container, ["순위","선수","팀","골"], rows.map((r, i) => [i+1, r.name, r.team, r.goals]));
  renderMobileList(container, rows.map((r, i) => ({
    title: `${i+1}위 · ${r.name}`,
    badge: `${r.goals}골`,
    kvs: [["팀", r.team]]
  })));
}

/* ------------------ Team helpers ------------------ */
function getTeamMatches(data, team) {
  return data.matches
    .filter(m => m.home === team || m.away === team)
    .slice()
    .sort((a,b) => (a.round - a.round) || (a.id - b.id));
}

function getTeamSummary(data, team) {
  const standings = computeStandings(data);
  const row = standings.find(r => r.team === team);
  if (!row) return null;
  const rank = standings.findIndex(r => r.team === team) + 1;
  return { rank, ...row };
}

function getTeamTopScorers(data, team) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const score = new Map();

  for (const g of (data.goals || [])) {
    const p = playersById.get(g.playerId);
    if (!p || p.team !== team) continue;
    score.set(g.playerId, (score.get(g.playerId) || 0) + (g.count || 0));
  }

  const rows = Array.from(score.entries()).map(([playerId, goals]) => {
    const p = playersById.get(playerId);
    return { name: p.name, goals };
  });

  rows.sort((a,b) => (b.goals - a.goals) || a.name.localeCompare(b.name, "ko"));
  return rows;
}

/* ------------------ Mobile app tabbar + team sheet ------------------ */
function injectTabbar(data, page){
  if (document.querySelector(".tabbar")) return;

  const bar = document.createElement("div");
  bar.className = "tabbar";

  const inner = document.createElement("div");
  inner.className = "tabbarInner";

  const items = [
    { key:"standings", href:"index.html",    label:"순위", ico:"🏆" },
    { key:"schedule",  href:"schedule.html", label:"일정", ico:"📅" },
    { key:"stats",     href:"stats.html",    label:"기록", ico:"📊" },
    { key:"team",      href:"#",             label:"팀",   ico:"👥", isTeam:true }
  ];

  for (const it of items){
    const a = document.createElement("a");
    a.className = "tab" + (page === it.key ? " active" : "");
    a.href = it.href;
    a.innerHTML = `<div class="ico">${it.ico}</div><div>${it.label}</div>`;

    if (it.isTeam){
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openTeamSheet(data);
      });
    }

    inner.appendChild(a);
  }

  bar.appendChild(inner);
  document.body.appendChild(bar);
}

function openTeamSheet(data){
  let overlay = document.querySelector("#teamSheetOverlay");
  if (!overlay){
    overlay = document.createElement("div");
    overlay.id = "teamSheetOverlay";
    overlay.className = "sheetOverlay";
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheetTop">
          <div class="sheetTitle">팀 선택</div>
          <button class="sheetClose" type="button">닫기</button>
        </div>
        <div class="teamGrid" id="teamGrid"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    overlay.querySelector(".sheetClose").addEventListener("click", () => {
      overlay.classList.remove("show");
    });
  }

  const grid = overlay.querySelector("#teamGrid");
  grid.innerHTML = "";
  (data.teams || []).forEach(team => {
    const b = document.createElement("a");
    b.className = "teamBtn";
    b.href = `team.html?team=${encodeURIComponent(team)}`;
    b.textContent = team;
    grid.appendChild(b);
  });

  overlay.classList.add("show");
}

/* ------------------ boot ------------------ */
async function boot() {
  const page = document.body.dataset.page;
  const original = await loadData();
  let data = deepClone(original);

  if (page === "standings") {
    const standings = computeStandings(data);
    renderStandings(document.querySelector("#standings"), standings);

    const box = document.querySelector("#miniSchedule");
    const btn = document.querySelector("#btnMoreMini");
    if (box) {
      const allRounds = Array.from(new Set(data.matches.map(m => m.round))).sort((a,b)=>a-b);
      let shown = 2;

      const renderMini = () => {
        const maxRound = allRounds[Math.min(shown, allRounds.length) - 1];
        renderSchedule(box, data, { maxRounds: maxRound });
        if (btn) btn.style.display = (shown >= allRounds.length) ? "none" : "inline-block";
      };

      if (btn) btn.onclick = () => { shown += 1; renderMini(); };
      renderMini();
    }
  }

  if (page === "schedule") {
    const box = document.querySelector("#schedule");
    const btn = document.querySelector("#btnMore");
    const allRounds = Array.from(new Set(data.matches.map(m => m.round))).sort((a,b)=>a-b);
    let shown = 2;

    const render = () => {
      const maxRound = allRounds[Math.min(shown, allRounds.length) - 1];
      renderSchedule(box, data, { maxRounds: maxRound });
      if (btn) btn.style.display = (shown >= allRounds.length) ? "none" : "inline-block";
    };

    if (btn) btn.onclick = () => { shown += 1; render(); };
    render();
  }

  if (page === "stats") {
    const status = computeTitleStatus(data);
    const remain = computeRemaining(data);

    const titleStatus = document.querySelector("#titleStatus");
    if (titleStatus) {
      titleStatus.textContent = status.text;
      titleStatus.dataset.kind = status.kind;
    }
    const remainingGames = document.querySelector("#remainingGames");
    const totalGames = document.querySelector("#totalGames");
    if (remainingGames) remainingGames.textContent = String(remain.remaining);
    if (totalGames) totalGames.textContent = String(remain.total);

    renderTeamGoals(document.querySelector("#teamGoals"), computeTeamGoals(data));
    renderTopScorers(document.querySelector("#topScorers"), computeScorers(data));
  }

  if (page === "team") {
    const params = new URLSearchParams(location.search);
    const team = params.get("team");

    const title = document.querySelector("#teamTitle");
    const summaryBox = document.querySelector("#teamSummary");
    const scorersBox = document.querySelector("#teamScorers");
    const matchesBox = document.querySelector("#teamMatches");

    if (!team) {
      if (title) title.textContent = "팀";
      if (summaryBox) summaryBox.innerHTML = `<div class="small">team 파라미터가 없어. 예: team.html?team=팀임태원</div>`;
      if (scorersBox) scorersBox.innerHTML = `<div class="small">-</div>`;
      if (matchesBox) matchesBox.innerHTML = `<div class="small">-</div>`;
    } else {
      if (title) title.textContent = team;

      const s = getTeamSummary(data, team);
      if (!s) {
        if (summaryBox) summaryBox.innerHTML = `<div class="small">팀을 찾을 수 없어: ${team}</div>`;
      } else {
        if (summaryBox) summaryBox.innerHTML = `
          <div class="small">
            <b>${s.rank}위</b> · 승점 <b>${s.PTS}</b><br/>
            ${s.P}경기 ${s.W}승 ${s.D}무 ${s.L}패<br/>
            득점 ${s.GF} / 실점 ${s.GA} / 득실 ${s.GD}
          </div>
        `;
      }

      const top = getTeamTopScorers(data, team);
      if (!top.length) {
        if (scorersBox) scorersBox.innerHTML = `<div class="small">아직 득점 기록이 없어.</div>`;
      } else {
        renderTable(scorersBox, ["순위","선수","골"], top.map((r,i)=>[i+1, r.name, r.goals]));
        renderMobileList(scorersBox, top.map((r,i)=>({ title:`${i+1}위 · ${r.name}`, badge:`${r.goals}골`, kvs:[] })));
      }

      const tMatches = data.matches.filter(m => m.home === team || m.away === team).slice()
        .sort((a,b) => (a.round - b.round) || (a.id - b.id));
      if (!tMatches.length) {
        if (matchesBox) matchesBox.innerHTML = `<div class="small">경기가 없어.</div>`;
      } else {
        const temp = { ...data, matches: tMatches };
        renderSchedule(matchesBox, temp);
      }
    }
  }

  // ===============================
  // THEME SWITCH (GLOBAL)
  // ===============================
  const html = document.documentElement;
  const savedTheme = localStorage.getItem("league_theme") || "blue";
  html.setAttribute("data-theme", savedTheme);

  const nav = document.querySelector(".nav");
  if (nav && !nav.querySelector(".themeBtn")) {
    const btn = document.createElement("button");
    btn.className = "themeBtn";

    const themes = ["blue", "purple", "green", "red"];
    const labels = { blue:"블루", purple:"퍼플", green:"그린", red:"레드" };

    btn.textContent = `테마: ${labels[savedTheme]}`;
    btn.onclick = () => {
      const current = html.getAttribute("data-theme") || "blue";
      const idx = themes.indexOf(current);
      const next = themes[(idx + 1) % themes.length];
      html.setAttribute("data-theme", next);
      localStorage.setItem("league_theme", next);
      btn.textContent = `테마: ${labels[next]}`;
    };
    nav.appendChild(btn);
  }

  // mobile app tabbar
  injectTabbar(data, page);
}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch(err => {
    console.error(err);
    document.body.innerHTML = `<div style="padding:20px;color:#fff;">에러: ${err.message}</div>`;
  });
});
