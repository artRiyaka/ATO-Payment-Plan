(function (root) {
  const freqMeta = {
    weekly: { per: "week", each: "each week", name: "Weekly", perYear: 52 },
    fortnightly: { per: "fortnight", each: "each fortnight", name: "Fortnightly", perYear: 26 },
    monthly: { per: "month", each: "each month", name: "Monthly", perYear: 12 },
  };

  function num(value) {
    const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function money(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function parseDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function iso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function firstPaymentDate(from) {
    const date = startOfDay(from || new Date());
    date.setDate(date.getDate() + 14);
    const day = date.getDay();
    if (day === 6) date.setDate(date.getDate() + 2);
    if (day === 0) date.setDate(date.getDate() + 1);
    return date;
  }

  function addPeriod(date, frequency) {
    const next = new Date(date.getTime());
    if (frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (frequency === "fortnightly") next.setDate(next.getDate() + 14);
    else next.setMonth(next.getMonth() + 1);
    return next;
  }

  function roundUp(value, step) {
    return Math.ceil((value - 1e-9) / step) * step;
  }

  function splitPayments(debt, amount) {
    if (amount <= 0 || debt <= 0) return { payments: 0, lastAmount: 0 };
    const payments = Math.ceil(debt / amount - 1e-6);
    const lastAmount = Math.round((debt - amount * (payments - 1)) * 100) / 100;
    return { payments, lastAmount };
  }

  function termMonths(payments, frequency) {
    const perYear = freqMeta[frequency].perYear;
    return Math.max(1, Math.round((payments / perYear) * 12));
  }

  function optionFor(id, monthlyTarget, debt, capacity, allow) {
    const meta = freqMeta[id];
    const empty = { id, amount: 0, payments: 0, lastAmount: 0, termMonths: 0, monthlyDraw: 0, available: false };
    if (!allow || monthlyTarget <= 0 || debt <= 0) return empty;
    const step = monthlyTarget >= 10000 && id === "monthly" ? 50 : 10;
    let amount = roundUp((monthlyTarget * 12) / meta.perYear, step);
    let guard = 0;
    while (amount > 0 && (amount * meta.perYear) / 12 > capacity + 0.01 && guard < 10000) {
      amount -= step;
      guard += 1;
    }
    if (amount <= 0) return empty;
    const split = splitPayments(debt, amount);
    return {
      id,
      amount,
      payments: split.payments,
      lastAmount: split.lastAmount,
      termMonths: termMonths(split.payments, id),
      monthlyDraw: (amount * meta.perYear) / 12,
      available: true,
    };
  }

  function assess(profile) {
    const parts = {
      gst: num(profile.gst),
      payg: num(profile.payg),
      incomeTax: num(profile.incomeTax),
      sgc: num(profile.sgc),
      other: num(profile.other),
    };
    const debt = parts.gst + parts.payg + parts.incomeTax + parts.sgc + parts.other;
    const revenue = num(profile.revenue);
    const expenses = num(profile.expenses);
    const commitments = num(profile.commitments);
    const surplus = revenue - expenses - commitments;
    const buffer = surplus > 0 ? Math.max(400, surplus * 0.2) : 0;
    const capacity = Math.max(0, surplus - buffer);
    const comfort = capacity * 0.8;
    const sdaReview = debt > 200000;
    const lodged = Boolean(profile.lodged);
    const priorDefault = Boolean(profile.priorDefault);
    const debtAge = profile.debtAge || "3-12";

    let maxTerm = 12;
    if (debt > 50000) maxTerm = 18;
    if (debt > 100000) maxTerm = 24;
    if (debt > 200000) maxTerm = 36;

    let target = 6;
    if (debt > 25000) target = 12;
    if (debt > 100000) target = 18;
    if (debt > 200000) target = 24;
    if (priorDefault) target = Math.max(6, target - 6);
    if (debtAge === "over-12") target = Math.max(6, target - 6);

    let solvedTerm = target;
    let solvedMonthly = debt > 0 ? debt / target : 0;
    let viable = false;

    if (debt > 0 && capacity > 0) {
      if (solvedMonthly > comfort) {
        solvedTerm = Math.ceil(debt / comfort);
        if (solvedTerm > maxTerm) solvedTerm = maxTerm;
        solvedMonthly = debt / solvedTerm;
      }
      viable = solvedMonthly > 0 && solvedMonthly <= capacity + 0.5 && solvedTerm <= maxTerm;
    }

    const preference = ["weekly", "fortnightly", "monthly"].includes(profile.preference) ? profile.preference : "auto";
    const options = ["weekly", "fortnightly", "monthly"].map((id) => optionFor(id, solvedMonthly, debt, capacity, viable));
    const autoFrequency = solvedMonthly >= 10000 ? "monthly" : "fortnightly";
    const wanted = preference === "auto" ? autoFrequency : preference;
    const chosen = options.find((option) => option.id === wanted && option.available) || options.find((option) => option.available) || {
      id: "fortnightly",
      amount: 0,
      payments: 0,
      lastAmount: 0,
      termMonths: 0,
      monthlyDraw: 0,
      available: false,
    };

    if (viable && !chosen.available) viable = false;

    const draw = chosen.monthlyDraw || 0;
    const tight = viable && draw > comfort + 1;
    const stretched = viable && solvedTerm > target;

    let level = 2;
    if (!viable || debt <= 0) level = -1;
    else {
      if (!lodged) level = 0;
      if (priorDefault) level = Math.min(level, 0);
      if (tight || stretched || debtAge === "over-12") level = Math.min(level, 1);
      if (sdaReview) level = Math.min(level, 1);
    }

    const likelihood = level < 0 ? "Unlikely" : level === 0 ? "Lower" : level === 1 ? "Moderate" : "Higher";
    const pct = capacity > 0 && draw > 0 ? Math.round((draw / capacity) * 100) : 0;
    const each = (freqMeta[chosen.id] || freqMeta.fortnightly).each;

    const notes = [];
    if (revenue || expenses || commitments) {
      notes.push(`Monthly revenue of ${money(revenue)} less operating costs of ${money(expenses)} and existing commitments of ${money(commitments)} leaves a surplus of ${money(surplus)}.`);
    }
    if (surplus > 0) {
      notes.push(`A buffer of ${money(buffer)} stays in the business. About ${money(capacity)} a month can go toward the ATO.`);
    } else {
      notes.push("There is no monthly surplus, so nothing can be committed to a payment plan.");
    }
    if (debt > 0) {
      notes.push(`For a debt of ${money(debt)}, the starting term in this assessment is ${target} months. The longest term used is ${maxTerm} months.`);
    }
    if (stretched) notes.push("The term is longer than the starting point so the instalment stays within cashflow.");
    if (priorDefault) notes.push("A previous plan was not completed, so the starting term is shorter.");
    if (debtAge === "over-12") notes.push("The debt is more than a year old, so the starting term is shorter where the cashflow allows.");
    if (!lodged) notes.push("Lodgements are outstanding. A plan is unlikely to be accepted until they are brought up to date.");
    else notes.push("Activity statements and income tax returns are marked up to date.");
    if (sdaReview) notes.push("The debt is over $200,000, so SDA reviews the recommendation before Safeguard sends it.");

    const checks = {
      cashflow: viable
        ? {
            label: "Yes",
            detail: `${money(chosen.amount)} ${each} is about ${money(draw)} a month. After a buffer of ${money(buffer)}, about ${money(capacity)} can go to the ATO. This uses about ${pct}% of that room, so the business can keep operating.`,
          }
        : {
            label: "No",
            detail: debt <= 0
              ? "Enter the ATO debt to test whether a plan is affordable."
              : `Clearing this over ${maxTerm} months would need about ${money(debt / maxTerm)} a month. About ${money(capacity)} is available after a buffer.`,
          },
      ato: {
        label: likelihood,
        detail: atoDetail({ debt, viable, lodged, priorDefault, sdaReview, tight, stretched, debtAge, likelihood }),
      },
    };

    return {
      parts,
      debt,
      revenue,
      expenses,
      commitments,
      surplus,
      buffer,
      capacity,
      comfort,
      sdaReview,
      lodged,
      priorDefault,
      maxTerm,
      target,
      solvedTerm,
      viable,
      tight,
      likelihood,
      frequency: chosen.id,
      amount: chosen.amount,
      payments: chosen.payments,
      lastAmount: chosen.lastAmount,
      termMonths: chosen.termMonths || solvedTerm,
      monthlyDraw: draw,
      options,
      checks,
      notes,
      gap: viable
        ? null
        : {
            neededMonthly: debt > 0 ? debt / maxTerm : 0,
            available: capacity,
            maxTerm,
          },
    };
  }

  function atoDetail(ctx) {
    if (ctx.debt <= 0) return "A proposal needs a debt balance before it can be assessed.";
    if (!ctx.viable) return "The instalment needed for a realistic term is above what the business can pay, so it should not be lodged as it stands.";
    if (!ctx.lodged) return "The payment fits, but outstanding lodgements make acceptance unlikely until they are brought up to date.";
    if (ctx.priorDefault && ctx.likelihood === "Lower") return "An earlier plan was not completed, so a new plan is less certain. The term has been kept shorter.";
    if (ctx.sdaReview) return "The payment fits a term that can be proposed. Debts over $200,000 get a closer look, so SDA reviews the figures with you before anything is sent.";
    if (ctx.tight) return "The business can meet the instalment, with less room if trading dips for a month.";
    if (ctx.stretched || ctx.debtAge === "over-12") return "The plan is payable. The term has been shaped to stay realistic, and acceptance is not assured.";
    return "Lodgements are current, there is no recent plan default, and the term matches the size of the debt.";
  }

  function buildSchedule(result, options) {
    if (!result.viable || !result.amount) return [];
    const items = [];
    let remaining = Math.round(result.debt * 100) / 100;
    let date = startOfDay(options.start);
    let guard = 0;
    while (remaining > 0.5 && guard < 520) {
      const pay = remaining <= result.amount + 0.01 ? remaining : result.amount;
      items.push({ date: new Date(date.getTime()), amount: pay });
      remaining = Math.round((remaining - pay) * 100) / 100;
      date = addPeriod(date, result.frequency);
      guard += 1;
    }

    const today = startOfDay(new Date());
    const past = [];
    items.forEach((item, index) => {
      if (item.date < today) past.push(index);
    });
    const missIndex = options.missMode === "latest-past" && past.length ? past[past.length - 1] : -1;
    let dueSet = false;
    return items.map((item, index) => {
      let status = "scheduled";
      if (index === missIndex) status = "missed";
      else if (item.date < today) status = "paid";
      else if (!dueSet) {
        status = "due";
        dueSet = true;
      }
      return { ...item, status, index: index + 1 };
    });
  }

  root.PPEngine = {
    assess,
    buildSchedule,
    money,
    formatDate,
    parseDate,
    iso,
    firstPaymentDate,
    freqMeta,
    each(id) {
      return (freqMeta[id] || freqMeta.monthly).each;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
