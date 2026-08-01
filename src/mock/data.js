/**
 * 数据模块（真实数据优先，mock 兜底）
 * 品种基础信息 + 行情数据：
 *   已生成真实 JSON 的 品种+合约月份（见 src/data/futures/）使用交易所/新浪清洗数据，
 *   其余品种仍由 mock 生成（mulberry32 确定性随机）。
 */
import { pinyin } from 'pinyin-pro'
import { getRealContracts, getRealDataUpdateDate } from '../data/index.js'

// ============ 交易所与品种定义 ============
// tick = 最小变动价位（真实合约规格），用于推导价格显示小数位
export const EXCHANGES = [
  {
    code: 'SHFE',
    name: '上期所',
    fullName: '上海期货交易所',
    symbols: [
      { code: 'RB', name: '螺纹钢', category: '黑色系', price: 3600, unit: '元/吨', startYear: 2009, tick: 1 },
      { code: 'HC', name: '热卷', category: '黑色系', price: 3750, unit: '元/吨', startYear: 2014, tick: 1 },
      { code: 'SS', name: '不锈钢', category: '黑色系', price: 14200, unit: '元/吨', startYear: 2019, tick: 5 },
      { code: 'WR', name: '线材', category: '黑色系', price: 4100, unit: '元/吨', startYear: 2009, tick: 1 },
      { code: 'CU', name: '沪铜', category: '有色金属', price: 71500, unit: '元/吨', startYear: 2006, tick: 10 },
      { code: 'AL', name: '沪铝', category: '有色金属', price: 19800, unit: '元/吨', startYear: 2006, tick: 5 },
      { code: 'ZN', name: '沪锌', category: '有色金属', price: 22600, unit: '元/吨', startYear: 2007, tick: 5 },
      { code: 'PB', name: '沪铅', category: '有色金属', price: 16500, unit: '元/吨', startYear: 2011, tick: 5 },
      { code: 'NI', name: '沪镍', category: '有色金属', price: 128000, unit: '元/吨', startYear: 2015, tick: 10 },
      { code: 'SN', name: '沪锡', category: '有色金属', price: 245000, unit: '元/吨', startYear: 2015, tick: 10 },
      { code: 'AU', name: '沪金', category: '贵金属', price: 560, unit: '元/克', startYear: 2008, tick: 0.02 },
      { code: 'AG', name: '沪银', category: '贵金属', price: 7800, unit: '元/千克', startYear: 2012, tick: 1 },
      { code: 'RU', name: '橡胶', category: '能源化工', price: 14500, unit: '元/吨', startYear: 2006, tick: 5 },
      { code: 'BU', name: '沥青', category: '能源化工', price: 3650, unit: '元/吨', startYear: 2013, tick: 1 },
      { code: 'FU', name: '燃料油', category: '能源化工', price: 3100, unit: '元/吨', startYear: 2006, tick: 1 },
      { code: 'SP', name: '纸浆', category: '能源化工', price: 5900, unit: '元/吨', startYear: 2018, tick: 2 }
    ]
  },
  {
    code: 'DCE',
    name: '大商所',
    fullName: '大连商品交易所',
    symbols: [
      { code: 'I', name: '铁矿石', category: '黑色系', price: 820, unit: '元/吨', startYear: 2013, tick: 0.5 },
      { code: 'J', name: '焦炭', category: '黑色系', price: 2150, unit: '元/吨', startYear: 2011, tick: 0.5 },
      { code: 'JM', name: '焦煤', category: '黑色系', price: 1350, unit: '元/吨', startYear: 2013, tick: 0.5 },
      { code: 'M', name: '豆粕', category: '农产品', price: 3200, unit: '元/吨', startYear: 2006, tick: 1 },
      { code: 'Y', name: '豆油', category: '农产品', price: 7900, unit: '元/吨', startYear: 2006, tick: 2 },
      { code: 'A', name: '豆一', category: '农产品', price: 4600, unit: '元/吨', startYear: 2006, tick: 1 },
      { code: 'B', name: '豆二', category: '农产品', price: 4000, unit: '元/吨', startYear: 2006, tick: 1 },
      { code: 'P', name: '棕榈油', category: '农产品', price: 8200, unit: '元/吨', startYear: 2007, tick: 2 },
      { code: 'C', name: '玉米', category: '农产品', price: 2450, unit: '元/吨', startYear: 2006, tick: 1 },
      { code: 'L', name: '塑料', category: '能源化工', price: 8300, unit: '元/吨', startYear: 2007, tick: 5 },
      { code: 'PP', name: '聚丙烯', category: '能源化工', price: 7400, unit: '元/吨', startYear: 2014, tick: 1 },
      { code: 'V', name: 'PVC', category: '能源化工', price: 6100, unit: '元/吨', startYear: 2009, tick: 5 },
      { code: 'EG', name: '乙二醇', category: '能源化工', price: 4600, unit: '元/吨', startYear: 2018, tick: 1 }
    ]
  },
  {
    code: 'CZCE',
    name: '郑商所',
    fullName: '郑州商品交易所',
    symbols: [
      { code: 'MA', name: '甲醇', category: '能源化工', price: 2450, unit: '元/吨', startYear: 2011, tick: 1 },
      { code: 'TA', name: 'PTA', category: '能源化工', price: 5600, unit: '元/吨', startYear: 2006, tick: 2 },
      { code: 'SA', name: '纯碱', category: '能源化工', price: 1850, unit: '元/吨', startYear: 2019, tick: 1 },
      { code: 'FG', name: '玻璃', category: '能源化工', price: 1450, unit: '元/吨', startYear: 2012, tick: 1 },
      { code: 'SR', name: '白糖', category: '农产品', price: 6100, unit: '元/吨', startYear: 2006, tick: 1 },
      { code: 'CF', name: '棉花', category: '农产品', price: 15200, unit: '元/吨', startYear: 2006, tick: 5 },
      { code: 'AP', name: '苹果', category: '农产品', price: 8600, unit: '元/吨', startYear: 2017, tick: 1 },
      { code: 'RM', name: '菜粕', category: '农产品', price: 2500, unit: '元/吨', startYear: 2012, tick: 1 },
      { code: 'OI', name: '菜油', category: '农产品', price: 9800, unit: '元/吨', startYear: 2007, tick: 1 },
      { code: 'SF', name: '硅铁', category: '黑色系', price: 6800, unit: '元/吨', startYear: 2014, tick: 2 },
      { code: 'SM', name: '锰硅', category: '黑色系', price: 6200, unit: '元/吨', startYear: 2014, tick: 2 }
    ]
  },
  {
    code: 'CFFEX',
    name: '中金所',
    fullName: '中国金融期货交易所',
    symbols: [
      { code: 'IF', name: '沪深300', category: '金融期货', price: 3900, unit: '点', startYear: 2010, tick: 0.2 },
      { code: 'IC', name: '中证500', category: '金融期货', price: 5800, unit: '点', startYear: 2015, tick: 0.2 },
      { code: 'IH', name: '上证50', category: '金融期货', price: 2600, unit: '点', startYear: 2015, tick: 0.2 },
      { code: 'IM', name: '中证1000', category: '金融期货', price: 6200, unit: '点', startYear: 2022, tick: 0.2 },
      { code: 'T', name: '十年国债', category: '金融期货', price: 104, unit: '元', startYear: 2015, tick: 0.01 },
      { code: 'TF', name: '五年国债', category: '金融期货', price: 102, unit: '元', startYear: 2013, tick: 0.005 }
    ]
  },
  {
    code: 'INE',
    name: '能源中心',
    fullName: '上海国际能源交易中心',
    symbols: [
      { code: 'SC', name: '原油', category: '能源化工', price: 540, unit: '元/桶', startYear: 2018, tick: 0.1 },
      { code: 'NR', name: '20号胶', category: '能源化工', price: 11200, unit: '元/吨', startYear: 2019, tick: 5 },
      { code: 'LU', name: '低硫燃油', category: '能源化工', price: 3800, unit: '元/吨', startYear: 2020, tick: 1 },
      { code: 'BC', name: '国际铜', category: '有色金属', price: 63000, unit: '元/吨', startYear: 2020, tick: 10 }
    ]
  }
]

