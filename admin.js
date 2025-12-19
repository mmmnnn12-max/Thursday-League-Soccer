// admin.js (운영자 페이지 전용)
// admin.js 맨 위
const PW = "mmmnnn12@@";
const input = prompt("운영자 비밀번호를 입력하세요");
if (input !== PW) {
  document.body.innerHTML = "접근 불가";
  throw new Error("Unauthorized");
}
async function loadData() {
  const res = await fetch("matches.json", { cache: "no-store" });
  if (!res.ok) throw new Error("matches.json을 불러오지 못했어요.");
  return await res.json();
}
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k==="class") node.className = v;
    else if (k==="text") node.textContent = v;
    else node.setAttribute(k,v);
  }
  children.forEach(c => node.appendChild(c));
  return node;
}

function fmtMatchLabel(m){
  const score = (m.hg===null || m.ag===null) ? "미정" : `${m.hg}:${m.ag}`;
  const date = (m.date && String(m.date).trim()) ? ` · ${m.date}` : "";
  return `#${m.id} (R${m.round}) ${m.home} vs ${m.away} · ${score}${date}`;
}

// ✅ 팀명 공백/오타 방어용: trim해서 묶어줌
function buildPlayersOptions(data){
  const byTeam = {};
  for (const p of (data.players || [])){
    const team = String(p.team || "").trim();
    if (!team) continue;
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push({ ...p, team });
  }
  Object.values(byTeam).forEach(arr =>
    arr.sort((a,b)=>String(a.name).localeCompare(String(b.name),"ko"))
  );
  return byTeam;
}

function renderGoalList(container, data, matchId){
  const playersById = new Map((data.players||[]).map(p=>[p.id,p]));
  const items = (data.goals||[]).filter(g=>g.matchId===matchId);
  if (!items.length){
    container.innerHTML = `<div class="small">아직 입력 없음</div>`;
    return;
  }
  container.innerHTML = items.map(g=>{
    const p = playersById.get(g.playerId);
    const name = p ? `${String(p.team).trim()} · ${p.name}` : g.playerId;
    return `<div class="goalItem"><b>${name}</b> — ${g.count}골</div>`;
  }).join("");
}

function renderAssistList(container, data, matchId){
  const playersById = new Map((data.players||[]).map(p=>[p.id,p]));
  const items = (data.assists||[]).filter(a=>a.matchId===matchId);
  if (!items.length){
    container.innerHTML = `<div class="small">아직 입력 없음</div>`;
    return;
  }
  container.innerHTML = items.map(a=>{
    const p = playersById.get(a.playerId);
    const name = p ? `${String(p.team).trim()} · ${p.name}` : a.playerId;
    return `<div class="goalItem"><b>${name}</b> — ${a.count}어시</div>`;
  }).join("");
}

function validateGoalSum(data, match){
  const sum = (data.goals||[])
    .filter(g=>g.matchId===match.id)
    .reduce((acc,g)=>acc + (g.count||0), 0);

  if (match.hg===null || match.ag===null) return { ok:true, msg:"" };

  const target = match.hg + match.ag;
  if (sum === target) return { ok:true, msg:"" };
  return { ok:false, msg:`⚠️ 득점자 합계(${sum})가 스코어 합계(${target})와 다름` };
}

