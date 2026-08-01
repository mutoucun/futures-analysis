# -*- coding: utf-8 -*-
"""
真实数据 JSON 构建脚本
======================
将清洗后的历年合约日线构建为前端可直接消费的静态 JSON（src/data/futures/）。

JSON 结构（每个 品种+合约月份 一个文件）：
{
  "symbol": "RB",
  "contractMonth": "09",
  "unit": "元/吨",
  "updatedAt": "YYYY-MM-DD",
  "contracts": [
    { "code": "rb0909", "deliveryYear": 2009,
      "series": [{"date": "2009-03-27", "close": 3480.0}, ...] },
    ...
  ]
}

前端三种视图均由 contracts 派生：
  - 季节性叠线图：每个合约按交割年切片（1月~交割月）
  - 连续时序图：全部合约完整周期首尾拼接（09连续）
  - 12月明细表：月末收盘价，1月以本合约上市年12月为基准

用法：
  python scripts/build_data_json.py                          # 默认：RB 09 元/吨 rb09_merged.json
  python scripts/build_data_json.py M 09 元/吨 m09_merged.json
  python scripts/build_data_json.py RM 09 元/吨 rm09_merged.json

合并文件 series 兼容两种结构：
  - {code: [rows]}                    （旧，交割年由代码第3-4位解析）
  - {code: {deliveryYear, rows}}      （新，交割年显式给出，兼容郑商所3位码）
"""
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(HERE, "..")
RAW_DIR = os.path.join(PROJECT, "raw")
OUT_DIR = os.path.join(PROJECT, "src", "data", "futures")


def main():
    argv = sys.argv[1:]
    symbol = argv[0] if len(argv) > 0 else "RB"
    contract_month = argv[1] if len(argv) > 1 else "09"
    unit = argv[2] if len(argv) > 2 else "元/吨"
    raw_name = argv[3] if len(argv) > 3 else f"{symbol.lower()}{contract_month}_merged.json"

    with open(os.path.join(RAW_DIR, raw_name), encoding="utf-8") as f:
        merged = json.load(f)

    contracts = []
    for code, value in merged["series"].items():
        if isinstance(value, dict):
            delivery_year = value["deliveryYear"]
            rows = value["rows"]
        else:
            rows = value
            delivery_year = int(code[2:4]) + 2000  # rb0909 -> 2009
        if not rows:
            continue
        contracts.append({
            "code": code,
            "deliveryYear": delivery_year,
            "series": [{"date": r["date"], "close": r["close"]} for r in rows],
        })

    contracts.sort(key=lambda c: c["deliveryYear"])

    payload = {
        "symbol": symbol,
        "contractMonth": contract_month,
        "unit": unit,
        "updatedAt": date.today().isoformat(),
        "contracts": contracts,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{symbol}_{contract_month}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    total = sum(len(c["series"]) for c in contracts)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"已生成 {out_path}")
    print(f"  合约数: {len(contracts)}  日线总数: {total}  文件大小: {size_kb:.1f} KB")
    print(f"  年份范围: {contracts[0]['deliveryYear']} ~ {contracts[-1]['deliveryYear']}")
    last = contracts[-1]["series"][-1]
    print(f"  最新数据: {last['date']} 收盘 {last['close']}")


if __name__ == "__main__":
    main()
