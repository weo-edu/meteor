(function() {

Reactive.Store = Store;

function Store(name,obj) {
  var self = this;

  this._data = {};

  Reactive.Var.assignName(this._data,name);

  if (obj) {
    _.each(obj, function(val,key) {
      self.set(key,val);
    });
  }
}

Store.prototype.set = function(key,val) {
  this._ensureKey(key);
  return this._data[key](val);
}

Store.prototype.get = function(key) {
  this._ensureKey(key);
  return this._data[key]();
}

Store.prototype.equals = function(key,val) {
  this._ensureKey(key);
  return this._data[key].equals(val);
}

Store.prototype.all = function() {
  var self = this;
  var obj = {};
  _.each(self._data,function(value,key) {
    if (key === '_reload_name') return;
    obj[key] = self.get(key);
  });
  return obj;
}
Store.prototype.clear = function(){
  var self = this;
  _.each(self._data,function(value,key) {
    if (key === '_reload_name') return;
    self._data[key].clear();
  });
}
Store.prototype._ensureKey = function(key) {
  if (!(key in this._data)) {
    Reactive.Var.attach(this._data,key);
  }
}

})();