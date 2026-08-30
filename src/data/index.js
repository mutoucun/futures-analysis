/**
 * 真实数据访问层（按需加载版）
 * ==============
 * 静态 JSON 位于 src/data/futures/，每个 品种+合约月份 一个文件，
 * 由 Python 脚本（scripts/build_symbol.py）从交易所/新浪源清洗生成。
 *
 * 文件结构：
 * {
 *   symbol, contractMonth, unit, updatedAt,
 *   contracts: [{ code, deliveryYear, series: [{date, close}] }]
 * }
 * 每个合约的 series 为其完整生命周期（上市日 ~ 最后一个有成交的交易日）。
 *
 * 前端三种视图均由 contracts 派生：
 *   季节性叠线图 —— 按交割年切片（1月~交割月），每年一条独立合约曲线
 *   连续时序图　 —— 全部合约完整周期首尾拼接（如"09连续"）
 *   12月明细表　 —— 月末收盘价，1月以本合约上市年12月为基准
 *
 * 尚未生成真实 JSON 的品种/月份自动回退到 mock 数据（见 mock/data.js）。
 *
 * 加载策略：品种多达 50 个、每月一个文件，全量 eager 打包会使首屏 bundle
 * 膨胀到 20MB+。因此采用「清单同步 + 内容按需」：
 *   - import.meta.glob 非 eager 模式，构建时仅登记文件路径（同步可读），
 *     hasRealData / getAvailableMonths / hasAnyRealData 只查清单，保持同步语义；
 *   - JSON 内容由 ensureRealData() 在查询前动态导入并缓存，
 *     getRealContracts 同步读取缓存（未加载/无数据返回 null，调用方回退 mock）。
 */

// 非 eager：值为 () => import(...) 动态导入函数，键为文件路径（构建期静态确定）
const loaders = import.meta.glob('./futures/*.json')

// 索引：'RB_09' -> 动态导入函数（从文件名解析，无需加载内容）
const realDataLoaders = {}
for (const path of Object.keys(loaders)) {
  const name = path.split('/').pop().replace(/\.json$/, '')
  realDataLoaders[name] = loaders[path]
}

// 已加载 payload 缓存 与 进行中的加载 Promise（防止同一文件重复请求）
const loadedPayloads = {}
const pendingLoads = {}

// ============ 实时数据覆盖层 ============
// refreshSinaData 拉取的新浪最新日K通过 updateLiveContracts 直接合并进
// loadedPayloads，后续 getRealContracts() 自动返回合并后的数据。
// 这样所有下游计算函数（季节性/时序/明细）无需任何改动即可获得最新数据。
let liveUpdatedAt = null

/**
 * 合并新浪实时数据到已加载的 JSON payload（原地更新内存缓存）
 * @param {string} symbolCode 品种代码
 * @param {string} contractMonth 合约月份
 * @param {Map<number, Array<{date, close}>>} sinaData deliveryYear -> series
 * @returns {{ contractsUpdated: number, pointsAdded: number }}
 */
export function updateLiveContracts(symbolCode, contractMonth, sinaData) {
  const key = `${symbolCode}_${contractMonth}`
  let stats = { contractsUpdated: 0, pointsAdded: 0 }

  // 如果没有基础 JSON，创建合成 payload（仅含 Sina 数据）
  if (!loadedPayloads[key]) {
    const sym = _findSym(symbolCode)
    const contracts = []
    for (const [deliveryYear, series] of sinaData) {
      if (series.length === 0) continue
      contracts.push({
        code: `${symbolCode.toLowerCase()}${String(deliveryYear).slice(2)}${contractMonth}`,
        deliveryYear,
        series: series.map(p => ({ date: p.date, close: p.close }))
      })
    }
    if (contracts.length === 0) return stats
    loadedPayloads[key] = {
      symbol: symbolCode,
      contractMonth,
      unit: sym ? sym.unit : '',
      updatedAt: new Date().toISOString().slice(0, 10),
      contracts
    }
    // 同步注册到 realDataLoaders 以便 hasRealData 能识别
    realDataLoaders[key] = realDataLoaders[key] || (() => Promise.resolve(loadedPayloads[key]))
    stats.contractsUpdated = contracts.length
    stats.pointsAdded = contracts.reduce((s, c) => s + c.series.length, 0)
    return stats
  }

  // 有基础 JSON：逐合约合并（按 date 去重，Sina 数据优先覆盖）
  const payload = loadedPayloads[key]
  const byYear = new Map(payload.contracts.map(c => [c.deliveryYear, c]))

  for (const [deliveryYear, sinaSeries] of sinaData) {
    if (sinaSeries.length === 0) continue
    const existing = byYear.get(deliveryYear)

    if (!existing) {
      // 新合约：直接添加
      const newContract = {
        code: `${symbolCode.toLowerCase()}${String(deliveryYear).slice(2)}${contractMonth}`,
        deliveryYear,
        series: sinaSeries.map(p => ({ date: p.date, close: p.close }))
      }
      payload.contracts.push(newContract)
      byYear.set(deliveryYear, newContract)
      stats.contractsUpdated++
      stats.pointsAdded += sinaSeries.length
    } else {
      // 已有合约：按日期合并（Sina 覆盖同日期旧值，新日期追加）
      const dateMap = new Map(existing.series.map(p => [p.date, p.close]))
      let added = 0
      for (const p of sinaSeries) {
        if (!dateMap.has(p.date)) added++
        dateMap.set(p.date, p.close)
      }
      existing.series = [...dateMap.entries()]
        .sort((a, b) => a[0] < b[0] ? -1 : 1)
        .map(([date, close]) => ({ date, close }))
      stats.pointsAdded += added
      stats.contractsUpdated++
    }
  }

  payload.updatedAt = new Date().toISOString().slice(0, 10)
  return stats
}

