#!/usr/bin/env python3
"""
Instagram Transcript Downloader (CLI version)
Uses yt-dlp CLI and whisper for transcription
"""

import os
import sys
import json
import subprocess
import tempfile
import argparse
from pathlib import Path

def run_command(cmd, check=True):
    """Run a shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=check)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {cmd}")
        print(f"Error: {e.stderr}")
        return None

def download_instagram_video(url, output_dir):
    """Download Instagram video using yt-dlp CLI"""
    print(f"Downloading video from: {url}")
    
    # Use yt-dlp to download video and get info
    info_cmd = f'yt-dlp --dump-json "{url}"'
    info_output = run_command(info_cmd)
    
    if not info_output:
        return None
        
    try:
        video_info = json.loads(info_output)
    except json.JSONDecodeError:
        print("Failed to parse video info")
        return None
    
    # Download the video
    video_filename = f"{video_info.get('id', 'video')}.%(ext)s"
    download_cmd = f'yt-dlp -o "{output_dir}/{video_filename}" "{url}"'
    
    if not run_command(download_cmd):
        return None
        
    # Find the downloaded video file
    for file in os.listdir(output_dir):
        if video_info.get('id', 'video') in file and file.endswith(('.mp4', '.mkv', '.webm')):
            return {
                'video_path': os.path.join(output_dir, file),
                'info': video_info
            }
    
    return None

def extract_audio(video_path, audio_path):
    """Extract audio from video using ffmpeg"""
    print("Extracting audio...")
    cmd = f'ffmpeg -i "{video_path}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "{audio_path}" -y'
    return run_command(cmd, check=False) is not None

def transcribe_audio(audio_path):
    """Transcribe audio using whisper"""
    print("Transcribing audio...")
    
    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(audio_path)
        return result["text"]
    except Exception as e:
        print(f"Transcription failed: {e}")
        return None

def download_and_transcribe(url, output_dir=None):
    """Main function to download and transcribe Instagram video"""
    
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="ig_transcript_")
    else:
        os.makedirs(output_dir, exist_ok=True)
    
    print(f"Working directory: {output_dir}")
    
    # Download video
    download_result = download_instagram_video(url, output_dir)
    if not download_result:
        return {"error": "Failed to download video"}
    
    video_path = download_result['video_path']
    video_info = download_result['info']
    
    # Extract audio
    audio_path = os.path.join(output_dir, "audio.wav")
    if not extract_audio(video_path, audio_path):
        return {"error": "Failed to extract audio"}
    
    # Transcribe
    transcript = transcribe_audio(audio_path)
    if not transcript:
        return {"error": "Failed to transcribe audio"}
    
    # Save transcript
    transcript_path = os.path.join(output_dir, "transcript.txt")
    with open(transcript_path, 'w') as f:
        f.write(transcript)
    
    # Save metadata
    metadata_path = os.path.join(output_dir, "metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(video_info, f, indent=2)
    
    result = {
        "transcript": transcript,
        "video_path": video_path,
        "audio_path": audio_path,
        "transcript_path": transcript_path,
        "metadata_path": metadata_path,
        "title": video_info.get('title', 'Unknown'),
        "uploader": video_info.get('uploader', 'Unknown'),
        "duration": video_info.get('duration', 0),
        "view_count": video_info.get('view_count', 0)
    }
    
    print(f"\n✅ Success!")
    print(f"Transcript: {transcript[:100]}...")
    print(f"Files saved to: {output_dir}")
    
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download and transcribe Instagram videos")
    parser.add_argument("url", help="Instagram video URL")
    parser.add_argument("-o", "--output", help="Output directory")
    
    args = parser.parse_args()
    
    result = download_and_transcribe(args.url, args.output)
    
    if "error" in result:
        print(f"❌ {result['error']}")
        sys.exit(1)
    else:
        print(json.dumps(result, indent=2))