let allBatters = [];
let allPitchers = [];
let currentTab = "battersTab";
let sortKey = "ops_plus";
let sortOrder = "desc";
let scatterChart = null;
let radarChart = null;

// ページネーション・仮想スクロール管理
const PAGE_SIZE = 200;
let currentBattersList = [];
let displayedBattersCount = 0;
let currentPitchersList = [];
let displayedPitchersCount = 0;

// 高速検索・キャリア参照用インデックス
const batterByUrlMap = new Map();
const batterByNameMap = new Map();
const pitcherByUrlMap = new Map();
const pitcherByNameMap = new Map();
let isCompareInitialized = false;

// 球団・年度別メンバー表 (Yearbook) 管理変数
let rosterYear = 2025;
let rosterTeam = "阪神";
let allAvailableYears = [];

// 球団フランチャイズ系譜グループ（年度移動時の球団名自動引き継ぎ用）
const FRANCHISE_GROUPS = [
  ["巨人"],
  ["阪神"],
  ["中日", "名古屋"],
  ["DeNA", "横浜", "大洋", "洋松"],
  ["広島"],
  ["ヤクルト", "アトムズ", "サンケイ", "国鉄"],
  ["ソフトバンク", "ダイエー", "南海"],
  ["日本ハム", "日拓", "東映", "東急"],
  ["ロッテ", "東京", "大毎", "毎日"],
  ["西武", "クラウン", "太平洋", "西鉄"],
  ["オリックス", "阪急"],
  ["楽天"],
  ["近鉄"],
  ["松竹"],
  ["西日本"],
  ["高橋", "トンボ"]
];

// モーダル管理変数
let modalTrendChart = null;
let currentModalPlayerRecords = [];
let currentModalIsBatter = true;
let currentModalChartType = "pawa"; // "pawa" or "saber"

// デバウンス関数
function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// パワプロランクバッジ生成
function getRankBadge(rank, score) {
  const r = rank.toLowerCase();
  return `<span class="pawa-cell"><span class="badge badge-${r}">${rank}</span><span>${score}</span></span>`;
}

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupFilters();
  setupSorting();
  setupTableInteractions();
  setupRosterControls();
  setupCsvDownload();
  setupPlayerModal();
  await loadData();
});

// データ取得とインデックス構築
async function loadData() {
  try {
    const [bRes, pRes] = await Promise.all([
      fetch("data/batters.json?v=20261017_3"),
      fetch("data/pitchers.json?v=20261017_3")
    ]);
    allBatters = await bRes.json();
    allPitchers = await pRes.json();

    // 事前インデックス化（検索・モーダル起動をO(1)化）
    allBatters.forEach((b, i) => {
      b._idx = i;
      b._yearStr = b.year.toString();
      const raw = `${b.name} ${b.team} ${b._yearStr}`.toLowerCase();
      b._searchRaw = raw;
      b._searchNoSpace = raw.replace(/[\s\u3000]+/g, "");

      if (b.player_url) {
        let arr = batterByUrlMap.get(b.player_url);
        if (!arr) { arr = []; batterByUrlMap.set(b.player_url, arr); }
        arr.push(b);
      }
      let nArr = batterByNameMap.get(b.name);
      if (!nArr) { nArr = []; batterByNameMap.set(b.name, nArr); }
      nArr.push(b);
    });

    allPitchers.forEach((p, i) => {
      p._idx = i;
      p._yearStr = p.year.toString();
      const raw = `${p.name} ${p.team} ${p._yearStr}`.toLowerCase();
      p._searchRaw = raw;
      p._searchNoSpace = raw.replace(/[\s\u3000]+/g, "");

      if (p.player_url) {
        let arr = pitcherByUrlMap.get(p.player_url);
        if (!arr) { arr = []; pitcherByUrlMap.set(p.player_url, arr); }
        arr.push(p);
      }
      let nArr = pitcherByNameMap.get(p.name);
      if (!nArr) { nArr = []; pitcherByNameMap.set(p.name, nArr); }
      nArr.push(p);
    });

    populateYearFilter();
    populateTeamFilter();
    if (allAvailableYears.length > 0) {
      rosterYear = allAvailableYears[0];
    }
    renderCurrentTab();
  } catch (err) {
    console.error("データの読み込みに失敗しました:", err);
  }
}

// 年度フィルターの選択肢を動的生成
function populateYearFilter() {
  const years = new Set();
  allBatters.forEach(b => years.add(b.year));
  allPitchers.forEach(p => years.add(p.year));

  const select = document.getElementById("yearFilter");
  const sortedYears = Array.from(years).sort((a, b) => b - a);
  allAvailableYears = sortedYears;
  const yearOptionsHtml = sortedYears.map(y => `<option value="${y}">${y}年</option>`).join("");
  select.innerHTML = '<option value="all">全年代 (1950〜現在)</option>' + yearOptionsHtml;

  const rosterYearSelect = document.getElementById("rosterYearSelect");
  if (rosterYearSelect) {
    rosterYearSelect.innerHTML = yearOptionsHtml;
  }
}

// 球団フィルターの選択肢を生成
function populateTeamFilter() {
  const teams = new Set();
  allBatters.forEach(b => { if (b.team && b.team !== "不明") teams.add(b.team); });
  allPitchers.forEach(p => { if (p.team && p.team !== "不明") teams.add(p.team); });

  const select = document.getElementById("teamFilter");
  const sortedTeams = Array.from(teams).sort();
  select.innerHTML = '<option value="all">全球団</option>' +
    sortedTeams.map(t => `<option value="${t}">${t}</option>`).join("");
}

// タブ切り替え
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      document.getElementById(currentTab).classList.add("active");

      // 守備位置フィルターの表示/非表示
      const posFilterGroup = document.getElementById("posFilterGroup");
      if (currentTab === "battersTab") {
        posFilterGroup.style.display = "flex";
        sortKey = "ops_plus";
        sortOrder = "desc";
      } else if (currentTab === "pitchersTab") {
        posFilterGroup.style.display = "none";
        sortKey = "fip_minus";
        sortOrder = "asc";
      } else if (currentTab === "teamRosterTab") {
        posFilterGroup.style.display = "none";
      }

      renderCurrentTab();
    });
  });
}

// フィルターイベント設定
function setupFilters() {
  ["yearFilter", "leagueFilter", "teamFilter", "posFilter", "qualFilter"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        if (id === "yearFilter" && el.value !== "all") {
          rosterYear = parseInt(el.value, 10);
        }
        if (id === "teamFilter" && el.value !== "all") {
          rosterTeam = el.value;
        }
        renderCurrentTab();
      });
    }
  });

  const searchInput = document.getElementById("searchQuery");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => renderCurrentTab(), 150));
  }

  const chartSelect = document.getElementById("chartTypeSelect");
  if (chartSelect) {
    chartSelect.addEventListener("change", () => renderScatterChart());
  }

  const compA = document.getElementById("compareSelectA");
  const compB = document.getElementById("compareSelectB");
  if (compA && compB) {
    compA.addEventListener("change", () => updateCompareView());
    compB.addEventListener("change", () => updateCompareView());
  }

  const compSearchA = document.getElementById("compareSearchA");
  const compSearchB = document.getElementById("compareSearchB");
  if (compSearchA) {
    compSearchA.addEventListener("input", debounce(() => {
      populateSingleCompareSelect("compareSelectA", compSearchA.value, 0);
      updateCompareView();
    }, 150));
  }
  if (compSearchB) {
    compSearchB.addEventListener("input", debounce(() => {
      populateSingleCompareSelect("compareSelectB", compSearchB.value, 1);
      updateCompareView();
    }, 150));
  }
}

