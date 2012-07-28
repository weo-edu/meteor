Session = new Reactive.Store;

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