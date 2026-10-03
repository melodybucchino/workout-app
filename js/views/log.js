import * as db from '../db.js';
import {
  TYPES, isExerciseType, toast, dismissToast, esc, fromKey, fmt, isDistanceType, debounce, priorLogs, previousExercise,
  progressBadge, isTimed, holdDigits, parseHold, formatHold, badgeHtml, volumeKg, fmtVolume, fmtW, getUnit, displayToKg, parseNumber,
  parseDuration, formatDuration, digitsToTime, paceOf, formatKm, formatIncline, backLink, icon,
} from '../util.js';

const FEELS = ['Easy', 'Moderate', 'Hard'];

/* ---------- Strength ---------- */

function lastSetText(s, timed) {
  if (!s) return '—';
  const kg = s.kg != null ? `${fmtW(s.kg)} ${getUnit()}` : null;
  const amount = timed ? (s.sec ? formatHold(s.sec) : null) : (s.reps != null ? String(s.reps) : null);
  if (kg && amount) return `${kg} × ${amount}`;
  if (kg) return kg;
  if (amount) return timed ? amount : `${amount} reps`;
  return '—';
}

function amountCell(s, j, timed) {
  return timed
    ? `<input class="num-input" data-set="${j}" data-field="sec" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" value="${formatHold(s.sec)}" placeholder="0:00" aria-label="Set ${j + 1} time, minutes and seconds">`
    : `<input class="num-input" data-set="${j}" data-field="reps" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" value="${s.reps ?? ''}" aria-label="Set ${j + 1} reps">`;
}

function exerciseCard(ex, i, prior) {
  const timed = isTimed(ex);
  const prev = previousExercise(prior, ex)?.exercise;
  const rows = ex.sets.map((s, j) => `
    <tr>
      <td class="col-set"><span class="set-num">${j + 1}</span></td>
      <td><span class="last-time">${esc(lastSetText(prev?.sets[j], timed))}</span></td>
      <td class="col-kg"><input class="num-input" data-set="${j}" data-field="kg" inputmode="decimal" enterkeyhint="next" value="${s.kg != null ? fmtW(s.kg) : ''}" aria-label="Set ${j + 1} weight"></td>
      <td class="col-reps">${amountCell(s, j, timed)}</td>
      <td class="col-rm"><button class="rm-set" data-remove-set="${j}" aria-label="Remove set ${j + 1}">${icon.x}</button></td>
    </tr>`).join('');
  return `<section class="card ex-card" data-ex="${i}">
    <div class="ex-card-head"><h3>${esc(ex.name)}</h3><span class="ex-badge">${badgeHtml(progressBadge(ex, prev, true))}</span></div>
    <table class="set-table">
      <thead><tr><th class="col-set">Set</th><th>Last time</th><th class="col-kg c">${getUnit()}</th><th class="col-reps c">${timed ? 'Time' : 'Reps'}</th><th class="col-rm"></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="btn-dashed" data-add-set>${icon.plus}Add set</button>
  </section>`;
}

