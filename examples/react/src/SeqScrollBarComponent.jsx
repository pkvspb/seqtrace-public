import { useEffect, useRef } from 'react';
import { initSeqScrollBar } from '../../../lib/seqscrollbar.js';

// A scroll bar set from outside. onMove fires only for the user's moves; the
// parent turns it into new state, which comes back here as lo/hi/from/size.
export default function SeqScrollBarComponent({ lo, hi, from, size, page, colors, onMove, className }) {
    const containerRef = useRef(null);
    const barRef = useRef(null);
    const onMoveRef = useRef(onMove);
    onMoveRef.current = onMove;

    useEffect(() => {
        const bar = initSeqScrollBar(containerRef.current, {
            lo, hi, from, size, page, colors,
            onMove: (next) => onMoveRef.current?.(next),
        });
        barRef.current = bar;
        return () => {
            bar.unInit();
            barRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the other props are applied by the effects below
    }, [page]);

    useEffect(() => {
        barRef.current?.setRange(lo, hi);
        barRef.current?.setWindow(from, size);
    }, [lo, hi, from, size]);

    useEffect(() => {
        barRef.current?.setColors(colors);
    }, [colors]);

    return <div ref={containerRef} className={className} />;
}
