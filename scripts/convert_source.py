#!/usr/bin/env python3
"""
Converts the original Dev-C++ 5.11 source tree into assets the web version uses.

    python3 scripts/convert_source.py "/path/to/SOURCE 5.11"

Outputs (all generated, safe to delete and regenerate):
  src/generated/lang/*.json        language files (.lng) decoded to UTF-8
  src/generated/tips/*.json        tip-of-the-day files
  src/generated/forms/*.json       every Delphi form (.dfm) as a JSON tree
  src/generated/langIds.ts         ID_* constants from LangIDs.inc
  src/generated/colorThemes.json   editor color presets from DefaultFiles.rc
  src/generated/templates.json     project templates (Templates/*.template)
  public/devcpp/...                image lists, glyphs, icons
  public/help/...                  the original help pages
"""
import io
import json
import os
import re
import shutil
import struct
import sys

from PIL import Image

if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(1)

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, 'src', 'generated')
PUB = os.path.join(ROOT, 'public', 'devcpp')

for d in ['lang', 'tips', 'forms']:
    os.makedirs(os.path.join(GEN, d), exist_ok=True)
for d in ['images', 'forms', 'icons', 'templates']:
    os.makedirs(os.path.join(PUB, d), exist_ok=True)

# ---------------------------------------------------------------- languages
# Language files are stored in the ANSI code page of their authors' Windows.
ENCODINGS = {
    'Bulgarian': 'cp1251', 'Catalan': 'cp1252', 'Chinese_TC': 'big5', 'Chinese': 'gbk',
    'Croatian': 'cp1250', 'Czech': 'cp1250', 'Danish': 'cp1252', 'Dutch': 'cp1252',
    'English': 'cp1252', 'Estonian': 'cp1257', 'French': 'cp1252', 'Galego': 'cp1252',
    'German': 'cp1252', 'Greek': 'cp1253', 'Hebrew': 'cp1255', 'Hungarian': 'cp1250',
    'Italian': 'cp1252', 'Japanese': 'cp932', 'Korean': 'cp949', 'Latvian': 'cp1257',
    'Norwegian': 'cp1252', 'Polish': 'cp1250', 'Portuguese': 'cp1252', 'Romanian': 'cp1250',
    'Russian': 'cp1251', 'Slovak': 'cp1250', 'Slovenian': 'cp1250', 'Spanish': 'cp1252',
    'SpanishCastellano': 'cp1252', 'SpanishColombia': 'cp1252', 'Swedish': 'cp1252',
    'Turkish': 'cp1254', 'Ukrainian': 'cp1251',
}


def decode(raw, enc):
    return raw.decode(enc, errors='replace')


def read_lines(path, enc):
    with open(path, 'rb') as f:
        raw = f.read()
    text = decode(raw, enc)
    # Some files use NEL (0x85) as a line separator by accident
    return re.split(r'\r\n|\n|\r|\x85', text)


lang_index = []
for fn in sorted(os.listdir(os.path.join(SRC, 'Lang')), key=lambda s: s.lower()):
    base, ext = os.path.splitext(fn)
    if ext.lower() != '.lng':
        continue
    enc = ENCODINGS.get(base, 'cp1252')
    strings = {}
    name = base
    for line in read_lines(os.path.join(SRC, 'Lang', fn), enc):
        if '=' not in line or line.startswith('['):
            continue
        k, v = line.split('=', 1)
        k = k.strip()
        if k == 'Lang':
            name = v.strip()
        elif k.isdigit():
            strings[int(k)] = v
    tips = []
    tips_path = os.path.join(SRC, 'Lang', base + '.tips')
    if os.path.exists(tips_path):
        for line in read_lines(tips_path, enc):
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            tips.append(s)
        with open(os.path.join(GEN, 'tips', base + '.json'), 'w', encoding='utf-8') as f:
            json.dump(tips, f, ensure_ascii=False, indent=0)
    with open(os.path.join(GEN, 'lang', base + '.json'), 'w', encoding='utf-8') as f:
        json.dump({'file': fn, 'name': name, 'strings': strings}, f, ensure_ascii=False, indent=0)
    lang_index.append({'file': fn, 'name': name, 'hasTips': bool(tips)})
    print('lang', fn, '->', name, len(strings))

