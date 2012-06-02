LocalStore = function() {
	this._store = {};

	this.next_gid = 1;

	this.gets = {};

	this.current_snapshot = null;

	this.paused = false;
}



LocalStore.prototype.get = function(key, options) {
	return new Localstore.Get(this, key, options);
}

LocalStore.Get = function(store,key,options) {
	if (!options) options = {};
	this.key = key;
	this.store = store;

	this.store_val = null;

	if (typeof Meteor === "object" && Meteor.deps)
    this.reactive = (options.reactive === undefined) ? true : options.reactive;


}

LocalStore.Get.prototype.fetch = function() {
	var self = this;

	if (self.store_val === null)
			self.store_val = self._getRawValue();

	if (self.reactive) 
		self._markAsReactive({set:true});

	return LocalStore._deepcopy(self.store_val);

}

// the handle that comes back from observe.
LocalCollection.LiveResult = function () {};

LocalStore.Get.prototype.observe = function(options) {
	var self = this;

	var gid = self.store.next_gid++;

	var get = self.store.gets[gid] = {
		key: self.key,
		result: self._getRawValue(),
		result_snapshot: null,
		get: self
	};

	// wrap callbacks we were passed. callbacks only fire when not paused
  // and are never undefined.
  var if_not_paused = function (f) {
    if (!f)
      return function () {};
    return function (/*args*/) {
      if (!self.store.paused)
        f.apply(this, arguments);
    };
  };

	get.set = if_not_paused(options.set);

	if (!options._suppress_initial && !self.store.paused)
		get.set(LocalStore._deepcopy(get.result));

	var handle = new LocalStore.LiveResult;
  _.extend(handle, {
    collection: self.store,
    stop: function () {
      delete self.store.gets[gid];
    }
  });
  return handle;
}

LocalStore.Get.prototype._getRawValue = function() {
	var self = this;
	return self.store._store[self.key];
}

LocalStore.Get.prototype._markAsReactive = function(options) {
	var self = this;

	var context = Meteor.deps.Context.current;
	if (!context) return;

	var invalidate = _.bind(context.invalidate,context);
	var handle = self.observe({ set: options.set && invalidate,
                             _suppress_initial: true});
	context.on_invalidate(handle.stop);
}

LocalStore.prototype.set = function(key,value) {
	var self = this;

	old_value = LocalStore._deepcopy(self._store[key]);
	value = LocalStore._deepcopy(value);

	self._store[key] = value;

	for (var gid in self.gets) {
		var get = self.gets[gid];
		if (get.key === key) LocalStore.set(get,value,old_value);
	}

}

LocalStore.set = function(get,value,old_value) {
	get.set(LocalStore._deepcopy(value),old_value);
	get.result = value;
}

LocalStore._deepcopy = function (v) {
  if (typeof v !== "object")
    return v;
  if (v === null)
    return null; // null has typeof "object"
  if (_.isArray(v)) {
    var ret = v.slice(0);
    for (var i = 0; i < v.length; i++)
      ret[i] = LocalStore._deepcopy(ret[i]);
    return ret;
  }
  var ret = {};
  for (var key in v)
    ret[key] = LocalStore._deepcopy(v[key]);
  return ret;
};


// At most one snapshot can exist at once. If one already existed,
// overwrite it.
// XXX document (at some point)
// XXX test
// XXX obviously this particular implementation will not be very efficient
LocalStore.prototype.snapshot = function () {
  this.current_snapshot = {};
  for (var key in this.store)
    this.current_snapshot[key] = JSON.parse(JSON.stringify(this.store[key]));
};

// Restore (and destroy) the snapshot. If no snapshot exists, raise an
// exception.
// XXX document (at some point)
// XXX test
LocalStore.prototype.restore = function () {
  if (!this.current_snapshot)
    throw new Error("No current snapshot");
  this.docs = this.current_snapshot;
  this.current_snapshot = null;

  // Rerun all queries from scratch. (XXX should do something more
  // efficient -- diffing at least; ideally, take the snapshot in an
  // efficient way, say with an undo log, so that we can efficiently
  // tell what changed).
  for (var gid in this.gets) {
    var get = this.gets[gid];

    var old_result = query.result;

    get.result = query.get._getRawValue();

    if (!this.paused)
      LocalStore._diffGet(old_result, get.result, get, true);
  }
};


// Pause the observers. No callbacks from observers will fire until
// 'resumeObservers' is called.
LocalStore.prototype.pauseObservers = function () {
  // No-op if already paused.
  if (this.paused)
    return;

  // Set the 'paused' flag such that new observer messages don't fire.
  this.paused = true;

  // Take a snapshot of the query results for each query.
  for (var gid in this.gets) {
    var get = this.get[gid];

    get.result_snapshot = LocalStore._deepcopy(get.result);
  }
};

// Resume the observers. Observers immediately receive change
// notifications to bring them to the current state of the
// database. Note that this is not just replaying all the changes that
// happened during the pause, it is a smarter 'coalesced' diff.
LocalStore.prototype.resumeObservers = function () {
  // No-op if not paused.
  if (!this.paused)
    return;

  // Unset the 'paused' flag. Make sure to do this first, otherwise
  // observer methods won't actually fire when we trigger them.
  this.paused = false;

  for (var gid in this.gets) {
    var get = this.gets[gid];
    // Diff the current results against the snapshot and send to observers.
    // pass the query object for its observer callbacks.
    LocalStore._diffGet(get.result_snapshot, get.result, get, true);
    get.result_snapshot = null;
  }

};

LocalStore._diffGet = function(old_result, new_result, observer, deepcopy) {
	var mdc = (deepcopy ? LocalStore._deepcopy : _.identity);
	if (!_.isEqual(new_result,old_result)) {
		observer.set(mdc(new_result),old_result);
	}
}
