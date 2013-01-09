if(Meteor.isClient) {
	angular.element(document).ready(function() {
		angular.bootstrap(document, ["app"]);
	});
} else {
	angular.module('app', ['meteor'], [function() {
	}]);
	Meteor.startup(function() {
		var injector = createInjector(['app']);
		injector.invoke(['$injector', function(injector){ }]);
	});
}

