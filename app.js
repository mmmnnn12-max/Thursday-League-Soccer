
     async function loadData() {
  const url = "matches.json";
  const res = await fetch(url, { cache: "no-store" });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text(); // 먼저 text로 받기

  if (!res.ok) {
    console.error("FETCH FAIL:", res.status, res.statusText, "URL:", res.url);
    console.error("BODY(first 200):", text.slice(0, 200));
    throw new Error(`matches.json fetch 실패 (${res.status})`);
  }

  // HTML이면 바로 잡아내기
  if (text.trim().startsWith("<")) {
    console.error("HTML RECEIVED INSTEAD OF JSON. URL:", res.url);
    console.error("BODY(first 200):", text.slice(0, 200));
    throw new Error("matches.json 대신 HTML을 받았어(경로/404/캐시 문제).");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("JSON PARSE ERROR:", e);
    console.error("BODY(first 400):", text.slice(0, 400));
    throw e;
  }

  // 구조 검증(여기서 걸리면 matches.json 구조/경로 문제 확정)
  if (!data || typeof data !== "object") throw new Error("matches.json이 객체가 아님");
  if (!Array.isArray(data.teams)) throw new Error("matches.json에 teams 배열이 없음");
  if (!Array.isArray(data.matches)) throw new Error("matches.json에 matches 배열이 없음");

  return data;
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

// ===== POS HELPERS =====
const isGK = (p) => (String(p?.pos || "").toUpperCase() === "GK");
const isDF = (p) => (String(p?.pos || "").toUpperCase() === "DF");
const isGKOrDF = (p) => (isGK(p) || isDF(p));
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
// 임시: 선수 가치 계산 (아직 기능 미구현이면 0 반환)
function computePlayerValue(playerId, data) {
  return 0;
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

function computePlayerGoalsMap(data){
  const map = new Map(); // playerId -> goals
  for (const g of (data.goals || [])) {
    map.set(g.playerId, (map.get(g.playerId) || 0) + (g.count || 0));
  }
  return map;
}

function computeAllPlayerGoalRanking(data){
  const goalsMap = computePlayerGoalsMap(data);
  const rows = (data.players || []).map(p => ({
    playerId: p.id,
    name: p.name,
    team: p.team,
    goals: goalsMap.get(p.id) || 0
  }));
  rows.sort((a,b)=>
    (b.goals - a.goals) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );
  return rows;
}
function computeAssistLeaders(data) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const score = new Map(); // playerId -> assists

  for (const a of (data.assists || [])) {
    if (!playersById.has(a.playerId)) continue;
    score.set(a.playerId, (score.get(a.playerId) || 0) + (a.count || 0));
  }
   function computePlayerValue(card) {
  // card: computePlayerCard()가 리턴한 객체
  // { goals, assists, cleanSheets, teamW, teamD, teamL, ... }

  const g = card.goals || 0;
  const a = card.assists || 0;
  const cs = card.cleanSheets || 0;

  // 점수 규칙(원하는대로 바꿀 수 있음)
  const score =
    g * 10 +      // 골 10점
    a * 7  +      // 어시 7점
    cs * 6 +      // 클린시트 6점
    (card.teamW || 0) * 1; // 팀 승리 보너스(가볍게)

  return {
    value: score,
    breakdown: [
      `⚽ 득점 ${g} × 10 = ${g*10}`,
      `🅰️ 어시 ${a} × 7 = ${a*7}`,
      `🧤 클린시트 ${cs} × 6 = ${cs*6}`,
      `🏆 팀승 ${card.teamW || 0} × 1 = ${(card.teamW || 0)*1}`,
    ]
  };
}

  const rows = Array.from(score.entries()).map(([playerId, assists]) => {
    const p = playersById.get(playerId);
    return { playerId, name: p.name, team: p.team, assists };
  });

  rows.sort((a,b) =>
    (b.assists - a.assists) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );

  return rows;
}
function computeCleanSheetLeaders(data) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const clean = new Map(); // playerId -> clean sheets

  for (const p of (data.players || [])) clean.set(p.id, 0);

  for (const m of (data.matches || [])) {
    if (m.hg === null || m.ag === null) continue; // 결과 없는 경기 제외

    for (const p of (data.players || [])) {
      const pos = (p.pos || "").toUpperCase();
      if (pos !== "GK" && pos !== "DF") continue; // GK/DF만 클린시트 집계

      const isHome = p.team === m.home;
      const isAway = p.team === m.away;
      if (!isHome && !isAway) continue;

      const ga = isHome ? m.ag : m.hg; // 해당 선수 팀 실점
      if (ga === 0) clean.set(p.id, (clean.get(p.id) || 0) + 1);
    }
  }

  const rows = Array.from(clean.entries())
    .map(([playerId, cs]) => {
      const p = playersById.get(playerId);
      if (!p) return null;
      return { playerId, name: p.name, team: p.team, cs };
    })
    .filter(Boolean);

  rows.sort((a,b) =>
    (b.cs - a.cs) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );

  return rows;
}
function renderLeadersWithLinks(container, kind, rows) {
  // kind: "assist" | "clean"
  if (!rows || rows.length === 0) {
    container.innerHTML = `<div class="small">아직 기록이 없어.</div>`;
    return;
  }

  const medalOf = (i) => (i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : "");
  const label = (kind === "assist") ? "어시" : "CS";

  // PC 표
  const table = el("table", { class: "table" });
  const thead = el("thead");
  const trh = el("tr");
  ["순위","선수","팀", label].forEach(h => trh.appendChild(el("th", { text: h })));
  thead.appendChild(trh);

  const tbody = el("tbody");
  rows.forEach((r, i) => {
    const tr = el("tr");
    tr.appendChild(el("td", { text: String(i+1) }));

    // 선수 링크
    const tdName = document.createElement("td");
    const a = document.createElement("a");
    a.href = `player.html?id=${encodeURIComponent(r.playerId)}`;
    a.className = "playerLink";
    a.textContent = `${medalOf(i)} ${r.name}`.trim();
    tdName.appendChild(a);
    tr.appendChild(tdName);

    tr.appendChild(el("td", { text: r.team }));
    tr.appendChild(el("td", { text: String(kind === "assist" ? r.assists : r.cs) }));

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);

  // 모바일 카드 리스트 (520px 이하에서만 보이도록 네 CSS/구조에 맞춰 출력)
  renderMobileList(container, rows.map((r, i) => ({
    title: `${medalOf(i)} ${i+1}위 · ${r.name}`.trim(),
    badge: `${kind === "assist" ? r.assists : r.cs}${label}`,
    kvs: [["팀", r.team]]
  })));
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

  const medalOf = (i) => (i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : "");

  // PC 표
  renderTable(
    container,
    ["순위","선수","팀","골"],
    rows.map((r, i) => [i+1, `${medalOf(i)} ${r.name}`.trim(), r.team, r.goals])
  );

  // 모바일 카드
  renderMobileList(container, rows.map((r, i) => ({
    title: `${medalOf(i)} ${i+1}위 · ${r.name}`.trim(),
    badge: `${r.goals}골`,
    kvs: [["팀", r.team]]
  })));
}


/* ------------------ Team helpers ------------------ */

function computePlayerCard(data, playerId){
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const player = playersById.get(playerId);
  if (!player) return null;

  // 팀이 치른 "결과 있는 경기" 수
  const teamPlayedMatches = (data.matches || [])
    .filter(m => (m.home === player.team || m.away === player.team) && m.hg !== null && m.ag !== null);

  // 득점/어시 합계
  const goals = (data.goals || [])
    .filter(g => g.playerId === playerId)
    .reduce((a,g) => a + (g.count || 0), 0);

  const assists = (data.assists || [])
    .filter(a => a.playerId === playerId)
    .reduce((a,x) => a + (x.count || 0), 0);

  // 클린시트(GK/DF) — 네 로직 재활용: 팀이 무실점인 경기만 카운트(결과 있는 경기 기준)
  let cleanSheets = 0;
  const pos = String(player.pos || "").toUpperCase();
  if (pos === "GK" || pos === "DF"){
    for (const m of teamPlayedMatches){
      const isHome = (player.team === m.home);
      const ga = isHome ? m.ag : m.hg;
      if (ga === 0) cleanSheets += 1;
    }
  }

  // 팀 성적(결과 있는 경기 기준)
  let teamW=0, teamD=0, teamL=0;
  for (const m of teamPlayedMatches){
    const isHome = (player.team === m.home);
    const gf = isHome ? m.hg : m.ag;
    const ga = isHome ? m.ag : m.hg;
    if (gf > ga) teamW++;
    else if (gf < ga) teamL++;
    else teamD++;
  }

  return {
    player,
    goals,
    assists,
    cleanSheets,
    teamPlayed: teamPlayedMatches.length,
    teamW, teamD, teamL,
  };
}

function renderPlayerMatches(container, data, playerId){
  if (!container) return;

  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const p = playersById.get(playerId);
  if (!p){
    container.innerHTML = `<div class="small">선수 정보를 찾을 수 없어.</div>`;
    return;
  }

  // 현재 데이터 구조상 “출전 기록”이 따로 없어서,
  // 우선은 "팀 경기 전체"를 보여주고(결과/일정), 골/어시가 있으면 표시해줌
  const byMatchGoal = new Map();
  for (const g of (data.goals || [])){
    if (g.playerId !== playerId) continue;
    byMatchGoal.set(g.matchId, (byMatchGoal.get(g.matchId) || 0) + (g.count || 0));
  }
  const byMatchAst = new Map();
  for (const a of (data.assists || [])){
    if (a.playerId !== playerId) continue;
    byMatchAst.set(a.matchId, (byMatchAst.get(a.matchId) || 0) + (a.count || 0));
  }

  const teamMatches = (data.matches || [])
    .filter(m => m.home === p.team || m.away === p.team)
    .slice()
    .sort((a,b) => (a.round - b.round) || (a.id - b.id));

  const items = teamMatches.map(m => {
    const score = (m.hg === null || m.ag === null) ? "미정" : `${m.hg}:${m.ag}`;
    const date = (m.date && m.date.trim()) ? ` · ${m.date}` : "";
    const g = byMatchGoal.get(m.id) || 0;
    const a = byMatchAst.get(m.id) || 0;
    const tag = (g || a) ? ` · ${g ? `⚽${g}` : ""}${(g && a) ? " " : ""}${a ? `🅰️${a}` : ""}` : "";
    return [ `R${m.round}`, `${m.home} vs ${m.away}`, `${score}${date}${tag}` ];
  });

  renderTable(container, ["라운드","경기","결과"], items);
}
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
function getTeamFormLastN(data, team, n = 3) {
  // 최근에 "결과가 입력된 경기" 기준으로 N개
  const played = data.matches
    .filter(m => (m.home === team || m.away === team) && m.hg !== null && m.ag !== null)
    .slice()
    .sort((a,b) => (b.round - a.round) || (b.id - a.id)); // 최신 먼저

  const res = [];
  for (const m of played) {
    const isHome = (m.home === team);
    const gf = isHome ? m.hg : m.ag;
    const ga = isHome ? m.ag : m.hg;

    let r = "D";
    if (gf > ga) r = "W";
    else if (gf < ga) r = "L";

    res.push(r);
    if (res.length >= n) break;
  }

  // 경기 자체가 부족하면 N개로 채움
  while (res.length < n) res.push("N"); // Not enough
  return res;
}

function renderFormDots(formArr) {
  const wrap = document.createElement("span");
  wrap.className = "formDots";
  formArr.forEach(r => {
    const d = document.createElement("span");
    d.className = "formDot";
    d.dataset.r = r;
    wrap.appendChild(d);
  });
  return wrap;
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
    // 🅰️ 어시스트 랭킹
renderLeadersWithLinks(
  document.querySelector("#assistLeaders"),
  "assist",
  computeAssistLeaders(data)
);

// 🧤 클린시트 랭킹 (기록 페이지에는 GK만 표시)
const cleanAll = computeCleanSheetLeaders(data);

// players map (playerId → player)
const playerById = new Map((data.players || []).map(p => [p.id, p]));

// row가 어떤 형태든 GK인지 판별
const cleanGKOnly = cleanAll.filter(row => {
  // 1) row.player에 player 객체가 있는 경우
  if (row && row.player) return isGK(row.player);

  // 2) row.pos에 포지션이 직접 있는 경우
  if (row && row.pos) return String(row.pos).toUpperCase() === "GK";

  // 3) row.playerId에 id만 있는 경우
  if (row && row.playerId) return isGK(playerById.get(row.playerId));

  // 4) 혹시 row.id가 playerId인 경우(가끔 이렇게 구현됨)
  if (row && row.id) return isGK(playerById.get(row.id));

  return false;
});

renderLeadersWithLinks(
  document.querySelector("#cleanSheetLeaders"),
  "clean",
  cleanGKOnly
);
  }
if (page === "player") {
  const params = new URLSearchParams(location.search);
  const playerId = params.get("id");

  const title = document.querySelector("#playerTitle");
  const profile = document.querySelector("#playerProfile");
  const statsBox = document.querySelector("#playerStats");
  const matchesBox = document.querySelector("#playerMatches");
  const valuePill = document.querySelector("#valuePill");
  const breakdownBox = document.querySelector("#valueBreakdown");

  if (!playerId) {
    title.textContent = "선수";
    profile.innerHTML = `<div class="small">id 파라미터가 없어. 예: player.html?id=p1</div>`;
    statsBox.innerHTML = `<div class="small">-</div>`;
    matchesBox.innerHTML = `<div class="small">-</div>`;
  } else {
    const card = computePlayerCard(data, playerId);
    if (!card) {
      title.textContent = "선수";
      profile.innerHTML = `<div class="small">선수를 찾을 수 없어: ${playerId}</div>`;
      statsBox.innerHTML = `<div class="small">-</div>`;
      matchesBox.innerHTML = `<div class="small">-</div>`;
    } else {
      const p = card.player;
      title.textContent = `${p.name}`;

      profile.innerHTML = `
        <div class="small">
          팀: <b>${p.team}</b><br/>
          포지션: <b>${p.pos || "-"}</b><br/>
          팀 경기: ${card.teamPlayed} (승${card.teamW}/무${card.teamD}/패${card.teamL})
        </div>
      `;

      // 몸값 계산
      const val = computePlayerValue(card);
      if (valuePill) valuePill.textContent = `💰 몸값: ${val.value}`;
      if (breakdownBox) breakdownBox.innerHTML = val.breakdown.map(x => `• ${x}`).join("<br/>");

      // 기록 요약 표
      renderTable(statsBox, ["항목","수치"], [
        ["득점", card.goals],
        ["어시스트", card.assists],
        ["클린시트(GK/DF)", card.cleanSheets],
      ]);

      // 참여 경기
      renderPlayerMatches(matchesBox, data, playerId);
    }
  }
}

     if (page === "players") {
  const teamSel = document.querySelector("#playerTeamFilter");
  const searchInp = document.querySelector("#playerSearch");
  const listBox = document.querySelector("#playersList");
  const rankBox = document.querySelector("#playersGoalRank");
  const countPill = document.querySelector("#playersCount");

  // 팀 필터 옵션
  teamSel.innerHTML = "";
  teamSel.appendChild(el("option", { value: "__ALL__", text: "전체 팀" }));
  (data.teams || []).forEach(t => teamSel.appendChild(el("option", { value: t, text: t })));

  const render = () => {
    const team = teamSel.value;
    const q = (searchInp.value || "").trim();

    const goalsMap = computePlayerGoalsMap(data);

    let players = (data.players || []).slice();
    if (team !== "__ALL__") players = players.filter(p => p.team === team);
    if (q) players = players.filter(p => p.name.includes(q));

    // 이름 정렬
    players.sort((a,b)=> a.team.localeCompare(b.team,"ko") || a.name.localeCompare(b.name,"ko"));

    countPill.textContent = `표시: ${players.length}명`;

    // 선수 목록: PC표 + 모바일 카드(모바일에선 표 숨김/카드 보임)
    const listRows = players.map((p, i) => ([
      i+1,
      p.name, // 아래에서 링크로 바꿔 렌더링할 거라 renderTable 대신 커스텀
      p.team,
      goalsMap.get(p.id) || 0
    ]));

    // 커스텀 테이블(이름 링크)
    const table = el("table", { class: "table" });
    const thead = el("thead");
    const trh = el("tr");
    ["번호","선수","팀","골"].forEach(h => trh.appendChild(el("th",{text:h})));
    thead.appendChild(trh);

    const tbody = el("tbody");
    players.forEach((p, idx) => {
      const tr = el("tr");
      tr.appendChild(el("td", { text: String(idx+1) }));

      const tdName = document.createElement("td");
      const a = document.createElement("a");
    a.href = `player.html?id=${encodeURIComponent(p.id)}`;
      a.className = "playerLink";
      a.textContent = p.name;
      tdName.appendChild(a);
      tr.appendChild(tdName);

      tr.appendChild(el("td", { text: p.team }));
      tr.appendChild(el("td", { text: String(goalsMap.get(p.id) || 0) }));
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    listBox.innerHTML = "";
    listBox.appendChild(table);

    // 모바일 카드
    renderMobileList(listBox, players.map(p => ({
      title: p.name,
      badge: `${goalsMap.get(p.id) || 0}골`,
      kvs: [["팀", p.team]],
    })));

    // 득점 랭킹(전체)
    const allRank = computeAllPlayerGoalRanking(data);
    const medalOf = (i)=>(i===0?"🥇":i===1?"🥈":i===2?"🥉":"");
    renderTable(rankBox, ["순위","선수","팀","골"],
      allRank.map((r,i)=>[i+1, `${medalOf(i)} ${r.name}`.trim(), r.team, r.goals])
    );
    renderMobileList(rankBox, allRank.map((r,i)=>({
      title: `${medalOf(i)} ${i+1}위 · ${r.name}`.trim(),
      badge: `${r.goals}골`,
      kvs: [["팀", r.team]],
    })));
  };

  teamSel.addEventListener("change", render);
  searchInp.addEventListener("input", render);
  render();
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
       const form = getTeamFormLastN(data, team, 3);
const formText = form.map(x => x==="W"?"승":x==="D"?"무":x==="L"?"패":"-").join(" ");

summaryBox.innerHTML = `
  <div class="small">
    <b>${s.rank}위</b> · 승점 <b>${s.PTS}</b><br/>
    ${s.P}경기 ${s.W}승 ${s.D}무 ${s.L}패<br/>
    득점 ${s.GF} / 실점 ${s.GA} / 득실 ${s.GD}
  </div>
`;

const formRow = document.createElement("div");
formRow.className = "formRow";
formRow.appendChild(Object.assign(document.createElement("span"), { className: "formLabel", textContent: "최근 3경기" }));
formRow.appendChild(renderFormDots(form));
formRow.appendChild(Object.assign(document.createElement("span"), { className: "formText", textContent: `(${formText})` }));

summaryBox.appendChild(formRow);

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
    document.body.innerHTML = `
      <div style="
        padding:20px;
        color:#fff;
        background:#000;
        font-family:ui-monospace, Menlo, monospace;
        white-space:pre-wrap;
      ">
에러 메시지:
${err.message}

에러 위치:
${err.stack || "(stack 없음)"}
      </div>
    `;
  });
});
