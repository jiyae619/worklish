import os
from dotenv import load_dotenv
from services.youtube_service import YouTubeService
from services.ai_service import AIService
import sys

load_dotenv()

def test():
    yt = YouTubeService()
    ai = AIService()
    
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    video_id = yt.extract_video_id(url)
    
    print(f"Fetching transcript for {video_id}...")
    try:
        data = yt.get_transcript(video_id)
        transcript_text = data.get('full_text')
        
        print(f"Transcript length: {len(transcript_text)} characters")
        print("\n=== PM INSIGHTS ===")
        insights = ai.analyze_pm_insights(transcript_text, "Rick Astley - Never Gonna Give You Up")
        print(f"Got {len(insights)} insights:")
        for i in insights:
            print(f"- {i.get('title')}: {i.get('description')}")
            
        print("\n=== ENGLISH EXPRESSIONS ===")
        exprs = ai.analyze_english_expressions(transcript_text)
        print(f"Got {len(exprs)} expressions:")
        for e in exprs:
            print(f"- {e.get('phrase')} [{e.get('timestamp')}]")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test()
