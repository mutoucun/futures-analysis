# -*- coding: utf-8 -*-
"""
按品种统一数据管道：一条命令生成该品种所有合约月份的真实数据 JSON
====================================================================
整合三类数据源，自动按交割月分组，只为有足够历史的月份生成文件：

  1. 上期所逐日缓存 raw/shfe_cache/（2009-2018，每年1-9月交易日的全市场快照，
     含所有上期所品种；注意：10-12月交易日未缓存，早月合约该区间有空缺，
     待 fetch_shfe_history.py 扩展为全年拉取并补抓后可消除）
  2. 郑商所逐日缓存 raw/czce_cache/（2013-2019，全市场快照，3位合约码如 RM309）
  3. 新浪源（2019-今，按合约直取，速度快；大商所品种唯一来源）

清洗规则沿用 merge_mr_data.analyze_contract：
  - 剔除 close<=0 脏行 -> 截断到最后有成交日（交割冻结尾部）-> 报告缺失交易日

用法：
  python scripts/build_symbol.py RB                      # 缓存+新浪，输出到 src/data/futures/
  python scripts/build_symbol.py RB --no-sina            # 仅本地缓存（离线验证，不联网）
  python scripts/build_symbol.py RB --out raw/staging    # 输出到暂存目录（验证用）
  python scripts/build_symbol.py M --min-rows 20         # 单合约最少有效行数阈值

新增品种：在下方 SYMBOLS 中加一行配置即可（交易所/新浪前缀/挂牌月份/单位）。
"""
import argparse
import json
import os
import sys
import time
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(HERE, "..")
RAW_DIR = os.path.join(PROJECT, "raw")
DEFAULT_OUT = os.path.join(PROJECT, "src", "data", "futures")

sys.path.insert(0, HERE)
from merge_mr_data import analyze_contract, fetch_sina_with_volume  # noqa: E402

# 新浪源覆盖范围（更早合约已退市，新浪不可得）
# 结束年取"当前年份+1"：早月合约（尤其01）会提前一年挂牌，
# 如 2026-08 时 2701 合约已上市半年，必须纳入抓取范围
SINA_START, SINA_END = 2019, date.today().year + 1

