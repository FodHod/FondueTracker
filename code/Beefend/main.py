import csv
import sys
from collections import Counter
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
OUT_DIR = Path("output")

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


def main():
    paths = [Path(p) for p in sys.argv[1:]] or sorted(Path("images").glob("*.png"))
    OUT_DIR.mkdir(exist_ok=True)
    for path in paths:
        if path.suffix.lower() in VIDEO_EXTS:
            process_video(path)
        else:
            process_image(path)


if __name__ == "__main__":
    main()
