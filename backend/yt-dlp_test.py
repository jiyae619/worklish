import yt_dlp
import os

ydl_opts = {
    'format': 'bestaudio/best',
    'outtmpl': '%(id)s.%(ext)s',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
}
with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    print("Testing minimal download...")
