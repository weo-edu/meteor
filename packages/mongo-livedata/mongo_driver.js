/**
 * Provide a synchronous Collection API using fibers, backed by
 * MongoDB.  This is only for use on the server, and mostly identical
 * to the client API.
 *
 * NOTE: the public API methods must be run within a fiber. If you call
 * these outside of a fiber they will explode!
 */

var path = __meteor_bootstrap__.require('path');
var MongoDB = __meteor_bootstrap__.require('mongodb');
var Future = __meteor_bootstrap__.require(path.join('fibers', 'future'));

// js2-mode AST blows up when parsing 'future.return()', so alias.
Future.prototype.ret = Future.prototype.return;

_Mongo = function (url) {
  var self = this;

  self.collection_queue = [];
  self.db_callbacks = [];

  MongoDB.connect(url, function(err, db) {
    if (err)
      throw err;
    self.db = db;

    // drain queue of pending callbacks
    var c;
    while ((c = self.collection_queue.pop())) {
      Fiber(function () {
        db.collection(c.name, c.callback);
      }).run();
    }

    while((c = self.db_callbacks.pop())) {
      c(db);
    }
  });
};

_Mongo.ObjectId = function(id) {
  return new MongoDB.ObjectID(id.toString());
};

_Mongo.prototype.withDB = function(cb) {
  var self = this;
  if (self.db) 
    cb(self.db);
  else
    self.db_callbacks.push(cb);
}

// protect against dangerous selectors.  falsey and {_id: falsey}
// are both likely programmer error, and not what you want,
// particularly for destructive operations.
_Mongo._rewriteSelector = function (selector) {
  // shorthand -- scalars match _id
  if ((typeof selector === 'string') || (typeof selector === 'number'))
    selector = {_id: selector};

  if (!selector || (('_id' in selector) && !selector._id))
    // can't match anything
    return {_id: Meteor.uuid()};
  else
    return selector;
};

// callback: lambda (err, collection) called when
// collection is ready to go, or on error.
_Mongo.prototype._withCollection = function(collection_name, callback) {
  var self = this;

  if (self.db) {
    self.db.collection(collection_name, callback);
  } else {
    self.collection_queue.push({name: collection_name, callback: callback});
  }
};

// This should be called synchronously with a write, to create a
// transaction on the current write fence, if any. After we can read
// the write, and after observers have been notified (or at least,
// after the observer notifiers have added themselves to the write
// fence), you should call 'committed()' on the object returned.
_Mongo.prototype._maybeBeginWrite = function () {
  var self = this;
  var fence = Meteor._CurrentWriteFence.get();
  if (fence)
    return fence.beginWrite();
  else
    return {committed: function () {}};
};

//////////// Public API //////////

// The write methods block until the database has confirmed the write
// (it may not be replicated or stable on disk, but one server has
// confirmed it.) (In the future we might have an option to turn this
// off, ie, to enqueue the request on the wire and return
// immediately.)  They return nothing on success, and raise an
// exception on failure.
//
// After making a write (with insert, update, remove), observers are
// notified asynchronously. If you want to receive a callback once all
// of the observer notifications have landed for your write, do the
// writes inside a write fence (set Meteor._CurrentWriteFence to a new
// _WriteFence, and then set a callback on the write fence.)
//
// Since our execution environment is single-threaded, this is
// well-defined -- a write "has been made" if it's returned, and an
// observer "has been notified" if its callback has returned.

_Mongo.prototype.insert = function (collection_name, document, write) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection" &&
      document.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }

  var write = self._maybeBeginWrite();

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    if (write !== false) {
      collection.insert(document, {safe: true}, function (err) {
        future.ret(err);
      });
    } else {
      future.ret();
    }
  });

  var err = future.wait();
  Meteor.refresh({collection: collection_name});
  write.committed();
  if (err)
    throw err;
};

_Mongo.prototype.remove = function (collection_name, selector, write) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection" &&
      selector.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }

  var write = self._maybeBeginWrite();

  // XXX does not allow options. matches the client.
  selector = _Mongo._rewriteSelector(selector);

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    if (write !== false) {
      collection.remove(selector, {safe: true}, function (err) {
        future.ret(err);
      });
    } else {
      future.ret();
    }
  });

  var err = future.wait();
  Meteor.refresh({collection: collection_name});
  write.committed();
  if (err)
    throw err;
};

_Mongo.prototype.update = function (collection_name, selector, mod, options) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection" &&
      selector.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }

  var write = self._maybeBeginWrite();

  selector = _Mongo._rewriteSelector(selector);
  if (!options) options = {};

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    var opts = {safe: true};
    // explictly enumerate options that minimongo supports
    if (options.upsert) opts.upsert = true;
    if (options.multi) opts.multi = true;

    if (options.write !== false) {
      collection.update(selector, mod, opts, function (err) {
        future.ret(err);
      });
    } else {
      future.ret();
    }
  });

  var err = future.wait();
  Meteor.refresh({collection: collection_name});
  write.committed();
  if (err)
    throw err;
};

