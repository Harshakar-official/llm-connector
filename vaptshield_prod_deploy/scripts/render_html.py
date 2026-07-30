import sys
import json
import os
from jinja2 import Environment

def from_json(value):
    try:
        if not value:
            return []
        if isinstance(value, (list, dict)):
            return value
        return json.loads(value)
    except Exception:
        return []

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: render_html.py <data.json> <output.html>")
        sys.exit(1)
        
    data_json_path = sys.argv[1]
    output_html_path = sys.argv[2]
    
    with open(data_json_path, 'r', encoding='utf-8') as f:
        context = json.load(f)
        
    template_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'reportTemplate.html')
    
    with open(template_path, 'r', encoding='utf-8') as f:
        template_str = f.read()
        
    env = Environment()
    env.filters['from_json'] = from_json
    template = env.from_string(template_str)
    
    rendered = template.render(**context)
    
    with open(output_html_path, 'w', encoding='utf-8') as f:
        f.write(rendered)