function renderStrength(root, log, prior, save) {
  const prevLog = prior.find(l => (l.exercises || []).length);
  const prevVol = prevLog ? volumeKg(prevLog.exercises) : 0;

  root.innerHTML = `
    <section class="summary-card">
      <div class="label">Total volume today</div>
      <div class="summary-row">
        <div>
          <div class="big"><span id="vol"></span><small>${getUnit()}</small></div>
          <div class="sub">${prevLog
            ? `Last time (${fmt.short(fromKey(prevLog.date))}): ${fmtVolume(prevVol)} ${getUnit()}`
            : 'First time logging this workout'}</div>
        </div>
        <span id="vol-pill"></span>
      </div>
    </section>
    <div id="exercises">${log.exercises.map((ex, i) => exerciseCard(ex, i, prior)).join('')}</div>
  `;

  const updateSummary = () => {
    const vol = volumeKg(log.exercises);
    root.querySelector('#vol').textContent = fmtVolume(vol);
    const pill = root.querySelector('#vol-pill');
    if (!prevVol || !vol) { pill.innerHTML = ''; return; }
    const pct = ((vol - prevVol) / prevVol) * 100;
    const r = Math.round(pct * 10) / 10;
    pill.innerHTML = r === 0
      ? '<span class="pill flat">Same</span>'
      : `<span class="pill ${r > 0 ? '' : 'flat'}">${r > 0 ? '+' : '−'}${Math.abs(r)}%</span>`;
  };
  updateSummary();

  const list = root.querySelector('#exercises');
  const rerenderCard = i => {
    list.querySelector(`[data-ex="${i}"]`).outerHTML = exerciseCard(log.exercises[i], i, prior);
  };

  list.addEventListener('input', e => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const i = Number(input.closest('[data-ex]').dataset.ex);
    const set = log.exercises[i].sets[Number(input.dataset.set)];
    if (input.dataset.field === 'kg') {
      const v = parseNumber(input.value);
      set.kg = v == null ? null : displayToKg(v);
    } else if (input.dataset.field === 'sec') {
      // The number pad has no colon, so it's inserted as digits are typed.
      input.value = holdDigits(input.value);
      set.sec = parseHold(input.value);
    } else {
      const v = parseNumber(input.value);
      set.reps = v == null ? null : Math.round(v);
    }
    const prev = previousExercise(prior, log.exercises[i])?.exercise;
    input.closest('[data-ex]').querySelector('.ex-badge').innerHTML =
      badgeHtml(progressBadge(log.exercises[i], prev, true));
    updateSummary();
    save();
  });

  // Tidy holds like 0:75 into 1:15 once the field is left.
  list.addEventListener('focusout', e => {
    const input = e.target.closest('input[data-field="sec"]');
    if (!input) return;
    const i = Number(input.closest('[data-ex]').dataset.ex);
    const sec = log.exercises[i].sets[Number(input.dataset.set)].sec;
    if (sec) input.value = formatHold(sec);
  });

  list.addEventListener('click', e => {
    const card = e.target.closest('[data-ex]');
    if (!card) return;
    const i = Number(card.dataset.ex);
    const ex = log.exercises[i];
    if (e.target.closest('[data-add-set]')) {
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push(isTimed(ex)
        ? { kg: last?.kg ?? null, sec: last?.sec ?? null }
        : { kg: last?.kg ?? null, reps: last?.reps ?? null });
      rerenderCard(i);
      updateSummary();
      save();
      return;
    }
    const rm = e.target.closest('[data-remove-set]');
    if (rm) {
      // Remove straight away; the toast offers Undo instead of asking first.
      const j = Number(rm.dataset.removeSet);
      const [removed] = ex.sets.splice(j, 1);
      rerenderCard(i);
      updateSummary();
      save();
      toast(`${ex.name}: set ${j + 1} removed`, {
        label: 'Undo',
        onClick: () => {
          ex.sets.splice(Math.min(j, ex.sets.length), 0, removed);
          rerenderCard(i);
          updateSummary();
          save();
        },
      });
    }
  });
}

/* ---------- Run / Walk ---------- */