// 品种类别列表
export const CATEGORIES = ['黑色系', '有色金属', '贵金属', '能源化工', '农产品', '金融期货']

// 合约月份选项
export const CONTRACT_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

// 年份范围选项
export const YEAR_RANGES = [
  { value: 'all', label: '全部历史年份' },
  { value: '3', label: '近3年' },
  { value: '5', label: '近5年' },
  { value: '10', label: '近10年' }
]

// ============ 工具函数 ============

/** 基于字符串的简单哈希，用于生成确定性种子 */
function hashSeed(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/** 确定性伪随机数生成器 (mulberry32) */
function createRng(seed) {
  let s = seed
  return function () {
    s |= 0
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 查找品种信息 */
export function findSymbol(code) {
  for (const ex of EXCHANGES) {
    const sym = ex.symbols.find(s => s.code === code)
    if (sym) return { ...sym, exchange: ex.code, exchangeName: ex.name }
  }
  return null
}

/** 获取品种所属交易所 */
export function getExchangeOf(code) {
  for (const ex of EXCHANGES) {
    if (ex.symbols.some(s => s.code === code)) return ex
  }
  return null
}

/** 由最小变动价位推导价格应保留的小数位数（tick>=1 为整数品种，返回 0） */
export function decimalsFromTick(tick) {
  if (tick == null || tick >= 1) return 0
  let d = 0
  let t = tick
  while (d < 6 && Math.abs(Math.round(t) - t) > 1e-9) {
    t *= 10
    d++
  }
  return d
}

/**
 * 获取品种价格显示小数位（按最小变动价位）
 * 如螺纹钢 tick=1 -> 0 位（整数）；沪金 tick=0.02 -> 2 位
 * @returns {number} 小数位数，品种不存在时回退 2 位
 */
export function getSymbolDecimals(code) {
  const sym = findSymbol(code)
  if (!sym) return 2
  return decimalsFromTick(sym.tick)
}

// ============ 品种搜索索引（支持文字 / 拼音 / 拼音首字母模糊匹配） ============

let _searchIndex = null

/** 懒加载构建全品种搜索索引，预计算拼音全拼与首字母 */
function buildSearchIndex() {
  if (_searchIndex) return _searchIndex
  _searchIndex = []
  for (const ex of EXCHANGES) {
    for (const sym of ex.symbols) {
      let fullPy = ''
      let initials = ''
      try {
        fullPy = pinyin(sym.name, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
          .join('').toLowerCase()
        initials = pinyin(sym.name, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
          .join('').toLowerCase()
      } catch (e) {
        // 拼音转换失败时仍可按代码/名称搜索
      }
      _searchIndex.push({
        ...sym,
        exchange: ex.code,
        exchangeName: ex.name,
        fullPy,
        initials
      })
    }
  }
  return _searchIndex
}

/** 获取全部品种（含搜索辅助字段），用于下拉分组展示 */
export function getAllSymbolsIndexed() {
  return buildSearchIndex()
}

/**
 * 模糊搜索品种
 * 匹配维度：品种代码 / 中文名称 / 拼音全拼 / 拼音首字母
 * @param {string} query 搜索关键词（如 "螺纹" / "RB" / "luowengang" / "LWG"）
 * @returns {Array} 匹配的品种列表
 */
export function searchSymbols(query) {
  const all = buildSearchIndex()
  const q = (query || '').trim().toLowerCase()
  if (!q) return all
  return all.filter(s =>
    s.code.toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q) ||
    (s.fullPy && s.fullPy.includes(q)) ||
    (s.initials && s.initials.includes(q))
  )
}

// ============ 行情数据生成 ============

/**
 * 生成某品种某合约月份的完整日线收盘价序列
 * 返回: [{ date: 'YYYY-MM-DD', close: number }]
 */
export function generateDailySeries(symbolCode, contractMonth) {
  const symbol = findSymbol(symbolCode)
  if (!symbol) return []

  const rng = createRng(hashSeed(`${symbolCode}-${contractMonth}`))
  const currentYear = 2026
  const series = []

  // 品种特性参数：年化波动率、年化漂移
  const annualVol = 0.18 + rng() * 0.22 // 18%~40% 年化波动
  const annualDrift = (rng() - 0.48) * 0.08 // 轻微漂移
  const dailyVol = annualVol / Math.sqrt(244)
  const dailyDrift = annualDrift / 244

  // 从上市年到当前，生成连续主力合约日线
  let price = symbol.price * (0.7 + rng() * 0.6) // 起始价格随机偏移

  for (let year = symbol.startYear; year <= currentYear; year++) {
    // 每年加入周期性因子（模拟大宗商品周期 3~5 年）
    const cyclePhase = rng() * Math.PI * 2
    const cycleAmp = 0.0004 + rng() * 0.0008

    for (let month = 1; month <= 12; month++) {
      // 合约到期月份之后不再交易（主力切换简化处理：全部生成）
      const daysInMonth = new Date(year, month, 0).getDate()
      // 季节性因子
      const seasonalFactor = Math.sin((month / 12) * Math.PI * 2 + hashSeed(symbolCode) % 6) * 0.0003

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day)
        const dow = date.getDay()
        if (dow === 0 || dow === 6) continue // 跳过周末

        // 数据截止到 2026-06-02
        if (year === currentYear && (month > 6 || (month === 6 && day > 2))) break

        const shock = (rng() - 0.5) * 2 * dailyVol
        const cycle = Math.sin((day + month * 30) / 60 + cyclePhase) * cycleAmp
        const ret = dailyDrift + seasonalFactor + cycle + shock

        // 偶发大波动（模拟极端行情）
        const jump = rng() < 0.008 ? (rng() - 0.5) * dailyVol * 8 : 0

        price = price * (1 + ret + jump)
        price = Math.max(price, symbol.price * 0.2) // 价格下限保护

        series.push({
          date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          close: Math.round(price * 100) / 100
        })
      }
    }
  }
  return series
}

/**
 * 获取某年某月的最后一个交易日收盘价
 */
function getMonthEndClose(series, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  let last = null
  for (const item of series) {
    if (item.date.startsWith(prefix)) last = item
  }
  return last ? last.close : null
}

/**
 * 季节性叠线图计算核心：将日线序列按年拆分，
 * 以「月-日」为公共横轴（取全部年份交易日的并集），叠加展示各年走势
 * 单合约展示日线收盘价走势，跨品种/跨月展示价差、比值走势
 * @param {Array} series 日线序列 [{date, close}]
 * @param {number} baseStartYear 数据起始年份
 * @param {string} yearRange 'all' | '3' | '5' | '10'
 * @returns {{ years: number[], dates: string[], data: Object }}
 *          dates 形如 'MM-DD'；data[year] 与 dates 等长，无数据处为 null
 */
function computeDailySeasonalCore(series, baseStartYear, yearRange) {
  const currentYear = 2026

  let startYear = baseStartYear
  if (yearRange && yearRange !== 'all') {
    startYear = Math.max(baseStartYear, currentYear - parseInt(yearRange))
  }

  // 按年份分组
  const byYear = {}
  for (const item of series) {
    const y = parseInt(item.date.slice(0, 4), 10)
    if (y < startYear || y > currentYear) continue
    if (!byYear[y]) byYear[y] = []
    byYear[y].push(item)
  }

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)

  // 全部年份交易日（月-日）并集，作为公共横轴（零填充字符串可直接按字典序排序）
  const dateSet = new Set()
  for (const y of years) {
    for (const item of byYear[y]) dateSet.add(item.date.slice(5))
  }
  const dates = [...dateSet].sort()

  const dateIndex = new Map(dates.map((d, i) => [d, i]))
  const data = {}
  for (const y of years) {
    const arr = new Array(dates.length).fill(null)
    for (const item of byYear[y]) {
      arr[dateIndex.get(item.date.slice(5))] = item.close
    }
    data[y] = arr
  }

  return { years, dates, data }
}

/** 时序采样：按周抽样，避免数据点过多，并确保包含最后一个点 */
function sampleSeries(series) {
  const sampled = series.filter((_, i) => i % 5 === 0)
  if (series.length > 0 && sampled[sampled.length - 1] !== series[series.length - 1]) {
    sampled.push(series[series.length - 1])
  }
  return {
    dates: sampled.map(d => d.date),
    closes: sampled.map(d => d.close)
  }
}

/**
 * 真实数据季节性计算：每个合约展示「上市~交割」完整生命周期，
 * 横轴按「交割月收尾」旋转排序 —— 交割月为 M 时，轴从上年 M+1 月排到交割年 M 月，
 * 共 12 个月（如 09 合约为 10月→次年9月，01 合约为 2月→次年1月）。
 * 早交割月合约（01/03/05）不再只剩交割年短短几个月，而是完整可比曲线；
 * 上市较晚的合约（如首个合约）窗口前段为 null。
 * 每年一条独立合约曲线，与 mock 的 computeDailySeasonalCore 输出同构
 * @param {Array} contracts [{code, deliveryYear, series}]（已按交割年升序）
 * @param {string} contractMonth 合约交割月份 '01'~'12'
 * @param {string} yearRange 'all' | '3' | '5' | '10'
 */
function computeRealSeasonal(contracts, contractMonth, yearRange) {
  const currentYear = contracts[contracts.length - 1].deliveryYear
  let startYear = contracts[0].deliveryYear
  if (yearRange && yearRange !== 'all') {
    startYear = Math.max(startYear, currentYear - parseInt(yearRange))
  }

  const M = parseInt(contractMonth, 10)
  // 窗口归属：月份 > M → 上年（M+1~12月）；月份 <= M → 交割年（1~M月）。
  // 该划分同时把"交割月前 12 个月以外"的上市尾段排除（如 09 合约上年 9 月中旬的挂牌日，
  // 与交割年 9 月同月但早 12 个月，若不排除会与交割月撞在同一轴位置）
  const inWindow = (dateStr, deliveryYear) => {
    const y = parseInt(dateStr.slice(0, 4), 10)
    const m = parseInt(dateStr.slice(5, 7), 10)
    return m > M ? y === deliveryYear - 1 : y === deliveryYear
  }
  // 旋转键：前缀月份偏移（0=窗口起始月 M+1 … 11=交割月 M），保证跨年并集按时间排序
  const rotKey = (mmdd) => {
    const m = parseInt(mmdd.slice(0, 2), 10)
    const offset = (m - M - 1 + 12) % 12
    return String(offset).padStart(2, '0') + '-' + mmdd
  }

  // 全部合约窗口内交易日（旋转键）并集作为公共横轴
  const rotSet = new Set()
  for (const c of contracts) {
    if (c.deliveryYear < startYear) continue
    for (const p of c.series) {
      if (inWindow(p.date, c.deliveryYear)) rotSet.add(rotKey(p.date.slice(5)))
    }
  }
  const rotDates = [...rotSet].sort()
  const dates = rotDates.map(k => k.slice(3)) // 去掉偏移前缀 → 'MM-DD' 供展示
  const rotIndex = new Map(rotDates.map((k, i) => [k, i]))

  const years = []
  const data = {}
  for (const c of contracts) {
    if (c.deliveryYear < startYear) continue
    const arr = new Array(rotDates.length).fill(null)
    for (const p of c.series) {
      if (!inWindow(p.date, c.deliveryYear)) continue
      arr[rotIndex.get(rotKey(p.date.slice(5)))] = p.close
    }
    years.push(c.deliveryYear)
    data[c.deliveryYear] = arr
  }
  return { years, dates, data }
}

/**
 * 计算季节性叠线图数据（各年日线价格走势叠加）—— 单合约
 * 横轴为年内交易日（月-日），纵轴为收盘价
 */
export function getSeasonalData(symbolCode, contractMonth, yearRange) {
  const contracts = getRealContracts(symbolCode, contractMonth)
  if (contracts) return computeRealSeasonal(contracts, contractMonth, yearRange)

  const symbol = findSymbol(symbolCode)
  const series = generateDailySeries(symbolCode, contractMonth)
  return computeDailySeasonalCore(series, symbol.startYear, yearRange)
}

/**
 * 获取连续时序图数据（合约收盘价走势）—— 单合约
 * 真实数据为各年同月合约完整周期首尾拼接（如"09连续"，合约切换处存在正常基差跳空）
 * @returns { dates: string[], closes: number[] }
 */
export function getTimeSeriesData(symbolCode, contractMonth) {
  const contracts = getRealContracts(symbolCode, contractMonth)
  if (contracts) {
    // 按日期合并全部合约，重叠日期以较晚交割的合约为准
    const byDate = new Map()
    for (const c of contracts) {
      for (const p of c.series) byDate.set(p.date, p.close)
    }
    const series = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, close]) => ({ date, close }))
    return sampleSeries(series)
  }

  const series = generateDailySeries(symbolCode, contractMonth)
  return sampleSeries(series)
}

