
# Fondue Chinoise – Smart Cooking Assistant

## 1. Project Overview

This project is a smart cooking assistant for Fondue Chinoise.

It helps multiple people cook their meat simultaneously by tracking individual cooking times and monitoring the broth temperature.

The system aims to:
- Detect when someone inserts or removes meat.
- Track individual cooking times.
- Adjust estimated cooking times according to broth temperature.
- Notify participants when their meat is estimated to be ready.
- Evaluate whether meat was removed too early, at the estimated optimal time, or too late.

**Currently, the camera and temperature sensor are simulated.**

## 2. Project Structure

The project consists of three Python files:

```text
fondue_project/
│
├── fondue_model.py
├── camera.py
├── fondue_controller.py
└── README.md
```

- **fondue_model.py:** Contains meat properties, cooking-time estimates and temperature calculations.
- **camera.py:** Simulates camera events, including meat insertion and removal.
- **fondue_controller.py:** Main application managing participants, timers, notifications and status display.

## 3. How to Run

Requirements:
- Python 3.9 or newer.
- No external Python packages required.

Start the application from the project directory:

```bash
python fondue_controller.py
```

The application automatically starts the camera and temperature simulations.

To stop the application, press `CTRL + C`.

## 4. Current Functionality

- Multiple participants with individual meat preferences.
- Independent cooking timers.
- Random camera-event simulation.
- Simulated broth temperature fluctuations.
- Automatic cooking-time adjustments based on broth temperature.
- Notifications when estimated cooking times are reached.
- Feedback after meat removal: TOO EARLY, OPTIMAL or TOO LATE.

The reference cooking times are currently based on a broth temperature of 90°C.

## 5. Next Development Steps

The next objective is to replace the simulated inputs with real hardware.

### Camera integration

Connect a camera capable of identifying participants and detecting when meat is inserted or removed.

The expected interface should provide:

- Participant identification.
- Event type (`IN` or `OUT`).
- Event timestamp.

The camera module should translate detections into the event format already used by the controller:

```python
("Alice", "IN")
("Alice", "OUT")
```

Repeated detections should be filtered to avoid duplicate events.

### Temperature sensor integration

Connect a temperature sensor to measure the actual broth temperature.

The expected interface is a function returning the current temperature in Celsius:

```python
def get_broth_temperature():
    return sensor_temperature
```

The sensor should provide reliable readings suitable for continuous monitoring of hot broth.

Sensor errors and invalid readings should be handled explicitly.

### Calibration and testing

Once the hardware is connected:

- Test camera detection with multiple participants.
- Verify temperature readings.
- Compare estimated cooking times with actual cooking results.
- Adjust the cooking model based on real-world measurements.

## 6. Final Objective

The final system should provide an automated Fondue Chinoise cooking assistant.

The camera detects who inserts and removes meat.

The temperature sensor continuously measures the broth temperature.

The cooking model adjusts individual cooking-time estimates.

The controller manages all participants and provides notifications when their meat is estimated to be ready.

**The goal is to make Fondue Chinoise easier to manage, more interactive and more consistent for everyone at the table.**

*Note: Cooking times are estimates, not food-safety guarantees. Safe internal meat temperatures must be verified independently.*
