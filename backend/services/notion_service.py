import os
from notion_client import Client

class NotionService:
    def __init__(self, auth_token=None):
        self.auth_token = auth_token or os.getenv('NOTION_TOKEN')
        self.client = Client(auth=self.auth_token) if self.auth_token else None

    def search_pages(self):
        """Finds pages the integration has access to."""
        if not self.client:
           raise ValueError("Notion client not initialized.")
        results = self.client.search(filter={"value": "page", "property": "object"}).get("results")
        return results

    def create_analysis_page(self, parent_page_id, data):
        """
        Creates a new page in Notion with the analysis results.
        """
        if not self.client:
            raise ValueError("Notion client not initialized. Invalid or missing token.")

        video_title = data.get('video', {}).get('title', 'YouTube Analysis')
        video_url = data.get('video', {}).get('url', '')
        
        # Create the page
        new_page = self.client.pages.create(
            parent={"page_id": parent_page_id},
            properties={
                "title": [
                    {
                        "text": {
                            "content": f"Analysis: {video_title}"
                        }
                    }
                ]
            },
            children=self._build_blocks(data, video_url)
        )
        return new_page

    def _build_blocks(self, data, video_url):
        blocks = []
        
        # Video link
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [
                    {"text": {"content": "Video URL: "}},
                    {
                        "text": {
                            "content": video_url,
                            "link": {"url": video_url}
                        }
                    }
                ]
            }
        })

        # PM Insights Section
        blocks.append({
            "object": "block",
            "type": "heading_1",
            "heading_1": {
                "rich_text": [{"text": {"content": "PM Insights"}}]
            }
        })

        for insight in data.get('pm_insights', []):
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {
                    "rich_text": [{"text": {"content": insight.get('title', 'Insight')}}]
                }
            })
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"text": {"content": insight.get('description', '')}}]
                }
            })

        # English Expressions Section
        blocks.append({
            "object": "block",
            "type": "heading_1",
            "heading_1": {
                "rich_text": [{"text": {"content": "English Expressions"}}]
            }
        })

        for expr in data.get('english_expressions', []):
            timestamp = expr.get('timestamp', 0)
            phrase = expr.get('phrase', '')
            example = expr.get('example', '')
            
            # Format: **Phrase** (00:00)
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            time_str = f"{minutes:02d}:{seconds:02d}"
            
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {"content": phrase}, 
                            "annotations": {"bold": True}
                        },
                        {
                            "type": "text",
                            "text": {"content": f" ({time_str})"}
                        },
                    ],
                    "children": [
                        {
                            "object": "block",
                            "type": "paragraph",
                            "paragraph": {
                                "rich_text": [{"type": "text", "text": {"content": example}}]
                            }
                        }
                    ]
                }
            })

        return blocks
