from flask import Flask, request, jsonify, redirect, session
from flask_cors import CORS
import os
import sys
import secrets

# Add current directory to path for Vercel
sys.path.insert(0, os.path.dirname(__file__))

# Import services from local directory
from services.youtube_service import YouTubeService
from services.ai_service import AIService
from services.auth_service import AuthService

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', secrets.token_hex(32))
CORS(app, supports_credentials=True)  # Enable CORS with credentials

# Initialize services
ai_service = AIService()
auth_service = AuthService()


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "message": "PM-ENG API is running"})


@app.route('/api/auth/login', methods=['GET'])
def auth_login():
    """
    Initiate Google OAuth flow.
    
    Returns redirect URL to Google's authorization page.
    """
    try:
        # Get redirect URI from environment or use default
        redirect_uri = os.getenv('OAUTH_REDIRECT_URI', 'http://localhost:5001/api/auth/callback')
        
        # Generate authorization URL
        auth_url, state = auth_service.create_auth_url(redirect_uri)
        
        # Store state in session for CSRF protection
        session['oauth_state'] = state
        
        return jsonify({
            "success": True,
            "auth_url": auth_url,
            "state": state
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to initiate OAuth: {str(e)}"
        }), 500


@app.route('/api/auth/callback', methods=['GET'])
def auth_callback():
    """
    Handle OAuth callback from Google.
    
    Exchanges authorization code for tokens and redirects to frontend.
    """
    try:
        # Get authorization code from query params
        code = request.args.get('code')
        state = request.args.get('state')
        
        if not code:
            # Redirect to frontend with error
            return redirect(f'http://localhost:5173?error=no_code')
        
        # Verify state for CSRF protection
        if state != session.get('oauth_state'):
            return redirect(f'http://localhost:5173?error=invalid_state')
        
        # Get redirect URI
        redirect_uri = os.getenv('OAUTH_REDIRECT_URI', 'http://localhost:5001/api/auth/callback')
        
        # Exchange code for tokens
        token_data = auth_service.exchange_code_for_tokens(code, redirect_uri)
        
        # Redirect to frontend with tokens in URL hash (more secure than query params)
        # Frontend will extract these and store in localStorage
        import urllib.parse
        frontend_url = 'http://localhost:5173'
        
        # Encode tokens as URL parameters
        # Include scopes so frontend can send them back for API calls
        params = {
            'access_token': token_data['access_token'],
            'refresh_token': token_data['refresh_token'],
            'scopes': token_data.get('scopes', ''),  # Add scopes
            'user_name': token_data['user_info'].get('name', ''),
            'user_email': token_data['user_info'].get('email', ''),
            'user_picture': token_data['user_info'].get('picture', ''),
            'google_id': token_data['user_info'].get('google_id', '')
        }
        
        # Use hash fragment for tokens (not visible in server logs)
        redirect_url = f"{frontend_url}#" + urllib.parse.urlencode(params)
        
        return redirect(redirect_url)
        
    except Exception as e:
        print(f"OAuth callback error: {str(e)}")
        return redirect(f'http://localhost:5173?error={urllib.parse.quote(str(e))}')


@app.route('/api/auth/refresh', methods=['POST'])
def auth_refresh():
    """
    Refresh an expired access token.
    
    Expected JSON body:
    {
        "refresh_token": "..."
    }
    """
    try:
        data = request.get_json()
        refresh_token = data.get('refresh_token')
        
        if not refresh_token:
            return jsonify({
                "success": False,
                "error": "Refresh token is required"
            }), 400
        
        # Refresh the token
        new_access_token = auth_service.refresh_access_token(refresh_token)
        
        return jsonify({
            "success": True,
            "access_token": new_access_token
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Token refresh failed: {str(e)}"
        }), 500


@app.route('/api/analyze', methods=['POST'])
def analyze_video():
    """
    Analyze a YouTube video for PM insights and English expressions.
    Requires OAuth authentication.
    
    Expected headers:
        Authorization: Bearer <access_token>
    
    Expected JSON body:
    {
        "youtube_url": "https://youtube.com/watch?v=..."
    }
    
    Returns:
    {
        "success": true,
        "video": {...},
        "pm_insights": [...],
        "english_expressions": [...]
    }
    """
    try:
        # Get request data
        data = request.get_json()
        youtube_url = data.get('youtube_url')
        
        if not youtube_url:
            return jsonify({
                "success": False,
                "error": "YouTube URL is required"
            }), 400
        
        # Get user credentials from Authorization header and request body
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({
                "success": False,
                "error": "Authentication required. Please sign in with Google.",
                "auth_required": True
            }), 401
        
        access_token = auth_header.split(' ')[1]
        
        # Get refresh_token and scopes from request body (sent by frontend)
        refresh_token = data.get('refresh_token')
        scopes_str = data.get('scopes', '')
        scopes = scopes_str.split(' ') if scopes_str else [
            'https://www.googleapis.com/auth/youtube.force-ssl',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ]
        
        # Validate token
        if not auth_service.validate_token(access_token):
            return jsonify({
                "success": False,
                "error": "Invalid or expired token. Please sign in again.",
                "auth_required": True
            }), 401
        
        # Initialize YouTube service with user credentials
        # Construct proper OAuth credentials with ALL required fields
        from google.oauth2.credentials import Credentials
        
        credentials = Credentials(
            token=access_token,
            refresh_token=refresh_token,  # Add refresh_token
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.getenv('GOOGLE_CLIENT_ID'),
            client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
            scopes=scopes  # Add scopes
        )
        
        youtube_service = YouTubeService(credentials)
        print(f"YouTubeService initialized with credentials")
        
        # Validate YouTube URL
        if not youtube_service.validate_url(youtube_url):
            return jsonify({
                "success": False,
                "error": "Invalid YouTube URL"
            }), 400
        
        # Extract video ID
        video_id = youtube_service.extract_video_id(youtube_url)
        
        # Get video metadata
        print(f"Fetching metadata for video_id: {video_id}")
        video_metadata = youtube_service.get_video_metadata(video_id)
        print(f"Metadata fetched successfully: {video_metadata.get('title', 'No title')}")
        
        # Get transcript using YouTube Data API with user's OAuth credentials
        print(f"Attempting to fetch transcript for video_id: {video_id}")
        try:
            transcript_result = youtube_service.get_transcript(video_id)
            print(f"Transcript fetched successfully")
        except ValueError as e:
            print(f"ValueError in get_transcript: {str(e)}")
            return jsonify({
                "success": False,
                "error": str(e)
            }), 400
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Failed to fetch transcript: {str(e)}"
            }), 500
        
        # Analyze for PM insights
        try:
            pm_insights = ai_service.analyze_pm_insights(
                transcript_result['full_text'],
                video_title=video_metadata.get('title')
            )
        except ValueError as e:
            return jsonify({
                "success": False,
                "error": f"PM insights analysis failed: {str(e)}"
            }), 500
        
        # Analyze for English expressions
        try:
            english_expressions = ai_service.analyze_english_expressions(
                transcript_result['transcript'],
                video_id
            )
        except ValueError as e:
            return jsonify({
                "success": False,
                "error": f"English expression analysis failed: {str(e)}"
            }), 500
        
        # Return successful response
        return jsonify({
            "success": True,
            "video": video_metadata,
            "pm_insights": pm_insights,
            "english_expressions": english_expressions
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }), 500


# Export app for Vercel - Vercel expects 'app' variable
# Do not rename this variable
