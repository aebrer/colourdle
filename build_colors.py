#!/usr/bin/env python3
"""
Compile colour databases from multiple sources into a single JS file.
Sources: CSS/X11, Crayola, Pantone, XKCD survey, Japanese traditional, RAL.
"""
import json
import re
import urllib.request

def fetch_json(url):
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read())

def title_case_name(name):
    """Convert 'dark-blue' or 'dark blue' to 'Dark Blue'."""
    return name.replace('-', ' ').replace('_', ' ').strip().title()

def normalize_hex(h):
    """Ensure hex is uppercase 6-digit with #."""
    h = h.strip()
    if not h.startswith('#'):
        h = '#' + h
    h = h.upper()
    if len(h) == 4:  # #RGB -> #RRGGBB
        h = '#' + h[1]*2 + h[2]*2 + h[3]*2
    return h

def collect_css_colors():
    """All 148 CSS named colors."""
    # Hardcoded for accuracy - these are standardized
    css = {
        "AliceBlue":"#F0F8FF","AntiqueWhite":"#FAEBD7","Aqua":"#00FFFF",
        "Aquamarine":"#7FFFD4","Azure":"#F0FFFF","Beige":"#F5F5DC",
        "Bisque":"#FFE4C4","Black":"#000000","BlanchedAlmond":"#FFEBCD",
        "Blue":"#0000FF","BlueViolet":"#8A2BE2","Brown":"#A52A2A",
        "BurlyWood":"#DEB887","CadetBlue":"#5F9EA0","Chartreuse":"#7FFF00",
        "Chocolate":"#D2691E","Coral":"#FF7F50","CornflowerBlue":"#6495ED",
        "Cornsilk":"#FFF8DC","Crimson":"#DC143C","Cyan":"#00FFFF",
        "DarkBlue":"#00008B","DarkCyan":"#008B8B","DarkGoldenRod":"#B8860B",
        "DarkGray":"#A9A9A9","DarkGreen":"#006400","DarkKhaki":"#BDB76B",
        "DarkMagenta":"#8B008B","DarkOliveGreen":"#556B2F","DarkOrange":"#FF8C00",
        "DarkOrchid":"#9932CC","DarkRed":"#8B0000","DarkSalmon":"#E9967A",
        "DarkSeaGreen":"#8FBC8F","DarkSlateBlue":"#483D8B","DarkSlateGray":"#2F4F4F",
        "DarkTurquoise":"#00CED1","DarkViolet":"#9400D3","DeepPink":"#FF1493",
        "DeepSkyBlue":"#00BFFF","DimGray":"#696969","DodgerBlue":"#1E90FF",
        "FireBrick":"#B22222","FloralWhite":"#FFFAF0","ForestGreen":"#228B22",
        "Fuchsia":"#FF00FF","Gainsboro":"#DCDCDC","GhostWhite":"#F8F8FF",
        "Gold":"#FFD700","GoldenRod":"#DAA520","Gray":"#808080",
        "Green":"#008000","GreenYellow":"#ADFF2F","HoneyDew":"#F0FFF0",
        "HotPink":"#FF69B4","IndianRed":"#CD5C5C","Indigo":"#4B0082",
        "Ivory":"#FFFFF0","Khaki":"#F0E68C","Lavender":"#E6E6FA",
        "LavenderBlush":"#FFF0F5","LawnGreen":"#7CFC00","LemonChiffon":"#FFFACD",
        "LightBlue":"#ADD8E6","LightCoral":"#F08080","LightCyan":"#E0FFFF",
        "LightGoldenRodYellow":"#FAFAD2","LightGray":"#D3D3D3","LightGreen":"#90EE90",
        "LightPink":"#FFB6C1","LightSalmon":"#FFA07A","LightSeaGreen":"#20B2AA",
        "LightSkyBlue":"#87CEFA","LightSlateGray":"#778899","LightSteelBlue":"#B0C4DE",
        "LightYellow":"#FFFFE0","Lime":"#00FF00","LimeGreen":"#32CD32",
        "Linen":"#FAF0E6","Magenta":"#FF00FF","Maroon":"#800000",
        "MediumAquaMarine":"#66CDAA","MediumBlue":"#0000CD","MediumOrchid":"#BA55D3",
        "MediumPurple":"#9370DB","MediumSeaGreen":"#3CB371","MediumSlateBlue":"#7B68EE",
        "MediumSpringGreen":"#00FA9A","MediumTurquoise":"#48D1CC","MediumVioletRed":"#C71585",
        "MidnightBlue":"#191970","MintCream":"#F5FFFA","MistyRose":"#FFE4E1",
        "Moccasin":"#FFE4B5","NavajoWhite":"#FFDEAD","Navy":"#000080",
        "OldLace":"#FDF5E6","Olive":"#808000","OliveDrab":"#6B8E23",
        "Orange":"#FFA500","OrangeRed":"#FF4500","Orchid":"#DA70D6",
        "PaleGoldenRod":"#EEE8AA","PaleGreen":"#98FB98","PaleTurquoise":"#AFEEEE",
        "PaleVioletRed":"#DB7093","PapayaWhip":"#FFEFD5","PeachPuff":"#FFDAB9",
        "Peru":"#CD853F","Pink":"#FFC0CB","Plum":"#DDA0DD",
        "PowderBlue":"#B0E0E6","Purple":"#800080","RebeccaPurple":"#663399",
        "Red":"#FF0000","RosyBrown":"#BC8F8F","RoyalBlue":"#4169E1",
        "SaddleBrown":"#8B4513","Salmon":"#FA8072","SandyBrown":"#F4A460",
        "SeaGreen":"#2E8B57","SeaShell":"#FFF5EE","Sienna":"#A0522D",
        "Silver":"#C0C0C0","SkyBlue":"#87CEEB","SlateBlue":"#6A5ACD",
        "SlateGray":"#708090","Snow":"#FFFAFA","SpringGreen":"#00FF7F",
        "SteelBlue":"#4682B4","Tan":"#D2B48C","Teal":"#008080",
        "Thistle":"#D8BFD8","Tomato":"#FF6347","Turquoise":"#40E0D0",
        "Violet":"#EE82EE","Wheat":"#F5DEB3","White":"#FFFFFF",
        "WhiteSmoke":"#F5F5F5","Yellow":"#FFFF00","YellowGreen":"#9ACD32",
    }
    # Split CamelCase into spaces
    result = []
    for name, hex_val in css.items():
        spaced = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', name)
        result.append((spaced, hex_val))
    return result

