const els = {
  baseUrl: document.getElementById("baseUrl"),
  dashboardUid: document.getElementById("dashboardUid"),
  loadDashboardBtn: document.getElementById("loadDashboardBtn"),
  sourceStatus: document.getElementById("sourceStatus"),
  gpuSearch: document.getElementById("gpuSearch"),
  gpuList: document.getElementById("gpuList"),
  gpuSelectionInfo: document.getElementById("gpuSelectionInfo"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  refreshSeconds: document.getElementById("refreshSeconds"),
  priceThreshold: document.getElementById("priceThreshold"),
  verifiedOnly: document.getElementById("verifiedOnly"),
  feeMultiplier: document.getElementById("feeMultiplier"),
  botToken: document.getElementById("botToken"),
  chatId: document.getElementById("chatId"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  monitorStatus: document.getElementById("monitorStatus"),
  statsBody: document.getElementById("statsBody"),
};

const state = {
  dashboard: null,
  timer: null,
  gpuOptions: [],
  selectedGpus: new Set(),
  panelPrice: null,
  panelUtilization: null,
  lastPriceMap: new Map(),
};

function setStatus(el, text, type = "info") {
  el.textContent = text;
  el.dataset.type = type;
}

function apiUrl(path) {
  return `${els.baseUrl.value.replace(/\/$/, "")}${path}`;
}

function flattenPanels(panels = []) {
  const all = [];
  for (const panel of panels) {
    if (panel.panels) {
      all.push(...flattenPanels(panel.panels));
    } else {
      all.push(panel);
    }
  }
  return all;
}

async function fetchDashboard() {
  const uid = els.dashboardUid.value.trim();
  if (!uid) {
    throw new Error("Dashboard UID 不可為空");
  }

  const response = await fetch(apiUrl(`/api/dashboards/uid/${uid}`));
  if (!response.ok) {
    throw new Error(`無法讀取 dashboard（HTTP ${response.status}）`);
  }

  const payload = await response.json();
  return payload.dashboard;
}

function findPanel(dashboard, keywords) {
  return flattenPanels(dashboard.panels || []).find((panel) => {
    const title = String(panel.title || "").toLowerCase();
    return keywords.some((k) => title.includes(k));
  });
}

function getGpuVariable(dashboard) {
  return dashboard.templating?.list?.find((v) => v.name === "gpu_name");
}

function refreshGpuSelectionInfo() {
  setStatus(els.gpuSelectionInfo, `已選 ${state.selectedGpus.size} 個`, "info");
}

function renderGpuList() {
  const q = els.gpuSearch.value.trim().toLowerCase();
  const visible = state.gpuOptions.filter((gpu) => gpu.toLowerCase().includes(q));

  els.gpuList.innerHTML = "";
  if (!visible.length) {
    els.gpuList.innerHTML = '<div class="empty-gpu">找不到符合的 GPU</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const gpu of visible) {
    const label = document.createElement("label");
    label.className = "gpu-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedGpus.has(gpu);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedGpus.add(gpu);
      } else {
        state.selectedGpus.delete(gpu);
      }
      refreshGpuSelectionInfo();
    });

    const text = document.createElement("span");
    text.textContent = gpu;

    label.append(checkbox, text);
    frag.appendChild(label);
  }
  els.gpuList.appendChild(frag);
}

async function loadDashboardAndGpu() {
  setStatus(els.sourceStatus, "載入中...", "info");
  try {
    const dashboard = await fetchDashboard();
    const gpuVar = getGpuVariable(dashboard);

    if (!gpuVar || !Array.isArray(gpuVar.options)) {
      throw new Error("來源 dashboard 找不到 gpu_name 變數");
    }

    state.dashboard = dashboard;
    state.panelPrice = findPanel(dashboard, ["price", "rental", "租金"]);
    state.panelUtilization = findPanel(dashboard, ["utilization", "租用率", "usage"]);

    if (!state.panelPrice || !state.panelUtilization) {
      throw new Error("找不到租金或租用率面板，請確認來源 dashboard 標題");
    }

    state.gpuOptions = gpuVar.options
      .map((opt) => opt.value)
      .filter((v) => v && v !== "$__all")
      .map(String);

    if (!state.gpuOptions.length) {
      throw new Error("GPU 清單為空");
    }

    state.selectedGpus.clear();
    refreshGpuSelectionInfo();
    renderGpuList();
    setStatus(els.sourceStatus, `已載入 ${state.gpuOptions.length} 個 GPU 型號`, "success");
  } catch (error) {
    setStatus(els.sourceStatus, error.message, "error");
  }
}

function buildScopedVars(gpuName) {
  return {
    gpu_name: { selected: true, text: gpuName, value: gpuName },
    verified: { text: els.verifiedOnly.value, value: els.verifiedOnly.value },
    fee_mult: { text: els.feeMultiplier.value, value: els.feeMultiplier.value },
  };
}

