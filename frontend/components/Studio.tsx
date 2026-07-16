'use client';
import { useEffect, useRef, useState } from 'react';
import CaptionOverlay from './CaptionOverlay';
import StyleControls from './StyleControls';
import TranscriptEditor from './TranscriptEditor';
import ExportBar from './ExportBar';
import { videoUrl } from '@/lib/api';
import { PRESETS } from '@/lib/presets';
import type { CaptionStyle, PublicJob, Segment } from '@/lib/types';

export default function Studio({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CaptionStyle>({ ...PRESETS[0].style });
  const [segments, setSegments] = useState<Segment[]>(job.tracks[0]?.segments ?? []);
  const [currentTime, setCurrentTime] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF loop keeps captions in sync even between 'timeupdate' events
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <StyleControls style={style} onChange={setStyle} />
      </aside>

      <section className="space-y-6">
        <div ref={containerRef} className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} src={videoUrl(job.id)} controls className="w-full" />
          <CaptionOverlay
            segments={segments} style={style}
            currentTime={currentTime} containerHeight={containerHeight}
          />
        </div>

        <ExportBar jobId={job.id} style={style} segments={segments} onReset={onReset} />
        <TranscriptEditor segments={segments} onChange={setSegments} onSeek={seek} currentTime={currentTime} />
      </section>
    </div>
  );
}