_Mongo.prototype.findAndModify = function(collection_name, selector, sort, mod, options) {
  var self = this,
    write = self._maybeBeginWrite();
  
  var finish = Meteor.bindEnvironment(function() {
    Meteor.refresh({collection: collection_name});
    write.committed();
  }, function(e) {
    Meteor._debug('Exception while completing findAndModify:' + e.stack);
  });

  selector = _Mongo._rewriteSelector(selector);
  options = options || {};

  var future = new Future;
  self._withCollection(collection_name, function(err, collection) {
    if(err) {
      future.ret([false, err]);
      return;
    }

    collection.findAndModify(selector, sort, mod, options, function(err, obj) {
      if(err) {
        future.ret([false, err]);
        return;
      }

      finish();
      future.ret([true, obj]);
    });
  });

  var res = future.wait();
  if(! res[0])
    throw res[1];

  return res[1];
};

_Mongo.prototype.find = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return _Mongo._makeCursor(self, collection_name, selector, options);
};

_Mongo.prototype.findOne = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return self.find(collection_name, selector, options).fetch()[0];
};

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
_Mongo.prototype._ensureIndex = function (collectionName, index, options) {
  var self = this;
  options = _.extend({safe: true}, options);

  // We expect this function to be called at startup, not from within a method,
  // so we don't interact with the write fence.
  var future = new Future;
  self._withCollection(collectionName, function (err, collection) {
    if (err) {
      future.throw(err);
      return;
    }
    // XXX do we have to bindEnv or Fiber.run this callback?
    collection.ensureIndex(index, options, function (err, indexName) {
      if (err) {
        future.throw(err);
        return;
      }
      future.ret();
    });
  });
  future.wait();
};

// Cursors

// Returns a _Mongo.Cursor, or throws an exception on
// failure. Creating a cursor involves a database query, and we block
// until it returns.
_Mongo._makeCursor = function (mongo, collection_name, selector, options) {
  var future = new Future;

  options = options || {};
  selector = _Mongo._rewriteSelector(selector);

  mongo._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret([false, err]);
      return;
    }
    if(typeof selector === 'string')
      selector = {_id: _Mongo.ObjectId(selector)};
    else if(_.isArray(selector)) {
      try{
        for(var i in selector) {
          selector[i] = _Mongo.ObjectId(selector[i]);
        }
      } catch(e) {
        //  Do nothing
      }

      selector = {_id: {$in: selector}};
    }
    var cursor = collection.find(selector, options.fields, {
      sort: options.sort, limit: options.limit, skip: options.skip});
    future.ret([true, cursor]);
  });

  var result = future.wait();
  if (!(result[0]))
    throw result[1];

  return new _Mongo.Cursor(mongo, collection_name, selector, options,
                           result[1]);
};

// Do not call directly. Use _Mongo._makeCursor instead.
_Mongo.Cursor = function (mongo, collection_name, selector, options, cursor) {
  var self = this;

  if (!cursor)
    throw new Error("Cursor required");

  // NB: 'options' and 'selector' have already been preprocessed by _makeCursor
  self.mongo = mongo;
  self.collection_name = collection_name;
  self.selector = selector;
  self.options = options;
  self.cursor = cursor;
  self._synchronousNextObject = Future.wrap(cursor.nextObject.bind(cursor));
  self._synchronousCount = Future.wrap(cursor.count.bind(cursor));

  self.visited_ids = {};
};

_Mongo.Cursor.prototype._nextObject = function () {
  var self = this;
  while (true) {
    var doc = self._synchronousNextObject().wait();
    if (!doc || !doc._id) return null;
    if (self.visited_ids[doc._id]) continue;
    self.visited_ids[doc._id] = true;
    return doc;
  }
};

// XXX Make more like ECMA forEach:
//     https://github.com/meteor/meteor/pull/63#issuecomment-5320050
_Mongo.Cursor.prototype.forEach = function (callback) {
  var self = this;

  // We implement the loop ourself instead of using self.cursor.each, because
  // "each" will call its callback outside of a fiber which makes it much more
  // complex to make this function synchronous.
  while (true) {
    var doc = self._nextObject();
    if (!doc) return;
    callback(doc);
  }
};

// XXX Make more like ECMA map:
//     https://github.com/meteor/meteor/pull/63#issuecomment-5320050
// XXX Allow overlapping callback executions if callback yields.
_Mongo.Cursor.prototype.map = function (callback) {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(callback(doc));
  });
  return res;
};

_Mongo.Cursor.prototype.rewind = function () {
  var self = this;

  // known to be synchronous
  self.cursor.rewind();

  self.visited_ids = {};
};

_Mongo.Cursor.prototype.fetch = function () {
  var self = this;
  return self.map(_.identity);
};

