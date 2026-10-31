
"""
Random camera-event simulator.

Simulates participants inserting and removing
meat at different times.
"""

import random
import time

from fondue_model import (
    fondue_info,
    get_broth_temperature,
)


PARTICIPANTS = [
    {"name": "Alice", "meat": "beef", "doneness": "rare"},
    {"name": "Bob", "meat": "beef", "doneness": "medium"},
    {"name": "Claire", "meat": "chicken", "doneness": "fully-cooked"},
    {"name": "David", "meat": "pork", "doneness": "fully-cooked"},
    {"name": "Emma", "meat": "lamb", "doneness": "medium"},
    {"name": "Frank", "meat": "beef", "doneness": "medium-rare"},
]


# ============================================================
# SIMULATION SETTINGS
# ============================================================

MIN_INSERT_INTERVAL = 5
MAX_INSERT_INTERVAL = 15

MIN_EATING_INTERVAL = 5
MAX_EATING_INTERVAL = 20

# ============================================================
# PARTICIPANT STATES
# ============================================================

states = {
    person["name"]: "WAITING"
    for person in PARTICIPANTS
}

insertion_times = {}

next_action_times = {
    person["name"]: (
        time.monotonic() + random.uniform(2, 15)
    )
    for person in PARTICIPANTS
}


# ============================================================
# CAMERA EVENTS
# ============================================================

def get_camera_events():

    now = time.monotonic()

    # Find participants whose next action is due
    ready = [
        person
        for person in PARTICIPANTS
        if now >= next_action_times[person["name"]]
    ]

    if not ready:
        return []

    # Randomly select ONE participant
    person = random.choice(ready)

    name = person["name"]
    state = states[name]

    # --------------------------------------------------------
    # INSERT MEAT
    # --------------------------------------------------------

    if state in ("WAITING", "REMOVED"):

        events = [(name, "IN")]

        states[name] = "COOKING"

        insertion_times[name] = now

        temperature = get_broth_temperature()

        info = fondue_info(
            person["meat"],
            person["doneness"],
            temperature,
        )

        min_time, max_time = info[
            "estimated_dipping_time_seconds"
        ]

        # Schedule removal no earlier than minimum time.
        # Randomly choose a time within the estimated range.
        next_action_times[name] = (
            now + random.uniform(min_time, max_time)
        )

    # --------------------------------------------------------
    # REMOVE MEAT
    # --------------------------------------------------------

    elif state == "COOKING":

        events = [(name, "OUT")]

        states[name] = "REMOVED"

        del insertion_times[name]

        # Participant waits before inserting another slice
        next_action_times[name] = (
            now + random.uniform(
                MIN_EATING_INTERVAL,
                MAX_EATING_INTERVAL,
            )
        )

    else:

        events = []

    return events


# ============================================================
# STANDALONE TEST
# ============================================================

if __name__ == "__main__":

    print("Random camera simulator started.")

    while True:

        events = get_camera_events()

        for name, action in events:
            print(f"{time.strftime('%H:%M:%S')} | {name}: {action}")

        time.sleep(0.1)