function renderDistance(root, log, prior, save) {
  const prevLog = prior.find(l => paceOf(l));
  const prevPace = paceOf(prevLog);
  const isWalk = log.type === 'walk';
  const prevIncline = prior.find(l => l.incline != null)?.incline;

  root.innerHTML = `
    <div class="input-pair">
      <div class="card input-card">
        <label for="dist">Distance (km)</label>
        <input id="dist" class="big-input" inputmode="decimal" enterkeyhint="next" autocomplete="off"
          value="${log.distanceKm != null ? formatKm(log.distanceKm) : ''}" placeholder="${prevLog ? formatKm(prevLog.distanceKm) : '0.0'}">
      </div>
      <div class="card input-card">
        <label for="time">Time (<span id="time-fmt">mm:ss</span>)</label>
        <input id="time" class="big-input" inputmode="numeric" pattern="[0-9:]*" enterkeyhint="done" autocomplete="off"
          value="${log.durationSec ? formatDuration(log.durationSec) : ''}" placeholder="${prevLog ? formatDuration(prevLog.durationSec) : '00:00'}">
      </div>
    </div>
    ${isWalk ? `<div class="card input-card incline-card">
      <label for="incline">Incline</label>
      <input id="incline" class="big-input" inputmode="decimal" autocomplete="off"
        value="${log.incline != null ? Math.round(log.incline * 10) / 10 : ''}" placeholder="${prevIncline ?? '0'}">
    </div>` : ''}
    <section class="summary-card pace-card">
      <div class="label">Pace · calculated</div>
      <div class="big"><span id="pace">–:––</span><small>/km</small></div>
      <div id="pace-pill"></div>
    </section>
    <section class="card last-card">
      ${prevLog
        ? `<div class="label">Last time · ${fmt.short(fromKey(prevLog.date))}</div>
           <div class="val">${formatKm(prevLog.distanceKm)} km · ${formatDuration(prevLog.durationSec)} · ${formatDuration(prevPace)} /km${isWalk && prevLog.incline != null ? ` · ${formatIncline(prevLog.incline)} incline` : ''}</div>`
        : `<div class="label">Last time</div><div class="val">First time logging this workout</div>`}
    </section>
  `;

  const timeIn = root.querySelector('#time');
  const update = () => {
    const pace = paceOf(log);
    root.querySelector('#pace').textContent = pace ? formatDuration(pace) : '–:––';
    root.querySelector('#time-fmt').textContent = log.durationSec >= 3600 ? 'h:mm:ss' : 'mm:ss';
    const pill = root.querySelector('#pace-pill');
    if (!pace || !prevPace) { pill.innerHTML = ''; return; }
    const diff = Math.round(prevPace - pace);
    pill.innerHTML = diff === 0
      ? '<span class="pill flat">Same pace as last time</span>'
      : `<span class="pill ${diff > 0 ? '' : 'flat'}">${Math.abs(diff)} s/km ${diff > 0 ? 'faster' : 'slower'} than last time</span>`;
  };
  update();

  root.querySelector('#dist').addEventListener('input', e => {
    const v = parseNumber(e.target.value);
    log.distanceKm = v || null;
    update();
    save();
  });
  timeIn.addEventListener('input', () => {
    // The number pad has no colon, so colons are inserted as digits are typed.
    timeIn.value = digitsToTime(timeIn.value);
    log.durationSec = parseDuration(timeIn.value);
    update();
    save();
  });
  root.querySelector('#incline')?.addEventListener('input', e => {
    // 0 is a real value (flat), so only an empty field clears it.
    log.incline = parseNumber(e.target.value);
    save();
  });
  timeIn.addEventListener('blur', () => {
    if (log.durationSec) timeIn.value = formatDuration(log.durationSec);
  });
}

/* ---------- Mobility / Class ---------- */

function movementsCard(log) {
  const rows = (log.movements || []).map((m, i) => `
    <div class="edit-row"><span class="name no-handle">${esc(m)}</span>
      <button class="x-btn" data-rm-move="${i}" aria-label="Remove ${esc(m)}">${icon.x}</button></div>`).join('');
  return `<h3 class="card-h">Movements</h3>
    ${rows ? `<div class="card edit-list">${rows}</div>` : ''}
    <div class="add-line">
      <input class="field" id="move-in" placeholder="Add a movement" enterkeyhint="done" autocomplete="off">
      <button class="btn btn-accent" id="move-add">Add</button>
    </div>`;
}

