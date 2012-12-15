(function () {
  // By default, try to connect back to the same endpoint as the page
  // was served from.

  var ddpUrl = '/';
  if (typeof __meteor_runtime_config__ !== "undefined") {
    if (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL)
      ddpUrl = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;

    if(__meteor_runtime_config__.METEOR_SUBAPP_NAME)
      ddpUrl = '/' + __meteor_runtime_config__.METEOR_SUBAPP_NAME + ddpUrl;
  }

  _.extend(Meteor, {
    default_connection: Meteor.connect(ddpUrl, true /* restart_on_update */),

    refresh: function (notification) {
    }
  });

  // Proxy the public methods of Meteor.default_connection so they can
  // be called directly on Meteor.
  _.each(['get','subscribe', 'methods', 'call', 'apply', 'status', 'reconnect'],
         function (name) {
           Meteor[name] = _.bind(Meteor.default_connection[name],
                                 Meteor.default_connection);
         });

})();