// テーブルのスクロール自動読み込み＆イベント委譲
function setupTableInteractions() {
  const bBody = document.getElementById("battersBody");
  if (bBody) {
    bBody.addEventListener("click", (e) => {
      const cell = e.target.closest(".player-name");
      if (cell) {
        openPlayerModal(cell.dataset.url || "", cell.dataset.name || "", true);
      }
    });
  }

  const pBody = document.getElementById("pitchersBody");
  if (pBody) {
    pBody.addEventListener("click", (e) => {
      const cell = e.target.closest(".player-name");
      if (cell) {
        openPlayerModal(cell.dataset.url || "", cell.dataset.name || "", false);
      }
    });
  }

  const rbBody = document.getElementById("rosterBattersBody");
  if (rbBody) {
    rbBody.addEventListener("click", (e) => {
      const cell = e.target.closest(".player-name");
      if (cell) {
        openPlayerModal(cell.dataset.url || "", cell.dataset.name || "", true);
      }
    });
  }

  const rpBody = document.getElementById("rosterPitchersBody");
  if (rpBody) {
    rpBody.addEventListener("click", (e) => {
      const cell = e.target.closest(".player-name");
      if (cell) {
        openPlayerModal(cell.dataset.url || "", cell.dataset.name || "", false);
      }
    });
  }

  const bContainer = document.getElementById("battersTableContainer");
  if (bContainer) {
    bContainer.addEventListener("scroll", () => {
      if (displayedBattersCount < currentBattersList.length) {
        if (bContainer.scrollTop + bContainer.clientHeight >= bContainer.scrollHeight - 280) {
          appendMoreBatters();
        }
      }
    }, { passive: true });
  }

  const pContainer = document.getElementById("pitchersTableContainer");
  if (pContainer) {
    pContainer.addEventListener("scroll", () => {
      if (displayedPitchersCount < currentPitchersList.length) {
        if (pContainer.scrollTop + pContainer.clientHeight >= pContainer.scrollHeight - 280) {
          appendMorePitchers();
        }
      }
    }, { passive: true });
  }

  const bMoreBtn = document.getElementById("battersLoadMoreBtn");
  if (bMoreBtn) {
    bMoreBtn.addEventListener("click", () => appendMoreBatters());
  }

  const pMoreBtn = document.getElementById("pitchersLoadMoreBtn");
  if (pMoreBtn) {
    pMoreBtn.addEventListener("click", () => appendMorePitchers());
  }
}

// 年度を前後移動する共通関数 (delta: -1 = 前年, +1 = 翌年)
function stepYear(delta, isGlobalBtn = false) {
  if (allAvailableYears.length === 0) return;
  const minYear = allAvailableYears[allAvailableYears.length - 1];
  const maxYear = allAvailableYears[0];
  const yearFilterEl = document.getElementById("yearFilter");

  if (isGlobalBtn && currentTab !== "teamRosterTab") {
    let baseYear = yearFilterEl && yearFilterEl.value !== "all"
      ? parseInt(yearFilterEl.value, 10)
      : rosterYear;
    const nextY = Math.max(minYear, Math.min(maxYear, baseYear + delta));
    rosterYear = nextY;
    if (yearFilterEl) yearFilterEl.value = nextY.toString();
    renderCurrentTab();
    return;
  }

  const nextY = Math.max(minYear, Math.min(maxYear, rosterYear + delta));
  if (nextY !== rosterYear) {
    rosterYear = nextY;
    if (yearFilterEl && yearFilterEl.value !== "all") {
      yearFilterEl.value = rosterYear.toString();
    }
    renderCurrentTab();
  }
}

// 球団・年度別メンバー表の操作イベント設定
function setupRosterControls() {
  const prevBtn = document.getElementById("rosterPrevYearBtn");
  const nextBtn = document.getElementById("rosterNextYearBtn");
  const globalPrevBtn = document.getElementById("globalPrevYearBtn");
  const globalNextBtn = document.getElementById("globalNextYearBtn");
  const rosterYearSelect = document.getElementById("rosterYearSelect");
  const bSort = document.getElementById("rosterBatterSort");
  const pSort = document.getElementById("rosterPitcherSort");
  const pillsWrap = document.getElementById("rosterTeamPills");

  if (prevBtn) prevBtn.addEventListener("click", () => stepYear(-1, false));
  if (nextBtn) nextBtn.addEventListener("click", () => stepYear(1, false));
  if (globalPrevBtn) globalPrevBtn.addEventListener("click", () => stepYear(-1, true));
  if (globalNextBtn) globalNextBtn.addEventListener("click", () => stepYear(1, true));

  if (rosterYearSelect) {
    rosterYearSelect.addEventListener("change", () => {
      rosterYear = parseInt(rosterYearSelect.value, 10);
      const yearFilterEl = document.getElementById("yearFilter");
      if (yearFilterEl && yearFilterEl.value !== "all") {
        yearFilterEl.value = rosterYear.toString();
      }
      renderTeamRoster();
    });
  }

  // キーボードの左右矢印キーでも年度移動可能（入力欄フォーカス時を除く）
  document.addEventListener("keydown", (e) => {
    if (currentTab !== "teamRosterTab") return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const modal = document.getElementById("playerModal");
    if (modal && modal.classList.contains("active")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepYear(-1, false);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepYear(1, false);
    }
  });

  if (bSort) {
    bSort.addEventListener("change", () => renderTeamRoster());
  }
  if (pSort) {
    pSort.addEventListener("change", () => renderTeamRoster());
  }

  if (pillsWrap) {
    pillsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".team-pill-btn");
      if (btn && btn.dataset.team) {
        rosterTeam = btn.dataset.team;
        const teamFilterEl = document.getElementById("teamFilter");
        if (teamFilterEl && teamFilterEl.value !== "all") {
          teamFilterEl.value = rosterTeam;
        }
        renderTeamRoster();
      }
    });
  }
}

// ソートイベント設定
function setupSorting() {
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortOrder = sortOrder === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        // FIP-, ERA, BB%-, HR%- は昇順デフォルト（低いほど優秀）、それ以外は降順デフォルト
        sortOrder = (key === "fip_minus" || key === "era" || key === "fip" || key === "bb_pct_minus" || key === "hr_pct_minus") ? "asc" : "desc";
      }
      renderCurrentTab();
    });
  });
}

// フィルター適用後のリストを取得
function getFilteredData(dataList, isBatter = true) {
  const year = document.getElementById("yearFilter").value;
  const league = document.getElementById("leagueFilter").value;
  const team = document.getElementById("teamFilter").value;
  const pos = document.getElementById("posFilter").value;
  const qual = document.getElementById("qualFilter") ? document.getElementById("qualFilter").value : "all";
  const query = document.getElementById("searchQuery").value.trim().toLowerCase();
  const queryNoSpace = query.replace(/[\s\u3000]+/g, "");

  return dataList.filter(item => {
    if (year !== "all" && item._yearStr !== year) return false;
    if (league !== "all" && item.league !== league) return false;
    if (team !== "all" && item.team !== team) return false;
    if (isBatter && pos !== "all" && item.primary_pos !== pos) return false;
    if (qual === "qual" && !item.is_qual) return false;
    if (query && !item._searchRaw.includes(query) && !item._searchNoSpace.includes(queryNoSpace)) return false;
    return true;
  });
}

// 現在のタブを描画
function renderCurrentTab() {
  if (currentTab === "battersTab") {
    renderBatters();
  } else if (currentTab === "pitchersTab") {
    renderPitchers();
  } else if (currentTab === "teamRosterTab") {
    renderTeamRoster();
  } else if (currentTab === "scatterTab") {
    renderScatterChart();
  } else if (currentTab === "compareTab") {
    if (!isCompareInitialized) {
      initCompareSelects();
      isCompareInitialized = true;
    }
    updateCompareView();
  }
}

// 指定年度に存在する球団リストから、現在の球団（または同一フランチャイズ）を解決
function resolveFranchiseTeam(currentTeam, teamsInYear) {
  if (teamsInYear.includes(currentTeam)) return currentTeam;
  for (const group of FRANCHISE_GROUPS) {
    if (group.includes(currentTeam)) {
      const matched = group.find(t => teamsInYear.includes(t));
      if (matched) return matched;
    }
  }
  return teamsInYear[0] || currentTeam;
}

