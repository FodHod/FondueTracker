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
POT_CHECK_EVERY = 60  # frames between AprilTag scans for the pot markers
# Fork tip = code center + this many px along the code's START->STOP direction.
# In the pot when the tip is inside the pot circle. Negative if the strip is wrapped
# with START toward the tines.
TIP_OFFSET_PX = 300

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

pot_tags = {}  # AprilTag id -> last seen center; kept when a scan doesn't see it


def update_pot_tags(frame: np.ndarray):
    seen = detect_apriltag(frame)
    for t in seen:
        pot_tags[t["id"]] = t["center"]



def pot_circle():
    """Least-squares circle through the pot tags: ((cx, cy), r), or None with fewer than 3."""
    if len(pot_tags) < 3:
        return None
    pts = np.array(list(pot_tags.values()), np.float64)
    # x^2 + y^2 = 2a*x + 2b*y + c  ->  center (a, b), r^2 = c + a^2 + b^2
    A = np.column_stack([2 * pts, np.ones(len(pts))])
    (a, b, c), *_ = np.linalg.lstsq(A, (pts ** 2).sum(axis=1), rcond=None)
    return (a, b), np.sqrt(c + a * a + b * b)


def draw_pot(image: np.ndarray) -> np.ndarray:
    circle = pot_circle()
    if circle:
        (cx, cy), r = circle
        cv2.circle(image, (int(cx), int(cy)), int(r), (255, 128, 0), 2)
    for tag_id, (x, y) in pot_tags.items():
        cv2.drawMarker(image, (int(x), int(y)), (255, 128, 0), cv2.MARKER_CROSS, 20, 2)
        cv2.putText(image, f"P{tag_id}", (int(x) + 8, int(y) - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 128, 0), 2)
    return image

def fork_tip(tag: dict) -> np.ndarray:
    """Estimated tip position; AprilTags have no direction, so their center is used."""
    if "start" not in tag:
        return tag["center"]
    direction = tag["stop"] - tag["start"]
    return tag["center"] + direction / np.linalg.norm(direction) * TIP_OFFSET_PX


def is_in_pot(tag):
    circle = pot_circle()
    if circle is None:
        return False
    (cx, cy), r = circle
    return bool(np.hypot(tag["x"] - cx, tag["y"] - cy) < r)  # plain bool: numpy's isn't JSON


def draw_tips(image: np.ndarray, tags: list[dict]) -> np.ndarray:
    """Line from each code to its estimated tip: green inside the pot, red outside."""
    for t in tags:
        tip = fork_tip(t)
        color = (0, 255, 0) if is_in_pot({"x": tip[0], "y": tip[1]}) else (0, 0, 255)
        cv2.line(image, tuple(t["center"].astype(int)), tuple(tip.astype(int)), color, 2)
        cv2.circle(image, tuple(tip.astype(int)), 8, color, -1)
    return image

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
    if now - last_sent >= SEND_INTERVAL:
        last_sent = now  # also when the queue is full, so we retry next interval, not next frame
        try:
            send_queue.put_nowait(smoothed_output)
            print(f"{now:6.1f}s {len(tags)} smoothed tags: {sorted({t['id'] for t in smoothed_tags})}")
        except queue.Full:
            print(f"{now:6.1f}s sender still busy with the previous request, skipped")


def sender():
    while True:
        payload = send_queue.get()
        try:
            r = requests.post(SEND_URL, json=payload, headers={"Authorization": f"Bearer {API_TOKEN}"},timeout=2)
            print(f"         -> {r.status_code}")
        except Exception as e:  # anything, so one bad payload can't kill this thread
            print(f"         -> send failed: {e!r}")


def main():
    """Show a live preview and pass detections to on_tags() until q or Ctrl+C."""
    threading.Thread(target=sender, daemon=True).start()
    start = time.monotonic()
    frames = detections = 0
    try:
        for frame in camera_frames(CAMERA):
            if len(pot_tags) < 3 or frames % POT_CHECK_EVERY == 0:
                update_pot_tags(frame)
            tags = detect(frame)
            now = time.monotonic() - start
            tips = [fork_tip(t) for t in tags]
            on_tags([{"id": t["id"], "x": float(tip[0]), "y": float(tip[1])}
                        for t, tip in zip(tags, tips)], now)

            detections += len(tags)
            frames += 1
            cv2.imshow(MARKER, draw_tips(draw(draw_pot(frame.copy()), tags), tags))
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("s"):  # save the raw frame, e.g. to check why tags aren't found
                cv2.imwrite(f"frame_{frames}.png", frame)
                print(f"saved frame_{frames}.png")
    except KeyboardInterrupt:
        pass
    cv2.destroyAllWindows()
    elapsed = time.monotonic() - start



if __name__ == "__main__":
    main()