with open(os.path.join(GEN, 'langIndex.json'), 'w', encoding='utf-8') as f:
    json.dump(lang_index, f, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- LangIDs.inc
ids = []
with open(os.path.join(SRC, 'Source', 'LangIDs.inc'), encoding='latin-1') as f:
    for line in f:
        m = re.match(r'\s*(ID_\w+)\s*=\s*(\d+);', line)
        if m:
            ids.append((m.group(1).upper(), int(m.group(2))))
with open(os.path.join(GEN, 'langIds.ts'), 'w') as f:
    f.write('// Generated from Source/LangIDs.inc by scripts/convert_source.py\n')
    for k, v in ids:
        f.write(f'export const {k} = {v};\n')
print('lang ids', len(ids))

# ---------------------------------------------------------------- color themes
rc = open(os.path.join(SRC, 'Source', 'DefaultFiles.rc'), encoding='latin-1').read()
themes = {}
names = ['Classic', 'Classic Plus', 'Twilight', 'Ocean', 'Visual Studio', 'Borland', 'Matrix',
         'Obsidian', 'GSS Hacker', 'Obvilion', 'PlasticCodeWrap']
for m in re.finditer(r'^\s*(\d+),\s*"([^"]*)"', rc, re.M):
    n = int(m.group(1))
    idx, item = divmod(n, 1000)
    if idx >= len(names) or item == 0:
        continue
    themes.setdefault(names[idx], {})[item] = [s.strip() for s in m.group(2).split(',')]
with open(os.path.join(GEN, 'colorThemes.json'), 'w') as f:
    json.dump({'order': names, 'themes': themes}, f, indent=1)

# ---------------------------------------------------------------- images


def save_png(img, rel):
    path = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return rel


def bmp_from_bytes(data, transparent_from_corner=True):
    img = Image.open(io.BytesIO(data))
    img.load()
    img = img.convert('RGBA')
    if transparent_from_corner:
        w, h = img.size
        key = img.getpixel((0, h - 1))[:3]
        px = img.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if (r, g, b) == key:
                    px[x, y] = (0, 0, 0, 0)
    return img


def decode_imagelist(b):
    count, = struct.unpack_from('<H', b, 4)
    cx, cy = struct.unpack_from('<HH', b, 10)
    off = 28
    _bi, w, h, _pl, bpp, _comp = struct.unpack_from('<IiiHHI', b, off + 14)
    assert bpp == 32
    data = b[off + 54:off + 54 + w * h * 4]
    moff = off + 54 + w * h * 4
    mbi, mw, mh, _mpl, mbpp, _mc = struct.unpack_from('<IiiHHI', b, moff + 14)
    mdata = moff + 14 + mbi + (2 if mbpp == 1 else 0) * 4
    stride = ((mw * mbpp + 31) // 32) * 4
    alpha_any = any(data[i + 3] for i in range(0, len(data), 4))
    img = Image.new('RGBA', (w, h))
    px = img.load()
    for y in range(h):
        sy = h - 1 - y
        for x in range(w):
            i = (sy * w + x) * 4
            B, G, R, A = data[i:i + 4]
            mbit = (b[mdata + sy * stride + x // 8] >> (7 - x % 8)) & 1
            px[x, y] = (R, G, B, A if alpha_any else (0 if mbit else 255))
    cols = w // cx
    strip = Image.new('RGBA', (cx * count, cy))
    for i in range(count):
        sx, sy = (i % cols) * cx, (i // cols) * cy
        strip.paste(img.crop((sx, sy, sx + cx, sy + cy)), (i * cx, 0))
    return strip, count, cx, cy


# ---------------------------------------------------------------- DFM parsing


def parse_str(s):
    out = ''
    j = 0
    while j < len(s):
        c = s[j]
        if c == "'":
            j += 1
            while j < len(s):
                if s[j] == "'":
                    if j + 1 < len(s) and s[j + 1] == "'":
                        out += "'"
                        j += 2
                        continue
                    j += 1
                    break
                out += s[j]
                j += 1
        elif c == '#':
            m = re.match(r'#(\d+)', s[j:])
            out += chr(int(m.group(1)))
            j += len(m.group(0))
        else:
            j += 1
    return out


def parse_list(data):
    out = []
    cont = False
    for tok in data.split('\n'):
        tok = tok.strip()
        if not tok:
            continue
        if tok.startswith("'") or tok.startswith('#'):
            # a list item can be continued on the next line with +
            s = parse_str(tok.rstrip(' +'))
            if cont:
                out[-1] += s
            else:
                out.append(s)
            cont = tok.endswith('+')
        else:
            out.append(tok)
            cont = False
    return out


def parse_value(lines, i, first):
    v = first.strip()
    if v.startswith('{'):
        data = v[1:]
        while '}' not in data:
            data += lines[i].strip()
            i += 1
        return {'$hex': data[:data.index('}')].replace(' ', '')}, i
    if v.startswith('<'):
        items = []
        if v == '<>':
            return items, i
        cur = None
        while True:
            line = lines[i].strip()
            i += 1
            if line == 'item':
                cur = {}
            elif line.startswith('end>'):
                items.append(cur)
                break
            elif line == 'end':
                items.append(cur)
                cur = None
            else:
                m = re.match(r'([\w\.]+) = ?(.*)$', line)
                if m:
                    val, i = parse_value(lines, i, m.group(2))
                    cur[m.group(1)] = val
        return items, i
    if v.startswith('('):
        data = v[1:]
        if data.endswith(')'):
            return parse_list(data[:-1]), i
        while True:
            line = lines[i].strip()
            i += 1
            if line.endswith(')') and not line.endswith("')") or line == ')':
                data += '\n' + line[:-1]
                break
            if line.endswith("')"):
                data += '\n' + line[:-1]
                break
            data += '\n' + line
        return parse_list(data), i
    if v.startswith('[') and not v.endswith(']'):
        while not v.endswith(']'):
            v += ' ' + lines[i].strip()
            i += 1
    if v == '':
        s = ''
        while True:
            line = lines[i].strip()
            if line.startswith("'") or line.startswith('#'):
                s += parse_str(line.rstrip(' +'))
                i += 1
                if not line.endswith('+'):
                    break
            else:
                break
        return s, i
    if v.startswith("'") or v.startswith('#'):
        s = parse_str(v.rstrip(' +'))
        while v.endswith('+'):
            v = lines[i].strip()
            i += 1
            s += parse_str(v.rstrip(' +'))
        return s, i
    return v, i


def parse_obj(lines, i=0):
    line = lines[i].strip()
    i += 1
    m = re.match(r'(object|inherited|inline) (\w+)(?:: (\w+))?', line)
    node = {'name': m.group(2), 'class': m.group(3), 'props': {}, 'children': []}
    while i < len(lines):
        line = lines[i].strip()
        if line == 'end':
            return node, i + 1
        if re.match(r'(object|inherited|inline) ', line):
            child, i = parse_obj(lines, i)
            node['children'].append(child)
            continue
        i += 1
        m = re.match(r'([\w\.]+) =\s?(.*)$', line)
        if m:
            val, i = parse_value(lines, i, m.group(2))
            node['props'][m.group(1)] = val
    return node, i


def convert_binary_props(node, form):
    for k, v in list(node['props'].items()):
        if not (isinstance(v, dict) and '$hex' in v):
            continue
        b = bytes.fromhex(v['$hex'])
        rel = None
        try:
            if k == 'Bitmap' and b[:2] == b'IL':
                strip, count, cx, cy = decode_imagelist(b)
                rel = save_png(strip, f'images/{node["name"]}.png' if form == 'DataFrm' else f'images/{form}_{node["name"]}.png')
                node['props'][k] = {'$imagelist': rel, 'count': count, 'w': cx, 'h': cy}
                continue
            if k == 'Glyph.Data':
                size, = struct.unpack_from('<I', b, 0)
                img = bmp_from_bytes(b[4:4 + size])
                rel = save_png(img, f'forms/{form}/{node["name"]}.glyph.png')
            elif k == 'Picture.Data':
                n = b[0]
                cls = b[1:1 + n].decode('latin-1')
                rest = b[1 + n:]
                if cls == 'TBitmap':
                    size, = struct.unpack_from('<I', rest, 0)
                    img = bmp_from_bytes(rest[4:4 + size], transparent_from_corner=False)
                elif cls == 'TIcon':
                    img = Image.open(io.BytesIO(rest)).convert('RGBA')
                elif cls in ('TPngImage', 'TPNGObject', 'TPNGGraphic', 'TdxPNGImage'):
                    img = Image.open(io.BytesIO(rest)).convert('RGBA')
                elif cls == 'TJPEGImage':
                    size, = struct.unpack_from('<I', rest, 0)
                    img = Image.open(io.BytesIO(rest[4:4 + size])).convert('RGBA')
                else:
                    print('  unknown picture class', cls, form, node['name'])
                    node['props'][k] = None
                    continue
                rel = save_png(img, f'forms/{form}/{node["name"]}.picture.png')
            elif k == 'Icon.Data':
                img = Image.open(io.BytesIO(b)).convert('RGBA')
                rel = save_png(img, f'forms/{form}/{node["name"]}.icon.png')
            else:
                node['props'][k] = None
                continue
            node['props'][k] = {'$img': rel, 'w': img.size[0], 'h': img.size[1]}
        except Exception as e:  # keep going, a missing glyph is not fatal
            print('  could not decode', form, node['name'], k, e)
            node['props'][k] = None
    for c in node['children']:
        convert_binary_props(c, form)


src_dir = os.path.join(SRC, 'Source')
for fn in sorted(os.listdir(src_dir)):
    if not fn.endswith('.dfm'):
        continue
    raw = open(os.path.join(src_dir, fn), 'rb').read()
    if raw[:1] == b'\xff':
        print('skip binary form', fn)
        continue
    form = fn[:-4]
    tree, _ = parse_obj(raw.decode('cp1252').splitlines())
    convert_binary_props(tree, form)
    with open(os.path.join(GEN, 'forms', form + '.json'), 'w', encoding='utf-8') as f:
        json.dump(tree, f, ensure_ascii=False, separators=(',', ':'))
    print('form', form)

# ---------------------------------------------------------------- icons
for d, out in [(os.path.join(SRC, 'Source', 'Images', 'associations'), 'icons'),
               (os.path.join(SRC, 'Icons'), 'templates')]:
    for fn in os.listdir(d):
        if not fn.lower().endswith('.ico'):
            continue
        ico = Image.open(os.path.join(d, fn))
        sizes = sorted(ico.info.get('sizes', [ico.size]))
        for s in sizes:
            if s[0] in (16, 32, 48):
                ico.size = s
                img = ico.convert('RGBA')
                save_png(img, f'{out}/{os.path.splitext(fn)[0]}_{s[0]}.png')
        # always provide a 32px variant
        ico.size = max(sizes)
        big = ico.convert('RGBA')
        if not os.path.exists(os.path.join(PUB, out, os.path.splitext(fn)[0] + '_32.png')):
            save_png(big.resize((32, 32), Image.LANCZOS), f'{out}/{os.path.splitext(fn)[0]}_32.png')
        if not os.path.exists(os.path.join(PUB, out, os.path.splitext(fn)[0] + '_16.png')):
            save_png(big.resize((16, 16), Image.LANCZOS), f'{out}/{os.path.splitext(fn)[0]}_16.png')
shutil.copyfile(os.path.join(SRC, 'devcpp.ico'), os.path.join(ROOT, 'public', 'favicon.ico'))
ico = Image.open(os.path.join(SRC, 'devcpp.ico'))
for s in sorted(ico.info.get('sizes', [ico.size])):
    ico.size = s
    save_png(ico.convert('RGBA'), f'icons/devcpp_{s[0]}.png')

# ---------------------------------------------------------------- templates


def read_ini(path, enc='cp1252'):
    sections = {}
    cur = None
    for line in read_lines(path, enc):
        line = line.strip()
        if not line or line.startswith(';'):
            continue
        m = re.match(r'\[(.+)\]', line)
        if m:
            cur = sections.setdefault(m.group(1), {})
        elif '=' in line and cur is not None:
            k, v = line.split('=', 1)
            cur[k.strip()] = v
    return sections


tdir = os.path.join(SRC, 'Templates')
files_lower = {f.lower(): f for f in os.listdir(tdir)}
templates = []
contents = {}
for fn in sorted(os.listdir(tdir)):
    if not fn.endswith('.template'):
        continue
    ini = read_ini(os.path.join(tdir, fn))
    templates.append({'file': fn, 'ini': ini})
    for sec, vals in ini.items():
        for key in ('C', 'Cpp'):
            ref = vals.get(key)
            if ref and ref.lower() in files_lower:
                real = files_lower[ref.lower()]
                contents[ref.lower()] = open(os.path.join(tdir, real), 'rb').read().decode('cp1252')
for fn in os.listdir(tdir):
    if fn.lower().endswith('.bmp'):
        Image.open(os.path.join(tdir, fn)).save(os.path.join(PUB, 'templates', fn[:-4] + '.png'))
with open(os.path.join(GEN, 'templates.json'), 'w', encoding='utf-8') as f:
    json.dump({'templates': templates, 'files': contents}, f, ensure_ascii=False, indent=1)
print('templates', len(templates))

# ---------------------------------------------------------------- help
# Caption bindings used by the form controllers, preserving the original translations.
form_captions = {}
lang_id_values = dict(ids)
for filename in os.listdir(src_dir):
    if not filename.endswith('.pas'):
        continue
    source = open(os.path.join(src_dir, filename), encoding='cp1252', errors='replace').read()
    bindings = {}
    for control, prop, token in re.findall(r'(?im)^\s*(\w+)\.(Caption|Hint)\s*:=\s*Lang\[(ID_\w+)\]', source):
        if token in lang_id_values:
            bindings[control + ':' + prop] = lang_id_values[token]
    title = re.search(r'(?im)^\s*Caption\s*:=\s*Lang\[(ID_\w+)\]', source)
    if title and title[1] in lang_id_values:
        for root in re.findall(r'(\w+)\s*=\s*class\(TForm\)', source, re.I):
            bindings[root.removeprefix('T') + ':Caption'] = lang_id_values[title[1]]
    if bindings:
        form_captions[filename[:-4]] = bindings
with open(os.path.join(GEN, 'formCaptions.json'), 'w', encoding='utf-8') as f:
    json.dump(form_captions, f, ensure_ascii=False, indent=2)

help_dst = os.path.join(ROOT, 'public', 'help')
if os.path.exists(help_dst):
    shutil.rmtree(help_dst)
shutil.copytree(os.path.join(SRC, 'Help'), help_dst, ignore=shutil.ignore_patterns('.DS_Store'))

# AStyle documentation (used by Formatting Options)
print('done')