// 🏟️ 球団・年度別メンバー表 (Yearbook) の描画
function renderTeamRoster() {
  // 当該年度の全打者・全投手を取得
  const yearBatters = allBatters.filter(b => b.year === rosterYear);
  const yearPitchers = allPitchers.filter(p => p.year === rosterYear);

  // 当該年度に存在する球団一覧をリーグ順（セ・リーグ -> パ・リーグ）で抽出
  const centralTeams = new Set();
  const pacificTeams = new Set();
  yearBatters.forEach(b => {
    if (b.team && b.team !== "不明") {
      if (b.league === "セ") centralTeams.add(b.team);
      else pacificTeams.add(b.team);
    }
  });
  yearPitchers.forEach(p => {
    if (p.team && p.team !== "不明") {
      if (p.league === "セ") centralTeams.add(p.team);
      else pacificTeams.add(p.team);
    }
  });

  const cList = Array.from(centralTeams);
  const pList = Array.from(pacificTeams);
  const allTeamsInYear = [...cList, ...pList];

  // フランチャイズ引き継ぎ解決
  rosterTeam = resolveFranchiseTeam(rosterTeam, allTeamsInYear);

  // 前年・翌年ボタンの活性制御と年度セレクト・タイトル更新
  const minYear = allAvailableYears[allAvailableYears.length - 1] || 1950;
  const maxYear = allAvailableYears[0] || 2025;
  const prevBtn = document.getElementById("rosterPrevYearBtn");
  const nextBtn = document.getElementById("rosterNextYearBtn");
  const rosterYearSelect = document.getElementById("rosterYearSelect");
  if (prevBtn) prevBtn.disabled = (rosterYear <= minYear);
  if (nextBtn) nextBtn.disabled = (rosterYear >= maxYear);
  if (rosterYearSelect) rosterYearSelect.value = rosterYear.toString();

  const teamLeague = centralTeams.has(rosterTeam) ? "セ・リーグ" : "パ・リーグ";
  const titleEl = document.getElementById("rosterTitleHeading");
  if (titleEl) {
    titleEl.innerHTML = `${rosterYear}年 ${rosterTeam} <small style="font-size:0.85rem; color:#94a3b8; font-weight:normal;">(${teamLeague})</small>`;
  }

  // 球団クイック切替ピル描画（セ・パ2段の横並び）
  const pillsEl = document.getElementById("rosterTeamPills");
  if (pillsEl) {
    const makeRow = (teams, label, cls) => {
      if (teams.length === 0) return "";
      return `<div class="roster-league-row">` +
        `<span class="roster-league-label ${cls}">${label}</span>` +
        teams.map(t => `<button type="button" class="team-pill-btn ${t === rosterTeam ? 'active' : ''}" data-team="${t}">${t}</button>`).join("") +
        `</div>`;
    };
    pillsEl.innerHTML =
      makeRow(cList, "セ", "roster-league-cl") +
      makeRow(pList, "パ", "roster-league-pl");
  }

  // 当該球団の野手・投手を取得
  const teamBatters = yearBatters.filter(b => b.team === rosterTeam);
  const teamPitchers = yearPitchers.filter(p => p.team === rosterTeam);

  // チーム戦力サマリー計算
  const totalHr = teamBatters.reduce((sum, b) => sum + (b.hr || 0), 0);
  const totalSb = teamBatters.reduce((sum, b) => sum + (b.sb || 0), 0);
  const totalPa = teamBatters.reduce((sum, b) => sum + (b.pa || 0), 0);
  const weightedOpsPlus = totalPa > 0
    ? teamBatters.reduce((sum, b) => sum + b.ops_plus * (b.pa || 0), 0) / totalPa
    : 100;

  const totalIp = teamPitchers.reduce((sum, p) => sum + (p.ip || 0), 0);
  const weightedFipMinus = totalIp > 0
    ? teamPitchers.reduce((sum, p) => sum + p.fip_minus * (p.ip || 0), 0) / totalIp
    : 100;
  const weightedKbbPct = totalIp > 0
    ? teamPitchers.reduce((sum, p) => sum + (p.k_bb_pct || 0) * (p.ip || 0), 0) / totalIp
    : 0;
  const totalWins = teamPitchers.reduce((sum, p) => sum + (p.w || 0), 0);
  const totalSaves = teamPitchers.reduce((sum, p) => sum + (p.sv || 0), 0);

  const summaryEl = document.getElementById("rosterSummaryBadges");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="roster-stat-pill">野手: <strong>${teamBatters.length}名</strong> / 投手: <strong>${teamPitchers.length}名</strong></div>
      <div class="roster-stat-pill">打線OPS+: <strong style="color:${weightedOpsPlus >= 105 ? '#ef4444' : '#38bdf8'}">${weightedOpsPlus.toFixed(1)}</strong></div>
      <div class="roster-stat-pill">主要HR: <strong>${totalHr}本</strong> / 盗塁: <strong>${totalSb}個</strong></div>
      <div class="roster-stat-pill">投手FIP-: <strong style="color:${weightedFipMinus <= 95 ? '#4ade80' : '#f8fafc'}">${weightedFipMinus.toFixed(1)}</strong> / K-BB%: <strong style="color:${weightedKbbPct >= 14 ? '#f472b6' : '#38bdf8'}">${weightedKbbPct.toFixed(1)}%</strong></div>
      <div class="roster-stat-pill">主要勝星: <strong>${totalWins}勝</strong> (S:${totalSaves})</div>
    `;
  }

  // ==========================================
  // 1. 野手陣の主力スタメン自動判定＆ソート
  // ==========================================
  const POS_SLOTS = { "捕": 1, "一": 1, "二": 1, "三": 1, "遊": 1, "外": 3, "指": 1 };
  const POS_ORDER = { "捕": 1, "一": 2, "二": 3, "三": 4, "遊": 5, "外": 6, "指": 7 };
  const usedSlots = { "捕": 0, "一": 0, "二": 0, "三": 0, "遊": 0, "外": 0, "指": 0 };

  // 打席数順に走査して各ポジションの最多出場者を「主力スタメン」に割り当て
  const battersByPa = teamBatters.slice().sort((a, b) => (b.pa || 0) - (a.pa || 0));
  const starterSet = new Set();
  battersByPa.forEach(b => {
    const pos = b.primary_pos || "外";
    const maxSlot = POS_SLOTS[pos] || 1;
    if ((usedSlots[pos] || 0) < maxSlot && (b.pa || 0) >= 200) {
      usedSlots[pos] = (usedSlots[pos] || 0) + 1;
      starterSet.add(b);
    }
  });

  // もし200打席未満でも各ポジション枠が空いていてチーム上位9名以内なら補充
  battersByPa.forEach(b => {
    if (!starterSet.has(b) && starterSet.size < 8) {
      const pos = b.primary_pos || "外";
      const maxSlot = POS_SLOTS[pos] || 1;
      if ((usedSlots[pos] || 0) < maxSlot) {
        usedSlots[pos] = (usedSlots[pos] || 0) + 1;
        starterSet.add(b);
      }
    }
  });

  const bSortMode = document.getElementById("rosterBatterSort")
    ? document.getElementById("rosterBatterSort").value
    : "lineup";

  const renderBatterRosterRow = (b) => {
    const isStarter = starterSet.has(b);
    const roleBadge = isStarter
      ? `<span class="role-badge role-starter">主力</span>`
      : `<span class="role-badge role-bench">控え</span>`;
    const qualTag = b.is_qual ? "" : `<span class="tag-sub">準規定</span>`;
    const bbk = (b.bb_k != null ? b.bb_k : 0);
    return `<tr>
      <td>${roleBadge}</td>
      <td><span class="pos-tag">${b.primary_pos}</span></td>
      <td class="player-name" data-url="${b.player_url || ''}" data-name="${b.name}" title="クリックしてキャリア推移を表示">${b.name} <small>(${b.age})</small>${qualTag}</td>
      <td>${b.g || '-'}</td>
      <td><strong>${b.pa || '-'}</strong></td>
      <td><strong style="color:${b.ops_plus >= 140 ? '#ef4444' : b.ops_plus >= 115 ? '#38bdf8' : '#fff'}">${b.ops_plus.toFixed(1)}</strong></td>
      <td>.${b.avg.toFixed(3).replace(/^0\./, '')}</td>
      <td><strong>${b.hr}</strong></td>
      <td>${b.rbi}</td>
      <td>${b.sb}</td>
      <td>.${b.obp.toFixed(3).replace(/^0\./, '')}</td>
      <td>.${b.ops.toFixed(3).replace(/^0\./, '')}</td>
      <td style="color:${bbk >= 1.0 ? '#4ade80' : '#cbd5e1'}" title="四球:${b.bb || 0} / 三振:${b.so || 0}">${bbk.toFixed(2)}</td>
      <td>${getRankBadge(b.meet_rank, b.meet)}</td>
      <td>${getRankBadge(b.power_rank, b.power)}</td>
      <td>${getRankBadge(b.speed_rank, b.speed)}</td>
      <td>${getRankBadge(b.defense_rank, b.defense)}</td>
      <td>${getRankBadge(b.fielding_rank, b.fielding)}</td>
    </tr>`;
  };

  const rbBody = document.getElementById("rosterBattersBody");
  if (rbBody) {
    if (teamBatters.length === 0) {
      rbBody.innerHTML = `<tr><td colspan="18" style="text-align:center; padding:1.5rem; color:#94a3b8;">該当する野手データがありません</td></tr>`;
    } else if (bSortMode === "lineup") {
      const starters = teamBatters.filter(b => starterSet.has(b)).sort((a, b) => {
        const oa = POS_ORDER[a.primary_pos] || 9;
        const ob = POS_ORDER[b.primary_pos] || 9;
        if (oa !== ob) return oa - ob;
        return (b.pa || 0) - (a.pa || 0);
      });
      const bench = teamBatters.filter(b => !starterSet.has(b)).sort((a, b) => (b.pa || 0) - (a.pa || 0));

      let html = `<tr class="roster-divider-row"><td colspan="18">▼ 主力スタメン（守備位置順：捕・一・二・三・遊・外・指）</td></tr>`;
      html += starters.map(renderBatterRosterRow).join("");
      if (bench.length > 0) {
        html += `<tr class="roster-divider-row"><td colspan="18">▼ 準主力・控え野手（打席数順 / 150打席以上）</td></tr>`;
        html += bench.map(renderBatterRosterRow).join("");
      }
      rbBody.innerHTML = html;
    } else {
      const sorted = teamBatters.slice().sort((a, b) => (b[bSortMode] || 0) - (a[bSortMode] || 0));
      rbBody.innerHTML = sorted.map(renderBatterRosterRow).join("");
    }
  }

  // ==========================================
  // 2. 投手陣の先発・リリーフ自動分類＆ソート
  // ==========================================
  const isStarterPitcher = (p) => {
    const gs = p.gs || 0;
    const g = p.g || 1;
    // 1950年代など先発数が一部記録されていない場合へのフォールバックも考慮
    if (gs >= 6 || (gs / g >= 0.35)) return true;
    if (gs === 0 && p.is_qual && (p.sv || 0) < 5) return true;
    return false;
  };

  const startersP = teamPitchers.filter(isStarterPitcher).sort((a, b) => b.ip - a.ip);
  const relieversP = teamPitchers.filter(p => !isStarterPitcher(p)).sort((a, b) => {
    const scoreA = (a.sv || 0) * 3 + (a.hld || 0) * 1.5 + (a.g || 0);
    const scoreB = (b.sv || 0) * 3 + (b.hld || 0) * 1.5 + (b.g || 0);
    return scoreB - scoreA;
  });

  // エース（先発最多投球回）と守護神（チーム最多セーブかつ5S以上）の特定
  const acePitcher = startersP.length > 0 ? startersP[0] : null;
  let closerPitcher = null;
  let maxSv = 4;
  relieversP.forEach(p => {
    if ((p.sv || 0) > maxSv) {
      maxSv = p.sv;
      closerPitcher = p;
    }
  });

  const getPitcherRoleBadge = (p) => {
    if (isStarterPitcher(p)) {
      if (p === acePitcher && p.ip >= 100) {
        return `<span class="role-badge role-ace">先発柱</span>`;
      } else if (p.is_qual || p.ip >= 90 || (p.gs || 0) >= 15) {
        return `<span class="role-badge role-rotation">先発ローテ</span>`;
      }
      return `<span class="role-badge role-bench">先発/谷間</span>`;
    } else {
      if (p === closerPitcher || (p.sv || 0) >= 15) {
        return `<span class="role-badge role-closer">守護神</span>`;
      } else if ((p.g || 0) >= 40 || (p.hld || 0) >= 12 || (p.sv || 0) >= 5) {
        return `<span class="role-badge role-relief">主力救援</span>`;
      }
      return `<span class="role-badge role-bench">救援</span>`;
    }
  };

  const renderPitcherRosterRow = (p) => {
    const qualTag = p.is_qual ? "" : `<span class="tag-sub">準規定</span>`;
    const kbbColor = p.k_bb_pct >= 20 ? '#ef4444' : p.k_bb_pct >= 15 ? '#f472b6' : '#fff';
    const kbbDiff = p.k_bb != null ? p.k_bb : (p.so - (p.bb || 0));
    return `<tr>
      <td>${getPitcherRoleBadge(p)}</td>
      <td class="player-name" data-url="${p.player_url || ''}" data-name="${p.name}" title="クリックしてキャリア推移を表示">${p.name} <small>(${p.age})</small>${qualTag}</td>
      <td><strong>${p.g || '-'}</strong></td>
      <td>${p.gs != null ? p.gs : '-'}</td>
      <td>${p.cg != null ? p.cg : '-'}</td>
      <td><strong>${p.w}</strong></td>
      <td>${p.l}</td>
      <td><strong style="color:${(p.sv || 0) >= 10 ? '#f472b6' : '#cbd5e1'}">${p.sv != null ? p.sv : 0}</strong></td>
      <td><strong style="color:${(p.hld || 0) >= 15 ? '#4ade80' : '#cbd5e1'}">${p.hld != null ? p.hld : 0}</strong></td>
      <td><strong>${p.ip.toFixed(1)}</strong></td>
      <td>${p.so}</td>
      <td>${p.bb != null ? p.bb : '-'}</td>
      <td>${p.era.toFixed(2)}</td>
      <td><strong style="color:${p.fip_minus <= 75 ? '#ef4444' : p.fip_minus <= 90 ? '#38bdf8' : '#fff'}">${p.fip_minus.toFixed(1)}</strong></td>
      <td><strong style="color:${kbbColor}">${p.k_bb_pct.toFixed(1)}%</strong></td>
      <td><strong style="color:${kbbDiff >= 100 ? '#f472b6' : '#cbd5e1'}">${kbbDiff > 0 ? '+' : ''}${kbbDiff}</strong></td>
      <td style="color:#38bdf8;">${(p.k_pct_plus || 100).toFixed(1)}</td>
      <td style="color:${(p.bb_pct_minus || 100) <= 80 ? '#4ade80' : '#cbd5e1'}">${(p.bb_pct_minus || 100).toFixed(1)}</td>
      <td style="color:${(p.hr_pct_minus || 100) <= 80 ? '#4ade80' : '#cbd5e1'}">${(p.hr_pct_minus || 100).toFixed(1)}</td>
      <td>${getRankBadge(p.control_rank, p.control)}</td>
      <td>${getRankBadge(p.stuff_rank, p.stuff)}</td>
      <td>${getRankBadge(p.stamina_rank, p.stamina)}</td>
    </tr>`;
  };

  const pSortMode = document.getElementById("rosterPitcherSort")
    ? document.getElementById("rosterPitcherSort").value
    : "role";

  const rpBody = document.getElementById("rosterPitchersBody");
  if (rpBody) {
    if (teamPitchers.length === 0) {
      rpBody.innerHTML = `<tr><td colspan="22" style="text-align:center; padding:1.5rem; color:#94a3b8;">該当する投手データがありません</td></tr>`;
    } else if (pSortMode === "role") {
      let html = "";
      if (startersP.length > 0) {
        html += `<tr class="roster-divider-row"><td colspan="22">▼ 先発ローテーション・先発陣（投球回順）</td></tr>`;
        html += startersP.map(renderPitcherRosterRow).join("");
      }
      if (relieversP.length > 0) {
        html += `<tr class="roster-divider-row"><td colspan="22">▼ リリーフ・抑え陣（セーブ・ホールド・登板数順 / 30投球回以上）</td></tr>`;
        html += relieversP.map(renderPitcherRosterRow).join("");
      }
      rpBody.innerHTML = html;
    } else {
      const sorted = teamPitchers.slice().sort((a, b) => {
        if (pSortMode === "fip_minus") return a.fip_minus - b.fip_minus;
        return (b[pSortMode] || 0) - (a[pSortMode] || 0);
      });
      rpBody.innerHTML = sorted.map(renderPitcherRosterRow).join("");
    }
  }
}

// 打者1行分のHTML生成
function createBatterRowHtml(b) {
  const bbk = (b.bb_k != null ? b.bb_k : 0);
  return `<tr>
    <td>${b.year}</td>
    <td>${b.team}</td>
    <td class="player-name" data-url="${b.player_url || ''}" data-name="${b.name}" title="クリックしてキャリア推移を表示">${b.name} <small>(${b.age})</small>${!b.is_qual ? '<span class="tag-sub">準規定</span>' : ''}</td>
    <td><span class="pos-tag">${b.primary_pos}</span></td>
    <td><strong>${b.ops_plus.toFixed(1)}</strong></td>
    <td style="color:#38bdf8;">${(b.obp_plus || 100).toFixed(1)}</td>
    <td style="color:#f472b6;">${(b.isop_plus || 100).toFixed(1)}</td>
    <td>${b.ops.toFixed(3)}</td>
    <td>${b.avg.toFixed(3)}</td>
    <td>${b.hr}</td>
    <td>${b.rbi}</td>
    <td style="color:${bbk >= 1.0 ? '#4ade80' : '#cbd5e1'}" title="四球:${b.bb || 0} / 三振:${b.so || 0}">${bbk.toFixed(2)}</td>
    <td style="color:${b.wsb >= 0 ? '#38bdf8' : '#f87171'}">${b.wsb > 0 ? '+' : ''}${b.wsb.toFixed(2)}</td>
    <td>${getRankBadge(b.meet_rank, b.meet)}</td>
    <td>${getRankBadge(b.power_rank, b.power)}</td>
    <td>${getRankBadge(b.speed_rank, b.speed)}</td>
    <td>${getRankBadge(b.defense_rank, b.defense)}</td>
    <td>${getRankBadge(b.fielding_rank, b.fielding)}</td>
  </tr>`;
}

// 打者テーブル描画（チャンク描画）
function renderBatters() {
  let list = getFilteredData(allBatters, true);

  list.sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") {
      return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortOrder === "asc" ? va - vb : vb - va;
  });

  currentBattersList = list;
  displayedBattersCount = 0;

  const tbody = document.getElementById("battersBody");
  tbody.innerHTML = "";
  const container = document.getElementById("battersTableContainer");
  if (container) container.scrollTop = 0;

  appendMoreBatters();
}

function appendMoreBatters() {
  const total = currentBattersList.length;
  const nextChunk = currentBattersList.slice(displayedBattersCount, displayedBattersCount + PAGE_SIZE);
  if (nextChunk.length > 0) {
    const tbody = document.getElementById("battersBody");
    tbody.insertAdjacentHTML("beforeend", nextChunk.map(createBatterRowHtml).join(""));
    displayedBattersCount += nextChunk.length;
  }

  const countEl = document.getElementById("battersCount");
  const wrapEl = document.getElementById("battersLoadMoreWrap");
  const btnEl = document.getElementById("battersLoadMoreBtn");

  if (displayedBattersCount < total) {
    countEl.textContent = `該当: ${total.toLocaleString()}名 (${displayedBattersCount.toLocaleString()}名表示中)`;
    if (wrapEl && btnEl) {
      const rem = total - displayedBattersCount;
      wrapEl.style.display = "block";
      btnEl.textContent = `さらに${Math.min(PAGE_SIZE, rem)}件を表示 (残り ${rem.toLocaleString()}名)`;
    }
  } else {
    countEl.textContent = `表示: ${total.toLocaleString()}名`;
    if (wrapEl) wrapEl.style.display = "none";
  }
}

// 投手1行分のHTML生成
function createPitcherRowHtml(p) {
  const kbbColor = p.k_bb_pct >= 20 ? '#ef4444' : p.k_bb_pct >= 15 ? '#f472b6' : '#fff';
  const kbbDiff = p.k_bb != null ? p.k_bb : (p.so - (p.bb || 0));
  return `<tr>
    <td>${p.year}</td>
    <td>${p.team}</td>
    <td class="player-name" data-url="${p.player_url || ''}" data-name="${p.name}" title="クリックしてキャリア推移を表示">${p.name} <small>(${p.age})</small>${!p.is_qual ? '<span class="tag-sub">準規定</span>' : ''}</td>
    <td><strong style="color:${p.fip_minus <= 70 ? '#ef4444' : '#fff'}">${p.fip_minus.toFixed(1)}</strong></td>
    <td><strong style="color:${kbbColor}">${p.k_bb_pct.toFixed(1)}%</strong></td>
    <td><strong style="color:${kbbDiff >= 100 ? '#f472b6' : '#cbd5e1'}">${kbbDiff > 0 ? '+' : ''}${kbbDiff}</strong></td>
    <td style="color:#38bdf8;"><strong>${(p.k_pct_plus || 100).toFixed(1)}</strong></td>
    <td style="color:${(p.bb_pct_minus || 100) <= 70 ? '#4ade80' : '#cbd5e1'};">${(p.bb_pct_minus || 100).toFixed(1)}</td>
    <td style="color:${(p.hr_pct_minus || 100) <= 70 ? '#4ade80' : '#cbd5e1'};">${(p.hr_pct_minus || 100).toFixed(1)}</td>
    <td>${p.era.toFixed(2)}</td>
    <td>${p.fip.toFixed(2)}</td>
    <td>${p.w}</td>
    <td>${p.l}</td>
    <td>${p.ip.toFixed(1)}</td>
    <td>${p.so}</td>
    <td>${p.bb != null ? p.bb : '-'}</td>
    <td>${getRankBadge(p.control_rank, p.control)}</td>
    <td>${getRankBadge(p.stuff_rank, p.stuff)}</td>
    <td>${getRankBadge(p.stamina_rank, p.stamina)}</td>
  </tr>`;
}

// 投手テーブル描画（チャンク描画）
function renderPitchers() {
  let list = getFilteredData(allPitchers, false);

  list.sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") {
      return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortOrder === "asc" ? va - vb : vb - va;
  });

  currentPitchersList = list;
  displayedPitchersCount = 0;

  const tbody = document.getElementById("pitchersBody");
  tbody.innerHTML = "";
  const container = document.getElementById("pitchersTableContainer");
  if (container) container.scrollTop = 0;

  appendMorePitchers();
}

function appendMorePitchers() {
  const total = currentPitchersList.length;
  const nextChunk = currentPitchersList.slice(displayedPitchersCount, displayedPitchersCount + PAGE_SIZE);
  if (nextChunk.length > 0) {
    const tbody = document.getElementById("pitchersBody");
    tbody.insertAdjacentHTML("beforeend", nextChunk.map(createPitcherRowHtml).join(""));
    displayedPitchersCount += nextChunk.length;
  }

  const countEl = document.getElementById("pitchersCount");
  const wrapEl = document.getElementById("pitchersLoadMoreWrap");
  const btnEl = document.getElementById("pitchersLoadMoreBtn");

  if (displayedPitchersCount < total) {
    countEl.textContent = `該当: ${total.toLocaleString()}名 (${displayedPitchersCount.toLocaleString()}名表示中)`;
    if (wrapEl && btnEl) {
      const rem = total - displayedPitchersCount;
      wrapEl.style.display = "block";
      btnEl.textContent = `さらに${Math.min(PAGE_SIZE, rem)}件を表示 (残り ${rem.toLocaleString()}名)`;
    }
  } else {
    countEl.textContent = `表示: ${total.toLocaleString()}名`;
    if (wrapEl) wrapEl.style.display = "none";
  }
}

// 散布図描画（最大800点サンプリング＆高速描画）
function renderScatterChart() {
  const chartType = document.getElementById("chartTypeSelect").value;
  const ctx = document.getElementById("scatterCanvas").getContext("2d");
  const MAX_SCATTER_POINTS = 800;

  let points = [];
  let xLabel = "";
  let yLabel = "";
  let chartTitle = "";
  let totalMatched = 0;

  const capList = (list, isBatter) => {
    totalMatched = list.length;
    if (list.length <= MAX_SCATTER_POINTS) return list;
    const copy = list.slice();
    if (isBatter) {
      copy.sort((a, b) => b.ops_plus - a.ops_plus);
    } else {
      copy.sort((a, b) => a.fip_minus - b.fip_minus);
    }
    return copy.slice(0, MAX_SCATTER_POINTS);
  };

  if (chartType === "batter_obp_isop") {
    const list = capList(getFilteredData(allBatters, true), true);
    xLabel = "OBP+ (出塁率傑出度 / 100=平均)";
    yLabel = "ISO+ (純長打力傑出度 / 100=平均)";
    chartTitle = "野手: OBP+ (出塁力) × ISO+ (純長打力)";
    points = list.map(b => ({
      x: b.obp_plus || 100,
      y: b.isop_plus || 100,
      name: `[${b.year} ${b.team}] ${b.name}`,
      detail: `出塁率.${b.obp.toFixed(3)} HR:${b.hr} OBP+:${(b.obp_plus||100).toFixed(1)} ISO+:${(b.isop_plus||100).toFixed(1)}`
    }));
  } else if (chartType === "batter_ops_wsb") {
    const list = capList(getFilteredData(allBatters, true), true);
    xLabel = "wSB (走塁得点貢献)";
    yLabel = "OPS+ (打撃傑出度 / 100=平均)";
    chartTitle = "野手: OPS+ × wSB (攻撃力 & 走塁力)";
    points = list.map(b => ({
      x: b.wsb,
      y: b.ops_plus,
      name: `[${b.year} ${b.team}] ${b.name}`,
      detail: `打率.${b.avg.toFixed(3)} HR:${b.hr} 盗塁:${b.sb} OPS+:${b.ops_plus}`
    }));
  } else if (chartType === "batter_meet_power") {
    const list = capList(getFilteredData(allBatters, true), true);
    xLabel = "ミート能力 (1〜100)";
    yLabel = "パワー能力 (1〜100)";
    chartTitle = "野手: ミート × パワー (パワプロ打撃散布図)";
    points = list.map(b => ({
      x: b.meet,
      y: b.power,
      name: `[${b.year} ${b.team}] ${b.name}`,
      detail: `ミート:${b.meet}(${b.meet_rank}) パワー:${b.power}(${b.power_rank}) HR:${b.hr}`
    }));
  } else if (chartType === "batter_def_field") {
    const list = capList(getFilteredData(allBatters, true), true);
    xLabel = "守備力 (RRF 守備範囲 / 1〜100)";
    yLabel = "捕球 (エラー回避・守備率 / 1〜100)";
    chartTitle = "野手: 守備力 (守備範囲) × 捕球 (エラー回避)";
    points = list.map(b => ({
      x: b.defense,
      y: b.fielding,
      name: `[${b.year} ${b.team}] ${b.name} (${b.primary_pos})`,
      detail: `守備力:${b.defense}(${b.defense_rank}) 捕球:${b.fielding}(${b.fielding_rank}) RRF:${b.rrf}% 守備率:${b.fpct}`
    }));
  } else if (chartType === "pitcher_k_bb_era") {
    const list = capList(getFilteredData(allPitchers, false), false);
    xLabel = "K%+ (奪三振傑出度 / 100=平均・高いほど優秀)";
    yLabel = "BB%- (与四球抑止力 / 100=平均・低いほど優秀)";
    chartTitle = "投手: K%+ (奪三振力) × BB%- (制球力) 【時代補正】";
    points = list.map(p => ({
      x: p.k_pct_plus || 100,
      y: p.bb_pct_minus || 100,
      name: `[${p.year} ${p.team}] ${p.name}`,
      detail: `K%+:${(p.k_pct_plus||100).toFixed(1)} BB%-:${(p.bb_pct_minus||100).toFixed(1)} HR%-:${(p.hr_pct_minus||100).toFixed(1)} 防御率:${p.era}`
    }));
  } else if (chartType === "pitcher_fip_kbb") {
    const list = capList(getFilteredData(allPitchers, false), false);
    xLabel = "K-BB% (奪三振率 - 与四球率 / 支配力)";
    yLabel = "FIP- (時代補正FIP / 100=平均・低いほど優秀)";
    chartTitle = "投手: FIP- × K-BB% (最強支配力マトリクス)";
    points = list.map(p => ({
      x: p.k_bb_pct,
      y: p.fip_minus,
      name: `[${p.year} ${p.team}] ${p.name}`,
      detail: `FIP-:${p.fip_minus} K-BB%:${p.k_bb_pct}% 防御率:${p.era} 奪三振:${p.so}`
    }));
  } else if (chartType === "pitcher_ctrl_stuff") {
    const list = capList(getFilteredData(allPitchers, false), false);
    xLabel = "コントロール能力 (1〜100)";
    yLabel = "球威/キレ能力 (1〜100)";
    chartTitle = "投手: コントロール × 球威 (パワプロ散布図)";
    points = list.map(p => ({
      x: p.control,
      y: p.stuff,
      name: `[${p.year} ${p.team}] ${p.name}`,
      detail: `制球:${p.control}(${p.control_rank}) 球威:${p.stuff}(${p.stuff_rank}) K-BB:${p.k_bb}`
    }));
  }

  if (totalMatched > MAX_SCATTER_POINTS) {
    chartTitle += ` (上位${MAX_SCATTER_POINTS}名を表示中 / 該当${totalMatched.toLocaleString()}名)`;
  } else {
    chartTitle += ` (${totalMatched.toLocaleString()}名)`;
  }

  if (scatterChart) {
    scatterChart.destroy();
  }

  scatterChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [{
        label: chartTitle,
        data: points,
        backgroundColor: "rgba(56, 189, 248, 0.7)",
        borderColor: "#38bdf8",
        pointRadius: points.length > 300 ? 4 : 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: points.length > 250 ? false : { duration: 300 },
      plugins: {
        legend: { labels: { color: "#f8fafc", font: { size: 13 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const p = ctx.raw;
              return [`${p.name}`, `${xLabel}: ${p.x}`, `${yLabel}: ${p.y}`, `${p.detail}`];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: "#94a3b8" },
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        },
        y: {
          title: { display: true, text: yLabel, color: "#94a3b8" },
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        }
      }
    }
  });
}

// 選手直接比較の選択肢を高速生成（検索連動・上限250件）
function initCompareSelects() {
  populateSingleCompareSelect("compareSelectA", "", 0);
  populateSingleCompareSelect("compareSelectB", "", 1);
}

function populateSingleCompareSelect(selectId, queryStr, defaultIndex = 0) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const q = (queryStr || "").trim().toLowerCase();
  const qNoSpace = q.replace(/[\s\u3000]+/g, "");
  const MAX_OPTS = 250;
  const opts = [];

  for (let i = 0; i < allBatters.length && opts.length < MAX_OPTS; i++) {
    const b = allBatters[i];
    if (!q || b._searchRaw.includes(q) || b._searchNoSpace.includes(qNoSpace)) {
      opts.push(`<option value="b_${i}">[野手] ${b.year} ${b.team} ${b.name} (OPS+ ${b.ops_plus})</option>`);
    }
  }

  for (let i = 0; i < allPitchers.length && opts.length < MAX_OPTS; i++) {
    const p = allPitchers[i];
    if (!q || p._searchRaw.includes(q) || p._searchNoSpace.includes(qNoSpace)) {
      opts.push(`<option value="p_${i}">[投手] ${p.year} ${p.team} ${p.name} (FIP- ${p.fip_minus})</option>`);
    }
  }

  sel.innerHTML = opts.join("");
  if (sel.options.length > defaultIndex) {
    sel.selectedIndex = defaultIndex;
  }
}

// 選手直接比較カード＆レーダーチャート更新
function updateCompareView() {
  const valA = document.getElementById("compareSelectA").value;
  const valB = document.getElementById("compareSelectB").value;

  const itemA = getItemByVal(valA);
  const itemB = getItemByVal(valB);

  renderCompareCard("compareCardA", itemA);
  renderCompareCard("compareCardB", itemB);
  renderCompareRadar(itemA, itemB);
}

function getItemByVal(val) {
  if (!val) return null;
  const [type, idx] = val.split("_");
  return type === "b" ? { ...allBatters[parseInt(idx)], type: "b" } : { ...allPitchers[parseInt(idx)], type: "p" };
}

function renderCompareCard(cardId, item) {
  const card = document.getElementById(cardId);
  if (!item) { card.innerHTML = ""; return; }

  if (item.type === "b") {
    card.innerHTML = `
      <h4>${item.year}年 ${item.team}</h4>
      <h2 style="color:var(--accent);">${item.name} <small>(${item.primary_pos})</small></h2>
      <p style="margin:0.5rem 0; font-size:0.9rem;">
        打率: <strong>.${item.avg.toFixed(3)}</strong> | 出塁率: <strong>.${item.obp.toFixed(3)}</strong> | HR: <strong>${item.hr}</strong> | 打点: <strong>${item.rbi}</strong><br>
        OPS+: <strong style="color:#ef4444;">${item.ops_plus}</strong> | OBP+: <strong style="color:#38bdf8;">${(item.obp_plus||100).toFixed(1)}</strong> | ISO+: <strong style="color:#f472b6;">${(item.isop_plus||100).toFixed(1)}</strong> | wSB: <strong>${item.wsb}</strong>
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(95px, 1fr)); gap:0.5rem; margin-top:0.75rem;">
        <div>ミート: ${getRankBadge(item.meet_rank, item.meet)}</div>
        <div>パワー: ${getRankBadge(item.power_rank, item.power)}</div>
        <div>走力: ${getRankBadge(item.speed_rank, item.speed)}</div>
        <div>守備力: ${getRankBadge(item.defense_rank, item.defense)}</div>
        <div>捕球: ${getRankBadge(item.fielding_rank, item.fielding)}</div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <h4>${item.year}年 ${item.team}</h4>
      <h2 style="color:var(--accent);">${item.name}</h2>
      <p style="margin:0.5rem 0; font-size:0.9rem;">
        防御率: <strong>${item.era}</strong> | 勝利: <strong>${item.w}勝${item.l}敗${item.sv > 0 ? item.sv + 'S' : ''}</strong> | 奪三振: <strong>${item.so}</strong><br>
        FIP-: <strong style="color:#ef4444;">${item.fip_minus}</strong> | K%+: <strong style="color:#38bdf8;">${(item.k_pct_plus||100).toFixed(1)}</strong> | BB%-: <strong style="color:#4ade80;">${(item.bb_pct_minus||100).toFixed(1)}</strong> | HR%-: <strong>${(item.hr_pct_minus||100).toFixed(1)}</strong>
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.75rem;">
        <div>制球: ${getRankBadge(item.control_rank, item.control)}</div>
        <div>球威: ${getRankBadge(item.stuff_rank, item.stuff)}</div>
        <div>スタミナ: ${getRankBadge(item.stamina_rank, item.stamina)}</div>
      </div>
    `;
  }
}

function renderCompareRadar(a, b) {
  if (!a || !b) return;
  const ctx = document.getElementById("compareRadarCanvas").getContext("2d");

  let labels = [];
  let dataA = [];
  let dataB = [];

  if (a.type === "b" && b.type === "b") {
    labels = ["ミート", "パワー", "走力", "守備力(範囲)", "捕球(確実性)"];
    dataA = [a.meet, a.power, a.speed, a.defense, a.fielding || 50];
    dataB = [b.meet, b.power, b.speed, b.defense, b.fielding || 50];
  } else if (a.type === "p" && b.type === "p") {
    labels = ["コントロール", "球威/キレ", "スタミナ", "支配力(K-BB%*3)", "失点抑止(200-FIP-)"];
    dataA = [a.control, a.stuff, a.stamina, Math.min(100, Math.round(a.k_bb_pct * 3)), Math.min(100, Math.max(0, 200 - Math.round(a.fip_minus)))];
    dataB = [b.control, b.stuff, b.stamina, Math.min(100, Math.round(b.k_bb_pct * 3)), Math.min(100, Math.max(0, 200 - Math.round(b.fip_minus)))];
  } else {
    labels = ["能力1", "能力2", "能力3"];
    dataA = [a.meet || a.control, a.power || a.stuff, a.speed || a.stamina];
    dataB = [b.meet || b.control, b.power || b.stuff, b.speed || b.stamina];
  }

  if (radarChart) {
    radarChart.destroy();
  }

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: labels,
      datasets: [
        {
          label: `${a.year} ${a.name}`,
          data: dataA,
          backgroundColor: "rgba(56, 189, 248, 0.25)",
          borderColor: "#38bdf8",
          pointBackgroundColor: "#38bdf8"
        },
        {
          label: `${b.year} ${b.name}`,
          data: dataB,
          backgroundColor: "rgba(244, 63, 94, 0.25)",
          borderColor: "#f43f5e",
          pointBackgroundColor: "#f43f5e"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          grid: { color: "#334155" },
          angleLines: { color: "#334155" },
          pointLabels: { color: "#cbd5e1", font: { size: 12 } },
          ticks: { color: "#94a3b8", backdropColor: "transparent" }
        }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } }
      }
    }
  });
}

// CSVダウンロード（内部用キャッシュキーを除外して出力）
function setupCsvDownload() {
  const btn = document.getElementById("downloadCsvBtn");
  btn.addEventListener("click", () => {
    const isBatter = currentTab === "battersTab" || currentTab === "scatterTab";
    const data = isBatter ? getFilteredData(allBatters, true) : getFilteredData(allPitchers, false);
    if (!data.length) return;

    const headers = Object.keys(data[0]).filter(k => !k.startsWith("_"));
    const csvRows = [headers.join(",")];

    data.forEach(row => {
      const vals = headers.map(h => {
        let v = row[h];
        if (typeof v === "string") v = `"${v.replace(/"/g, '""')}"`;
        return v;
      });
      csvRows.push(vals.join(","));
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npb_${isBatter ? 'batters' : 'pitchers'}_stats.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ==========================================
// 選手個別キャリア推移モーダル
// ==========================================
function setupPlayerModal() {
  const modal = document.getElementById("playerModal");
  const closeBtn = document.getElementById("modalCloseBtn");
  const tabPawa = document.getElementById("modalChartTabPawa");
  const tabSaber = document.getElementById("modalChartTabSaber");

  if (closeBtn) {
    closeBtn.addEventListener("click", closePlayerModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closePlayerModal();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closePlayerModal();
    }
  });

  if (tabPawa) {
    tabPawa.addEventListener("click", () => {
      if (currentModalChartType === "pawa") return;
      currentModalChartType = "pawa";
      tabPawa.classList.add("active");
      tabSaber.classList.remove("active");
      renderModalTrendChart();
    });
  }

  if (tabSaber) {
    tabSaber.addEventListener("click", () => {
      if (currentModalChartType === "saber") return;
      currentModalChartType = "saber";
      tabSaber.classList.add("active");
      tabPawa.classList.remove("active");
      renderModalTrendChart();
    });
  }
}

