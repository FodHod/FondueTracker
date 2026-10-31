
const MEAT_TEMP = -2.0;

const MEAT = {
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

const TIME_ESTIMATES = {
    "beef": {
        "rare": [10, 20],
        "medium-rare": [20, 25],
        "medium": [25, 35],
        "medium-well": [35, 50],
        "well-done": [35, 50],
    },

    "lamb": {
        "rare": [15, 20],
        "medium-rare": [20, 25],
        "medium": [25, 35],
        "medium-well": [35, 50],
        "well-done": [35, 50],
    },

    "veal": {
        "medium": [25, 35],
        "well-done": [35, 50],
    },

    "pork": {
        "fully-cooked": [45, 60],
    },

    "chicken": {
        "fully-cooked": [90, 120],
    },

    "turkey": {
        "fully-cooked": [90, 120],
    },
}


/**
 * Adjust estimated cooking times according to broth temperature.

 This is an approximate model, not a validated
 food-temperature or cooking-time prediction.
 */
function adjust_cooking_range(min_time: number, max_time: number, broth_temp_C: number): [number, number] {

    /*if (broth_temp_C <= 0) {
        throw new Error("Broth temperature must be above 0°C.");
    }

    const denominator = broth_temp_C - MEAT_TEMP;

    let factor = (
        REFERENCE_TEMPERATURE_C - MEAT_TEMP
    ) / denominator;

    // Prevent excessive extrapolation.
    factor = Math.max(0.75, Math.min(1.5, factor));

    return [
        min_time * factor,
        max_time * factor,
    ];*/
    return [min_time, max_time];
}

export function fondueInfo(meat: string, doneness: string, broth_temp_C: number, start_ts: Date, asOf?: Date) {
    const now = asOf ?? new Date();
    meat = meat.toLowerCase().trim();
    doneness = doneness.toLowerCase().trim();

    if (!(meat in MEAT)) {
        throw new Error(`Unknown meat: ${meat}`);
    }

    const meatData = (MEAT as any)[meat];
    if (!(doneness in meatData["doneness"])) {
        throw new Error(`Invalid doneness for ${meat}`);
    }

    const [low, high] = (TIME_ESTIMATES as any)[meat][doneness];

    const [adjusted_low, adjusted_high] = adjust_cooking_range(
        low,
        high,
        broth_temp_C,
    );

    const start_ms = start_ts.getTime()
    const now_ms = now.getTime()

    // The estimates are seconds; the clocks are milliseconds.
    const earliest_out_ms = start_ms + adjusted_low * 1000
    const latest_out_ms = start_ms + adjusted_high * 1000
    const elapsed_ms = Math.max(0, now_ms - start_ms)

    let progress: number
    if (now_ms <= earliest_out_ms) {
        // Ramps linearly, reaching 1.0 at the earliest estimated take-out.
        progress = earliest_out_ms > start_ms ? elapsed_ms / (earliest_out_ms - start_ms) : 1
    } else if (now_ms <= latest_out_ms) {
        // Inside the estimated window: done, safe to eat.
        progress = 1
    } else {
        // Past the latest estimated take-out: too late.
        progress = 2
    }

    return {
        "meat": meat,
        "doneness": doneness,

        "culinary_core_temp_C":
            meatData["doneness"][doneness],

        "safety_core_temp_C":
            meatData["safety_temp"],

        "safety_rest_seconds":
            meatData["rest_seconds"],

        "broth_temp_C":
            broth_temp_C,

        "reference_time_seconds":
            [low, high],

        "estimated_dipping_time_seconds":
            [adjusted_low, adjusted_high],

        "progress":
            progress,
    };
}