def collect_crayola():
    """Crayola colors - standard + specialty sets."""
    colors = [
        # Standard 120 box
        ("Red","#ED0A3F"),("Maroon","#C32148"),("Scarlet","#FD0E35"),
        ("Brick Red","#C62D42"),("English Vermilion","#CC474B"),("Madder Lake","#CC3336"),
        ("Permanent Geranium Lake","#E12C2C"),("Maximum Red","#D92121"),
        ("Indian Red","#B94E48"),("Orange Red","#FF5349"),("Sunset Orange","#FE4C40"),
        ("Bittersweet","#FE6F5E"),("Dark Venetian Red","#B33B24"),
        ("Venetian Red","#CC553D"),("Light Venetian Red","#E6735C"),
        ("Vivid Tangerine","#FF9980"),("Middle Red","#E58E73"),
        ("Burnt Orange","#FF7034"),("Red Orange","#FF681F"),("Orange","#FF8833"),
        ("Macaroni and Cheese","#FFB97B"),("Middle Yellow Red","#ECB176"),
        ("Mango Tango","#E77200"),("Yellow Orange","#FFAE42"),
        ("Maximum Yellow Red","#F2BA49"),("Banana Mania","#FBE7B2"),
        ("Maize","#F2C649"),("Orange Yellow","#F8D568"),("Goldenrod","#FCD667"),
        ("Dandelion","#FED85D"),("Yellow","#FBE870"),("Green Yellow","#F1E788"),
        ("Middle Yellow","#FFEB00"),("Olive Green","#B5B35C"),
        ("Spring Green","#ECEBBD"),("Maximum Yellow","#FAFA37"),
        ("Canary","#FFFF99"),("Lemon Yellow","#FFFF9F"),
        ("Maximum Green Yellow","#D9E650"),("Middle Green Yellow","#ACBF60"),
        ("Inchworm","#AFE313"),("Light Chrome Green","#BEE64B"),
        ("Yellow Green","#C5E17A"),("Maximum Green","#5E8C31"),
        ("Asparagus","#7BA05B"),("Granny Smith Apple","#9DE093"),
        ("Fern","#63B76C"),("Middle Green","#4D8C57"),("Green","#3AA655"),
        ("Medium Chrome Green","#6CA67C"),("Forest Green","#5FA777"),
        ("Sea Green","#93DFB8"),("Shamrock","#33CC99"),
        ("Mountain Meadow","#1AB385"),("Jungle Green","#29AB87"),
        ("Caribbean Green","#00CC99"),("Tropical Rain Forest","#00755E"),
        ("Middle Blue Green","#8DD9CC"),("Pine Green","#01786F"),
        ("Maximum Blue Green","#30BFBF"),("Robin's Egg Blue","#00CCCC"),
        ("Teal Blue","#008080"),("Light Blue","#8FD8D8"),
        ("Aquamarine","#95E0E8"),("Turquoise Blue","#6CDAE7"),
        ("Outer Space","#2D383A"),("Sky Blue","#76D7EA"),
        ("Middle Blue","#7ED4E6"),("Blue Green","#0095B7"),
        ("Pacific Blue","#009DC4"),("Cerulean","#02A4D3"),
        ("Maximum Blue","#47ABCC"),("Blue I","#4997D0"),
        ("Cerulean Blue","#339ACC"),("Cornflower","#93CCEA"),
        ("Green Blue","#2887C8"),("Midnight Blue","#00468C"),
        ("Navy Blue","#0066CC"),("Denim","#1560BD"),("Blue III","#0066FF"),
        ("Cadet Blue","#A9B2C3"),("Periwinkle","#C3CDE6"),
        ("Blue II","#4570E6"),("Wild Blue Yonder","#7A89B8"),
        ("Indigo","#4F69C6"),("Manatee","#8D90A1"),
        ("Cobalt Blue","#8C90C8"),("Celestial Blue","#7070CC"),
        ("Blue Bell","#9999CC"),("Maximum Blue Purple","#ACACE6"),
        ("Violet Blue","#766EC8"),("Blue Violet","#6456B7"),
        ("Ultramarine Blue","#3F26BF"),("Middle Blue Purple","#8B72BE"),
        ("Purple Heart","#652DC1"),("Royal Purple","#6B3FA0"),
        ("Violet II","#8359A3"),("Medium Violet","#8F47B3"),
        ("Wisteria","#C9A0DC"),("Lavender I","#BF8FCC"),
        ("Vivid Violet","#803790"),("Maximum Purple","#733380"),
        ("Purple Mountains Majesty","#D6AEDD"),("Fuchsia","#C154C1"),
        ("Pink Flamingo","#FC74FD"),("Violet I","#732E6C"),
        ("Brilliant Rose","#E667CE"),("Orchid","#E29CD2"),
        ("Plum","#8E3179"),("Medium Rose","#D96CBE"),
        ("Thistle","#EBB0D7"),("Mulberry","#C8509B"),
        ("Red Violet","#BB3385"),("Middle Purple","#D982B5"),
        ("Maximum Red Purple","#A63A79"),("Jazzberry Jam","#A50B5E"),
        ("Eggplant","#614051"),("Magenta","#F653A6"),
        ("Cerise","#DA3287"),("Wild Strawberry","#FF3399"),
        ("Lavender II","#FBAED2"),("Cotton Candy","#FFB7D5"),
        ("Carnation Pink","#FFA6C9"),("Violet Red","#F7468A"),
        ("Razzmatazz","#E30B5C"),("Pig Pink","#FDD7E4"),
        ("Carmine","#E62E6B"),("Blush","#DB5079"),
        ("Tickle Me Pink","#FC80A5"),("Mauvelous","#F091A9"),
        ("Salmon","#FF91A4"),("Middle Red Purple","#A55353"),
        ("Mahogany","#CA3435"),("Melon","#FEBAAD"),
        ("Pink Sherbert","#F7A38E"),("Burnt Sienna","#E97451"),
        ("Brown","#AF593E"),("Sepia","#9E5B40"),
        ("Fuzzy Wuzzy","#87421F"),("Beaver","#926F5B"),
        ("Tumbleweed","#DEA681"),("Raw Sienna","#D27D46"),
        ("Van Dyke Brown","#664228"),("Tan","#D99A6C"),
        ("Desert Sand","#EDC9AF"),("Peach","#FFCBA4"),
        ("Burnt Umber","#805533"),("Apricot","#FDD5B1"),
        ("Almond","#EED9C4"),("Raw Umber","#665233"),
        ("Shadow","#837050"),("Raw Sienna I","#E6BC5C"),
        ("Timberwolf","#D9D6CF"),("Gold I","#92926E"),
        ("Gold II","#E6BE8A"),("Silver","#C9C0BB"),
        ("Copper","#DA8A67"),("Antique Brass","#C88A65"),
        ("Black","#000000"),("Charcoal Gray","#736A62"),
        ("Gray","#8B8680"),("Blue Gray","#C8C8CD"),
        # Fluorescent
        ("Radical Red","#FF355E"),("Wild Watermelon","#FD5B78"),
        ("Outrageous Orange","#FF6037"),("Atomic Tangerine","#FF9966"),
        ("Neon Carrot","#FF9933"),("Sunglow","#FFCC33"),
        ("Laser Lemon","#FFFF66"),("Unmellow Yellow","#FFFF66"),
        ("Electric Lime","#CCFF00"),("Screamin Green","#66FF66"),
        ("Magic Mint","#AAF0D1"),("Blizzard Blue","#50BFE6"),
        ("Shocking Pink","#FF6EFF"),("Razzle Dazzle Rose","#EE34D2"),
        ("Hot Magenta","#FF00CC"),("Purple Pizzazz","#FF00CC"),
        # Metallic
        ("Alloy Orange","#C46210"),("Bdazzled Blue","#2E5894"),
        ("Big Dip O Ruby","#9C2542"),("Bittersweet Shimmer","#BF4F51"),
        ("Blast Off Bronze","#A57164"),("Cyber Grape","#58427C"),
        ("Deep Space Sparkle","#4A646C"),("Gold Fusion","#85754E"),
        ("Illuminating Emerald","#319177"),("Metallic Seaweed","#0A7E8C"),
        ("Metallic Sunburst","#9C7C38"),("Razzmic Berry","#8D4E85"),
        ("Sheen Green","#8FD400"),("Shimmering Blush","#D98695"),
        ("Sonic Silver","#757575"),("Steel Blue","#0081AB"),
        # Scary scents
        ("Alien Armpit","#84DE02"),("Big Foot Feet","#E88E5A"),
        ("Booger Buster","#DDE26A"),("Dingy Dungeon","#C53151"),
        ("Gargoyle Gas","#FFDF46"),("Giants Club","#B05C52"),
        ("Magic Potion","#FF4466"),("Mummys Tomb","#828E84"),
        ("Ogre Odor","#FD5240"),("Pixie Powder","#391285"),
        ("Princess Perfume","#FF85CF"),("Sasquatch Socks","#FF4681"),
        ("Sea Serpent","#4BC7CF"),("Smashed Pumpkin","#FF6D3A"),
        ("Sunburnt Cyclops","#FF404C"),("Winter Wizard","#A0E6FF"),
        # Gem tones
        ("Amethyst","#64609A"),("Citrine","#933709"),
        ("Emerald","#14A989"),("Jade","#469A84"),
        ("Jasper","#D05340"),("Lapis Lazuli","#436CB9"),
        ("Malachite","#469496"),("Moonstone","#3AA8C1"),
        ("Onyx","#353839"),("Peridot","#ABAD48"),
        ("Pink Pearl","#B07080"),("Rose Quartz","#BD559C"),
        ("Ruby","#AA4069"),("Sapphire","#2D5DA1"),
        ("Smokey Topaz","#832A0D"),("Tigers Eye","#B56917"),
    ]
    return colors

