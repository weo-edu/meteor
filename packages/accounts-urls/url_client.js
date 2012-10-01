(function () {
  if (!Meteor.accounts)
    Meteor.accounts = {};

  // reads a reset password token from the url's hash fragment, if it's
  // there. if so prevent automatically logging in since it could be
  // confusing to be logged in as user A while resetting password for
  // user B
  //
  // reset password urls use hash fragments instead of url paths/query
  // strings so that the reset password token is not sent over the wire
  // on the http request
  var match;
  match = window.location.hash.match(/^\#\?reset-password\/(.*)$/);
  if (match) {
    Meteor.accounts._preventAutoLogin = true;
    Meteor.accounts._resetPasswordToken = match[1];
    window.location.hash = '';
  }

  // reads a validate email token from the url's hash fragment, if
  // it's there.  also don't automatically log the user is, as for
  // reset password links.
  //
  // XXX we don't need to use hash fragments in this case, and having
  // the token appear in the url's path would allow us to use a custom
  // middleware instead of validting the email on pageload, which
  // would be faster but less DDP-ish (and more specifically, any
  // non-web DDP app, such as an iOS client, would do something more
  // in line with the hash fragment approach)
  match = window.location.hash.match(/^\#\?validate-email\/(.*)$/);
  if (match) {
    Meteor.accounts._preventAutoLogin = true;
    Meteor.accounts._validateEmailToken = match[1];
    window.location.hash = '';
  }

  // reads an account enrollment token from the url's hash fragment, if
  // it's there.  also don't automatically log the user is, as for
  // reset password links.
  match = window.location.hash.match(/^\#\?enroll-account\/(.*)$/);
  if (match) {
    Meteor.accounts._preventAutoLogin = true;
    Meteor.accounts._enrollAccountToken = match[1];
    window.location.hash = '';
  }
})();
