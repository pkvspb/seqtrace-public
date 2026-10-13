import { useEffect, useMemo, useRef, useState } from 'react';
import { getProcessedAsync, getRawProcessedAsync } from '../../../api/mockSeqProcessedValues.js';
import { colorsFromCss, computeMaxY, CSS_COLOR_VARS } from '../../../lib/seqtrace.js';
import { createSeqLink, traceLength } from '../../../lib/seqlink.js';
import SeqTraceComponent from './SeqTraceComponent.jsx';
import SeqScrollBarComponent from './SeqScrollBarComponent.jsx';

const TRACE_COLOR_VARS = {
    ...CSS_COLOR_VARS,
    crosshair:       '--crosshair',
    graphBackground: '--trace-bg',
    qualityLow:      '--quality-low',
    qualityMed:      '--quality-med',
    qualityHigh:     '--quality-high',
};

const SCROLL_COLOR_VARS = { back: '--scroll-back', port: '--scroll-port' };

// seqlink holds the linking rules as pure functions over an immutable state,
// so the state is ordinary React state and every control maps it to a new one.
const link = createSeqLink();

function detectSystemTheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Set before the first render so the colors read below come from the right theme.
document.documentElement.dataset.appliedMode = detectSystemTheme();

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

function Legend() {
    const item = (variable, label) => (
        <div className="legend-item" key={label}>
            <span className="legend-swatch" style={{ background: `var(${variable})` }} />
            <span>{label}</span>
        </div>
    );
    return (
        <>
            <div className="legend-title">Trace</div>
            {item('--seq-graph-a', 'A')}
            {item('--seq-graph-c', 'C')}
            {item('--seq-graph-g', 'G')}
            {item('--seq-graph-t', 'T')}
            {item('--seq-mutation', 'Mutation (ambiguity code)')}
            <div className="legend-title">Quality</div>
            {item('--quality-low', 'Low (Q < 8)')}
            {item('--quality-med', 'Medium (8 ≤ Q < 16)')}
            {item('--quality-high', 'High (Q ≥ 16)')}
        </>
    );
}

export default function App() {
    const [theme, setTheme] = useState(detectSystemTheme);
    const [sources, setSources] = useState(null);
    const [state, setState] = useState(link.initialState);
    const [sameScale, setSameScale] = useState(false);

    const leftResizerRef = useRef(null);

    // Resizable left panel — demonstrates the traces adapting to container resizes.
    useEffect(() => {
        const resizer = leftResizerRef.current;
        if (!resizer) return;
        let dragging = false;
        let rafId = null;

        function onMouseDown(e) {
            e.preventDefault();
            dragging = true;
            resizer.classList.add('active');
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            if (!dragging) return;
            const pct = Math.min(Math.max((e.clientX / window.innerWidth) * 100, 10), 70);
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                rafId = null;
                document.documentElement.style.setProperty('--left-width', pct + '%');
            });
        }

        function onMouseUp() {
            dragging = false;
            resizer.classList.remove('active');
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        resizer.addEventListener('mousedown', onMouseDown);
        return () => {
            resizer.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    // Load the mock data once: three traces of different lengths and offsets.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [processed, raw] = await Promise.all([getProcessedAsync(), getRawProcessedAsync()]);
            if (cancelled) return;
            setSources([
                { name: 't0', title: 'Processed', data: processed },
                { name: 't1', title: 'Processed, first 1500 samples cut', data: cutStart(processed, 1500) },
                { name: 't2', title: 'Raw (no base calls)', data: raw },
            ]);
        })();
        return () => { cancelled = true; };
    }, []);

    const linked = useMemo(
        () => (sources ?? []).map(s => ({ name: s.name, length: traceLength(s.data) })),
        [sources]);
    const view = useMemo(() => link.resolve(state, linked), [state, linked]);

    const sharedMaxY = useMemo(
        () => Math.max(1, ...(sources ?? []).map(({ data }) =>
            computeMaxY([data.valuesA, data.valuesC, data.valuesG, data.valuesT]))),
        [sources]);

    // Read after data-applied-mode is set, so each theme gets its own palette.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme selects the CSS variables read here
    const traceColors = useMemo(() => colorsFromCss(document.documentElement, TRACE_COLOR_VARS), [theme]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme selects the CSS variables read here
    const scrollColors = useMemo(() => colorsFromCss(document.documentElement, SCROLL_COLOR_VARS), [theme]);

    function toggleTheme() {
        const next = theme === 'dark' ? 'light' : 'dark';
        // Synchronous update so the colors above read the new theme's variables.
        document.documentElement.dataset.appliedMode = next;
        setTheme(next);
    }

    const from = Math.round(view.shared.from);
    const to = Math.round(view.shared.from + view.shared.size);

    return (
        <>
            <div className="left">
                <Legend />
            </div>
            <div ref={leftResizerRef} className="left-resizer"></div>

            <div className="main">
                <div className="toolbar">
                    <span className="toolbar-title">SeqTrace</span>
                    <button title="Zoom out all traces" onClick={() => setState(s => link.zoomOutOverall(s, linked))}>-</button>
                    <button title="Zoom in all traces" onClick={() => setState(s => link.zoomInOverall(s, linked))}>+</button>
                    <button className="wide" title="Back to the whole range, without per-trace shifts or zoom"
                            onClick={() => setState(link.initialState())}>Reset</button>
                    <label>
                        <input type="checkbox" checked={sameScale} onChange={e => setSameScale(e.target.checked)} /> Same scale
                    </label>
                    <button title="Toggle light/dark theme" onClick={toggleTheme}>
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>

                <SeqScrollBarComponent
                    className="overall-scroll"
                    lo={view.range.lo} hi={view.range.hi}
                    from={view.shared.from} size={view.shared.size}
                    page={link.options.overallPage}
                    colors={scrollColors}
                    onMove={f => setState(s => link.scrollOverall(s, linked, f))}
                />

                <div className="traces">
                    {sources?.map(({ name, title, data }) => {
                        const win = view.windows[name];
                        return (
                            <div className="trace-row" key={name}>
                                <div className="trace-title">
                                    <span>{title}</span>
                                    <button title="Zoom out this trace only"
                                            onClick={() => setState(s => link.zoomOutTrace(s, linked, name))}>-</button>
                                    <button title="Zoom in this trace only"
                                            onClick={() => setState(s => link.zoomInTrace(s, linked, name))}>+</button>
                                </div>
                                <SeqTraceComponent
                                    data={data}
                                    win={win}
                                    scale={sameScale ? sharedMaxY : 'auto'}
                                    colors={traceColors}
                                />
                                <SeqScrollBarComponent
                                    className="trace-scroll"
                                    lo={0} hi={traceLength(data)}
                                    from={win?.from ?? 0} size={win ? win.to - win.from : traceLength(data)}
                                    page={link.options.tracePage}
                                    colors={scrollColors}
                                    onMove={f => setState(s => link.scrollTrace(s, linked, name, f))}
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="status-bar">
                    {sources
                        ? `Overall window: samples ${from}–${to} (${to - from} of ${Math.round(view.range.hi - view.range.lo)})`
                        : 'Loading…'}
                </div>
            </div>
        </>
    );
}