// ============ 跨品种价差 / 比值 ============

/**
 * 真实数据跨品种派生合约：对每个共同交割年，按日期对齐 A/B 收盘价计算价差/比值，
 * 生成与真实合约同构的"伪合约"列表，供 computeRealSeasonal / 时序拼接 / 明细表复用
 * @param {Array} contractsA 品种A历年合约（已按交割年升序）
 * @param {Array} contractsB 品种B历年合约（已按交割年升序）
 * @param {string} crossMode 'spread'=价差(A-B) | 'ratio'=比值(A/B)
 * @returns {Array<{deliveryYear, series}>} 仅含双方都有真实数据的交割年
 */
function computeRealCrossContracts(contractsA, contractsB, crossMode) {
  const byYearB = new Map(contractsB.map(c => [c.deliveryYear, c]))
  const out = []
  for (const a of contractsA) {
    const b = byYearB.get(a.deliveryYear)
    if (!b) continue
    const mapB = new Map(b.series.map(p => [p.date, p.close]))
    const series = []
    for (const p of a.series) {
      const bv = mapB.get(p.date)
      if (bv === undefined || bv === null) continue
      let val
      if (crossMode === 'ratio') {
        if (bv === 0) continue
        val = p.close / bv
      } else {
        val = p.close - bv
      }
      series.push({ date: p.date, close: Math.round(val * 10000) / 10000 })
    }
    if (series.length) out.push({ deliveryYear: a.deliveryYear, series })
  }
  return out
}

