import re
import os
from googleapiclient.discovery import build

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import (
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable,
        YouTubeTranscriptApiException,
    )
    HAS_YOUTUBE_TRANSCRIPT_API = True
except ImportError:
    HAS_YOUTUBE_TRANSCRIPT_API = False


class YouTubeService:
    """Service for extracting YouTube video data and transcripts. Uses youtube-transcript-api for
    captions (works with any public video) and YouTube Data API v3 for metadata."""
    
    def __init__(self, user_credentials=None):
        """
        Initialize YouTube service with optional user credentials.
        
        Args:
            user_credentials: Optional - not used for transcript fetching (public transcripts
                are fetched via youtube-transcript-api). Kept for API compatibility.
        """
        self.credentials = user_credentials
    
    @staticmethod
    def format_timestamp(seconds: float) -> str:
        """
        Convert seconds to readable timestamp format.
        """
        seconds = int(seconds)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60

        if hours > 0:
            return f"[{hours}:{minutes:02d}:{secs:02d}]"
        else:
            return f"[{minutes}:{secs:02d}]"
    
    @staticmethod
    def extract_video_id(url):
        """
        Extract video ID from various YouTube URL formats.
        
        Args:
            url: YouTube URL string
            
        Returns:
            Video ID string or None if invalid
        """
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([^\&\n?#]+)',
            r'youtube\.com\/embed\/([^\&\n?#]+)',
            r'youtube\.com\/v\/([^\&\n?#]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None
    
    @staticmethod
    def get_video_metadata(video_id):
        """
        Get video metadata using YouTube Data API.
        Uses API key (no OAuth needed for public metadata).
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Dictionary with video metadata
        """
        try:
            # Use API key for public metadata (no OAuth needed).
            # Prefer the dedicated YouTube key (classic AIza); fall back to GOOGLE_API_KEY.
            api_key = os.getenv('YOUTUBE_API_KEY') or os.getenv('GOOGLE_API_KEY')
            if not api_key:
                # Fallback to basic metadata if no API key
                return {
                    "id": video_id,
                    "thumbnail": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                    "url": f"https://www.youtube.com/watch?v={video_id}"
                }
            
            youtube = build('youtube', 'v3', developerKey=api_key)
            
            response = youtube.videos().list(
                part='snippet,contentDetails',
                id=video_id
            ).execute()
            
            if not response.get('items'):
                return {
                    "id": video_id,
                    "thumbnail": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                    "url": f"https://www.youtube.com/watch?v={video_id}"
                }
            
            video = response['items'][0]
            snippet = video['snippet']
            
            return {
                "id": video_id,
                "title": snippet.get('title', 'Unknown'),
                "thumbnail": snippet.get('thumbnails', {}).get('maxres', {}).get('url', 
                    f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "channel": snippet.get('channelTitle', 'Unknown'),
                "duration": YouTubeService._iso8601_to_seconds(video.get('contentDetails', {}).get('duration')),
            }
        except Exception as e:
            print(f"Error fetching metadata: {e}")
            # Fallback to basic metadata
            return {
                "id": video_id,
                "thumbnail": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={video_id}"
            }
    
    @staticmethod
    def _iso8601_to_seconds(duration):
        """Parse an ISO-8601 duration like 'PT1H23M45S' to seconds. Returns 0 on failure."""
        if not duration:
            return 0
        m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$', duration)
        if not m:
            return 0
        h, mn, s = (int(x) if x else 0 for x in m.groups())
        return h * 3600 + mn * 60 + s

    @staticmethod
    def _available_languages(video_id):
        """Return language codes of any available transcripts (best-effort, both API versions)."""
        try:
            api = YouTubeTranscriptApi()
            listing = api.list(video_id) if hasattr(api, 'list') else YouTubeTranscriptApi.list_transcripts(video_id)
            return [t.language_code for t in listing]
        except Exception:
            return []

    def get_transcript(self, video_id):
        """
        Fetch transcript using youtube-transcript-api (fetches public captions).
        No OAuth required - works for any public video with available captions.
        
        Note: The YouTube Data API v3 captions.download only works for video owners.
        This uses youtube-transcript-api to fetch publicly available captions instead.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Dictionary with transcript data and metadata
            
        Raises:
            ValueError: If transcript is unavailable
        """
        if not HAS_YOUTUBE_TRANSCRIPT_API:
            raise ValueError(
                "youtube-transcript-api package not installed. "
                "Run: pip install youtube-transcript-api"
            )
        
        try:
            # Fetch ENGLISH captions first - supports both old (0.6.x) and new (1.x) API
            try:
                # New API (1.x): YouTubeTranscriptApi().fetch(video_id, languages=['en'])
                fetched = YouTubeTranscriptApi().fetch(video_id, languages=['en'])
                transcript_list = fetched.to_raw_data()
                language = getattr(fetched, 'language_code', 'en')
            except (TypeError, AttributeError):
                # Old API (0.6.x): YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
                language = 'en'

            # Both APIs return list of dicts with text, start, duration
            transcript_data = []
            formatted_lines = []

            for item in transcript_list:
                start = item.get("start", 0)
                text = item.get("text", "").strip()
                duration = item.get("duration", 0)

                transcript_data.append({"text": text, "start": start, "duration": duration})

                timestamp_str = YouTubeService.format_timestamp(start)
                formatted_lines.append(f"{timestamp_str} {text}")

            return {
                "transcript": transcript_data,
                "full_text": "\n".join(formatted_lines),
                "language": language,
            }

        except NoTranscriptFound:
            # No ENGLISH captions. Is the video in another language, or does it have no captions at all?
            available = YouTubeService._available_languages(video_id)
            if available and not any(code.lower().startswith('en') for code in available):
                # Non-English video -> guard (Worklish is an English-learning tool)
                print(f"Non-English captions for {video_id}: {available}")
                return {
                    "transcript": None,
                    "full_text": None,
                    "language": available[0],
                    "non_english": True,
                    "available_languages": available,
                }
            print(f"No English transcript for {video_id} - enabling native video fallback.")
            return {"transcript": None, "full_text": None, "language": None, "fallback_needed": True}
        except TranscriptsDisabled:
            print(f"Captions disabled for {video_id} - enabling native video fallback.")
            return {"transcript": None, "full_text": None, "language": None, "fallback_needed": True}
        except VideoUnavailable:
            raise ValueError("Video is unavailable or private")
        except YouTubeTranscriptApiException as e:
            print(f"Transcript API exception for {video_id} - enabling native video fallback: {str(e)}")
            return {"transcript": None, "full_text": None, "language": None, "fallback_needed": True}
    
    @staticmethod
    def validate_url(url):
        """
        Validate if URL is a valid YouTube URL.
        
        Args:
            url: URL string to validate
            
        Returns:
            Boolean indicating if URL is valid
        """
        video_id = YouTubeService.extract_video_id(url)
        return video_id is not None
