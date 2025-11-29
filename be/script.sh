#!/bin/bash
set -e
manim -qm /manim_input/temp.py Temp --media_dir /manim_output
final_file=$(find /manim_output -type f -name 'Temp.mp4' | head -n 1)
if [ -f "$final_file" ]; then
  cp "$final_file" /manim_output/Temp.mp4
  
  # Validation Step 1: Duration
  duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 /manim_output/Temp.mp4)
  echo "METRIC_DURATION:$duration"

  # Validation Step 2: Black Detect
  # Capture ffmpeg output (which goes to stderr) and print it with markers
  echo "METRIC_BLACK_DETECT_START"
  ffmpeg -i /manim_output/Temp.mp4 -vf "blackdetect=d=0.1:pix_th=0.1" -f null - 2>&1
  echo "METRIC_BLACK_DETECT_END"

  find /manim_output -mindepth 1 ! -path /manim_output/Temp.mp4 -delete
  find /manim_output -mindepth 1 -type d -empty -delete
else
  echo "Error: Temp.mp4 not found in /manim_output!"
  exit 1
fi