function closePlayerModal() {
  const modal = document.getElementById("playerModal");
  if (modal) modal.classList.remove("active");
}

function openPlayerModal(playerUrl, playerName, isBatter) {
  const urlMap = isBatter ? batterByUrlMap : pitcherByUrlMap;
  const nameMap = isBatter ? batterByNameMap : pitcherByNameMap;

  // O(1) インデックスから全年度の記録を抽出
  let records = [];
  if (playerUrl && playerUrl !== "null" && playerUrl !== "undefined" && playerUrl !== "") {
    records = (urlMap.get(playerUrl) || []).slice();
  }
  if (records.length === 0) {
    records = (nameMap.get(playerName) || []).slice();
  }

  // 年度順にソート (古い年度 -> 新しい年度)
  records.sort((a, b) => a.year - b.year);

  currentModalPlayerRecords = records;
  currentModalIsBatter = isBatter;
  currentModalChartType = "pawa";

  // タブボタン状態のリセット
  const tabPawa = document.getElementById("modalChartTabPawa");
  const tabSaber = document.getElementById("modalChartTabSaber");
  if (tabPawa && tabSaber) {
    tabPawa.classList.add("active");
    tabSaber.classList.remove("active");
  }

  // ヘッダー情報の設定
  const nameEl = document.getElementById("modalPlayerName");
  const metaEl = document.getElementById("modalPlayerMeta");

  if (nameEl) nameEl.textContent = playerName;

  if (metaEl && records.length > 0) {
    const years = records.map(r => r.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const teamList = [];
    records.forEach(r => {
      if (!teamList.includes(r.team)) teamList.push(r.team);
    });
    const teamsStr = teamList.join(" → ");

    if (isBatter) {
      const bestOpsPlus = Math.max(...records.map(r => r.ops_plus));
      const posList = [...new Set(records.map(r => r.primary_pos))].join("/");
      metaEl.textContent = `在籍球団: ${teamsStr} | 主な守備: ${posList} | 期間: ${minYear}〜${maxYear}年 (${records.length}シーズン) | キャリア最高OPS+: ${bestOpsPlus.toFixed(1)}`;
    } else {
      const bestFipMinus = Math.min(...records.map(r => r.fip_minus));
      const totalWins = records.reduce((sum, r) => sum + (r.w || 0), 0);
      metaEl.textContent = `在籍球団: ${teamsStr} | 期間: ${minYear}〜${maxYear}年 (${records.length}シーズン) | 通算${totalWins}勝 | キャリア最高FIP-: ${bestFipMinus.toFixed(1)}`;
    }
  }

  renderModalTrendChart();
  renderModalCareerTable();

  const modal = document.getElementById("playerModal");
  if (modal) modal.classList.add("active");
}

function renderModalTrendChart() {
  const ctx = document.getElementById("playerTrendCanvas").getContext("2d");
  if (modalTrendChart) {
    modalTrendChart.destroy();
  }

  const labels = currentModalPlayerRecords.map(r => `${r.year} (${r.team})`);
  let datasets = [];
  let scalesConfig = {};

  if (currentModalIsBatter) {
    if (currentModalChartType === "pawa") {
      datasets = [
        {
          label: "ミート",
          data: currentModalPlayerRecords.map(r => r.meet),
          borderColor: "#38bdf8",
          backgroundColor: "#38bdf8",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "パワー",
          data: currentModalPlayerRecords.map(r => r.power),
          borderColor: "#f43f5e",
          backgroundColor: "#f43f5e",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "走力",
          data: currentModalPlayerRecords.map(r => r.speed),
          borderColor: "#22c55e",
          backgroundColor: "#22c55e",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "守備力 (範囲)",
          data: currentModalPlayerRecords.map(r => r.defense),
          borderColor: "#eab308",
          backgroundColor: "#eab308",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "捕球 (エラー回避)",
          data: currentModalPlayerRecords.map(r => r.fielding || 50),
          borderColor: "#a855f7",
          backgroundColor: "#a855f7",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        }
      ];
      scalesConfig = {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: "査定能力値 (1〜100)", color: "#94a3b8" },
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        }
      };
    } else {
      datasets = [
        {
          label: "OPS+ (打撃傑出度)",
          data: currentModalPlayerRecords.map(r => r.ops_plus),
          borderColor: "#f97316",
          backgroundColor: "#f97316",
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: 5
        },
        {
          label: "OBP+ (出塁傑出度)",
          data: currentModalPlayerRecords.map(r => r.obp_plus || 100),
          borderColor: "#38bdf8",
          backgroundColor: "#38bdf8",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "ISO+ (純長打傑出度)",
          data: currentModalPlayerRecords.map(r => r.isop_plus || 100),
          borderColor: "#ec4899",
          backgroundColor: "#ec4899",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        }
      ];
      scalesConfig = {
        y: {
          title: { display: true, text: "セイバー指標 (100 = リーグ平均)", color: "#94a3b8" },
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        }
      };
    }
  } else {
    // 投手
    if (currentModalChartType === "pawa") {
      datasets = [
        {
          label: "コントロール",
          data: currentModalPlayerRecords.map(r => r.control),
          borderColor: "#38bdf8",
          backgroundColor: "#38bdf8",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "球威/キレ",
          data: currentModalPlayerRecords.map(r => r.stuff),
          borderColor: "#ef4444",
          backgroundColor: "#ef4444",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        },
        {
          label: "スタミナ",
          data: currentModalPlayerRecords.map(r => r.stamina),
          borderColor: "#eab308",
          backgroundColor: "#eab308",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4
        }
      ];
      scalesConfig = {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: "査定能力値 (1〜100)", color: "#94a3b8" },
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        }
      };
    } else {
      datasets = [
        {
          label: "FIP- (時代補正FIP・低いほど優秀)",
          data: currentModalPlayerRecords.map(r => r.fip_minus),
          borderColor: "#ef4444",
          backgroundColor: "#ef4444",
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: 5,
          yAxisID: "y"
        },
        {
          label: "K-BB% (奪三振四球差率・高いほど優秀)",
          data: currentModalPlayerRecords.map(r => r.k_bb_pct),
          borderColor: "#38bdf8",
          backgroundColor: "#38bdf8",
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: 5,
          yAxisID: "y1"
        }
      ];
      scalesConfig = {
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: { display: true, text: "FIP- (100 = リーグ平均)", color: "#ef4444" },
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: { display: true, text: "K-BB% (%)", color: "#38bdf8" },
          grid: { drawOnChartArea: false },
          ticks: { color: "#cbd5e1" }
        }
      };
    }
  }

  modalTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: { labels: { color: "#f8fafc", font: { size: 12 } } },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f8fafc",
          bodyColor: "#cbd5e1",
          borderColor: "#475569",
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: "#334155" },
          ticks: { color: "#cbd5e1" }
        },
        ...scalesConfig
      }
    }
  });
}