/** 设置实时数据最近更新时间（由 sina.js refreshAll 调用） */
export function setLiveUpdatedAt(dateStr) {
  liveUpdatedAt = dateStr
}

/**
 * 用服务端返回的完整 JSON 替换内存中的 payload。
 * 供 /api/update 刷新后直接注入最新数据（无需重新加载 chunk）。
 */
export function replacePayload(symbolCode, contractMonth, payload) {
  const key = `${symbolCode}_${contractMonth}`
  if (payload && payload.contracts) {
    loadedPayloads[key] = payload
  }
}

/** 内部工具：从 EXCHANGES 查找品种（避免循环依赖 mock/data.js） */
function _findSym(code) {
  // 延迟引用，因为 EXCHANGES 在 mock/data.js 中定义，
  // 这里通过 tryImport 或直接返回 null 降级处理
  return null
}

/** 是否存在指定 品种+合约月份 的真实数据（同步，仅查文件清单） */
export function hasRealData(symbolCode, contractMonth) {
  return !!realDataLoaders[`${symbolCode}_${contractMonth}`]
}

/**
 * 按需加载指定 品种+合约月份 的真实数据（查询前调用）
 * 已加载则立即返回 true；无对应文件返回 false（调用方回退 mock）；
 * 加载失败返回 false 并清除挂起记录（允许后续重试）
 */
export async function ensureRealData(symbolCode, contractMonth) {
  const key = `${symbolCode}_${contractMonth}`
  if (loadedPayloads[key]) return true
  const loader = realDataLoaders[key]
  if (!loader) return false
  if (!pendingLoads[key]) {
    pendingLoads[key] = loader()
      .then(mod => {
        loadedPayloads[key] = mod.default || mod
        return true
      })
      .catch(err => {
        console.error(`真实数据加载失败 ${key}:`, err)
        delete pendingLoads[key]
        return false
      })
  }
  return pendingLoads[key]
}

/**
 * 获取真实数据的历年合约列表（按交割年升序）
 * 同步读取已加载缓存；未先调用 ensureRealData 或无真实数据时返回 null
 * @returns {Array<{code, deliveryYear, series}>}
 */
export function getRealContracts(symbolCode, contractMonth) {
  const payload = loadedPayloads[`${symbolCode}_${contractMonth}`]
  if (!payload) return null
  return [...payload.contracts].sort((a, b) => a.deliveryYear - b.deliveryYear)
}

/**
 * 该品种已有真实数据的合约月份列表（升序，如 ['01','05','10']）
 * 无任何真实数据时返回空数组（调用方据此回退到全月份 mock）
 */
export function getAvailableMonths(symbolCode) {
  const prefix = `${symbolCode}_`
  return Object.keys(realDataLoaders)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .sort()
}

/** 该品种是否存在任何月份的真实数据（同步，仅查文件清单） */
export function hasAnyRealData(symbolCode) {
  return Object.keys(realDataLoaders).some(key => key.startsWith(`${symbolCode}_`))
}

/** 真实数据的最新更新日期（取已加载文件中的最大值 + 实时刷新时间），无则返回 null */
export function getRealDataUpdateDate() {
  let max = null
  for (const payload of Object.values(loadedPayloads)) {
    if (payload.updatedAt && (!max || payload.updatedAt > max)) max = payload.updatedAt
  }
  // 实时刷新时间可能比任何 JSON 文件更新
  if (liveUpdatedAt && (!max || liveUpdatedAt > max)) max = liveUpdatedAt
  return max
}
