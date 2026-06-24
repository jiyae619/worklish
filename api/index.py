from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import sys
import requests
import base64
import sys

# Ensure the api/ directory is on the Python path for Vercel
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# Ensure the api/ directory is on the Python path for Vercel
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.youtube_service import YouTubeService
from services.ai_service import AIService

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
cors_origin = os.getenv("VITE_API_URL") or os.getenv("VERCEL_URL") or "*"
CORS(app, resources={r"/api/*": {"origins": cors_origin}})

# Initialize services
youtube_service = YouTubeService()
ai_service = AIService()


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "message": "Worklish API is running"})


@app.route('/api/analyze', methods=['POST'])
def analyze_video():
    """
    Analyze a YouTube video for PM insights and English expressions.
    """
    try:
        data = request.get_json()
        youtube_url = data.get('youtube_url')
        
        if not youtube_url:
            return jsonify({
                "success": False,
                "error": "YouTube URL is required"
            }), 400
        
        if not youtube_service.validate_url(youtube_url):
            return jsonify({
                "success": False,
                "error": "Invalid YouTube URL"
            }), 400
        
        video_id = youtube_service.extract_video_id(youtube_url)
        video_metadata = youtube_service.get_video_metadata(video_id)
        
        try:
            transcript_result = youtube_service.get_transcript(video_id)
        except ValueError as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 400

        # English-only guard: block videos whose captions are in another language
        if transcript_result.get('non_english'):
            langs = ', '.join(transcript_result.get('available_languages', []))
            return jsonify({
                "success": False,
                "error": f"Worklish currently supports English videos. This one's captions are in: {langs}. Please use a video with English captions."
            }), 400

        is_fallback = transcript_result.get('fallback_needed')

        # Cap the expensive no-transcript (native-video) path by length. gemini-3.1-flash-lite
        # handles ~45 min at default / ~2h+ at low media resolution; 100 min keeps cost/timeout sane.
        if is_fallback and (video_metadata.get('duration') or 0) > 100 * 60:
            return jsonify({
                "success": False,
                "error": "This video has no captions and is over 100 minutes. Please try a shorter video, or one with English captions."
            }), 400

        import concurrent.futures
        import time

        transcript_text = transcript_result.get('full_text')
        transcript_chunks = transcript_result.get('transcript')

        start_time = time.time()
        errors = []
        pm_summary, pm_insights, pm_questions, english_expressions = '', [], [], []

        if is_fallback:
            # No transcript: ONE combined Gemini call so the video is processed once, not twice.
            try:
                combined = ai_service.analyze_video_combined(
                    video_url=youtube_url, video_id=video_id, video_title=video_metadata.get('title')
                )
                pm_summary = combined.get('summary', '')
                pm_insights = combined.get('insights', [])
                pm_questions = combined.get('questions', [])
                english_expressions = combined.get('expressions', [])
            except Exception as e:
                errors.append(f"Video analysis failed: {str(e)}")
        else:
            # Transcript path: two focused parallel calls (unchanged — the quality-critical path).
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                future_pm = executor.submit(
                    ai_service.analyze_pm_insights,
                    transcript_text=transcript_text,
                    video_title=video_metadata.get('title')
                )
                future_english = executor.submit(
                    ai_service.analyze_english_expressions,
                    transcript_text=transcript_text,
                    video_id=video_id,
                    transcript_chunks=transcript_chunks
                )
                try:
                    pm_result = future_pm.result()
                    pm_summary = pm_result.get('summary', '')
                    pm_insights = pm_result.get('insights', [])
                    pm_questions = pm_result.get('questions', [])
                except Exception as e:
                    errors.append(f"PM insights analysis failed: {str(e)}")
                try:
                    english_expressions = future_english.result()
                except Exception as e:
                    errors.append(f"English expression analysis failed: {str(e)}")

        if errors:
            return jsonify({
                "success": False,
                "error": " | ".join(errors)
            }), 500

        execution_time = time.time() - start_time
        print(f"DEBUG - Parallel AI execution took {execution_time:.2f} seconds")

        return jsonify({
            "success": True,
            "processing_time_sec": round(execution_time, 2),
            "video": video_metadata,
            "summary": pm_summary,
            "pm_insights": pm_insights,
            "pm_questions": pm_questions,
            "english_expressions": english_expressions
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }), 500


@app.route('/api/notion/auth', methods=['POST'])
def notion_auth():
    """Exchange Notion OAuth code for an access token."""
    try:
        data = request.get_json()
        code = data.get('code')
        
        client_id = os.getenv('NOTION_CLIENT_ID')
        client_secret = os.getenv('NOTION_CLIENT_SECRET')
        redirect_uri = os.getenv('NOTION_REDIRECT_URI')

        if not all([client_id, client_secret, redirect_uri, code]):
            return jsonify({
                "success": False,
                "error": "Missing OAuth parameters"
            }), 400

        credentials = f"{client_id}:{client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        response = requests.post(
            "https://api.notion.com/v1/oauth/token",
            headers={
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/json"
            },
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri
            }
        )
        
        token_data = response.json()
        
        if "error" in token_data:
            return jsonify({
                "success": False,
                "error": f"Notion API Error: {token_data.get('error_description', token_data.get('error'))}"
            }), 400

        return jsonify({
            "success": True,
            "access_token": token_data.get('access_token'),
            "workspace_name": token_data.get('workspace_name'),
            "workspace_icon": token_data.get('workspace_icon')
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to authenticate with Notion: {str(e)}"
        }), 500


@app.route('/api/export/notion', methods=['POST'])
def export_to_notion():
    """Export analysis data to a user's Notion page."""
    try:
        data = request.get_json()
        analysis_data = data.get('analysis_data')
        access_token = data.get('access_token')
        
        if not access_token:
            return jsonify({
                "success": False,
                "error": "Notion access token is required"
            }), 401
            
        if not analysis_data:
            return jsonify({
                "success": False,
                "error": "analysis_data is required"
            }), 400
            
        from services.notion_service import NotionService
        user_notion_service = NotionService(auth_token=access_token)
        
        pages = user_notion_service.search_pages()
        if not pages:
            return jsonify({
                "success": False,
                "error": "No accessible pages found. Please share a page with the integration."
            }), 404
            
        parent_page_id = pages[0]['id']
        result = user_notion_service.create_analysis_page(parent_page_id, analysis_data)
        
        return jsonify({
            "success": True,
            "notion_url": result.get('url')
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to export to Notion: {str(e)}"
        }), 500


if __name__ == '__main__':
    if not os.getenv('GOOGLE_API_KEY'):
        print("WARNING: GOOGLE_API_KEY not found in environment variables")
    
    print("Starting Worklish API server...")
    print("API will be available at http://localhost:5001")
    app.run(debug=True, port=5001)
