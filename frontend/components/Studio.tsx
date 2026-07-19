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

const trackHasWords = (t?: CaptionTrack) =>
  !!t && t.segments.some((s) => s.words && s.words.length > 0);

export default function Studio({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstLang = job.tracks[0]?.language ?? 'en';
  const [tracks, setTracks] = useState<CaptionTrack[]>(job.tracks);
  const [shown, setShown] = useState<string[]>([firstLang]);
  // one style per language; new languages start as a copy of the first style
  const [styles, setStyles] = useState<Record<string, CaptionStyle>>({
    [firstLang]: { ...PRESETS[0].style },
  });
  const [styleTab, setStyleTab] = useState(firstLang);
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

  const styleFor = (lang: string): CaptionStyle =>
    styles[lang] ?? styles[firstLang] ?? { ...PRESETS[0].style };

  const setTrackSegments = (language: string, segments: CaptionTrack['segments']) =>
    setTracks((prev) => prev.map((t) => (t.language === language ? { ...t, segments } : t)));

  const handleJobUpdate = (j: PublicJob) => {
    setTracks(j.tracks);
    // drop displayed languages whose track no longer exists; never go empty
    setShown((prev) => {
      const kept = prev.filter((code) => j.tracks.some((t) => t.language === code));
      return kept.length > 0 ? kept : [j.tracks[0]?.language ?? 'en'];
    });
    // give any new language its own style, seeded from the first style
    setStyles((prev) => {
      const next = { ...prev };
      for (const t of j.tracks) {
        if (!next[t.language]) next[t.language] = { ...styleFor(firstLang) };
      }
      return next;
    });
  };

  // the style tab must always point at a displayed language
  useEffect(() => {
    if (!shown.includes(styleTab)) setStyleTab(shown[0]);
  }, [shown, styleTab]);

  const shownTracks = shown
    .map((code) => tracks.find((t) => t.language === code))
    .filter((t): t is CaptionTrack => t !== undefined);
  const activeTab = shown.includes(styleTab) ? styleTab : shown[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <LanguagePanel
          jobId={job.id}
          trackLangs={tracks.map((t) => t.language)}
          shown={shown}
          onShownChange={setShown}
          onJobUpdate={handleJobUpdate}
        />
        <div>
          {shown.length > 1 && (
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-800/60 p-1">
              {shown.map((code) => (
                <button
                  key={code}
                  onClick={() => setStyleTab(code)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium uppercase
                    ${code === activeTab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {code === 'en' ? 'English' : code}
                </button>
              ))}
            </div>
          )}
          <StyleControls
            style={styleFor(activeTab)}
            onChange={(s) => setStyles((prev) => ({ ...prev, [activeTab]: s }))}
            isPrimary={activeTab === shown[0]}
            hasWords={trackHasWords(tracks.find((t) => t.language === activeTab))}
          />
        </div>
      </aside>

      <section className="space-y-6">
        <div ref={containerRef} className="relative flex justify-center overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef} src={videoUrl(job.id)} controls
            className="max-h-[60vh] w-auto max-w-full"
          />
          <CaptionOverlay
            tracks={shownTracks} styles={styles}
            currentTime={currentTime} containerHeight={containerHeight}
          />
        </div>

        <ExportBar jobId={job.id} styles={styles} tracks={tracks} languages={shown} onReset={onReset} />
        <TranscriptEditor tracks={tracks} onChange={setTrackSegments} onSeek={seek} currentTime={currentTime} />
      </section>
    </div>
  );
}