/**
 * 生成跨品种派生日线序列（价差 = A-B，比值 = A/B）
 * 两个品种使用相同合约月份，按交易日对齐
 * @param {string} symA 品种A代码
 * @param {string} symB 品种B代码
 * @param {string} contractMonth 合约月份
 * @param {string} crossMode 'spread'=价差 | 'ratio'=比值
 */
export function getCrossSeries(symA, symB, contractMonth, crossMode) {
  const seriesA = generateDailySeries(symA, contractMonth)
  const seriesB = generateDailySeries(symB, contractMonth)
  const mapB = new Map(seriesB.map(d => [d.date, d.close]))
  const out = []
  for (const a of seriesA) {
    const b = mapB.get(a.date)
    if (b === undefined || b === null) continue
    let val
    if (crossMode === 'ratio') {
      if (b === 0) continue
      val = a.close / b
    } else {
      val = a.close - b
    }
    out.push({ date: a.date, close: Math.round(val * 10000) / 10000 })
  }
  return out
}

/** 跨品种数据起始年份 = 两品种上市较晚者 */
function crossStartYear(symA, symB) {
  return Math.max(findSymbol(symA).startYear, findSymbol(symB).startYear)
}

/** 跨品种季节性数据（各年价差/比值日线走势叠加） */
export function getCrossSeasonalData(symA, symB, contractMonth, yearRange, crossMode) {
  const contractsA = getRealContracts(symA, contractMonth)
  const contractsB = getRealContracts(symB, contractMonth)
  if (contractsA && contractsB) {
    const pseudo = computeRealCrossContracts(contractsA, contractsB, crossMode)
    if (pseudo.length) return computeRealSeasonal(pseudo, contractMonth, yearRange)
  }

  const series = getCrossSeries(symA, symB, contractMonth, crossMode)
  return computeDailySeasonalCore(series, crossStartYear(symA, symB), yearRange)
}

