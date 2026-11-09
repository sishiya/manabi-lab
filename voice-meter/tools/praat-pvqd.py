# PVQD から等間隔に N 人ぶん落とし、のばす声（hold）と話し声（speech）に切り分ける。python -I pvqd_prepare.py <public> <cut> N
import json, subprocess, sys, wave, struct
from pathlib import Path
import numpy as np
import parselmouth as pm

pub, cut, N = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
raw = pub / "raw"
raw.mkdir(parents=True, exist_ok=True)
cut.mkdir(parents=True, exist_ok=True)
meta = json.load(open(pub / "pvqd-meta.json", encoding="utf-8"))
wavs = sorted((f for f in meta["files"] if f["filename"].lower().endswith(".wav")), key=lambda f: f["filename"].upper())
prefix = {}
for f in wavs:
    prefix[f["filename"][:2]] = prefix.get(f["filename"][:2], 0) + 1
print("wav", len(wavs), "prefix", prefix)
pick = [wavs[int(i * len(wavs) / N)] for i in range(N)]
total = 0
for i, f in enumerate(pick):
    p = raw / f"p{i:02d}.wav"
    if not p.exists():
        d = subprocess.run(["curl", "-sS", "-m", "120", "-L", f["content_details"]["download_url"]], capture_output=True, check=True).stdout
        if d[:4] != b"RIFF" or d[8:12] != b"WAVE" or len(d) != f["size"]:
            print("skip not wav", i, len(d))
            continue
        p.write_bytes(d)
    total += p.stat().st_size


def save(name, x, sr):
    y = np.clip(x, -1, 1)
    with wave.open(str(cut / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(struct.pack("<%dh" % len(y), *(y * 32767).astype(np.int16)))


print("downloaded MB", round(total / 1e6, 1))
for p in sorted(raw.glob("p*.wav")):
    snd = pm.Sound(str(p)).convert_to_mono()
    sr, x = snd.sampling_frequency, snd.values[0]
    pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=75.0, pitch_ceiling=600.0)
    f = pitch.selected_array["frequency"]
    runs, s = [], -1
    for i in range(len(f) + 1):
        v = i < len(f) and f[i] > 0
        if v and s < 0:
            s = i
        if not v and s >= 0:
            runs.append((s, i))
            s = -1
    t = lambda i: pitch.get_time_from_frame_number(i + 1)
    long_runs = [r for r in runs if r[1] - r[0] >= 120]  # 1.2 秒以上は「のばす」
    dur = snd.duration
    info = f"{p.stem} dur {dur:.1f} sr {sr:.0f} runs>=1.2s {[round((b - a) * .01, 1) for a, b in long_runs]}"
    vowels = [r for r in long_runs if r[1] - r[0] >= 200]  # 2 秒以上だけ母音として測る（文の中の長い有声を拾わない）
    if vowels:
        a, b = vowels[0]
        ta, tb = t(a) + .1, min(t(b - 1) - .1, t(a) + 4.1)
        save(f"{p.stem}-hold.wav", x[int(ta * sr):int(tb * sr)], sr)
    ts, te = 0, dur
    if long_runs:  # 母音のならびの前か後ろの、長いほうが文の朗読
        before, after = t(long_runs[0][0]) - .3, dur - t(long_runs[-1][1] - 1) - .3
        ts, te = (0, before) if before > after else (dur - after, dur)
    te = min(te, ts + 25)
    if te - ts >= 5:
        save(f"{p.stem}-talk.wav", x[int(ts * sr):int(te * sr)], sr)
        info += f" talk {te - ts:.1f}s"
    print(info)
