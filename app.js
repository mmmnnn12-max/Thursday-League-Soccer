
     
     async function loadData() {
  const url = "matches.json";
  const res = await fetch(url, { cache: "no-store" });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    console.error("FETCH FAIL:", res.status, res.statusText, "URL:", res.url);
    console.error("BODY(first 200):", text.slice(0, 200));
    throw new Error(`matches.json fetch 실패 (${res.status})`);
  }

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

  if (!data || typeof data !== "object") throw new Error("matches.json이 객체가 아님");
  if (!Array.isArray(data.teams)) throw new Error("matches.json에 teams 배열이 없음");
  if (!Array.isArray(data.matches)) throw new Error("matches.json에 matches 배열이 없음");

  return data;
}

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
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
  const list = el("div", { class: "mList" });

  items.forEach(it => {
    const wrap = document.createElement(it.href ? "a" : "div");
    wrap.className = "mItem" + (it.href ? " mItemLink" : "");
    if (it.href) wrap.href = it.href;

    const top = el("div", { class: "mTop" }, [
      el("div", { text: it.title }),
      el("div", { text: it.badge || "" })
    ]);

    const meta = el("div", { class: "mMeta" });
    (it.kvs || []).forEach(([k, v]) => {
      meta.appendChild(el("div", { class: "kv" }, [
        el("div", { class: "k", text: k }),
        el("div", { class: "v", text: String(v) })
      ]));
    });

    wrap.appendChild(top);
    wrap.appendChild(meta);
    list.appendChild(wrap);
  });

  container.appendChild(list);
}

/* ------------------ Compute ------------------ */

const isGK = (p) => (String(p?.pos || "").toUpperCase() === "GK");
const isDF = (p) => (String(p?.pos || "").toUpperCase() === "DF");
const isGKOrDF = (p) => (isGK(p) || isDF(p));

function computeStandings(data) {
  const { teams, rules, matches } = data;
  const table = {};
  teams.forEach(t => table[t] = { team: t, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 });

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

  return Object.values(table).sort((a, b) =>
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
    .sort((a, b) => (b.gf - a.gf) || a.team.localeCompare(b.team, "ko"));
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

  rows.sort((a, b) =>
    (b.goals - a.goals) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );

  return rows;
}

function computePlayerGoalsMap(data) {
  const map = new Map();
  for (const g of (data.goals || [])) {
    map.set(g.playerId, (map.get(g.playerId) || 0) + (g.count || 0));
  }
  return map;
}

function computeAllPlayerGoalRanking(data) {
  const goalsMap = computePlayerGoalsMap(data);
  const rows = (data.players || []).map(p => ({
    playerId: p.id,
    name: p.name,
    team: p.team,
    goals: goalsMap.get(p.id) || 0
  }));
  rows.sort((a, b) =>
    (b.goals - a.goals) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );
  return rows;
}

function computeAssistLeaders(data) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const score = new Map();

  for (const a of (data.assists || [])) {
    if (!playersById.has(a.playerId)) continue;
    score.set(a.playerId, (score.get(a.playerId) || 0) + (a.count || 0));
  }

  const rows = Array.from(score.entries()).map(([playerId, assists]) => {
    const p = playersById.get(playerId);
    return { playerId, name: p.name, team: p.team, assists };
  });

  rows.sort((a, b) =>
    (b.assists - a.assists) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );

  return rows;
}

/* ============================================================
   ✅ 몸값 계산 (패널티 포함)
   - 지면(teamL) 몸값 감소
   - GK/DF가 대량실점(4실점 이상) 하면 몸값 더 크게 감소
   - 실점(전체)도 GK/DF에게 약하게 페널티
   ============================================================ */