def collect_xkcd():
    """XKCD color survey - 954 crowdsourced color names."""
    url = "https://xkcd.com/color/rgb.txt"
    try:
        with urllib.request.urlopen(url) as r:
            text = r.read().decode('utf-8')
    except Exception:
        return []

    colors = []
    for line in text.strip().split('\n'):
        if line.startswith('#') or not line.strip():
            continue
        parts = [p for p in line.split('\t') if p.strip()]
        if len(parts) >= 2:
            name, hex_val = parts[0], parts[1]
            colors.append((title_case_name(name.strip()), normalize_hex(hex_val.strip())))
    return colors

def collect_pantone():
    """Pantone colors from GitHub repo."""
    url = "https://raw.githubusercontent.com/Margaret2/pantone-colors/master/pantone-colors.json"
    try:
        data = fetch_json(url)
        names = data.get('names', [])
        values = data.get('values', [])
        return [(title_case_name(n), normalize_hex(v)) for n, v in zip(names, values)]
    except Exception:
        return []

def collect_japanese():
    """Japanese traditional colors."""
    # Curated set from the 228 traditional Japanese colors
    colors = [
        ("Sakura","#FCCB9"),("Koubai","#DB5A6B"),("Nakabeni","#C93756"),
        ("Taikoh","#FFB3A7"),("Karakurenai","#C91F37"),("Enji","#9D2933"),
        ("Akebono","#FA7B62"),("Sango","#F8674F"),("Shoujouhi","#DC3023"),
        ("Benihi","#F35336"),("Hi","#CF3A24"),("Shishi","#F9906F"),
        ("Shuiro","#FF3500"),("Kitsune","#985629"),("Kohaku","#CA6924"),
        ("Kuchiba","#D57835"),("Kincha","#C66B27"),("Yamabuki","#FFA400"),
        ("Kuchinashi","#FFB95A"),("Ukon","#E69B3A"),("Nanohana","#E3B130"),
        ("Kariyasu","#E2B13C"),("Kihada","#F3C13A"),("Ominaeshi","#D9B611"),
        ("Uguisu","#645530"),("Hiwa","#BDA928"),("Moegi","#5B8930"),
        ("Matsu","#454D32"),("Wakatake","#6B9362"),("Midori","#2A603B"),
        ("Rokushou","#407A52"),("Aotake","#006442"),("Seiji","#819C8B"),
        ("Mizuasagi","#749F8D"),("Tetsu","#2B3733"),("Mizu","#86ABA5"),
        ("Asagi","#48929B"),("Shinbashi","#006C7F"),("Hanada","#1D697C"),
        ("Chigusa","#317589"),("Sora","#4D8FAC"),("Gunjou","#5D8CAE"),
        ("Kon","#192236"),("Ruri","#1F4788"),("Fuji","#89729E"),
        ("Sumire","#5B3256"),("Murasaki","#4F284B"),("Botan","#A4345D"),
        ("Shironeri","#FFDDCA"),("Shiranezumi","#B9A193"),("Ginnezumi","#97867C"),
        ("Sunezumi","#6E5F57"),("Kuro","#171412"),("Aijiro","#EBF6F7"),
    ]
    return [(n, normalize_hex(h)) for n, h in colors]

