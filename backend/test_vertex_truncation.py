import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(".env")
project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
location = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')

client = genai.Client(vertexai=True, project=project_id, location=location)

print("Sending test request to Vertex AI Gemini 2.5 Flash...")
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=["Write a 5-paragraph essay about Product Management."],
    config=types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=2000
    )
)

print("\n--- Response ---")
print(response.text)
if hasattr(response, 'candidates') and response.candidates:
    print(f"\nFinish Reason: {response.candidates[0].finish_reason}")
