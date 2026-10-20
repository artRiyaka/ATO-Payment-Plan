(function () {
  const KEY = "sg-pp-demo";
  const VIEWS = ["dashboard", "details", "recommendation", "proposal", "monitoring", "response", "activity"];
  const VIEW_LABEL = {
    dashboard: "Overview",
    details: "Business details",
    recommendation: "Recommendation",
    proposal: "Proposal",
    monitoring: "Monitoring",
    response: "ATO response",
    activity: "Activity",
  };
  const SDA_CALL = "SDA has been notified and may phone you to discuss other options, including small business restructuring, voluntary administration, or a sale or liquidation of the business.";
  const REASONS = {
    bookkeeper: "Activity statements in the prior year were lodged late because the company was without a bookkeeper for a period. A bookkeeper is now engaged, and those lodgements have been brought up to date.",
    trading: "Activity statements in the prior year were lodged late during a short downturn in trading. Trading has stabilised, and those lodgements have been brought up to date.",
    changeover: "Activity statements in the prior year were lodged late during a change of accounting system. That change is finished, and lodgements are now up to date.",
  };

  const state = {
    authed: false,
    view: "dashboard",
    caseId: "harbour",
    edits: {},
    actions: {},
    step: 0,
    drawer: false,
  };

  let toastTimer = 0;
  let lastFocusView = "";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const E = () => window.PPEngine;
  const money = (n) => E().money(n);

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function currentCase() {
    return window.PPData.caseById(state.caseId);
  }

  function blankActions() {
    return {
      walkthrough: false,
      sent: false,
      revised: false,
      reason: "",
      includeCompliance: false,
      replySaved: false,
      frequency: "",
    };
  }

  function actions() {
    return { ...blankActions(), ...(state.actions[state.caseId] || {}) };
  }

  function patchActions(partial) {
    state.actions[state.caseId] = { ...actions(), ...partial };
    persist();
  }

  function profile() {
    const base = currentCase().profile;
    if (state.caseId !== "harbour") return { ...base };
    return { ...base, ...state.edits };
  }

  function assessment() {
    const person = profile();
    const act = actions();
    return E().assess({ ...person, preference: act.frequency || person.preference || "auto" });
  }

  function situation(record, result, act) {
    if (record.outcome === "defaulted") return "defaulted";
    if (record.outcome === "declined") return "declined";
    if (record.outcome === "accepted") return "accepted";
    if (!result.viable) return "unviable";
    if (act.sent) return "sent";
    if (result.sdaReview) return "review";
    return "preparing";
  }

  function pillMeta(sit) {
    return {
      preparing: ["Preparing", "info"],
      review: ["SDA review", "warn"],
      sent: ["Lodgement requested", "info"],
      accepted: ["Accepted", "good"],
      declined: ["Not accepted", "bad"],
      defaulted: ["Payment missed", "bad"],
      unviable: ["Not affordable", "bad"],
    }[sit];
  }

  function pill(text, tone) {
    return `<span class="pill pill-${tone}">${esc(text)}</span>`;
  }

  function toneFor(label) {
    if (label === "Yes" || label === "Higher") return "good";
    if (label === "No" || label === "Unlikely") return "bad";
    return "warn";
  }

  function meterLevel(label) {
    if (label === "Higher") return 3;
    if (label === "Moderate") return 2;
    if (label === "Lower") return 1;
    return 0;
  }

  function each(id) {
    return E().each(id);
  }

  function phrase(amount, frequency) {
    return `${money(amount)} ${each(frequency)}`;
  }

  function showDate(value) {
    if (!value) return "";
    const date = typeof value === "string" ? E().parseDate(value) : value;
    return E().formatDate(date);
  }

  function icon(name) {
    const paths = {
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      overview: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
      details: '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>',
      recommend: '<path d="M4 16l5-5 4 3 7-7"/><path d="M14 7h6v6"/>',
      proposal: '<path d="M7 3.5h7l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V9h5M8 13h8M8 17h6"/>',
      monitoring: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
      response: '<path d="M5 6h14v9H8l-3 3z"/>',
      activity: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
  }

  function persist() {
    sessionStorage.setItem(KEY, JSON.stringify({
      authed: state.authed,
      caseId: state.caseId,
      view: state.view,
      edits: state.edits,
      actions: state.actions,
      step: state.step,
    }));
  }

  function restore() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.authed) state.authed = true;
      if (data.caseId && window.PPData.caseById(data.caseId)) state.caseId = data.caseId;
      if (data.edits && typeof data.edits === "object") state.edits = data.edits;
      if (data.actions && typeof data.actions === "object") state.actions = data.actions;
      if (Number.isInteger(data.step)) state.step = Math.min(3, Math.max(0, data.step));
      if (VIEWS.includes(data.view)) state.view = data.view;
    } catch (error) {
      sessionStorage.removeItem(KEY);
    }
  }

  function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function viewFromHash() {
    const view = location.hash.replace(/^#\//, "");
    return VIEWS.includes(view) ? view : "";
  }

  function go(view) {
    state.view = view;
    const next = `#/${view}`;
    if (location.hash !== next) location.hash = next;
    else render({ scroll: true });
  }

  function capture() {
    if (state.caseId !== "harbour") return;
    const form = document.getElementById("details-form");
    if (!form) return;
    const next = { ...state.edits };
    form.querySelectorAll("[data-field]").forEach((el) => {
      const key = el.dataset.field;
      if (el.type === "radio") {
        if (el.checked) next[key] = el.value === "yes" ? true : el.value === "no" ? false : el.value;
        return;
      }
      if (el.dataset.kind === "money") {
        const amount = Number(el.value || 0);
        next[key] = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        return;
      }
      next[key] = el.value;
    });
    state.edits = next;
    persist();
  }

  function scheduleFor(record, result) {
    if (record.outcome !== "accepted" && record.outcome !== "defaulted") return [];
    const start = record.scheduleStart ? E().parseDate(record.scheduleStart) : E().firstPaymentDate(new Date());
    return E().buildSchedule(result, { start, missMode: record.missMode || "" });
  }

  function planStart(record, mode) {
    if ((record.outcome === "accepted" || record.outcome === "defaulted") && record.scheduleStart) {
      return E().parseDate(record.scheduleStart);
    }
    if (mode === "lodged" && record.lodgedOffer) return E().firstPaymentDate(E().parseDate(record.lodgedOffer.sentOn));
    return E().firstPaymentDate(new Date());
  }

  function activeOffer(record, result, act) {
    if (record.outcome === "declined" && record.lodgedOffer && !act.revised) {
      return {
        amount: record.lodgedOffer.amount,
        frequency: record.lodgedOffer.frequency,
        payments: record.lodgedOffer.payments,
        lastAmount: record.lodgedOffer.lastAmount,
        termMonths: record.lodgedOffer.months,
        source: "lodged",
      };
    }
    return {
      amount: result.amount,
      frequency: result.frequency,
      payments: result.payments,
      lastAmount: result.lastAmount,
      termMonths: result.termMonths,
      source: act.revised ? "revised" : "recommended",
    };
  }

  function lede(sit, person, result) {
    if (sit === "unviable") return "These figures do not support a plan the business can keep. SDA has been notified.";
    if (sit === "review") return `The debt is over $200,000. The suggested plan is ${phrase(result.amount, result.frequency)}. SDA reviews it with you before anything is sent.`;
    if (sit === "sent") return `Safeguard has been asked to send a plan of ${phrase(result.amount, result.frequency)}. Nothing leaves this demonstration.`;
    if (sit === "accepted") return "The ATO accepted this plan. Safeguard is watching the schedule.";
    if (sit === "declined") return `The ATO did not accept the lodged plan. A shorter plan of ${phrase(result.amount, result.frequency)} still fits the cashflow.`;
    if (sit === "defaulted") return `A payment was missed. SDA has been notified and may phone ${person.directorName}.`;
    if (!result.viable) return "Add the debt and cashflow to prepare a recommendation.";
    return `A plan of ${phrase(result.amount, result.frequency)} fits the current surplus and sits on a term that is realistic to put to the ATO.`;
  }

  function bannerFor(sit, record, result, act) {
    const person = profile();
    if (sit === "unviable") {
      const held = act.sent ? " The earlier lodgement request is on hold because the figures no longer support a plan." : "";
      return `<div class="banner banner-bad"><strong>This plan should not be lodged.</strong><p>${esc(result.checks.cashflow.detail)} ${esc(SDA_CALL)}${esc(held)}</p></div>`;
    }
    if (sit === "review") {
      const accountant = person.accountantInvolved && person.accountantName
        ? ` ${esc(person.accountantName)} can join that conversation.`
        : "";
      const done = act.walkthrough
        ? `<p>Walkthrough requested. SDA will phone ${esc(person.directorName)} on ${esc(person.mobile)}.${accountant} In the live service the letter stays with SDA until that conversation is finished. Here you can continue when you are ready.</p>`
        : `<p>Because the debt is over $200,000, SDA reviews the recommendation and walks ${esc(person.directorName)} through it.${accountant} Safeguard’s tax agent sends the letter only when you ask.</p>`;
      return `<div class="banner banner-warn"><strong>SDA review</strong>${done}</div>`;
    }
    if (sit === "declined") {
      const sent = act.sent ? " Safeguard has been asked to send the reply. Nothing is sent to the ATO from this demonstration." : " A revised instalment and a reply can be prepared on the ATO response page.";
      return `<div class="banner banner-bad"><strong>The ATO did not accept the lodged plan.</strong><p>${esc(SDA_CALL)}${esc(sent)}</p></div>`;
    }
    if (sit === "defaulted") {
      return `<div class="banner banner-bad"><strong>A scheduled payment was missed.</strong><p>${esc(SDA_CALL)}</p></div>`;
    }
    if (sit === "accepted") {
      return `<div class="banner banner-good"><strong>The ATO accepted this plan.</strong><p>Safeguard checks payments against the schedule. If one is missed, SDA is notified.</p></div>`;
    }
    if (sit === "sent") {
      return `<div class="banner banner-info"><strong>Lodgement requested.</strong><p>Safeguard’s tax agent has this letter. Nothing is sent to the ATO from this demonstration.</p></div>`;
    }
    if (!result.lodged && result.viable) {
      return `<div class="banner banner-warn"><strong>Lodgements are outstanding.</strong><p>Bring activity statements and income tax returns up to date before Safeguard sends the proposal.</p></div>`;
    }
    return "";
  }

  function checklist(sit, record, result, act) {
    const items = [
      { label: "Business details on file", done: true },
      { label: "Recommendation prepared", done: result.debt > 0 && result.viable },
    ];
    if (result.sdaReview && result.viable) items.push({ label: "SDA walkthrough requested", done: act.walkthrough });
    if (sit === "unviable") items.push({ label: "SDA notified — plan not affordable", done: true, alert: true });
    else items.push({ label: "Letter requested", done: act.sent || ["accepted", "declined", "defaulted"].includes(record.outcome) });
    if (record.outcome === "accepted") items.push({ label: "ATO accepted the plan", done: true });
    if (record.outcome === "declined") {
      items.push({ label: "ATO did not accept the plan", done: true, alert: true });
      items.push({ label: "SDA notified", done: true, alert: true });
    }
    if (record.outcome === "defaulted") items.push({ label: "Missed payment — SDA notified", done: true, alert: true });
    if (sit === "accepted") items.push({ label: "Schedule being watched", done: true });
    return `<ul class="checklist">${items.map((item) => `<li class="check-item${item.done ? " is-done" : ""}${item.alert ? " is-alert" : ""}"><i class="dot" aria-hidden="true"></i><span>${esc(item.label)}</span></li>`).join("")}</ul>`;
  }

  function cashCard(person, result) {
    if (result.surplus <= 0 || !result.viable) {
      return `<section class="card"><h2>Monthly cashflow</h2><p class="lede">${esc(result.checks.cashflow.detail)}</p></section>`;
    }
    const exp = Math.max(0, person.expenses);
    const com = Math.max(0, person.commitments);
    const buf = Math.max(0, result.buffer);
    const pay = Math.max(0, result.monthlyDraw);
    const rest = Math.max(0, person.revenue - exp - com - buf - pay);
    const parts = [
      ["Expenses", exp, "exp"],
      ["Commitments", com, "com"],
      ["Buffer", buf, "buf"],
      ["ATO plan", pay, "pay"],
      ["Remaining", rest, "rest"],
    ];
    const total = parts.reduce((sum, part) => sum + part[1], 0) || 1;
    const label = parts.map((part) => `${part[0]} ${money(part[1])}`).join(", ");
    return `<section class="card">
      <h2>Monthly cashflow</h2>
      <p class="lede">${esc(result.checks.cashflow.detail)}</p>
      <div class="bar" role="img" aria-label="${esc(label)}" style="margin-top:16px">
        ${parts.map((part) => `<span class="seg-${part[2]}" style="width:${(part[1] / total) * 100}%"></span>`).join("")}
      </div>
      <ul class="legend">${parts.map((part) => `<li><i class="swatch ${part[2]}"></i>${esc(part[0])} <span>${money(part[1])}</span></li>`).join("")}</ul>
    </section>`;
  }

  function featureBlock(sit, result) {
    if (!result.viable) {
      const needed = result.gap ? money(result.gap.neededMonthly) : "—";
      const available = result.gap ? money(result.gap.available) : "—";
      const months = result.gap ? result.gap.maxTerm : result.maxTerm;
      return `<section class="feature feature-alert">
        <p class="eyebrow">No plan recommended</p>
        <h2>The business cannot meet a realistic instalment</h2>
        <p>About ${needed} a month would be needed over ${months} months. About ${available} is available after a buffer.</p>
        <a class="btn btn-light" href="#/recommendation">See the comparison <span class="arrow">→</span></a>
      </section>`;
    }
    const href = sit === "declined" ? "#/response" : sit === "accepted" || sit === "defaulted" ? "#/monitoring" : "#/recommendation";
    const label = sit === "declined" ? "Prepare a reply" : sit === "accepted" || sit === "defaulted" ? "View the schedule" : "Review the recommendation";
    return `<section class="feature">
      <p class="eyebrow">${sit === "declined" ? "Revised instalment" : "Recommended instalment"}</p>
      <p class="amount" data-count="${Math.round(result.amount)}">$0</p>
      <p class="amount-sub">${esc(each(result.frequency))} · about ${result.termMonths} months</p>
      <div class="meter" data-level="${meterLevel(result.likelihood)}" aria-hidden="true"><i></i><i></i><i></i></div>
      <p>Outlook: ${esc(result.likelihood)}</p>
      <a class="btn btn-light" href="${href}">${label} <span class="arrow">→</span></a>
    </section>`;
  }

  function stat(label, value, note, count) {
    const figure = count == null ? esc(value) : "$0";
    const attr = count == null ? "" : ` data-count="${Math.round(count)}"`;
    return `<article class="stat"><p>${esc(label)}</p><strong${attr}>${figure}</strong><span>${esc(note)}</span></article>`;
  }

  function dashboard() {
    const record = currentCase();
    const person = profile();
    const result = assessment();
    const act = actions();
    const sit = situation(record, result, act);
    const [status, tone] = pillMeta(sit);
    const instalmentNote = sit === "declined" && record.lodgedOffer
      ? `Lodged was ${phrase(record.lodgedOffer.amount, record.lodgedOffer.frequency)}`
      : `${each(result.frequency)} · ${result.payments || 0} payments`;
    const instalment = result.viable ? phrase(result.amount, result.frequency) : "Not recommended";
    return `<header>
      <p class="eyebrow">Director · ${esc(person.directorName)}</p>
      <h1>${esc(person.companyName)}</h1>
      <p class="subline">ABN ${esc(person.abn)} · ${esc(person.trade)}</p>
      <p class="lede">${esc(lede(sit, person, result))}</p>
    </header>
    ${bannerFor(sit, record, result, act)}
    <section class="stats" aria-label="Plan summary">
      ${stat("ATO debt", money(result.debt), "Balance entered", result.debt)}
      ${stat(sit === "declined" ? "Revised instalment" : "Instalment", instalment, result.viable ? instalmentNote : "Cashflow does not cover it", result.viable ? result.amount : null)}
      ${stat("Term", result.viable ? `About ${result.termMonths} months` : `${result.maxTerm} months`, result.viable ? E().freqMeta[result.frequency].name : "Longest term tested")}
      ${stat("Outlook", result.likelihood, sit === "review" ? "SDA reviews this first" : "Safeguard assessment")}
    </section>
    <div class="grid-2">
      ${featureBlock(sit, result)}
      <section class="card">
        <p class="eyebrow">Progress</p>
        <h2>${esc(status)}</h2>
        <div style="margin-top:14px">${checklist(sit, record, result, act)}</div>
      </section>
    </div>
    ${cashCard(person, result)}
    ${state.caseId === "harbour" ? `<p class="note">Other sample outcomes are in the sidebar: a debt over $200,000, an accepted plan, a declined plan, a missed payment, and a business that cannot afford a plan.</p>` : ""}`;
  }

  function moneyField(key, label, value, locked) {
    return `<label class="field"><span>${esc(label)}</span><span class="money-field"><span aria-hidden="true">$</span><input data-field="${key}" data-kind="money" inputmode="decimal" min="0" step="1" type="number" value="${Number(value) || 0}" ${locked ? "disabled" : ""} /></span></label>`;
  }

  function textField(key, label, value, locked, hint) {
    return `<label class="field"><span>${esc(label)}</span><input type="text" data-field="${key}" value="${esc(value)}" ${locked ? "disabled" : ""} autocomplete="off" />${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
  }

  function yesNo(key, label, value, locked, hint) {
    return `<fieldset class="field wide"><legend>${esc(label)}</legend>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}<div class="seg">
      <label class="choice${value ? " is-on" : ""}"><input type="radio" name="${key}" data-field="${key}" data-rerender="true" value="yes" ${value ? "checked" : ""} ${locked ? "disabled" : ""} /> Yes</label>
      <label class="choice${!value ? " is-on" : ""}"><input type="radio" name="${key}" data-field="${key}" data-rerender="true" value="no" ${!value ? "checked" : ""} ${locked ? "disabled" : ""} /> No</label>
    </div></fieldset>`;
  }

  function details() {
    const person = profile();
    const locked = state.caseId !== "harbour";
    const act = actions();
    const step = state.step;
    const shownPref = act.frequency || person.preference || "auto";
    const abnDigits = String(person.abn || "").replace(/\D/g, "").length;
    const steps = ["Company", "ATO debt", "Cashflow", "Compliance"];
    const debt = ["gst", "payg", "incomeTax", "sgc", "other"].reduce((sum, key) => sum + (Number(person[key]) || 0), 0);
    const surplus = (Number(person.revenue) || 0) - (Number(person.expenses) || 0) - (Number(person.commitments) || 0);
    let body = "";
    if (step === 0) {
      body = `${textField("companyName", "Company name", person.companyName, locked)}
        ${textField("abn", "ABN", person.abn, locked, abnDigits === 11 ? "11 digits." : "Enter 11 digits.")}
        ${textField("trade", "Trade", person.trade, locked)}
        ${textField("directorName", "Director", person.directorName, locked)}
        ${textField("mobile", "Director mobile", person.mobile, locked, "SDA phones this number.")}`;
    } else if (step === 1) {
      body = `${moneyField("gst", "GST", person.gst, locked)}
        ${moneyField("payg", "PAYG withholding", person.payg, locked)}
        ${moneyField("incomeTax", "Income tax", person.incomeTax, locked)}
        ${moneyField("sgc", "Super guarantee charge", person.sgc, locked)}
        ${moneyField("other", "Other tax debt", person.other, locked)}
        <p class="field wide hint" id="debt-note">Total ATO debt: <strong id="debt-total">${money(debt)}</strong>. If the total is over $200,000, SDA reviews the plan before it is sent.</p>`;
    } else if (step === 2) {
      body = `${moneyField("revenue", "Average monthly revenue", person.revenue, locked)}
        ${moneyField("expenses", "Average monthly operating costs", person.expenses, locked)}
        ${moneyField("commitments", "Existing loan and essential commitments", person.commitments, locked)}
        <label class="field"><span>Payment frequency</span><select data-field="preference" ${locked ? "disabled" : ""}>
          ${[["auto", "No preference"], ["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"]].map(([value, label]) => `<option value="${value}" ${shownPref === value ? "selected" : ""}>${label}</option>`).join("")}
        </select><span class="hint">If you leave this open, the recommendation picks a frequency from the size of the payment.</span></label>
        <label class="field wide"><span>Note for the letter</span><textarea data-field="cashNotes" maxlength="500" ${locked ? "disabled" : ""}>${esc(person.cashNotes)}</textarea></label>
        <p class="field wide hint" id="surplus-line">${surplus >= 0 ? `Monthly surplus before the buffer: ${money(surplus)}.` : `Costs are above revenue by ${money(Math.abs(surplus))} a month.`}</p>`;
    } else {
      body = `${yesNo("lodged", "Are activity statements and income tax returns lodged up to date?", person.lodged, locked)}
        ${yesNo("priorDefault", "Has a previous ATO payment plan been left unfinished?", person.priorDefault, locked)}
        <label class="field"><span>How old is the debt?</span><select data-field="debtAge" ${locked ? "disabled" : ""}>
          ${[["under-3", "Under 3 months"], ["3-12", "3 to 12 months"], ["over-12", "Over 12 months"]].map(([value, label]) => `<option value="${value}" ${person.debtAge === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></label>
        ${yesNo("accountantInvolved", "Should the company’s accountant be included?", person.accountantInvolved, locked, "Used if SDA walks you through a larger debt.")}
        ${person.accountantInvolved ? `${textField("accountantName", "Accountant", person.accountantName, locked)}${textField("accountantPhone", "Accountant mobile", person.accountantPhone, locked)}` : ""}`;
    }
    return `<header>
      <p class="eyebrow">${esc(profile().companyName)}</p>
      <h1>Business details</h1>
      <p class="lede">These figures drive the recommendation. The first test is whether the business can pay. The second is whether the term is realistic to put to the ATO.</p>
    </header>
    ${locked ? `<div class="banner banner-info lock-note"><strong>This sample is locked.</strong><p>Switch to Harbour Lane in the sidebar to edit figures and recalculate.</p></div>` : ""}
    <form id="details-form" class="card" autocomplete="off">
      <div class="wizard" role="tablist" aria-label="Detail steps">
        ${steps.map((label, index) => `<button type="button" role="tab" aria-selected="${index === step}" class="${index === step ? "is-on" : ""}" data-action="step" data-step="${index}">${label}</button>`).join("")}
      </div>
      <div class="fields">${body}</div>
      <div class="row-actions" style="margin-top:18px">
        ${step > 0 ? `<button type="button" class="btn btn-ghost" data-action="step" data-step="${step - 1}">Back</button>` : "<span></span>"}
        ${step < 3
          ? `<button type="button" class="btn btn-primary" data-action="step" data-step="${step + 1}">Continue</button>`
          : locked
            ? `<a class="btn btn-primary" href="#/recommendation">View recommendation</a>`
            : `<button type="submit" class="btn btn-primary">Update recommendation</button>`}
      </div>
    </form>`;
  }

  function recommendation() {
    const record = currentCase();
    const person = profile();
    const result = assessment();
    const act = actions();
    const sit = situation(record, result, act);
    const checks = ["cashflow", "ato"].map((key) => {
      const title = key === "cashflow" ? "Can the business meet it?" : "Is it realistic to put to the ATO?";
      const item = result.checks[key];
      const tone = toneFor(item.label);
      return `<div class="check"><div><b>${title}</b><p>${esc(item.detail)}</p></div><em class="tag tag-${tone}">${esc(item.label)}</em></div>`;
    }).join("");
    let hero = "";
    if (!result.viable) {
      hero = `<div class="gap-grid">
        <article class="kv card"><p>Needed for a realistic term</p><strong>${money(result.gap.neededMonthly)}</strong><span>a month, over ${result.gap.maxTerm} months</span></article>
        <article class="kv card"><p>Available after a buffer</p><strong>${money(result.gap.available)}</strong><span>from current monthly cashflow</span></article>
      </div>`;
    } else {
      hero = `<section class="feature">
        <p class="eyebrow">Recommended plan</p>
        <p class="amount" data-count="${Math.round(result.amount)}">$0</p>
        <p class="amount-sub">${esc(each(result.frequency))} · about ${result.termMonths} months · ${result.payments} payments</p>
        <div class="meter" data-level="${meterLevel(result.likelihood)}" aria-hidden="true"><i></i><i></i><i></i></div>
        <p>Outlook: ${esc(result.likelihood)}. ${result.lastAmount && Math.abs(result.lastAmount - result.amount) > 1 ? `Final payment ${money(result.lastAmount)}.` : ""}</p>
      </section>
      <section class="card"><h2>The two tests</h2>${checks}</section>`;
    }
    const options = result.viable ? `<section><h2 style="font-family:var(--serif);font-weight:560;margin-bottom:10px">Frequency</h2><div class="freq-grid">${result.options.map((option) => {
      const meta = E().freqMeta[option.id];
      const on = option.id === result.frequency;
      return `<button type="button" class="freq${on ? " is-on" : ""}" data-action="set-frequency" data-freq="${option.id}" ${option.available ? "" : "disabled"}>
        <span>${meta.name}</span><strong>${money(option.amount)}</strong><small>${meta.each} · ${option.payments} payments</small>
      </button>`;
    }).join("")}</div><p class="hint" style="margin-top:8px">The monthly total stays the same. Weekly payments show a steady pattern. Monthly payments are simpler to manage.</p></section>` : `<section class="card"><h2>The two tests</h2>${checks}</section>`;
    return `<header>
      <p class="eyebrow">${esc(person.companyName)}</p>
      <h1>Recommendation</h1>
      <p class="lede">The instalment has to be payable after a buffer, and the term has to be realistic for the size of the debt. This is Safeguard’s assessment, not an ATO ruling. General interest charge may still accrue until the debt is paid.</p>
    </header>
    ${bannerFor(sit, record, result, act)}
    ${result.viable ? `<div class="grid-2">${hero}</div>` : hero}
    ${options}
    <details class="how"><summary>How this amount was set</summary><ul>${result.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul></details>
    <div class="row-actions no-print">
      <a class="btn btn-ghost" href="#/details">Edit details</a>
      ${sit === "review" && !act.walkthrough ? `<button type="button" class="btn btn-primary" data-action="walkthrough">Request a walkthrough</button>` : ""}
      ${result.viable ? `<a class="btn ${sit === "review" && !act.walkthrough ? "btn-ghost" : "btn-primary"}" href="#/proposal">Continue to the proposal <span class="arrow">→</span></a>` : `<a class="btn btn-primary" href="#/activity">See the SDA note</a>`}
    </div>`;
  }

  function letterHtml(record, result, offer, mode) {
    const person = profile();
    const start = planStart(record, mode);
    const stamp = {
      draft: ["Draft", "info"],
      lodged: ["Not accepted", "bad"],
      revised: ["Revised draft", "warn"],
      accepted: ["Accepted", "good"],
      sent: ["Requested", "info"],
      review: ["For SDA review", "warn"],
    }[mode] || ["Draft", "info"];
    const rows = [
      ["GST", result.parts.gst],
      ["PAYG withholding", result.parts.payg],
      ["Income tax", result.parts.incomeTax],
      ["Super guarantee charge", result.parts.sgc],
      ["Other tax debt", result.parts.other],
    ].filter((row) => row[1] > 0);
    const finalBit = offer.lastAmount && Math.abs(offer.lastAmount - offer.amount) > 1
      ? ` The final payment is ${money(offer.lastAmount)}.`
      : "";
    let opening = `We act for ${person.companyName} and propose the following payment arrangement for the taxation debt below.`;
    if (mode === "lodged") opening = `The following payment arrangement for ${person.companyName} was lodged and was not accepted.`;
    if (mode === "revised") opening = `We act for ${person.companyName} and propose this revised payment arrangement, in place of the plan lodged on ${showDate(record.lodgedOffer.sentOn)}.`;
    if (mode === "accepted") opening = `The following payment arrangement for ${person.companyName} was accepted by the ATO.`;
    const afford = mode === "lodged"
      ? "The company can meet this instalment from monthly cashflow after operating costs, existing commitments, and a buffer for the business."
      : `The instalment uses about ${money(result.monthlyDraw)} a month. After costs, commitments, and a buffer of ${money(result.buffer)}, about ${money(result.capacity)} remains available, so the business can meet this and keep operating.`;
    const compliance = result.lodged
      ? "All activity statements and income tax returns are up to date."
      : "Outstanding lodgements will be brought up to date before this proposal is lodged.";
    const prior = result.priorDefault ? " An earlier payment arrangement was not completed, so this term has been kept shorter." : "";
    const note = String(person.cashNotes || "").trim();
    const accountant = person.accountantInvolved && person.accountantName
      ? `<p>Accountant: ${esc(person.accountantName)}${person.accountantPhone ? ` · ${esc(person.accountantPhone)}` : ""}</p>`
      : "";
    return `<article class="letter">
      <div class="stamp stamp-${stamp[1]}">${stamp[0]}</div>
      <header><div><strong>Safeguard</strong><span>Designated tax agent</span></div><div class="ref">${esc(person.ref)}</div></header>
      <p>${esc(showDate(mode === "lodged" && record.lodgedOffer ? record.lodgedOffer.sentOn : mode === "accepted" && record.acceptedOn ? record.acceptedOn : new Date()))}</p>
      <p style="margin-top:14px">Australian Taxation Office</p>
      <h2>Payment arrangement</h2>
      <p><strong>Re: ${esc(person.companyName)} · ABN ${esc(person.abn)}</strong></p>
      <p style="margin-top:12px">${esc(opening)}</p>
      <table><tbody>
        ${rows.map((row) => `<tr><td>${esc(row[0])}</td><td>${money(row[1])}</td></tr>`).join("")}
        <tr><td><strong>Total</strong></td><td><strong>${money(result.debt)}</strong></td></tr>
      </tbody></table>
      <p>We propose ${money(offer.amount)} ${esc(each(offer.frequency))}, commencing ${esc(E().formatDate(start))}. That is about ${offer.termMonths} months and ${offer.payments} payments.${esc(finalBit)}</p>
      <p style="margin-top:12px">${afford}</p>
      ${note ? `<p style="margin-top:12px">${esc(note)}</p>` : ""}
      <p style="margin-top:12px">${esc(compliance)}${esc(prior)} General interest charge may continue until the balance is paid. The instalment is based on the debt entered here, before future interest.</p>
      <p style="margin-top:12px">We ask that the ATO accept this arrangement. The director can be reached on the mobile below.</p>
      <div class="sign"><p>Yours faithfully</p><p style="margin-top:18px"><strong>Safeguard</strong><br />Designated tax agent<br />For ${esc(person.companyName)}</p>
      <p style="margin-top:12px">Director: ${esc(person.directorName)} · ${esc(person.mobile)}</p>${accountant}</div>
    </article>`;
  }

  function proposal() {
    const record = currentCase();
    const person = profile();
    const result = assessment();
    const act = actions();
    const sit = situation(record, result, act);
    if (!result.viable && record.outcome !== "declined") {
      return `<header><p class="eyebrow">${esc(person.companyName)}</p><h1>Proposal</h1><p class="lede">No letter is prepared while the plan is not affordable.</p></header>
        ${bannerFor(sit, record, result, act)}
        <a class="btn btn-primary" href="#/recommendation">Back to the recommendation</a>`;
    }
    const offer = activeOffer(record, result, act);
    let mode = "draft";
    if (sit === "accepted" || sit === "defaulted") mode = "accepted";
    else if (sit === "declined" && !act.revised) mode = "lodged";
    else if (sit === "declined" && act.revised) mode = "revised";
    else if (sit === "sent") mode = "sent";
    else if (sit === "review") mode = "review";
    const canSend = result.viable && result.lodged && (!result.sdaReview || act.walkthrough) && sit !== "accepted" && sit !== "defaulted";
    let actionsHtml = "";
    if (sit === "accepted" || sit === "defaulted") {
      actionsHtml = `<a class="btn btn-primary" href="#/monitoring">View the schedule</a>`;
    } else if (sit === "declined") {
      actionsHtml = act.sent
        ? `<button type="button" class="btn btn-primary" disabled>Reply requested</button>`
        : `<a class="btn btn-ghost" href="#/response">Edit the reply</a>${act.revised || (act.includeCompliance && act.reason) ? `<button type="button" class="btn btn-primary" data-action="send">Ask Safeguard to send this reply</button>` : `<a class="btn btn-primary" href="#/response">Prepare the reply first</a>`}`;
    } else if (sit === "review" && !act.walkthrough) {
      actionsHtml = `<button type="button" class="btn btn-primary" data-action="walkthrough">Request a walkthrough</button>`;
    } else if (sit === "sent") {
      actionsHtml = `<button type="button" class="btn btn-primary" disabled>Lodgement requested</button>`;
    } else if (!result.lodged) {
      actionsHtml = `<button type="button" class="btn btn-primary" disabled>Bring lodgements up to date first</button>`;
    } else if (canSend) {
      const label = result.sdaReview ? "Ask Safeguard to send the letter" : "Ask Safeguard to lodge this proposal";
      actionsHtml = `${result.sdaReview && !act.walkthrough ? "" : `<button type="button" class="btn btn-primary" data-action="send">${label}</button>`}`;
      if (result.sdaReview && act.walkthrough) {
        actionsHtml = `<button type="button" class="btn btn-primary" data-action="send">Ask Safeguard to send the letter</button>`;
      }
    }
    return `<header class="no-print">
      <p class="eyebrow">${esc(person.companyName)}</p>
      <h1>Proposal</h1>
      <p class="lede">Safeguard’s designated tax agent lodges the formal proposal when you ask. ${result.sdaReview ? "For a debt over $200,000, that happens after the SDA walkthrough." : ""}</p>
    </header>
    <div class="no-print">${bannerFor(sit, record, result, act)}</div>
    <div class="row-actions no-print">
      <button type="button" class="btn btn-ghost" data-action="print">Print letter</button>
      ${actionsHtml}
    </div>
    ${letterHtml(record, result, offer, mode)}
    <p class="note no-print">Preparation and later monitoring sit under the Safeguard engagement. The fee is agreed separately and is not shown here. General interest charge is not calculated on this screen.</p>`;
  }

  function monitoring() {
    const record = currentCase();
    const person = profile();
    const result = assessment();
    const act = actions();
    const sit = situation(record, result, act);
    const items = scheduleFor(record, result);
    if (!items.length) {
      return `<header><p class="eyebrow">${esc(person.companyName)}</p><h1>Monitoring</h1></header>
        <section class="empty"><h2>No schedule yet</h2><p class="lede">Monitoring starts once the ATO accepts a plan. A missed payment notifies SDA.</p>
        ${state.caseId === "harbour" ? `<p class="note" style="margin-top:8px">Brightpath Services and Lumen Contracting show this stage.</p>` : ""}</section>`;
    }
    const paid = items.filter((item) => item.status === "paid").length;
    const missed = items.filter((item) => item.status === "missed");
    const due = items.find((item) => item.status === "due");
    const remaining = items.filter((item) => item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
    const width = Math.round((paid / items.length) * 100);
    const labels = { paid: "Paid", due: "Due", scheduled: "Scheduled", missed: "Missed" };
    return `<header>
      <p class="eyebrow">${esc(person.companyName)}</p>
      <h1>Monitoring</h1>
      <p class="lede">${phrase(result.amount, result.frequency)} · ${items.length} payments · reference ${esc(person.ref)}</p>
    </header>
    ${bannerFor(sit, record, result, act)}
    <section class="stats">
      ${stat("Paid", String(paid), `of ${items.length} payments`)}
      ${stat("Remaining", money(remaining), "Including anything unpaid", remaining)}
      ${stat(missed.length ? "Missed" : "Next payment", missed.length ? showDate(missed[0].date) : due ? showDate(due.date) : "Complete", missed.length ? money(missed[0].amount) : due ? money(due.amount) : "Nothing owing")}
      ${stat("Status", missed.length ? "Behind" : "On track", missed.length ? "SDA notified" : "No missed payments")}
    </section>
    <section class="card">
      <div class="progress${missed.length ? " is-bad" : ""}" role="meter" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="${paid}" aria-label="Payments made"><span style="width:${width}%"></span></div>
      <p class="hint" style="margin:10px 0 14px">${paid} of ${items.length} payments recorded as met.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        ${items.map((item) => `<tr class="${item.status === "missed" ? "is-missed" : item.status === "due" ? "is-due" : ""}"><td>${item.index}</td><td>${esc(E().formatDate(item.date))}</td><td>${money(item.amount)}</td><td><span class="status status-${item.status}">${labels[item.status]}</span></td></tr>`).join("")}
      </tbody></table></div>
    </section>`;
  }

  function complianceCopy(reason, lodged) {
    if (!lodged) return "Outstanding activity statements and income tax returns will be brought up to date before the company asks the ATO to reconsider. This note does not say that lodgements are already current.";
    return REASONS[reason] || "Select the reason that matches the company records to complete the note on past lodgements.";
  }

  function replyLines(record, result, act) {
    const person = profile();
    const lines = [`We act for ${person.companyName} (ABN ${person.abn}) regarding the payment arrangement lodged with the ATO.`];
    if (!result.viable) {
      lines.push(`The company cannot fund a shorter plan from current cashflow. About ${money(result.gap.neededMonthly)} a month would be needed over ${result.gap.maxTerm} months, and about ${money(result.gap.available)} is available after a buffer.`);
    } else if (act.revised) {
      lines.push(`The company can revise the proposal to ${phrase(result.amount, result.frequency)}, running for about ${result.termMonths} months (${result.payments} payments). This still leaves an operating buffer of ${money(result.buffer)}.`);
      if (Math.abs(result.lastAmount - result.amount) > 1) lines.push(`The final payment would be ${money(result.lastAmount)}.`);
    } else {
      lines.push("A revised instalment has not been added yet.");
    }
    if (act.includeCompliance) lines.push(complianceCopy(act.reason, result.lodged));
    lines.push("We ask the ATO to consider this response.");
    return lines;
  }

  function response() {
    const record = currentCase();
    const person = profile();
    const result = assessment();
    const act = actions();
    const sit = situation(record, result, act);
    if (record.outcome !== "declined") {
      return `<header><p class="eyebrow">${esc(person.companyName)}</p><h1>ATO response</h1></header>
        <section class="empty"><h2>Nothing to answer yet</h2><p class="lede">If the ATO does not accept the plan, the comments and a suggested reply will be prepared here.</p>
        ${state.caseId === "harbour" ? `<p class="note" style="margin-top:8px">The Kepler Retail sample shows a worked example.</p>` : ""}</section>`;
    }
    const offer = record.lodgedOffer;
    const feedback = record.feedback || [];
    const blocks = feedback.map((item) => {
      if (item.id === "term") {
        return `<section class="card"><h2>${esc(item.title)}</h2><p class="lede">${esc(item.body)}</p>
          <div class="table-wrap" style="margin-top:12px"><table class="data"><thead><tr><th></th><th>Lodged</th><th>Revised</th></tr></thead><tbody>
            <tr><td>Instalment</td><td>${esc(phrase(offer.amount, offer.frequency))}</td><td>${result.viable ? esc(phrase(result.amount, result.frequency)) : "Does not fit"}</td></tr>
            <tr><td>Term</td><td>About ${offer.months} months</td><td>${result.viable ? `About ${result.termMonths} months` : "—"}</td></tr>
            <tr><td>Cashflow</td><td>Affordable, and declined</td><td>${result.viable ? "Still fits, with a buffer" : esc(result.checks.cashflow.detail)}</td></tr>
            <tr><td>Outlook</td><td>Not accepted</td><td>${esc(result.likelihood)}</td></tr>
          </tbody></table></div>
          <div class="row-actions" style="margin-top:14px">${result.viable ? `<button type="button" class="btn btn-primary" data-action="use-revised" ${act.revised ? "disabled" : ""}>${act.revised ? "Revised instalment added" : "Use the revised instalment"}</button>` : ""}</div>
        </section>`;
      }
      return `<section class="card"><h2>${esc(item.title)}</h2><p class="lede">${esc(item.body)}</p>
        <label class="field" style="margin-top:12px"><span>Reason that matches the records</span>
          <select data-change="set-reason">
            <option value="">Select a reason</option>
            <option value="bookkeeper" ${act.reason === "bookkeeper" ? "selected" : ""}>Bookkeeper departed</option>
            <option value="trading" ${act.reason === "trading" ? "selected" : ""}>Short trading downturn</option>
            <option value="changeover" ${act.reason === "changeover" ? "selected" : ""}>Accounting system change</option>
          </select>
          <span class="hint">Use only a reason that matches the company records.</span>
        </label>
        <p class="reply" style="margin-top:12px">${esc(complianceCopy(act.reason, result.lodged))}</p>
        <label class="choice${act.includeCompliance ? " is-on" : ""}" style="margin-top:12px"><input type="checkbox" data-change="toggle-compliance" ${act.includeCompliance ? "checked" : ""} /> Include this note in the reply</label>
      </section>`;
    }).join("");
    const ready = (act.revised && result.viable) || (act.includeCompliance && act.reason);
    return `<header>
      <p class="eyebrow">${esc(person.companyName)}</p>
      <h1>ATO response</h1>
      <p class="lede">Feedback received ${esc(showDate(record.declinedOn))}. The lodged plan was ${esc(phrase(offer.amount, offer.frequency))} over about ${offer.months} months.</p>
    </header>
    ${bannerFor(sit, record, result, act)}
    ${blocks}
    <section class="card">
      <h2>Reply pack</h2>
      <div class="reply" id="reply-text" style="margin-top:12px">${esc(replyLines(record, result, act).join("\n\n"))}</div>
      <div class="row-actions" style="margin-top:14px">
        <button type="button" class="btn btn-ghost" data-action="copy-reply">Copy reply</button>
        <button type="button" class="btn btn-ghost" data-action="save-reply">Save reply pack</button>
        <button type="button" class="btn btn-primary" data-action="send" ${ready && !act.sent ? "" : "disabled"}>${act.sent ? "Reply requested" : "Ask Safeguard to send this reply"}</button>
      </div>
      ${act.sent ? `<p class="hint" style="margin-top:8px">Nothing is sent to the ATO from this demonstration.</p>` : ready ? "" : `<p class="hint" style="margin-top:8px">Add the revised instalment or a compliance note first.</p>`}
    </section>`;
  }

  function activityItems(record, result, act) {
    const person = profile();
    const items = [];
    let order = 0;
    const push = (date, title, body, tone) => items.push({ date, title, body, tone: tone || "", order: order++ });
    push(record.opened, "Details captured", `${person.companyName} was added with an ATO debt of ${money(result.debt)}.`);
    if (result.viable) push(record.opened, "Recommendation prepared", `${phrase(result.amount, result.frequency)} over about ${result.termMonths} months. Outlook: ${result.likelihood}.`);
    else push(record.opened, "Plan not affordable", `The cashflow does not cover a realistic instalment. ${SDA_CALL}`, "alert");
    if (result.sdaReview && result.viable) push(record.opened, "Held for SDA review", "The debt is over $200,000, so an adviser reviews the recommendation before lodgement.");
    if (record.lodgedOffer) push(record.lodgedOffer.sentOn, "Proposal lodged", `${phrase(record.lodgedOffer.amount, record.lodgedOffer.frequency)} was sent to the ATO.`);
    if (record.outcome === "declined") push(record.declinedOn, "ATO did not accept the plan", `Feedback is on the ATO response page. ${SDA_CALL}`, "alert");
    if (record.outcome === "accepted" || record.outcome === "defaulted") push(record.acceptedOn || record.scheduleStart, "ATO accepted the plan", "Monitoring started against the agreed schedule.");
    if (record.outcome === "defaulted") push(E().iso(new Date()), "Payment missed", `A scheduled payment was not met. ${SDA_CALL}`, "alert");
    if (act.walkthrough) push(E().iso(new Date()), "Walkthrough requested", `SDA will phone ${person.directorName} on ${person.mobile}.`);
    if (act.sent) push(E().iso(new Date()), "Letter requested", "Safeguard’s tax agent has been asked to send it. Nothing is sent from this demonstration.");
    if (act.revised) push(E().iso(new Date()), "Revised instalment selected", `${phrase(result.amount, result.frequency)} will be used in the reply.`);
    if (act.replySaved) push(E().iso(new Date()), "Reply pack saved", "The suggested reply is saved in this demonstration.");
    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.order - a.order));
  }

  function activity() {
    const record = currentCase();
    const person = profile();
    const result = assessment();
    const act = actions();
    const items = activityItems(record, result, act);
    return `<header>
      <p class="eyebrow">${esc(person.companyName)}</p>
      <h1>Activity</h1>
      <p class="lede">Safeguard prepares the plan and, when you ask, its tax agent sends the letter. SDA is told if the plan is not affordable, if the ATO does not accept it, or if a payment is missed.</p>
    </header>
    <section class="card">
      <h2>How follow-up works</h2>
      <p class="lede">If the debt is over $200,000, SDA reviews the recommendation with the director, and with the accountant where you ask, before the letter goes out. That review is separate from a call about other restructuring options.</p>
    </section>
    <ol class="timeline">${items.map((item) => `<li class="${item.tone === "alert" ? "tl-alert" : ""}"><time>${esc(showDate(item.date))}</time><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></li>`).join("")}</ol>
    <button type="button" class="btn btn-ghost" data-action="reset">Restore sample figures</button>`;
  }

  function page() {
    if (state.view === "details") return details();
    if (state.view === "recommendation") return recommendation();
    if (state.view === "proposal") return proposal();
    if (state.view === "monitoring") return monitoring();
    if (state.view === "response") return response();
    if (state.view === "activity") return activity();
    return dashboard();
  }

  function login() {
    return `<section class="login">
      <div class="login-story">
        <div>
          <div class="login-brand"><span class="brand-mark">S</span><span class="brand-text"><strong>Safeguard</strong><small>ATO payment plan</small></span></div>
          <h1>A payment plan the business can keep.</h1>
          <p class="lede">Prepared for the ATO, checked against cashflow, and lodged by Safeguard’s tax agent when you ask.</p>
          <ol class="login-steps">
            <li><span>1</span><div>Confirm the debt, cashflow, and lodgements.</div></li>
            <li><span>2</span><div>Review an instalment the business can pay.</div></li>
            <li><span>3</span><div>Ask Safeguard’s tax agent to send the proposal.</div></li>
            <li><span>4</span><div>Follow the schedule, or answer the ATO if the plan is not accepted.</div></li>
          </ol>
          <div class="preview-card">
            <p>Illustrative plan</p>
            <strong>$3,260</strong>
            <em>each fortnight · about 12 months</em>
            <ul><li>Fits the cash surplus</li><li>Realistic to put to the ATO</li></ul>
          </div>
        </div>
        <p class="login-legal">Debts over $200,000 are reviewed by SDA with you before the letter is sent. Not an Australian Taxation Office service.</p>
      </div>
      <div class="login-panel">
        <form id="login-form" class="login-card" autocomplete="off">
          <h2>Sign in</h2>
          <p class="hint">Filled in for this demonstration. Sign in to continue.</p>
          <label>Client reference<input name="client-reference" type="text" value="********" readonly aria-readonly="true" autocomplete="off" spellcheck="false" /></label>
          <label>Access code<input name="access-code" type="text" value="********" readonly aria-readonly="true" autocomplete="off" spellcheck="false" /></label>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        </form>
      </div>
    </section>`;
  }

  function shell(content) {
    const record = currentCase();
    const result = assessment();
    const sit = situation(record, result, actions());
    const [status, tone] = pillMeta(sit);
    const links = [
      ["dashboard", "Overview", "overview"],
      ["details", "Business details", "details"],
      ["recommendation", "Recommendation", "recommend"],
      ["proposal", "Proposal", "proposal"],
      ["monitoring", "Monitoring", "monitoring"],
      ["response", "ATO response", "response"],
      ["activity", "Activity", "activity"],
    ];
    return `<a class="skip" href="#main">Skip to content</a>
    <div class="shell">
      <button class="scrim" type="button" data-action="close-nav" aria-label="Close menu" tabindex="-1"></button>
      <aside class="sidebar${state.drawer ? " is-open" : ""}" id="nav">
        <div class="side-head">
          <div class="brand"><span class="brand-mark">S</span><span class="brand-text"><strong>Safeguard</strong><small>Payment plan</small></span></div>
          <button type="button" class="sidebar-close" data-action="close-nav" aria-label="Close menu">${icon("close")}</button>
        </div>
        <nav class="side-nav" aria-label="Sections">
          ${links.map(([id, label, glyph]) => `<a class="nav-link${state.view === id ? " is-on" : ""}" href="#/${id}" ${state.view === id ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span></a>`).join("")}
        </nav>
        <div class="side-spacer"></div>
        <label class="case-switch">Sample application
          <select data-change="switch-case" aria-label="Sample application">
            ${window.PPData.cases.map((item) => `<option value="${item.id}" ${item.id === state.caseId ? "selected" : ""}>${esc(item.label)}</option>`).join("")}
          </select>
        </label>
        <p class="side-foot">Demonstration data. Not an Australian Taxation Office service. Do not enter real client records.</p>
      </aside>
      <main class="main" id="main">
        <header class="topbar">
          <div class="top-left">
            <button type="button" class="menu-btn" data-action="open-nav" aria-label="Open menu" aria-expanded="${state.drawer ? "true" : "false"}">${icon("menu")}</button>
            <span class="top-kicker">${VIEW_LABEL[state.view]}</span>
          </div>
          <div class="top-actions">
            <span class="top-company">${esc(profile().companyName)}</span>
            ${pill(status, tone)}
            <button type="button" class="btn btn-ghost btn-sm" data-action="sign-out">Sign out</button>
          </div>
        </header>
        <div class="content"><div class="view" id="view">${content}</div></div>
      </main>
    </div>`;
  }

  function animateNumbers() {
    document.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      if (reduced) {
        el.textContent = money(target);
        return;
      }
      const started = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - started) / 650);
        const eased = 1 - (1 - t) ** 3;
        el.textContent = money(target * eased);
        if (t < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  function updateHints() {
    const debt = document.getElementById("debt-total");
    if (debt) {
      const total = ["gst", "payg", "incomeTax", "sgc", "other"].reduce((sum, key) => {
        const field = document.querySelector(`[data-field="${key}"]`);
        return sum + (Number(field && field.value) || 0);
      }, 0);
      debt.textContent = money(total);
    }
    const surplus = document.getElementById("surplus-line");
    if (surplus) {
      const value = (id) => Number((document.querySelector(`[data-field="${id}"]`) || {}).value || 0);
      const left = value("revenue") - value("expenses") - value("commitments");
      surplus.textContent = left >= 0
        ? `Monthly surplus before the buffer: ${money(left)}.`
        : `Costs are above revenue by ${money(Math.abs(left))} a month.`;
    }
  }

  function render(options) {
    const app = document.getElementById("app");
    if (!app) return;
    const narrow = window.matchMedia("(max-width: 960px)").matches;
    document.body.className = [state.authed ? "is-app" : "is-login", state.drawer && narrow ? "nav-open" : ""].filter(Boolean).join(" ");
    app.innerHTML = state.authed ? shell(page()) : login();
    animateNumbers();
    if (state.authed && state.view !== lastFocusView) {
      lastFocusView = state.view;
      const heading = document.querySelector("#view h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    if (!state.authed) lastFocusView = "";
    if (options && options.scroll) window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  function onHash() {
    if (!state.authed) return;
    capture();
    const view = viewFromHash();
    if (!view) return;
    state.view = view;
    state.drawer = false;
    persist();
    render({ scroll: true });
  }

  function signIn() {
    state.authed = true;
    state.view = "dashboard";
    state.drawer = false;
    persist();
    if (location.hash !== "#/dashboard") location.hash = "#/dashboard";
    else render({ scroll: false });
  }

  function signOut() {
    capture();
    state.authed = false;
    state.drawer = false;
    persist();
    if (location.hash) location.hash = "";
    render({ scroll: false });
  }

  function switchCase(id) {
    if (!window.PPData.cases.some((item) => item.id === id)) return;
    capture();
    state.caseId = id;
    state.step = 0;
    state.drawer = false;
    persist();
    toast(`${window.PPData.caseById(id).profile.companyName} loaded.`);
    render({ scroll: true });
  }

  function requestSend() {
    const record = currentCase();
    const result = assessment();
    const act = actions();
    const sit = situation(record, result, act);
    if (sit === "accepted" || sit === "defaulted") {
      toast("This plan is already with the ATO.");
      return;
    }
    if (record.outcome === "declined") {
      const ready = (act.revised && result.viable) || (act.includeCompliance && act.reason);
      if (!ready) {
        toast("Add a revised instalment or a compliance note first.");
        go("response");
        return;
      }
      patchActions({ sent: true, replySaved: true });
      toast("Reply requested. Nothing is sent to the ATO from this demonstration.");
      render();
      return;
    }
    if (!result.viable) {
      toast("This plan is not affordable, so it is not sent.");
      return;
    }
    if (!result.lodged) {
      toast("Bring lodgements up to date before sending.");
      return;
    }
    if (result.sdaReview && !act.walkthrough) {
      toast("Request a walkthrough before the letter is sent.");
      return;
    }
    patchActions({ sent: true });
    toast("Lodgement requested. Nothing is sent to the ATO from this demonstration.");
    render();
  }

  function onClick(event) {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "step") {
      capture();
      state.step = Number(el.dataset.step);
      persist();
      render({ scroll: false });
      return;
    }
    if (action === "open-nav") {
      capture();
      state.drawer = true;
      render({ scroll: false });
      return;
    }
    if (action === "close-nav") {
      capture();
      state.drawer = false;
      render({ scroll: false });
      return;
    }
    if (action === "sign-out") signOut();
    if (action === "print") window.print();
    if (action === "walkthrough") {
      patchActions({ walkthrough: true });
      toast(`Walkthrough requested. SDA will phone ${profile().directorName}.`);
      render();
    }
    if (action === "send") requestSend();
    if (action === "set-frequency") {
      patchActions({ frequency: el.dataset.freq });
      render({ scroll: false });
    }
    if (action === "use-revised") {
      if (!assessment().viable) {
        toast("The higher instalment does not fit the cashflow.");
        return;
      }
      patchActions({ revised: true });
      toast("Revised instalment added to the reply.");
      render({ scroll: false });
    }
    if (action === "save-reply") {
      patchActions({ replySaved: true });
      toast("Reply pack saved in this demonstration.");
      render({ scroll: false });
    }
    if (action === "copy-reply") {
      const text = document.getElementById("reply-text")?.innerText || "";
      if (navigator.clipboard && text) {
        navigator.clipboard.writeText(text).then(() => toast("Reply copied.")).catch(() => toast("Select the reply and copy it from the page."));
      } else toast("Select the reply and copy it from the page.");
    }
    if (action === "reset") {
      state.edits = {};
      state.actions = {};
      state.caseId = "harbour";
      state.step = 0;
      persist();
      toast("Sample figures restored.");
      if (location.hash !== "#/dashboard") location.hash = "#/dashboard";
      else render({ scroll: true });
    }
  }

  function onChange(event) {
    const el = event.target;
    if (!el || !el.dataset) return;
    if (el.dataset.change === "switch-case") {
      switchCase(el.value);
      return;
    }
    if (el.dataset.change === "set-reason") {
      patchActions({ reason: el.value });
      render({ scroll: false });
      return;
    }
    if (el.dataset.change === "toggle-compliance") {
      patchActions({ includeCompliance: el.checked });
      render({ scroll: false });
      return;
    }
    if (el.matches("[data-field]")) {
      if (el.dataset.field === "preference") {
        capture();
        patchActions({ frequency: "" });
        return;
      }
      capture();
      if (el.dataset.rerender === "true") render({ scroll: false });
      else updateHints();
    }
  }

  function onInput(event) {
    const el = event.target;
    if (!el.matches || !el.matches("[data-field]")) return;
    if (el.type === "radio" || el.tagName === "SELECT") return;
    capture();
    updateHints();
  }

  function onSubmit(event) {
    event.preventDefault();
    if (event.target.id === "login-form") signIn();
    if (event.target.id === "details-form") {
      capture();
      if (state.caseId !== "harbour") return;
      toast("Recommendation updated.");
      go("recommendation");
    }
  }

  function onKey(event) {
    if (event.key === "Escape" && state.drawer) {
      capture();
      state.drawer = false;
      render({ scroll: false });
    }
  }

  function init() {
    restore();
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    if (state.authed) {
      const fromHash = viewFromHash();
      if (fromHash) state.view = fromHash;
      const want = `#/${state.view}`;
      if (location.hash !== want) location.hash = want;
      else render({ scroll: false });
    } else render({ scroll: false });
  }

  init();
})();
