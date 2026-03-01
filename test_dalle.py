#!/usr/bin/env python3
"""
DALL-E 3 Image Generation Test Script
Tests the updated OpenAI API integration
"""
import asyncio
import sys
from app.config import get_settings
from app.image_generation import generate_football_slider_image

async def test_dalle():
    """Test DALL-E 3 image generation with updated API."""
    print("=" * 60)
    print("DALL-E 3 Image Generation Test")
    print("=" * 60)
    
    settings = get_settings()
    
    print(f"\n✓ API Key configured: {bool(settings.openai_api_key)}")
    if settings.openai_api_key:
        print(f"✓ API Key (first 10 chars): {settings.openai_api_key[:10]}...")
    else:
        print("✗ ERROR: OpenAI API key not configured!")
        print("  Please set OPENAI_API_KEY in your .env file")
        sys.exit(1)
    
    try:
        print("\n" + "=" * 60)
        print("Generating test image...")
        print("=" * 60)
        print("Prompt: Modern football stadium with neon green lights")
        print("This may take 30-60 seconds...\n")
        
        result = await generate_football_slider_image(
            prompt="Modern football stadium with neon green lights, cinematic, ultra high quality",
            settings=settings,
        )
        
        print("\n" + "=" * 60)
        print("✅ SUCCESS!")
        print("=" * 60)
        print(f"✓ Image URL: {result['url'][:80]}...")
        print(f"✓ Local path: {result['local_path']}")
        print(f"✓ Relative URL: {result['relative_url']}")
        print(f"✓ File size: {result['metadata']['file_size_bytes']:,} bytes")
        print(f"✓ Quality: {result['metadata']['quality']}")
        print(f"✓ Size: {result['metadata']['size']}")
        print(f"✓ Style: {result['metadata']['style']}")
        
        if 'revised_prompt' in result and result['revised_prompt'] != result['prompt']:
            print(f"\n📝 DALL-E revised the prompt:")
            print(f"   Original: {result['prompt'][:60]}...")
            print(f"   Revised:  {result['revised_prompt'][:60]}...")
        
        print("\n" + "=" * 60)
        print("Test completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ ERROR")
        print("=" * 60)
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print("\nTroubleshooting:")
        print("1. Check if OPENAI_API_KEY is valid")
        print("2. Verify API key has DALL-E 3 access")
        print("3. Check OpenAI account has credits")
        print("4. Review logs for detailed error messages")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_dalle())
