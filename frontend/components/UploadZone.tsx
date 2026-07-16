'use client';
import { useRef, useState } from 'react';
import { uploadVideo } from '@/lib/api';

const ACCEPT = ['.mp4', '.mov', '.avi'];
const MAX_MB = 500;

export default function UploadZone({ onUploaded }: { onUploaded: (jobId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ACCEPT.includes(ext)) return setError('Please choose an MP4, MOV or AVI file.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`File is too large (max ${MAX_MB} MB).`);
    try {
      setProgress(0);
      const { jobId } = await uploadVideo(file, setProgress);
      onUploaded(jobId);
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition
          ${dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <div className="text-5xl">🎬</div>
        <p className="mt-4 text-lg font-medium">Drop your video here</p>
        <p className="mt-1 text-sm text-slate-400">or click to browse — MP4, MOV, AVI up to {MAX_MB} MB</p>
        <input
          ref={inputRef} type="file" accept={ACCEPT.join(',')} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
      </div>
      {progress !== null && (
        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-center text-sm text-slate-400">Uploading… {progress}%</p>
        </div>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