/** 跨品种连续时序数据（价差/比值走势） */
export function getCrossTimeSeriesData(symA, symB, contractMonth, crossMode) {
  const contractsA = getRealContracts(symA, contractMonth)
  const contractsB = getRealContracts(symB, contractMonth)
  if (contractsA && contractsB) {
    const pseudo = computeRealCrossContracts(contractsA, contractsB, crossMode)
    if (pseudo.length) {
      // 按日期拼接全部年份价差，重叠日期以较晚交割年为准（与单合约"09连续"口径一致）
      const byDate = new Map()
      for (const c of pseudo) {
        for (const p of c.series) byDate.set(p.date, p.close)
      }
      const series = [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, close]) => ({ date, close }))
      return sampleSeries(series)
    }
  }

  const series = getCrossSeries(symA, symB, contractMonth, crossMode)
  return sampleSeries(series)
}

/**
 * 计算参与展示的年份列表（升序）
 * 与 computeDailySeasonalCore 使用完全相同的起止年份逻辑，
 * 保证明细表行数与季节性叠线图的年份曲线数量一致
 * @param {number} baseStartYear 数据起始年份
 * @param {string} yearRange 'all' | '3' | '5' | '10'
 */
function resolveYearList(baseStartYear, yearRange) {
  const currentYear = 2026
  let startYear = baseStartYear
  if (yearRange && yearRange !== 'all') {
    startYear = Math.max(baseStartYear, currentYear - parseInt(yearRange))
  }
  const years = []
  for (let y = startYear; y <= currentYear; y++) years.push(y)
  return years
}

