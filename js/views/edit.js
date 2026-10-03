import * as db from '../db.js';
import { TYPES, isExerciseType, uid, esc, normName, parseNumber, backLink, icon } from '../util.js';

// Type chips follow the design's order.
const TYPE_CHIPS = ['run', 'walk', 'strength', 'core', 'mobility', 'class'];

const RECORDS = {
  run: ['Distance (km)', 'Time', 'Pace (calculated)', 'How it felt', 'Notes'],
  walk: ['Distance (km)', 'Time', 'Incline', 'Pace (calculated)', 'How it felt', 'Notes'],
  class: ['Duration (min)', 'How it felt', 'Notes'],
  mobility: ['Duration (min)', 'Movements', 'How it felt', 'Notes'],
};

// Drag rows by their handle to reorder. Rows are equal height, so the drop
// index is just the drag distance divided by the row height.
function enableReorder(list, onMove) {
  list.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    const row = handle.closest('.edit-row');
    const rows = [...list.querySelectorAll('.edit-row')];
    const from = rows.indexOf(row);
    const h = row.getBoundingClientRect().height;
    const startY = e.clientY;
    let to = from;
    handle.setPointerCapture(e.pointerId);
    row.classList.add('dragging');

    const move = ev => {
      const dy = ev.clientY - startY;
      row.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
      rows.forEach((r, i) => {
        if (r === row) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -h;
        if (from > to && i < from && i >= to) shift = h;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      rows.forEach(r => { r.style.transform = ''; });
      row.classList.remove('dragging');
      if (to !== from) onMove(from, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

// `modes` (strength and core only) adds a Reps/Time toggle to each row.
function listEditor(items, { label, placeholder, modes }) {
  const rows = items.map((name, i) => {
    const timed = modes?.[i] === 'time';
    const toggle = modes
      ? `<button class="mode-btn ${timed ? 'timed' : ''}" data-mode="${i}" aria-label="${esc(name)} is measured by ${timed ? 'time' : 'reps'}. Tap to switch.">${timed ? 'Time' : 'Reps'}</button>`
      : '';
    return `
    <div class="edit-row">
      <span class="drag-handle" aria-hidden="true">${icon.grip}</span>
      <button class="name name-btn" data-rename="${i}" aria-label="${esc(name)}. Tap to rename.">${esc(name)}</button>
      ${toggle}
      <button class="x-btn" data-rm="${i}" aria-label="Remove ${esc(name)}">${icon.x}</button>
    </div>`;
  }).join('');
  return `
    <div class="section-label">${label} · ${items.length}</div>
    ${rows ? `<div class="card edit-list" id="list">${rows}</div>` : ''}
    ${rows ? `<p class="list-hint">Tap a name to rename it.${modes ? ' Tap <b>Reps</b> to switch an exercise to <b>Time</b> for holds like planks (logged as m:ss).' : ''}</p>` : ''}
    <div class="add-line">
      <input class="field" id="item-in" placeholder="${esc(placeholder)}" enterkeyhint="done" autocomplete="off" autocapitalize="words">
      <button class="btn btn-accent" id="item-add">Add</button>
    </div>
    <div class="error-text" id="item-err" hidden></div>`;
}

export default async function edit(ctx) {
  const [id] = ctx.params;
  const isNew = id === 'new';
  const backHref = ctx.query.back ? `#/${ctx.query.back}` : '#/workouts';
  const existing = isNew ? null : await db.get('templates', id);
  if (!ctx.alive()) return;
  if (!isNew && !existing) {
    ctx.app.innerHTML = `<div class="topbar">${backLink('#/workouts', 'Workouts')}</div><div class="empty">This workout no longer exists.</div>`;
    return;
  }

  // Work on a copy; nothing is stored until Save.
  const draft = existing
    ? structuredClone(existing)
    : {
        id: uid(),
        type: TYPES[ctx.query.type] ? ctx.query.type : 'strength',
        title: '',
        exercises: [],
        movements: [],
        durationMin: null,
        createdAt: Date.now(),
      };
  draft.exercises ||= [];
  draft.movements ||= [];

  const render = () => {
    const t = draft.type;
    let section = '';
    if (isExerciseType(t)) {
      section = listEditor(draft.exercises.map(e => e.name), {
        label: 'Exercises',
        placeholder: t === 'core' ? 'Add an exercise, e.g. Dead Bug' : 'Add an exercise, e.g. Goblet Squat',
        modes: draft.exercises.map(e => e.mode),
      });
    } else {
      section = `
        ${t === 'mobility' || t === 'class' ? `
          <div class="section-label">Usual duration (min)</div>
          <input class="field" id="dur" inputmode="numeric" pattern="[0-9]*" value="${draft.durationMin ?? ''}" placeholder="e.g. ${t === 'class' ? 45 : 20}">` : ''}
        ${t === 'mobility' ? listEditor(draft.movements, { label: 'Movements', placeholder: 'Add a movement, e.g. Cat-Cow' }) : ''}
        <div class="section-label">Each log records</div>
        <div class="card card-pad"><ul class="records-list t-${t}">${RECORDS[t].map(r => `<li>${r}</li>`).join('')}</ul></div>`;
    }

    ctx.app.innerHTML = `
      <div class="topbar">
        ${backLink(backHref, ctx.query.back ? 'Back' : 'Workouts')}
        <button class="btn btn-dark" id="save">Save</button>
      </div>
      <h1 class="display page-title">${isNew ? 'New workout' : 'Edit workout'}</h1>

      <div class="section-label">Type</div>
      <div class="type-chips">
        ${TYPE_CHIPS.map(k => `<button class="chip ${k === t ? 'on' : ''}" data-type="${k}"><span class="dot t-${k}"></span>${TYPES[k].label}</button>`).join('')}
      </div>

      <div class="section-label"><label for="title">Title</label></div>
      <input class="field" id="title" style="background:#fff;font-weight:700;font-size:18px" value="${esc(draft.title)}" placeholder="e.g. Glute + Quads" autocomplete="off" autocapitalize="words">
      <div class="error-text" id="title-err" hidden>Give this workout a title.</div>

      ${section}

      <p class="form-note">Changes here only affect future logs. Workouts you've already logged keep their own ${isExerciseType(t) ? 'reps, times and weights' : 'details'}.</p>
      ${isNew ? '' : '<button class="btn btn-danger btn-block" id="delete">Delete workout</button>'}
    `;
    wire();
  };

  const wire = () => {
    const $ = s => ctx.app.querySelector(s);
    $('#title').addEventListener('input', e => { draft.title = e.target.value; $('#title-err').hidden = true; });
    ctx.app.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
      draft.type = b.dataset.type;
      render();
    }));
    $('#dur')?.addEventListener('input', e => {
      const v = parseNumber(e.target.value);
      draft.durationMin = v ? Math.round(v) : null;
    });

    // Shared list editor: exercises for strength/core, movements for mobility.
    const isStrength = isExerciseType(draft.type);
    const items = () => (isStrength ? draft.exercises.map(e => e.name) : draft.movements);
    const setOrder = (from, to) => {
      const arr = isStrength ? draft.exercises : draft.movements;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      render();
    };
    const itemIn = $('#item-in');
    if (itemIn) {
      const addItem = () => {
        const name = itemIn.value.trim().replace(/\s+/g, ' ');
        if (!name) return;
        if (items().some(n => normName(n) === normName(name))) {
          const err = $('#item-err');
          err.textContent = `${name} is already in this workout.`;
          err.hidden = false;
          return;
        }
        if (isStrength) draft.exercises.push({ id: uid(), name });
        else draft.movements.push(name);
        render();
        ctx.app.querySelector('#item-in').focus();
      };
      $('#item-add').addEventListener('click', addItem);
      itemIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
      itemIn.addEventListener('input', () => { $('#item-err').hidden = true; });
      // Rename in place. The row is patched rather than re-rendered, so a tap on
      // Save (which blurs the field first) still lands on the Save button.
      ctx.app.querySelectorAll('[data-rename]').forEach(btn => btn.addEventListener('click', () => {
        const i = Number(btn.dataset.rename);
        const list = isStrength ? draft.exercises : draft.movements;
        const current = () => (isStrength ? list[i].name : list[i]);
        const row = btn.closest('.edit-row');
        const input = document.createElement('input');
        input.className = 'rename-input';
        input.value = current();
        input.setAttribute('aria-label', `Rename ${current()}`);
        input.autocapitalize = 'words';
        input.enterKeyHint = 'done';
        btn.replaceWith(input);
        input.focus();
        input.select();
        let finished = false;
        const finish = keep => {
          if (finished) return;
          finished = true;
          const name = input.value.trim().replace(/\s+/g, ' ');
          const err = $('#item-err');
          if (keep && name && name !== current()) {
            if (items().some((n, k) => k !== i && normName(n) === normName(name))) {
              err.textContent = `${name} is already in this workout.`;
              err.hidden = false;
            } else {
              if (isStrength) list[i].name = name;
              else list[i] = name;
              err.hidden = true;
            }
          }
          btn.textContent = current();
          btn.setAttribute('aria-label', `${current()}. Tap to rename.`);
          row.querySelector('.x-btn').setAttribute('aria-label', `Remove ${current()}`);
          input.replaceWith(btn);
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { finish(false); }
        });
      }));
      ctx.app.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        (isStrength ? draft.exercises : draft.movements).splice(Number(b.dataset.rm), 1);
        render();
      }));
      ctx.app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        const ex = draft.exercises[Number(b.dataset.mode)];
        if (ex.mode === 'time') delete ex.mode;
        else ex.mode = 'time';
        render();
      }));
      const list = $('#list');
      if (list) enableReorder(list, setOrder);
    }

    $('#save').addEventListener('click', async () => {
      draft.title = draft.title.trim();
      if (!draft.title) {
        $('#title-err').hidden = false;
        $('#title').focus();
        return;
      }
      await db.put('templates', draft);
      location.replace(backHref);
    });

    $('#delete')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${existing.title}"? Your past logs of it will be kept.`)) return;
      await db.del('templates', existing.id);
      location.replace('#/workouts');
    });
  };

  render();
}
