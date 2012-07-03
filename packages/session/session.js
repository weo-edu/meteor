// XXX could use some tests
_Session = function(obj) {
  var self = this;
  this.keys = {};
  this.key_deps = {};
  this.key_value_deps = {};

  _.each(obj,function(val,key) {
    self.set(key,val);
  })
}

_.extend(_Session.prototype, {
  // XXX remove debugging method (or improve it, but anyway, don't
  // ship it in production)
  dump_state: function () {
    var self = this;
    console.log("=== Session state ===");
    for (var key in self.key_deps) {
      var ids = _.keys(self.key_deps[key]);
      if (!ids.length)
        continue;
      console.log(key + ": " + _.reject(ids, function (x) {return x === "_once"}).join(' '));
    }

    for (var key in self.key_value_deps) {
      for (var value in self.key_value_deps[key]) {
        var ids = _.keys(self.key_value_deps[key][value]);
        if (!ids.length)
          continue;
        console.log(key + "(" + value + "): " + _.reject(ids, function (x) {return x === "_once";}).join(' '));
      }
    }
  },

  setMulti: function(obj) {
    var self = this;
    var contexts = {};
    _.each(obj,function(value,key) {
      var old_value = self.keys[key];
      if (value === old_value)
        return;
      self.keys[key] = value;

      var invalidate = function (map) {
        if (map)
          for (var id in map) 
            contexts[id] = map[id];
      };

      self._ensureKey(key);
      invalidate(self.key_deps[key]);
      invalidate(self.key_value_deps[key][old_value]);
      invalidate(self.key_value_deps[key][value]);

    });

    _.each(contexts,function(context) {
      context.invalidate();
    });

  },

  set: function (key, value) {
    console.log('set',key,value);
    var self = this;

    var old_value = self.keys[key];
    if (_.isEqual(value,old_value))
      return;
    console.log('not equal');
    self.keys[key] = value;

    var invalidate = function (map) {
      if (map)
        for (var id in map)
          map[id].invalidate();
    };

    self._ensureKey(key);
    invalidate(self.key_deps[key]);
    invalidate(self.key_value_deps[key][old_value]);
    invalidate(self.key_value_deps[key][value]);
  },

  get: function (key) {
    var self = this;
    var context = Meteor.deps.Context.current;
    self._ensureKey(key);

    if (context && !(context.id in self.key_deps[key])) {
      self.key_deps[key][context.id] = context;
      context.on_invalidate(function () {
        delete self.key_deps[key][context.id];
      });
    }

    return self.keys[key];
  },

  all: function() {
    var self = this;

    var obj = {};
    _.each(self.keys,function(value,key) {
      obj[key] = self.get(key);
    });
    console.log('obj',obj)
    return obj;
  },

  equals: function (key, value) {
    var self = this;
    var context = Meteor.deps.Context.current;

    if (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        value !== null && value !== undefined)
      throw new Error("Session.equals: value can't be an object");

    if (context) {
      self._ensureKey(key);
      if (!(value in self.key_value_deps[key]))
        self.key_value_deps[key][value] = {};

      if (!(context.id in self.key_value_deps[key][value])) {
        self.key_value_deps[key][value][context.id] = context;
        context.on_invalidate(function () {
          delete self.key_value_deps[key][value][context.id];

          // clean up [key][value] if it's now empty, so we don't use
          // O(n) memory for n = values seen ever
          for (var x in self.key_value_deps[key][value])
            return;
          delete self.key_value_deps[key][value];
        });
      }
    }

    return self.keys[key] === value;
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.key_deps)) {
      self.key_deps[key] = {};
      self.key_value_deps[key] = {};
    }
  }
});



Session = new _Session;


if (Meteor._reload) {
  Meteor._reload.on_migrate('session', function () {
    // XXX sanitize and make sure it's JSONible?
    return [true, {keys: Session.keys}];
  });

  (function () {
    var migration_data = Meteor._reload.migration_data('session');
    if (migration_data && migration_data.keys) {
      Session.keys = migration_data.keys;
    }
  })();
}