function renderDuration(root, log, prior, save) {
  const prevLog = prior.find(l => l.durationMin);
  root.innerHTML = `
    <div class="card input-card">
      <label for="dur">Duration (min)</label>
      <input id="dur" class="big-input" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
        value="${log.durationMin ?? ''}" placeholder="${prevLog?.durationMin ?? '0'}">
    </div>
    ${prevLog ? `<section class="card last-card"><div class="label">Last time · ${fmt.short(fromKey(prevLog.date))}</div>
      <div class="val">${prevLog.durationMin} min${prevLog.feel ? ` · ${esc(prevLog.feel)}` : ''}</div></section>` : ''}
    ${log.type === 'mobility' ? `<section class="card notes-card" id="moves">${movementsCard(log)}</section>` : ''}
  `;
  root.querySelector('#dur').addEventListener('input', e => {
    const v = parseNumber(e.target.value);
    log.durationMin = v ? Math.round(v) : null;
    save();
  });

  const moves = root.querySelector('#moves');
  if (!moves) return;
  const wire = () => {
    const input = moves.querySelector('#move-in');
    const addMove = () => {
      const name = input.value.trim();
      if (!name) return;
      log.movements = [...(log.movements || []), name];
      save();
      moves.innerHTML = movementsCard(log);
      wire();
      moves.querySelector('#move-in').focus();
    };
    moves.querySelector('#move-add').addEventListener('click', addMove);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMove(); } });
    moves.querySelectorAll('[data-rm-move]').forEach(b => b.addEventListener('click', () => {
      log.movements.splice(Number(b.dataset.rmMove), 1);
      save();
      moves.innerHTML = movementsCard(log);
      wire();
    }));
  };
  wire();
}

/* ---------- Screen ---------- */

export default async function logView(ctx) {
  const [id] = ctx.params;
  const [log, logs] = await Promise.all([db.get('logs', id), db.getAll('logs')]);
  if (!ctx.alive()) return;
  if (!log) {
    ctx.app.innerHTML = `<div class="topbar">${backLink('#/', 'Calendar')}</div><div class="empty">This workout log no longer exists.</div>`;
    return;
  }

  const prior = priorLogs(logs, log);
  const dayHref = `#/day/${log.date}`;
  let removed = false;
  const save = debounce(() => (removed ? null : db.put('logs', log)), 300);
  ctx.onLeave(() => { dismissToast(); return save.flush(); });

  const hasFeel = !isExerciseType(log.type);
  ctx.app.innerHTML = `
    <div class="topbar">
      ${backLink(dayHref, fmt.short(fromKey(log.date)))}
      <button class="btn btn-dark" id="done">Done</button>
    </div>
    <div class="eyebrow"><span class="dot t-${log.type}"></span>${esc(TYPES[log.type].label)}</div>
    <h1 class="display log-title">${esc(log.title)}</h1>
    <div id="body"></div>
    ${hasFeel ? `<section class="card feel-card"><h3 class="card-h">How did it feel?</h3>
      <div class="seg" id="feel">${FEELS.map(f => `<button class="${log.feel === f ? 'on' : ''}" data-feel="${f}">${f}</button>`).join('')}</div></section>` : ''}
    <section class="card notes-card">
      <h3><label for="notes">Notes</label></h3>
      <textarea id="notes" class="field" placeholder="${isDistanceType(log.type) ? 'Route, weather, how your legs felt…' : 'How it went, what to change next time…'}">${esc(log.notes)}</textarea>
    </section>
    <button class="btn btn-danger btn-block remove-log" id="remove">Remove from this day</button>
  `;

  const body = ctx.app.querySelector('#body');
  if (isExerciseType(log.type)) renderStrength(body, log, prior, save);
  else if (isDistanceType(log.type)) renderDistance(body, log, prior, save);
  else renderDuration(body, log, prior, save);

  ctx.app.querySelector('#feel')?.addEventListener('click', e => {
    const b = e.target.closest('[data-feel]');
    if (!b) return;
    log.feel = log.feel === b.dataset.feel ? null : b.dataset.feel;
    ctx.app.querySelectorAll('[data-feel]').forEach(x => x.classList.toggle('on', x.dataset.feel === log.feel));
    save();
  });
  ctx.app.querySelector('#notes').addEventListener('input', e => { log.notes = e.target.value; save(); });

  ctx.app.querySelector('#done').addEventListener('click', async () => {
    await save.flush();
    location.replace(dayHref);
  });
  ctx.app.querySelector('#remove').addEventListener('click', async () => {
    if (!confirm(`Remove ${log.title} from ${fmt.short(fromKey(log.date))}? This deletes this log.`)) return;
    removed = true;
    await db.del('logs', log.id);
    location.replace(dayHref);
  });
}