function computePlayerValue(card) {
  const g = card.goals || 0;
  const a = card.assists || 0;
  const cs = card.cleanSheets || 0;

  const base = 50;

  const bonus =
    g * 10 +                 // 골
    a * 7 +                  // 어시
    cs * 6 +                 // 클린시트
    (card.teamW || 0) * 1;   // 팀승 보너스

  // ✅ 패널티
  const lossPenalty = (card.teamL || 0) * 3;   // 패배 1번당 -3억 (원하면 조절)
  const drawPenalty = (card.teamD || 0) * 0;   // 무승부 페널티(원하면 0.5 등으로)

  // GK/DF면 실점 관련 페널티 적용, 공격수/미드면 거의 안 주기
  const pos = String(card.player?.pos || "").toUpperCase();
  const isDefRole = (pos === "GK" || pos === "DF");

  const concededTotal = card.concededTotal || 0;
  const heavyConcede = card.heavyConcede || 0;

  const concedePenalty = isDefRole ? (concededTotal * 0.5) : 0;    // 총 실점 1골당 -0.5억
  const heavyPenalty = isDefRole ? (heavyConcede * 4) : 0;         // 4실점부터 급격히 -4억씩

  // 최종
  let total = base + bonus - lossPenalty - drawPenalty - concedePenalty - heavyPenalty;

  // 최소값(바닥) 설정 (0 밑으로 내려가면 보기 이상해서)
  total = Math.max(0, Math.round(total));

  return {
    value: total,
    valueText: `${total}억`,
    breakdown: [
      `기본 몸값: ${base}억`,
      `⚽ 득점 ${g} × 10 = ${g * 10}억`,
      `🅰️ 어시 ${a} × 7 = ${a * 7}억`,
      `🧤 클린시트 ${cs} × 6 = ${cs * 6}억`,
      `🏆 팀승 ${card.teamW || 0} × 1 = ${(card.teamW || 0) * 1}억`,
      `— 패널티 —`,
      `❌ 패배 ${card.teamL || 0} × 3 = -${lossPenalty}억`,
      isDefRole ? `🥅 총 실점 ${concededTotal} × 0.5 = -${Math.round(concedePenalty)}억` : `🥅 총 실점 페널티: 0억(공격/미드)`,
      isDefRole ? `💥 대량실점(4+) 가중치 ${heavyConcede} × 4 = -${heavyPenalty}억` : `💥 대량실점 가중치: 0억(공격/미드)`,
      `합계: ${total}억`,
    ]
  };
}

function computeValueRanking(data) {
  const rows = (data.players || [])
    .map(p => {
      const card = computePlayerCard(data, p.id);
      if (!card) return null;
      const val = computePlayerValue(card);
      return { playerId: p.id, name: p.name, team: p.team, value: val.value };
    })
    .filter(Boolean)
    .sort((a, b) =>
      (b.value - a.value) ||
      a.team.localeCompare(b.team, "ko") ||
      a.name.localeCompare(b.name, "ko")
    );

  return rows;
}

