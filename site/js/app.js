let allBatters = [];
let allPitchers = [];
let currentTab = "battersTab";
let sortKey = "ops_plus";
let sortOrder = "desc";
let scatterChart = null;
let radarChart = null;

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
  setupCsvDownload();
  await loadData();
});

// データ取得
async function loadData() {
  try {
    const [bRes, pRes] = await Promise.all([
      fetch("data/batters.json"),
      fetch("data/pitchers.json")
    ]);
    allBatters = await bRes.json();
    allPitchers = await pRes.json();

    populateTeamFilter();
    populateCompareSelects();
    renderCurrentTab();
  } catch (err) {
    console.error("データの読み込みに失敗しました:", err);
  }
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
      }

      renderCurrentTab();
    });
  });
}

// フィルターイベント設定
function setupFilters() {
  ["yearFilter", "leagueFilter", "teamFilter", "posFilter", "searchQuery"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => renderCurrentTab());
    }
  });

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
}

// 球団フィルターの選択肢を生成
function populateTeamFilter() {
  const teams = new Set();
  allBatters.forEach(b => { if (b.team && b.team !== "不明") teams.add(b.team); });
  allPitchers.forEach(p => { if (p.team && p.team !== "不明") teams.add(p.team); });

  const select = document.getElementById("teamFilter");
  Array.from(teams).sort().forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
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
        // FIP-やERAは昇順デフォルト、それ以外は降順デフォルト
        sortOrder = (key === "fip_minus" || key === "era" || key === "fip") ? "asc" : "desc";
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
  const query = document.getElementById("searchQuery").value.trim().toLowerCase();

  return dataList.filter(item => {
    if (year !== "all" && item.year.toString() !== year) return false;
    if (league !== "all" && item.league !== league) return false;
    if (team !== "all" && item.team !== team) return false;
    if (isBatter && pos !== "all" && item.primary_pos !== pos) return false;
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

// 現在のタブを描画
function renderCurrentTab() {
  if (currentTab === "battersTab") {
    renderBatters();
  } else if (currentTab === "pitchersTab") {
    renderPitchers();
  } else if (currentTab === "scatterTab") {
    renderScatterChart();
  } else if (currentTab === "compareTab") {
    updateCompareView();
  }
}

// 打者テーブル描画
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

  document.getElementById("battersCount").textContent = `表示: ${list.length}名`;
  const tbody = document.getElementById("battersBody");
  tbody.innerHTML = list.map(b => `
    <tr>
      <td>${b.year}</td>
      <td>${b.team}</td>
      <td class="player-name">${b.name} <small>(${b.age})</small></td>
      <td><span class="pos-tag">${b.primary_pos}</span></td>
      <td><strong>${b.ops_plus.toFixed(1)}</strong></td>
      <td>${b.ops.toFixed(3)}</td>
      <td>${b.avg.toFixed(3)}</td>
      <td>${b.hr}</td>
      <td>${b.rbi}</td>
      <td style="color:${b.wsb >= 0 ? '#38bdf8' : '#f87171'}">${b.wsb > 0 ? '+' : ''}${b.wsb.toFixed(2)}</td>
      <td>${getRankBadge(b.meet_rank, b.meet)}</td>
      <td>${getRankBadge(b.power_rank, b.power)}</td>
      <td>${getRankBadge(b.speed_rank, b.speed)}</td>
      <td>${getRankBadge(b.defense_rank, b.defense)}</td>
    </tr>
  `).join("");
}

// 投手テーブル描画
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

  document.getElementById("pitchersCount").textContent = `表示: ${list.length}名`;
  const tbody = document.getElementById("pitchersBody");
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.year}</td>
      <td>${p.team}</td>
      <td class="player-name">${p.name} <small>(${p.age})</small></td>
      <td><strong style="color:${p.fip_minus <= 70 ? '#ef4444' : '#fff'}">${p.fip_minus.toFixed(1)}</strong></td>
      <td><strong style="color:${p.k_bb_pct >= 20 ? '#ef4444' : '#fff'}">${p.k_bb_pct.toFixed(1)}%</strong></td>
      <td>${p.era.toFixed(2)}</td>
      <td>${p.fip.toFixed(2)}</td>
      <td>${p.w}</td>
      <td>${p.l}</td>
      <td>${p.ip.toFixed(1)}</td>
      <td>${p.so}</td>
      <td>${getRankBadge(p.control_rank, p.control)}</td>
      <td>${getRankBadge(p.stuff_rank, p.stuff)}</td>
      <td>${getRankBadge(p.stamina_rank, p.stamina)}</td>
    </tr>
  `).join("");
}

// 散布図描画
function renderScatterChart() {
  const chartType = document.getElementById("chartTypeSelect").value;
  const ctx = document.getElementById("scatterCanvas").getContext("2d");

  let points = [];
  let xLabel = "";
  let yLabel = "";
  let chartTitle = "";

  if (chartType === "batter_ops_wsb") {
    const list = getFilteredData(allBatters, true);
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
    const list = getFilteredData(allBatters, true);
    xLabel = "ミート能力 (1〜100)";
    yLabel = "パワー能力 (1〜100)";
    chartTitle = "野手: ミート × パワー (パワプロ散布図)";
    points = list.map(b => ({
      x: b.meet,
      y: b.power,
      name: `[${b.year} ${b.team}] ${b.name}`,
      detail: `ミート:${b.meet}(${b.meet_rank}) パワー:${b.power}(${b.power_rank}) HR:${b.hr}`
    }));
  } else if (chartType === "pitcher_fip_kbb") {
    const list = getFilteredData(allPitchers, false);
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
    const list = getFilteredData(allPitchers, false);
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
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#f8fafc", font: { size: 14 } } },
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

// 選手直接比較の選択肢を生成
function populateCompareSelects() {
  const selA = document.getElementById("compareSelectA");
  const selB = document.getElementById("compareSelectB");
  if (!selA || !selB) return;

  selA.innerHTML = "";
  selB.innerHTML = "";

  allBatters.forEach((b, i) => {
    const text = `[野手] ${b.year} ${b.team} ${b.name}`;
    const val = `b_${i}`;
    selA.appendChild(new Option(text, val));
    selB.appendChild(new Option(text, val));
  });

  allPitchers.forEach((p, i) => {
    const text = `[投手] ${p.year} ${p.team} ${p.name}`;
    const val = `p_${i}`;
    selA.appendChild(new Option(text, val));
    selB.appendChild(new Option(text, val));
  });

  if (selB.options.length > 1) selB.selectedIndex = 1;
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
        打率: <strong>.${item.avg.toFixed(3)}</strong> | HR: <strong>${item.hr}</strong> | 打点: <strong>${item.rbi}</strong><br>
        OPS+: <strong style="color:#ef4444;">${item.ops_plus}</strong> | wSB: <strong>${item.wsb}</strong>
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.75rem;">
        <div>ミート: ${getRankBadge(item.meet_rank, item.meet)}</div>
        <div>パワー: ${getRankBadge(item.power_rank, item.power)}</div>
        <div>走力: ${getRankBadge(item.speed_rank, item.speed)}</div>
        <div>守備力: ${getRankBadge(item.defense_rank, item.defense)}</div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <h4>${item.year}年 ${item.team}</h4>
      <h2 style="color:var(--accent);">${item.name}</h2>
      <p style="margin:0.5rem 0; font-size:0.9rem;">
        防御率: <strong>${item.era}</strong> | 勝利: <strong>${item.w}勝${item.l}敗</strong> | 奪三振: <strong>${item.so}</strong><br>
        FIP-: <strong style="color:#ef4444;">${item.fip_minus}</strong> | K-BB%: <strong>${item.k_bb_pct}%</strong>
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
    labels = ["ミート", "パワー", "走力", "守備力", "打撃傑出度(OPS+/2)"];
    dataA = [a.meet, a.power, a.speed, a.defense, Math.min(100, Math.round(a.ops_plus / 2))];
    dataB = [b.meet, b.power, b.speed, b.defense, Math.min(100, Math.round(b.ops_plus / 2))];
  } else if (a.type === "p" && b.type === "p") {
    labels = ["コントロール", "球威/キレ", "スタミナ", "支配力(K-BB%*3)", "失点抑止(200-FIP-)"];
    dataA = [a.control, a.stuff, a.stamina, Math.min(100, Math.round(a.k_bb_pct * 3)), Math.min(100, Math.max(0, 200 - Math.round(a.fip_minus)))];
    dataB = [b.control, b.stuff, b.stamina, Math.min(100, Math.round(b.k_bb_pct * 3)), Math.min(100, Math.max(0, 200 - Math.round(b.fip_minus)))];
  } else {
    // 異種間
    labels = ["総合評価A", "総合評価B", "総合評価C"];
    dataA = [50, 50, 50];
    dataB = [50, 50, 50];
  }

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: labels,
      datasets: [
        {
          label: `${a.year} ${a.name}`,
          data: dataA,
          backgroundColor: "rgba(56, 189, 248, 0.3)",
          borderColor: "#38bdf8",
          pointBackgroundColor: "#38bdf8"
        },
        {
          label: `${b.year} ${b.name}`,
          data: dataB,
          backgroundColor: "rgba(239, 68, 68, 0.3)",
          borderColor: "#ef4444",
          pointBackgroundColor: "#ef4444"
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

// CSVダウンロード
function setupCsvDownload() {
  const btn = document.getElementById("downloadCsvBtn");
  btn.addEventListener("click", () => {
    const isBatter = currentTab === "battersTab" || currentTab === "scatterTab";
    const data = isBatter ? getFilteredData(allBatters, true) : getFilteredData(allPitchers, false);
    if (!data.length) return;

    const headers = Object.keys(data[0]);
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
