"""Ingredient catalog: names, shop category, nutrition per 100 g (raw), home measures.

nut = (protein, fat, carbs) per 100 g of the product as bought (grains dry, meat raw).
units = home measures from largest to smallest: [name, grams in one unit].
shop = how the shopping list shows the total: "g" (г/кг), "ml" (л), "pcs" (pieces of `piece` g),
       "egg" (eggs: whole + whites), "can" (cans of `piece` g).
"""

CATS = [
    "М'ясо і риба",
    "Молочне і яйця",
    "Овочі",
    "Фрукти і ягоди",
    "Крупи, хліб, макарони",
    "Бакалія",
]

MEAT, DAIRY, VEG, FRUIT, GRAIN, PANTRY = CATS

CATALOG = {
    # id: name, turkish, cat, nut, units, extra
    "breast":   ("Куряча грудка", "tavuk göğüs fileto", MEAT, (23, 1.8, 0), [["філе", 180]], {}),
    "thigh":    ("Курячі стегна без кістки і шкіри", "kemiksiz tavuk but / pirzola", MEAT, (20, 5, 0), [["шт", 90]], {}),
    "turkey":   ("Індичка, грудка", "hindi göğüs fileto", MEAT, (24, 1.5, 0), [["шматок з долоню", 150]], {}),
    "liver":    ("Куряча печінка", "tavuk ciğeri", MEAT, (17, 5, 1), [["скл.", 220]], {}),
    "mince":    ("Курячий фарш", "tavuk kıyma", MEAT, (20, 5, 0), [["скл.", 220]], {}),
    "beef":     ("Яловичина кубиками, нежирна", "dana kuşbaşı (yağsız)", MEAT, (21, 7, 0), [["скл. кубиків", 180]], {}),
    "bmince":   ("Яловичий фарш нежирний", "az yağlı dana kıyma", MEAT, (20, 8, 0), [["скл.", 220]], {}),
    "fish":     ("Філе сібаса або дорадо", "levrek / çipura fileto", MEAT, (19, 3, 0), [["філе", 110]], {}),
    "hake":     ("Філе хека", "berlam fileto", MEAT, (17, 1.5, 0), [["філе", 120]], {}),
    "whole":    ("Курка ціла", "bütün tavuk", MEAT, (9.5, 2, 0), [["курки", 1800]], {"shop": "pcs", "piece": 1800, "pieceName": "шт (≈1,8 кг)"}),
    "egg":      ("Яйця", "yumurta", DAIRY, (12.6, 10, 0.7), [["шт", 55]], {"shop": "egg"}),
    "white":    ("Яєчні білки (з тих самих яєць)", "yumurta akı", DAIRY, (11, 0.2, 0.7), [["білок", 33]], {"shop": "egg"}),
    "yogurt":   ("Йогурт напівжирний", "yarım yağlı yoğurt", DAIRY, (4.2, 1.5, 5), [["скл.", 250], ["ст. л.", 25]], {}),
    "cottage":  ("Сир лор", "lor peyniri", DAIRY, (12, 3.9, 3), [["скл.", 200], ["ст. л.", 20]], {"pack": 500, "packName": "пачки по 500 г"}),
    "kefir":    ("Кефір", "kefir", DAIRY, (3.3, 1.5, 4), [["скл.", 250]], {"shop": "ml"}),
    "milk":     ("Молоко напівжирне", "yarım yağlı süt", DAIRY, (3.2, 1.5, 4.8), [["скл.", 250], ["ст. л.", 15]], {"shop": "ml"}),
    "oats":     ("Вівсяні пластівці", "yulaf ezmesi", GRAIN, (13, 6.5, 60), [["скл.", 90], ["ст. л.", 10]], {}),
    "bulgur":   ("Булгур великий", "pilavlık bulgur", GRAIN, (12, 1.3, 63), [["скл.", 170], ["ст. л.", 17]], {}),
    "buck":     ("Гречка", "karabuğday", GRAIN, (12.6, 3.3, 62), [["скл.", 180], ["ст. л.", 15]], {}),
    "rice":     ("Рис", "pirinç (baldo)", GRAIN, (7, 0.6, 78), [["скл.", 200], ["ст. л.", 20]], {}),
    "lentil":   ("Сочевиця червона", "kırmızı mercimek", GRAIN, (24, 1.5, 50), [["скл.", 190], ["ст. л.", 20]], {}),
    "pasta":    ("Макарони", "makarna", GRAIN, (12, 1.3, 70), [["скл.", 100]], {}),
    "noodle":   ("Вермішель", "tel şehriye", GRAIN, (12, 1.5, 71), [["скл.", 80], ["ст. л.", 10]], {}),
    "bread":    ("Хліб цільнозерновий", "tam buğday ekmeği", GRAIN, (8.7, 2.5, 41), [["скибка", 30]], {}),
    "lavash":   ("Лаваш цільнозерновий", "tam buğday lavaş", GRAIN, (9, 1.5, 56), [["лаваш", 50]], {}),
    "potato":   ("Картопля", "patates", VEG, (2, 0.1, 16), [["шт сер.", 150]], {}),
    "beet":     ("Буряк", "pancar", VEG, (1.6, 0.1, 8.8), [["шт сер.", 200]], {}),
    "cabbage":  ("Капуста білокачанна", "beyaz lahana", VEG, (1.3, 0.1, 5), [["скл. нашаткованої", 70]], {}),
    "carrot":   ("Морква", "havuç", VEG, (0.9, 0.2, 7), [["шт сер.", 80]], {}),
    "onion":    ("Цибуля", "kuru soğan", VEG, (1.1, 0.1, 8), [["шт сер.", 100]], {}),
    "zucchini": ("Кабачки", "kabak", VEG, (1.2, 0.3, 3), [["шт сер.", 300]], {}),
    "pepper":   ("Перець солодкий", "kapya biber", VEG, (1, 0.3, 5), [["шт", 150]], {}),
    "broccoli": ("Броколі", "brokoli", VEG, (2.8, 0.4, 4), [["скл. суцвіть", 90]], {}),
    "cuke":     ("Огірки", "salatalık", VEG, (0.7, 0.1, 3), [["шт сер.", 120]], {}),
    "tomato":   ("Помідори", "domates", VEG, (0.9, 0.2, 3.9), [["шт сер.", 120]], {}),
    "spinach":  ("Шпинат", "ıspanak", VEG, (2.9, 0.4, 1.5), [["жменя", 30]], {}),
    "mush":     ("Печериці", "kültür mantarı", VEG, (3.1, 0.3, 3.3), [["скл. нарізаних", 70]], {}),
    "pumpkin":  ("Гарбуз", "bal kabağı", VEG, (1, 0.1, 6.5), [["скл. кубиків", 140]], {}),
    "banana":   ("Банани", "muz", FRUIT, (1.1, 0.3, 23), [["шт", 120]], {}),
    "apple":    ("Яблука", "elma", FRUIT, (0.3, 0.2, 12), [["шт сер.", 180]], {}),
    "berries":  ("Ягоди заморожені", "dondurulmuş orman meyvesi", FRUIT, (0.8, 0.4, 10), [["скл.", 140], ["жменя", 50]], {}),
    "lemon":    ("Лимон", "limon", FRUIT, (1, 0.3, 6), [["лимон", 80]], {"shop": "pcs", "piece": 80, "pieceName": "шт"}),
    "oil":      ("Олія оливкова", "zeytinyağı", PANTRY, (0, 100, 0), [["ст. л.", 14], ["ч. л.", 5]], {}),
    "honey":    ("Мед", "bal", PANTRY, (0.3, 0, 82), [["ст. л.", 21], ["ч. л.", 7]], {}),
    "tpaste":   ("Томатна паста", "domates salçası", PANTRY, (4.3, 0.5, 19), [["ст. л.", 20], ["ч. л.", 7]], {}),
    "tcan":     ("Томати різані в банці", "doğranmış domates konservesi", PANTRY, (1.1, 0.2, 4), [["банка", 400], ["скл.", 250]], {"shop": "can", "piece": 400, "pieceName": "банка по 400 г"}),
    "chick":    ("Нут варений у банці", "haşlanmış nohut", PANTRY, (7, 2.5, 14), [["скл.", 160], ["ст. л.", 15]], {"shop": "can", "piece": 240, "pieceName": "банка ≈400 г"}),
    "tuna":     ("Тунець у власному соку", "ton balığı (suda)", PANTRY, (25, 1, 0), [["банка", 120]], {"shop": "can", "piece": 120, "pieceName": "банка ≈160 г"}),
}

SPICES = [
    "Сіль, перець", "Часник", "Паприка", "Зіра", "Лавровий лист",
    "Червоний перець пластівцями — pul biber", "Кориця (за бажанням)",
]
