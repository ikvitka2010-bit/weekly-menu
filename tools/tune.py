"""Nudge ingredient grams in tools/source.json so every day lands in the macro targets.

Run after writing new weeks: python3 tools/tune.py, then python3 tools/build.py.
It prints every change; read them and fix anything that looks unrealistic by hand."""
import json, sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from catalog import CATALOG
P = os.path.join(HERE, "source.json")
src = json.load(open(P))
D, W = src["dishes"], src["weeks"]
TUNE = {"oil": (1, 6, 1), "bulgur": (25, 80, 5), "buck": (25, 80, 5), "rice": (25, 80, 5), "pasta": (35, 90, 5),
        "noodle": (15, 45, 5), "lavash": (30, 70, 5), "bread": (0, 80, 5), "potato": (100, 300, 10), "oats": (15, 50, 5),
        "breast": (80, 200, 10), "thigh": (110, 190, 10), "turkey": (130, 200, 10), "mince": (120, 180, 10),
        "beef": (140, 190, 10), "bmince": (120, 170, 10), "hake": (180, 260, 10), "fish": (180, 250, 10), "tuna": (100, 160, 10),
        "egg": None, "white": (66, 165, 33), "cottage": (30, 200, 5), "banana": (50, 100, 10), "honey": (0, 10, 1),
        "yogurt": (20, 60, 10), "chick": (60, 140, 10), "lentil": (0, 70, 5), "kefir": (200, 300, 50), "milk": (30, 200, 10)}
LOCK = set()  # keep week-1-only dishes as authored where possible
def mac(d):
    p=f=c=0
    for r in D[d]["ing"]:
        if r[0] and r[1]:
            n=CATALOG[r[0]][3]; p+=n[0]*r[1]/100; f+=n[1]*r[1]/100; c+=n[2]*r[1]/100
    return p,f,c
def pen():
    tot=0
    for wi,w in enumerate(W):
        pf=W[wi-1]["freeze"]
        for day in w["days"]:
            p=f=c=0
            for x in day:
                a,b,cc=mac(pf if x=="FROZEN" else x); p+=a;f+=b;c+=cc
            if p<123: tot+=(123-p)**2*3
            if p>160: tot+=(p-160)**2*.3
            if f<37: tot+=(37-f)**2*2
            if f>43: tot+=(f-43)**2*2
            if c<151: tot+=(151-c)**2
            if c>159: tot+=(c-159)**2
    return tot
orig = {(d,i):r[1] for d in D for i,r in enumerate(D[d]["ing"])}
def reg():
    return sum(abs(D[d]["ing"][i][1]-g)/max(g,10) for (d,i),g in orig.items() if g)*0.4
best=pen()+reg()
for it in range(12):
    improved=False
    for d in D:
        for i,r in enumerate(D[d]["ing"]):
            t=TUNE.get(r[0])
            if r[0]=="yogurt" and d in ("s_yog","s_yogoat"): t=(180,260,10)
            if not t or r[1] is None or d=="bowl": continue
            lo,hi,st=t; cur=r[1]
            for v in range(lo,hi+1,st):
                if v==cur: continue
                r[1]=v; s=pen()+reg()
                if s<best-1e-6: best=s; cur=v; improved=True
            r[1]=cur
    print(it, round(pen(),1), round(best,1))
    if not improved: break
# keep whole/bowl chicken in sync
json.dump(src, open(P,"w"), ensure_ascii=False, indent=1)
for (d,i),g in orig.items():
    ng=D[d]["ing"][i][1]
    if ng!=g: print(d, D[d]["ing"][i][0], g, "->", ng)
