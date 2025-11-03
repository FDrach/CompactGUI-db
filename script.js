document.addEventListener("DOMContentLoaded", () => {
  const PRIMARY_API_URL =
    "https://rawcdn.githack.com/IridiumIO/CompactGUI/a8a8869ce61e200d542f090d47fab5b0107f0233/database.json";
  const FALLBACK_API_URL =
    "https://raw.githubusercontent.com/IridiumIO/CompactGUI/refs/heads/database/database.json";
  const COMPRESSION_TYPES = ["XPRESS 4K", "XPRESS 8K", "XPRESS 16K", "LZX"];
  const CACHE_KEY = "compactGuiData";
  const CACHE_TIMESTAMP_KEY = "compactGuiTimestamp";
  const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
  const searchInput = document.getElementById("search");
  const sortSelect = document.getElementById("sort");
  const showSelect = document.getElementById("show");
  const gameGrid = document.getElementById("game-grid");
  const loader = document.getElementById("loader");
  const viewGridBtn = document.getElementById("view-grid");
  const viewListBtn = document.getElementById("view-list");
  const viewCompactBtn = document.getElementById("view-compact");
  const refreshBtn = document.getElementById("refresh-db");
  const paginationControls = document.getElementById("pagination-controls");

  let allGames = [],
    processedGames = [],
    currentPage = 1;

  const formatBytes = (bytes, d = 2) => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const s = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      parseFloat((bytes / Math.pow(k, i)).toFixed(d < 0 ? 0 : d)) + " " + s[i]
    );
  };
  const getCoverUrl = (id) =>
    `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900_2x.jpg`;
  const getThumbUrl = (id) =>
    `https://steamcdn-a.akamaihd.net/steam/apps/${id}/capsule_231x87.jpg`;
  const fallbackCoverUrl = (id) =>
    `https://steamcdn-a.akamaihd.net/steam/apps/${id}/capsule_616x353.jpg`;
  let debounceTimer;
  const debounce = (func, delay) => {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
  };

  const fetchDatabase = async () => {
    const attemptFetch = async (url) => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return { data, source: url };
    };

    try {
      return await attemptFetch(PRIMARY_API_URL);
    } catch (primaryError) {
      console.warn(
        "Primary database fetch failed, trying fallback.",
        primaryError
      );
      try {
        const fallbackResult = await attemptFetch(FALLBACK_API_URL);
        console.info("Loaded database from fallback source.", FALLBACK_API_URL);
        return fallbackResult;
      } catch (fallbackError) {
        console.error("Fallback database fetch failed.", fallbackError);
        const aggregatedError = new Error(
          "Failed to fetch database from both primary and fallback sources."
        );
        aggregatedError.primaryError = primaryError;
        aggregatedError.fallbackError = fallbackError;
        throw aggregatedError;
      }
    }
  };

  const forceFetchData = async () => {
    loader.style.display = "block";
    loader.textContent = "Fetching latest data...";
    refreshBtn.classList.add("loading");
    try {
      const { data, source } = await fetchDatabase();
      allGames = data;
      localStorage.setItem(CACHE_KEY, JSON.stringify(allGames));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      if (source === FALLBACK_API_URL) {
        console.info("Caching fallback data source for offline use.");
      }
      processAndRender();
    } catch (error) {
      loader.textContent = "Failed to fetch new data.";
      console.error("Fetch error:", error);
    } finally {
      loader.style.display = "none";
      refreshBtn.classList.remove("loading");
    }
  };
  const loadData = () => {
    const cD = localStorage.getItem(CACHE_KEY);
    const cT = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cD && cT && Date.now() - parseInt(cT) < CACHE_DURATION_MS) {
      console.log("Loading data from cache.");
      try {
        allGames = JSON.parse(cD);
        loader.style.display = "none";
        processAndRender();
        return;
      } catch (e) {
        console.error("Failed to parse cached data.", e);
      }
    }
    console.log("Cache is old or missing, fetching new data.");
    forceFetchData();
  };

  const processAndRender = () => {
    processData();
    renderUI();
  };
  const processData = () => {
    processedGames = allGames.map((g) => {
      const oS = Math.max(0, ...g.CompressionResults.map((r) => r.BeforeBytes));
      const rM = new Map();
      g.CompressionResults.forEach((r) => {
        rM.set(r.CompType, {
          ...r,
          savings:
            r.BeforeBytes > 0 ? (1 - r.AfterBytes / r.BeforeBytes) * 100 : 0,
        });
      });
      return { ...g, originalSize: oS, resultsMap: rM };
    });
  };

  const renderUI = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const sortValue = sortSelect.value;
    let filteredGames = processedGames.filter((game) =>
      game.GameName.toLowerCase().includes(searchTerm)
    );
    filteredGames.sort((a, b) => {
      switch (sortValue) {
        case "name_asc":
          return a.GameName.localeCompare(b.GameName);
        case "name_desc":
          return b.GameName.localeCompare(a.GameName);
        case "size_desc":
          return b.originalSize - a.originalSize;
        case "size_asc":
          return a.originalSize - b.originalSize;
        case "xpress4k_size_asc":
          return (
            (a.resultsMap.get(0)?.AfterBytes ?? Infinity) -
            (b.resultsMap.get(0)?.AfterBytes ?? Infinity)
          );
        case "xpress4k_ratio_desc":
          return (
            (b.resultsMap.get(0)?.savings ?? -1) -
            (a.resultsMap.get(0)?.savings ?? -1)
          );
        case "xpress8k_size_asc":
          return (
            (a.resultsMap.get(1)?.AfterBytes ?? Infinity) -
            (b.resultsMap.get(1)?.AfterBytes ?? Infinity)
          );
        case "xpress8k_ratio_desc":
          return (
            (b.resultsMap.get(1)?.savings ?? -1) -
            (a.resultsMap.get(1)?.savings ?? -1)
          );
        case "xpress16k_size_asc":
          return (
            (a.resultsMap.get(2)?.AfterBytes ?? Infinity) -
            (b.resultsMap.get(2)?.AfterBytes ?? Infinity)
          );
        case "xpress16k_ratio_desc":
          return (
            (b.resultsMap.get(2)?.savings ?? -1) -
            (a.resultsMap.get(2)?.savings ?? -1)
          );
        case "lzx_size_asc":
          return (
            (a.resultsMap.get(3)?.AfterBytes ?? Infinity) -
            (b.resultsMap.get(3)?.AfterBytes ?? Infinity)
          );
        case "lzx_ratio_desc":
          return (
            (b.resultsMap.get(3)?.savings ?? -1) -
            (a.resultsMap.get(3)?.savings ?? -1)
          );
        default:
          return 0;
      }
    });

    const pageSize = parseInt(showSelect.value, 10);
    const totalPages = Math.ceil(filteredGames.length / pageSize);
    currentPage = Math.min(currentPage, totalPages || 1);
    const startIndex = (currentPage - 1) * pageSize;
    const gamesToRender = filteredGames.slice(
      startIndex,
      startIndex + pageSize
    );

    const currentView = localStorage.getItem("compactGuiViewMode") || "grid";
    if (currentView === "compact") {
      gameGrid.innerHTML = createCompactTableHTML(gamesToRender);
    } else {
      gameGrid.innerHTML = gamesToRender.map(createGameCardHTML).join("");
    }

    renderPagination(totalPages);
  };

  const renderPagination = (totalPages) => {
    paginationControls.innerHTML = "";
    if (totalPages <= 1) return;
    const createButton = (text, page, isDisabled = false, isActive = false) => {
      const btn = document.createElement("button");
      btn.className = "page-btn";
      btn.innerHTML = text;
      btn.disabled = isDisabled;
      if (isActive) btn.classList.add("active");
      btn.addEventListener("click", () => {
        currentPage = page;
        updateURLState();
        renderUI();
      });
      return btn;
    };
    paginationControls.appendChild(
      createButton("&laquo; Prev", currentPage - 1, currentPage === 1)
    );
    const pagesToShow = new Set();
    pagesToShow.add(1);
    pagesToShow.add(totalPages);
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pagesToShow.add(i);
    }
    let lastPage = 0;
    Array.from(pagesToShow)
      .sort((a, b) => a - b)
      .forEach((page) => {
        if (page > lastPage + 1) {
          const ellipsis = document.createElement("span");
          ellipsis.className = "ellipsis";
          ellipsis.textContent = "...";
          paginationControls.appendChild(ellipsis);
        }
        paginationControls.appendChild(
          createButton(page, page, false, page === currentPage)
        );
        lastPage = page;
      });
    paginationControls.appendChild(
      createButton("Next &raquo;", currentPage + 1, currentPage === totalPages)
    );
  };

  const createGameCardHTML = (game) => {
    let rH = "";
    COMPRESSION_TYPES.forEach((t, i) => {
      const r = game.resultsMap.get(i);
      if (r) {
        rH += `<tr><td>${t}</td><td>${formatBytes(
          r.AfterBytes
        )}</td><td class="savings">${r.savings.toFixed(2)}%</td></tr>`;
      }
    });
    if (!rH) rH = '<tr><td colspan="3">N/A</td></tr>';
    return `<div class="game-card"><img class="cover" src="${getCoverUrl(
      game.SteamID
    )}" alt="${
      game.GameName
    } Cover" loading="lazy" onerror="this.onerror=null;this.src='${fallbackCoverUrl(
      game.SteamID
    )}';"><div class="game-info"><div class="game-title-container"><a href="https://store.steampowered.com/app/${
      game.SteamID
    }" target="_blank" rel="noopener noreferrer" class="steam-link" title="View on Steam Store">
        <img src="icons/open-link.svg" alt="View on Steam Store">
        </a><h2 title="${game.GameName}">${
      game.GameName
    }</h2></div><div class="game-meta">Original Size: <strong>${formatBytes(
      game.originalSize
    )}</strong></div><table class="compression-table"><thead><tr><th>Algorithm</th><th>After</th><th>Saved</th></tr></thead><tbody>${rH}</tbody></table></div></div>`;
  };

  const createCompactTableHTML = (games) => {
    const tH = `<thead><tr><th></th><th>Game</th><th>Original</th>${COMPRESSION_TYPES.map(
      (t) => `<th>${t}</th>`
    ).join("")}</tr></thead>`;
    const tB = games
      .map((g) => {
        const cC = COMPRESSION_TYPES.map((_, i) => {
          const r = g.resultsMap.get(i);
          return r
            ? `<td>${formatBytes(
                r.AfterBytes
              )}<br><span class="savings">(${r.savings.toFixed(
                1
              )}%)</span></td>`
            : `<td>-</td>`;
        }).join("");
        return `<tr><td><img class="compact-thumb" src="${getThumbUrl(
          g.SteamID
        )}" loading="lazy" onerror="this.style.display='none'"></td><td><div class="game-title-container"><a href="https://store.steampowered.com/app/${
          g.SteamID
        }" target="_blank" rel="noopener noreferrer" class="steam-link" title="View on Steam Store">
        <img src="icons/open-link.svg" alt="View on Steam Store">
        </a><h2 title="${g.GameName}">${
          g.GameName
        }</h2></div></td><td><strong>${formatBytes(
          g.originalSize
        )}</strong></td>${cC}</tr>`;
      })
      .join("");
    return `<div class="table-wrapper"><table class="compact-table">${tH}<tbody>${tB}</tbody></table></div>`;
  };

  const updateURLState = () => {
    const url = new URL(window.location);
    const searchTerm = searchInput.value.trim();
    if (searchTerm) {
      url.searchParams.set("search", searchTerm);
    } else {
      url.searchParams.delete("search");
    }
    if (currentPage > 1) {
      url.searchParams.set("page", currentPage);
    } else {
      url.searchParams.delete("page");
    }
    history.replaceState(null, "", url);
  };

  const setViewMode = (mode) => {
    localStorage.setItem("compactGuiViewMode", mode);
    viewGridBtn.classList.toggle("active", mode === "grid");
    viewListBtn.classList.toggle("active", mode === "list");
    viewCompactBtn.classList.toggle("active", mode === "compact");
    gameGrid.classList.toggle("list-view", mode === "list");
    gameGrid.classList.toggle("compact-view", mode === "compact");
    renderUI();
  };

  const applyInitialSettings = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sQ = urlParams.get("search");
    if (sQ) searchInput.value = sQ;
    const pQ = parseInt(urlParams.get("page"), 10);
    if (!isNaN(pQ) && pQ > 0) {
      currentPage = pQ;
    }
    const sV = localStorage.getItem("compactGuiViewMode") || "grid";
    viewGridBtn.classList.toggle("active", sV === "grid");
    viewListBtn.classList.toggle("active", sV === "list");
    viewCompactBtn.classList.toggle("active", sV === "compact");
    gameGrid.classList.toggle("list-view", sV === "list");
    gameGrid.classList.toggle("compact-view", sV === "compact");
  };

  const handleFilterChange = () => {
    currentPage = 1;
    updateURLState();
    renderUI();
  };
  const debouncedSearchHandler = debounce(() => {
    handleFilterChange();
  }, 300);

  searchInput.addEventListener("input", debouncedSearchHandler);
  sortSelect.addEventListener("change", handleFilterChange);
  showSelect.addEventListener("change", handleFilterChange);
  viewGridBtn.addEventListener("click", () => setViewMode("grid"));
  viewListBtn.addEventListener("click", () => setViewMode("list"));
  viewCompactBtn.addEventListener("click", () => setViewMode("compact"));
  refreshBtn.addEventListener("click", forceFetchData);

  applyInitialSettings();
  loadData();
});
