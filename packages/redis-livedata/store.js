// manager, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
Meteor.Store = function (name, manager, driver) {
  var self = this;

  if (!name && (name !== null)) {
    Meteor._debug("Warning: creating anonymous collection. It will not be " +
                  "saved or synchronized over the network. (Pass null for " +
                  "the collection name to turn off this warning.)");
  }

  // note: nameless collections never have a manager
  manager = name && (manager ||
                     (Meteor.is_client ?
                      Meteor.default_connection : Meteor.default_server));

  if (!driver) {
    if (name && manager === Meteor.default_server &&
        Meteor._RemoteStoreDriver)
      driver = Meteor._RemoteStoreDriver;
    else
      driver = Meteor._LocalStoreDriver;
  }

  self._manager = manager;
  self._driver = driver;
  self._store = driver.open(name);
  self._was_snapshot = false;

  if (name && manager.registerStore) {
    // OK, we're going to be a slave, replicating some remote
    // database, except possibly with some temporary divergence while
    // we have unacknowledged RPC's.
    var ok = manager.registerStore(name, {
      // Called at the beginning of a batch of updates. We're supposed
      // to start by backing out any local writes and returning to the
      // last state delivered by the server.
      beginUpdate: function () {
        // pause observers so users don't see flicker.
        self._store.pauseObservers();

        // restore db snapshot
        if (self._was_snapshot) {
          self._store.restore();
          self._was_snapshot = false;
        }
      },

      // Apply an update from the server.
      // XXX better specify this interface (not in terms of a wire message)?
      update: function (msg) {
        var doc = self._store.get(msg.id).fetch();

        if (doc
            && (!msg.set)
            && _.difference(_.keys(doc), msg.unset, ['_id']).length === 0) {
          // what's left is empty, just remove it.  cannot fail.
          self._store.remove(msg.id);
        } else if (doc) {
          var mutator = {$set: msg.set, $unset: {}};
          _.each(msg.unset, function (propname) {
            mutator.$unset[propname] = 1;
          });
          // XXX error check return value from update.
          self._store.update(msg.id, mutator);
        } else {
          // XXX error check return value from insert.
          if (msg.set)
            self._store.insert(_.extend({_id: msg.id}, msg.set));
        }
      },

      // Called at the end of a batch of updates.
      endUpdate: function () {
        self._store.resumeObservers();
      },

      // Reset the collection to its original, empty state.
      reset: function () {
        self._store.remove({});
      }
    });

    if (!ok)
      throw new Error("There is already a store named '" + name + "'");
  }

  // mutation methods
  if (manager) {
    var m = {};
    // XXX what if name has illegal characters in it?
    self._prefix = '/' + name + '/';
    m[self._prefix + 'insert'] = function (/* selector, options */) {
      self._maybe_snapshot();
      // insert returns nothing.  allow exceptions to propagate.
      self._store.insert.apply(self._store, _.toArray(arguments));
    };

    m[self._prefix + 'update'] = function (/* selector, mutator, options */) {
      self._maybe_snapshot();
      // update returns nothing.  allow exceptions to propagate.
      self._store.update.apply(self._store, _.toArray(arguments));
    };

    m[self._prefix + 'remove'] = function (/* selector */) {
      self._maybe_snapshot();
      // remove returns nothing.  allow exceptions to propagate.
      self._store.remove.apply(self._store, _.toArray(arguments));
    };

    manager.methods(m);
  }

  // autopublish
  if (manager && manager.onAutopublish)
    manager.onAutopublish(function () {
      var handler = function () { return self.find(); };
      manager.publish(null, handler, {is_auto: true});
    });
};