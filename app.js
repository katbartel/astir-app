(function () {
  const storageKey = "astir.v1";
  const tableWidthKey = "astir.applicationTableWidths";
  const atsHosts = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters"];
  const statusOptions = ["Applied", "1st stage", "2nd stage", "3rd stage", "Offer", "Hired", "Closed"];
  const pipelineStages = ["1st stage", "2nd stage", "3rd stage", "Offer", "Hired"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const activityOrder = ["apply", "net", "prep", "docs", "rest"];
  const numericLimits = {
    apply: { min: 1, max: 15, defaultValue: 5 },
    net: { min: 1, max: 10, defaultValue: 3 },
    rest: { min: 1, max: 4, defaultValue: 2 }
  };
  const icon = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18H9m9-2V11a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    bellOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18H9m9-2V11a6 6 0 0 0-9.8-4.6M6 8.8c-.1.7-.2 1.4-.2 2.2v5l-2 2h14.4"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9.5l5 5 5-5"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg>',
    kebab: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6.8" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="17.2" r="1.7"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5h4v4"/><path d="M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  const defaultWatchlist = [
    {
      id: "company-google",
      company: "Google",
      link: "https://careers.google.com",
      alerts_on: true,
      roles: [
        {
          id: "role-google-workflow",
          title: "Senior Product Manager, Workflow Systems and Customer Lifecycle Growth",
          url: "https://careers.google.com/jobs/results",
          first_seen: relativeIso(-24 * 12),
          is_live: true,
          locations: [{ city: "Berlin", mode: "Hybrid" }]
        },
        {
          id: "role-google-field-tools",
          title: "Product Manager, Field Tools and Operations Enablement",
          url: "https://careers.google.com/jobs/results",
          first_seen: relativeIso(-8),
          is_live: true,
          locations: [{ city: "Berlin", mode: "On-site" }]
        }
      ]
    },
    {
      id: "company-brightbyte",
      company: "Brightbyte Labs",
      link: "https://example.com/brightbyte-careers",
      alerts_on: true,
      roles: [
        {
          id: "role-brightbyte-developer-experience",
          title: "Staff Product Manager, Developer Experience",
          url: "https://example.com/brightbyte-careers/developer-experience",
          first_seen: relativeIso(-24 * 8),
          is_live: true,
          locations: [
            { city: "Berlin", mode: "Remote" },
            { city: "Amsterdam", mode: "Remote" },
            { city: "Copenhagen", mode: "Remote" },
            { city: "Helsinki", mode: "Remote" },
            { city: "London", mode: "Remote" },
            { city: "Oslo", mode: "Remote" },
            { city: "Stockholm", mode: "Remote" }
          ]
        }
      ]
    },
    {
      id: "company-meadowworks",
      company: "MeadowWorks",
      link: "https://example.com/meadowworks-careers",
      alerts_on: false,
      roles: [
        {
          id: "role-meadowworks-member-experience",
          title: "Product Lead, Member Experience",
          url: "https://example.com/meadowworks-careers/member-experience",
          first_seen: relativeIso(-24 * 20),
          is_live: true,
          locations: [{ city: "Stockholm", mode: "Hybrid" }]
        }
      ]
    }
  ];
  const activity = {
    apply: {
      name: "Applications",
      type: "numeric",
      deep: "--gold-deep"
    },
    net: {
      name: "Networking",
      type: "numeric",
      deep: "--net-deep"
    },
    rest: {
      name: "Rest",
      type: "numeric",
      deep: "--rest-deep"
    },
    prep: {
      name: "Prep",
      type: "binary",
      deep: "--prep-deep"
    },
    docs: {
      name: "Paperwork",
      type: "binary",
      deep: "--docs-deep"
    }
  };

  const state = loadState();
  const today = new Date();
  const todayKey = toDateKey(today);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const weekKey = toDateKey(weekStart);
  const els = {
    addApplication: document.getElementById("addApplication"),
    addCompany: document.getElementById("addCompany"),
    allApplicationsLink: document.getElementById("allApplicationsLink"),
    applicationsCount: document.getElementById("applicationsCount"),
    applicationsSearch: document.getElementById("applicationsSearch"),
    applicationsSearchToggle: document.getElementById("applicationsSearchToggle"),
    applicationsSearchWrap: document.getElementById("applicationsSearchWrap"),
    applicationsTable: document.getElementById("applicationsTable"),
    backdrop: document.getElementById("jobBackdrop"),
    cancelDeleteApplication: document.getElementById("cancelDeleteApplication"),
    cancelHeard: document.getElementById("cancelHeard"),
    cancelJob: document.getElementById("cancelJob"),
    cancelCompany: document.getElementById("cancelCompany"),
    cancelEditCompany: document.getElementById("cancelEditCompany"),
    cancelRemoveCompany: document.getElementById("cancelRemoveCompany"),
    companyBackdrop: document.getElementById("companyBackdrop"),
    companyForm: document.getElementById("companyForm"),
    companyPrefillNote: document.getElementById("companyPrefillNote"),
    confirmRemoveCompany: document.getElementById("confirmRemoveCompany"),
    confirmDeleteApplication: document.getElementById("confirmDeleteApplication"),
    deleteApplicationBackdrop: document.getElementById("deleteApplicationBackdrop"),
    deleteApplicationCopy: document.getElementById("deleteApplicationCopy"),
    demoActions: document.getElementById("demoActions"),
    demoApplicationActions: document.getElementById("demoApplicationActions"),
    demoHomeActions: document.getElementById("demoHomeActions"),
    demoPanel: document.getElementById("demoPanel"),
    demoPipelineActions: document.getElementById("demoPipelineActions"),
    editCompanyBackdrop: document.getElementById("editCompanyBackdrop"),
    editCompanyForm: document.getElementById("editCompanyForm"),
    editGoals: document.getElementById("editGoals"),
    cancelGoals: document.getElementById("cancelGoals"),
    finishGoals: document.getElementById("finishGoals"),
    form: document.getElementById("jobForm"),
    goalsBackdrop: document.getElementById("goalsBackdrop"),
    goalsBody: document.getElementById("goalsBody"),
    goalsSetupBody: document.getElementById("goalsSetupBody"),
    goalsSetupComplete: document.getElementById("goalsSetupComplete"),
    greeting: document.getElementById("greeting"),
    heardBack: document.getElementById("heardBack"),
    heardBackdrop: document.getElementById("heardBackdrop"),
    heardBackSection: document.getElementById("heardBackSection"),
    heardPickStep: document.getElementById("heardPickStep"),
    heardQuery: document.getElementById("heardQuery"),
    heardResults: document.getElementById("heardResults"),
    heardSelection: document.getElementById("heardSelection"),
    heardStageList: document.getElementById("heardStageList"),
    heardStageStep: document.getElementById("heardStageStep"),
    heardTitle: document.getElementById("heardTitle"),
    hiredBackdrop: document.getElementById("hiredBackdrop"),
    hiredCleanup: document.getElementById("hiredCleanup"),
    hiredCopy: document.getElementById("hiredCopy"),
    finishHired: document.getElementById("finishHired"),
    confettiCanvas: document.getElementById("confettiCanvas"),
    interactionScrim: document.getElementById("interactionScrim"),
    jobWatchHint: document.getElementById("jobWatchHint"),
    jobTitle: document.getElementById("jobTitle"),
    mini: document.getElementById("mini"),
    navLinks: document.querySelectorAll("[data-screen-link]"),
    pipelineActions: document.getElementById("pipelineActions"),
    pipelineAddApplication: document.getElementById("pipelineAddApplication"),
    pipelineHeardBack: document.getElementById("pipelineHeardBack"),
    pipelineList: document.getElementById("pipelineList"),
    pipelineMenuButton: document.getElementById("pipelineMenuButton"),
    pipelineMenuHint: document.getElementById("pipelineMenuHint"),
    pipelineMenuWrap: document.getElementById("pipelineMenuWrap"),
    removeCompanyBackdrop: document.getElementById("removeCompanyBackdrop"),
    removeCompanyTitle: document.getElementById("removeCompanyTitle"),
    screens: document.querySelectorAll("[data-screen]"),
    snackbar: document.getElementById("snackbar"),
    statusSelect: document.getElementById("statusSelect"),
    appliedDatePicker: document.getElementById("appliedDatePicker"),
    watchlistGroups: document.getElementById("watchlistGroups")
  };

  let snackTimer;
  let draftGoals = [];
  let activeGoalControlId = "";
  let demoPreset = "";
  let demoState = null;
  let modalReturnFocus = null;
  let goalsReturnFocus = null;
  let modalOrigin = "home";
  let activeCompanyId = "";
  let openMenuId = "";
  let openLayer = "";
  let quietOpen = false;
  let expandedPipelineId = "";
  let activeDeleteApplicationId = "";
  let applicationsSearchOpen = false;
  let autoFilledCompany = false;
  let userEditedCompany = false;
  let heardReturnFocus = null;
  let heardSelectedApplicationId = "";
  let activeHiredApplicationId = "";
  let hiredReturnFocus = null;
  let confettiFrame = 0;
  let applicationSort = { key: "company", dir: "asc" };
  let applicationTableWidths = loadTableWidths();
  let resizingColumn = null;
  let selectClampFrame = 0;
  let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let activeTooltipTarget = null;
  let tooltipLayer = null;
  let tooltipBubble = null;
  let tooltipArrow = null;

  function relativeIso(hours) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  function cloneWatchlist(companies) {
    return companies.map((company) => ({
      ...company,
      roles: (company.roles || []).map((role) => ({
        ...role,
        locations: (role.locations || []).map((location) => ({ ...location }))
      }))
    }));
  }

  function normalizeCompany(company) {
    return {
      id: company.id || `company-${Date.now()}`,
      company: company.company || "Company",
      link: company.link || "",
      alerts_on: company.alerts_on !== false,
      roles: (company.roles || []).map((role) => ({
        id: role.id || `role-${Date.now()}`,
        title: role.title || "Open role",
        url: role.url || company.link || "",
        first_seen: role.first_seen || (role.fresh ? relativeIso(-8) : relativeIso(-96)),
        is_live: role.is_live !== false,
        locations: Array.isArray(role.locations) && role.locations.length > 0 ? role.locations : parseLegacyLocation(role.location)
      }))
    };
  }

  function normalizeStatus(status) {
    if (status === "Rejected") return "Closed";
    return statusOptions.includes(status) ? status : "Applied";
  }

  function normalizeNote(note) {
    const normalizeBlock = (block) => {
      if (block && block.type === "check") {
        return { type: "check", checked: Boolean(block.checked), text: String(block.text || "") };
      }
      return { type: "text", text: String(block && block.text ? block.text : "") };
    };
    if (note && typeof note === "object") {
      if (Array.isArray(note.blocks)) {
        return {
          kind: "blocks",
          blocks: note.blocks.map(normalizeBlock).filter((block) => block.type === "check" || block.text)
        };
      }
      return {
        kind: note.kind || "plain",
        text: String(note.text || ""),
        blocks: note.text ? [{ type: "text", text: String(note.text || "") }] : []
      };
    }
    const text = String(note || "");
    return {
      kind: "blocks",
      text,
      blocks: text ? [{ type: "text", text }] : []
    };
  }

  function normalizeApplication(application) {
    const status = normalizeStatus(application.status);
    const stageChangedAt = application.stageChangedAt || application.updatedAt || application.appliedDate || "";
    return {
      ...application,
      id: application.id || `application-${Date.now()}`,
      postingId: application.postingId || "",
      companyId: application.companyId || "",
      link: application.link || "",
      company: application.company || "",
      role: application.role || "",
      appliedDate: application.appliedDate || "",
      status,
      stageChangedAt,
      note: normalizeNote(application.note)
    };
  }

  function shouldUseFreshWatchlistSeed(saved) {
    if (!Array.isArray(saved.watchlist)) return true;
    const ids = saved.watchlist.map((company) => company.id).sort().join(",");
    return ids === "company-acme,company-brightbyte,company-meadowworks" || ids === "company-brightbyte,company-google,company-meadowworks";
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey)) || {};
      return {
        applications: Array.isArray(saved.applications) ? saved.applications.map(normalizeApplication) : [],
        days: saved.days || {},
        weeks: saved.weeks || {},
        hasVisited: Boolean(saved.hasVisited),
        lastGoals: Array.isArray(saved.lastGoals) ? saved.lastGoals : [],
        watchlist: shouldUseFreshWatchlistSeed(saved) ? cloneWatchlist(defaultWatchlist) : saved.watchlist.map(normalizeCompany)
      };
    } catch {
      return { applications: [], days: {}, weeks: {}, hasVisited: false, lastGoals: [], watchlist: cloneWatchlist(defaultWatchlist) };
    }
  }

  function saveState() {
    if (!demoState) {
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }

  function loadTableWidths() {
    try {
      return JSON.parse(localStorage.getItem(tableWidthKey)) || {};
    } catch {
      return {};
    }
  }

  function saveTableWidths() {
    localStorage.setItem(tableWidthKey, JSON.stringify(applicationTableWidths));
  }

  function activeState() {
    return demoState || state;
  }

  function ensureWatchlist() {
    const active = activeState();
    if (!Array.isArray(active.watchlist)) {
      active.watchlist = cloneWatchlist(defaultWatchlist);
    }
    active.watchlist = active.watchlist.map(normalizeCompany);
    return active.watchlist;
  }

  function ensureWeek() {
    const active = activeState();
    if (!active.weeks[weekKey]) {
      active.weeks[weekKey] = {
        goals: [],
        manual: { net: 0, restAdjust: 0, prep: false, docs: false },
        activityDays: {}
      };
    }
    const week = active.weeks[weekKey];
    week.goals = Array.isArray(week.goals) ? week.goals : [];
    week.manual = week.manual || { net: 0, prep: false, docs: false };
    if (typeof week.manual.restAdjust !== "number") {
      week.manual.restAdjust = -Math.max(0, week.manual.restOffset || 0);
    }
    week.activityDays = week.activityDays || {};
    return week;
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function fromDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function sameDate(a, b) {
    return toDateKey(a) === toDateKey(b);
  }

  function formatDisplayDate(key) {
    if (key === todayKey) return "Today";
    const date = fromDateKey(key);
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  function addDays(date, count) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + count);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function startOfWeek(date) {
    const copy = new Date(date);
    const offset = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - offset);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function closeFloatingLayers() {
    if (!openLayer) return;
    openLayer = "";
    syncSurfaceState();
    renderSharedControls();
    renderPipeline();
    renderApplicationsPage();
  }

  function syncSurfaceState() {
    const modalOpen = Boolean(activeModal());
    const menuOpen = Boolean(openMenuId);
    const floatingOpen = Boolean(openLayer);
    document.body.classList.toggle("surface-open", modalOpen || menuOpen || floatingOpen);
    document.body.classList.toggle("menu-open", menuOpen);
    els.interactionScrim.hidden = !menuOpen;
    if (modalOpen || menuOpen || floatingOpen) {
      hideTooltip();
    }
  }

  function tooltipCopy(target) {
    return target ? target.dataset.infoTooltip || target.dataset.tooltip || "" : "";
  }

  function tooltipCandidate(target) {
    return target && target.closest("[data-info-tooltip], [data-tooltip]");
  }

  function tooltipNumber(token, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token);
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function tooltipMinLeft() {
    const rail = document.querySelector(".rail");
    const narrow = window.matchMedia("(max-width: 760px)").matches;
    const inset = tooltipNumber("--space-2", 8);
    if (!rail || narrow) return inset;
    return rail.getBoundingClientRect().right + inset;
  }

  function positionTooltip() {
    if (!activeTooltipTarget || !tooltipLayer || tooltipLayer.hidden) return;
    const targetRect = activeTooltipTarget.getBoundingClientRect();
    const inset = tooltipNumber("--space-2", 8);
    const shift = tooltipNumber("--tooltip-shift", 3);
    const minLeft = tooltipMinLeft();
    const maxAvailableWidth = Math.max(160, window.innerWidth - minLeft - inset);
    const maxLineWidth = tooltipNumber("--type-tooltip", 12) * 40;
    const noArrowInset = tooltipLayer.classList.contains("no-arrow") ? tooltipNumber("--space-1", 4) : 0;
    tooltipBubble.style.maxWidth = `${Math.min(maxLineWidth, maxAvailableWidth)}px`;

    const bubbleRect = tooltipBubble.getBoundingClientRect();
    const anchorCenter = targetRect.left + targetRect.width / 2;
    const maxLeft = Math.max(minLeft, window.innerWidth - bubbleRect.width - inset);
    const left = Math.min(Math.max(anchorCenter - bubbleRect.width / 2, minLeft), maxLeft);
    const belowTop = targetRect.bottom + shift + inset - noArrowInset;
    const aboveTop = targetRect.top - bubbleRect.height - shift - inset + noArrowInset;
    const useAbove = belowTop + bubbleRect.height > window.innerHeight - inset && aboveTop >= inset;

    tooltipLayer.style.left = `${left}px`;
    tooltipLayer.style.top = `${useAbove ? aboveTop : belowTop}px`;
    tooltipLayer.classList.toggle("above", useAbove);
    tooltipArrow.style.left = `${anchorCenter - left}px`;
  }

  function showTooltip(target) {
    if (document.body.classList.contains("surface-open")) return;
    const copy = tooltipCopy(target);
    if (!copy) return;
    activeTooltipTarget = target;
    tooltipBubble.textContent = copy;
    tooltipLayer.classList.toggle("no-arrow", !target.dataset.infoTooltip);
    tooltipLayer.hidden = false;
    positionTooltip();
  }

  function hideTooltip() {
    activeTooltipTarget = null;
    if (tooltipLayer) {
      tooltipLayer.hidden = true;
    }
  }

  function setupTooltips() {
    tooltipLayer = document.createElement("div");
    tooltipLayer.className = "tooltip-layer";
    tooltipLayer.hidden = true;
    tooltipLayer.innerHTML = '<span class="tooltip-arrow" aria-hidden="true"></span><span class="tooltip-bubble"></span>';
    document.body.appendChild(tooltipLayer);
    tooltipArrow = tooltipLayer.querySelector(".tooltip-arrow");
    tooltipBubble = tooltipLayer.querySelector(".tooltip-bubble");

    document.addEventListener("pointerover", (event) => {
      const target = tooltipCandidate(event.target);
      if (target) showTooltip(target);
    });
    document.addEventListener("pointerout", (event) => {
      if (!activeTooltipTarget || activeTooltipTarget.contains(event.relatedTarget)) return;
      hideTooltip();
    });
    document.addEventListener("focusin", (event) => {
      const target = tooltipCandidate(event.target);
      if (target) showTooltip(target);
    });
    document.addEventListener("focusout", (event) => {
      if (!activeTooltipTarget || activeTooltipTarget.contains(event.relatedTarget)) return;
      hideTooltip();
    });
    window.addEventListener("resize", positionTooltip);
    window.addEventListener("scroll", positionTooltip, true);
  }

  function renderSharedControls() {
    renderStatusSelect();
    renderDatePicker();
    scheduleSelectClamp();
  }

  function selectOptionsHtml(options, value, dataAttributes) {
    return options.map((option) => {
      const separator = option === "1st stage" || option === "Closed" ? '<div class="select-separator" aria-hidden="true"></div>' : "";
      return `
        ${separator}
        <button class="select-option ${option === value ? "selected" : ""}" type="button" role="option" aria-selected="${option === value}" ${dataAttributes(option)}>
          <span>${escapeText(option)}</span>
          <span class="select-check" aria-hidden="true">${option === value ? icon.check : ""}</span>
        </button>`;
    }).join("");
  }

  function renderStatusSelect() {
    const value = els.form.elements.status.value || "Applied";
    const open = openLayer === "status";
    const selectedIndex = Math.max(0, statusOptions.indexOf(value));
    els.statusSelect.innerHTML = `
      <button class="select-trigger ${open ? "open" : ""}" type="button" data-toggle-status aria-haspopup="listbox" aria-expanded="${open}">
        <span>${escapeText(value)}</span>
        <span class="select-chev" aria-hidden="true">${icon.chevronDown}</span>
      </button>
      <div class="select-menu ${open ? "open" : ""}" role="listbox" style="--selected-index: ${selectedIndex}">
        ${selectOptionsHtml(statusOptions, value, (option) => `data-status-option="${escapeText(option)}"`)}
      </div>`;
  }

  function tokenPixels(name) {
    return Number(getComputedStyle(document.documentElement).getPropertyValue(name).replace("px", "")) || 0;
  }

  function clampSelectMenu(menu) {
    const shell = menu.closest(".select-shell");
    const trigger = shell && shell.querySelector(".select-trigger");
    const selected = menu.querySelector(".select-option.selected");
    if (!shell || !trigger || !selected) return;

    menu.style.position = "fixed";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.maxHeight = "";
    menu.style.minWidth = "";
    menu.scrollTop = 0;

    const inset = tokenPixels("--space-2");
    const triggerRect = trigger.getBoundingClientRect();
    const selectedOffset = selected.offsetTop;
    const triggerInset = tokenPixels("--space-2");
    const availableHeight = window.innerHeight - inset * 2;
    let nextTop = triggerRect.top - selectedOffset - triggerInset;
    let nextLeft = triggerRect.left;

    menu.style.left = `${nextLeft}px`;
    menu.style.minWidth = `${triggerRect.width}px`;
    menu.style.top = `${nextTop}px`;

    let rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - inset) {
      nextLeft -= rect.right - (window.innerWidth - inset);
      menu.style.left = `${Math.max(inset, nextLeft)}px`;
      rect = menu.getBoundingClientRect();
    }
    if (rect.height > availableHeight) {
      menu.style.maxHeight = `${availableHeight}px`;
      nextTop = inset;
      menu.style.top = `${nextTop}px`;
      selected.scrollIntoView({ block: "nearest" });
      return;
    }

    if (rect.top < inset) {
      nextTop += inset - rect.top;
    }
    rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - inset) {
      nextTop -= rect.bottom - (window.innerHeight - inset);
    }
    menu.style.top = `${nextTop}px`;
  }

  function scheduleSelectClamp() {
    window.cancelAnimationFrame(selectClampFrame);
    selectClampFrame = window.requestAnimationFrame(() => {
      document.querySelectorAll(".select-menu.open").forEach(clampSelectMenu);
    });
  }

  function calendarCells(monthDate, selectedKey) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = addDays(first, startOffset * -1);
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = addDays(start, index);
      const key = toDateKey(date);
      const muted = date.getMonth() !== monthDate.getMonth() ? " muted-day" : "";
      const selected = key === selectedKey ? " selected" : "";
      const now = sameDate(date, today) ? " today" : "";
      cells.push(`<button class="day-cell${muted}${selected}${now}" type="button" data-date-option="${key}">${date.getDate()}</button>`);
    }
    return cells.join("");
  }

  function renderDatePicker() {
    const selectedKey = els.form.elements.appliedDate.value || todayKey;
    const open = openLayer === "date";
    els.appliedDatePicker.innerHTML = `
      <button class="date-trigger ${open ? "open" : ""}" type="button" data-toggle-date aria-haspopup="dialog" aria-expanded="${open}">
        <span>${formatDisplayDate(selectedKey)}</span>
        <span class="date-icon" aria-hidden="true">${icon.calendar}</span>
      </button>
      <div class="calendar-popover ${open ? "open" : ""}" role="dialog" aria-label="Choose applied date">
        <div class="calendar-head">
          <button class="calendar-nav" type="button" data-calendar-prev aria-label="Previous month">‹</button>
          <div class="calendar-title">${monthNames[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}</div>
          <button class="calendar-nav" type="button" data-calendar-next aria-label="Next month">›</button>
        </div>
        <div class="weekdays" aria-hidden="true">
          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
        </div>
        <div class="calendar-grid">${calendarCells(calendarMonth, selectedKey)}</div>
      </div>`;
  }

  function setGreeting() {
    els.greeting.textContent = state.hasVisited ? "Welcome back, Alex" : "Welcome, Alex";
    if (!state.hasVisited) {
      state.hasVisited = true;
      saveState();
    }
  }

  function isInCurrentWeek(dateKey) {
    return dateKey >= toDateKey(weekStart) && dateKey <= toDateKey(weekEnd);
  }

  function applicationsThisWeek() {
    return activeState().applications.filter((application) => isInCurrentWeek(application.appliedDate || todayKey));
  }

  function isPostingApplied(role) {
    return activeState().applications.some((application) => application.postingId === role.id || (application.company === role.company && application.role === role.title));
  }

  function escapeText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function dayHasApplication(dateKey) {
    return activeState().applications.some((application) => (application.appliedDate || todayKey) === dateKey);
  }

  function dayHasManualActivity(dateKey) {
    const day = ensureWeek().activityDays[dateKey];
    return Boolean(day && Object.values(day).some(Boolean));
  }

  function inferredRestDays() {
    let count = 0;
    for (let date = new Date(weekStart); date < today && date <= weekEnd; date = addDays(date, 1)) {
      const key = toDateKey(date);
      if (key !== todayKey && !dayHasApplication(key) && !dayHasManualActivity(key)) {
        count += 1;
      }
    }
    return count;
  }

  function progressFor(id) {
    const week = ensureWeek();
    if (id === "apply") return applicationsThisWeek().length;
    if (id === "net") return week.manual.net || 0;
    if (id === "rest") return Math.max(0, inferredRestDays() + (week.manual.restAdjust || 0));
    if (id === "prep") return week.manual.prep ? 1 : 0;
    if (id === "docs") return week.manual.docs ? 1 : 0;
    return 0;
  }

  function goalTarget(goal) {
    return activity[goal.id].type === "binary" ? 1 : goal.target;
  }

  function isGoalMet(goal) {
    return progressFor(goal.id) >= goalTarget(goal);
  }

  function pulseMini() {
    els.mini.classList.remove("pulse");
    void els.mini.offsetWidth;
    els.mini.classList.add("pulse");
  }

  function showSnack(message, options = {}) {
    window.clearTimeout(snackTimer);
    els.snackbar.innerHTML = "";
    if (options.linkText && message.includes(options.linkText)) {
      const [before, after] = message.split(options.linkText);
      const link = document.createElement("a");
      link.href = options.href || "#";
      link.textContent = options.linkText;
      els.snackbar.append(document.createTextNode(before), link, document.createTextNode(after));
    } else {
      els.snackbar.textContent = message;
    }
    els.snackbar.hidden = false;
    snackTimer = window.setTimeout(() => {
      els.snackbar.hidden = true;
    }, options.duration || 3500);
  }

  function getStrokeOffset(progress, target) {
    const length = 126;
    const fraction = target === 0 ? 0 : Math.min(progress, target) / target;
    return length - length * fraction;
  }

  function gaugeSvg(goal, progress) {
    const info = activity[goal.id];
    const target = goalTarget(goal);
    const offset = getStrokeOffset(progress, target);
    const center = `<text class="gauge-ratio" x="48" y="41" text-anchor="middle">${progress}/${target}</text>`;

    return `
      <svg class="goal-gauge" viewBox="0 0 96 56" aria-hidden="true" style="--goal-color: var(${info.deep}); --goal-offset: ${offset}">
        <path class="gauge-track" pathLength="126" d="M8 48a40 40 0 0 1 80 0"></path>
        <path class="gauge-sweep" pathLength="126" d="M8 48a40 40 0 0 1 80 0"></path>
        ${center}
      </svg>`;
  }

  function renderGoalTile(goal) {
    const info = activity[goal.id];
    const progress = progressFor(goal.id);
    const met = isGoalMet(goal);
    const metClass = met ? " met" : "";
    const canEdit = goal.id !== "apply";
    const activeControlClass = activeGoalControlId === goal.id ? " control-active" : "";

    return `
      <article class="goal-tile ${goal.id}${metClass}${canEdit ? " editable" : ""}${activeControlClass}" data-goal="${goal.id}">
        ${gaugeSvg(goal, progress)}
        <div class="goal-title-row">
          <div class="goal-title">${info.name}</div>
          ${infoButton(goal.id)}
        </div>
        ${canEdit ? goalStepper(goal.id, info.name) : ""}
      </article>`;
  }

  function infoButton(id, disabled = false) {
    if (disabled) {
      return `<span class="goal-info disabled-info">${icon.info}</span>`;
    }
    const copyById = {
      apply: "We automatically update your weekly application count whenever you log an application with us.",
      net: "One conversation, one count. Log it when it happens.",
      rest: "When you don't show up here, we will just automatically add it as a rest day."
    };
    const copy = copyById[id] || "";
    if (!copy) return `<span class="goal-info disabled-info">${icon.info}</span>`;
    return `<span class="goal-info" data-info-tooltip="${copy}">${icon.info}</span>`;
  }

  function goalStepper(id, name) {
    return `
      <div class="goal-stepper" aria-hidden="false">
        <button class="goal-step minus" type="button" data-decrement-goal="${id}" aria-label="Remove ${name} entry">${icon.minus}</button>
        <button class="goal-step plus" type="button" data-increment-goal="${id}" aria-label="Add ${name} entry">${icon.plus}</button>
      </div>`;
  }

  function placeholderTile(id) {
    return `
      <article class="goal-tile ghost-tile" aria-disabled="true">
        <svg class="goal-gauge" viewBox="0 0 96 56" aria-hidden="true" style="--goal-color: var(${activity[id].deep}); --goal-offset: 126">
          <path class="gauge-track" pathLength="126" d="M8 48a40 40 0 0 1 80 0"></path>
          <path class="gauge-sweep" pathLength="126" d="M8 48a40 40 0 0 1 80 0"></path>
        </svg>
        <div class="goal-title-row">
          <div class="goal-title">${activity[id].name}</div>
          ${infoButton(id, true)}
        </div>
      </article>`;
  }

  function renderUnwritten() {
    els.editGoals.hidden = false;
    els.goalsBody.innerHTML = `
      <div class="unwritten-line">Set up your goals for this week</div>
      <div class="goal-grid ghost-grid">${activityOrder.map(placeholderTile).join("")}</div>`;
  }

  function renderActiveGoals() {
    const goals = ensureWeek().goals;
    const selectedById = new Map(goals.map((goal) => [goal.id, goal]));
    const allMet = goals.length > 0 && goals.every(isGoalMet);
    const support = allMet ? "You did it. Take a moment to savor it." : "You're doing great, keep it up.";
    els.editGoals.hidden = false;
    els.goalsBody.innerHTML = `
      <div class="goals-support">${support}</div>
      <div class="goal-grid">${activityOrder.map((id) => {
        const goal = selectedById.get(id);
        return goal ? renderGoalTile(goal) : placeholderTile(id);
      }).join("")}</div>`;
  }

  function cloneGoals(goals) {
    return goals.map((goal) => ({ id: goal.id, target: goal.target }));
  }

  function startSetup() {
    goalsReturnFocus = els.editGoals;
    draftGoals = cloneGoals(ensureWeek().goals);
    renderSetup();
    els.goalsBackdrop.hidden = false;
    syncSurfaceState();
    const firstRow = els.goalsSetupBody.querySelector(".setup-row");
    focusSafely(firstRow, els.finishGoals);
  }

  function goalFromId(id) {
    return {
      id,
      target: activity[id].type === "numeric" ? numericLimits[id].defaultValue : 1
    };
  }

  function draftGoal(id) {
    return draftGoals.find((goal) => goal.id === id);
  }

  function toggleDraft(id) {
    const existing = draftGoal(id);
    if (existing) {
      draftGoals = draftGoals.filter((goal) => goal.id !== id);
    } else {
      draftGoals.push(goalFromId(id));
      draftGoals.sort((a, b) => activityOrder.indexOf(a.id) - activityOrder.indexOf(b.id));
    }
    renderSetup();
  }

  function adjustDraft(id, delta) {
    const goal = draftGoal(id);
    if (!goal) return;
    const limits = numericLimits[id];
    goal.target = Math.max(limits.min, Math.min(limits.max, goal.target + delta));
    renderSetup();
  }

  function closeGoalsModal() {
    els.goalsBackdrop.hidden = true;
    draftGoals = [];
    focusSafely(goalsReturnFocus, els.editGoals);
    goalsReturnFocus = null;
    syncSurfaceState();
  }

  function finishSetup() {
    const week = ensureWeek();
    week.goals = cloneGoals(draftGoals);
    if (week.goals.length > 0) {
      activeState().lastGoals = cloneGoals(week.goals);
    }
    els.goalsBackdrop.hidden = true;
    focusSafely(goalsReturnFocus, els.editGoals);
    goalsReturnFocus = null;
    saveState();
    render();
    syncSurfaceState();
  }

  function renderSetupRow(id) {
    const info = activity[id];
    const goal = draftGoal(id);
    const selected = Boolean(goal);
    const selectedClass = selected ? " selected" : "";
    const label = info.name;
    const stepper = selected && info.type === "numeric"
      ? `<div class="setup-stepper">
          <button class="setup-round" type="button" data-draft-adjust="${id}" data-delta="-1" aria-label="Decrease ${info.name}">${icon.minus}</button>
          <span>${goal.target}</span>
          <button class="setup-round" type="button" data-draft-adjust="${id}" data-delta="1" aria-label="Increase ${info.name}">${icon.plus}</button>
        </div>`
      : "";

    return `
      <div class="setup-row${selectedClass}" data-draft-toggle="${id}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}">
        <span>${label}</span>
        ${stepper}
      </div>`;
  }

  function renderSetup() {
    const allSelected = draftGoals.length === activityOrder.length;
    els.goalsSetupBody.innerHTML = activityOrder.map(renderSetupRow).join("");
    els.goalsSetupComplete.hidden = !allSelected;
  }

  function renderGoalsCard() {
    if (ensureWeek().goals.length === 0) {
      renderUnwritten();
    } else {
      renderActiveGoals();
    }
  }

  function render() {
    renderGoalsCard();
    renderWatchlist();
    renderPipeline();
    renderApplicationsPage();
    els.heardBackSection.hidden = activeState().applications.length === 0;
  }

  function openRoles(company) {
    return company.roles
      .map((role) => ({ ...role, company: company.company }))
      .filter((role) => role.is_live !== false && !isPostingApplied(role));
  }

  function newestTime(company) {
    const roles = openRoles(company);
    if (roles.length === 0) return 0;
    return Math.max(...roles.map((role) => new Date(role.first_seen).getTime() || 0));
  }

  function isFresh(role) {
    return Date.now() - new Date(role.first_seen).getTime() < 48 * 60 * 60 * 1000;
  }

  function parseLegacyLocation(location) {
    if (!location) return [{ city: "Berlin", mode: "Remote" }];
    const parts = String(location).split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return [{ city: parts[0], mode: normalizeMode(parts[1]) }];
    }
    return [{ city: parts[0] || "Berlin", mode: "Remote" }];
  }

  function normalizeMode(mode) {
    const value = String(mode || "Remote").toLowerCase();
    if (value.includes("site")) return "On-site";
    if (value.includes("hybrid")) return "Hybrid";
    return "Remote";
  }

  function locationLabel(role) {
    const locations = role.locations || [];
    const first = locations[0] || { city: "Berlin", mode: "Remote" };
    const city = escapeText(first.city);
    const mode = escapeText(normalizeMode(first.mode));
    if (locations.length <= 1) {
      return `${city}, ${mode}`;
    }
    return `${city} <span class="more-cities">+${locations.length - 1}</span>, ${mode}`;
  }

  function roleRow(company, role) {
    const fresh = isFresh(role)
      ? '<span class="role-new-chip">New</span>'
      : "";
    return `
      <div class="watch-role" data-role-id="${escapeText(role.id)}">
        <div class="role-main">
          <div class="role-title-line">
            <span class="role-name" title="${escapeText(role.title)}">${escapeText(role.title)}</span>
            <button class="round-icon small" type="button" data-open-role="${escapeText(role.url)}" aria-label="Open posting" data-tooltip="Open posting">${icon.open}</button>
            ${fresh}
          </div>
          <div class="role-loc">${locationLabel(role)}</div>
        </div>
        <button class="round-icon add-application" type="button" data-apply-role="${escapeText(role.id)}" data-company-id="${escapeText(company.id)}" aria-label="Log application" data-tooltip="Log application">${icon.plus}</button>
      </div>`;
  }

  function companyActions(company) {
    const bellLabel = company.alerts_on ? "Alerts on" : "Alerts off";
    const bellClass = company.alerts_on ? "on" : "off";
    const menuOpen = openMenuId === company.id ? " open" : "";
    return `
      <button class="round-icon bell ${bellClass}" type="button" data-toggle-alerts="${escapeText(company.id)}" aria-label="${bellLabel}" data-tooltip="Alerts">${company.alerts_on ? icon.bell : icon.bellOff}</button>
      <span class="company-spacer"></span>
      <span class="menu-wrap${menuOpen}">
        <button class="round-icon kebab" type="button" data-company-menu="${escapeText(company.id)}" aria-label="More" data-tooltip="More">${icon.kebab}</button>
        <span class="watch-menu">
          <button type="button" data-edit-company="${escapeText(company.id)}">Edit</button>
          <button type="button" data-remove-company="${escapeText(company.id)}">Remove</button>
        </span>
      </span>`;
  }

  function companyCard(company) {
    const rows = openRoles(company).map((role) => roleRow(company, role)).join("");
    return `
      <article class="watch-group" data-company-id="${escapeText(company.id)}">
        <div class="watch-head">
          <div class="company-name">${escapeText(company.company)}</div>
          ${companyActions(company)}
        </div>
        ${rows}
      </article>`;
  }

  function quietRow(company) {
    return `
      <div class="quiet-row" data-company-id="${escapeText(company.id)}">
        <div class="company-name">${escapeText(company.company)}</div>
        ${companyActions(company)}
      </div>`;
  }

  function renderWatchlist() {
    const companies = ensureWatchlist();
    if (companies.length === 0) {
      els.watchlistGroups.innerHTML = '<div class="watch-invite">Add a company you would fight for. We will watch its board for you.</div>';
      return;
    }

    const liveCompanies = companies
      .filter((company) => openRoles(company).length > 0)
      .sort((a, b) => newestTime(b) - newestTime(a));
    const quietCompanies = companies.filter((company) => openRoles(company).length === 0);
    const shouldOpenQuiet = quietOpen || liveCompanies.length === 0;
    const quiet = quietCompanies.length > 0
      ? `
        <section class="quiet-section ${shouldOpenQuiet ? "open" : ""}">
          <button class="quiet-toggle" type="button" data-toggle-quiet>
            <span class="quiet-chevron">${icon.chevron}</span>
            <span>Nothing open elsewhere right now</span>
          </button>
          <div class="quiet-list" ${shouldOpenQuiet ? "" : "hidden"}>
            ${quietCompanies.map(quietRow).join("")}
          </div>
        </section>`
      : "";

    els.watchlistGroups.innerHTML = `
      <div class="watch-card-list">${liveCompanies.map(companyCard).join("")}</div>
      ${quiet}`;
  }

  function applicationNoteText(application) {
    const note = normalizeNote(application.note);
    if (Array.isArray(note.blocks) && note.blocks.length > 0) {
      return note.blocks.map((block) => block.text || "").join("");
    }
    return note.text || "";
  }

  function noteHtml(application) {
    const note = normalizeNote(application.note);
    const blocks = Array.isArray(note.blocks) ? note.blocks : [];
    if (blocks.length === 0) return "";
    return blocks.map((block) => {
      if (block.type === "check") {
        return `<span class="note-check" contenteditable="false" data-note-check="${block.checked ? "true" : "false"}" role="checkbox" aria-checked="${block.checked ? "true" : "false"}" tabindex="0"><span class="note-box" aria-hidden="true">${block.checked ? icon.check : ""}</span></span>`;
      }
      return `<span class="note-text">${escapeText(block.text)}</span>`;
    }).join("");
  }

  function noteBlocksFromText(text) {
    const parts = String(text || "").split("[]");
    const blocks = [];
    parts.forEach((part, index) => {
      if (part) blocks.push({ type: "text", text: part });
      if (index < parts.length - 1) blocks.push({ type: "check", checked: false, text: "" });
    });
    return blocks;
  }

  function serializeNoteField(field) {
    const blocks = [];
    field.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) blocks.push({ type: "text", text: node.textContent });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains("note-check")) {
        blocks.push({ type: "check", checked: node.dataset.noteCheck === "true", text: "" });
        return;
      }
      if (node.textContent) {
        blocks.push({ type: "text", text: node.textContent });
      }
    });
    return {
      kind: "blocks",
      blocks: blocks.filter((block) => block.type === "check" || block.text)
    };
  }

  function renderNoteField(application) {
    return `<div class="note-field" contenteditable="true" role="textbox" aria-label="Application note" data-note-application="${escapeText(application.id)}" data-placeholder="Add a note">${noteHtml(application)}</div>`;
  }

  function isPipelineApplication(application) {
    return pipelineStages.includes(normalizeStatus(application.status));
  }

  function stageRank(status) {
    return statusOptions.indexOf(normalizeStatus(status));
  }

  function pipelineApplications() {
    return activeState().applications
      .filter(isPipelineApplication)
      .sort((a, b) => {
        const bTime = new Date(b.stageChangedAt || b.appliedDate || 0).getTime() || 0;
        const aTime = new Date(a.stageChangedAt || a.appliedDate || 0).getTime() || 0;
        return bTime - aTime;
      });
  }

  function findApplication(applicationId) {
    return activeState().applications.find((application) => application.id === applicationId) || null;
  }

  function postingForApplication(application) {
    if (!application.postingId) return null;
    for (const company of ensureWatchlist()) {
      const role = company.roles.find((item) => item.id === application.postingId);
      if (role) return role;
    }
    return null;
  }

  function plainDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  function tableValue(value) {
    return value ? escapeText(value) : "—";
  }

  function stageSelect(application, context) {
    const value = normalizeStatus(application.status);
    const layerId = `stage:${context}:${application.id}`;
    const open = openLayer === layerId;
    const selectedIndex = Math.max(0, statusOptions.indexOf(value));
    return `
      <div class="select-shell stage-select" data-stage-shell="${escapeText(application.id)}">
        <button class="select-trigger ${open ? "open" : ""}" type="button" data-toggle-stage="${escapeText(application.id)}" data-stage-context="${context}" aria-haspopup="listbox" aria-expanded="${open}">
          <span>${escapeText(value)}</span>
          <span class="select-chev" aria-hidden="true">${icon.chevronDown}</span>
        </button>
        <div class="select-menu ${open ? "open" : ""}" role="listbox" style="--selected-index: ${selectedIndex}">
          ${selectOptionsHtml(statusOptions, value, (option) => `data-stage-option="${escapeText(option)}" data-stage-application="${escapeText(application.id)}" data-stage-context="${context}"`)}
        </div>
      </div>`;
  }

  function applicationMeta(application) {
    const posting = postingForApplication(application);
    const firstLocation = posting && posting.locations && posting.locations[0] ? posting.locations[0] : null;
    const parts = [];
    if (posting && posting.first_seen) parts.push(`Posted: <span>${escapeText(plainDate(posting.first_seen))}</span>`);
    parts.push(`Applied: <span>${escapeText(plainDate(application.appliedDate) || "Unknown")}</span>`);
    if (firstLocation) {
      parts.push(`Location: <span>${escapeText(firstLocation.city || "Unknown")}</span>`);
      parts.push(`Type: <span>${escapeText(normalizeMode(firstLocation.mode))}</span>`);
    }
    return parts.join(" · ");
  }

  function pipelineCard(application) {
    const expanded = expandedPipelineId === application.id;
    const posting = postingForApplication(application);
    const openUrl = application.link || (posting && posting.url) || "";
    return `
      <article class="pipeline-card ${expanded ? "expanded" : ""}" data-pipeline-card="${escapeText(application.id)}" tabindex="0" aria-expanded="${expanded ? "true" : "false"}" aria-label="${escapeText(application.company)}, ${escapeText(application.role)}">
        <div class="pipeline-card-row">
          <div class="pipeline-card-main">
            <span class="pipeline-company">${escapeText(application.company)}</span>
            <span class="dot-sep" aria-hidden="true"></span>
            <span class="pipeline-role" title="${escapeText(application.role)}">${escapeText(application.role)}</span>
            ${openUrl ? `<button class="round-icon small pipeline-open" type="button" data-open-role="${escapeText(openUrl)}" aria-label="Open posting" data-tooltip="Open posting">${icon.open}</button>` : ""}
          </div>
          ${stageSelect(application, "pipeline")}
        </div>
        <div class="pipeline-details" ${expanded ? "" : "hidden"}>
          <div class="pipeline-meta">${applicationMeta(application)}</div>
          ${renderNoteField(application)}
        </div>
      </article>`;
  }

  function pipelineEmpty() {
    return `
      <div class="pipeline-empty">
        <div class="sleepy-orb" aria-hidden="true">
          <span class="sleepy-core"></span>
          <span class="sleepy-z z-one">z</span>
          <span class="sleepy-z z-two">z</span>
          <span class="sleepy-z z-three">z</span>
        </div>
        <p>Nothing in motion for now. When you hear back, it will show here. In the meantime, add companies to your <a href="#watchlist">Watchlist</a> and log applications as you send them.</p>
        <div class="pipeline-empty-actions">
          <button class="btn ghost" type="button" data-empty-add-application>Log application</button>
          <button class="btn ghost" type="button" data-empty-heard-back>Move to pipeline</button>
        </div>
      </div>`;
  }

  function renderPipeline() {
    const applications = pipelineApplications();
    const empty = applications.length === 0;
    els.pipelineActions.hidden = empty;
    els.pipelineMenuWrap.classList.toggle("open", openMenuId === "pipeline");
    els.pipelineMenuHint.textContent = empty ? "This is where your applications will live" : "View everything you have applied to.";
    els.allApplicationsLink.disabled = empty;
    els.pipelineList.innerHTML = empty ? pipelineEmpty() : applications.map(pipelineCard).join("");
    scheduleSelectClamp();
  }

  function togglePipelineCard(card, restoreFocus = false) {
    const cardId = card.dataset.pipelineCard;
    expandedPipelineId = expandedPipelineId === cardId ? "" : cardId;
    renderPipeline();
    if (!restoreFocus) return;
    const nextCard = Array.from(els.pipelineList.querySelectorAll("[data-pipeline-card]")).find((item) => item.dataset.pipelineCard === cardId);
    focusSafely(nextCard);
  }

  function applicationCountText(count) {
    return count === 1 ? "1 application" : `${count} applications`;
  }

  function filteredApplications() {
    const query = (els.applicationsSearch.value || "").trim().toLowerCase();
    return activeState().applications
      .filter((application) => {
        if (!query) return true;
        return `${application.company || ""} ${application.role || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        let result = 0;
        if (applicationSort.key === "stage") {
          result = stageRank(a.status) - stageRank(b.status);
        } else if (applicationSort.key === "role") {
          result = String(a.role || "").localeCompare(String(b.role || ""));
        } else {
          result = String(a.company || "").localeCompare(String(b.company || ""));
        }
        if (result === 0) {
          result = String(a.company || "").localeCompare(String(b.company || "")) || String(a.role || "").localeCompare(String(b.role || ""));
        }
        return applicationSort.dir === "desc" ? result * -1 : result;
      });
  }

  function applicationColumns() {
    return [
      { key: "company", label: "Company", sortable: true },
      { key: "role", label: "Role", sortable: true },
      { key: "stage", label: "Stage", sortable: true },
      { key: "location", label: "Location" },
      { key: "type", label: "Type" },
      { key: "posted", label: "Posted" },
      { key: "applied", label: "Applied" },
      { key: "menu", label: "" }
    ];
  }

  function columnStyle(columnKey) {
    if (columnKey === "menu") {
      return ' style="width: calc(var(--menu-trigger) + var(--space-4))"';
    }
    const width = applicationTableWidths[columnKey];
    return width ? ` style="width: ${Number(width)}px"` : "";
  }

  function sortIndicator(column) {
    if (!column.sortable || applicationSort.key !== column.key) return "";
    const direction = applicationSort.dir === "desc" ? " desc" : " asc";
    return `<span class="sort-indicator${direction}" aria-hidden="true">${icon.chevronDown}</span>`;
  }

  function tableHeader(column, index) {
    const sortable = column.sortable ? " sortable" : "";
    const active = applicationSort.key === column.key ? " active-sort" : "";
    const label = column.label ? `<span>${column.label}</span>${sortIndicator(column)}` : "";
    const button = column.sortable
      ? `<button type="button" data-sort-applications="${column.key}">${label}</button>`
      : `<span>${label}</span>`;
    const handle = column.key !== "menu" ? `<span class="column-resizer" data-resize-column="${column.key}" data-column-index="${index}" aria-hidden="true"></span>` : "";
    return `<th class="${sortable}${active}" data-column="${column.key}"${columnStyle(column.key)}>${button}${handle}</th>`;
  }

  function applicationTableRow(application) {
    const posting = postingForApplication(application);
    const firstLocation = posting && posting.locations && posting.locations[0] ? posting.locations[0] : null;
    const openUrl = application.link || (posting && posting.url) || "";
    const menuOpen = openMenuId === `application:${application.id}` ? " open" : "";
    return `
      <tr>
        <td>${tableValue(application.company)}</td>
        <td>
          <span class="table-role">
            <span>${tableValue(application.role)}</span>
            ${openUrl ? `<button class="round-icon small" type="button" data-open-role="${escapeText(openUrl)}" aria-label="Open posting" data-tooltip="Open posting">${icon.open}</button>` : ""}
          </span>
        </td>
        <td>${stageSelect(application, "applications")}</td>
        <td>${tableValue(firstLocation && firstLocation.city)}</td>
        <td>${tableValue(firstLocation && normalizeMode(firstLocation.mode))}</td>
        <td>${tableValue(posting && plainDate(posting.first_seen))}</td>
        <td>${tableValue(plainDate(application.appliedDate))}</td>
        <td>
          <span class="menu-wrap${menuOpen}">
            <button class="round-icon kebab" type="button" data-application-menu="${escapeText(application.id)}" aria-label="More" data-tooltip="More">${icon.kebab}</button>
            <span class="watch-menu application-menu">
              <button type="button" data-edit-application="${escapeText(application.id)}">Edit</button>
              <button type="button" data-delete-application="${escapeText(application.id)}">Delete</button>
            </span>
          </span>
        </td>
      </tr>`;
  }

  function renderApplicationsPage() {
    const all = activeState().applications;
    const applications = filteredApplications();
    const columns = applicationColumns();
    els.applicationsCount.textContent = applicationCountText(all.length);
    els.applicationsSearch.hidden = false;
    els.applicationsSearch.disabled = !applicationsSearchOpen;
    els.applicationsSearch.setAttribute("aria-hidden", applicationsSearchOpen ? "false" : "true");
    els.applicationsSearchWrap.classList.toggle("open", applicationsSearchOpen);
    els.applicationsTable.innerHTML = `
      <table class="applications-table">
        <colgroup>
          ${columns.map((column) => `<col data-col="${column.key}"${columnStyle(column.key)}>`).join("")}
        </colgroup>
        <thead>
          <tr>
            ${columns.map(tableHeader).join("")}
          </tr>
        </thead>
        <tbody>
          ${applications.length > 0 ? applications.map(applicationTableRow).join("") : '<tr><td colspan="8" class="table-empty">No applications here yet.</td></tr>'}
        </tbody>
      </table>`;
    scheduleSelectClamp();
  }

  function toggleApplicationSort(key) {
    if (!["company", "role", "stage"].includes(key)) return;
    if (applicationSort.key === key) {
      applicationSort.dir = applicationSort.dir === "asc" ? "desc" : "asc";
    } else {
      applicationSort = { key, dir: "asc" };
    }
    renderApplicationsPage();
  }

  function startColumnResize(handle, pointerX) {
    const header = handle.closest("th");
    if (!header) return;
    resizingColumn = {
      key: handle.dataset.resizeColumn,
      startX: pointerX,
      startWidth: header.getBoundingClientRect().width
    };
    document.body.classList.add("resizing-table");
  }

  function resizeColumn(pointerX) {
    if (!resizingColumn) return;
    const minWidth = Number(getComputedStyle(document.documentElement).getPropertyValue("--table-column-min").replace("px", "")) || 0;
    const nextWidth = Math.max(minWidth, resizingColumn.startWidth + pointerX - resizingColumn.startX);
    applicationTableWidths[resizingColumn.key] = Math.round(nextWidth);
    const cells = els.applicationsTable.querySelectorAll(`[data-column="${resizingColumn.key}"], [data-col="${resizingColumn.key}"]`);
    cells.forEach((cell) => {
      cell.style.width = `${applicationTableWidths[resizingColumn.key]}px`;
    });
  }

  function finishColumnResize() {
    if (!resizingColumn) return;
    saveTableWidths();
    resizingColumn = null;
    document.body.classList.remove("resizing-table");
  }

  function placeCaretAtEnd(element) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function rerenderNoteField(field, note) {
    field.innerHTML = normalizeNote(note).blocks.map((block) => {
      if (block.type === "check") {
        return `<span class="note-check" contenteditable="false" data-note-check="${block.checked ? "true" : "false"}" role="checkbox" aria-checked="${block.checked ? "true" : "false"}" tabindex="0"><span class="note-box" aria-hidden="true">${block.checked ? icon.check : ""}</span></span>`;
      }
      return `<span class="note-text">${escapeText(block.text)}</span>`;
    }).join("");
    placeCaretAtEnd(field);
  }

  function markManualDay(kind, value) {
    const week = ensureWeek();
    week.activityDays[todayKey] = week.activityDays[todayKey] || {};
    week.activityDays[todayKey][kind] = value;
  }

  function adjustNetworking(delta) {
    const week = ensureWeek();
    week.manual.net = Math.max(0, (week.manual.net || 0) + delta);
    markManualDay("net", week.manual.net > 0);
    saveState();
    render();
  }

  function toggleBinary(id) {
    const week = ensureWeek();
    week.manual[id] = !week.manual[id];
    markManualDay(id, week.manual[id]);
    saveState();
    render();
  }

  function incrementGoal(id) {
    const week = ensureWeek();
    if (id === "net") {
      adjustNetworking(1);
      return;
    }
    if (id === "rest") {
      week.manual.restAdjust = (week.manual.restAdjust || 0) + 1;
      saveState();
      render();
      return;
    }
    if (id === "prep" || id === "docs") {
      week.manual[id] = true;
      markManualDay(id, true);
      saveState();
      render();
    }
  }

  function decrementGoal(id) {
    const week = ensureWeek();
    if (id === "net") {
      week.manual.net = Math.max(0, (week.manual.net || 0) - 1);
      markManualDay("net", week.manual.net > 0);
    } else if (id === "rest") {
      week.manual.restAdjust = (week.manual.restAdjust || 0) - 1;
    } else if (id === "prep" || id === "docs") {
      week.manual[id] = false;
      markManualDay(id, false);
    }
    saveState();
    render();
  }

  function showScreen(name) {
    const screenName = ["watchlist", "pipeline", "applications"].includes(name) ? name : "today";
    if (screenName === "pipeline") {
      expandedPipelineId = "";
    }
    els.screens.forEach((screen) => {
      const active = screen.dataset.screen === screenName;
      screen.hidden = !active;
      screen.classList.toggle("active", active);
    });
    els.navLinks.forEach((link) => {
      const active = link.dataset.screenLink === screenName;
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    document.querySelectorAll("[data-applications-crumb]").forEach((link) => {
      link.setAttribute("aria-current", screenName === "applications" ? "page" : "false");
    });
  }

  function focusSafely(target, fallback = null) {
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus();
      return;
    }
    if (fallback && fallback.isConnected && typeof fallback.focus === "function") {
      fallback.focus();
    }
  }

  function setModalOrigin(origin) {
    modalOrigin = origin;
    els.jobWatchHint.hidden = origin !== "watchlist";
  }

  function openModal(prefill = {}, returnFocus = els.addApplication, origin = "home") {
    modalReturnFocus = returnFocus;
    setModalOrigin(origin);
    els.form.reset();
    els.form.dataset.editingId = prefill.id || "";
    els.form.elements.appliedDate.value = prefill.appliedDate || todayKey;
    els.form.elements.status.value = normalizeStatus(prefill.status || "Applied");
    calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    openLayer = "";
    els.form.dataset.companyId = prefill.companyId || "";
    els.form.dataset.postingId = prefill.postingId || "";
    els.form.elements.company.value = prefill.company || "";
    els.form.elements.role.value = prefill.role || "";
    els.form.elements.link.value = prefill.link || "";
    els.form.elements.note.value = prefill.note ? applicationNoteText(prefill) : "";
    els.jobTitle.textContent = prefill.id ? "Edit application" : "Log application";
    els.form.querySelector('button[type="submit"]').textContent = prefill.id ? "Save changes" : "Log application";
    renderSharedControls();
    updateApplicationSubmit();
    els.backdrop.hidden = false;
    syncSurfaceState();
    els.form.elements.link.focus();
  }

  function closeModal() {
    els.backdrop.hidden = true;
    setModalOrigin("home");
    closeFloatingLayers();
    focusSafely(modalReturnFocus, els.addApplication);
    modalReturnFocus = null;
    syncSurfaceState();
  }

  function openHeardModal(returnFocus = els.heardBack) {
    heardReturnFocus = returnFocus;
    heardSelectedApplicationId = "";
    els.heardTitle.textContent = "Who did you hear from?";
    els.heardPickStep.hidden = false;
    els.heardStageStep.hidden = true;
    els.heardQuery.value = "";
    els.heardResults.hidden = true;
    els.heardResults.innerHTML = "";
    els.heardBackdrop.hidden = false;
    syncSurfaceState();
    els.heardQuery.focus();
  }

  function closeHeardModal() {
    els.heardBackdrop.hidden = true;
    els.heardResults.hidden = true;
    heardSelectedApplicationId = "";
    els.heardPickStep.hidden = false;
    els.heardStageStep.hidden = true;
    if (els.hiredBackdrop.hidden) {
      focusSafely(heardReturnFocus, els.heardBack);
    }
    heardReturnFocus = null;
    syncSurfaceState();
  }

  function closeHiredModal() {
    els.hiredBackdrop.hidden = true;
    focusSafely(hiredReturnFocus, els.pipelineHeardBack);
    hiredReturnFocus = null;
    activeHiredApplicationId = "";
    syncSurfaceState();
  }

  function openCompanyModal() {
    autoFilledCompany = false;
    userEditedCompany = false;
    els.companyForm.reset();
    els.companyPrefillNote.hidden = true;
    els.companyBackdrop.hidden = false;
    syncSurfaceState();
    els.companyForm.elements.link.focus();
  }

  function closeCompanyModal() {
    els.companyBackdrop.hidden = true;
    els.addCompany.focus();
    syncSurfaceState();
  }

  function openEditCompany(companyId) {
    const company = findCompany(companyId);
    if (!company) return;
    activeCompanyId = companyId;
    els.editCompanyForm.elements.link.value = company.link || "";
    els.editCompanyForm.elements.company.value = company.company;
    els.editCompanyBackdrop.hidden = false;
    syncSurfaceState();
    els.editCompanyForm.elements.link.focus();
  }

  function closeEditCompany() {
    els.editCompanyBackdrop.hidden = true;
    activeCompanyId = "";
    syncSurfaceState();
  }

  function openRemoveCompany(companyId) {
    const company = findCompany(companyId);
    if (!company) return;
    activeCompanyId = companyId;
    els.removeCompanyTitle.textContent = `Remove ${company.company}?`;
    els.removeCompanyBackdrop.hidden = false;
    syncSurfaceState();
    els.confirmRemoveCompany.focus();
  }

  function closeRemoveCompany() {
    els.removeCompanyBackdrop.hidden = true;
    activeCompanyId = "";
    syncSurfaceState();
  }

  function openDeleteApplication(applicationId, returnFocus = null) {
    const application = findApplication(applicationId);
    if (!application) return;
    activeDeleteApplicationId = applicationId;
    modalReturnFocus = returnFocus;
    els.deleteApplicationCopy.textContent = `This removes ${application.company}, ${application.role} and its notes. There is no undo.`;
    els.deleteApplicationBackdrop.hidden = false;
    syncSurfaceState();
    els.confirmDeleteApplication.focus();
  }

  function closeDeleteApplication() {
    els.deleteApplicationBackdrop.hidden = true;
    activeDeleteApplicationId = "";
    focusSafely(modalReturnFocus, els.applicationsSearchToggle);
    modalReturnFocus = null;
    syncSurfaceState();
  }

  function deleteActiveApplication() {
    const application = findApplication(activeDeleteApplicationId);
    if (!application) return;
    activeState().applications = activeState().applications.filter((item) => item.id !== activeDeleteApplicationId);
    saveState();
    els.deleteApplicationBackdrop.hidden = true;
    activeDeleteApplicationId = "";
    modalReturnFocus = null;
    syncSurfaceState();
    showSnack("Application deleted.");
    render();
    focusSafely(els.applicationsSearchToggle);
  }

  function findCompany(companyId) {
    return ensureWatchlist().find((company) => company.id === companyId);
  }

  function findRole(companyId, roleId) {
    const company = findCompany(companyId);
    if (!company) return null;
    return company.roles.find((role) => role.id === roleId) || null;
  }

  function updateApplicationStage(applicationId, status, context) {
    const application = findApplication(applicationId);
    if (!application) return;
    const previousPipeline = isPipelineApplication(application);
    application.status = normalizeStatus(status);
    application.stageChangedAt = new Date().toISOString();
    openLayer = "";
    saveState();
    if (context === "pipeline" && previousPipeline && application.status === "Applied") {
      showSnack("Moved back to applied. Kept in all applications.", {
        linkText: "all applications",
        href: "#applications",
        duration: 5000
      });
    } else if (context === "pipeline" && previousPipeline && application.status === "Closed") {
      showSnack("Closed. Kept in all applications.", {
        linkText: "all applications",
        href: "#applications",
        duration: 5000
      });
    } else if (application.status === "Hired") {
      openHiredMoment(application.id);
    }
    syncSurfaceState();
    render();
  }

  function updateApplicationNote(applicationId, note) {
    const application = findApplication(applicationId);
    if (!application) return;
    application.note = normalizeNote(note);
    saveState();
  }

  function saveCompany(formData) {
    const company = formData.get("company").trim();
    const link = formData.get("link").trim();
    if (!company) return;
    ensureWatchlist().push({
      id: `company-${Date.now()}`,
      company,
      link,
      alerts_on: true,
      roles: sampleRolesForCompany(company, link)
    });
    saveState();
    renderWatchlist();
    showSnack(`${company} added. Checking its board for matching roles now.`);
  }

  function sampleRolesForCompany(company, link) {
    return [{
      id: `role-${Date.now()}`,
      title: `Product Manager, ${company}`,
      url: link,
      first_seen: new Date().toISOString(),
      is_live: true,
      locations: [{ city: "Berlin", mode: "Remote" }]
    }];
  }

  function saveEditedCompany(formData) {
    const company = findCompany(activeCompanyId);
    if (!company) return;
    company.link = formData.get("link").trim();
    company.company = formData.get("company").trim();
    saveState();
    renderWatchlist();
  }

  function removeActiveCompany() {
    const company = findCompany(activeCompanyId);
    if (!company) return;
    activeState().watchlist = ensureWatchlist().filter((item) => item.id !== activeCompanyId);
    saveState();
    renderWatchlist();
    showSnack(`${company.company} removed from your watchlist.`);
    closeRemoveCompany();
  }

  function saveApplication(formData) {
    const editingId = els.form.dataset.editingId;
    if (editingId) {
      const application = findApplication(editingId);
      if (!application) return;
      application.postingId = els.form.dataset.postingId || application.postingId || "";
      application.companyId = els.form.dataset.companyId || application.companyId || "";
      application.link = formData.get("link").trim();
      application.company = formData.get("company").trim();
      application.role = formData.get("role").trim();
      application.appliedDate = formData.get("appliedDate");
      const nextStatus = normalizeStatus(formData.get("status"));
      if (nextStatus !== application.status) {
        application.stageChangedAt = new Date().toISOString();
      }
      application.status = nextStatus;
      application.note = normalizeNote(formData.get("note").trim());
      activeState().days[application.appliedDate] = "applied";
      saveState();
      if (application.status !== "Hired") {
        showSnack("Application updated.");
      }
      render();
      return application;
    }
    const application = {
      id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      postingId: els.form.dataset.postingId || "",
      companyId: els.form.dataset.companyId || "",
      link: formData.get("link").trim(),
      company: formData.get("company").trim(),
      role: formData.get("role").trim(),
      appliedDate: formData.get("appliedDate"),
      status: formData.get("status"),
      stageChangedAt: new Date().toISOString(),
      note: normalizeNote(formData.get("note").trim())
    };

    activeState().applications.push(application);
    activeState().days[application.appliedDate] = "applied";
    saveState();
    pulseMini();
    if (application.status !== "Hired") {
      showSnack("Application logged.");
    }
    render();
    return application;
  }

  function updateApplicationSubmit() {
    const submit = els.form.querySelector('button[type="submit"]');
    const company = els.form.elements.company.value.trim();
    const role = els.form.elements.role.value.trim();
    submit.disabled = !company || !role;
  }

  function deriveRoleName(value) {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      const pathParts = url.pathname.split("/").filter(Boolean);
      const slug = pathParts[pathParts.length - 1] || "";
      if (!slug || /^\d+$/.test(slug)) return "";
      return titleizeSlug(slug);
    } catch {
      return "";
    }
  }

  function maybeAutoFillApplication() {
    const link = els.form.elements.link.value;
    const company = deriveCompanyName(link);
    if (company && !els.form.elements.company.value.trim()) {
      els.form.elements.company.value = company;
    }
    const role = deriveRoleName(link);
    if (role && !els.form.elements.role.value.trim()) {
      els.form.elements.role.value = role;
    }
    updateApplicationSubmit();
  }

  function deriveCompanyName(value) {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      const host = url.hostname.replace(/^www\./, "");
      const hostParts = host.split(".");
      const isAts = atsHosts.some((hostName) => host.includes(hostName));
      const pathParts = url.pathname.split("/").filter(Boolean);
      const slug = isAts && pathParts.length > 0 ? pathParts[0] : hostParts[0];
      return titleizeSlug(slug);
    } catch {
      return "";
    }
  }

  function titleizeSlug(slug) {
    return String(slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim();
  }

  function maybeAutoFillCompany() {
    if (userEditedCompany) return;
    const name = deriveCompanyName(els.companyForm.elements.link.value);
    if (!name) return;
    els.companyForm.elements.company.value = name;
    autoFilledCompany = true;
    els.companyPrefillNote.hidden = false;
  }

  function toggleAlerts(companyId) {
    const company = findCompany(companyId);
    if (!company) return;
    company.alerts_on = !company.alerts_on;
    saveState();
    renderWatchlist();
    showSnack(company.alerts_on ? "Alerts on. New matching roles will reach your inbox." : "Alerts paused for this company.");
  }

  function heardMatches(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return activeState().applications.filter((application) => String(application.company || "").toLowerCase().includes(needle));
  }

  function renderHeardResults() {
    const query = els.heardQuery.value;
    if (!query.trim()) {
      els.heardResults.hidden = true;
      els.heardResults.innerHTML = "";
      return;
    }
    const matches = heardMatches(query);
    els.heardResults.hidden = false;
    if (matches.length === 0) {
      els.heardResults.innerHTML = '<div class="typeahead-empty">Nothing logged under that name yet.</div>';
      return;
    }
    els.heardResults.innerHTML = matches.map((application) => `
      <button class="typeahead-row" type="button" data-heard-application="${escapeText(application.id)}">
        <span class="typeahead-company">${escapeText(application.company)}</span><span class="typeahead-sep">·</span><span>${escapeText(application.role)}</span>
      </button>`).join("");
  }

  function renderHeardStageStep(application) {
    els.heardTitle.textContent = "What happened?";
    els.heardPickStep.hidden = true;
    els.heardStageStep.hidden = false;
    els.heardSelection.textContent = `${application.company} · ${application.role}`;
    els.heardStageList.innerHTML = statusOptions.map((option) => {
      const separator = option === "1st stage" || option === "Closed" ? '<div class="stage-separator" aria-hidden="true"></div>' : "";
      return `
        ${separator}
        <button class="stage-choice" type="button" data-heard-stage="${escapeText(option)}">
          <span>${escapeText(option)}</span>
          <span class="select-check" aria-hidden="true">${option === normalizeStatus(application.status) ? icon.check : ""}</span>
        </button>`;
    }).join("");
    const firstChoice = els.heardStageList.querySelector("[data-heard-stage]");
    if (firstChoice) firstChoice.focus();
  }

  function chooseHeardApplication(applicationId) {
    const application = activeState().applications.find((item) => item.id === applicationId);
    if (!application) return;
    heardSelectedApplicationId = applicationId;
    renderHeardStageStep(application);
  }

  function confirmHeardStage(status) {
    if (!heardSelectedApplicationId) return;
    const nextStatus = normalizeStatus(status);
    updateApplicationStage(heardSelectedApplicationId, nextStatus, "heard");
    closeHeardModal();
    if (nextStatus !== "Hired") {
      const inPipeline = pipelineStages.includes(nextStatus);
      showSnack(inPipeline ? "Updated. You can see it in pipeline." : "Updated. Kept in all applications.", {
        linkText: inPipeline ? "pipeline" : "all applications",
        href: inPipeline ? "#pipeline" : "#applications",
        duration: 5000
      });
    }
  }

  function otherPipelineApplications(applicationId) {
    return pipelineApplications().filter((application) => application.id !== applicationId);
  }

  function openHiredMoment(applicationId, returnFocus = document.activeElement) {
    const application = findApplication(applicationId);
    if (!application) return;
    activeHiredApplicationId = applicationId;
    hiredReturnFocus = returnFocus;
    els.hiredCopy.textContent = `You accepted an offer at ${application.company}. This is a big deal, give yourself a pat on the back.`;
    const others = otherPipelineApplications(applicationId);
    els.hiredCleanup.hidden = others.length === 0;
    const selfChoice = els.hiredBackdrop.querySelector('input[name="hiredCleanupChoice"][value="self"]');
    if (selfChoice) selfChoice.checked = true;
    els.hiredBackdrop.hidden = false;
    syncSurfaceState();
    launchConfetti();
    els.finishHired.focus();
  }

  function finishHiredMoment() {
    const choice = els.hiredBackdrop.querySelector('input[name="hiredCleanupChoice"]:checked');
    if (choice && choice.value === "all" && activeHiredApplicationId) {
      otherPipelineApplications(activeHiredApplicationId).forEach((application) => {
        application.status = "Closed";
        application.stageChangedAt = new Date().toISOString();
      });
      saveState();
      render();
    }
    closeHiredModal();
  }

  function tokenColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function launchConfetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = els.confettiCanvas;
    const context = canvas.getContext("2d");
    if (!context) return;
    window.cancelAnimationFrame(confettiFrame);
    const colors = ["--gold", "--net-deep", "--rest", "--prep", "--ember-light"].map(tokenColor);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    canvas.hidden = false;
    const particles = Array.from({ length: 130 }, () => ({
      x: Math.random() * width,
      y: Math.random() * -height * .35,
      w: 4 + Math.random() * 8,
      h: 8 + Math.random() * 12,
      speed: 2 + Math.random() * 4,
      drift: -1.5 + Math.random() * 3,
      turn: Math.random() * Math.PI,
      spin: -0.12 + Math.random() * .24,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const started = performance.now();
    function draw(now) {
      const elapsed = now - started;
      context.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        particle.y += particle.speed;
        particle.x += particle.drift;
        particle.turn += particle.spin;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.turn);
        context.fillStyle = particle.color;
        context.globalAlpha = Math.max(0, 1 - elapsed / 2400);
        context.fillRect(particle.w / -2, particle.h / -2, particle.w, particle.h);
        context.restore();
      });
      if (elapsed < 2400) {
        confettiFrame = window.requestAnimationFrame(draw);
      } else {
        canvas.hidden = true;
        context.clearRect(0, 0, width, height);
      }
    }
    confettiFrame = window.requestAnimationFrame(draw);
  }

  function presetApplications(count, dates) {
    return Array.from({ length: count }, (_, index) => ({
      id: `demo-app-${index}`,
      link: "",
      company: "Google",
      role: "Demo role",
      appliedDate: dates[index % dates.length],
      status: "Applied",
      note: ""
    }));
  }

  function demoApplication(overrides = {}) {
    const id = overrides.id || `demo-app-${Math.random().toString(16).slice(2)}`;
    return normalizeApplication({
      id,
      postingId: overrides.postingId || "",
      companyId: overrides.companyId || "",
      link: overrides.link || "",
      company: overrides.company || "Google",
      role: overrides.role || "Product Manager",
      appliedDate: overrides.appliedDate || todayKey,
      status: overrides.status || "Applied",
      stageChangedAt: overrides.stageChangedAt || new Date().toISOString(),
      note: normalizeNote(overrides.note || "")
    });
  }

  function demoPipelineApplications() {
    return [
      demoApplication({
        id: "demo-pipeline-brightbyte",
        postingId: "role-brightbyte-developer-experience",
        companyId: "company-brightbyte",
        link: "https://example.com/brightbyte-careers/developer-experience",
        company: "Brightbyte Labs",
        role: "Staff Product Manager, Developer Experience",
        appliedDate: toDateKey(addDays(today, -6)),
        status: "1st stage",
        stageChangedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        note: "Prepare examples for the first conversation."
      }),
      demoApplication({
        id: "demo-pipeline-google",
        postingId: "role-google-workflow",
        companyId: "company-google",
        link: "https://careers.google.com/jobs/results",
        company: "Google",
        role: "Senior Product Manager, Workflow Systems and Customer Lifecycle Growth",
        appliedDate: toDateKey(addDays(today, -9)),
        status: "2nd stage",
        stageChangedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        note: "Review examples around operations workflows."
      })
    ];
  }

  function demoArchiveApplications() {
    return [
      ...demoPipelineApplications(),
      demoApplication({
        id: "demo-archive-meadowworks",
        postingId: "role-meadowworks-member-experience",
        companyId: "company-meadowworks",
        link: "https://example.com/meadowworks-careers/member-experience",
        company: "MeadowWorks",
        role: "Product Lead, Member Experience",
        appliedDate: toDateKey(addDays(today, -15)),
        status: "Applied"
      }),
      demoApplication({
        id: "demo-archive-closed",
        company: "Northstar Studio",
        role: "Senior Product Manager",
        appliedDate: toDateKey(addDays(today, -22)),
        status: "Closed"
      })
    ];
  }

  function makeDemoPreset(name) {
    const tue = toDateKey(addDays(weekStart, 1));
    const wed = toDateKey(addDays(weekStart, 2));
    const thu = toDateKey(addDays(weekStart, 3));
    const fri = toDateKey(addDays(weekStart, 4));
    const base = {
      applications: [],
      days: {},
      watchlist: cloneWatchlist(defaultWatchlist),
      lastGoals: [
        { id: "apply", target: 5 },
        { id: "net", target: 3 },
        { id: "rest", target: 2 }
      ],
      weeks: {
        [weekKey]: {
          goals: [],
          manual: { net: 0, prep: false, docs: false },
          activityDays: {}
        }
      }
    };
    const week = base.weeks[weekKey];

    if (name === "empty" || name === "noApplications") {
      return base;
    }
    if (name === "pipelineEmpty" || name === "applicationsEmpty") {
      return base;
    }
    if (name === "pipelineEntries") {
      base.applications = demoPipelineApplications();
      return base;
    }
    if (name === "applicationsEntries") {
      base.applications = demoArchiveApplications();
      return base;
    }
    if (name === "hasApplication") {
      base.applications = presetApplications(1, [todayKey]);
      return base;
    }
    if (name === "progress") {
      week.goals = cloneGoals(base.lastGoals);
      week.manual.net = 1;
      week.activityDays[wed] = { net: true };
      base.applications = presetApplications(3, [tue, thu, fri]);
      return base;
    }
    if (name === "threeDone") {
      week.goals = cloneGoals(base.lastGoals);
      week.manual.net = 3;
      week.activityDays[todayKey] = { net: true };
      base.applications = presetApplications(5, [wed, thu, fri]);
      return base;
    }
    if (name === "mixed") {
      week.goals = [
        { id: "apply", target: 4 },
        { id: "net", target: 3 },
        { id: "prep", target: 1 },
        { id: "docs", target: 1 },
        { id: "rest", target: 2 }
      ];
      base.lastGoals = cloneGoals(week.goals);
      week.manual.net = 2;
      week.manual.prep = true;
      week.manual.docs = false;
      week.activityDays[wed] = { net: true };
      week.activityDays[todayKey] = { net: true, prep: true };
      base.applications = presetApplications(2, [thu, fri]);
      return base;
    }
    week.goals = [
      { id: "apply", target: 4 },
      { id: "net", target: 3 },
      { id: "prep", target: 1 },
      { id: "docs", target: 1 },
      { id: "rest", target: 2 }
    ];
    base.lastGoals = cloneGoals(week.goals);
    week.manual.net = 3;
    week.manual.prep = true;
    week.manual.docs = true;
    week.activityDays[todayKey] = { net: true, prep: true, docs: true };
    base.applications = presetApplications(4, [wed, thu, fri]);
    return base;
  }

  function setDemoPreset(name) {
    demoPreset = name;
    demoState = makeDemoPreset(name);
    if (name.startsWith("pipeline")) {
      expandedPipelineId = "";
    }
    renderDemoButtons();
    render();
    if (name.startsWith("pipeline") && window.location.hash !== "#pipeline") {
      window.location.hash = "pipeline";
    } else if (name.startsWith("applications") && window.location.hash !== "#applications") {
      window.location.hash = "applications";
    } else if ((name === "noApplications" || name === "hasApplication") && window.location.hash !== "#today") {
      window.location.hash = "today";
    }
  }

  function renderDemoButtons() {
    const homeStates = [
      ["noApplications", "No applications"],
      ["hasApplication", "At least 1 application"]
    ];
    const presets = [
      ["empty", "Week not set up"],
      ["progress", "Mid-week, in progress"],
      ["threeDone", "Three goals, all done"],
      ["mixed", "All five goals, mixed"],
      ["done", "All five goals, done"]
    ];
    const pipelineStates = [
      ["pipelineEmpty", "No entries"],
      ["pipelineEntries", "With entries"]
    ];
    const applicationStates = [
      ["applicationsEmpty", "No entries"],
      ["applicationsEntries", "With entries"]
    ];
    els.demoHomeActions.innerHTML = homeStates.map(([id, label]) => `<button type="button" class="${demoPreset === id ? "active" : ""}" data-demo="${id}">${label}</button>`).join("");
    els.demoActions.innerHTML = presets.map(([id, label]) => `<button type="button" class="${demoPreset === id ? "active" : ""}" data-demo="${id}">${label}</button>`).join("");
    els.demoPipelineActions.innerHTML = pipelineStates.map(([id, label]) => `<button type="button" class="${demoPreset === id ? "active" : ""}" data-demo="${id}">${label}</button>`).join("");
    els.demoApplicationActions.innerHTML = applicationStates.map(([id, label]) => `<button type="button" class="${demoPreset === id ? "active" : ""}" data-demo="${id}">${label}</button>`).join("");
  }

  function maybeEnableDemo() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("demo")) return;
    els.demoPanel.hidden = false;
    const requested = params.get("demo");
    setDemoPreset(requested && requested !== "1" ? requested : "empty");
  }

  function initialScreen() {
    const hash = window.location.hash.replace("#", "");
    return ["watchlist", "pipeline", "applications"].includes(hash) ? hash : "today";
  }

  function closeMenus() {
    if (!openMenuId) return;
    openMenuId = "";
    syncSurfaceState();
    render();
  }

  function shouldIgnorePipelineToggle(event) {
    return Boolean(event.target.closest("button, a, input, textarea, select, [contenteditable], .select-shell, [data-note-application]"));
  }

  function activeModal() {
    return [els.backdrop, els.heardBackdrop, els.goalsBackdrop, els.companyBackdrop, els.editCompanyBackdrop, els.removeCompanyBackdrop, els.deleteApplicationBackdrop, els.hiredBackdrop].find((backdrop) => !backdrop.hidden);
  }

  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const backdrop = activeModal();
    if (!backdrop) return;
    const focusable = Array.from(backdrop.querySelectorAll("button, input, select, textarea, [tabindex]")).filter((item) => !item.disabled && item.offsetParent !== null && item.tabIndex >= 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function wireEvents() {
    els.navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const screenName = link.dataset.screenLink;
        if (window.location.hash !== `#${screenName}`) {
          window.location.hash = screenName;
        } else {
          showScreen(screenName);
        }
      });
    });
    window.addEventListener("hashchange", () => {
      showScreen(initialScreen());
    });
    els.addApplication.addEventListener("click", () => openModal({}, els.addApplication, "home"));
    els.heardBack.addEventListener("click", () => openHeardModal(els.heardBack));
    els.addCompany.addEventListener("click", openCompanyModal);
    els.pipelineAddApplication.addEventListener("click", () => openModal({}, els.pipelineAddApplication, "home"));
    els.pipelineHeardBack.addEventListener("click", () => openHeardModal(els.pipelineHeardBack));
    els.pipelineMenuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openMenuId = openMenuId === "pipeline" ? "" : "pipeline";
      syncSurfaceState();
      renderPipeline();
    });
    els.allApplicationsLink.addEventListener("click", () => {
      if (els.allApplicationsLink.disabled) return;
      openMenuId = "";
      syncSurfaceState();
      window.location.hash = "applications";
    });
    els.applicationsSearchToggle.addEventListener("click", () => {
      applicationsSearchOpen = true;
      renderApplicationsPage();
      els.applicationsSearch.focus();
    });
    els.applicationsSearch.addEventListener("input", renderApplicationsPage);
    els.applicationsSearch.addEventListener("blur", () => {
      if (els.applicationsSearch.value.trim()) return;
      applicationsSearchOpen = false;
      renderApplicationsPage();
    });
    els.cancelHeard.addEventListener("click", closeHeardModal);
    els.cancelJob.addEventListener("click", closeModal);
    els.cancelGoals.addEventListener("click", closeGoalsModal);
    els.finishGoals.addEventListener("click", finishSetup);
    els.cancelCompany.addEventListener("click", closeCompanyModal);
    els.cancelEditCompany.addEventListener("click", closeEditCompany);
    els.cancelRemoveCompany.addEventListener("click", closeRemoveCompany);
    els.cancelDeleteApplication.addEventListener("click", closeDeleteApplication);
    els.confirmRemoveCompany.addEventListener("click", removeActiveCompany);
    els.confirmDeleteApplication.addEventListener("click", deleteActiveApplication);
    els.finishHired.addEventListener("click", finishHiredMoment);
    els.editGoals.addEventListener("click", startSetup);
    els.interactionScrim.addEventListener("click", closeMenus);

    els.backdrop.addEventListener("click", (event) => {
      if (event.target !== els.backdrop) return;
      if (openLayer) {
        closeFloatingLayers();
        return;
      }
      closeModal();
    });
    els.heardBackdrop.addEventListener("click", (event) => {
      if (event.target === els.heardBackdrop) closeHeardModal();
    });
    els.goalsBackdrop.addEventListener("click", (event) => {
      if (event.target === els.goalsBackdrop) closeGoalsModal();
    });
    els.companyBackdrop.addEventListener("click", (event) => {
      if (event.target === els.companyBackdrop) closeCompanyModal();
    });
    els.editCompanyBackdrop.addEventListener("click", (event) => {
      if (event.target === els.editCompanyBackdrop) closeEditCompany();
    });
    els.removeCompanyBackdrop.addEventListener("click", (event) => {
      if (event.target === els.removeCompanyBackdrop) closeRemoveCompany();
    });
    els.deleteApplicationBackdrop.addEventListener("click", (event) => {
      if (event.target === els.deleteApplicationBackdrop) closeDeleteApplication();
    });
    els.hiredBackdrop.addEventListener("click", (event) => {
      if (event.target === els.hiredBackdrop) closeHiredModal();
    });

    document.addEventListener("keydown", (event) => {
      trapFocus(event);
      if (event.key === "Escape" && openLayer) {
        closeFloatingLayers();
        return;
      }
      if (event.key === "Escape" && !els.backdrop.hidden) closeModal();
      if (event.key === "Escape" && !els.heardBackdrop.hidden) closeHeardModal();
      if (event.key === "Escape" && !els.goalsBackdrop.hidden) closeGoalsModal();
      if (event.key === "Escape" && !els.companyBackdrop.hidden) closeCompanyModal();
      if (event.key === "Escape" && !els.editCompanyBackdrop.hidden) closeEditCompany();
      if (event.key === "Escape" && !els.removeCompanyBackdrop.hidden) closeRemoveCompany();
      if (event.key === "Escape" && !els.deleteApplicationBackdrop.hidden) closeDeleteApplication();
      if (event.key === "Escape" && !els.hiredBackdrop.hidden) closeHiredModal();
      if (event.key === "Escape") closeMenus();
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".menu-wrap")) {
        closeMenus();
      }
      if (!event.target.closest(".select-shell") && !event.target.closest(".date-shell")) {
        closeFloatingLayers();
      }
    });

    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateApplicationSubmit();
      if (els.form.querySelector('button[type="submit"]').disabled) return;
      const savedApplication = saveApplication(new FormData(els.form));
      closeModal();
      if (savedApplication && savedApplication.status === "Hired") {
        openHiredMoment(savedApplication.id);
      }
    });
    els.form.elements.link.addEventListener("input", maybeAutoFillApplication);
    els.form.elements.company.addEventListener("input", updateApplicationSubmit);
    els.form.elements.role.addEventListener("input", updateApplicationSubmit);
    els.form.addEventListener("click", (event) => {
      const statusToggle = event.target.closest("[data-toggle-status]");
      const statusOption = event.target.closest("[data-status-option]");
      const dateToggle = event.target.closest("[data-toggle-date]");
      const dateOption = event.target.closest("[data-date-option]");
      const prev = event.target.closest("[data-calendar-prev]");
      const next = event.target.closest("[data-calendar-next]");

      if (statusToggle) {
        event.stopPropagation();
        openLayer = openLayer === "status" ? "" : "status";
        syncSurfaceState();
        renderSharedControls();
      } else if (statusOption) {
        event.stopPropagation();
        els.form.elements.status.value = statusOption.dataset.statusOption;
        openLayer = "";
        syncSurfaceState();
        renderSharedControls();
      } else if (dateToggle) {
        event.stopPropagation();
        openLayer = openLayer === "date" ? "" : "date";
        syncSurfaceState();
        renderSharedControls();
      } else if (dateOption) {
        event.stopPropagation();
        const selectedDate = fromDateKey(dateOption.dataset.dateOption);
        els.form.elements.appliedDate.value = dateOption.dataset.dateOption;
        calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        openLayer = "";
        syncSurfaceState();
        renderSharedControls();
      } else if (prev) {
        event.stopPropagation();
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
        renderSharedControls();
      } else if (next) {
        event.stopPropagation();
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
        renderSharedControls();
      }
    });
    els.companyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCompany(new FormData(els.companyForm));
      closeCompanyModal();
    });
    els.editCompanyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveEditedCompany(new FormData(els.editCompanyForm));
      closeEditCompany();
    });
    els.companyForm.elements.link.addEventListener("input", maybeAutoFillCompany);
    els.companyForm.elements.company.addEventListener("input", () => {
      if (autoFilledCompany) {
        userEditedCompany = true;
        els.companyPrefillNote.hidden = true;
      }
    });
    els.heardQuery.addEventListener("input", renderHeardResults);
    els.heardResults.addEventListener("click", (event) => {
      const row = event.target.closest("[data-heard-application]");
      if (row) chooseHeardApplication(row.dataset.heardApplication);
    });
    els.heardStageList.addEventListener("click", (event) => {
      const stage = event.target.closest("[data-heard-stage]");
      if (stage) confirmHeardStage(stage.dataset.heardStage);
    });

    els.pipelineList.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-empty-add-application]");
      const heardButton = event.target.closest("[data-empty-heard-back]");
      const openButton = event.target.closest("[data-open-role]");
      const stageToggle = event.target.closest("[data-toggle-stage]");
      const stageOption = event.target.closest("[data-stage-option]");
      const noteCheck = event.target.closest("[data-note-check]");
      const card = event.target.closest("[data-pipeline-card]");

      if (addButton) {
        openModal({}, addButton, "home");
        return;
      }
      if (heardButton) {
        openHeardModal(heardButton);
        return;
      }
      if (openButton) {
        window.open(openButton.dataset.openRole, "_blank", "noopener");
        return;
      }
      if (stageToggle) {
        event.stopPropagation();
        openLayer = openLayer === `stage:${stageToggle.dataset.stageContext}:${stageToggle.dataset.toggleStage}` ? "" : `stage:${stageToggle.dataset.stageContext}:${stageToggle.dataset.toggleStage}`;
        syncSurfaceState();
        renderPipeline();
        return;
      }
      if (stageOption) {
        event.stopPropagation();
        updateApplicationStage(stageOption.dataset.stageApplication, stageOption.dataset.stageOption, stageOption.dataset.stageContext);
        return;
      }
      if (noteCheck) {
        event.stopPropagation();
        const field = noteCheck.closest("[data-note-application]");
        noteCheck.dataset.noteCheck = noteCheck.dataset.noteCheck === "true" ? "false" : "true";
        noteCheck.setAttribute("aria-checked", noteCheck.dataset.noteCheck);
        noteCheck.querySelector(".note-box").innerHTML = noteCheck.dataset.noteCheck === "true" ? icon.check : "";
        updateApplicationNote(field.dataset.noteApplication, serializeNoteField(field));
        return;
      }
      if (shouldIgnorePipelineToggle(event)) return;
      if (card) {
        togglePipelineCard(card);
      }
    });

    els.pipelineList.addEventListener("input", (event) => {
      const note = event.target.closest("[data-note-application]");
      if (!note) return;
      if (note.textContent.includes("[]")) {
        const nextNote = { kind: "blocks", blocks: noteBlocksFromText(note.textContent) };
        updateApplicationNote(note.dataset.noteApplication, nextNote);
        rerenderNoteField(note, nextNote);
        return;
      }
      updateApplicationNote(note.dataset.noteApplication, serializeNoteField(note));
    });

    els.pipelineList.addEventListener("keydown", (event) => {
      const noteCheck = event.target.closest("[data-note-check]");
      const card = event.target.closest("[data-pipeline-card]");
      if (noteCheck && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        noteCheck.click();
        return;
      }
      if (card && event.target === card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        togglePipelineCard(card, true);
      }
    });

    els.applicationsTable.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-open-role]");
      const stageToggle = event.target.closest("[data-toggle-stage]");
      const stageOption = event.target.closest("[data-stage-option]");
      const menuButton = event.target.closest("[data-application-menu]");
      const editButton = event.target.closest("[data-edit-application]");
      const deleteButton = event.target.closest("[data-delete-application]");
      const sortButton = event.target.closest("[data-sort-applications]");
      const resizeHandle = event.target.closest("[data-resize-column]");

      if (openButton) {
        window.open(openButton.dataset.openRole, "_blank", "noopener");
        return;
      }
      if (resizeHandle) {
        return;
      }
      if (sortButton) {
        toggleApplicationSort(sortButton.dataset.sortApplications);
        return;
      }
      if (stageToggle) {
        event.stopPropagation();
        openLayer = openLayer === `stage:${stageToggle.dataset.stageContext}:${stageToggle.dataset.toggleStage}` ? "" : `stage:${stageToggle.dataset.stageContext}:${stageToggle.dataset.toggleStage}`;
        syncSurfaceState();
        renderApplicationsPage();
        return;
      }
      if (stageOption) {
        event.stopPropagation();
        updateApplicationStage(stageOption.dataset.stageApplication, stageOption.dataset.stageOption, stageOption.dataset.stageContext);
        return;
      }
      if (menuButton) {
        event.stopPropagation();
        openMenuId = openMenuId === `application:${menuButton.dataset.applicationMenu}` ? "" : `application:${menuButton.dataset.applicationMenu}`;
        syncSurfaceState();
        renderApplicationsPage();
        return;
      }
      if (editButton) {
        const application = findApplication(editButton.dataset.editApplication);
        if (!application) return;
        openMenuId = "";
        syncSurfaceState();
        openModal(application, editButton, "home");
        renderApplicationsPage();
        return;
      }
      if (deleteButton) {
        openMenuId = "";
        syncSurfaceState();
        openDeleteApplication(deleteButton.dataset.deleteApplication, deleteButton);
        renderApplicationsPage();
      }
    });

    els.applicationsTable.addEventListener("mousedown", (event) => {
      const resizeHandle = event.target.closest("[data-resize-column]");
      if (!resizeHandle) return;
      event.preventDefault();
      startColumnResize(resizeHandle, event.clientX);
    });

    document.addEventListener("mousemove", (event) => {
      resizeColumn(event.clientX);
    });

    document.addEventListener("mouseup", finishColumnResize);

    els.watchlistGroups.addEventListener("click", (event) => {
      const quietToggle = event.target.closest("[data-toggle-quiet]");
      const alertButton = event.target.closest("[data-toggle-alerts]");
      const menuButton = event.target.closest("[data-company-menu]");
      const editButton = event.target.closest("[data-edit-company]");
      const removeButton = event.target.closest("[data-remove-company]");
      const openButton = event.target.closest("[data-open-role]");
      const applyButton = event.target.closest("[data-apply-role]");

      if (quietToggle) {
        quietOpen = !quietOpen;
        renderWatchlist();
        return;
      }
      if (alertButton) {
        toggleAlerts(alertButton.dataset.toggleAlerts);
        return;
      }
      if (menuButton) {
        event.stopPropagation();
        openMenuId = openMenuId === menuButton.dataset.companyMenu ? "" : menuButton.dataset.companyMenu;
        syncSurfaceState();
        renderWatchlist();
        return;
      }
      if (editButton) {
        openMenuId = "";
        syncSurfaceState();
        openEditCompany(editButton.dataset.editCompany);
        renderWatchlist();
        return;
      }
      if (removeButton) {
        openMenuId = "";
        syncSurfaceState();
        openRemoveCompany(removeButton.dataset.removeCompany);
        renderWatchlist();
        return;
      }
      if (openButton) {
        const url = openButton.dataset.openRole;
        if (url) window.open(url, "_blank", "noopener");
        return;
      }
      if (applyButton) {
        const role = findRole(applyButton.dataset.companyId, applyButton.dataset.applyRole);
        const company = findCompany(applyButton.dataset.companyId);
        if (!role || !company) return;
        openModal(
          {
            companyId: company.id,
            postingId: role.id,
            company: company.company,
            role: role.title,
            link: role.url
          },
          applyButton,
          "watchlist"
        );
      }
    });

    els.goalsBody.addEventListener("click", (event) => {
      const info = event.target.closest("[data-info-tooltip]");
      const increment = event.target.closest("[data-increment-goal]");
      const decrement = event.target.closest("[data-decrement-goal]");

      if (info) return;
      if (increment) {
        event.stopPropagation();
        activeGoalControlId = increment.dataset.incrementGoal;
        incrementGoal(increment.dataset.incrementGoal);
        return;
      }
      if (decrement) {
        event.stopPropagation();
        activeGoalControlId = decrement.dataset.decrementGoal;
        decrementGoal(decrement.dataset.decrementGoal);
        return;
      }
    });
    els.goalsSetupBody.addEventListener("click", (event) => {
      const draftAdjust = event.target.closest("[data-draft-adjust]");
      const draftToggle = event.target.closest("[data-draft-toggle]");
      if (draftAdjust) {
        event.stopPropagation();
        adjustDraft(draftAdjust.dataset.draftAdjust, Number(draftAdjust.dataset.delta));
      } else if (draftToggle) {
        toggleDraft(draftToggle.dataset.draftToggle);
      }
    });
    els.goalsSetupBody.addEventListener("keydown", (event) => {
      if (event.target.closest("[data-draft-adjust]")) return;
      const draftToggle = event.target.closest("[data-draft-toggle]");
      if (!draftToggle || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      toggleDraft(draftToggle.dataset.draftToggle);
    });
    els.goalsBody.addEventListener("pointerout", (event) => {
      const tile = event.target.closest(".goal-tile.control-active");
      if (!tile || tile.contains(event.relatedTarget)) return;
      activeGoalControlId = "";
      renderGoalsCard();
    });
    els.demoActions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-demo]");
      if (button) setDemoPreset(button.dataset.demo);
    });
    els.demoHomeActions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-demo]");
      if (button) setDemoPreset(button.dataset.demo);
    });
    els.demoPipelineActions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-demo]");
      if (button) setDemoPreset(button.dataset.demo);
    });
    els.demoApplicationActions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-demo]");
      if (button) setDemoPreset(button.dataset.demo);
    });
  }

  setGreeting();
  ensureWeek();
  saveState();
  setupTooltips();
  wireEvents();
  maybeEnableDemo();
  showScreen(initialScreen());
  render();
})();
