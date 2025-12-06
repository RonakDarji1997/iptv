import re

with open('/volume1/docker/iptv/whisper_service.py.bak', 'r') as f:
    content = f.read()

# Replace the old return with new one
old_code = """        text = ' '.join([segment.text for segment in segments])
        
        # Clean up
        os.remove(temp_path)
        
        logger.info(f'Transcription result: {text[:50]}...')
        return jsonify({'text': text})"""

new_code = """        # Collect segments
        text = ''
        all_segments = []
        for segment in segments:
            text += segment.text + ' '
            all_segments.append({
                'start': segment.start,
                'end': segment.end,
                'text': segment.text.strip()
            })
        
        # Clean up
        os.remove(temp_path)
        
        logger.info(f'Transcription result: {text[:50]}...')
        return jsonify({
            'text': text.strip(),
            'segments': all_segments
        })"""

content = content.replace(old_code, new_code)

with open('/volume1/docker/iptv/whisper_service.py.fixed2', 'w') as f:
    f.write(content)

print("Fixed file created")
