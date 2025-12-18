async function loadData() {
  const res = await fetch("matches.json", { cache: "no-store" });
  if (!res.ok) throw new Error("matches.json을 불러오지 못했어요.");
  return await res.json();
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function getTeamMatches(data, team) {
  return data.matches
    .filter(m => m.home === team || m.away === team)
    .slice()
    .sort((a,b) => (a.round - b.round) || (a.id - b.id));
}

function getTeamSummary(data, team) {
  const standings = computeStandings(data);
  const row = standings.find(r => r.team === team);

  if (!row) return null;

  const rank = standings.findIndex(r => r.team === team) + 1;

  return {
    rank,
    ...row
  };
}

function getTeamTopScorers(data, team) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const score = new Map(); // playerId -> goals

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

// “우승 확정” 판단(간단 버전): 현재 1위의 승점이 2위의 최대 가능 승점보다 크면 확정
function computeTitleStatus(data) {
  const standings = computeStandings(data);
  const { rules } = data;
  const { remaining } = computeRemaining(data);

  if (standings.length < 2) return { text: "데이터 부족", kind: "neutral" };

  const leader = standings[0];
  const runner = standings[1];

  // 각 팀별 남은 경기 수 계산
  const left = {};
  data.teams.forEach(t => left[t] = 0);
  for (const m of data.matches) {
    if (m.hg !== null && m.ag !== null) continue;
    left[m.home]++; left[m.away]++;
  }

  const leaderMax = leader.PTS + left[leader.team] * rules.win;
  const runnerMax = runner.PTS + left[runner.team] * rules.win;

  if (leader.PTS > runnerMax) {
    return { text: `🏆 ${leader.team} 우승 확정!`, kind: "win" };
  }
  if (remaining === 0) {
    return { text: `🏁 리그 종료 · 우승: ${leader.team}`, kind: "win" };
  }
  return { text: `🔥 우승 경쟁 중 · 현재 1위: ${leader.team} (최대 ${leaderMax}점)`, kind: "hot" };
}

function computeScorers(data) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const score = new Map(); // playerId -> goals

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

function coverageGoals(data) {
  // 경기별로 goals가 얼마나 입력됐는지(스코어와 합이 맞는지) 확인
  const byMatch = new Map();
  for (const g of (data.goals || [])) {
    byMatch.set(g.matchId, (byMatch.get(g.matchId) || 0) + (g.count || 0));
  }
  const played = data.matches.filter(m => m.hg !== null && m.ag !== null);
  const ok = played.filter(m => (byMatch.get(m.id) || 0) === (m.hg + m.ag)).length;
  return { played: played.length, ok };
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
    const tr = el("tr", { class: i === 0 ? "rank1" : "" });

    // 1) 순위
    tr.appendChild(el("td", { text: String(i + 1) }));

    // 2) 팀(링크)
   const teamTd = document.createElement("td");
const a = document.createElement("a");
a.href = `team.html?team=${encodeURIComponent(r.team)}`;
a.className = "teamLink";
a.innerHTML = `<span class="icon">↗</span><span>${r.team}</span>`;
teamTd.appendChild(a);
tr.appendChild(teamTd);

    // 3) 나머지 숫자들
    [r.P, r.W, r.D, r.L, r.GF, r.GA, r.GD, r.PTS].forEach(v => {
      tr.appendChild(el("td", { text: String(v) }));
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
  // 모바일 카드 리스트도 같이 출력(520px 이하에서만 보임)
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

  const rounds = Object.keys(groups)
    .map(Number)
    .sort((a,b)=>a-b)
    .filter(r => r <= maxRounds);

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

/* ------------------ Admin logic (폼 입력 → JSON 생성) ------------------ */
function fmtMatchLabel(m) {
  const score = (m.hg === null || m.ag === null) ? "미정" : `${m.hg}:${m.ag}`;
  const date = (m.date && m.date.trim()) ? ` · ${m.date}` : "";
  return `#${m.id} (R${m.round}) ${m.home} vs ${m.away} · ${score}${date}`;
}

function buildPlayersOptions(data) {
  const byTeam = {};
  for (const p of (data.players || [])) {
    if (!byTeam[p.team]) byTeam[p.team] = [];
    byTeam[p.team].push(p);
  }
  Object.values(byTeam).forEach(arr => arr.sort((a,b)=>a.name.localeCompare(b.name, "ko")));
  return byTeam;
}

function renderGoalList(container, data, matchId) {
  const playersById = new Map((data.players || []).map(p => [p.id, p]));
  const items = (data.goals || []).filter(g => g.matchId === matchId);
  if (!items.length) {
    container.innerHTML = `<div class="small">아직 입력 없음</div>`;
    return;
  }
  const lines = items.map(g => {
    const p = playersById.get(g.playerId);
    const name = p ? `${p.team} · ${p.name}` : g.playerId;
    return `<div class="goalItem"><b>${name}</b> — ${g.count}골</div>`;
  }).join("");
  container.innerHTML = lines;
}

function validateGoalSum(data, match) {
  const sum = (data.goals || [])
    .filter(g => g.matchId === match.id)
    .reduce((acc, g) => acc + (g.count || 0), 0);

  if (match.hg === null || match.ag === null) return { ok: true, msg: "" };
  const target = match.hg + match.ag;
  if (sum === target) return { ok: true, msg: "" };
  return { ok: false, msg: `⚠️ 득점자 합계(${sum})가 스코어 합계(${target})와 다름` };
}

async function boot() {
  const page = document.body.dataset.page;
  const original = await loadData();
  let data = deepClone(original);

  if (page === "standings") {
  const standings = computeStandings(data);
  renderStandings(document.querySelector("#standings"), standings);

  const box = document.querySelector("#miniSchedule");
  const btn = document.querySelector("#btnMoreMini");

  // round 목록
  const allRounds = Array.from(new Set(data.matches.map(m => m.round))).sort((a,b)=>a-b);

  let shown = 2; // 처음엔 2라운드까지만 보이게(원하면 1로 바꿔도 됨)

  const renderMini = () => {
    const maxRound = allRounds[Math.min(shown, allRounds.length) - 1];
    renderSchedule(box, data, { maxRounds: maxRound });

    if (btn) {
      btn.style.display = (shown >= allRounds.length) ? "none" : "inline-block";
    }
  };

  if (btn) {
    btn.onclick = () => {
      shown += 1;     // 더보기 누를 때마다 1라운드 추가 (원하면 2로 바꿔도 됨)
      renderMini();
    };
  }

  renderMini();
}

  if (page === "team") {
  const params = new URLSearchParams(location.search);
  const team = params.get("team");

  const title = document.querySelector("#teamTitle");
  const summaryBox = document.querySelector("#teamSummary");
  const scorersBox = document.querySelector("#teamScorers");
  const matchesBox = document.querySelector("#teamMatches");

  if (!team) {
    title.textContent = "팀";
    summaryBox.innerHTML = `<div class="small">team 파라미터가 없어. 예: team.html?team=팀임태원</div>`;
    scorersBox.innerHTML = `<div class="small">-</div>`;
    matchesBox.innerHTML = `<div class="small">-</div>`;
  } else {
    title.textContent = team;

    const s = getTeamSummary(data, team);
    if (!s) {
      summaryBox.innerHTML = `<div class="small">팀을 찾을 수 없어: ${team}</div>`;
    } else {
      summaryBox.innerHTML = `
        <div class="small">
          <b>${s.rank}위</b> · 승점 <b>${s.PTS}</b><br/>
          ${s.P}경기 ${s.W}승 ${s.D}무 ${s.L}패<br/>
          득점 ${s.GF} / 실점 ${s.GA} / 득실 ${s.GD}
        </div>
      `;
    }

    const top = getTeamTopScorers(data, team);
    if (!top.length) {
      scorersBox.innerHTML = `<div class="small">아직 득점 기록이 없어.</div>`;
    } else {
      renderTable(scorersBox, ["순위", "선수", "골"], top.map((r,i)=>[i+1, r.name, r.goals]));
    }

    // 경기 목록(팀 포함된 것만)
    const tMatches = getTeamMatches(data, team);
    if (!tMatches.length) {
      matchesBox.innerHTML = `<div class="small">경기가 없어.</div>`;
    } else {
      // round별 카드로 보기 좋게
      const temp = { ...data, matches: tMatches };
      renderSchedule(matchesBox, temp);
    }
  }
}


  if (page === "schedule") {
  const box = document.querySelector("#schedule");
  const btn = document.querySelector("#btnMore");

  // 전체 라운드 개수 계산
  const allRounds = Array.from(new Set(data.matches.map(m => m.round))).sort((a,b)=>a-b);

  let shown = 2; // 처음엔 2라운드까지만 보여줌
  const render = () => {
    const maxRound = allRounds[Math.min(shown, allRounds.length) - 1];
    renderSchedule(box, data, { maxRounds: maxRound });

    if (btn) {
      if (shown >= allRounds.length) {
        btn.style.display = "none";
      } else {
        btn.style.display = "inline-block";
      }
    }
  };

  if (btn) {
    btn.onclick = () => {
      shown += 1; // 더보기 누를 때마다 1라운드 추가
      render();
    };
  }

  render();
}

  if (page === "stats") {
    const status = computeTitleStatus(data);
    const remain = computeRemaining(data);
    document.querySelector("#titleStatus").textContent = status.text;
    document.querySelector("#titleStatus").dataset.kind = status.kind;
    document.querySelector("#remainingGames").textContent = String(remain.remaining);
    document.querySelector("#totalGames").textContent = String(remain.total);

    renderTeamGoals(document.querySelector("#teamGoals"), computeTeamGoals(data));
    renderTopScorers(document.querySelector("#topScorers"), computeScorers(data));

    const cov = coverageGoals(data);
    document.querySelector("#goalCoverage").textContent =
      `결과가 입력된 경기 ${cov.played}경기 중 득점자 합계까지 맞는 경기: ${cov.ok}경기`;
  }

  if (page === "admin") {
    const matchSelect = document.querySelector("#matchSelect");
    const playerSelect = document.querySelector("#playerSelect");
    const homeLbl = document.querySelector("#homeLbl");
    const awayLbl = document.querySelector("#awayLbl");
    const homeGoals = document.querySelector("#homeGoals");
    const awayGoals = document.querySelector("#awayGoals");
    const matchDate = document.querySelector("#matchDate");
    const jsonOut = document.querySelector("#jsonOut");
    const goalList = document.querySelector("#goalList");
    const goalWarn = document.querySelector("#goalWarn");

    // matches dropdown
    matchSelect.innerHTML = "";
    data.matches.forEach(m => {
      matchSelect.appendChild(el("option", { value: String(m.id), text: fmtMatchLabel(m) }));
    });

    // players dropdown (팀별 정렬)
    const byTeam = buildPlayersOptions(data);
    const teams = data.teams.slice();
    playerSelect.innerHTML = "";
    teams.forEach(t => {
      const optg = document.createElement("optgroup");
      optg.label = t;
      (byTeam[t] || []).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        optg.appendChild(opt);
      });
      playerSelect.appendChild(optg);
    });

    function setJsonOut() {
      jsonOut.value = JSON.stringify(data, null, 2);
    }

    function getSelectedMatch() {
      const id = Number(matchSelect.value);
      return data.matches.find(m => m.id === id);
    }

    function refreshMatchUI() {
      const m = getSelectedMatch();
      homeLbl.textContent = `홈 · ${m.home}`;
      awayLbl.textContent = `원정 · ${m.away}`;
      homeGoals.value = (m.hg === null ? "" : String(m.hg));
      awayGoals.value = (m.ag === null ? "" : String(m.ag));
      matchDate.value = m.date || "";

      renderGoalList(goalList, data, m.id);
      const v = validateGoalSum(data, m);
      goalWarn.style.display = v.ok ? "none" : "block";
      goalWarn.textContent = v.msg;

      // 업데이트된 라벨 반영
      Array.from(matchSelect.options).forEach(opt => {
        const mid = Number(opt.value);
        const mm = data.matches.find(x => x.id === mid);
        opt.textContent = fmtMatchLabel(mm);
      });

      setJsonOut();
    }

    matchSelect.addEventListener("change", refreshMatchUI);

    document.querySelector("#btnApplyScore").onclick = () => {
      const m = getSelectedMatch();
      const hg = homeGoals.value === "" ? null : Number(homeGoals.value);
      const ag = awayGoals.value === "" ? null : Number(awayGoals.value);
      if (hg !== null && (Number.isNaN(hg) || hg < 0)) return alert("홈 득점이 이상해.");
      if (ag !== null && (Number.isNaN(ag) || ag < 0)) return alert("원정 득점이 이상해.");

      m.hg = hg;
      m.ag = ag;
      m.date = matchDate.value || "";
      refreshMatchUI();
      alert("스코어 반영 완료! (아래 JSON을 GitHub에 저장하면 사이트에 적용됨)");
    };

    document.querySelector("#btnClearScore").onclick = () => {
      const m = getSelectedMatch();
      m.hg = null; m.ag = null; m.date = "";
      refreshMatchUI();
    };

    document.querySelector("#btnAddGoal").onclick = () => {
      const m = getSelectedMatch();
      const pid = playerSelect.value;
      const cnt = Number(document.querySelector("#goalCount").value || "1");
      if (!pid) return alert("선수를 선택해.");
      if (!Number.isInteger(cnt) || cnt <= 0) return alert("골 수는 1 이상 정수로.");

      data.goals = data.goals || [];
      data.goals.push({ matchId: m.id, playerId: pid, count: cnt });
      refreshMatchUI();
    };

    document.querySelector("#btnClearGoals").onclick = () => {
      const m = getSelectedMatch();
      data.goals = (data.goals || []).filter(g => g.matchId !== m.id);
      refreshMatchUI();
    };

    document.querySelector("#btnCopy").onclick = async () => {
      await navigator.clipboard.writeText(jsonOut.value);
      alert("JSON 복사 완료! GitHub의 matches.json에 전체 붙여넣기 하면 끝.");
    };

    document.querySelector("#btnDownload").onclick = () => {
      const blob = new Blob([jsonOut.value], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "matches.json";
      a.click();
      URL.revokeObjectURL(a.href);
    };

    document.querySelector("#btnResetAll").onclick = () => {
      data = deepClone(original);
      // 재렌더
      matchSelect.innerHTML = "";
      data.matches.forEach(m => matchSelect.appendChild(el("option", { value: String(m.id), text: fmtMatchLabel(m) })));
      refreshMatchUI();
    };

    setJsonOut();
    refreshMatchUI();
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
    const labels = {
      blue: "블루",
      purple: "퍼플",
      green: "그린",
      red: "레드"
    };

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

}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch(err => {
    console.error(err);
    document.body.innerHTML = `<div style="padding:20px;color:#fff;">에러: ${err.message}</div>`;
  });
});