window.addEventListener("DOMContentLoaded", async () => {
  // admin 페이지에서만 동작
  if (document.body.dataset.page !== "admin") return;

  const original = await loadData();
  let data = deepClone(original);

  // DOM
  const matchSelect = document.querySelector("#matchSelect");
  const homeLbl = document.querySelector("#homeLbl");
  const awayLbl = document.querySelector("#awayLbl");
  const homeGoals = document.querySelector("#homeGoals");
  const awayGoals = document.querySelector("#awayGoals");
  const matchDate = document.querySelector("#matchDate");

  const playerSelect = document.querySelector("#playerSelect");
  const goalCount = document.querySelector("#goalCount");
  const goalList = document.querySelector("#goalList");
  const goalWarn = document.querySelector("#goalWarn");

  const assistPlayerSelect = document.querySelector("#assistPlayerSelect");
  const assistCount = document.querySelector("#assistCount");
  const assistList = document.querySelector("#assistList");

  const jsonOut = document.querySelector("#jsonOut");

  // matches dropdown
  matchSelect.innerHTML = "";
  (data.matches || []).forEach(m=>{
    matchSelect.appendChild(el("option", { value:String(m.id), text:fmtMatchLabel(m) }));
  });

  // players dropdowns
  const byTeam = buildPlayersOptions(data);

  const teamSet = new Set([
    ...(data.teams || []).map(t=>String(t).trim()),
    ...Object.keys(byTeam)
  ]);
  const teams = Array.from(teamSet).filter(Boolean);

  function fillPlayerSelect(selectEl){
    if (!selectEl) return;
    selectEl.innerHTML = "";
    teams.forEach(t=>{
      const optg = document.createElement("optgroup");
      optg.label = t;
      (byTeam[t] || []).forEach(p=>{
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        optg.appendChild(opt);
      });
      // 팀에 선수가 한 명도 없으면 optgroup이 비어있을 수 있음
      selectEl.appendChild(optg);
    });
  }

  fillPlayerSelect(playerSelect);
  fillPlayerSelect(assistPlayerSelect);

  function setJsonOut(){
    if (!jsonOut) return;
    jsonOut.value = JSON.stringify(data, null, 2);
  }

  function getSelectedMatch(){
    const id = Number(matchSelect.value);
    return (data.matches || []).find(m=>m.id===id);
  }

  function refreshMatchUI(){
    const m = getSelectedMatch();
    if (!m) return;

    homeLbl.textContent = `홈 · ${m.home}`;
    awayLbl.textContent = `원정 · ${m.away}`;

    homeGoals.value = (m.hg===null ? "" : String(m.hg));
    awayGoals.value = (m.ag===null ? "" : String(m.ag));
    matchDate.value = m.date || "";

    renderGoalList(goalList, data, m.id);
    renderAssistList(assistList, data, m.id);

    const v = validateGoalSum(data, m);
    goalWarn.style.display = v.ok ? "none" : "block";
    goalWarn.textContent = v.msg;

    // match label도 업데이트
    Array.from(matchSelect.options).forEach(opt=>{
      const mid = Number(opt.value);
      const mm = (data.matches || []).find(x=>x.id===mid);
      opt.textContent = fmtMatchLabel(mm);
    });

    setJsonOut();
  }

  matchSelect.addEventListener("change", refreshMatchUI);

  // score
  document.querySelector("#btnApplyScore").onclick = () => {
    const m = getSelectedMatch();
    const hg = homeGoals.value==="" ? null : Number(homeGoals.value);
    const ag = awayGoals.value==="" ? null : Number(awayGoals.value);

    if (hg !== null && (!Number.isFinite(hg) || hg < 0)) return alert("홈 득점이 이상해.");
    if (ag !== null && (!Number.isFinite(ag) || ag < 0)) return alert("원정 득점이 이상해.");

    m.hg = hg; m.ag = ag;
    m.date = matchDate.value || "";
    refreshMatchUI();
    alert("스코어 반영 완료! (아래 JSON을 GitHub matches.json에 저장하면 적용됨)");
  };

  document.querySelector("#btnClearScore").onclick = () => {
    const m = getSelectedMatch();
    m.hg = null; m.ag = null; m.date = "";
    refreshMatchUI();
  };

  // goals
  document.querySelector("#btnAddGoal").onclick = () => {
    const m = getSelectedMatch();
    const pid = playerSelect.value;
    const cnt = Number(goalCount.value || "1");

    if (!pid) return alert("선수를 선택해.");
    if (!Number.isInteger(cnt) || cnt <= 0) return alert("골 수는 1 이상 정수로.");

    data.goals = data.goals || [];
    data.goals.push({ matchId:m.id, playerId:pid, count:cnt });
    refreshMatchUI();
  };

  document.querySelector("#btnClearGoals").onclick = () => {
    const m = getSelectedMatch();
    data.goals = (data.goals || []).filter(g=>g.matchId!==m.id);
    refreshMatchUI();
  };

  // assists
  document.querySelector("#btnAddAssist").onclick = () => {
    const m = getSelectedMatch();
    const pid = assistPlayerSelect.value;
    const cnt = Number(assistCount.value || "1");

    if (!pid) return alert("어시스트 선수를 선택해.");
    if (!Number.isInteger(cnt) || cnt <= 0) return alert("어시스트 수는 1 이상 정수로.");

    data.assists = data.assists || [];
    data.assists.push({ matchId:m.id, playerId:pid, count:cnt });
    refreshMatchUI();
  };

  document.querySelector("#btnClearAssists").onclick = () => {
    const m = getSelectedMatch();
    data.assists = (data.assists || []).filter(a=>a.matchId!==m.id);
    refreshMatchUI();
  };

  // json actions
  document.querySelector("#btnCopy").onclick = async () => {
    await navigator.clipboard.writeText(jsonOut.value);
    alert("JSON 복사 완료! GitHub matches.json에 전체 붙여넣기 하면 끝.");
  };

  document.querySelector("#btnDownload").onclick = () => {
    const blob = new Blob([jsonOut.value], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "matches.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.querySelector("#btnResetAll").onclick = () => {
    data = deepClone(original);
    matchSelect.innerHTML = "";
    (data.matches || []).forEach(m=>{
      matchSelect.appendChild(el("option", { value:String(m.id), text:fmtMatchLabel(m) }));
    });
    refreshMatchUI();
  };

  // 첫 렌더
  refreshMatchUI();
});