# 品种配置：exchange 决定本地缓存来源；sina_prefix 为新浪合约代码前缀
# （上期所/大商所/能源中心小写，郑商所/中金所大写，均已实测验证）；
# months 为该品种实际挂牌且流动性集中的主力合约月份
SYMBOLS = {
    # ---- 上期所 SHFE（本地缓存 2009-2018 + 新浪 2019+）----
    "RB": {"name": "螺纹钢", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "rb",
           "months": ["01", "05", "10"]},
    "HC": {"name": "热卷", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "hc",
           "months": ["01", "05", "10"]},
    "SS": {"name": "不锈钢", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "ss",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "WR": {"name": "线材", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "wr",
           "months": ["01", "05", "10"]},
    "CU": {"name": "沪铜", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "cu",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "AL": {"name": "沪铝", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "al",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "ZN": {"name": "沪锌", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "zn",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "PB": {"name": "沪铅", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "pb",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "NI": {"name": "沪镍", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "ni",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "SN": {"name": "沪锡", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "sn",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "AU": {"name": "沪金", "unit": "元/克", "exchange": "SHFE", "sina_prefix": "au",
           "months": ["02", "04", "06", "08", "10", "12"]},
    "AG": {"name": "沪银", "unit": "元/千克", "exchange": "SHFE", "sina_prefix": "ag",
           "months": ["02", "04", "06", "08", "10", "12"]},
    "RU": {"name": "橡胶", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "ru",
           "months": ["01", "05", "09"]},
    "BU": {"name": "沥青", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "bu",
           "months": ["06", "09", "12"]},
    "FU": {"name": "燃料油", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "fu",
           "months": ["01", "05", "09"]},
    "SP": {"name": "纸浆", "unit": "元/吨", "exchange": "SHFE", "sina_prefix": "sp",
           "months": ["01", "05", "09"]},
    # ---- 大商所 DCE（无本地缓存，仅新浪 2019+）----
    "I":  {"name": "铁矿石", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "i",
           "months": ["01", "05", "09"]},
    "J":  {"name": "焦炭", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "j",
           "months": ["01", "05", "09"]},
    "JM": {"name": "焦煤", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "jm",
           "months": ["01", "05", "09"]},
    "M":  {"name": "豆粕", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "m",
           "months": ["01", "03", "05", "07", "08", "09", "11", "12"]},
    "Y":  {"name": "豆油", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "y",
           "months": ["01", "05", "09"]},
    "A":  {"name": "豆一", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "a",
           "months": ["01", "03", "05", "07", "09", "11"]},
    "B":  {"name": "豆二", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "b",
           "months": ["01", "03", "05", "07", "09", "11"]},
    "P":  {"name": "棕榈油", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "p",
           "months": ["01", "05", "09"]},
    "C":  {"name": "玉米", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "c",
           "months": ["01", "03", "05", "07", "09", "11"]},
    "L":  {"name": "塑料", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "l",
           "months": ["01", "05", "09"]},
    "PP": {"name": "聚丙烯", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "pp",
           "months": ["01", "05", "09"]},
    "V":  {"name": "PVC", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "v",
           "months": ["01", "05", "09"]},
    "EG": {"name": "乙二醇", "unit": "元/吨", "exchange": "DCE", "sina_prefix": "eg",
           "months": ["01", "05", "09"]},
    # ---- 郑商所 CZCE（本地缓存 2013-2019 + 新浪 2019+；新浪前缀大写）----
    "MA": {"name": "甲醇", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "MA",
           "months": ["01", "05", "09"]},
    "TA": {"name": "PTA", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "TA",
           "months": ["01", "05", "09"]},
    "SA": {"name": "纯碱", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "SA",
           "months": ["01", "05", "09"]},
    "FG": {"name": "玻璃", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "FG",
           "months": ["01", "05", "09"]},
    "SR": {"name": "白糖", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "SR",
           "months": ["01", "05", "09"]},
    "CF": {"name": "棉花", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "CF",
           "months": ["01", "05", "09"]},
    "AP": {"name": "苹果", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "AP",
           "months": ["01", "05", "10"]},
    "RM": {"name": "菜粕", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "RM",
           "months": ["01", "03", "05", "07", "09", "11"]},
    "OI": {"name": "菜油", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "OI",
           "months": ["01", "05", "09"]},
    "SF": {"name": "硅铁", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "SF",
           "months": ["01", "05", "09"]},
    "SM": {"name": "锰硅", "unit": "元/吨", "exchange": "CZCE", "sina_prefix": "SM",
           "months": ["01", "05", "09"]},
    # ---- 中金所 CFFEX（无本地缓存，仅新浪 2019+；前缀大写）----
    "IF": {"name": "沪深300", "unit": "点", "exchange": "CFFEX", "sina_prefix": "IF",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "IC": {"name": "中证500", "unit": "点", "exchange": "CFFEX", "sina_prefix": "IC",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "IH": {"name": "上证50", "unit": "点", "exchange": "CFFEX", "sina_prefix": "IH",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "IM": {"name": "中证1000", "unit": "点", "exchange": "CFFEX", "sina_prefix": "IM",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "T":  {"name": "十年国债", "unit": "元", "exchange": "CFFEX", "sina_prefix": "T",
           "months": ["03", "06", "09", "12"]},
    "TF": {"name": "五年国债", "unit": "元", "exchange": "CFFEX", "sina_prefix": "TF",
           "months": ["03", "06", "09", "12"]},
    # ---- 能源中心 INE（无本地缓存，仅新浪 2019+；前缀小写）----
    "SC": {"name": "原油", "unit": "元/桶", "exchange": "INE", "sina_prefix": "sc",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "NR": {"name": "20号胶", "unit": "元/吨", "exchange": "INE", "sina_prefix": "nr",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "LU": {"name": "低硫燃油", "unit": "元/吨", "exchange": "INE", "sina_prefix": "lu",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
    "BC": {"name": "国际铜", "unit": "元/吨", "exchange": "INE", "sina_prefix": "bc",
           "months": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]},
}


def fmt(day8):
    return f"{day8[0:4]}-{day8[4:6]}-{day8[6:8]}"


def load_shfe_cache(sym):
    """从上期所逐日全市场快照缓存提取该品种全部合约。
    返回 {(month, deliveryYear): {"code", "rows"}}"""
    cache_dir = os.path.join(RAW_DIR, "shfe_cache")
    product = sym.lower()
    out = {}
    if not os.path.isdir(cache_dir):
        return out
    files = sorted(f for f in os.listdir(cache_dir) if f.endswith(".json"))
    print(f"  读取上期所缓存 {len(files)} 天 ...")
    for fn in files:
        day8 = fn[2:-5]  # kxYYYYMMDD.json
        date_str = fmt(day8)
        try:
            with open(os.path.join(cache_dir, fn), encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        for row in data.get("o_curinstrument", []):
            variety = str(row.get("PRODUCTGROUPID") or "").strip().lower()
            if not variety:
                pid = str(row.get("PRODUCTID") or "").strip().lower()
                variety = pid.split("_")[0] if pid else ""
            if variety != product:
                continue
            yymm = str(row.get("DELIVERYMONTH", "")).strip()
            if len(yymm) != 4 or not yymm.isdigit():
                continue  # 跳过 小计/合计 行
            year = 2000 + int(yymm[:2])
            month = yymm[2:]
            close = row.get("CLOSEPRICE")
            if close in ("", None):
                close = 0
            key = (month, year)
            entry = out.setdefault(key, {
                "code": f"{product}{yymm}",
                "rows": [],
            })
            entry["rows"].append({
                "date": date_str,
                "close": float(close),
                "volume": row.get("VOLUME") or 0,
            })
    return out


def load_czce_cache(sym):
    """从郑商所逐日缓存提取该品种全部合约（2013-2019，3位码如 RM309）。
    返回 {(month, deliveryYear): {"code", "rows"}}"""
    cache_dir = os.path.join(RAW_DIR, "czce_cache")
    prefix = sym.upper()
    out = {}
    if not os.path.isdir(cache_dir):
        return out
    files = sorted(f for f in os.listdir(cache_dir) if f.endswith(".json"))
    print(f"  读取郑商所缓存 {len(files)} 天 ...")
    # 缓存年份范围，用于3位码年份数字消歧：
    # 郑商所年份数字10年一循环（rm001 既可能是2010也可能是2020交割），
    # 交割年应落在 [最小缓存年, 最大缓存年+1]（+1：年末挂牌的次年合约）
    cache_years = [int(fn[:4]) for fn in files if fn[:4].isdigit()]
    lo, hi = (min(cache_years), max(cache_years) + 1) if cache_years else (2013, 2020)
    for fn in files:
        try:
            with open(os.path.join(cache_dir, fn), encoding="utf-8") as f:
                rows = json.load(f)
        except Exception:
            continue
        for r in rows:
            s = str(r.get("symbol", ""))
            if not s.startswith(prefix):
                continue
            suffix = s[len(prefix):]
            if len(suffix) != 3 or not suffix.isdigit():
                continue  # 仅3位码（缓存范围2013-2019）
            digit = int(suffix[0])
            cands = [y for y in (2010 + digit, 2020 + digit) if lo <= y <= hi]
            if not cands:
                continue  # 两个候选都不在缓存区间（理论上不会发生）
            year = cands[0]
            month = suffix[1:]
            key = (month, year)
            entry = out.setdefault(key, {
                "code": f"{sym.lower()}{suffix}",
                "rows": [],
            })
            entry["rows"].append({
                "date": r["date"],
                "close": float(r.get("close") or 0),
                "volume": r.get("volume") or 0,
            })
    return out


def fetch_sina_all(sym, months):
    """新浪源按合约逐取（SINA_START~SINA_END 内所有配置月份）。
    返回 {(month, deliveryYear): {"code", "rows"}}"""
    prefix = SYMBOLS[sym]["sina_prefix"]
    out = {}
    total = len(months) * (SINA_END - SINA_START + 1)
    done = 0
    for year in range(SINA_START, SINA_END + 1):
        yy = str(year % 100).zfill(2)
        for month in months:
            sina_code = f"{prefix}{yy}{month}"
            try:
                rows = fetch_sina_with_volume(sina_code)
            except Exception as e:
                # 部分已退市合约新浪无历史数据，akshare 抛异常（如空表 ValueError），按无数据处理
                rows = []
                print(f"  [!] {sina_code} 抓取异常按无数据处理: {type(e).__name__}")
            time.sleep(0.5)
            done += 1
            if rows:
                out[(month, year)] = {
                    "code": f"{sym.lower()}{yy}{month}",
                    "rows": rows,
                }
                print(f"  [{done}/{total}] {sina_code}: {len(rows)} 条")
            else:
                print(f"  [{done}/{total}] {sina_code}: 无数据")
    return out


def build_symbol(sym, out_dir, use_sina=True, min_contracts=3, min_rows=20):
    meta = SYMBOLS[sym]
    exchange = meta["exchange"]
    print("=" * 70)
    print(f"{meta['name']}（{sym}）· {exchange} · 配置月份 {'/'.join(meta['months'])}")
    print("=" * 70)

    # ---- 1. 汇聚各来源的原始合约序列 ----
    raw = {}  # (month, year) -> {code, rows}
    if exchange == "SHFE":
        raw.update(load_shfe_cache(sym))
    elif exchange == "CZCE":
        raw.update(load_czce_cache(sym))

    if use_sina:
        sina_part = fetch_sina_all(sym, meta["months"])
        for key, entry in sina_part.items():
            old = raw.get(key)
            if old is None:
                raw[key] = entry
            else:
                # 同交割年月重复（如郑商所 rm909 与新浪 rm1909）：保留更长的序列
                print(f"  [去重] {key[0]}月{key[1]}: {old['code']}({len(old['rows'])}条) "
                      f"vs {entry['code']}({len(entry['rows'])}条)")
                if len(entry["rows"]) > len(old["rows"]):
                    raw[key] = entry
    elif exchange == "DCE":
        print("  大商所无本地缓存，--no-sina 模式下无数据来源")

    if not raw:
        print("  无任何数据来源，退出")
        return []

    # ---- 2. 逐合约清洗（剔除脏行、截断交割冻结尾部）----
    by_month = {}  # month -> [{code, deliveryYear, series}]
    dropped_short = 0
    for (month, year), entry in sorted(raw.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        truncated, report = analyze_contract(entry["code"], entry["rows"])
        if len(truncated) < min_rows:
            dropped_short += 1
            continue
        by_month.setdefault(month, []).append({
            "code": entry["code"],
            "deliveryYear": year,
            "series": [{"date": r["date"], "close": r["close"]} for r in truncated],
        })
        miss = report["missing_trade_days"] if report else []
        flag = f"  [注意] 缺失 {len(miss)} 个交易日" if len(miss) > 10 else ""
        print(f"  {entry['code']}: 有效 {len(truncated)} 条 "
              f"({truncated[0]['date']} ~ {truncated[-1]['date']}){flag}")

    # ---- 3. 按月份生成 JSON（仅配置的主力月份；合约数不足的跳过）----
    os.makedirs(out_dir, exist_ok=True)
    configured = set(meta["months"])
    written = []
    print("-" * 70)
    for month in sorted(by_month):
        contracts = sorted(by_month[month], key=lambda c: c["deliveryYear"])
        if month not in configured:
            print(f"  {month}月: 非配置主力月份（{len(contracts)} 个合约），跳过")
            continue
        if len(contracts) < min_contracts:
            print(f"  {month}月: 仅 {len(contracts)} 个合约 (<{min_contracts})，跳过")
            continue
        payload = {
            "symbol": sym,
            "contractMonth": month,
            "unit": meta["unit"],
            "updatedAt": date.today().isoformat(),
            "contracts": contracts,
        }
        out_path = os.path.join(out_dir, f"{sym}_{month}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        total_rows = sum(len(c["series"]) for c in contracts)
        size_kb = os.path.getsize(out_path) / 1024
        written.append(out_path)
        print(f"  {month}月: {len(contracts)} 个合约 "
              f"({contracts[0]['deliveryYear']}~{contracts[-1]['deliveryYear']}) "
              f"共 {total_rows} 条 -> {os.path.basename(out_path)} ({size_kb:.1f} KB)")

    print("-" * 70)
    print(f"完成：生成 {len(written)} 个月份文件"
          + (f"，另有 {dropped_short} 个合约因有效行数<{min_rows}被剔除" if dropped_short else ""))
    return written


def main():
    parser = argparse.ArgumentParser(description="按品种一键生成所有合约月份的真实数据 JSON")
    parser.add_argument("symbols", nargs="*", help="品种代码，可一次给多个，如 RB M RM；或用 --all 处理全部已配置品种")
    parser.add_argument("--all", action="store_true", help="处理 SYMBOLS 中全部已配置品种")
    parser.add_argument("--out", default=DEFAULT_OUT, help="输出目录（默认 src/data/futures）")
    parser.add_argument("--no-sina", action="store_true", help="不使用新浪源（仅本地缓存，离线验证用）")
    parser.add_argument("--min-contracts", type=int, default=3, help="月份保留的最少合约数（默认3）")
    parser.add_argument("--min-rows", type=int, default=20, help="单合约最少有效行数（默认20）")
    args = parser.parse_args()

    if args.all:
        syms = sorted(SYMBOLS)
    else:
        syms = [s.upper() for s in args.symbols]
        if not syms:
            parser.error("请至少给出一个品种代码（如 RB M RM），或使用 --all 处理全部已配置品种")

    unknown = [s for s in syms if s not in SYMBOLS]
    if unknown:
        print(f"未配置的品种: {', '.join(unknown)}")
        print(f"已配置: {', '.join(sorted(SYMBOLS))}（新增品种请在 SYMBOLS 中加一行配置）")
        sys.exit(1)

    for i, sym in enumerate(syms, 1):
        if len(syms) > 1:
            print(f"\n>>> [{i}/{len(syms)}] 开始处理 {sym} <<<")
        build_symbol(sym, args.out, use_sina=not args.no_sina,
                     min_contracts=args.min_contracts, min_rows=args.min_rows)
    if len(syms) > 1:
        print(f"\n全部完成：共处理 {len(syms)} 个品种（{', '.join(syms)}）")


if __name__ == "__main__":
    main()
