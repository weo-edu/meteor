// Set up a collection to contain player information. On the server,
// it is backed by a MongoDB collection named "players".

/*if (Meteor.isClient) {
  Template.leaderboard.players = function () {
    return Players.find({}, {sort: {score: -1, name: 1}});
  };

  Template.leaderboard.selected_name = function () {
    var player = Players.findOne(Session.get("selected_player"));
    return player && player.name;
  };

  Template.player.selected = function () {
    return Session.equals("selected_player", this._id) ? "selected" : '';
  };

  Template.leaderboard.events({
    'click input.inc': function () {
      Players.update(Session.get("selected_player"), {$inc: {score: 5}});
    }
  });

  Template.player.events({
    'click': function () {
      Session.set("selected_player", this._id);
    }
  });
}
*/
// On server startup, create some players if the database is empty.
if (Meteor.isServer) {
  Meteor.startup(function () {
    Players = new Meteor.Collection("players");


    if (Players.find().count() === 0) {
      var names = ["Ada Lovelace",
                   "Grace Hopper",
                   "Marie Curie",
                   "Carl Friedrich Gauss",
                   "Nikola Tesla",
                   "Claude Shannon"];
      for (var i = 0; i < names.length; i++)
        Players.insert({name: names[i], score: Math.floor(Math.random()*10)*5});
    }
  });
}


if (Meteor.isClient) {
  function LeaderboardCtrl($scope, $collection, $templates) {

    $scope.players = $collection('players').find({}, {sort: {score: -1, name: 1}});

    $scope.grace = $collection('players').findOne({name: 'Grace Hopper'});

    $scope.selected = null;

    $scope.giveFive = function() {
      $collection('players').update({name: this.selected.name}, {$inc: {score: 5}});
    }

    $scope.select = function(player) {
      $scope.selected = player;
    }

    $scope.isSelected = function(player) {
      return $scope.selected && $scope.selected.name === player.name ? "selected" : '';
    }
  }

}
