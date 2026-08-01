# -*- coding: utf-8 -*-
"""
增量补抓指定交割年份的合约并合并进已有 JSON
============================================
场景：01 等早月合约提前一年挂牌（如 2026-08 时 2701 已上市半年），
全量重建太慢时，用本脚本只抓某一交割年的全部配置月份合约，
逐个合并进 src/data/futures/{SYM}_{MM}.json（幂等：已含该年份则跳过）。

用法：
  python scripts/fetch_year.py 2027            # 全部品种补 2027 交割年
  python scripts/fetch_year.py 2027 RM C       # 只补指定品种
  python scripts/fetch_year.py 2027 --dry-run  # 只打印计划不写文件
"""
import argparse
import json
import os
import sys
import time
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(HERE, "..")
OUT_DIR = os.path.join(PROJECT, "src", "data", "futures")

sys.path.insert(0, HERE)
from build_symbol import SYMBOLS  # noqa: E402
from merge_mr_data import analyze_contract, fetch_sina_with_volume  # noqa: E402

MIN_ROWS = 20  # 与 build_symbol 保持一致的单合约最少有效行数


def fetch_one(sym, month, year):
    """抓取并清洗单个合约，返回可入库的 contract dict 或 None"""
    meta = SYMBOLS[sym]
    yy = str(year % 100).zfill(2)
    sina_code = f"{meta['sina_prefix']}{yy}{month}"
    try:
        rows = fetch_sina_with_volume(sina_code)
    except Exception as e:
        print(f"    [!] {sina_code} 抓取异常按无数据处理: {type(e).__name__}")
        rows = []
    time.sleep(0.5)
    if not rows:
        print(f"    {sina_code}: 无数据（未挂牌或已退市）")
        return None
    truncated, _ = analyze_contract(f"{sym.lower()}{yy}{month}", rows)
    if len(truncated) < MIN_ROWS:
        print(f"    {sina_code}: 有效 {len(truncated)} 条 < {MIN_ROWS}，剔除")
        return None
    print(f"    {sina_code}: 有效 {len(truncated)} 条 ({truncated[0]['date']} ~ {truncated[-1]['date']})")
    return {
        "code": f"{sym.lower()}{yy}{month}",
        "deliveryYear": year,
        "series": [{"date": r["date"], "close": r["close"]} for r in truncated],
    }


def main():
    parser = argparse.ArgumentParser(description="增量补抓指定交割年份合约并合并进已有 JSON")
    parser.add_argument("year", type=int, help="交割年份，如 2027")
    parser.add_argument("symbols", nargs="*", help="品种代码（默认全部已配置品种）")
    parser.add_argument("--dry-run", action="store_true", help="只打印计划，不抓数据不写文件")
    args = parser.parse_args()

    year = args.year
    syms = [s.upper() for s in args.symbols] or sorted(SYMBOLS)
    unknown = [s for s in syms if s not in SYMBOLS]
    if unknown:
        print(f"未配置的品种: {', '.join(unknown)}")
        sys.exit(1)

    # 计划：已有 JSON 文件且尚未包含该交割年的 品种+月份
    plan = []
    for sym in syms:
        for month in SYMBOLS[sym]["months"]:
            path = os.path.join(OUT_DIR, f"{sym}_{month}.json")
            if not os.path.isfile(path):
                continue
            with open(path, encoding="utf-8") as f:
                payload = json.load(f)
            if any(c["deliveryYear"] == year for c in payload["contracts"]):
                continue
            plan.append((sym, month, path, payload))

    print(f"交割年 {year}：{len(syms)} 个品种中 {len(plan)} 个 品种+月份 待补抓")
    if args.dry_run:
        for sym, month, _, _ in plan:
            print(f"  {sym}_{month}")
        return

    added = 0
    for i, (sym, month, path, payload) in enumerate(plan, 1):
        print(f"  [{i}/{len(plan)}] {sym}_{month}")
        contract = fetch_one(sym, month, year)
        if not contract:
            continue
        payload["contracts"].append(contract)
        payload["contracts"].sort(key=lambda c: c["deliveryYear"])
        payload["updatedAt"] = date.today().isoformat()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        added += 1

    print(f"\n完成：{added} 个月份文件新增 {year} 交割年合约")


if __name__ == "__main__":
    main()
