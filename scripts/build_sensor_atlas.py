"""Draw a static SVG sensor inventory from public asset metadata only."""
import csv
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "diagrams"
OUT.mkdir(exist_ok=True)
assets = list(csv.DictReader((ROOT / "vendor/benchmark/data/full/assets.csv").open()))
columns = [
    ("Pвх", "suction_pressure_kpa"), ("Pвых", "discharge_pressure_kpa"),
    ("Tж", "fluid_temp_c"), ("Q", "flow_m3_h"),
    ("I", "motor_current_a"), ("W", "motor_power_kw"), ("n", "motor_speed_rpm"),
    ("Tоб", "motor_winding_temp_c"), ("V × 3", "vibration_rms_mm_s"),
    ("Tп", "bearing_temp_c"), ("x", "valve_position_pct"), ("Tвоз", "ambient_temp_c")]
profiles = {"SHIP_SW_COOLING": "Морская вода", "SHIP_LT_FRESHWATER": "Пресная вода LT",
            "INDUSTRIAL_CW": "Промышленное CW", "PROCESS_TRANSFER": "Горячая вода"}
splits = {"train": "Обучение", "validation": "Проверка", "test": "Тест"}
controls = {"VFD_TEMPERATURE": "VFD · T", "VFD_PRESSURE": "VFD · P", "FIXED_SPEED": "Постоянная", "FLOW_VALVE": "Клапан"}
parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1160" viewBox="0 0 1800 1160">',
         '<rect width="1800" height="1160" fill="#ffffff"/>',
         '<style>text{font-family:Arial,DejaVu Sans,sans-serif;fill:#183344} .secondary{fill:#536774}</style>']


def text(x,y,s,size=19,fill=None,anchor="start",weight=400):
    attr = f' fill="{fill}"' if fill else ''
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}"{attr}>{escape(str(s))}</text>')


text(46,62,"RETROFIT DOCTOR  /  ОСНАЩЕНИЕ 12 НАСОСОВ",31,weight=600)
text(46,102,"12 независимых модельных контуров на 6 условных объектах. Соединения в пары не заданы.",22)
text(46,137,"Число в ячейке — штатный интервал нового измерения. «—» означает, что измеряемого канала нет.",19)
headers = [(46,"Насос"),(194,"Контур / объект"),(438,"Выборка"),(565,"Уровень"),(662,"Управление")]
for x,h in headers:text(x,194,h,18,weight=600)
colx=[818+i*80 for i in range(len(columns))]
for x,(name,_) in zip(colx,columns):text(x,194,name,18,anchor="middle",weight=600)
exports=[]
for i,a in enumerate(assets):
    y=230+i*52
    is_test=a['split']=='test'
    if is_test:parts.append(f'<rect x="34" y="{y-21}" width="1732" height="50" fill="#edf4fa"/>')
    parts.append(f'<line x1="34" y1="{y+29}" x2="1766" y2="{y+29}" stroke="#dce4e8"/>')
    text(46,y,a['asset_id'],20,weight=600 if is_test else 400)
    site=a['site'].split(' (')[0].replace('Vessel','Судно').replace('Plant','Завод')
    text(194,y-4,profiles[a['profile']],18)
    text(194,y+18,site,15)
    text(438,y,splits[a['split']],18)
    text(565,y,a['instrumentation_tier'][:2],19)
    text(662,y,controls[a['control']],16)
    available=set(a['channels_available'].split('|'))
    record={"asset_id":a['asset_id'],"site":site,"profile":a['profile'],"split":a['split'],"tier":a['instrumentation_tier']}
    for x,(name,col) in zip(colx,columns):
        value='—'
        if col in available:
            value='10 с' if col=='ambient_temp_c' else '5 мин' if a['wireless_update_s'] and col in ['vibration_rms_mm_s','bearing_temp_c'] else '1 с'
        text(x,y,value,18,anchor="middle")
        record[col]=value
    exports.append(record)

legends=[
 "Pвх — перед насосом, после входного фильтра; Pвых — после насоса. Это не перепад давления на фильтре или теплообменнике.",
 "Tж — жидкость у насоса (точная врезка не задана); Q — расход в трубе; x — обратная связь положения клапана.",
 "I — ток мотора; W — электрическая мощность; n — измеряемые обороты привода; Tоб — температура обмотки мотора.",
 "V × 3 — виброскорость RMS, виброускорение RMS и пик-фактор на подшипниковом корпусе насоса; Tп — его температура.",
 "Tвоз — воздух в помещении. VFD — частотный привод; T/P — управление по температуре/давлению.",
 "V и Tп: T1 — раз в 5 минут, T2 — раз в секунду. Дополнительно у T1/T2 есть виброзаписи раз в 4 часа работы.",
 "Нет полного набора температур на четырёх патрубках теплообменника. Паспортные обороты не равны измеряемому каналу n.",
 "Источник: assets.csv, DATA_DICTIONARY.md и sensors.py из RETROFIT AI 2026. Только паспортные данные, без анализа test-телеметрии."
]
for i,line in enumerate(legends):text(46,902+i*30,line,18 if i<7 else 16)
parts.append('</svg>')
(OUT/'sensor-atlas.svg').write_text('\n'.join(parts))
with (OUT/'sensor-inventory.csv').open('w') as f:
    writer=csv.DictWriter(f,fieldnames=list(exports[0]));writer.writeheader();writer.writerows(exports)
assert len(exports)==12
assert sum(a['split']=='test' for a in assets)==3
assert sum(a['instrumentation_tier']=='T0_LEGACY' for a in assets)==3
assert sum(a['instrumentation_tier']=='T1_RETROFIT' for a in assets)==4
assert sum(a['instrumentation_tier']=='T2_FULL' for a in assets)==5
print(OUT/'sensor-atlas.svg')
