/* House of Vapes Convenience & Smoke — Riverdale (rebuild) */
(() => {
  "use strict";

  const TZ = "America/Denver";
  // Minutes after midnight, keyed by weekday (0 = Sunday).
  const HOURS = {
    0: [10 * 60, 20 * 60],
    1: [8 * 60, 21 * 60],
    2: [8 * 60, 21 * 60],
    3: [8 * 60, 21 * 60],
    4: [8 * 60, 22 * 60],
    5: [8 * 60, 22 * 60],
    6: [8 * 60, 22 * 60],
  };
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Hero frames extracted from the walk-through clip at native res.
  // "wide" is the full 16:9 frame; "tall" is a 9:16 center crop for portrait phones.
  const HERO_FRAMES = { count: 79, wide: "assets/hero-frames/wide", tall: "assets/hero-frames/tall", ext: "webp" };

  const root = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================= Mountain time ================= */

  // { day, minutes } for "now" in America/Denver, via Intl (no date libs needed).
  function mountainNow() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    return {
      day: DAYS.indexOf(get("weekday").slice(0, 3).toLowerCase()),
      minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
    };
  }

  function formatTime(mins, withMinutes = false) {
    const h24 = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    const suffix = h24 < 12 ? "AM" : "PM";
    const h = h24 % 12 || 12;
    return mm || withMinutes ? `${h}:${String(mm).padStart(2, "0")} ${suffix}` : `${h} ${suffix}`;
  }

  function shopStatus({ day, minutes }) {
    const [open, close] = HOURS[day];
    if (minutes >= open && minutes < close) return { open: true, text: `OPEN NOW · Closes ${formatTime(close)}` };
    if (minutes < open) return { open: false, text: `CLOSED · Opens ${formatTime(open)} today` };
    const next = HOURS[(day + 1) % 7][0];
    return { open: false, text: `CLOSED · Opens ${formatTime(next)} tomorrow` };
  }

  function renderStatus() {
    const now = mountainNow();
    const s = shopStatus(now);
    document.querySelectorAll("[data-status]").forEach((el) => {
      el.classList.toggle("is-open", s.open);
      el.classList.toggle("is-closed", !s.open);
      el.querySelector("[data-status-text]").textContent = s.text;
    });
    document.querySelectorAll(".hours tr").forEach((tr) => {
      const isToday = Number(tr.dataset.day) === now.day;
      tr.classList.toggle("is-today", isToday);
      if (isToday) tr.setAttribute("aria-current", "date");
      else tr.removeAttribute("aria-current");
    });
  }
  renderStatus();
  setInterval(renderStatus, 30 * 1000);

  /* ================= Age gate ================= */

  let started = false;

  function enterSite() {
    try { sessionStorage.setItem("hov-age", "21"); } catch (e) {}
    root.classList.add("age-ok");
    startSite();
  }

  document.querySelector('[data-age="yes"]').addEventListener("click", enterSite);
  document.querySelector('[data-age="no"]').addEventListener("click", () => {
    location.replace("https://www.google.com/");
  });

  if (root.classList.contains("age-ok")) startSite();
  else document.querySelector('[data-age="yes"]').focus();

  function startSite() {
    if (started) return;
    started = true;
    initHero();
    initTopbar();
    initProducts();
    initReviews();
    initReserve();
    initSignup();
    document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  }

  /* ================= Hero: scroll-scrubbed walk through the shop ================= */

  // Scroll progress through the tall hero (--p, 0→1) picks a frame; frames draw "cover" on a canvas.
  // Frame 0 loads first, the rest stream in order; until a frame arrives, the nearest loaded one shows.
  function initHero() {
    const hero = document.querySelector(".hero");
    const canvas = hero.querySelector(".hero__canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingQuality = "high";
    const dir = innerHeight > innerWidth ? HERO_FRAMES.tall : HERO_FRAMES.wide;
    const frames = new Array(HERO_FRAMES.count).fill(null);
    let current = -1;
    let progress = 0;

    const setProgress = () => {
      const span = hero.offsetHeight - innerHeight;
      progress = span > 0 ? Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / span)) : 0;
      hero.style.setProperty("--p", progress.toFixed(4));
      hero.classList.toggle("is-revealed", progress > 0.75); // copy is readable and clickable
    };

    if (reducedMotion) { setProgress(); return; } // poster only

    // Idle loop: smoke rising off the cigar until the visitor starts scrolling.
    const idle = hero.querySelector(".hero__idle");
    let idleOn = false;
    const syncIdle = () => {
      const shouldPlay = progress < 0.04 && document.visibilityState === "visible";
      if (shouldPlay && !idleOn) {
        if (!idle.src) idle.src = idle.dataset.src;
        idle.play().then(() => hero.classList.add("has-idle")).catch(() => {});
        idleOn = true;
      } else if (!shouldPlay && idleOn) {
        idle.pause();
        idleOn = false;
      }
    };
    document.addEventListener("visibilitychange", syncIdle);

    // Scroll cue: clicking glides through the whole scene; any visitor input stops the glide.
    const cue = hero.querySelector("[data-scroll-cue]");
    let glide = 0;
    const stopGlide = () => { if (glide) { cancelAnimationFrame(glide); glide = 0; } };
    cue.addEventListener("click", () => {
      stopGlide();
      const from = scrollY;
      const to = hero.offsetTop + hero.offsetHeight - innerHeight;
      const duration = 3600;
      const t0 = performance.now();
      const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const step = (now) => {
        const x = Math.min(1, (now - t0) / duration);
        window.scrollTo({ top: from + (to - from) * ease(x), behavior: "instant" });
        if (x < 1) glide = requestAnimationFrame(step);
        else stopGlide();
      };
      glide = requestAnimationFrame(step);
    });
    ["wheel", "touchstart", "keydown"].forEach((t) => addEventListener(t, stopGlide, { passive: true }));

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      ctx.imageSmoothingQuality = "high"; // resizing clears context state
      current = -1;
      draw();
    };

    const draw = () => {
      const want = Math.round(progress * (HERO_FRAMES.count - 1));
      let i = want;
      while (i >= 0 && !frames[i]) i--;
      if (i < 0 || i === current) return;
      current = i;
      const img = frames[i];
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };

    const load = (i) => new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { frames[i] = img; resolve(true); };
      img.onerror = () => resolve(false);
      img.src = `${dir}/${String(i).padStart(3, "0")}.${HERO_FRAMES.ext}`;
    });

    let ticking = false;
    const onScroll = () => {
      setProgress();
      syncIdle();
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; draw(); });
    };

    load(0).then((ok) => {
      if (!ok) return; // frames missing: the poster stays up
      hero.classList.add("has-frames");
      size();
      addEventListener("scroll", onScroll, { passive: true });
      addEventListener("resize", () => { setProgress(); size(); });
      onScroll();
      // Stream the rest, three at a time, in order.
      let next = 1;
      const pump = () => {
        if (next >= HERO_FRAMES.count) return;
        const i = next++;
        load(i).then(() => { draw(); pump(); });
      };
      pump(); pump(); pump();
    });
    setProgress();
    syncIdle();
    addEventListener("scroll", syncIdle, { passive: true });
  }

  /* ================= Topbar + dock ================= */

  function initTopbar() {
    const topbar = document.querySelector(".topbar");
    const dock = document.querySelector(".dock");
    const update = () => {
      const past = scrollY > innerHeight * 1.5;
      topbar.classList.toggle("is-stuck", past);
      dock.classList.toggle("is-stuck", past);
    };
    addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ================= Product videos (360° spins) ================= */

  function initProducts() {
    const videos = document.querySelectorAll("[data-src]");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const v = entry.target;
        if (entry.isIntersecting) {
          if (!v.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.25 });
    videos.forEach((v) => io.observe(v));
    // Don't spin off-screen tabs.
    document.addEventListener("visibilitychange", () => {
      videos.forEach((v) => { document.hidden ? v.pause() : v.play().catch(() => {}); });
    });
  }

  /* ================= Reviews rotator ================= */

  function initReviews() {
    const rotator = document.querySelector("[data-rotator]");
    const slides = [...rotator.querySelectorAll(".review")];
    const dotsWrap = rotator.querySelector(".rotator__dots");
    const pauseBtn = rotator.querySelector("[data-rotator-pause]");
    let index = 0;
    let paused = false;
    let timer = 0;

    slides.forEach((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Review ${i + 1}`);
      b.addEventListener("click", () => go(i));
      dotsWrap.appendChild(b);
    });
    const dots = [...dotsWrap.children];

    const go = (i) => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, j) => {
        const on = j === index;
        s.classList.toggle("is-active", on);
        if (on) s.removeAttribute("aria-hidden");
        else { s.setAttribute("aria-hidden", "true"); }
        s.setAttribute("aria-label", `${j + 1} of ${slides.length}`);
      });
      dots.forEach((d, j) => {
        d.classList.toggle("is-on", j === index);
        d.setAttribute("aria-current", j === index ? "true" : "false");
      });
      restart();
    };

    const restart = () => {
      clearInterval(timer);
      if (!paused && !reducedMotion) timer = setInterval(() => go(index + 1), 6000);
    };

    rotator.querySelector("[data-rotator-prev]").addEventListener("click", () => go(index - 1));
    rotator.querySelector("[data-rotator-next]").addEventListener("click", () => go(index + 1));
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.classList.toggle("is-paused", paused);
      pauseBtn.setAttribute("aria-label", paused ? "Resume autoplay" : "Pause autoplay");
      restart();
    });

    rotator.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    });

    // Touch swipe.
    let startX = null;
    const list = rotator.querySelector(".rotator__slides");
    list.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") startX = e.clientX; });
    list.addEventListener("pointerup", (e) => {
      if (startX !== null && Math.abs(e.clientX - startX) > 40) go(index + (e.clientX < startX ? 1 : -1));
      startX = null;
    });
    list.addEventListener("pointercancel", () => (startX = null));

    go(0);
  }

  /* ================= Reserve drawer ================= */

  const sheet = () => document.querySelector("#reserve");

  // Pickup slots: hourly from now to close today, else tomorrow's open + 4.
  function pickupSlots() {
    const now = mountainNow();
    let { day, minutes } = now;
    const [open, close] = HOURS[day];
    let slots = [];
    for (let m = Math.ceil((minutes + 20) / 60) * 60; m <= close - 30; m += 60) slots.push({ day, m });
    if (!slots.length) {
      day = (day + 1) % 7;
      const [o, c] = HOURS[day];
      for (let m = o; m <= c - 60; m += 120) slots.push({ day, m });
    }
    return slots.map(({ day: d, m }) => `${DAY_NAMES[d]} ${formatTime(m, true)}`);
  }

  function openSheet(item, variant) {
    const el = sheet();
    el.querySelector("[data-item]").textContent = variant ? `${item} — ${variant}` : item;
    const select = el.querySelector('select[name="time"]');
    select.innerHTML = "";
    pickupSlots().forEach((label) => {
      const o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      select.appendChild(o);
    });
    el.querySelector('[data-step="form"]').hidden = false;
    el.querySelector('[data-step="done"]').hidden = true;
    el.querySelector(".form-error").hidden = true;
    el.showModal();
    el.querySelector('input[name="name"]').focus();
  }

  function initReserve() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-reserve]");
      if (!btn) return;
      const card = btn.closest("[data-product]");
      const item = card ? card.dataset.product : btn.dataset.item || "An item";
      const checked = card ? card.querySelector(".variant input:checked") : null;
      openSheet(item, btn.dataset.variant || (checked && checked.value) || "");
    });

    const el = sheet();
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest("[data-close]")) el.close();
    });

    el.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const err = form.querySelector(".form-error");
      if (!form.reportValidity()) return;

      const name = form.querySelector('input[name="name"]');
      const phone = form.querySelector('input[name="phone"]');
      const time = form.querySelector('select[name="time"]');
      if (!/^\d{3}/.test(phone.value.replace(/\D/g, ""))) {
        err.textContent = "Enter a valid phone number so we can confirm your hold.";
        err.hidden = false;
        return;
      }

      // Demo build: record locally so the state survives a refresh, but nothing leaves the browser.
      try {
        const held = JSON.parse(localStorage.getItem("hov-holds") || "[]");
        held.push({ item: form.querySelector("[data-item]").textContent, name: name.value, phone: phone.value, time: time.value, at: new Date().toISOString() });
        localStorage.setItem("hov-holds", JSON.stringify(held));
      } catch (err2) {}

      err.hidden = true;
      form.querySelector('[data-step="form"]').hidden = true;
      const done = form.querySelector('[data-step="done"]');
      done.hidden = false;
      form.querySelector("[data-done-title]").textContent = "You're on the board.";
      form.querySelector("[data-done-body]").textContent = `We'll hold it until ${time.value}. Bring a valid 21+ ID — pay in store.`;
    });
  }

  /* ================= SMS deals signup ================= */

  function initSignup() {
    const form = document.querySelector('[data-form="signup"]');
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const err = form.querySelector(".form-error");
      const done = form.querySelector(".form-done");
      const digits = form.querySelector('input[name="phone"]').value.replace(/\D/g, "");
      if (digits.length < 10) {
        err.textContent = "Enter a valid 10-digit mobile number.";
        err.hidden = false;
        done.hidden = true;
        return;
      }
      err.hidden = true;
      done.textContent = `You're in. Watch ${form.querySelector('input[name="phone"]').value} for the next drop.`;
      done.hidden = false;
      form.reset();
    });
  }
})();
