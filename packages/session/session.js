// XXX could use some tests

Session = new ReactiveDict();

if (Meteor._reload) {
  Meteor._reload.onMigrate('session', function () {
    // XXX sanitize and make sure it's JSONible?
    return [true, Session.toJSON()];
  });

  (function () {
    var migration_data = Meteor._reload.migrationData('session');
    if (migration_data) {
      Session = new ReactiveDict(migration_data)
    }
  })();
}
