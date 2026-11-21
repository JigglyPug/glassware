"""The trailer's running time, read from the video itself (its mvhd box), so the "Watch the trailer" labels
always match the file in assets/trailer."""
import os, struct
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def seconds(path=f'{R}/assets/trailer/glassware-trailer.mp4'):
    data = open(path, 'rb').read()
    i = data.find(b'mvhd')
    if i < 0: raise ValueError(f'{path}: no mvhd box')
    v = data[i + 4]
    if v == 1: scale, dur = struct.unpack('>IQ', data[i + 24:i + 36])
    else: scale, dur = struct.unpack('>II', data[i + 16:i + 24])
    return dur / scale

def length(path=None):
    """m:ss, rounded to the nearest second."""
    s = round(seconds(path) if path else seconds())
    return f'{s // 60}:{s % 60:02d}'