def collect_ral():
    """RAL industrial colors."""
    colors = [
        ("Green Beige","#CDBA88"),("Sand Yellow","#D2AA6D"),
        ("Signal Yellow","#F9A800"),("Golden Yellow","#E49E00"),
        ("Honey Yellow","#CB8E00"),("Maize Yellow","#E29000"),
        ("Daffodil Yellow","#E88C00"),("Brown Beige","#AF804F"),
        ("Lemon Yellow","#DDAF27"),("Oyster White","#E3D9C6"),
        ("Sulfur Yellow","#F1DD38"),("Saffron Yellow","#F6A950"),
        ("Zinc Yellow","#FACA30"),("Grey Beige","#A48F7A"),
        ("Olive Yellow","#A08F65"),("Colza Yellow","#F6B600"),
        ("Traffic Yellow","#F7B500"),("Ochre Yellow","#BA8F4C"),
        ("Curry","#A77F0E"),("Melon Yellow","#FF9B00"),
        ("Broom Yellow","#E2A300"),("Dahlia Yellow","#F99A1C"),
        ("Pastel Yellow","#EB9C52"),("Pearl Beige","#908370"),
        ("Pearl Gold","#80643F"),("Sun Yellow","#F09200"),
        ("Yellow Orange","#DA6E00"),("Red Orange","#BA481B"),
        ("Vermilion","#BF3922"),("Pastel Orange","#F67828"),
        ("Pure Orange","#E25303"),("Bright Red Orange","#ED6B21"),
        ("Traffic Orange","#DE5307"),("Signal Orange","#D05D28"),
        ("Deep Orange","#E26E0E"),("Salmon Orange","#D5654D"),
        ("Pearl Orange","#923E25"),("Flame Red","#A72920"),
        ("Signal Red","#9B2423"),("Carmine Red","#9B2321"),
        ("Ruby Red","#861A22"),("Purple Red","#6B1C23"),
        ("Wine Red","#59191F"),("Black Red","#3E2022"),
        ("Oxide Red","#6D342D"),("Brown Red","#792423"),
        ("Beige Red","#C6846D"),("Tomato Red","#972E25"),
        ("Antique Pink","#CB7375"),("Light Pink","#D8A0A6"),
        ("Coral Red","#A63D2F"),("Rose","#CB555D"),
        ("Strawberry Red","#C73F4A"),("Traffic Red","#BB1E10"),
        ("Salmon Pink","#CF6955"),("Raspberry Red","#AB273C"),
        ("Pure Red","#CC2C24"),("Orient Red","#A63437"),
        ("Pearl Ruby Red","#701D23"),("Pearl Pink","#A53A2D"),
        ("Red Lilac","#816183"),("Red Violet","#8D3C4B"),
        ("Heather Violet","#C4618C"),("Claret Violet","#651E38"),
        ("Blue Lilac","#76689A"),("Traffic Purple","#903373"),
        ("Purple Violet","#47243C"),("Signal Violet","#844C82"),
        ("Pastel Violet","#9D8692"),("Telemagenta","#BC4077"),
        ("Pearl Violet","#6E6387"),("Pearl Blackberry","#6B6B7F"),
        ("Violet Blue","#314F6F"),("Green Blue","#0F4C64"),
        ("Ultramarine Blue","#00387B"),("Sapphire Blue","#1F3855"),
        ("Black Blue","#191E28"),("Signal Blue","#005387"),
        ("Brilliant Blue","#376B8C"),("Grey Blue","#2B3A44"),
        ("Azure Blue","#225F78"),("Gentian Blue","#004F7C"),
        ("Steel Blue","#1A2B3C"),("Light Blue","#0089B6"),
        ("Cobalt Blue","#193153"),("Pigeon Blue","#637D96"),
        ("Sky Blue","#007CB0"),("Traffic Blue","#005B8C"),
        ("Turquoise Blue","#058B8C"),("Capri Blue","#005E83"),
        ("Ocean Blue","#00414B"),("Water Blue","#007577"),
        ("Night Blue","#222D5A"),("Distant Blue","#42698C"),
        ("Pastel Blue","#6093AC"),("Patina Green","#3C7460"),
        ("Emerald Green","#366735"),("Leaf Green","#325928"),
        ("Olive Green","#50533C"),("Blue Green","#024442"),
        ("Moss Green","#114232"),("Grey Olive","#3C392E"),
        ("Bottle Green","#2C3222"),("Brown Green","#37342A"),
        ("Fir Green","#27352A"),("Grass Green","#4D6F39"),
        ("Reseda Green","#6C7C59"),("Black Green","#303D3A"),
        ("Reed Green","#7D765A"),("Yellow Olive","#474135"),
        ("Black Olive","#3D3D36"),("Turquoise Green","#00694C"),
        ("May Green","#587F40"),("Yellow Green","#61993B"),
        ("Pastel Green","#B9CEAC"),("Chrome Green","#37422F"),
        ("Pale Green","#8A9977"),("Olive Drab","#3A3327"),
        ("Traffic Green","#008351"),("Fern Green","#5E6E3B"),
        ("Opal Green","#005F4E"),("Light Green","#7EBAB5"),
        ("Pine Green","#315442"),("Mint Green","#006F3D"),
        ("Signal Green","#237F52"),("Mint Turquoise","#46877F"),
        ("Pastel Turquoise","#7AACAC"),("Pearl Green","#194D25"),
        ("Pure Green","#008B29"),("Squirrel Grey","#7A888E"),
        ("Silver Grey","#8C969D"),("Olive Grey","#817863"),
        ("Moss Grey","#7A7669"),("Signal Grey","#9B9B9B"),
        ("Mouse Grey","#6C6E6B"),("Beige Grey","#766A5E"),
        ("Khaki Grey","#745E3D"),("Green Grey","#5D6058"),
        ("Tarpaulin Grey","#585C56"),("Iron Grey","#52595D"),
        ("Basalt Grey","#575D5E"),("Brown Grey","#575044"),
        ("Slate Grey","#4F5358"),("Anthracite Grey","#383E42"),
        ("Black Grey","#2F3234"),("Umbra Grey","#4C4A44"),
        ("Concrete Grey","#808076"),("Graphite Grey","#45494E"),
        ("Granite Grey","#374345"),("Stone Grey","#928E85"),
        ("Blue Grey","#5B686D"),("Pebble Grey","#B5B0A1"),
        ("Cement Grey","#7F8274"),("Yellow Grey","#92886F"),
        ("Light Grey","#C5C7C4"),("Platinum Grey","#979392"),
        ("Dusty Grey","#7A7B7A"),("Agate Grey","#B0B0A9"),
        ("Quartz Grey","#6B665E"),("Window Grey","#989EA1"),
        ("Silk Grey","#B7B3A8"),("Green Brown","#89693E"),
        ("Ochre Brown","#9D622B"),("Signal Brown","#794D3E"),
        ("Clay Brown","#7E4B26"),("Copper Brown","#8D4931"),
        ("Fawn Brown","#70452A"),("Olive Brown","#724A25"),
        ("Nut Brown","#5A3826"),("Red Brown","#66332B"),
        ("Sepia Brown","#4A3526"),("Chestnut Brown","#5E2F26"),
        ("Mahogany Brown","#4C2B20"),("Chocolate Brown","#442F29"),
        ("Grey Brown","#3D3635"),("Black Brown","#1A1718"),
        ("Orange Brown","#A45729"),("Beige Brown","#795038"),
        ("Pale Brown","#755847"),("Terra Brown","#513A2A"),
        ("Pearl Copper","#7F4031"),("Cream","#E9E0D2"),
        ("Grey White","#D7D5CB"),("Signal White","#ECECE7"),
        ("Signal Black","#2B2B2C"),("Jet Black","#0E0E10"),
        ("White Aluminium","#A1A1A0"),("Grey Aluminium","#878581"),
        ("Pure White","#F1ECE1"),("Graphite Black","#27292B"),
        ("Traffic White","#F1F0EA"),("Traffic Black","#2A292A"),
        ("Papyrus White","#C8CBC4"),
    ]
    return colors

