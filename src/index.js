import _ from 'underscore'

const pointRegistry = {}

/**
 * create a function to invoke [with a context]
 *
 * @param  {string} point
 * @param  {object:Extension} ext
 * @return {function}
 */
const createInvoke = (point, ext) => {
  return function(name, context) {
    const args = Array.from(arguments).slice(2)
    const fn = ext[name]
    if (fn) {
      return fn.apply(context, args)
    }
  }
}

/**
 * @param  {object<.index>} a check index
 * @param  {object<.index>} b check index
 * @return int
 */
const indexSorter = (a, b) => {
  if (a.index === 'first') return -1
  if (b.index === 'first') return 1
  if (a.index === 'last') return 1
  if (b.index === 'last') return -1
  return a.index - b.index
}

class Point {
  /**
   * @param {obj} config
   */
  constructor(config) {
    this.id = String(config.id)
    this.extensions = []
    this.orphans = {}
    this.disabled = {}
  }

  /**
   * look for existing extension
   * @return {bool}
   */
  has(id) {
    return this.extensions.filter((ext) => {
      return ext.id === id
    }).length > 0
  }

  /**
   * @see this.extensions
   * @return array<Object:Extension>
   */
  list() {
    const self = this
    return _.chain(this.extensions).filter(function(obj) {
      return !self.disabled[obj.id] && !self.disabled['*']
    })
  }

  /**
   * sorts using a circleGuard,
   * @chainable
   */
  sort() {
    const basicList = []
    const befores = this.orphans.before || {}
    const afters = this.orphans.after || {}
    const circleGuard = {}

    const fnAddExtension = (ext) => {
      if (circleGuard[ext.id]) {
        throw new Error('Circular References detected for extension point ' + self.id + ' and extension ' + ext.id);
      }
      circleGuard[ext.id] = true
      const before = befores[ext.id]
      if (before) {
        delete befores[ext.id]
        before.sort(indexSorter)
        before.forEach(fnAddExtension)
      }
      this.extensions.push(ext)
      const after = afters[ext.id];
      if (after) {
        delete afters[ext.id]
        after.sort(indexSorter)
        after.forEach(fnAddExtension)
      }
      delete circleGuard[ext.id];
    }

    this.extensions.forEach((ext) => {
      let list
      if (ext.before) {
        list = befores[ext.before]
        if (!list) {
          list = befores[ext.before] = []
        }
      } else if (ext.after) {
        list = afters[ext.after]
        if (!list) {
          list = afters[ext.after] = []
        }
      } else {
        list = basicList
      }
      list.push(ext)
    })

    // renew
    this.extensions = []
    basicList.sort(indexSorter)
    basicList.forEach(fnAddExtension)
    this.orphans.before = befores
    this.orphans.after = afters

    return this
  }

  /**
   * @param {object} extension
   *
   * @chainable
   */
  extend(extension) {
    if (extension.invoke) {
      console.error(extension)
      throw new Error('Extensions must not have their own invoke method')
    }

    if (!extension.id) {
      extension.id = 'default'
      extension.index = extension.index || 100
    } else {
      extension.index = extension.index || 1000000000
    }

    if (!this.has(extension.id)) {
      extension.invoke = createInvoke(this, extension)
      this.extensions.push(extension)
      this.sort()
    }

    return this
  }

  /**
   * @param string name
   * @param context context
   * @chainable
   */
  invoke(name, context) {
    const allModules = this.list()
    const args = ['invoke'].concat(Array.from(arguments))
    // @marsch: this is done intention, please ask before remove
    try {
      return allModules.invoke.apply(allModules, args)
    } catch (e) {
      console.log("could not invoke properly...")
      console.error(e)
    }

    return this
  }

  /**
   * return the object, remove it from the list
   *
   * @param {string} methodName
   * @param {mixed} context (usually obj)
   * @return {array} ids
   */
  exec(methodName, context) {
    const args = Array.from(arguments)
    return this.reduce(function(prev, ext, list) {
      if (!prev) {
        return ext.invoke.apply(context, args)
      }
      return ext.invoke.apply(context, args)
    })
  }

  /**
   * get the plugin
   * 1) filter plugins to find
   * 2) if found, pass extension to callback and re-sort
   *
   * @TODO: this only matches ids ===, needs wildcards
   *
   * @param string id
   * @param func() callback
   *
   * @chainable
   */
  get(id, callback) {
    const extension = _(this.extensions).chain()
      .filter(function (obj) { return obj.id === id })
      .first()
      .value()

    if (extension) {
      callback(extension)
      this.sort()
    }

    return this
  }

  /**
   * @param {string} id
   * @see this.list
   * @chainable
   */
  disable(id) {
    this.disabled[id] = true
    return this
  }

  /**
   * @param {string} id
   * @see this.list
   * @chainable
   */
  enable(id) {
    delete this.disabled[id]
    return
  }

  /**
   * call a cb for each of the list
   * @param {func} cb
   * @chainable
   */
  each(cb) {
    this.list().each(cb)
    return this
  }

  /**
   * call a map cb for each of the list
   * @param {func} cb
   * @chainable
   */
  map(cb) {
    return this.list().map(cb)
  }

  /**
   * call a select cb each of the list
   * @param {func} cb
   * @return {array<mixed>}
   */
  filter(cb) {
    return this.list().select(cb).value()
  }

  /**
   * call a inject cb for this.list()
   * @param {func} cb
   * @param {mixed} memo (memory, initial value)
   * @return {array<mixed>}
   */
  reduce(cb, memo) {
    return this.list().inject(cb, memo).value()
  }

  /**
   * return the object, remove it from the list
   * @return {array} ids
   */
  pluck(id) {
    return this.list().pluck(id).value()
  }

  /**
   * return the object, remove it from the list
   * @return { array } ids
   */
  pluck(id) {
    return this.list().pluck(id).value()
  }

  /**
   * @return boolean
   */
  isEnabled(id) {
    return !this.disabled[id] && !this.disabled['*']
  }

  /**
   * length of the values in the list
   * @return int
   */
  count() {
    return this.list().value().length
  }

  /**
   * @param {string} methodName
   * @param {object} context
   * @return {mixed}
   */
  exec(methodName, context) {
    const args = Array.from(arguments)
    return this.reduce(function(prev, ext) {
      let extendedArgs = args.slice(2) // skip methodname and context
      extendedArgs.unshift(prev) // at this as the first argument
      extendedArgs = [methodName, context].concat(extendedArgs)
      if (!prev) {
        return ext.invoke.apply(context, extendedArgs)
      }
      return ext.invoke.apply(context, extendedArgs)
    })
  }

}

const externalApi = {
  /**
   * @param  {String} [id='']
   * @return {object:Extension}
   */
  point: (id = '') => {
    if (pointRegistry[id] !== undefined)
      return pointRegistry[id]
    return (pointRegistry[id] = new Point({id: id}))
  },

  /**
   * @return {array}
   */
  keys: () => {
    return Object.keys(pointRegistry)
  }
}

export default externalApi
