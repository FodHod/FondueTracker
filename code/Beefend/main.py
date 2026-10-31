import csv
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
import requests

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
OUT_DIR = Path("output")
SEND_INTERVAL = 1.0  # seconds between on_tags() calls in live mode
SEND_URL = "http://127.0.0.1:8000/tags"  # e.g. "http://192.168.1.50:8000/tags"; None = only print

DETECTOR = cv2.aruco.ArucoDetector(
    cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11),
    cv2.aruco.DetectorParameters(),
)


def detect(image: np.ndarray) -> list[dict]:
    """Return [{id, center, corners}] in pixel coordinates."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    corners, ids, _ = DETECTOR.detectMarkers(gray)
    if ids is None:
        return []
    return [
        {"id": int(i), "center": c[0].mean(axis=0), "corners": c[0]}
        for i, c in zip(ids.flatten(), corners)
    ]


def draw(image: np.ndarray, tags: list[dict]) -> np.ndarray:
    out = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR) if image.ndim == 2 else image.copy()
    for t in tags:
        cv2.polylines(out, [t["corners"].astype(int)], True, (0, 255, 0), 2)
        cx, cy = t["center"].astype(int)
        cv2.circle(out, (cx, cy), 4, (0, 0, 255), -1)
        cv2.putText(out, str(t["id"]), (cx + 6, cy - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    return out


def process_image(path: Path):
    image = cv2.imread(str(path))
    if image is None:
        print(f"{path}: could not read")
        return
    tags = detect(image)
    print(f"{path}: {len(tags)} tag(s)")
    for t in tags:
        cx, cy = t["center"]
        print(f"  id={t['id']:<3} center=({cx:.1f}, {cy:.1f})")
    cv2.imwrite(str(OUT_DIR / path.name), draw(image, tags))


def process_video(path: Path):
    """Annotate every frame into output/<name>.mp4 and log detections to output/<name>.csv."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        print(f"{path}: could not open")
        return
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    # H.264 via ffmpeg: much smaller than OpenCV's built-in mp4v.
    writer = imageio_ffmpeg.write_frames(
        str(OUT_DIR / f"{path.stem}.mp4"), size, fps=fps, pix_fmt_in="bgr24",
        codec="libx264", quality=None, output_params=["-crf", "28", "-preset", "fast"],
    )
    writer.send(None)

    frames = frames_with_tags = 0
    ids = Counter()
    with open(OUT_DIR / f"{path.stem}.csv", "w", newline="") as f:
        log = csv.writer(f)
        log.writerow(["frame", "time_s", "id", "cx", "cy"])
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            tags = detect(frame)
            for t in tags:
                cx, cy = t["center"]
                log.writerow([frames, f"{frames / fps:.3f}", t["id"], f"{cx:.1f}", f"{cy:.1f}"])
            ids.update(t["id"] for t in tags)
            frames_with_tags += bool(tags)
            writer.send(draw(frame, tags))
            frames += 1

    cap.release()
    writer.close()
    print(f"{path}: {frames} frames, {frames_with_tags} with tags, "
          f"{ids.total()} detections")
    print("  per id: " + ", ".join(f"{i}={n}" for i, n in sorted(ids.items())))


def camera_frames(source: str):
    """Yield BGR frames from "picam" (Pi camera module), a webcam index, or a stream URL."""
    if source == "picam":
        from picamera2 import Picamera2  # Pi only: sudo apt install python3-picamera2
        cam = Picamera2()
        cam.configure(cam.create_video_configuration(main={"size": (1280, 720), "format": "RGB888"}))
        if "AfMode" in cam.camera_controls:  # e.g. Camera Module 3; autofocus is off by default
            cam.set_controls({"AfMode": 2})  # 2 = continuous
        cam.start()
        try:
            while True:
                yield cam.capture_array()  # "RGB888" is BGR in memory, as OpenCV expects
        finally:
            cam.close()
    else:
        cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
        if not cap.isOpened():
            raise SystemExit(f"{source}: could not open")
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    return
                yield frame
        finally:
            cap.release()


def on_tags(tags: list[dict], t_s: float):
    """Called at most every SEND_INTERVAL with the current tags; POSTs them to SEND_URL."""
    print(f"{t_s:7.2f}s  " + "  ".join(f"id={t['id']}@({t['x']:.0f},{t['y']:.0f})" for t in tags))
    if SEND_URL is None:
        return
    try:
        # Short timeout: this runs inside the camera loop, so a slow server stalls the preview.
        r = requests.post(SEND_URL, json={"time": time.time(), "tags": tags}, timeout=0.5)
        print(f"         -> {r.status_code}")
    except requests.RequestException as e:
        print(f"         -> send failed: {e}")


def process_live(source: str):
    """Show a live preview and pass detections to on_tags() until q or Ctrl+C."""
    start = time.monotonic()
    last_sent = -SEND_INTERVAL
    frames = detections = 0
    try:
        for frame in camera_frames(source):
            tags = detect(frame)
            now = time.monotonic() - start
            if tags and now - last_sent >= SEND_INTERVAL:
                on_tags([{"id": t["id"], "x": float(t["center"][0]), "y": float(t["center"][1])}
                         for t in tags], now)
                last_sent = now
            detections += len(tags)
            frames += 1
            cv2.imshow("apriltags", draw(frame, tags))
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    except KeyboardInterrupt:
        pass
    cv2.destroyAllWindows()
    elapsed = time.monotonic() - start
    print(f"\n{source}: {frames} frames in {elapsed:.1f}s ({frames / elapsed:.1f} fps), "
          f"{detections} detections")


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for source in sys.argv[1:] or sorted(str(p) for p in Path("images").glob("*.png")):
        if source == "picam" or source.isdigit() or "://" in source:
            process_live(source)
        elif Path(source).suffix.lower() in VIDEO_EXTS:
            process_video(Path(source))
        else:
            process_image(Path(source))


if __name__ == "__main__":
    main()