function computeCleanSheetLeaders(data) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const clean = new Map();

  for (const p of (data.players || [])) clean.set(p.id, 0);

  for (const m of (data.matches || [])) {
    if (m.hg === null || m.ag === null) continue;

    for (const p of (data.players || [])) {
      const pos = (p.pos || "").toUpperCase();
      if (pos !== "GK" && pos !== "DF") continue;

      const isHome = p.team === m.home;
      const isAway = p.team === m.away;
      if (!isHome && !isAway) continue;

      const ga = isHome ? m.ag : m.hg;
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

  rows.sort((a, b) =>
    (b.cs - a.cs) ||
    a.team.localeCompare(b.team, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );

  return rows;
}

function renderLeadersWithLinks(container, kind, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `<div class="small">아직 기록이 없어.</div>`;
    return;
  }

  const medalOf = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");
  const label = (kind === "assist") ? "어시" : "CS";

  const table = el("table", { class: "table" });
  const thead = el("thead");
  const trh = el("tr");
  ["순위", "선수", "팀", label].forEach(h => trh.appendChild(el("th", { text: h })));
  thead.appendChild(trh);

  const tbody = el("tbody");
  rows.forEach((r, i) => {
    const tr = el("tr");
    tr.appendChild(el("td", { text: String(i + 1) }));

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

  renderMobileList(container, rows.map((r, i) => ({
    title: `${medalOf(i)} ${i + 1}위 · ${r.name}`.trim(),
    badge: `${kind === "assist" ? r.assists : r.cs}${label}`,
    kvs: [["팀", r.team]]
  })));
}

/* ------------------ Render ------------------ */

function renderStandings(container, standings) {
  const table = el("table", { class: "table" });
  const thead = el("thead");
  const trh = el("tr");
  ["순위", "팀", "경기", "승", "무", "패", "득점", "실점", "득실", "승점"].forEach(h =>
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
    title: `${i + 1}위 · ${r.team}`,
    badge: `${r.PTS}점`,
    href: `team.html?team=${encodeURIComponent(r.team)}`,
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

  const rounds = Object.keys(groups).map(Number).sort((a, b) => a - b).filter(r => r <= maxRounds);

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
  renderTable(container, ["순위", "팀", "총 득점"], rows.map((r, i) => [i + 1, r.team, r.gf]));
  renderMobileList(container, rows.map((r, i) => ({
    title: `${i + 1}위 · ${r.team}`,
    badge: `${r.gf}골`,
    kvs: []
  })));
}

function renderTeamPlayers(container, data, team) {
  if (!container) return;

  const players = (data.players || [])
    .filter(p => p.team === team)
    .slice()
    .sort((a, b) => {
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      const ap = String(a.pos || "").toUpperCase();
      const bp = String(b.pos || "").toUpperCase();
      const ao = (ap in order) ? order[ap] : 9;
      const bo = (bp in order) ? order[bp] : 9;
      return (ao - bo) || a.name.localeCompare(b.name, "ko");
    });

  if (!players.length) {
    container.innerHTML = `<div class="small">등록된 선수가 없어.</div>`;
    return;
  }

  const table = el("table", { class: "table" });
  const thead = el("thead");
  const trh = el("tr");
  ["번호", "선수", "포지션"].forEach(h => trh.appendChild(el("th", { text: h })));
  thead.appendChild(trh);

  const tbody = el("tbody");
  players.forEach((p, idx) => {
    const tr = el("tr");
    tr.appendChild(el("td", { text: String(idx + 1) }));

    const tdName = document.createElement("td");
    const a = document.createElement("a");
    a.href = `player.html?id=${encodeURIComponent(p.id)}`;
    a.className = "playerLink";
    a.textContent = p.name;
    tdName.appendChild(a);
    tr.appendChild(tdName);

    tr.appendChild(el("td", { text: (p.pos || "-") }));
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);

  renderMobileList(container, players.map(p => ({
    title: p.name,
    badge: p.pos || "-",
    href: `player.html?id=${encodeURIComponent(p.id)}`,
    kvs: [["팀", p.team]]
  })));
}

function renderTopScorers(container, rows) {
  if (!rows.length) {
    container.innerHTML = `<div class="small">아직 득점자가 입력되지 않았어.</div>`;
    return;
  }

  const medalOf = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");

  renderTable(
    container,
    ["순위", "선수", "팀", "골"],
    rows.map((r, i) => [i + 1, `${medalOf(i)} ${r.name}`.trim(), r.team, r.goals])
  );

  renderMobileList(container, rows.map((r, i) => ({
    title: `${medalOf(i)} ${i + 1}위 · ${r.name}`.trim(),
    badge: `${r.goals}골`,
    kvs: [["팀", r.team]]
  })));
}

/* ------------------ Team helpers ------------------ */

function computePlayerCard(data, playerId) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const player = playersById.get(playerId);
  if (!player) return null;

  const teamPlayedMatches = (data.matches || [])
    .filter(m => (m.home === player.team || m.away === player.team) && m.hg !== null && m.ag !== null);

  const goals = (data.goals || [])
    .filter(g => g.playerId === playerId)
    .reduce((a, g) => a + (g.count || 0), 0);

  const assists = (data.assists || [])
    .filter(a => a.playerId === playerId)
    .reduce((a, x) => a + (x.count || 0), 0);

  let cleanSheets = 0;
  const pos = String(player.pos || "").toUpperCase();
  if (pos === "GK" || pos === "DF") {
    for (const m of teamPlayedMatches) {
      const isHome = (player.team === m.home);
      const ga = isHome ? m.ag : m.hg;
      if (ga === 0) cleanSheets += 1;
    }
  }

  // ✅ 팀 성적 + 실점 관련(결과 있는 경기 기준)
  let teamW = 0, teamD = 0, teamL = 0;
  let concededTotal = 0;
  let heavyConcede = 0;

  for (const m of teamPlayedMatches) {
    const isHome = (player.team === m.home);
    const gf = isHome ? m.hg : m.ag;
    const ga = isHome ? m.ag : m.hg;

    concededTotal += ga;
    if (ga >= 4) heavyConcede += (ga - 3);

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

    // ✅ 추가
    concededTotal,
    heavyConcede,
  };
}

function renderPlayerMatches(container, data, playerId) {
  if (!container) return;

  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const p = playersById.get(playerId);
  if (!p) {
    container.innerHTML = `<div class="small">선수 정보를 찾을 수 없어.</div>`;
    return;
  }

  const byMatchGoal = new Map();
  for (const g of (data.goals || [])) {
    if (g.playerId !== playerId) continue;
    byMatchGoal.set(g.matchId, (byMatchGoal.get(g.matchId) || 0) + (g.count || 0));
  }

  const byMatchAst = new Map();
  for (const a of (data.assists || [])) {
    if (a.playerId !== playerId) continue;
    byMatchAst.set(a.matchId, (byMatchAst.get(a.matchId) || 0) + (a.count || 0));
  }

  const teamMatches = (data.matches || [])
    .filter(m => m.home === p.team || m.away === p.team)
    .slice()
    .sort((a, b) => (a.round - b.round) || (a.id - b.id));

  const items = teamMatches.map(m => {
    const score = (m.hg === null || m.ag === null) ? "미정" : `${m.hg}:${m.ag}`;
    const date = (m.date && m.date.trim()) ? ` · ${m.date}` : "";
    const g = byMatchGoal.get(m.id) || 0;
    const a = byMatchAst.get(m.id) || 0;
    const tag = (g || a) ? ` · ${g ? `⚽${g}` : ""}${(g && a) ? " " : ""}${a ? `🅰️${a}` : ""}` : "";
    return [`R${m.round}`, `${m.home} vs ${m.away}`, `${score}${date}${tag}`];
  });

  renderTable(container, ["라운드", "경기", "결과"], items);

  renderMobileList(container, items.map(row => ({
    title: `${row[0]} · ${row[1]}`,
    badge: "",
    kvs: [["결과", row[2]]],
  })));
}

function getTeamMatches(data, team) {
  return data.matches
    .filter(m => m.home === team || m.away === team)
    .slice()
    .sort((a, b) => (a.round - a.round) || (a.id - b.id));
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

  rows.sort((a, b) => (b.goals - a.goals) || a.name.localeCompare(b.name, "ko"));
  return rows;
}

function getTeamFormLastN(data, team, n = 3) {
  const played = data.matches
    .filter(m => (m.home === team || m.away === team) && m.hg !== null && m.ag !== null)
    .slice()
    .sort((a, b) => (b.round - a.round) || (b.id - a.id));

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

  while (res.length < n) res.push("N");
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

function injectTabbar(data, page) {
  if (document.querySelector(".tabbar")) return;

  const bar = document.createElement("div");
  bar.className = "tabbar";

  const inner = document.createElement("div");
  inner.className = "tabbarInner";

  const items = [
    { key: "standings", href: "index.html", label: "순위", ico: "🏆" },
    { key: "schedule", href: "schedule.html", label: "일정", ico: "📅" },
    { key: "stats", href: "stats.html", label: "기록", ico: "📊" },
    { key: "players", href: "players.html", label: "선수", ico: "🧍" },
    { key: "values", href: "values.html", label: "몸값", ico: "💰" },
  ];

  for (const it of items) {
    const a = document.createElement("a");
    a.className = "tab" + (page === it.key ? " active" : "");
    a.href = it.href;
    a.innerHTML = `<div class="ico">${it.ico}</div><div>${it.label}</div>`;
    inner.appendChild(a);
  }

  bar.appendChild(inner);
  document.body.appendChild(bar);
}

function openTeamSheet(data) {
  let overlay = document.querySelector("#teamSheetOverlay");
  if (!overlay) {
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
      const allRounds = Array.from(new Set(data.matches.map(m => m.round))).sort((a, b) => a - b);
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

  if (page === "values") {
    const box = document.querySelector("#valueRank");
    const top10 = computeValueRanking(data).slice(0, 10);

    const medalOf = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");

    renderTable(box, ["순위", "선수", "팀", "몸값(억)"], top10.map((r, i) => [
      i + 1,
      `${medalOf(i)} ${r.name}`.trim(),
      r.team,
      r.value
    ]));

    renderMobileList(box, top10.map((r, i) => ({
      title: `${medalOf(i)} ${i + 1}위 · ${r.name}`.trim(),
      badge: `${r.value}억`,
      kvs: [["팀", r.team]]
    })));
  }

  if (page === "schedule") {
    const box = document.querySelector("#schedule");
    const btn = document.querySelector("#btnMore");
    const allRounds = Array.from(new Set(data.matches.map(m => m.round))).sort((a, b) => a - b);
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

    renderLeadersWithLinks(
      document.querySelector("#assistLeaders"),
      "assist",
      computeAssistLeaders(data)
    );

    const cleanAll = computeCleanSheetLeaders(data);
    const playerById = new Map((data.players || []).map(p => [p.id, p]));

    const cleanGKOnly = cleanAll.filter(row => {
      if (row && row.player) return isGK(row.player);
      if (row && row.pos) return String(row.pos).toUpperCase() === "GK";
      if (row && row.playerId) return isGK(playerById.get(row.playerId));
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

        const val = computePlayerValue(card);
        if (valuePill) valuePill.textContent = `💰 몸값: ${val.valueText || val.value}`;
        if (breakdownBox) breakdownBox.innerHTML = (val.breakdown || []).map(x => `• ${x}`).join("<br/>");

        renderTable(statsBox, ["항목", "수치"], [
          ["득점", card.goals],
          ["어시스트", card.assists],
          ["클린시트(GK/DF)", card.cleanSheets],
        ]);

        renderMobileList(statsBox, [
          {
            title: "기록 요약",
            badge: "",
            kvs: [
              ["득점", card.goals],
              ["어시스트", card.assists],
              ["클린시트(GK/DF)", card.cleanSheets],
            ]
          }
        ]);

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
    const valueRankBox = document.querySelector("#playersValueRank");

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

      players.sort((a, b) => a.team.localeCompare(b.team, "ko") || a.name.localeCompare(b.name, "ko"));

      countPill.textContent = `표시: ${players.length}명`;

      const table = el("table", { class: "table" });
      const thead = el("thead");
      const trh = el("tr");
      ["번호", "선수", "팀", "골"].forEach(h => trh.appendChild(el("th", { text: h })));
      thead.appendChild(trh);

      const tbody = el("tbody");
      players.forEach((p, idx) => {
        const tr = el("tr");
        tr.appendChild(el("td", { text: String(idx + 1) }));

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

      renderMobileList(listBox, players.map(p => ({
        title: p.name,
        badge: `${goalsMap.get(p.id) || 0}골`,
        href: `player.html?id=${encodeURIComponent(p.id)}`,
        kvs: [["팀", p.team]],
      })));

      const allRank = computeAllPlayerGoalRanking(data);
      const medalOf = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");

      renderTable(rankBox, ["순위", "선수", "팀", "골"],
        allRank.map((r, i) => [i + 1, `${medalOf(i)} ${r.name}`.trim(), r.team, r.goals])
      );

      renderMobileList(rankBox, allRank.map((r, i) => ({
        title: `${medalOf(i)} ${i + 1}위 · ${r.name}`.trim(),
        badge: `${r.goals}골`,
        href: `player.html?id=${encodeURIComponent(r.playerId)}`,
        kvs: [["팀", r.team]],
      })));

      // 💰 몸값 랭킹(있으면 그리기)
      if (valueRankBox) {
        const rows = (data.players || []).map(p => {
          const card = computePlayerCard(data, p.id);
          const val = card ? computePlayerValue(card) : { value: 0 };
          return { playerId: p.id, name: p.name, team: p.team, value: val.value };
        });

        rows.sort((a, b) =>
          (b.value - a.value) ||
          a.team.localeCompare(b.team, "ko") ||
          a.name.localeCompare(b.name, "ko")
        );

        const t = el("table", { class: "table" });
        const th = el("thead");
        const thr = el("tr");
        ["순위", "선수", "팀", "몸값"].forEach(h => thr.appendChild(el("th", { text: h })));
        th.appendChild(thr);

        const tb = el("tbody");
        rows.forEach((r, i) => {
          const tr = el("tr");
          tr.appendChild(el("td", { text: String(i + 1) }));

          const tdName = document.createElement("td");
          const a = document.createElement("a");
          a.href = `player.html?id=${encodeURIComponent(r.playerId)}`;
          a.className = "playerLink";
          a.textContent = r.name;
          tdName.appendChild(a);
          tr.appendChild(tdName);

          tr.appendChild(el("td", { text: r.team }));
          tr.appendChild(el("td", { text: String(r.value) }));
          tb.appendChild(tr);
        });

        t.appendChild(th);
        t.appendChild(tb);

        valueRankBox.innerHTML = "";
        valueRankBox.appendChild(t);

        renderMobileList(valueRankBox, rows.map((r, i) => ({
          title: `${i + 1}위 · ${r.name}`,
          badge: `💰 ${r.value}억`,
          href: `player.html?id=${encodeURIComponent(r.playerId)}`,
          kvs: [["팀", r.team]],
        })));
      }
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
    const playersBox = document.querySelector("#teamPlayers");
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
        const formText = form.map(x => x === "W" ? "승" : x === "D" ? "무" : x === "L" ? "패" : "-").join(" ");

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
        renderTable(scorersBox, ["순위", "선수", "골"], top.map((r, i) => [i + 1, r.name, r.goals]));
        renderMobileList(scorersBox, top.map((r, i) => ({ title: `${i + 1}위 · ${r.name}`, badge: `${r.goals}골`, kvs: [] })));
      }

      renderTeamPlayers(playersBox, data, team);

      const tMatches = data.matches.filter(m => m.home === team || m.away === team).slice()
        .sort((a, b) => (a.round - b.round) || (a.id - b.id));
      if (!tMatches.length) {
        if (matchesBox) matchesBox.innerHTML = `<div class="small">경기가 없어.</div>`;
      } else {
        const temp = { ...data, matches: tMatches };
        renderSchedule(matchesBox, temp);
      }
    }
  }

  // THEME SWITCH
  const html = document.documentElement;
  const savedTheme = localStorage.getItem("league_theme") || "blue";
  html.setAttribute("data-theme", savedTheme);

  const nav = document.querySelector(".nav");
  if (nav && !nav.querySelector(".themeBtn")) {
    const btn = document.createElement("button");
    btn.className = "themeBtn";

    const themes = ["blue", "purple", "green", "red"];
    const labels = { blue: "블루", purple: "퍼플", green: "그린", red: "레드" };

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