_Mongo.Cursor.prototype.count = function () {
  var self = this;
  return self._synchronousCount().wait();
};

_Mongo.Cursor.prototype._getRawObjects = function (ordered) {
  var self = this;
  if (ordered) {
    return self.fetch();
  } else {
    var results = {};
    self.forEach(function (doc) {
      results[doc._id] = doc;
    });
    return results;
  }
};

// options to contain:
//  * callbacks for observe():
//    - added (object, before_index)
//    - changed (new_object, at_index, old_object)
//    - moved (object, old_index, new_index) - can only fire with changed()
//    - removed (object, at_index)
//  * callbacks for _observeUnordered():
//    - added (object)
//    - changed (new_object)
//    - removed (object)
//
// attributes available on returned LiveResultsSet
//  * stop(): end updates

_Mongo.Cursor.prototype.observe = function (options) {
  return new _Mongo.LiveResultsSet(this, true, options);
};

_Mongo.Cursor.prototype._observeUnordered = function (options) {
  return new _Mongo.LiveResultsSet(this, false, options);
};

_Mongo.LiveResultsSet = function (cursor, ordered, options) {
  var self = this;

  // copy my cursor, so that the observe can run independently from
  // some other use of the cursor.
  self.cursor = _Mongo._makeCursor(cursor.mongo,
                                   cursor.collection_name,
                                   cursor.selector,
                                   cursor.options);

  // expose collection name
  self.collection_name = cursor.collection_name;

  self.ordered = ordered;

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self.results = ordered ? [] : {};

  // state for polling
  self.dirty = false; // do we need polling?
  self.pending_writes = []; // people to notify when polling completes
  self.poll_running = false; // is polling in progress now?
  self.polling_suspended = false; // is polling temporarily suspended?

  // (each instance of the class needs to get a separate throttling
  // context -- we don't want to coalesce invocations of markDirty on
  // different instances!)
  self._markDirty = _.throttle(self._unthrottled_markDirty, 50 /* ms */);

  // listen for the invalidation messages that will trigger us to poll
  // the database for changes
  var keys = self.cursor.options.key || {collection: cursor.collection_name};
  if (!(keys instanceof Array))
    keys = [keys];
  self.crossbar_listeners = _.map(keys, function (key) {
    return Meteor._InvalidationCrossbar.listen(key,function (notification,
                                                             complete) {
      // When someone does a transaction that might affect us,
      // schedule a poll of the database. If that transaction happens
      // inside of a write fence, block the fence until we've polled
      // and notified observers.
      var fence = Meteor._CurrentWriteFence.get();
      if (fence)
        self.pending_writes.push(fence.beginWrite());
      self._markDirty();
      complete();
    });
  });

  // user callbacks
  self.added = options.added;
  self.changed = options.changed;
  self.removed = options.removed;
  if (ordered)
    self.moved = options.moved;

  // run the first _poll() cycle synchronously.
  self.poll_running = true;
  self._doPoll();
  self.poll_running = false;

  // every once and a while, poll even if we don't think we're dirty,
  // for eventual consistency with database writes from outside the
  // Meteor universe
  self.refreshTimer = Meteor.setInterval(_.bind(self._markDirty, this),
                                         10 * 1000 /* 10 seconds */);
};

_Mongo.LiveResultsSet.prototype._unthrottled_markDirty = function () {
  var self = this;

  self.dirty = true;
  if (self.polling_suspended)
    return; // don't poll when told not to
  if (self.poll_running)
    return; // only one instance can run at once. just tell it to re-cycle.
  self.poll_running = true;

  Fiber(function () {
    self.dirty = false;
    var writes_for_cycle = self.pending_writes;
    self.pending_writes = [];
    self._doPoll(); // could yield, and set self.dirty
    _.each(writes_for_cycle, function (w) {w.committed();});

    self.poll_running = false;
    if (self.dirty || self.pending_writes.length)
      // rerun ourselves, but through _.throttle
      self._markDirty();
  }).run();
};

// interface for tests to control when polling happens
_Mongo.LiveResultsSet.prototype._suspendPolling = function() {
  this.polling_suspended = true;
};
_Mongo.LiveResultsSet.prototype._resumePolling = function() {
  this.polling_suspended = false;
  this._unthrottled_markDirty(); // poll NOW, don't wait
};


_Mongo.LiveResultsSet.prototype._doPoll = function () {
  var self = this;

  // Get the new query results
  self.cursor.rewind();
  var new_results = self.cursor._getRawObjects(self.ordered);
  var old_results = self.results;

  LocalCollection._diffQuery(
    self.ordered, old_results, new_results, self, true);
  self.results = new_results;

};

_Mongo.LiveResultsSet.prototype.stop = function () {
  var self = this;
  _.each(self.crossbar_listeners, function (l) { l.stop(); });
  Meteor.clearInterval(self.refreshTimer);
};

_.extend(Meteor, {
  _Mongo: _Mongo
});
