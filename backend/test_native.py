import os
from dotenv import load_dotenv

# Load from existing backend env
load_dotenv(".env")

from services.youtube_service import YouTubeService
from services.ai_service import AIService
import json

def test_hybrid_flow():
    print("Initialize Services...")
    yt = YouTubeService()
    ai = AIService()

    # Case 1: Video WITH Captions
    # A standard public video (Google Turns 25)
    print("\n\n=== TEST CASE 1: STANDARD TEXT PROCESSING ===")
    video_url_1 = "https://youtu.be/Kbne9Zz-nuQ"
    v_id = yt.extract_video_id(video_url_1)
    
    print(f"Fetching transcript for {v_id}...")
    try:
        t_data = yt.get_transcript(v_id)
        if t_data.get('fallback_needed'):
             print("↳ Fallback triggered! Unexpected for this video, passing url.")
        else:
             print("↳ Transcript fetched successfully.")

        insights = ai.analyze_pm_insights(
            transcript_text=t_data.get('full_text'),
            video_title="Lenny's Podcast Example",
            video_url=video_url_1 if t_data.get('fallback_needed') else None
        )
        print("\nInsights Output:")
        print(json.dumps(insights, indent=2))
    except Exception as e:
        print(f"FAILED Test 1: {e}")


    # Test Case 2: Force Native Fallback
    print("\n\n=== TEST CASE 2: NATIVE VIDEO FALLBACK ===")
    # Simulate a `fallback_needed` scenario manually because it's hard to guarantee a pub video has them disabled.
    print("Simulating Transcript fail (fallback_needed=True)...")
    try:
        insights_fallback = ai.analyze_pm_insights(
            transcript_text=None,
            video_title="Unknown Native Video",
            video_url=video_url_1 
        )
        print("\nNative Video Insights Output:")
        print(json.dumps(insights_fallback, indent=2))
        print("↳ Native fallback successfully processed the URL direct to Gemini!")
    except Exception as e:
        print(f"FAILED Native Fallback: {e}")

if __name__ == "__main__":
    test_hybrid_flow()
