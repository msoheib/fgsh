import React, { useEffect, useMemo, useState } from 'react';
import {
  AdminService,
  GAME_AUDIO_CUE_DEFINITIONS,
  type GameAudioCue,
  type GameAudioCueKey,
} from '@fakash/shared';

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return 'غير محدد';
  return `${(durationMs / 1000).toFixed(1)} ث`;
}

async function readAudioDurationMs(file: File): Promise<number | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = objectUrl;
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('failed_metadata'));
    });

    if (!Number.isFinite(duration) || duration <= 0) return null;
    return Math.round(duration * 1000);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const AudioCueManager: React.FC = () => {
  const [cuesByKey, setCuesByKey] = useState<Record<string, GameAudioCue>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cueRows = useMemo(() => GAME_AUDIO_CUE_DEFINITIONS, []);

  const loadCues = async () => {
    setLoading(true);
    setError(null);
    try {
      const cues = await AdminService.getGameAudioCues();
      const mapped: Record<string, GameAudioCue> = {};
      for (const cue of cues) {
        mapped[cue.cue_key] = cue;
      }
      setCuesByKey(mapped);
    } catch {
      setError('فشل تحميل إعدادات الصوت.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCues();
  }, []);

  const handleFileChange = (cueKey: GameAudioCueKey, file: File | null) => {
    setSelectedFiles((prev) => ({ ...prev, [cueKey]: file }));
    setSuccess(null);
    setError(null);
  };

  const handleUpload = async (cueKey: GameAudioCueKey) => {
    const file = selectedFiles[cueKey];
    if (!file) return;

    const cueDefinition = cueRows.find((cue) => cue.key === cueKey);
    if (!cueDefinition) return;

    setSavingKey(cueKey);
    setError(null);
    setSuccess(null);
    try {
      const [audioUrl, durationMs] = await Promise.all([
        AdminService.uploadGameAudioFile(file, cueKey),
        readAudioDurationMs(file),
      ]);

      const updated = await AdminService.upsertGameAudioCue({
        cue_key: cueKey,
        label: cueDefinition.label,
        audio_url: audioUrl,
        duration_ms: durationMs,
        is_active: cuesByKey[cueKey]?.is_active ?? true,
      });

      setCuesByKey((prev) => ({ ...prev, [cueKey]: updated }));
      setSelectedFiles((prev) => ({ ...prev, [cueKey]: null }));
      setSuccess(`تم حفظ الصوت لنقطة: ${cueDefinition.label}`);
    } catch (uploadError: any) {
      setError(uploadError?.message || 'فشل رفع ملف الصوت.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleActive = async (cueKey: GameAudioCueKey, isActive: boolean) => {
    const cueDefinition = cueRows.find((cue) => cue.key === cueKey);
    if (!cueDefinition) return;

    setSavingKey(cueKey);
    setError(null);
    setSuccess(null);
    try {
      const existing = cuesByKey[cueKey];
      const updated = await AdminService.upsertGameAudioCue({
        cue_key: cueKey,
        label: cueDefinition.label,
        audio_url: existing?.audio_url ?? null,
        duration_ms: existing?.duration_ms ?? null,
        is_active: isActive,
      });
      setCuesByKey((prev) => ({ ...prev, [cueKey]: updated }));
      setSuccess(`تم تحديث حالة الصوت: ${cueDefinition.label}`);
    } catch {
      setError('فشل تحديث حالة الصوت.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleClearAudio = async (cueKey: GameAudioCueKey) => {
    setSavingKey(cueKey);
    setError(null);
    setSuccess(null);
    try {
      await AdminService.clearGameAudioCue(cueKey);
      setCuesByKey((prev) => ({
        ...prev,
        [cueKey]: prev[cueKey]
          ? { ...prev[cueKey], audio_url: null, duration_ms: null }
          : prev[cueKey],
      }));
      setSuccess('تم حذف ملف الصوت من هذه النقطة.');
    } catch {
      setError('فشل حذف ملف الصوت.');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-white/60">
        جاري تحميل إعدادات المؤثرات الصوتية...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">إدارة أصوات شاشة التلفزيون</h2>
          <p className="text-white/60 text-sm mt-1">
            هذه الأصوات تُشغَّل في شاشة التلفزيون فقط عند انتقالات اللعب.
          </p>
        </div>
        <button
          onClick={loadCues}
          className="px-4 py-2 rounded-lg glass text-sm hover:bg-white/10 transition-colors"
        >
          تحديث
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-xl bg-green-500/20 border border-green-500/40 text-green-200 text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {cueRows.map((cue) => {
          const existing = cuesByKey[cue.key];
          const selectedFile = selectedFiles[cue.key];
          const isSaving = savingKey === cue.key;
          const hasAudio = !!existing?.audio_url;

          return (
            <div key={cue.key} className="glass rounded-2xl p-4 border border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{cue.label}</p>
                  <p className="text-sm text-white/60 mt-1">{cue.description}</p>
                  <p className="text-xs text-white/50 mt-2 font-mono">{cue.key}</p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={existing?.is_active ?? true}
                    disabled={isSaving}
                    onChange={(e) => handleToggleActive(cue.key, e.target.checked)}
                  />
                  <span>مفعّل</span>
                </label>
              </div>

              <div className="mt-4 space-y-3">
                <div className="text-xs text-white/60">
                  المدة الحالية: {formatDuration(existing?.duration_ms ?? null)}
                </div>

                {hasAudio && (
                  <audio controls className="w-full" src={existing.audio_url || undefined} />
                )}

                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleFileChange(cue.key, e.target.files?.[0] || null)}
                  className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpload(cue.key)}
                    disabled={!selectedFile || isSaving}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-800 text-sm font-bold disabled:opacity-50"
                  >
                    {isSaving ? 'جاري الحفظ...' : 'رفع وحفظ'}
                  </button>

                  <button
                    onClick={() => handleClearAudio(cue.key)}
                    disabled={!hasAudio || isSaving}
                    className="px-4 py-2 rounded-lg bg-red-600/80 text-sm font-bold disabled:opacity-50"
                  >
                    حذف الصوت
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

