import * as Recharts from 'recharts'

// Patch React class component prototypes in Recharts to provide UNSAFE_ aliases
// for deprecated lifecycles like componentWillReceiveProps so React warnings are suppressed
try {
  Object.keys(Recharts).forEach(key => {
    const comp = Recharts[key]
    if (comp && comp.prototype) {
      // map common deprecated lifecycles to UNSAFE_ equivalents and remove originals
      const map = ['componentWillReceiveProps', 'componentWillMount', 'componentWillUpdate']
      map.forEach(fn => {
        if (comp.prototype[fn]) {
          const unsafe = 'UNSAFE_' + fn
          if (!comp.prototype[unsafe]) comp.prototype[unsafe] = comp.prototype[fn]
          try {
            // delete the old name so React doesn't warn about deprecated lifecycle
            delete comp.prototype[fn]
          } catch (e) {
            // not critical if delete fails
          }
        }
      })
    }
  })
} catch (e) {
  // ignore if patching fails
}

// Re-export commonly used components
export const {
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid
} = Recharts

export default Recharts