function renderModalCareerTable() {
  const thead = document.getElementById("modalCareerThead");
  const tbody = document.getElementById("modalCareerTbody");
  if (!thead || !tbody) return;

  if (currentModalIsBatter) {
    thead.innerHTML = `
      <tr>
        <th>年度</th>
        <th>球団</th>
        <th>年齢</th>
        <th>守備</th>
        <th>OPS+</th>
        <th>OBP+</th>
        <th>ISO+</th>
        <th>打率</th>
        <th>出塁率</th>
        <th>長打率</th>
        <th>OPS</th>
        <th>本塁打</th>
        <th>打点</th>
        <th>盗塁</th>
        <th>ミート</th>
        <th>パワー</th>
        <th>走力</th>
        <th>守備力</th>
        <th>捕球</th>
      </tr>
    `;

    tbody.innerHTML = currentModalPlayerRecords.map(b => `
      <tr>
        <td>${b.year}</td>
        <td>${b.team}</td>
        <td>${b.age}</td>
        <td><span class="pos-tag">${b.primary_pos}</span></td>
        <td><strong style="color:${b.ops_plus >= 150 ? '#ef4444' : '#fff'};">${b.ops_plus.toFixed(1)}</strong></td>
        <td style="color:#38bdf8;">${(b.obp_plus || 100).toFixed(1)}</td>
        <td style="color:#f472b6;">${(b.isop_plus || 100).toFixed(1)}</td>
        <td>.${b.avg.toFixed(3)}</td>
        <td>.${b.obp.toFixed(3)}</td>
        <td>.${b.slg.toFixed(3)}</td>
        <td>.${b.ops.toFixed(3)}</td>
        <td>${b.hr}</td>
        <td>${b.rbi}</td>
        <td>${b.sb}</td>
        <td>${getRankBadge(b.meet_rank, b.meet)}</td>
        <td>${getRankBadge(b.power_rank, b.power)}</td>
        <td>${getRankBadge(b.speed_rank, b.speed)}</td>
        <td>${getRankBadge(b.defense_rank, b.defense)}</td>
        <td>${getRankBadge(b.fielding_rank, b.fielding)}</td>
      </tr>
    `).join("");
  } else {
    // 投手
    thead.innerHTML = `
      <tr>
        <th>年度</th>
        <th>球団</th>
        <th>年齢</th>
        <th>FIP-</th>
        <th>K-BB%</th>
        <th>K%+</th>
        <th>BB%-</th>
        <th>HR%-</th>
        <th>防御率</th>
        <th>FIP</th>
        <th>勝</th>
        <th>敗</th>
        <th>回数</th>
        <th>奪三振</th>
        <th>与四球</th>
        <th>制球</th>
        <th>球威</th>
        <th>スタミナ</th>
      </tr>
    `;

    tbody.innerHTML = currentModalPlayerRecords.map(p => {
      const kbbColor = p.k_bb_pct >= 20 ? '#ef4444' : p.k_bb_pct >= 15 ? '#f472b6' : '#fff';
      return `
      <tr>
        <td>${p.year}</td>
        <td>${p.team}</td>
        <td>${p.age}</td>
        <td><strong style="color:${p.fip_minus <= 70 ? '#ef4444' : '#fff'};">${p.fip_minus.toFixed(1)}</strong></td>
        <td><strong style="color:${kbbColor}" title="K-BB実数: ${(p.k_bb || (p.so - (p.bb || 0)))}">${p.k_bb_pct.toFixed(1)}%</strong></td>
        <td style="color:#38bdf8;"><strong>${(p.k_pct_plus || 100).toFixed(1)}</strong></td>
        <td style="color:${(p.bb_pct_minus || 100) <= 70 ? '#4ade80' : '#cbd5e1'};">${(p.bb_pct_minus || 100).toFixed(1)}</td>
        <td style="color:${(p.hr_pct_minus || 100) <= 70 ? '#4ade80' : '#cbd5e1'};">${(p.hr_pct_minus || 100).toFixed(1)}</td>
        <td>${p.era.toFixed(2)}</td>
        <td>${p.fip.toFixed(2)}</td>
        <td>${p.w}</td>
        <td>${p.l}</td>
        <td>${p.ip.toFixed(1)}</td>
        <td>${p.so}</td>
        <td>${p.bb != null ? p.bb : '-'}</td>
        <td>${getRankBadge(p.control_rank, p.control)}</td>
        <td>${getRankBadge(p.stuff_rank, p.stuff)}</td>
        <td>${getRankBadge(p.stamina_rank, p.stamina)}</td>
      </tr>
    `;
    }).join("");
  }
}
