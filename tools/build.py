"""Build menu-data.json from tools/source.json + tools/catalog.py and check the diet rules.

Usage: python3 tools/build.py            (writes menu-data.json, prints a report)
       python3 tools/build.py --check    (report only, exit 1 if a rule is broken)
"""
import hashlib, json, os, sys
from catalog import CATALOG, CATS, SPICES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLOTS = ["Сніданок", "Обід", "Перекус", "Вечеря"]
FROZEN = "FROZEN"


def macros(ing):
    p = f = c = 0.0
    for row in ing:
        iid, g = row[0], row[1]
        if not iid or g is None:
            continue
        np_, nf, nc = CATALOG[iid][3]
        p += np_ * g / 100; f += nf * g / 100; c += nc * g / 100
    return round(p, 1), round(f, 1), round(c, 1)


def main():
    src = json.load(open(os.path.join(ROOT, "tools", "source.json"), encoding="utf-8"))
    rules = src["rules"]
    errors, report = [], []

    dishes = {}
    for did, d in src["dishes"].items():
        for row in d["ing"]:
            if row[0] and row[0] not in CATALOG:
                errors.append(f"{did}: unknown ingredient '{row[0]}' (add it to tools/catalog.py)")
        p, f, c = macros(d["ing"])
        out = {k: v for k, v in d.items() if k != "ing"}
        out["ing"] = [{"id": r[0], "g": r[1], **({"note": r[2]} if len(r) > 2 else {})} for r in d["ing"]]
        out.update(p=p, f=f, c=c, kcal=round(p * 4 + f * 9 + c * 4))
        dishes[did] = out
    if errors:
        print("\n".join(errors)); sys.exit(1)

    weeks = src["weeks"]
    for wi, w in enumerate(weeks):
        prev_freeze = weeks[wi - 1]["freeze"]
        report.append(f"\nТиждень {wi + 1} · {w['title']}")
        if len(w["days"]) != 7:
            errors.append(f"week {wi + 1}: needs 7 days")
        cooked = {d for p in w["prep"] for d in p["dishes"]}
        used, red, fish, lor = set(), 0, 0, 0
        for di, day in enumerate(w["days"]):
            t = [0.0, 0.0, 0.0]
            for si, did in enumerate(day):
                real = prev_freeze if did == FROZEN else did
                if real not in dishes:
                    errors.append(f"week {wi + 1} day {di + 1}: unknown dish '{did}'"); continue
                d = dishes[real]
                t[0] += d["p"]; t[1] += d["f"]; t[2] += d["c"]
                if did == FROZEN:
                    continue
                used.add(did)
                ids = {r["id"] for r in d["ing"]}
                if d["kind"] == "cook":
                    block = [i for i, p in enumerate(w["prep"]) if did in p["dishes"]]
                    if not block:
                        errors.append(f"week {wi + 1}: '{did}' is cooked but not in any prep")
                    else:
                        prep_day = 0 if block[0] == 0 else 3
                        offset = di - prep_day
                        if offset < 0 or offset > d.get("shelf", 3):
                            errors.append(f"week {wi + 1} day {di + 1}: '{did}' eaten {offset} days after prep (shelf {d.get('shelf', 3)})")
                if ids & set(rules["redMeat"]): red += 1
                if ids & set(rules["fish"]): fish += 1
                lor += sum(r["g"] or 0 for r in d["ing"] if r["id"] == "cottage")
            kcal = t[0] * 4 + t[1] * 9 + t[2] * 4
            flag = ""
            if t[0] < rules["proteinMin"] - 0.5: flag += " Б<min"
            if not rules["fat"][0] <= t[1] <= rules["fat"][1]: flag += " Ж!"
            if not rules["carbs"][0] <= t[2] <= rules["carbs"][1]: flag += " В!"
            report.append(f"  день {di + 1}: Б {t[0]:.0f} Ж {t[1]:.0f} В {t[2]:.0f} = {kcal:.0f} ккал{flag}")
            if flag:
                errors.append(f"week {wi + 1} day {di + 1}:{flag}")
        # dishes eaten on several days count once per day for red meat / fish (a dish cooked once)
        red_dishes = {d for d in used if {r['id'] for r in dishes[d]['ing']} & set(rules["redMeat"])}
        fish_dishes = {d for d in used if {r['id'] for r in dishes[d]['ing']} & set(rules["fish"])}
        report.append(f"  червоне м'ясо: {len(red_dishes)}, риба: {len(fish_dishes)}, лор на 1 людину: {lor:.0f} г")
        if len(red_dishes) != 1: errors.append(f"week {wi + 1}: red meat dishes = {len(red_dishes)}")
        if len(fish_dishes) != 1: errors.append(f"week {wi + 1}: fish dishes = {len(fish_dishes)}")
        if lor > rules["lorPerPersonMax"]: errors.append(f"week {wi + 1}: lor {lor} g per person")
        if w["freeze"] not in cooked: errors.append(f"week {wi + 1}: freeze dish not in a prep")
        for p in w["prep"]:
            for d in p["dishes"]:
                if d not in used: errors.append(f"week {wi + 1}: prep dish '{d}' is never eaten")

    ingredients = {}
    for iid, (name, tr, cat, nut, units, extra) in CATALOG.items():
        ingredients[iid] = {"name": name, "tr": tr, "cat": cat, "units": units, **extra}

    # Keep the previous cycle so the last days before the new cycle starts still show their menu
    prev = None
    old_path = os.path.join(ROOT, "menu-data.json")
    try:
        old = json.load(open(old_path, encoding="utf-8"))
        if old.get("cycleId") and old["cycleId"] != src["cycleId"]:
            prev = {k: old[k] for k in ("cycleId", "cycleStart", "weeks", "dishes")}
        elif old.get("cycleId") == src["cycleId"]:
            prev = old.get("prev")
    except (OSError, ValueError, KeyError):
        pass

    data = {
        "version": src["cycleId"] + "-" + hashlib.sha1(json.dumps(src, sort_keys=True).encode()).hexdigest()[:8],
        "cycleId": src["cycleId"], "cycleStart": src["cycleStart"], "people": src["people"],
        "target": src["target"], "cats": CATS, "spices": SPICES,
        "ingredients": ingredients, "dishes": dishes, "weeks": weeks,
    }
    if prev:
        data["prev"] = prev
    print("\n".join(report))
    if errors:
        print("\nПОМИЛКИ:\n- " + "\n- ".join(errors))
    if "--check" in sys.argv:
        sys.exit(1 if errors else 0)
    json.dump(data, open(os.path.join(ROOT, "menu-data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("\nmenu-data.json записано" + (" (є помилки вище)" if errors else ""))


if __name__ == "__main__":
    main()