def main():
    print("Collecting colours from all sources...")

    all_colours = []
    seen_names = set()

    def add_source(source_name, colours):
        count = 0
        for colour_name, hex_val in colours:
            key = colour_name.lower().strip()
            if key in seen_names or not key:
                continue
            hex_val = normalize_hex(hex_val)
            if len(hex_val) != 7:
                continue
            seen_names.add(key)
            all_colours.append((colour_name, hex_val, source_name))
            count += 1
        print(f"  {source_name}: {count} unique colours added")

    # CSS/X11 dropped — names poorly match their actual colours (e.g. "Lavender" is white)
    # add_source("CSS/X11", collect_css_colors())
    # Priority order: Crayola > Pantone > XKCD > Japanese > RAL
    # First seen wins on name collisions
    add_source("Crayola", collect_crayola())

    print("  Fetching Pantone colours...")
    add_source("Pantone", collect_pantone())

    print("  Fetching XKCD survey colours...")
    add_source("XKCD", collect_xkcd())

    add_source("Japanese", collect_japanese())
    add_source("RAL", collect_ral())

    # Sort alphabetically
    all_colours.sort(key=lambda x: x[0].lower())

    print(f"\nTotal unique colours: {len(all_colours)}")

    # Generate JS
    lines = ["// Auto-generated colour database — DO NOT EDIT MANUALLY",
             f"// {len(all_colours)} colours from CSS, Crayola, XKCD, Pantone, Japanese, RAL",
             "// Run: python3 build_colors.py",
             "",
             "const COLOURS = ["]

    for name, hex_val, source in all_colours:
        safe_name = name.replace("'", "\\'")
        lines.append(f"  {{name:'{safe_name}',hex:'{hex_val}',src:'{source}'}},")

    lines.append("];")

    with open("colors.js", "w") as f:
        f.write('\n'.join(lines) + '\n')

    print(f"Written to colors.js ({len(all_colours)} colours)")

if __name__ == '__main__':
    main()
