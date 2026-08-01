# -*- coding: utf-8 -*-
"""
PWA 图标生成脚本：蜡烛图主题（红涨绿跌 + 主题蓝背景）
输出 public/icon-512.png / icon-192.png / apple-touch-icon.png(180)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
os.makedirs(OUT, exist_ok=True)

S = 512
img = Image.new("RGB", (S, S))
d = ImageDraw.Draw(img)

# 背景：深蓝纵向渐变（上深下亮），整幅铺满（maskable 安全）
top, bot = (13, 27, 54), (26, 74, 146)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    d.line([(0, y), (S, y)], fill=c)

RED = (245, 112, 78)     # --up-text 暗色版
GREEN = (62, 207, 142)   # --down-text 暗色版
LINE = (122, 178, 255)   # 浅蓝趋势线

# 四根蜡烛：x 中心 96/208/320/432，宽 72
candles = [
    # (cx, 实体顶, 实体底, 影线上, 影线下, 颜色)
    (96,  268, 372, 228, 412, GREEN),
    (208, 176, 300, 136, 340, RED),
    (320, 216, 330, 176, 372, GREEN),
    (432, 118, 252, 84, 296, RED),
]
for cx, t, b, wt, wb, color in candles:
    d.line([(cx, wt), (cx, wb)], fill=color, width=10)          # 影线
    d.rounded_rectangle([cx - 36, t, cx + 36, b], radius=10, fill=color)  # 实体

# 上升趋势折线（浅蓝，叠在蜡烛上方）
pts = [(48, 330), (152, 250), (262, 282), (372, 168), (470, 96)]
d.line(pts, fill=LINE, width=14, joint="curve")
for x, y in pts:
    d.ellipse([x - 13, y - 13, x + 13, y + 13], fill=(255, 255, 255))

img.save(os.path.join(OUT, "icon-512.png"), "PNG")
img.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"), "PNG")
img.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "apple-touch-icon.png"), "PNG")
print("icons ->", os.path.abspath(OUT))
