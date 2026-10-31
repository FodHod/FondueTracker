# Beefend

Set up the venv on the pi:
rm -rf .venv/ (if it exists already)
uv venv --python /usr/bin/python3 --system-site-packages
uv sync
uv run main.py picam


---
## Testing
while true; do nc -l 8000; echo; done

