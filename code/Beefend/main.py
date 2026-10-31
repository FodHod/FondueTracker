import csv
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
import requests

import threading
import queue
from collections import deque

from dotenv import load_dotenv
import os

import tracker as rings

load_dotenv()
API_TOKEN = os.environ["API_TOKEN"]

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
OUT_DIR = Path("output")
SEND_INTERVAL = 1.0

SEND_URL = "https://fonduetracker.rovner.ch/api/sensor/default"
# SEND_URL = "http://127.0.0.1:8000/tags"

# Marker to track: "rings" (ring barcode, tracker.py) or "apriltag".
MARKER = "rings"
# Ring unit u in full-res pixels at your camera distance: run `python tracker.py frame.jpg`
# on a captured frame and copy the u it prints.
RING_UNIT_PX = 8
# Low-res search pass as a fraction of the frame (0.4 = 512x288 from 1280x720); reading is
# always full res. Lower = faster; keep RING_UNIT_PX * SEARCH_SCALE >= 3.
SEARCH_SCALE = 0.4
# Source when run without arguments: "picam", a webcam index like "0", or a stream URL.
CAMERA = "picam"

DETECTOR = cv2.aruco.ArucoDetector(
    cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11),
    cv2.aruco.DetectorParameters(),
)

send_queue = queue.Queue(maxsize=1)

def detect_apriltag(image: np.ndarray) -> list[dict]:
    """Return [{id, center, corners}] in pixel coordinates."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    corners, ids, _ = DETECTOR.detectMarkers(gray)
    if ids is None:
        return []
    return [
        {"id": int(i), "center": c[0].mean(axis=0), "corners": c[0]}
        for i, c in zip(ids.flatten(), corners)
    ]


def draw_apriltag(image: np.ndarray, tags: list[dict]) -> np.ndarray:
    out = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR) if image.ndim == 2 else image.copy()
    for t in tags:
        cv2.polylines(out, [t["corners"].astype(int)], True, (0, 255, 0), 2)
        cx, cy = t["center"].astype(int)
        cv2.circle(out, (cx, cy), 4, (0, 0, 255), -1)
        cv2.putText(out, str(t["id"]), (cx + 6, cy - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    return out


def detect(image: np.ndarray) -> list[dict]:
    """Both detectors return [{id, center, ...}]; only draw() needs the rest."""
    if MARKER == "rings":
        return rings.detect(image, unit_px=RING_UNIT_PX, search_scale=SEARCH_SCALE)
    return detect_apriltag(image)


def draw(image: np.ndarray, tags: list[dict]) -> np.ndarray:
    return rings.draw(image, tags) if MARKER == "rings" else draw_apriltag(image, tags)


def process_image(path: Path):
    image = cv2.imread(str(path))
    if image is None:
        print(f"{path}: could not read")
        return
    t0 = time.perf_counter()
    tags = detect(image)
    print(f"{path}: {len(tags)} tag(s) in {1000 * (time.perf_counter() - t0):.0f} ms")
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

x_min = 300
x_max = 1400
y_min = 100
y_max = 700

def is_in_pot(tag):
    return x_min < tag["x"] < x_max and y_min < tag["y"] < y_max

def create_output(tags):
    in_pot_by_id = {}
    for tag in tags:
        in_pot_by_id[tag["id"]] = in_pot_by_id.get(tag["id"], False) or is_in_pot(tag)

    processed_tags = [{"id": i, "in_pot": v} for i, v in in_pot_by_id.items()]
    return {"time": time.time(), "temperature": 27, "tags": processed_tags}

history = deque(maxlen=5)

last_sent = -SEND_INTERVAL
def on_tags(tags: list[dict], now: float):
    global last_sent
    if SEND_URL is None:
        return

    boolean_output = create_output(tags)

    in_pot={}
    history.append(boolean_output["tags"])
    for output in history:
        for fork in output:
            if fork["id"] not in in_pot:
                in_pot[fork["id"]] = fork["in_pot"]
            elif fork["in_pot"]:
                in_pot[fork["id"]] = True

    try:
        if tags and now - last_sent >= SEND_INTERVAL:
            print(f"{now:6.1f}s {len(tags)} tags: {sorted({t['id'] for t in tags})}")
            send_queue.put_nowait(boolean_output)
            last_sent = now
    except queue.Full:
        pass


def sender():
    while True:
        payload = send_queue.get()
        try:
            r = requests.post(SEND_URL, json=payload, headers={"Authorization": f"Bearer {API_TOKEN}"},timeout=2)
            print(f"         -> {r.status_code}")
        except requests.RequestException as e:
            print(f"         -> send failed: {e}")

threading.Thread(target=sender, daemon=True).start()

def process_live(source: str):
    """Show a live preview and pass detections to on_tags() until q or Ctrl+C."""
    start = time.monotonic()
    frames = detections = 0
    try:
        for frame in camera_frames(source):
            tags = detect(frame)
            now = time.monotonic() - start
            on_tags([{"id": t["id"], "x": float(t["center"][0]), "y": float(t["center"][1])}
                        for t in tags], now)

            detections += len(tags)
            frames += 1
            cv2.imshow(MARKER, draw(frame, tags))
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
    for source in sys.argv[1:] or [CAMERA]:
        if source == "picam" or source.isdigit() or "://" in source:
            process_live(source)
        elif Path(source).suffix.lower() in VIDEO_EXTS:
            process_video(Path(source))
        else:
            process_image(Path(source))


if __name__ == "__main__":
    main()
