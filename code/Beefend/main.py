import os
import queue
import threading
import time
from collections import deque

import cv2
import numpy as np
import requests
from dotenv import load_dotenv

import tracker as rings

load_dotenv()
API_TOKEN = os.environ["API_TOKEN"]

SEND_INTERVAL = 1.0

SEND_URL = "https://fonduetracker.rovner.ch/api/sensor/default"
# SEND_URL = "http://127.0.0.1:8000/tags"

MARKER = "rings"
RING_UNIT_PX = 8
SEARCH_SCALE = 0.4
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

history = deque(maxlen=30)

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
    smoothed_tags = []
    for fork_id, fork_in_pot in in_pot.items():
        smoothed_tags.append({"id": fork_id, "in_pot": fork_in_pot})

    smoothed_output = {
        "time": boolean_output["time"],
        "temperature": boolean_output["temperature"],
        "tags": smoothed_tags,
    }
    try:
        if tags and now - last_sent >= SEND_INTERVAL:
            print(f"{now:6.1f}s {len(tags)} tags: {sorted({t['id'] for t in smoothed_tags})}")
            send_queue.put_nowait(smoothed_output)
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


def main():
    """Show a live preview and pass detections to on_tags() until q or Ctrl+C."""
    threading.Thread(target=sender, daemon=True).start()
    start = time.monotonic()
    frames = detections = 0
    try:
        for frame in camera_frames(CAMERA):
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
    print(f"\n{CAMERA}: {frames} frames in {elapsed:.1f}s ({frames / elapsed:.1f} fps), "
          f"{detections} detections")


if __name__ == "__main__":
    main()
