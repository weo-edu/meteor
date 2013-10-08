(function() {
  // To be used as the local storage key
  var loginTokenKey = "Meteor.loginToken";
  var userIdKey = "Meteor.userId";

  // Call this from the top level of the test file for any test that does
  // logging in and out, to protect multiple tabs running the same tests
  // simultaneously from interfering with each others' localStorage.
  Accounts._isolateLoginTokenForTest = function (id) {
    id = id || Random.id();
    loginTokenKey = loginTokenKey + id;
    userIdKey = userIdKey + id;
    return id;
  };

  Accounts._storeLoginToken = function(userId, token) {
    localStorage.setItem(userIdKey, userId);
    localStorage.setItem(loginTokenKey, token);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Accounts._lastLoginTokenWhenPolled = token;
  };

  Accounts._unstoreLoginToken = function() {
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(loginTokenKey);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Accounts._lastLoginTokenWhenPolled = null;
  };

  Accounts._storedLoginToken = function() {
    return localStorage.getItem(loginTokenKey);
  };

  Accounts._storedUserId = function() {
    return localStorage.getItem(userIdKey);
  };

  //XXX double check this;
  Meteor.loginConnection = function(con, errorCallback) {
    if (!Accounts._storedLoginToken())
      return;
    con.apply('login', [{resume: Accounts._storedLoginToken()}], {wait: true}, function(error, result) {
      if (error) {
        errorCallback && errorCallback();
        throw error;
      }
      var userId = result.name;
      var token = result.token;
      con.setUserId(userId);
      con.onReconnect = function() {
        Meteor.loginConnection(con, function(error, result) {
          if (error) {
            con.setUserId(null);
            con.onReconnect = null;
            throw error;
          }
        });
      };
    });
  };

  // Login with a Meteor access token
  //
  Meteor.loginWithToken = function (token, callback) {
    console.log('loginWithToken');
    Accounts.callLoginMethod({
      methodArguments: [{resume: token}],
      userCallback: callback});
  };


  Meteor.startLogin = function() {
    // Immediately try to log in via local storage, so that any DDP
    // messages are sent after we have established our user account
    var token = Accounts._storedLoginToken();
    if (token) {
      // On startup, optimistically present us as logged in while the
      // request is in flight. This reduces page flicker on startup.
      var userId = Accounts._storedUserId();
      userId && Meteor.default_connection.setUserId(userId);
      Meteor.loginWithToken(token, function (err) {
        if (err) {
          Meteor._debug("Error logging in with token: " + err);
          Accounts._makeClientLoggedOut();
        }
      });
    }
    Accounts._lastLoginTokenWhenPolled = token;
    setInterval(Accounts._pollStoredLoginToken, 3000);
  }

  // Poll local storage every 3 seconds to login if someone logged in in
  // another tab

  Accounts._pollStoredLoginToken = function() {
    if (Accounts._preventAutoLogin)
      return;

    var currentLoginToken = Accounts._storedLoginToken();

    // != instead of !== just to make sure undefined and null are treated the same
    if (Accounts._lastLoginTokenWhenPolled != currentLoginToken) {
      if (currentLoginToken)
        Meteor.loginWithToken(currentLoginToken); // XXX should we pass a callback here?
      else
        Meteor.logout();
    }
    Accounts._lastLoginTokenWhenPolled = currentLoginToken;
  };

  // Semi-internal API. Call this function to re-enable auto login after
  // if it was disabled at startup.
  Accounts._enableAutoLogin = function () {
    Accounts._preventAutoLogin = false;
    Accounts._pollStoredLoginToken();
  };


})();

