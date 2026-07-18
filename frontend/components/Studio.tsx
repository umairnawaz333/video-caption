'use client';
import { useEffect, useRef, useState } from 'react';
import CaptionOverlay from './CaptionOverlay';
import LanguagePanel from './LanguagePanel';
import StyleControls from './StyleControls';
import TranscriptEditor from './TranscriptEditor';
import ExportBar from './ExportBar';
import { videoUrl } from '@/lib/api';
import { PRESETS } from '@/lib/presets';
import type { CaptionStyle, CaptionTrack, PublicJob } from '@/lib/types';

export default function Studio({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CaptionStyle>({ ...PRESETS[0].style });
  const [tracks, setTracks] = useState<CaptionTrack[]>(job.tracks);
  const [shown, setShown] = useState<string[]>([job.tracks[0]?.language ?? 'en']);
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

  const setTrackSegments = (language: string, segments: CaptionTrack['segments']) =>
    setTracks((prev) => prev.map((t) => (t.language === language ? { ...t, segments } : t)));

  const shownTracks = shown
    .map((code) => tracks.find((t) => t.language === code))
    .filter((t): t is CaptionTrack => t !== undefined);

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <LanguagePanel
          jobId={job.id}
          trackLangs={tracks.map((t) => t.language)}
          shown={shown}
          onShownChange={setShown}
          onJobUpdate={(j) => {
            setTracks(j.tracks);
            // drop displayed languages whose track no longer exists; never go empty
            setShown((prev) => {
              const kept = prev.filter((code) => j.tracks.some((t) => t.language === code));
              return kept.length > 0 ? kept : [j.tracks[0]?.language ?? 'en'];
            });
          }}
        />
        <StyleControls style={style} onChange={setStyle} />
      </aside>

      <section className="space-y-6">
        <div ref={containerRef} className="relative flex justify-center overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef} src={videoUrl(job.id)} controls
            className="max-h-[60vh] w-auto max-w-full"
          />
          <CaptionOverlay
            tracks={shownTracks} style={style}
            currentTime={currentTime} containerHeight={containerHeight}
          />
        </div>

        <ExportBar jobId={job.id} style={style} tracks={tracks} languages={shown} onReset={onReset} />
        <TranscriptEditor tracks={tracks} onChange={setTrackSegments} onSeek={seek} currentTime={currentTime} />
      </section>
    </div>
  );
}
