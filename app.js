(function () {
  const storageKey = "astir.v1";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const icon = {
    applied: '<svg viewBox="0 0 24 24"><path d="M12 2.6l1.9 6.1a1.4 1.4 0 0 0 .92.92L21 11.5l-6.18 1.88a1.4 1.4 0 0 0-.92.92L12 20.4l-1.9-6.1a1.4 1.4 0 0 0-.92-.92L3 11.5l6.18-1.88a1.4 1.4 0 0 0 .92-.92z"/></svg>',
    rest: '<svg viewBox="0 0 24 24"><path d="M5 14c2.5-1.5 4-4.5 4-8 3 1 5.5 3.5 5.5 7 0 3.6-2.9 6.5-6.5 6.5S1.5 16.6 1.5 13"/></svg>',
    prep: '<svg viewBox="0 0 24 24"><path d="M4 19.5V6a2 2 0 0 1 2-2h13v14H6.5a2.5 2.5 0 0 0 0 5H19"/></svg>'
  };

  const state = loadState();
  const today = new Date();
  const todayKey = toDateKey(today);
  const sphere = window.AstirSphere.create(document.getElementById("sphere"));
  const els = {
    addJob: document.getElementById("addJob"),
    backdrop: document.getElementById("jobBackdrop"),
    cancelJob: document.getElementById("cancelJob"),
    chips: document.querySelectorAll("[data-day-kind]"),
    closeJob: document.getElementById("closeJob"),
    form: document.getElementById("jobForm"),
    greeting: document.getElementById("greeting"),
    mini: document.getElementById("mini"),
    snackbar: document.getElementById("snackbar"),
    weekDays: document.getElementById("weekDays"),
    whisper: document.getElementById("whisper")
  };
  let snackTimer;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || { applications: [], days: {} };
    } catch {
      return { applications: [], days: {} };
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfWeek(date) {
    const copy = new Date(date);
    const offset = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - offset);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function renderDayDot(kind) {
    const className = kind ? `dot ${kind}` : "dot";
    return `<span class="${className}">${kind ? icon[kind] : ""}</span>`;
  }

  function renderWeek() {
    const start = startOfWeek(today);
    const days = [];

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = toDateKey(date);
      const kind = state.days[key];
      const nowClass = key === todayKey ? " now" : "";
      days.push(`<div class="day${nowClass}" data-date="${key}">${renderDayDot(kind)}<span class="d">${dayNames[date.getDay()]}</span></div>`);
    }

    els.weekDays.innerHTML = days.join("");
    syncTodayControls();
  }

  function syncTodayControls() {
    const kind = state.days[todayKey];
    els.chips.forEach((chip) => {
      chip.classList.toggle("on", chip.dataset.dayKind === kind);
    });

    if (kind === "prep") {
      sphere.markPrep();
      els.whisper.textContent = "A lilac kind of day. The interview is the work.";
    } else if (kind === "rest") {
      sphere.markRest();
      els.whisper.textContent = "Rest. It drifts slower with you.";
    } else if (kind === "applied") {
      els.whisper.textContent = "Application released. Today is done.";
    }
  }

  function pulseMini() {
    els.mini.classList.remove("pulse");
    void els.mini.offsetWidth;
    els.mini.classList.add("pulse");
  }

  function markDay(kind) {
    state.days[todayKey] = kind;
    saveState();
    renderWeek();

    if (kind === "prep") {
      sphere.markPrep();
      els.whisper.textContent = "A lilac kind of day. The interview is the work.";
    } else if (kind === "rest") {
      sphere.markRest();
      els.whisper.textContent = "Rest. It drifts slower with you.";
    } else if (kind === "applied") {
      sphere.markApplication();
      els.whisper.textContent = "Application released. Today is done.";
      pulseMini();
    }
  }

  function openModal() {
    els.form.reset();
    els.form.elements.appliedDate.value = todayKey;
    els.backdrop.hidden = false;
    els.form.elements.company.focus();
  }

  function closeModal() {
    els.backdrop.hidden = true;
    els.addJob.focus();
  }

  function showSnack(message) {
    window.clearTimeout(snackTimer);
    els.snackbar.textContent = message;
    els.snackbar.hidden = false;
    snackTimer = window.setTimeout(() => {
      els.snackbar.hidden = true;
    }, 3500);
  }

  function saveApplication(formData) {
    const application = {
      id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      link: formData.get("link").trim(),
      company: formData.get("company").trim(),
      role: formData.get("role").trim(),
      appliedDate: formData.get("appliedDate"),
      status: formData.get("status")
    };

    state.applications.push(application);
    state.days[application.appliedDate] = "applied";
    saveState();
    renderWeek();
    sphere.markApplication();
    pulseMini();
    els.whisper.textContent = "Application released. Today is done.";
    showSnack("Application added. Today is done.");
  }

  function wireEvents() {
    els.addJob.addEventListener("click", openModal);
    els.cancelJob.addEventListener("click", closeModal);
    els.closeJob.addEventListener("click", closeModal);
    els.backdrop.addEventListener("click", (event) => {
      if (event.target === els.backdrop) {
        closeModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.backdrop.hidden) {
        closeModal();
      }
    });
    els.chips.forEach((chip) => {
      chip.addEventListener("click", () => markDay(chip.dataset.dayKind));
    });
    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveApplication(new FormData(els.form));
      closeModal();
    });
  }

  wireEvents();
  renderWeek();
})();