/**
 * 真实数据12月明细计算：行与季节性叠线图年份一致（交割年），
 * 月末收盘价取自该年合约的完整周期序列（含上市年12月，作为1月涨跌基准），
 * 交割月之后的月份为 null（合约已交割）
 */
function computeRealMonthlyDetail(contracts, symbolCode, contractMonth, indexMode, yearRange) {
  const currentYear = contracts[contracts.length - 1].deliveryYear
  let startYear = contracts[0].deliveryYear
  if (yearRange && yearRange !== 'all') {
    startYear = Math.max(startYear, currentYear - parseInt(yearRange))
  }

  const byYear = new Map(contracts.map(c => [c.deliveryYear, c]))
  const expiryMonth = parseInt(contractMonth)

  const rows = []
  for (let year = startYear; year <= currentYear; year++) {
    const yy = String(year).slice(2)
    const contractName = `${symbolCode}${yy}${contractMonth}`
    const c = byYear.get(year)
    const values = []

    if (!c) {
      rows.push({ contract: contractName, values: new Array(12).fill(null) })
      continue
    }

    // 月末收盘价：在合约自身序列中查找（序列覆盖上市年9月~交割年9月）
    const monthEndClose = (y, m) => {
      const prefix = `${y}-${String(m).padStart(2, '0')}`
      let last = null
      for (const p of c.series) {
        if (p.date.startsWith(prefix)) last = p.close
      }
      return last
    }

    for (let month = 1; month <= 12; month++) {
      if (month > expiryMonth) {
        values.push(null)
        continue
      }
      const cur = monthEndClose(year, month)
      // 1月以本合约上市年12月末收盘为基准，其余与上月末比较
      const prev = month === 1 ? monthEndClose(year - 1, 12) : monthEndClose(year, month - 1)
      if (cur === null || prev === null || prev === 0) {
        values.push(null)
      } else if (indexMode === 'percent') {
        values.push(Math.round(((cur - prev) / prev) * 10000) / 100)
      } else {
        values.push(Math.round((cur - prev) * 100) / 100)
      }
    }
    rows.push({ contract: contractName, values })
  }
  return { contracts: rows.map(r => r.contract), rows }
}

/**
 * 计算12个月份涨跌明细表数据
 * 展示所选年份范围内每个同月份合约的逐月涨跌（行数与季节性叠线图年份数一致）
 * @returns { contracts: string[], rows: { contract: string, values: (number|null)[] }[] }
 */
