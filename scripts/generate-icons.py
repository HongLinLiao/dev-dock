"""Create original app and macOS template icons using only Python's standard library."""
import math, struct, zlib
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'public'
def segment(x,y,ax,ay,bx,by,width):
    dx,dy=bx-ax,by-ay
    t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
    return (x-ax-t*dx)**2+(y-ay-t*dy)**2 <= width**2

def draw(size, tray=False):
    scale=2 if size>100 else 4
    n=size*scale
    rows=[]
    for yy in range(size):
        row=bytearray()
        for xx in range(size):
            rgb=[0,0,0]; alpha=0
            for sy in range(scale):
                for sx in range(scale):
                    x=(xx+(sx+.5)/scale)/size*64
                    y=(yy+(sy+.5)/scale)/size*64
                    if not tray:
                        # macOS Dock artwork occupies about 80% of the canvas.
                        # Scale the background and monogram together, leaving
                        # transparent padding on every side. Tray icons keep
                        # their original scale.
                        x=(x-32)/0.80+32
                        y=(y-32)/0.80+32
                    visible=False
                    if not tray:
                        dx=max(18-x,0,x-46);dy=max(18-y,0,y-46)
                        visible=dx*dx+dy*dy<=18*18
                    stroke=segment(x,y,19,20,31,20,2.5) or segment(x,y,19,20,19,44,2.5) or segment(x,y,19,44,31,44,2.5)
                    # Right half of the rounded D.
                    stroke=stroke or (x>=31 and abs(math.sqrt(((x-31)/1.2)**2+(y-32)**2)-12)<2.5)
                    stroke=stroke or segment(x,y,12,32,29,32,2) or segment(x,y,24,27,29,32,2) or segment(x,y,24,37,29,32,2)
                    color=(0,0,0) if tray else (245,255,250) if stroke else (23,125,100)
                    a=255 if (stroke if tray else visible) else 0
                    for k in range(3): rgb[k]+=color[k]*a
                    alpha+=a
            count=scale*scale
            row.extend([*(round(v/alpha) if alpha else 0 for v in rgb), round(alpha/count)])
        rows.append(b'\0'+row)
    def chunk(tag,data):return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
for name,size,tray in [('icon.png',512,False),('trayTemplate.png',22,True),('trayTemplate@2x.png',44,True)]:
    (root/name).write_bytes(draw(size,tray))
    print(name)
