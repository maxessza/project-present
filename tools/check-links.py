"""Check local website/document links without modifying source files."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re, sys
ROOT = Path(__file__).resolve().parents[1]
class HtmlRefs(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs = []; self.ids = set()
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get('id'): self.ids.add(d['id'])
        if tag == 'a' and d.get('name'): self.ids.add(d['name'])
        for name in ('href', 'src'):
            if d.get(name): self.refs.append(d[name])
def check(root):
    errors = []; checked = []; docs = []; html = {}
    for file in [root / 'index.html', *sorted((root / 'pages').glob('*.html'))]:
        p = HtmlRefs(); p.feed(file.read_text(encoding='utf-8')); html[file.resolve()] = p
    def ref(owner, value, anchors=True):
        u = urlsplit(value)
        if u.scheme or u.netloc or value.startswith(('data:', '//')): return
        dest = (owner.parent / unquote(u.path)).resolve() if u.path else owner.resolve()
        if not dest.is_relative_to(root.resolve()):
            errors.append({'owner':str(owner.relative_to(root)), 'url':value, 'error':'escapes project'}); return
        checked.append({'owner':owner.relative_to(root).as_posix(), 'url':value})
        if not dest.is_file():
            errors.append({'owner':owner.relative_to(root).as_posix(),'url':value,'error':'missing file'}); return
        if anchors and u.fragment and dest in html and unquote(u.fragment) not in html[dest].ids:
            errors.append({'owner':owner.relative_to(root).as_posix(),'url':value,'error':'missing anchor'})
    for file, data in html.items():
        for value in data.refs: ref(file, value)
    for file in (root / 'src/css').glob('*.css'):
        text = file.read_text(encoding='utf-8')
        for value in re.findall(r'url\(\s*[\"\']?([^\)\"\']+)[\"\']?\s*\)',text):ref(file, value.strip(),False)
    # Slide images are resolved in the document, NOT at the script's folder.
    slides = root / 'src/js/slides/slides-data.js'
    for value in re.findall(r'"image"\s*:\s*"([^"]+)"', slides.read_text(encoding='utf-8')):ref(root/'pages/slides.html',value,False)
    for file in [root / 'README.md', *sorted((root / 'docs').rglob('*.md'))]:
        if not file.is_file(): errors.append({'owner':file.relative_to(root).as_posix(),'error':'missing documentation'});continue
        docs.append(file.relative_to(root).as_posix())
        text = file.read_text(encoding='utf-8')
        for value in re.findall(r'(?<!!)\[[^\]]+\]\(([^\s\)]+)\)',text):ref(file,value,False)
    return {'pass':not errors,'checked_links':len(checked),'active_html':len(html),'markdown_files':len(docs),'errors':errors,'scope':'local paths/anchors only; does not validate actual hardware or every dynamic scene'}
if __name__ == '__main__':
    root = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT
    result = check(root); print(json.dumps(result,ensure_ascii=False,indent=2)); sys.exit(0 if result['pass'] else 1)
