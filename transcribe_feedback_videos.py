import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


VIDEO_DIR = Path(r"C:\Users\Hopef\Desktop\carsales\feedback_videos")
OUTPUT = Path(r"C:\Users\Hopef\Desktop\Fgsh\feedback_transcriptions.json")


def main() -> None:
    videos = sorted(VIDEO_DIR.glob("*.mp4"), key=lambda p: p.name.lower())
    if not videos:
        raise SystemExit(f"No MP4 files found in {VIDEO_DIR}")

    model_size = sys.argv[1] if len(sys.argv) > 1 else "small"
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else OUTPUT
    print(f"Loading Whisper model ({model_size})...", flush=True)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    results = []
    for idx, video in enumerate(videos, 1):
        print(f"[{idx}/{len(videos)}] Transcribing {video.name}", flush=True)
        segments, info = model.transcribe(
            str(video),
            language="ar",
            task="transcribe",
            beam_size=5,
            best_of=5,
            temperature=0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 350},
        )
        segs = []
        for s in segments:
            text = s.text.strip()
            if text:
                segs.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": text})
        results.append(
            {
                "file": video.name,
                "duration_seconds": round(float(info.duration), 2),
                "detected_language": info.language,
                "language_probability": round(float(info.language_probability), 4),
                "segments": segs,
                "text": " ".join(s["text"] for s in segs),
            }
        )
    output_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {output_path}", flush=True)


if __name__ == "__main__":
    main()
