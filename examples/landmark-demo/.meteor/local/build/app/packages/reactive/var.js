(function() {

var name_registry = {}

//XXX potential for memory leark, should problem delete objects on url change
var vals_by_obj = {}

if (Meteor._reload) {
  Meteor._reload.on_migrate('Reactive.Var',function() {
    return [true, vals_by_obj]
  });
  (function() {
    var migration_data = Meteor._reload.migration_data('Reactive.Var');
    if (migration_data) {
      vals_by_obj = migration_data;
    }
  })();
}

function Var(obj,attr) {
  if (!obj || !attr) throw new Error("var must be attached to obj");

  this.obj_name = obj._reload_name;
  if (!this.obj_name) throw new Error('obj must have name');
  this.obj_attr = attr;

  this.contexts = {};
  this.equals_contexts = {};
}

Var.assignName = function(obj,name) {
  if ('_reload_name' in obj) {
    throw new Error('object already has a reload name');
  }
  if (name in name_registry && Reactive.warnings) {
    console.warn('name already in registry: be very careful');
  }
  obj._reload_name = name;
  if (!(name in vals_by_obj)) vals_by_obj[name] = {};
  name_registry[name] = true;
}

Var.attach = function(obj,attr) {
  var v = new Var(obj,attr);
  obj[attr] = function(val,not_reactive) {
    if (val !== undefined) return v.set(val,not_reactive);
    else return v.get();
  }
  obj[attr].equals = function(val) {
    return v.equals(val);
  }

  obj[attr].val = function() {
    return v.get(true);
  }

  obj[attr].clear = function() {
    return v.set(undefined);
  }
}

Var.prototype.__defineGetter__('val',function() {
  return vals_by_obj[this.obj_name][this.obj_attr];
});

Var.prototype.__defineSetter__('val',function(val) {
  vals_by_obj[this.obj_name][this.obj_attr] = val;
});

Var.prototype.get = function(not_reactive) {
  var self = this;
  var context = Meteor.deps.Context.current;

  if (! not_reactive && context && !(context.id in this.contexts)) {
    this.contexts[context.id] = context;
    context.on_invalidate(function() {
      delete self.contexts[context.id];
    });
  }
  return this.val;
}

Var.prototype.set = function(val,not_reactive) {
  var old_val = this.val;
  if (_.isEqual(val,old_val))
    return val;
  this.val = val;
  if (not_reactive) return val;

  this._invalidate();
  this._invalidateEquals(old_val);
  this._invalidateEquals(val);
  return val;
}

Var.prototype.equals = function(val) {
  var equals_contexts = this.equals_contexts;
  var context = Meteor.deps.Context.current;
  if (context) {
    if (!(val in equals_contexts))
      equals_contexts[val] = {};

    if (!(context.id in equals_contexts[val])) {
      this.equals_contexts[val][context.id] = context;
      context.on_invalidate(function () {
        delete equals_contexts[val][context.id];

        if (_.keys(equals_contexts[val]).length == 0)
          delete equals_contexts[val];
      });
    }
  }
  return this.val === val;
}

Var.prototype._invalidate = function() {
  _.each(this.contexts,function(context) {
    context.invalidate();
  });
}

Var.prototype._invalidateEquals = function(val) {
  _.each(this.equals_contexts[val],function(context) {
    context.invalidate();
  })
}

Reactive.Var = {};
Reactive.Var.assignName = Var.assignName;
Reactive.Var.attach = Var.attach;

})();