function makeQueryPayload(panel, scopedVars) {
  const now = Date.now();
  const from = now - 1000 * 60 * 60;

  const queries = (panel.targets || []).map((target, i) => ({
    ...target,
    refId: target.refId || String.fromCharCode(65 + i),
    datasource: target.datasource || panel.datasource,
  }));

  return {
    panelId: panel.id,
    interval: "1m",
    intervalMs: 60000,
    maxDataPoints: 120,
    range: {
      from: new Date(from).toISOString(),
      to: new Date(now).toISOString(),
    },
    rangeRaw: { from: "now-1h", to: "now" },
    scopedVars,
    queries,
  };
}

async function queryPanelLatest(panel, scopedVars) {
  const response = await fetch(apiUrl("/api/ds/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(makeQueryPayload(panel, scopedVars)),
  });

  if (!response.ok) {
    throw new Error(`查詢資料失敗（HTTP ${response.status}）`);
  }

  const payload = await response.json();
  const firstResult = Object.values(payload.results || {})[0];
  if (!firstResult?.frames?.length) {
    return null;
  }

  for (const frame of firstResult.frames) {
    const fields = frame.schema?.fields || [];
    const values = frame.data?.values || [];
    const idx = fields.findIndex((f) => f.type === "number");
    if (idx === -1) {
      continue;
    }
    const arr = values[idx] || [];
    if (arr.length) {
      return Number(arr[arr.length - 1]);
    }
  }
  return null;
}

async function sendTelegram(text) {
  const token = els.botToken.value.trim();
  const chatId = els.chatId.value.trim();
  if (!token || !chatId) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

function renderRows(rows) {
  if (!rows.length) {
    els.statsBody.innerHTML = '<tr><td class="empty" colspan="5">尚無資料</td></tr>';
    return;
  }

  els.statsBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.gpu}</td>
        <td>${row.price ?? "-"}</td>
        <td>${row.utilization ?? "-"}</td>
        <td class="${row.changeClass}">${row.changeText}</td>
        <td>${row.updatedAt}</td>
      </tr>`
    )
    .join("");
}

function fmt(val, d = 4) {
  return Number.isFinite(val) ? val.toFixed(d) : null;
}

async function refreshData() {
  if (!state.selectedGpus.size) {
    setStatus(els.monitorStatus, "請先選擇至少一個 GPU", "error");
    renderRows([]);
    return;
  }

  setStatus(els.monitorStatus, "更新中...", "info");

  try {
    const threshold = Number(els.priceThreshold.value);
    const rows = [];

    for (const gpu of state.selectedGpus) {
      const scopedVars = buildScopedVars(gpu);
      const [priceRaw, utilRaw] = await Promise.all([
        queryPanelLatest(state.panelPrice, scopedVars),
        queryPanelLatest(state.panelUtilization, scopedVars),
      ]);

      const prev = state.lastPriceMap.get(gpu);
      let changeText = "-";
      let changeClass = "neutral";

      if (Number.isFinite(priceRaw) && Number.isFinite(prev) && prev !== 0) {
        const change = ((priceRaw - prev) / prev) * 100;
        changeText = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
        changeClass = change > 0 ? "up" : change < 0 ? "down" : "neutral";

        if (Math.abs(change) >= threshold) {
          await sendTelegram(
            `[Vast.ai] ${gpu} 租金變動 ${change.toFixed(2)}%\n前次: ${prev.toFixed(4)}\n目前: ${priceRaw.toFixed(4)}`
          );
        }
      }

      if (Number.isFinite(priceRaw)) {
        state.lastPriceMap.set(gpu, priceRaw);
      }

      rows.push({
        gpu,
        price: fmt(priceRaw),
        utilization: fmt(utilRaw),
        changeText,
        changeClass,
        updatedAt: new Date().toLocaleString("zh-TW"),
      });
    }

    renderRows(rows);
    setStatus(els.monitorStatus, `更新完成（${rows.length} 筆）`, "success");
  } catch (error) {
    setStatus(els.monitorStatus, error.message, "error");
  }
}

function startMonitor() {
  if (state.timer) {
    return;
  }
  const seconds = Math.max(15, Number(els.refreshSeconds.value) || 60);
  refreshData();
  state.timer = window.setInterval(refreshData, seconds * 1000);
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  setStatus(els.monitorStatus, `監控中（每 ${seconds} 秒）`, "success");
}

function stopMonitor() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  setStatus(els.monitorStatus, "已停止", "info");
}

els.loadDashboardBtn.addEventListener("click", loadDashboardAndGpu);
els.gpuSearch.addEventListener("input", renderGpuList);
els.selectAllBtn.addEventListener("click", () => {
  const q = els.gpuSearch.value.trim().toLowerCase();
  state.gpuOptions
    .filter((gpu) => gpu.toLowerCase().includes(q))
    .forEach((gpu) => state.selectedGpus.add(gpu));
  refreshGpuSelectionInfo();
  renderGpuList();
});
els.clearSelectionBtn.addEventListener("click", () => {
  state.selectedGpus.clear();
  refreshGpuSelectionInfo();
  renderGpuList();
});
els.startBtn.addEventListener("click", startMonitor);
els.stopBtn.addEventListener("click", stopMonitor);

window.addEventListener("load", loadDashboardAndGpu);
