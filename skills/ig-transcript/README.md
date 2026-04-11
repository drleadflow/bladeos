# Instagram Transcript Downloader

Downloads Instagram reels/videos and generates transcripts using OpenAI Whisper.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Install system dependencies:
```bash
# On macOS
brew install ffmpeg

# On Ubuntu
sudo apt install ffmpeg
```

## Usage

```bash
python ig_transcript.py "https://www.instagram.com/reel/DW7Ut9HCphd/"
```

Options:
- `--method whisper` (default) - Use OpenAI Whisper
- `--output-dir ./ig_downloads` - Output directory

## Output

Creates:
- Downloaded video file
- Transcript text file
- Thumbnail image
- JSON result file with all paths and transcript text

## Example

```bash
python ig_transcript.py "https://www.instagram.com/reel/DW7Ut9HCphd/" --output-dir ./downloads
```

This will create:
- `./downloads/temp_video.mp4` - The video
- `./downloads/temp_video.txt` - The transcript
- `./downloads/temp_video.jpg` - Thumbnail
- `./downloads/latest_result.json` - Full results