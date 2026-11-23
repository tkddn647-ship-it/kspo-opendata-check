"""HWP 5.0 본문 텍스트 추출 (외부 라이브러리 없이). OLE(CFB) 컨테이너 → BodyText/SectionN (raw deflate) → PARA_TEXT 레코드."""
import struct, sys, zlib

def read_cfb(data):
    ssz = 1 << struct.unpack_from('<H', data, 30)[0]
    mssz = 1 << struct.unpack_from('<H', data, 32)[0]
    n_fat, dir_start, _, mini_cutoff, mfat_start, n_mfat, difat_start, n_difat = struct.unpack_from('<IIIIIIII', data, 44)
    sec = lambda i: data[512 + i * ssz: 512 + (i + 1) * ssz]
    difat = list(struct.unpack_from('<109I', data, 76))
    d = difat_start
    while d not in (0xFFFFFFFE, 0xFFFFFFFF) and n_difat:
        s = sec(d); difat += struct.unpack_from(f'<{ssz // 4 - 1}I', s); d = struct.unpack_from('<I', s, ssz - 4)[0]; n_difat -= 1
    fat = []
    for f in difat[:n_fat]:
        fat += struct.unpack(f'<{ssz // 4}I', sec(f))
    def chain(start, table, getter):
        out, i = [], start
        while i not in (0xFFFFFFFE, 0xFFFFFFFF) and len(out) < 100000:
            out.append(getter(i)); i = table[i]
        return b''.join(out)
    dirs = chain(dir_start, fat, sec)
    ents = []
    for k in range(len(dirs) // 128):
        e = dirs[k * 128:(k + 1) * 128]
        nl = struct.unpack_from('<H', e, 64)[0]
        name = e[:max(nl - 2, 0)].decode('utf-16le', 'ignore')
        typ = e[66]; left, right, child = struct.unpack_from('<III', e, 68)
        start, size = struct.unpack_from('<IQ', e, 116)
        ents.append(dict(name=name, type=typ, left=left, right=right, child=child, start=start, size=size))
    root = ents[0]
    minifat = []
    if mfat_start not in (0xFFFFFFFE, 0xFFFFFFFF):
        mf = chain(mfat_start, fat, sec); minifat = list(struct.unpack(f'<{len(mf) // 4}I', mf))
    ministream = chain(root['start'], fat, sec) if root['start'] not in (0xFFFFFFFE, 0xFFFFFFFF) else b''
    def stream(e):
        if e['size'] < mini_cutoff:
            return chain(e['start'], minifat, lambda i: ministream[i * mssz:(i + 1) * mssz])[:e['size']]
        return chain(e['start'], fat, sec)[:e['size']]
    paths = {}
    def walk(i, prefix):
        if i == 0xFFFFFFFF or i >= len(ents): return
        e = ents[i]; walk(e['left'], prefix); walk(e['right'], prefix)
        p = prefix + e['name']
        if e['type'] == 2: paths[p] = e
        elif e['type'] == 1: walk(e['child'], p + '/')
    walk(root['child'], '')
    return {p: stream(e) for p, e in paths.items()}

def para_texts(section):
    pos, out = 0, []
    while pos + 4 <= len(section):
        h = struct.unpack_from('<I', section, pos)[0]; pos += 4
        tag, size = h & 0x3FF, (h >> 20) & 0xFFF
        if size == 0xFFF: size = struct.unpack_from('<I', section, pos)[0]; pos += 4
        body = section[pos:pos + size]; pos += size
        if tag == 67:  # HWPTAG_PARA_TEXT
            chars, i = [], 0
            while i + 2 <= len(body):
                c = struct.unpack_from('<H', body, i)[0]
                if c in (0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31):  # 문자형 제어
                    i += 2; chars.append('\n' if c in (10, 13) else ''); continue
                if c < 32:  # 인라인/확장 제어: 16바이트
                    i += 16; chars.append('\t' if c == 9 else ''); continue
                chars.append(chr(c)); i += 2
            out.append(''.join(chars))
    return out

def hwp_text(path):
    streams = read_cfb(open(path, 'rb').read())
    hdr = streams.get('FileHeader', b'')
    compressed = bool(hdr[36] & 1) if len(hdr) > 36 else True
    secs = sorted([p for p in streams if p.startswith('BodyText/Section')], key=lambda p: int(p.split('Section')[1]))
    lines = []
    for p in secs:
        raw = streams[p]
        if compressed: raw = zlib.decompress(raw, -15)
        lines += para_texts(raw)
    return '\n'.join(lines)

if __name__ == '__main__':
    print(hwp_text(sys.argv[1]))
