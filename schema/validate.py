"""Reference play validator. Schema plus the semantic checks in the design.

Usage:
  python validate.py play.json play.schema.json
  python validate.py play.json play.schema.json --warn
"""

import json
import sys

import jsonschema

play = json.load(open(sys.argv[1]))
schema = json.load(open(sys.argv[2]))
warn = "--warn" in sys.argv[3:]
jsonschema.validate(play, schema)


def at(w, t, key):
    if t <= w[0]["t"]:
        return w[0][key]
    for a, b in zip(w, w[1:]):
        if a["t"] <= t <= b["t"]:
            span = b["t"] - a["t"]
            u = 0 if span == 0 else (t - a["t"]) / span
            return a[key] + (b[key] - a[key]) * u
    return w[-1][key]


errs = []
ids = set()
jer = {"offense": set(), "defense": set()}
cnt = {"offense": 0, "defense": 0}
D = play["meta"]["duration"]
for p in play["players"]:
    if p["id"] in ids:
        errs.append("dup id " + p["id"])
    ids.add(p["id"])
    cnt[p["team"]] += 1
    if p["jersey"] in jer[p["team"]]:
        errs.append("dup jersey " + p["id"])
    jer[p["team"]].add(p["jersey"])
    w = p["waypoints"]
    if w[0]["t"] > 0:
        errs.append(p["id"] + " first t must be <= 0 (t<0 = pre-snap)")
    if w[-1]["t"] != D:
        errs.append(p["id"] + " last t!=duration")
    for a, b in zip(w, w[1:]):
        if b["t"] <= a["t"]:
            errs.append(p["id"] + " t not increasing")
            continue
        sp = ((b["x"] - a["x"]) ** 2 + (b["y"] - a["y"]) ** 2) ** 0.5 / (b["t"] - a["t"])
        if sp > 11:
            errs.append(f'{p["id"]} speed {sp:.1f} yd/s > 11')
    los = play["meta"]["lineOfScrimmageX"]
    x0 = at(w, 0.0, "x")
    if (p["team"] == "offense") != (x0 < los):
        errs.append(p["id"] + " wrong side of LOS at snap")
segs = play["ball"]["segments"]
if segs[0]["t0"] > 0:
    errs.append("ball must exist at snap (first t0 <= 0)")
if segs[-1]["t1"] != D:
    errs.append("ball last t1 != duration")
for s in segs:
    if s["t1"] <= s["t0"]:
        errs.append(f"ball segment t1<=t0 at {s['t0']}")
    for k in ("carrier", "from", "to"):
        if k in s and s[k] not in ids:
            errs.append(f"ball {k} unknown id {s[k]}")
for a, b in zip(segs, segs[1:]):
    if abs(a["t1"] - b["t0"]) > 1e-9:
        errs.append(f"ball gap/overlap at {a['t1']}")
    end = a.get("carrier") or a.get("to")
    start = b.get("carrier") or b.get("from")
    if end != start:
        errs.append(f"ball handoff mismatch at {a['t1']}: {end} -> {start}")
if cnt != {"offense": 11, "defense": 11}:
    errs.append(f"counts {cnt}")

warnings = []
if warn and not errs:
    players = play["players"]
    los_t = 0.0

    def pos(p, t):
        w = p["waypoints"]
        return at(w, t, "x"), at(w, t, "y")

    for i, a in enumerate(players):
        ax, ay = pos(a, los_t)
        for b in players[i + 1 :]:
            bx, by = pos(b, los_t)
            if ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 <= 0.5:
                warnings.append(f"snap {a['id']} {b['id']}")
    t = 0.0
    end_t = play["meta"]["duration"]
    streak = {}
    while t <= end_t + 1e-9:
        for i, a in enumerate(players):
            ax, ay = pos(a, t)
            for b in players[i + 1 :]:
                bx, by = pos(b, t)
                key = (a["id"], b["id"])
                close = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 <= 0.3
                if close:
                    if key not in streak:
                        streak[key] = t
                elif key in streak:
                    if t - streak[key] > 0.5:
                        warnings.append(f"contact {key[0]} {key[1]}")
                    del streak[key]
        t += 0.05
    for key, start in streak.items():
        if end_t - start > 0.5:
            warnings.append(f"contact {key[0]} {key[1]}")

if warnings:
    print("\n".join("WARN " + w for w in warnings))
print("\n".join(errs) or "OK: schema + semantic checks pass")
sys.exit(bool(errs))
