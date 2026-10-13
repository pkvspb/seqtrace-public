import { initSeqTrace, colorsFromCss, CSS_COLOR_VARS } from '../../lib/seqtrace.js';
import { initSeqScrollBar } from '../../lib/seqscrollbar.js';
import { createSeqLink } from '../../lib/seqlink.js';
import { getProcessedAsync, getRawProcessedAsync } from '../../api/mockSeqProcessedValues.js';

// ── 1. Theme ──────────────────────────────────────────────────────────────────
// The libraries have no theme of their own: the page sets data-applied-mode
// on <html>, and the trace colors are read from the CSS variables it defines.
let dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
document.documentElement.dataset.appliedMode = dark ? 'dark' : 'light';

const TRACE_COLOR_VARS = {
    ...CSS_COLOR_VARS,
    crosshair:       '--crosshair',
    graphBackground: '--trace-bg',
    qualityLow:      '--quality-low',
    qualityMed:      '--quality-med',
    qualityHigh:     '--quality-high',
};

const traceColors = () => colorsFromCss(document.documentElement, TRACE_COLOR_VARS);
const scrollColors = () => colorsFromCss(document.documentElement, { back: '--scroll-back', port: '--scroll-port' });

// ── 2. Data ───────────────────────────────────────────────────────────────────
// Three traces of different lengths and offsets: the processed mock trace, the
// same trace with its first 1500 samples cut off, and the raw trace.
const [processed, raw] = await Promise.all([getProcessedAsync(), getRawProcessedAsync()]);

const sources = [
    { title: 'Processed', data: processed },
    { title: 'Processed, first 1500 samples cut', data: cutStart(processed, 1500) },
    { title: 'Raw (no base calls)', data: raw },
];

// ── 3. Wire up the components ─────────────────────────────────────────────────
// seqlink holds the linking rules as pure functions over an immutable state.
// Every button and scroll bar asks it for a new state; update() then hands the
// windows it resolves to the traces and the scroll bars.
const link = createSeqLink();
let state = link.initialState();

const tracesEl = document.getElementById('traces-id');
const rows = sources.map(({ title, data }, i) => mountRow(`t${i}`, title, data));
const linked = rows.map(r => ({ name: r.name, length: r.trace.getLength() }));

const overallScroll = initSeqScrollBar(document.getElementById('overall-scroll-id'), {
    page: link.options.overallPage,
    colors: scrollColors(),
    onMove: from => update(link.scrollOverall(state, linked, from)),
});

const statusEl = document.getElementById('status-id');
update(state);

function mountRow(name, title, data) {
    const row = document.createElement('div');
    row.className = 'trace-row';

    const caption = document.createElement('div');
    caption.className = 'trace-title';
    const label = document.createElement('span');
    label.textContent = title;
    const zoomOut = button('-', 'Zoom out this trace only');
    const zoomIn = button('+', 'Zoom in this trace only');
    caption.append(label, zoomOut, zoomIn);

    const traceEl = document.createElement('div');
    traceEl.className = 'trace';
    const scrollEl = document.createElement('div');
    scrollEl.className = 'trace-scroll';

    row.append(caption, traceEl, scrollEl);
    tracesEl.append(row);

    zoomOut.addEventListener('click', () => update(link.zoomOutTrace(state, linked, name)));
    zoomIn.addEventListener('click', () => update(link.zoomInTrace(state, linked, name)));

    return {
        name,
        trace: initSeqTrace(traceEl, { data, colors: traceColors() }),
        scroll: initSeqScrollBar(scrollEl, {
            page: link.options.tracePage,
            colors: scrollColors(),
            onMove: from => update(link.scrollTrace(state, linked, name, from)),
        }),
    };
}

function update(next) {
    state = next;
    const view = link.resolve(state, linked);
    overallScroll.setRange(view.range.lo, view.range.hi);
    overallScroll.setWindow(view.shared.from, view.shared.size);
    for (const r of rows) {
        const w = view.windows[r.name];
        if (!w) continue;
        r.trace.setWindow(w.from, w.to);
        r.scroll.setRange(0, r.trace.getLength());
        r.scroll.setWindow(w.from, w.to - w.from);
    }
    const from = Math.round(view.shared.from);
    const to = Math.round(view.shared.from + view.shared.size);
    statusEl.textContent = `Overall window: samples ${from}–${to} (${to - from} of ${Math.round(view.range.hi - view.range.lo)})`;
}

// ── 4. Toolbar ────────────────────────────────────────────────────────────────
document.getElementById('zoom-out-id').addEventListener('click', () => update(link.zoomOutOverall(state, linked)));
document.getElementById('zoom-in-id').addEventListener('click', () => update(link.zoomInOverall(state, linked)));
document.getElementById('reset-id').addEventListener('click', () => update(link.initialState()));

// Same scale: every trace uses the largest Y maximum; otherwise each its own.
// getMaxY returns the scale in use, so each trace goes back to its own first.
const sameScale = document.getElementById('same-scale-id');
sameScale.addEventListener('change', () => {
    for (const r of rows) r.trace.setScale('auto');
    if (!sameScale.checked) return;
    const shared = Math.max(...rows.map(r => r.trace.getMaxY()));
    for (const r of rows) r.trace.setScale(shared);
});

const themeToggle = document.getElementById('theme-toggle-id');
themeToggle.textContent = dark ? '☀️' : '🌙';
themeToggle.addEventListener('click', () => {
    dark = !dark;
    themeToggle.textContent = dark ? '☀️' : '🌙';
    document.documentElement.dataset.appliedMode = dark ? 'dark' : 'light';
    // Unlike re-creating the instances, setColors keeps every window as it is.
    for (const r of rows) {
        r.trace.setColors(traceColors());
        r.scroll.setColors(scrollColors());
    }
    overallScroll.setColors(scrollColors());
});

// ── 5. Helpers ────────────────────────────────────────────────────────────────
function button(text, title) {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    return b;
}

// The trace without its first `samples` samples, and without the bases called in them.
function cutStart(data, samples) {
    const shiftMs = samples * data.timeStepMs;
    const keep = data.peaksExitTimes.map((t, i) => (t > shiftMs ? i : -1)).filter(i => i >= 0);
    return {
        ...data,
        valuesA: data.valuesA.slice(samples),
        valuesC: data.valuesC.slice(samples),
        valuesG: data.valuesG.slice(samples),
        valuesT: data.valuesT.slice(samples),
        peaksExitTimes: keep.map(i => data.peaksExitTimes[i] - shiftMs),
        peaksNames: keep.map(i => data.peaksNames[i]),
        peaksQualities: keep.map(i => data.peaksQualities[i]),
    };
}

// ── 6. Resizable left panel ───────────────────────────────────────────────────
// Demonstrates that the traces and scroll bars adapt to their containers' size.
initLeftPanelResize('left-resizer-id');

function initLeftPanelResize(resizerId, minPercent = 10, maxPercent = 70) {
    const resizer = document.getElementById(resizerId);
    let dragging = false;
    let rafId = null;

    resizer.addEventListener('mousedown', handleMouseDown);

    function handleMouseDown(e) {
        e.preventDefault();
        dragging = true;
        resizer.classList.add('active');
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e) {
        if (!dragging) return;
        const percent = (e.clientX / window.innerWidth) * 100;
        const clamped = Math.min(Math.max(percent, minPercent), maxPercent);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            rafId = null;
            document.documentElement.style.setProperty('--left-width', clamped + '%');
        });
    }

    function handleMouseUp() {
        dragging = false;
        resizer.classList.remove('active');
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}
