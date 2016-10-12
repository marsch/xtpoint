import _ from 'underscore'

const pointRegistry = {}

const createInvoke = (point, ext) => {
  return function(name, context) {
    const args = Array.from(arguments).slice(2)
    const fn = ext[name]
    if(fn) {
      return fn.apply(context, args)
    }
  }
}

const indexSorter = (a, b) => {
  if (a.index === 'first') {
      return -1;
  }
  if (b.index === 'first') {
      return 1;
  }
  if (a.index === 'last') {
      return 1;
  }
  if (b.index === 'last') {
      return -1;
  }
  return a.index - b.index;
};


class Point {
  constructor(config) {
    this.id = String(config.id)
    this.extensions = []
    this.orphans = {}
    this.disabled = {}
  }

  has(id) {
    return this.extensions.filter((ext) => {
      return ext.id === id
    }).length > 0
  }

  list() {
    const self = this
    return _.chain(this.extensions).filter(function(obj) {
      return !self.disabled[obj.id] && !self.disabled['*']
    })
  }

  sort() {
    let basicList = []
    let befores = this.orphans.before || {}
    let afters = this.orphans.after || {}
    let circleGuard = {}

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
      let list;
      if(ext.before) {
        list = befores[ext.before];
        if (!list) {
          list = befores[ext.before] = [];
        }
      } else if (ext.after) {
        list = afters[ext.after];
        if (!list) {
            list = afters[ext.after] = [];
        }
      } else {
        list = basicList;
      }
      list.push(ext)
    })

    //renew
    this.extensions = []
    basicList.sort(indexSorter)
    basicList.forEach(fnAddExtension)
    this.orphans.before = befores;
    this.orphans.after = afters;
  }

  extend(extension) {
    if (extension.invoke) {
      console.error(extension);
      throw new Error('Extensions must not have their own invoke method');
    }

    if (!extension.id) {
      extension.id = 'default';
      extension.index = extension.index || 100;
    } else {
      extension.index = extension.index || 1000000000;
    }

    if(!this.has(extension.id)) {
      extension.invoke = createInvoke(this, extension);
      this.extensions.push(extension)
      this.sort()
    }

    return this
  }

  invoke(name, context) {
    console.log('invoking', name, this)
    const o = this.list()
    const args = ['invoke'].concat(Array.from(arguments))
    // @marsch: this is done intention, please ask before remove
    try {
      return o.invoke.apply(o, args)
    } catch (e) {
      console.error(e)
    }
  }

  get(id, callback) {
    let extension = _(this.extensions).chain()
        .filter(function (obj) { return obj.id === id; }).first().value();

    if (extension) {
        callback(extension);
        this.sort();
    }

    return this;
  }

  disable(id) {
    this.disabled[id] = true
    return this
  }

  enable(id) {
    delete this.disabled[id]
    return
  }

  each(cb) {
    this.list().each(cb)
    return this
  }

  map(cb) {
    return this.list().map(cb)
  }

  filter(cb) {
    return this.list().select(cb).value()
  }

  reduce(cb, memo) {
    return this.list().inject(cb, memo).value()
  }

  pluck(id) {
    return this.list().pluck(id).value()
  }

  isEnabled(id) {
    return !this.disabled[id] && !this.disabled['*']
  }

  count() {
    return this.list().value().length
  }

  exec(methodName, context) {
    const args = Array.from(arguments)
    return this.reduce(function(prev, ext) {
      let extendedArgs = args.slice(2) //skip methodname and context
      extendedArgs.unshift(prev) // at this as the first argument
      extendedArgs = [methodName, context].concat(extendedArgs)
      if(!prev) {
        return ext.invoke.apply(context, extendedArgs)
      }
      return ext.invoke.apply(context, extendedArgs)
    })
  }

}

const externalApi = {
  point: (id = '') => {
    if(pointRegistry[id] !== undefined) {
      return pointRegistry[id]
    }
    return (pointRegistry[id] = new Point({id: id}))
  },
  keys: () => {
    return Object.keys(pointRegistry)
  }
}

export default externalApi
