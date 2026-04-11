#!/usr/bin/env python3
"""
Instagram Transcript Downloader
Downloads IG reels and generates transcripts using Whisper or other methods
"""

import os
import sys
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse
import argparse

class IGTranscriptDownloader:
    def __init__(self, output_dir="./ig_downloads"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
    def download_video(self, url):
        """Download video using yt-dlp"""
        try:
            # Create temp filename
            temp_path = self.output_dir / "temp_video.%(ext)s"
            
            cmd = [
                "yt-dlp",
                "--format", "best[ext=mp4]/best",
                "--output", str(temp_path),
                "--write-thumbnail",
                "--write-info-json",
                url
            ]
            
            print(f"Downloading: {url}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                raise Exception(f"yt-dlp failed: {result.stderr}")
            
            # Find the downloaded files
            video_files = list(self.output_dir.glob("temp_video.*"))
            video_file = None
            
            for f in video_files:
                if f.suffix not in ['.json', '.webp', '.jpg', '.png']:
                    video_file = f
                    break
            
            if not video_file:
                raise Exception("No video file found after download")
            
            print(f"Downloaded: {video_file}")
            return video_file
            
        except Exception as e:
            print(f"Error downloading video: {e}")
            return None
    
    def transcribe_whisper(self, video_path):
        """Transcribe using OpenAI Whisper"""
        try:
            transcript_path = video_path.with_suffix('.txt')
            
            cmd = [
                "whisper",
                str(video_path),
                "--model", "base",
                "--output_dir", str(self.output_dir),
                "--output_format", "txt"
            ]
            
            print("Transcribing with Whisper...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                raise Exception(f"Whisper failed: {result.stderr}")
            
            # Find transcript file
            transcript_files = list(self.output_dir.glob(f"{video_path.stem}*.txt"))
            if transcript_files:
                transcript_path = transcript_files[0]
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    transcript_text = f.read().strip()
                return transcript_text, transcript_path
            
            raise Exception("Transcript file not found")
            
        except Exception as e:
            print(f"Error transcribing: {e}")
            return None, None
    
    def process_url(self, url, method="whisper"):
        """Main processing function"""
        print(f"Processing: {url}")
        
        # Download video
        video_path = self.download_video(url)
        if not video_path:
            return None
        
        # Transcribe
        transcript_text = None
        transcript_file = None
        
        if method == "whisper":
            transcript_text, transcript_file = self.transcribe_whisper(video_path)
        else:
            print(f"Method '{method}' not implemented yet")
            return None
        
        # Find thumbnail
        thumbnail_files = list(self.output_dir.glob(f"{video_path.stem}*"))
        thumbnail_path = None
        for f in thumbnail_files:
            if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                thumbnail_path = f
                break
        
        result = {
            'video_path': str(video_path),
            'transcript_text': transcript_text,
            'transcript_file': str(transcript_file) if transcript_file else None,
            'thumbnail_path': str(thumbnail_path) if thumbnail_path else None,
            'url': url
        }
        
        return result

def main():
    parser = argparse.ArgumentParser(description='Download and transcribe Instagram reels')
    parser.add_argument('url', help='Instagram reel URL')
    parser.add_argument('--method', default='whisper', choices=['whisper', 'assembly', 'manual'])
    parser.add_argument('--output-dir', default='./ig_downloads')
    
    args = parser.parse_args()
    
    downloader = IGTranscriptDownloader(args.output_dir)
    result = downloader.process_url(args.url, args.method)
    
    if result:
        print("\n=== RESULTS ===")
        print(f"Video: {result['video_path']}")
        print(f"Transcript: {result['transcript_file']}")
        print(f"Thumbnail: {result['thumbnail_path']}")
        print("\n=== TRANSCRIPT ===")
        print(result['transcript_text'])
        
        # Save JSON result
        result_file = Path(args.output_dir) / 'latest_result.json'
        with open(result_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"\nResult saved to: {result_file}")
    else:
        print("Failed to process URL")
        sys.exit(1)

if __name__ == "__main__":
    main()