import type { CaptionStyle, LanguageInfo, PublicJob, Segment } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function uploadVideo(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ jobId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else {
        try { reject(new Error(JSON.parse(xhr.responseText).message ?? 'Upload failed')); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error — is the backend running on :4000?'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).message ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}

export const getJob = (id: string) =>
  fetch(`${BASE}/api/jobs/${id}`).then((r) => json<PublicJob>(r));

export const getLanguages = () =>
  fetch(`${BASE}/api/languages`).then((r) => json<LanguageInfo[]>(r));

export const translateJob = (id: string, language: string) =>
  fetch(`${BASE}/api/jobs/${id}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  }).then((r) => json<{ ok: boolean }>(r));

export const deleteTrack = (id: string, language: string) =>
  fetch(`${BASE}/api/jobs/${id}/tracks/${language}`, { method: 'DELETE' })
    .then((r) => json<PublicJob>(r));

export const patchTranscript = (id: string, segments: Segment[], language?: string) =>
  fetch(`${BASE}/api/jobs/${id}/transcript`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments, language }),
  }).then((r) => json<PublicJob>(r));

export const exportJob = (id: string, style: CaptionStyle, languages?: string[]) =>
  fetch(`${BASE}/api/jobs/${id}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style, languages }),
  }).then((r) => json<{ ok: boolean }>(r));

export const videoUrl = (id: string) => `${BASE}/api/jobs/${id}/video`;
export const downloadUrl = (id: string) => `${BASE}/api/jobs/${id}/download`;
