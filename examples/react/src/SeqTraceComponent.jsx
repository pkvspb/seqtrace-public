import { useEffect, useRef } from 'react';
import { initSeqTrace } from '../../../lib/seqtrace.js';

// One trace. The instance is created once per `data`; the window, scale and
// colors are then pushed into it with its setters, so a zoom, a scroll or a
// theme change repaints without re-creating it.
export default function SeqTraceComponent({ data, win, scale, colors }) {
    const containerRef = useRef(null);
    const traceRef = useRef(null);

    useEffect(() => {
        const trace = initSeqTrace(containerRef.current, { data, colors, scale, window: win });
        traceRef.current = trace;
        return () => {
            trace.unInit();
            traceRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the other props are applied by the effects below
    }, [data]);

    useEffect(() => {
        if (win) traceRef.current?.setWindow(win.from, win.to);
    }, [win]);

    useEffect(() => {
        traceRef.current?.setScale(scale);
    }, [scale]);

    useEffect(() => {
        traceRef.current?.setColors(colors);
    }, [colors]);

    return <div ref={containerRef} className="trace" />;
}
