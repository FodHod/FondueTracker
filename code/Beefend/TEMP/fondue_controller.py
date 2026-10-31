"""
Fondue Chinoise - Real-time Controller.

Features:
- Independent timers for each participant
- Random camera-event input
- Constant broth temperature (currently 90°C)
- Cooking notifications
- TOO EARLY / OPTIMAL / TOO LATE feedback

Cooking-time estimates are NOT food-safety guarantees.
"""

import time

from camera import get_camera_events
from fondue_model import (
    fondue_info,
    get_broth_temperature,
)

# ============================================================
# 1. PARTICIPANTS
# ============================================================

GROUP = [
    {"name": "Alice", "meat": "beef", "doneness": "rare"},
    {"name": "Bob", "meat": "beef", "doneness": "medium"},
    {"name": "Claire", "meat": "chicken", "doneness": "fully-cooked"},
    {"name": "David", "meat": "pork", "doneness": "fully-cooked"},
    {"name": "Emma", "meat": "lamb", "doneness": "medium"},
    {"name": "Frank", "meat": "beef", "doneness": "medium-rare"},
]

# ============================================================
# 2. COLOURS
# ============================================================

RESET = "\033[0m"
BOLD = "\033[1m"

COLORS = {
    "beef": "\033[91m",
    "lamb": "\033[95m",
    "veal": "\033[93m",
    "pork": "\033[96m",
    "chicken": "\033[92m",
    "turkey": "\033[94m",
}

RESULT_COLORS = {
    "TOO EARLY": "\033[93m",
    "OPTIMAL": "\033[92m",
    "TOO LATE": "\033[91m",
}


# ============================================================
# 3. NOTIFICATIONS
# ============================================================

def notify(name, message):
    print(
        f"\n🔔 {BOLD}{name.upper()}: {message}{RESET}\n"
    )


# ============================================================
# 4. INITIALIZE PARTICIPANTS
# ============================================================

people = {}

for person in GROUP:
    temperature = get_broth_temperature()

    info = fondue_info(
        person["meat"],
        person["doneness"],
        temperature,
    )

    person["info"] = info

    person["min_time"], person["max_time"] = (
        info["estimated_dipping_time_seconds"]
    )

    low, high = info["estimated_dipping_time_seconds"]

    people[person["name"]] = {
        **person,
        "info": info,
        "min_time": low,
        "max_time": high,
        "state": "WAITING",
        "started_at": None,
        "slice_number": 0,
        "notification_sent": False,
    }


# ============================================================
# 5. CAMERA EVENT HANDLER
# ============================================================

def camera_event(name, action):
    if name not in people:
        print(f"Unknown participant: {name}")
        return

    person = people[name]

    # --------------------------------------------------------
    # MEAT INSERTION
    # --------------------------------------------------------

    if action == "IN":

        if person["state"] not in ("WAITING", "REMOVED"):
            print(f"{name}: Cannot insert another slice yet.")
            return

        person["started_at"] = time.monotonic()

        person["slice_number"] += 1

        person["state"] = "COOKING"

        person["notification_sent"] = False

        color = COLORS[person["meat"]]

        print(
            f"\n{color}{name}{RESET} inserted "
            f"slice #{person['slice_number']} | "
            f"BROTH TEMPERATURE: {temperature:.2f} °C | "
            f"Estimated time: "
            f"{person['min_time']:.1f}-"
            f"{person['max_time']:.1f}s"
        )

    # --------------------------------------------------------
    # MEAT REMOVAL
    # --------------------------------------------------------

    elif action == "OUT":

        if person["state"] not in ("COOKING", "READY"):
            print(f"{name}: No active slice.")
            return

        elapsed = time.monotonic() - person["started_at"]

        if elapsed < person["min_time"]:

            result = "TOO EARLY"

        elif elapsed <= person["max_time"]:

            result = "OPTIMAL"

        else:

            result = "TOO LATE"

        color = RESULT_COLORS[result]

        print(
            f"\n{name} removed slice "
            f"#{person['slice_number']} "
            f"after {elapsed:.1f}s"
        )

        print(
            f"Result: {color}{BOLD}{result}{RESET}"
        )

        person["state"] = "REMOVED"

        person["started_at"] = None

    else:

        print(f"Unknown camera action: {action}")


# ============================================================
# 6. TIMER CHECK
# ============================================================

def check_timers():
    now = time.monotonic()

    for name, person in people.items():

        if person["state"] != "COOKING":
            continue

        elapsed = now - person["started_at"]

        midpoint = (
                           person["min_time"] + person["max_time"]
                   ) / 2

        if (
                elapsed >= midpoint
                and not person["notification_sent"]
        ):
            person["state"] = "READY"

            person["notification_sent"] = True

            notify(
                name,
                f"Slice #{person['slice_number']} "
                f"has reached its estimated cooking time. "
                f"Check core temperature."
            )


# ============================================================
# 7. STATUS DISPLAY
# ============================================================

def display_status():
    print("\n" + "=" * 65)

    temperature = get_broth_temperature()

    print(
        f"BROTH TEMPERATURE: {temperature:.2f} °C"
    )

    print("=" * 65)

    for name, person in people.items():

        color = COLORS[person["meat"]]

        if person["state"] in ("COOKING", "READY"):

            elapsed = time.monotonic() - person["started_at"]

            remaining = max(
                0,
                person["min_time"] - elapsed
            )

            if person["state"] == "READY":

                status = "READY - CHECK CORE TEMPERATURE"

            else:

                status = (
                    f"COOKING "
                    f"({remaining:.0f}s until minimum)"
                )

        else:

            status = person["state"]

        print(
            f"{color}{name:10}{RESET} | "
            f"{person['meat']:8} | "
            f"{status}"
        )


# ============================================================
# 8. MAIN CONTROLLER
# ============================================================

def run():
    print("\n" + "=" * 65)

    print(
        BOLD + "FONDUE CONTROLLER STARTED" + RESET
    )

    print("=" * 65)

    print(f"Participants: {len(GROUP)}")

    print(f"BROTH TEMPERATURE: {temperature:.2f} °C")

    print("\nWaiting for camera events...")

    last_display = 0

    try:

        while True:

            events = get_camera_events()

            for name, action in events:
                camera_event(name, action)

            check_timers()

            if time.monotonic() - last_display >= 5:
                display_status()

                last_display = time.monotonic()

            time.sleep(0.1)

    except KeyboardInterrupt:

        print("\nController stopped.")

        print("\nFINAL STATUS")

        for name, person in people.items():
            print(
                f"{name}: {person['state']} | "
                f"Slices: {person['slice_number']}"
            )


# ============================================================
# 9. EXECUTION
# ============================================================

if __name__ == "__main__":
    run()
