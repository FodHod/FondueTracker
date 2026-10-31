"""
Fondue Chinoise - Shared cooking model.

Reference cooking times are defined at 90°C.
Cooking times are adjusted according to broth temperature.
"""

# ============================================================
# 1. CONFIGURATION
# ============================================================


import random
import time

# ============================================================
# SIMULATED TEMPERATURE SENSOR
# ============================================================

REFERENCE_TEMPERATURE_C = 90.0
BROTH_TEMPERATURE_C = 90.0
TEMPERATURE_UPDATE_INTERVAL = 5.0
TEMPERATURE_MAX_DEVIATION = 5.0

_last_temperature_update = time.monotonic()


def get_broth_temperature():
    global BROTH_TEMPERATURE_C
    global _last_temperature_update

    now = time.monotonic()

    if now - _last_temperature_update >= TEMPERATURE_UPDATE_INTERVAL:
        # New random temperature between 85°C and 95°C
        BROTH_TEMPERATURE_C = (
                REFERENCE_TEMPERATURE_C
                + random.uniform(
            -TEMPERATURE_MAX_DEVIATION,
            TEMPERATURE_MAX_DEVIATION,
        )
        )

        _last_temperature_update = now

    return BROTH_TEMPERATURE_C


# ============================================================
# 2. MEAT PROPERTIES
# ============================================================

MEAT = {
    "beef": {
        "safety_temp": 62.8,
        "rest_seconds": 180,
        "doneness": {
            "rare": 52,
            "medium-rare": 57,
            "medium": 63,
            "medium-well": 67,
            "well-done": 72,
        },
    },

    "lamb": {
        "safety_temp": 62.8,
        "rest_seconds": 180,
        "doneness": {
            "rare": 52,
            "medium-rare": 57,
            "medium": 63,
            "medium-well": 67,
            "well-done": 72,
        },
    },

    "veal": {
        "safety_temp": 62.8,
        "rest_seconds": 180,
        "doneness": {
            "medium": 63,
            "well-done": 72,
        },
    },

    "pork": {
        "safety_temp": 62.8,
        "rest_seconds": 180,
        "doneness": {
            "fully-cooked": 63,
        },
    },

    "chicken": {
        "safety_temp": 73.9,
        "rest_seconds": 0,
        "doneness": {
            "fully-cooked": 74,
        },
    },

    "turkey": {
        "safety_temp": 73.9,
        "rest_seconds": 0,
        "doneness": {
            "fully-cooked": 74,
        },
    },
}

# ============================================================
# 3. REFERENCE COOKING TIMES
# ============================================================

TIME_ESTIMATES = {
    "beef": {
        "rare": (10, 20),
        "medium-rare": (20, 25),
        "medium": (25, 35),
        "medium-well": (35, 50),
        "well-done": (35, 50),
    },

    "lamb": {
        "rare": (15, 20),
        "medium-rare": (20, 25),
        "medium": (25, 35),
        "medium-well": (35, 50),
        "well-done": (35, 50),
    },

    "veal": {
        "medium": (25, 35),
        "well-done": (35, 50),
    },

    "pork": {
        "fully-cooked": (45, 60),
    },

    "chicken": {
        "fully-cooked": (90, 120),
    },

    "turkey": {
        "fully-cooked": (90, 120),
    },
}


# ============================================================
# 4. TEMPERATURE ADJUSTMENT
# ============================================================

def adjust_cooking_range(min_time, max_time, broth_temp_C):
    """
    Adjust estimated cooking times according to broth temperature.

    This is an approximate model, not a validated
    food-temperature or cooking-time prediction.
    """

    if broth_temp_C <= 0:
        raise ValueError("Broth temperature must be above 0°C.")

    meat_temp = -2.0

    denominator = broth_temp_C - meat_temp

    factor = (
                     REFERENCE_TEMPERATURE_C - meat_temp
             ) / denominator

    # Prevent excessive extrapolation.
    factor = max(0.75, min(1.5, factor))

    return (
        min_time * factor,
        max_time * factor,
    )


# ============================================================
# 5. MEAT INFORMATION
# ============================================================

def fondue_info(meat, doneness, broth_temp_C=None):

    if broth_temp_C is None:
        broth_temp_C = get_broth_temperature()

    meat = meat.lower().strip()
    doneness = doneness.lower().strip()

    if meat not in MEAT:
        raise ValueError(f"Unknown meat: {meat}")

    if doneness not in MEAT[meat]["doneness"]:
        raise ValueError(
            f"Invalid doneness for {meat}"
        )

    low, high = TIME_ESTIMATES[meat][doneness]

    adjusted_low, adjusted_high = adjust_cooking_range(
        low,
        high,
        broth_temp_C,
    )

    return {
        "meat": meat,
        "doneness": doneness,

        "culinary_core_temp_C":
            MEAT[meat]["doneness"][doneness],

        "safety_core_temp_C":
            MEAT[meat]["safety_temp"],

        "safety_rest_seconds":
            MEAT[meat]["rest_seconds"],

        "broth_temp_C":
            broth_temp_C,

        "reference_time_seconds":
            (low, high),

        "estimated_dipping_time_seconds":
            (adjusted_low, adjusted_high),
    }