export function getMonthlyDetailData(symbolCode, contractMonth, indexMode, yearRange) {
  const contracts = getRealContracts(symbolCode, contractMonth)
  if (contracts) {
    return computeRealMonthlyDetail(contracts, symbolCode, contractMonth, indexMode, yearRange)
  }

  const series = generateDailySeries(symbolCode, contractMonth)
  const symbol = findSymbol(symbolCode)

  // 年份范围与图表保持一致
  const contractYears = resolveYearList(symbol.startYear, yearRange)

  const rows = contractYears.map(year => {
    const yy = String(year).slice(2)
    const contractName = `${symbolCode}${yy}${contractMonth}`
    const values = []

    for (let month = 1; month <= 12; month++) {
      // 合约月份之后到期，后续月份无数据
      const contractExpiry = year * 100 + parseInt(contractMonth)
      const dataMonth = year * 100 + month
      if (dataMonth > contractExpiry) {
        values.push(null)
        continue
      }

      const prevMonth = month === 1 ? null : getMonthEndClose(series, year, month - 1)
      const curMonth = getMonthEndClose(series, year, month)

      if (curMonth === null) {
        values.push(null)
      } else if (prevMonth === null) {
        // 1月份：与上年12月比较
        const lastYearDec = getMonthEndClose(series, year - 1, 12)
        if (lastYearDec === null) {
          values.push(null)
        } else if (indexMode === 'percent') {
          values.push(Math.round(((curMonth - lastYearDec) / lastYearDec) * 10000) / 100)
        } else {
          values.push(Math.round((curMonth - lastYearDec) * 100) / 100)
        }
      } else if (indexMode === 'percent') {
        values.push(Math.round(((curMonth - prevMonth) / prevMonth) * 10000) / 100)
      } else {
        values.push(Math.round((curMonth - prevMonth) * 100) / 100)
      }
    }

    return { contract: contractName, values }
  })

  return { contracts: rows.map(r => r.contract), rows }
}

/**
 * 真实数据跨品种12月明细：行与季节性叠线图年份一致（共同交割年）。
 * 价差模式：每月值 = 本月末价差 - 上月末价差（1月以本合约上市年12月末为基准），
 *           即"价差的涨跌"，与单合约涨跌明细同口径；
 * 比值模式：逐月末比值水平（绝对水平，红绿以1为界）。
 * 交割月之后的月份为 null
 */
function computeRealCrossMonthlyDetail(pseudo, symA, symB, contractMonth, crossMode, yearRange) {
  const currentYear = pseudo[pseudo.length - 1].deliveryYear
  let startYear = pseudo[0].deliveryYear
  if (yearRange && yearRange !== 'all') {
    startYear = Math.max(startYear, currentYear - parseInt(yearRange))
  }
  const byYear = new Map(pseudo.map(c => [c.deliveryYear, c]))
  const expiryMonth = parseInt(contractMonth)
  const sep = crossMode === 'ratio' ? '/' : '-'

  const rows = []
  for (let year = startYear; year <= currentYear; year++) {
    const yy = String(year).slice(2)
    const contractName = `${symA}${sep}${symB} ${yy}${contractMonth}`
    const c = byYear.get(year)
    const values = []

    if (!c) {
      rows.push({ contract: contractName, values: new Array(12).fill(null) })
      continue
    }

    // 月末水平：在伪合约（该年逐日价差/比值）序列中查找
    const monthEndLevel = (y, m) => {
      const prefix = `${y}-${String(m).padStart(2, '0')}`
      let last = null
      for (const p of c.series) {
        if (p.date.startsWith(prefix)) last = p.close
      }
      return last
    }

    for (let month = 1; month <= 12; month++) {
      if (month > expiryMonth) {
        values.push(null)
        continue
      }
      const cur = monthEndLevel(year, month)
      if (crossMode === 'ratio') {
        values.push(cur === null ? null : Math.round(cur * 10000) / 10000)
      } else {
        // 价差涨跌：1月以本合约上市年12月末价差为基准，其余与上月末比较
        const prev = month === 1 ? monthEndLevel(year - 1, 12) : monthEndLevel(year, month - 1)
        values.push(cur === null || prev === null ? null : Math.round((cur - prev) * 100) / 100)
      }
    }
    rows.push({ contract: contractName, values })
  }
  return { contracts: rows.map(r => r.contract), rows }
}

/**
 * 跨品种12个月份明细表数据
 * 展示所选年份范围内逐月末价差/比值水平（行数与季节性叠线图年份数一致）
 * @param {string} symA 品种A代码
 * @param {string} symB 品种B代码
 * @param {string} contractMonth 合约月份
 * @param {string} crossMode 'spread' | 'ratio'
 * @param {string} yearRange 'all' | '3' | '5' | '10'
 */
