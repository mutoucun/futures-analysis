/**
 * 真实数据访问层
 * ==============
 * 静态 JSON 位于 src/data/futures/，每个 品种+合约月份 一个文件，
 * 由 Python 脚本（scripts/build_data_json.py）从交易所/新浪源清洗生成。
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
 */

// Vite 原生支持 JSON 导入；eager 模式同步加载，保持现有数据函数同步调用语义
const modules = import.meta.glob('./futures/*.json', { eager: true })

// 索引：'RB_09' -> payload
const realDataIndex = {}
for (const mod of Object.values(modules)) {
  const payload = mod.default || mod
  if (payload && payload.symbol && payload.contractMonth) {
    realDataIndex[`${payload.symbol}_${payload.contractMonth}`] = payload
  }
}

/** 是否存在指定 品种+合约月份 的真实数据 */
export function hasRealData(symbolCode, contractMonth) {
  return !!realDataIndex[`${symbolCode}_${contractMonth}`]
}

/**
 * 获取真实数据的历年合约列表（按交割年升序）
 * @returns {Array<{code, deliveryYear, series}>} 无真实数据时返回 null
 */
export function getRealContracts(symbolCode, contractMonth) {
  const payload = realDataIndex[`${symbolCode}_${contractMonth}`]
  if (!payload) return null
  return [...payload.contracts].sort((a, b) => a.deliveryYear - b.deliveryYear)
}

/** 真实数据的最新更新日期（取所有已加载文件中的最大值），无则返回 null */
export function getRealDataUpdateDate() {
  let max = null
  for (const payload of Object.values(realDataIndex)) {
    if (payload.updatedAt && (!max || payload.updatedAt > max)) max = payload.updatedAt
  }
  return max
}