export function getCrossMonthlyDetailData(symA, symB, contractMonth, crossMode, yearRange) {
  const contractsA = getRealContracts(symA, contractMonth)
  const contractsB = getRealContracts(symB, contractMonth)
  if (contractsA && contractsB) {
    const pseudo = computeRealCrossContracts(contractsA, contractsB, crossMode)
    if (pseudo.length) {
      return computeRealCrossMonthlyDetail(pseudo, symA, symB, contractMonth, crossMode, yearRange)
    }
  }

  const series = getCrossSeries(symA, symB, contractMonth, crossMode)
  const startYear = crossStartYear(symA, symB)
  const sep = crossMode === 'ratio' ? '/' : '-'

  // 年份范围与图表保持一致
  const contractYears = resolveYearList(startYear, yearRange)

  const rows = contractYears.map(year => {
    const yy = String(year).slice(2)
    const contractName = `${symA}${sep}${symB} ${yy}${contractMonth}`
    const values = []

    for (let month = 1; month <= 12; month++) {
      const contractExpiry = year * 100 + parseInt(contractMonth)
      const dataMonth = year * 100 + month
      if (dataMonth > contractExpiry) {
        values.push(null)
        continue
      }
      const curMonth = getMonthEndClose(series, year, month)
      if (crossMode === 'ratio') {
        values.push(curMonth === null ? null : Math.round(curMonth * 10000) / 10000)
      } else {
        // 价差涨跌：1月以上年12月末价差为基准，其余与上月末比较
        const prevMonth = month === 1
          ? getMonthEndClose(series, year - 1, 12)
          : getMonthEndClose(series, year, month - 1)
        values.push(curMonth === null || prevMonth === null
          ? null
          : Math.round((curMonth - prevMonth) * 100) / 100)
      }
    }

    return { contract: contractName, values }
  })

  return { contracts: rows.map(r => r.contract), rows }
}

// ============ 跨月价差（同品种、不同到期月份） ============

/**
 * 生成跨月价差日线序列 = 同品种 月份A合约 - 月份B合约
 * @param {string} symbol 品种代码
 * @param {string} monthA 合约月份A
 * @param {string} monthB 合约月份B
 */
export function getCrossMonthSeries(symbol, monthA, monthB) {
  const seriesA = generateDailySeries(symbol, monthA)
  const seriesB = generateDailySeries(symbol, monthB)
  const mapB = new Map(seriesB.map(d => [d.date, d.close]))
  const out = []
  for (const a of seriesA) {
    const b = mapB.get(a.date)
    if (b === undefined || b === null) continue
    out.push({ date: a.date, close: Math.round((a.close - b) * 10000) / 10000 })
  }
  return out
}

/** 跨月价差季节性数据（各年价差日线走势叠加） */
export function getCrossMonthSeasonalData(symbol, monthA, monthB, yearRange) {
  const series = getCrossMonthSeries(symbol, monthA, monthB)
  return computeDailySeasonalCore(series, findSymbol(symbol).startYear, yearRange)
}

/** 跨月价差连续时序数据 */
export function getCrossMonthTimeSeriesData(symbol, monthA, monthB) {
  return sampleSeries(getCrossMonthSeries(symbol, monthA, monthB))
}

/**
 * 跨月价差12个月份明细表
 * 行标签形如 "2409-2501"，清晰标识价差对应的两个合约月份
 * （若 monthB < monthA，则B合约滚动至次年）
 * 行数与季节性叠线图年份数一致
 * 口径：每月值 = 本月末价差 - 上月末价差（1月以上年12月末为基准），即"价差的涨跌"
 * @param {string} yearRange 'all' | '3' | '5' | '10'
 */
export function getCrossMonthDetailData(symbol, monthA, monthB, yearRange) {
  const series = getCrossMonthSeries(symbol, monthA, monthB)
  const startYear = findSymbol(symbol).startYear

  // 年份范围与图表保持一致
  const contractYears = resolveYearList(startYear, yearRange)

  const rows = contractYears.map(year => {
    const yyA = String(year).slice(2)
    const yearB = parseInt(monthB) >= parseInt(monthA) ? year : year + 1
    const yyB = String(yearB).slice(2)
    const contractName = `${yyA}${monthA}-${yyB}${monthB}`
    const values = []
    for (let month = 1; month <= 12; month++) {
      const cur = getMonthEndClose(series, year, month)
      // 价差涨跌：1月以上年12月末价差为基准，其余与上月末比较
      const prev = month === 1
        ? getMonthEndClose(series, year - 1, 12)
        : getMonthEndClose(series, year, month - 1)
      values.push(cur === null || prev === null ? null : Math.round((cur - prev) * 100) / 100)
    }
    return { contract: contractName, values }
  })

  return { contracts: rows.map(r => r.contract), rows }
}

/**
 * 获取数据更新日期：优先真实数据的最新更新日期，无则回退 mock 日期
 */
export function getDataUpdateDate() {
  return getRealDataUpdateDate() || '2026-06-02'
}
